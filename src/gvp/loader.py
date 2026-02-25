"""YAML loading, defaults merging, chain resolution."""

from __future__ import annotations

import datetime
import sys
from pathlib import Path

import yaml

from gvp.config import GVPConfig
from gvp.model import Catalog, Document, Element
from gvp.schema import (
    CategoryRegistry,
    load_builtin_defaults,
    merge_category_definitions,
)

BASE_ELEMENT_ATTRS = {
    "id",
    "name",
    "status",
    "tags",
    "maps_to",
    "origin",
    "updated_by",
    "reviewed_by",
    "priority",
}


def _parse_tag_definitions(meta: dict) -> dict[str, dict]:
    """Parse meta.definitions.tags into a flat {tag_name: {type, description, ...}} dict."""
    definitions = meta.get("definitions") or {}
    raw_tags = definitions.get("tags") or {}
    result = {}
    for section in ("domains", "concerns"):
        for tag_name, tag_def in (raw_tags.get(section) or {}).items():
            result[tag_name] = {"type": section.rstrip("s"), **(tag_def or {})}
    return result


def _apply_defaults(raw_element: dict, defaults: dict) -> dict:
    if not defaults:
        return raw_element
    result = dict(raw_element)
    for key, default_val in defaults.items():
        if key not in result:
            if key == "origin":
                result[key] = (
                    [default_val] if isinstance(default_val, dict) else default_val
                )
            else:
                result[key] = default_val
    return result


def _stringify_dict_values(d: dict) -> dict:
    """Convert datetime.date values to ISO strings in a dict."""
    return {
        k: v.isoformat() if isinstance(v, (datetime.date, datetime.datetime)) else v
        for k, v in d.items()
    }


def _normalize_origin(raw_origin) -> list[dict]:
    """Normalize origin to a list of dicts with stringified values."""
    if not raw_origin:
        return []
    if isinstance(raw_origin, dict):
        return [_stringify_dict_values(raw_origin)]
    if isinstance(raw_origin, list):
        return [
            _stringify_dict_values(o) if isinstance(o, dict) else o for o in raw_origin
        ]
    return [raw_origin]


def _normalize_inherits(raw) -> list[str]:
    """Normalize inherits to a list of strings."""
    if raw is None:
        return []
    if isinstance(raw, str):
        return [raw]
    if isinstance(raw, list):
        return [str(item) for item in raw]
    return [str(raw)]


def _parse_element(raw: dict, category: str, doc: Document) -> Element:
    raw = _apply_defaults(raw, doc.defaults)
    elem_id = raw.get("id", "")
    name = raw.get("name", "")
    status = raw.get("status", "active")
    tags = raw.get("tags") or []
    maps_to = raw.get("maps_to") or []
    origin = _normalize_origin(raw.get("origin"))
    updated_by = raw.get("updated_by") or []
    reviewed_by = raw.get("reviewed_by") or []
    priority = raw.get("priority")
    fields = {k: v for k, v in raw.items() if k not in BASE_ELEMENT_ATTRS}
    return Element(
        id=elem_id,
        category=category,
        name=name,
        status=status,
        tags=tags,
        maps_to=maps_to,
        origin=origin,
        updated_by=updated_by if isinstance(updated_by, list) else [updated_by],
        reviewed_by=reviewed_by if isinstance(reviewed_by, list) else [reviewed_by],
        fields=fields,
        document=doc,
        priority=priority,
    )


def load_document(path: Path, registry: CategoryRegistry) -> Document:
    with open(path) as f:
        data = yaml.safe_load(f) or {}
    meta = data.get("meta") or {}
    doc = Document(
        name=meta.get("name", path.stem),
        filename=path.name,
        path=path,
        inherits=_normalize_inherits(meta.get("inherits")),
        scope_label=meta.get("scope"),
        id_prefix=meta.get("id_prefix"),
        defaults=meta.get("defaults") or {},
        tag_definitions=_parse_tag_definitions(meta),
        elements=[],
    )
    yaml_key_map = registry.yaml_key_to_category()
    for yaml_key, category in yaml_key_map.items():
        items = data.get(yaml_key)
        if not items:
            continue
        for raw in items:
            elem = _parse_element(raw, category, doc)
            doc.elements.append(elem)
    return doc


def load_library(
    library_path: Path,
    registry: CategoryRegistry | None = None,
) -> tuple[list[Document], dict[str, dict], dict[str, str], dict[str, dict]]:
    if registry is None:
        registry = load_builtin_defaults()
    tags: dict[str, dict] = {}
    tag_sources: dict[str, str] = {}
    documents: list[Document] = []
    user_category_defs: dict[str, dict] = {}
    path_to_name: dict[str, str] = {}
    for yaml_file in sorted(library_path.rglob("*.yaml")):
        doc = load_document(yaml_file, registry)
        documents.append(doc)
        rel = yaml_file.relative_to(library_path).with_suffix("")
        path_to_name[str(rel)] = doc.name
        # Accumulate tag definitions (first-wins)
        for tag_name, tag_def in doc.tag_definitions.items():
            if tag_name not in tags:
                tags[tag_name] = tag_def
                tag_sources[tag_name] = doc.name
        # Accumulate category definitions from meta.definitions.categories
        with open(yaml_file) as f:
            data = yaml.safe_load(f) or {}
        meta = data.get("meta") or {}
        definitions = meta.get("definitions") or {}
        cat_defs = definitions.get("categories") or {}
        for cat_name, cat_def in cat_defs.items():
            if cat_name not in user_category_defs:
                user_category_defs[cat_name] = cat_def
    # Resolve path-based inherits references to document names
    for doc in documents:
        doc.inherits = [path_to_name.get(parent, parent) for parent in doc.inherits]
    return documents, tags, tag_sources, user_category_defs


def load_catalog(cfg: GVPConfig) -> Catalog:
    catalog = Catalog()
    registry = load_builtin_defaults()
    all_user_cat_defs: dict[str, dict] = {}

    for lib_path in cfg.libraries:
        if not lib_path.exists():
            print(f"W003: library path does not exist: {lib_path}", file=sys.stderr)
            continue
        if lib_path.is_file():
            doc = load_document(lib_path, registry)
            if doc.name in catalog.documents:
                if cfg.strict:
                    raise ValueError(
                        f"Duplicate document name '{doc.name}': {catalog.documents[doc.name].path} and {doc.path}"
                    )
                print(
                    f"W002: duplicate document name '{doc.name}', keeping {catalog.documents[doc.name].path}",
                    file=sys.stderr,
                )
                continue
            catalog.add_document(doc)
            for tag_name, tag_def in doc.tag_definitions.items():
                if tag_name not in catalog.tags:
                    catalog.tags[tag_name] = tag_def
            continue
        docs, tags, tag_sources, user_cat_defs = load_library(lib_path, registry)
        # Accumulate user category definitions
        for cat_name, cat_def in user_cat_defs.items():
            if cat_name in all_user_cat_defs:
                catalog.load_warnings.append(
                    f"W008: duplicate category definition '{cat_name}', keeping first"
                )
            else:
                all_user_cat_defs[cat_name] = cat_def
        for tag_name, tag_def in tags.items():
            if tag_name not in catalog.tags:
                catalog.tags[tag_name] = tag_def
                catalog.tag_sources[tag_name] = tag_sources.get(tag_name, "")
        for doc in docs:
            if doc.name in catalog.documents:
                if cfg.strict:
                    raise ValueError(
                        f"Duplicate document name '{doc.name}': {catalog.documents[doc.name].path} and {doc.path}"
                    )
                print(
                    f"W002: duplicate document name '{doc.name}', keeping {catalog.documents[doc.name].path}",
                    file=sys.stderr,
                )
                continue
            catalog.add_document(doc)

    # Merge user category definitions and store the final registry
    if all_user_cat_defs:
        registry = merge_category_definitions(registry, all_user_cat_defs)
    catalog.category_registry = registry
    return catalog
