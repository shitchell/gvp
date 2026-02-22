"""Render catalog to CSV."""

from __future__ import annotations

import csv
import io
from pathlib import Path

from gvp.model import Catalog

COLUMNS = [
    "qualified_id", "id", "document", "category", "name",
    "status", "tags", "maps_to", "statement",
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
        statement = elem.fields.get("statement") or elem.fields.get("rationale") or ""
        writer.writerow([
            qid, elem.id, elem.document.name, elem.category,
            elem.name, elem.status,
            ";".join(elem.tags), ";".join(elem.maps_to),
            statement.strip(),
        ])

    result = output.getvalue()
    if output_dir:
        output_dir.mkdir(parents=True, exist_ok=True)
        (output_dir / "gvp.csv").write_text(result)
    return result
