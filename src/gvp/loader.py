"""YAML loading, defaults merging, chain resolution."""

from __future__ import annotations

import datetime
import sys
from pathlib import Path

import yaml

from gvp.config import GVPConfig
from gvp.model import Catalog, Document, Element

CATEGORY_MAP = {
    "values": "value",
    "principles": "principle",
    "heuristics": "heuristic",
    "rules": "rule",
    "goals": "goal",
    "milestones": "milestone",
    "design_choices": "design_choice",
    "constraints": "constraint",
    "implementation_rules": "implementation_rule",
    "coding_principles": "coding_principle",
}

SKIP_FILES = {"tags.yaml", "schema.yaml"}
ELEMENT_ATTRS = {"id", "name", "status", "tags", "maps_to", "origin", "updated_by", "reviewed_by"}


def _load_tags(library_path: Path) -> dict[str, dict]:
    tags_file = library_path / "tags.yaml"
    if not tags_file.exists():
        return {}
    with open(tags_file) as f:
        data = yaml.safe_load(f) or {}
    result = {}
    for section in ("domains", "concerns"):
        for tag_name, tag_def in (data.get(section) or {}).items():
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
    fields = {k: v for k, v in raw.items() if k not in ELEMENT_ATTRS}
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
    )


def load_document(path: Path) -> Document:
    with open(path) as f:
        data = yaml.safe_load(f) or {}
    meta = data.get("meta") or {}
    doc = Document(
        name=meta.get("name", path.stem),
        filename=path.name,
        path=path,
        inherits=meta.get("inherits"),
        scope_label=meta.get("scope"),
        id_prefix=meta.get("id_prefix"),
        defaults=meta.get("defaults") or {},
        elements=[],
    )
    for yaml_key, category in CATEGORY_MAP.items():
        items = data.get(yaml_key)
        if not items:
            continue
        for raw in items:
            elem = _parse_element(raw, category, doc)
            doc.elements.append(elem)
    return doc


def load_library(library_path: Path) -> tuple[list[Document], dict[str, dict]]:
    tags = _load_tags(library_path)
    documents: list[Document] = []
    # Track relative paths (without .yaml) to document names for inherits resolution
    path_to_name: dict[str, str] = {}
    for yaml_file in sorted(library_path.rglob("*.yaml")):
        if yaml_file.name in SKIP_FILES:
            continue
        doc = load_document(yaml_file)
        documents.append(doc)
        rel = yaml_file.relative_to(library_path).with_suffix("")
        path_to_name[str(rel)] = doc.name
    # Resolve path-based inherits references to document names
    for doc in documents:
        if doc.inherits and doc.inherits in path_to_name:
            doc.inherits = path_to_name[doc.inherits]
    return documents, tags


def load_catalog(cfg: GVPConfig) -> Catalog:
    catalog = Catalog()
    for lib_path in cfg.libraries:
        if not lib_path.exists():
            print(f"W003: library path does not exist: {lib_path}", file=sys.stderr)
            continue
        if lib_path.is_file():
            doc = load_document(lib_path)
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
            continue
        docs, tags = load_library(lib_path)
        for tag_name, tag_def in tags.items():
            if tag_name not in catalog.tags:
                catalog.tags[tag_name] = tag_def
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
    return catalog
