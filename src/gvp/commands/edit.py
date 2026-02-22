"""Edit command: modify an existing element."""

from __future__ import annotations

from datetime import date

import yaml

from gvp.model import Catalog
from gvp.commands.add import YAML_KEYS


def edit_element_inline(
    catalog: Catalog,
    qualified_id: str,
    updates: dict,
    rationale: str,
) -> None:
    elem = catalog.elements.get(qualified_id)
    if elem is None:
        raise ValueError(f"Element '{qualified_id}' not found in catalog")

    doc = elem.document
    with open(doc.path) as f:
        data = yaml.safe_load(f) or {}

    yaml_key = YAML_KEYS[elem.category]
    items = data.get(yaml_key, [])
    target = None
    for item in items:
        if item.get("id") == elem.id:
            target = item
            break

    if target is None:
        raise ValueError(
            f"Element '{elem.id}' not found in {doc.path} under '{yaml_key}'"
        )

    for key, value in updates.items():
        target[key] = value

    updated_entry = {
        "date": date.today().isoformat(),
        "rationale": rationale,
    }
    if "updated_by" not in target:
        target["updated_by"] = []
    target["updated_by"].append(updated_entry)

    with open(doc.path, "w") as f:
        yaml.dump(data, f, default_flow_style=False, sort_keys=False, allow_unicode=True)
