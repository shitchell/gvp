"""Render catalog to SQLite database."""

from __future__ import annotations

import json
import sqlite3
from pathlib import Path

from gvp.model import Catalog

SCHEMA = """
CREATE TABLE IF NOT EXISTS documents (
    name TEXT PRIMARY KEY, filename TEXT, path TEXT,
    scope_label TEXT, id_prefix TEXT
);
CREATE TABLE IF NOT EXISTS document_inherits (
    document TEXT REFERENCES documents(name),
    parent TEXT, position INTEGER,
    PRIMARY KEY (document, parent)
);
CREATE TABLE IF NOT EXISTS elements (
    qualified_id TEXT PRIMARY KEY, id TEXT,
    document TEXT REFERENCES documents(name),
    category TEXT, name TEXT, status TEXT DEFAULT 'active',
    statement TEXT, priority REAL, fields_json TEXT
);
CREATE TABLE IF NOT EXISTS element_tags (
    qualified_id TEXT REFERENCES elements(qualified_id),
    tag TEXT, PRIMARY KEY (qualified_id, tag)
);
CREATE TABLE IF NOT EXISTS mappings (
    source TEXT REFERENCES elements(qualified_id),
    target TEXT, PRIMARY KEY (source, target)
);
CREATE TABLE IF NOT EXISTS tags (
    name TEXT PRIMARY KEY, type TEXT, description TEXT
);
CREATE TABLE IF NOT EXISTS considered_alternatives (
    qualified_id TEXT REFERENCES elements(qualified_id),
    alternative TEXT,
    field TEXT,
    value TEXT,
    PRIMARY KEY (qualified_id, alternative, field)
);
"""


def render_sqlite(
    catalog: Catalog,
    db_path: Path,
    include_deprecated: bool = False,
) -> None:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    if db_path.exists():
        db_path.unlink()

    conn = sqlite3.connect(db_path)
    conn.executescript(SCHEMA)

    for doc in catalog.documents.values():
        conn.execute(
            "INSERT INTO documents VALUES (?, ?, ?, ?, ?)",
            (
                doc.name,
                doc.filename,
                str(doc.path),
                doc.scope_label,
                doc.id_prefix,
            ),
        )
        for pos, parent in enumerate(doc.inherits):
            conn.execute(
                "INSERT INTO document_inherits VALUES (?, ?, ?)",
                (doc.name, parent, pos),
            )

    for qid, elem in catalog.elements.items():
        if not include_deprecated and elem.status != "active":
            continue
        cat_def = catalog.category_registry.categories.get(elem.category) if catalog.category_registry else None
        if cat_def:
            pf = cat_def.primary_field
            statement = getattr(elem, pf, None) or elem.fields.get(pf, "") or ""
        else:
            statement = elem.fields.get("statement") or elem.fields.get("rationale") or ""
        conn.execute(
            "INSERT INTO elements VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                qid,
                elem.id,
                elem.document.name,
                elem.category,
                elem.name,
                elem.status,
                statement.strip(),
                float(elem.priority) if elem.priority is not None else None,
                json.dumps(elem.fields),
            ),
        )
        for tag in elem.tags:
            conn.execute("INSERT INTO element_tags VALUES (?, ?)", (qid, tag))
        for ref in elem.maps_to:
            conn.execute("INSERT INTO mappings VALUES (?, ?)", (qid, ref))
        considered = elem.fields.get("considered")
        if isinstance(considered, dict):
            for alt_name, alt_def in considered.items():
                if not isinstance(alt_def, dict):
                    continue
                for field_name, field_val in alt_def.items():
                    conn.execute(
                        "INSERT INTO considered_alternatives VALUES (?, ?, ?, ?)",
                        (qid, alt_name, field_name, str(field_val)),
                    )

    for tag_name, tag_def in catalog.tags.items():
        conn.execute(
            "INSERT INTO tags VALUES (?, ?, ?)",
            (tag_name, tag_def.get("type", ""), tag_def.get("description", "")),
        )

    conn.commit()
    conn.close()
