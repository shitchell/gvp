"""Add command: create a new element with auto-assigned ID."""

from __future__ import annotations

import os
import re
import subprocess
import tempfile
from datetime import date
from pathlib import Path

import yaml

from gvp.model import Catalog


def next_id(
    category: str, existing_ids: list[str], registry, prefix: str | None = None
) -> str:
    cat_def = registry.categories[category]
    id_prefix = cat_def.id_prefix
    if prefix:
        id_prefix = prefix + id_prefix
    max_num = 0
    pattern = re.compile(rf"^{re.escape(id_prefix)}(\d+)$")
    for eid in existing_ids:
        m = pattern.match(eid)
        if m:
            max_num = max(max_num, int(m.group(1)))
    return f"{id_prefix}{max_num + 1}"


def add_element(
    catalog: Catalog,
    document_name: str,
    category: str,
    name: str,
    fields: dict,
    no_provenance: bool = False,
) -> str:
    doc = catalog.documents.get(document_name)
    if doc is None:
        raise ValueError(f"Document '{document_name}' not found in catalog")
    existing = [e.id for e in doc.elements if e.category == category]
    new_id = next_id(
        category, existing, catalog.category_registry, prefix=doc.id_prefix
    )
    elem_dict = {"id": new_id, "name": name, **fields}
    if not no_provenance and "origin" not in elem_dict:
        doc_defaults = doc.defaults or {}
        if "origin" not in doc_defaults:
            elem_dict["origin"] = [{"date": date.today().isoformat()}]
    with open(doc.path) as f:
        data = yaml.safe_load(f) or {}
    yaml_key = catalog.category_registry.categories[category].yaml_key
    if yaml_key not in data:
        data[yaml_key] = []
    data[yaml_key].append(elem_dict)
    with open(doc.path, "w") as f:
        yaml.dump(
            data, f, default_flow_style=False, sort_keys=False, allow_unicode=True
        )
    return new_id


def get_editor() -> str:
    for var in ("VISUAL", "EDITOR"):
        editor = os.environ.get(var)
        if editor:
            return editor
    try:
        result = subprocess.run(["which", "editor"], capture_output=True, text=True)
        if result.returncode == 0:
            return result.stdout.strip()
    except FileNotFoundError:
        pass
    for fallback in ("vi", "nano"):
        try:
            result = subprocess.run(["which", fallback], capture_output=True, text=True)
            if result.returncode == 0:
                return fallback
        except FileNotFoundError:
            continue
    raise RuntimeError("No editor found")


def add_via_editor(
    catalog: Catalog,
    document_name: str,
    category: str,
    prefill: dict | None = None,
) -> str | None:
    template = _build_template(
        category, prefill or {}, registry=catalog.category_registry
    )
    with tempfile.NamedTemporaryFile(
        mode="w", suffix=".yaml", prefix="gvp-add-", delete=False
    ) as f:
        f.write(template)
        tmp_path = f.name
    try:
        editor = get_editor()
        result = subprocess.run([editor, tmp_path])
        if result.returncode != 0:
            return None
        with open(tmp_path) as f:
            content = f.read().strip()
        if not content:
            return None
        data = yaml.safe_load(content)
        if not data:
            return None
        name = data.pop("name", "")
        return add_element(catalog, document_name, category, name, data)
    finally:
        Path(tmp_path).unlink(missing_ok=True)


def _build_template(category: str, prefill: dict, registry=None) -> str:
    lines = [f"# New {category}", f"# Fill in the fields below and save.", ""]
    fields = {"name": ""}
    if registry and category in registry.categories:
        cat_def = registry.categories[category]
        for fname, fschema in cat_def.field_schemas.items():
            if fname == "priority":
                continue
            if fschema.get("required", False):
                fields[fname] = ""
    else:
        fields["statement"] = ""
    fields["tags"] = []
    fields["maps_to"] = []
    fields.update(prefill)
    return (
        lines[0]
        + "\n"
        + lines[1]
        + "\n"
        + lines[2]
        + "\n"
        + yaml.dump(fields, default_flow_style=False, sort_keys=False)
    )
