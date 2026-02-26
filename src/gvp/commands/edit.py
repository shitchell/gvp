"""Edit command: modify an existing element."""

from __future__ import annotations

import subprocess
import tempfile
from datetime import date
from pathlib import Path

import yaml

from gvp.model import Catalog


def edit_element_inline(
    catalog: Catalog,
    qualified_id: str,
    updates: dict,
    rationale: str,
    no_provenance: bool = False,
) -> None:
    elem = catalog.elements.get(qualified_id)
    if elem is None:
        raise ValueError(f"Element '{qualified_id}' not found in catalog")

    doc = elem.document
    with open(doc.path) as f:
        data = yaml.safe_load(f) or {}

    yaml_key = catalog.element_category_registry.categories[elem.category].yaml_key
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

    if not no_provenance:
        updated_entry = {
            "date": date.today().isoformat(),
            "rationale": rationale,
        }
        if "updated_by" not in target:
            target["updated_by"] = []
        target["updated_by"].append(updated_entry)

    with open(doc.path, "w") as f:
        yaml.dump(
            data, f, default_flow_style=False, sort_keys=False, allow_unicode=True
        )


def edit_element_interactive(
    catalog: Catalog,
    qualified_id: str,
    no_provenance: bool = False,
) -> None:
    elem = catalog.elements.get(qualified_id)
    if elem is None:
        raise ValueError(f"Element '{qualified_id}' not found")

    print(f"Editing {qualified_id}: {elem.name}")
    print(f"Category: {elem.category}")
    print("Current fields:")
    for key, value in elem.fields.items():
        print(f"  {key}: {value}")
    print()

    updates = {}
    for key in ("name", "status", "statement"):
        current = getattr(elem, key, None) or elem.fields.get(key, "")
        new_val = input(f"{key} [{current}]: ").strip()
        if new_val and new_val != str(current):
            updates[key] = new_val

    if not updates:
        print("No changes.")
        return

    rationale = "" if no_provenance else input("Rationale: ").strip()
    edit_element_inline(
        catalog, qualified_id, updates, rationale, no_provenance=no_provenance
    )


def edit_via_editor(
    catalog: Catalog,
    qualified_id: str,
    no_provenance: bool = False,
) -> bool:
    from gvp.commands.add import get_editor

    elem = catalog.elements.get(qualified_id)
    if elem is None:
        raise ValueError(f"Element '{qualified_id}' not found")

    # Build editable YAML (content fields only, not metadata)
    editable = {"name": elem.name, "status": elem.status}
    editable.update(elem.fields)

    original_yaml = yaml.dump(editable, default_flow_style=False, sort_keys=False)

    with tempfile.NamedTemporaryFile(
        mode="w", suffix=".yaml", prefix="gvp-edit-", delete=False
    ) as f:
        f.write(f"# Editing {qualified_id}\n")
        f.write(original_yaml)
        tmp_path = f.name

    try:
        editor = get_editor()
        result = subprocess.run([editor, tmp_path])
        if result.returncode != 0:
            return False

        with open(tmp_path) as f:
            content = f.read()

        # Strip comment lines
        content = "\n".join(l for l in content.splitlines() if not l.startswith("#"))
        edited = yaml.safe_load(content)
        if not edited:
            return False

        # Diff
        updates = {}
        for key, new_val in edited.items():
            old_val = editable.get(key)
            if new_val != old_val:
                updates[key] = new_val

        if not updates:
            print("No changes.")
            return False

        print("Changes detected:")
        for key, val in updates.items():
            print(f"  {key}: {editable.get(key, '')} -> {val}")

        rationale = "" if no_provenance else input("Rationale: ").strip()
        edit_element_inline(
            catalog, qualified_id, updates, rationale, no_provenance=no_provenance
        )
        return True
    finally:
        Path(tmp_path).unlink(missing_ok=True)
