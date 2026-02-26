"""Render catalog to CSV."""

from __future__ import annotations

import csv
import io
import json
from pathlib import Path

from gvp.model import Catalog

COLUMNS = [
    "qualified_id", "id", "document", "category", "name",
    "status", "tags", "maps_to", "statement", "priority", "considered",
]


def render_csv(
    catalog: Catalog,
    output_dir: Path | None = None,
    include_deprecated: bool = False,
) -> str:
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(COLUMNS)

    for qid, elem in sorted(catalog.elements.items()):
        if not include_deprecated and elem.status != "active":
            continue
        ecat_def = catalog.element_category_registry.categories.get(elem.category) if catalog.element_category_registry else None
        if ecat_def:
            pf = ecat_def.primary_field
            statement = getattr(elem, pf, None) or elem.fields.get(pf, "") or ""
        else:
            statement = elem.fields.get("statement") or elem.fields.get("rationale") or ""
        priority = elem.priority if elem.priority is not None else ""
        considered = elem.fields.get("considered")
        considered_json = json.dumps(considered) if considered else ""
        writer.writerow([
            qid, elem.id, elem.document.name, elem.category,
            elem.name, elem.status,
            ";".join(elem.tags), ";".join(elem.maps_to),
            statement.strip(),
            priority,
            considered_json,
        ])

    result = output.getvalue()
    if output_dir:
        output_dir.mkdir(parents=True, exist_ok=True)
        (output_dir / "gvp.csv").write_text(result)
    return result
