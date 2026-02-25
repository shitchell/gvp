"""Review command: acknowledge changes with friction."""

from __future__ import annotations

import os
from datetime import date

import yaml

from gvp.commands.validate import _latest_date
from gvp.model import Catalog, Element


def find_stale_elements(catalog: Catalog) -> list[tuple[Element, Element, str]]:
    """Find elements needing review. Returns [(element, stale_ancestor, ancestor_date)]."""
    stale = []
    for qid, elem in catalog.elements.items():
        if elem.status in ("deprecated", "rejected"):
            continue
        ancestors = catalog.ancestors(elem)
        for ancestor in ancestors:
            ancestor_date = _latest_date(ancestor.updated_by)
            if ancestor_date is None:
                continue
            review_date = _latest_date(elem.reviewed_by)
            if review_date is None or review_date < ancestor_date:
                stale.append((elem, ancestor, ancestor_date))
                break  # one stale ancestor is enough
    return stale


def format_review_display(catalog: Catalog, elem: Element) -> str:
    """Format element details + trace + diff for interactive review."""
    lines = []
    lines.append(f"=== {elem.document.name}:{elem.id} — {elem.name} ===")
    lines.append(f"Category: {elem.category}")
    lines.append(f"Status: {elem.status}")
    for key, val in elem.fields.items():
        lines.append(f"{key}: {val}")
    lines.append("")

    # Show maps_to trace
    lines.append("Maps to:")
    for ref in elem.maps_to:
        target = catalog.elements.get(ref)
        if target:
            lines.append(f"  {ref} — {target.name}")
        else:
            lines.append(f"  {ref} (unresolved)")
    lines.append("")

    # Show ancestor changes since last review
    review_date = _latest_date(elem.reviewed_by)
    ancestors = catalog.ancestors(elem)
    changes = []
    for ancestor in ancestors:
        for entry in ancestor.updated_by or []:
            entry_date = entry.get("date", "")
            if review_date is None or entry_date > review_date:
                changes.append((str(ancestor), entry))

    if changes:
        lines.append("Changes since last review:")
        for ancestor_qid, entry in sorted(changes, key=lambda x: x[1].get("date", "")):
            lines.append(
                f"  [{entry.get('date', '?')}] {ancestor_qid}: {entry.get('rationale', '(no rationale)')}"
            )
    else:
        lines.append("No ancestor changes since last review.")

    return "\n".join(lines)


def stamp_review(
    catalog: Catalog, qualified_id: str, note: str = "", by: str | None = None
) -> None:
    """Append a reviewed_by entry to an element's YAML."""
    elem = catalog.elements.get(qualified_id)
    if elem is None:
        raise ValueError(f"Element '{qualified_id}' not found")

    doc = elem.document
    with open(doc.path) as f:
        data = yaml.safe_load(f) or {}

    yaml_key = catalog.category_registry.categories[elem.category].yaml_key
    items = data.get(yaml_key, [])
    target = None
    for item in items:
        if item.get("id") == elem.id:
            target = item
            break

    if target is None:
        raise ValueError(f"Element '{elem.id}' not found in {doc.path}")

    entry: dict = {"date": date.today().isoformat()}
    if by:
        entry["by"] = by
    elif os.environ.get("USER"):
        entry["by"] = os.environ["USER"]
    if note:
        entry["note"] = note

    if "reviewed_by" not in target:
        target["reviewed_by"] = []
    target["reviewed_by"].append(entry)

    with open(doc.path, "w") as f:
        yaml.dump(
            data, f, default_flow_style=False, sort_keys=False, allow_unicode=True
        )
