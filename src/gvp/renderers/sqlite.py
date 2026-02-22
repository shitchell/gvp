"""Render catalog to SQLite database."""

from __future__ import annotations

import json
import sqlite3
from pathlib import Path

from gvp.model import Catalog

SCHEMA = """
CREATE TABLE IF NOT EXISTS documents (
    name TEXT PRIMARY KEY, filename TEXT, path TEXT,
    inherits TEXT, scope_label TEXT, id_prefix TEXT
);
CREATE TABLE IF NOT EXISTS elements (
    qualified_id TEXT PRIMARY KEY, id TEXT,
    document TEXT REFERENCES documents(name),
    category TEXT, name TEXT, status TEXT DEFAULT 'active',
    statement TEXT, fields_json TEXT
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
            "INSERT INTO documents VALUES (?, ?, ?, ?, ?, ?)",
            (
                doc.name,
                doc.filename,
                str(doc.path),
                doc.inherits,
                doc.scope_label,
                doc.id_prefix,
            ),
        )

    for qid, elem in catalog.elements.items():
        if not include_deprecated and elem.status != "active":
            continue
        statement = elem.fields.get("statement") or elem.fields.get("rationale") or ""
        conn.execute(
            "INSERT INTO elements VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (
                qid,
                elem.id,
                elem.document.name,
                elem.category,
                elem.name,
                elem.status,
                statement.strip(),
                json.dumps(elem.fields),
            ),
        )
        for tag in elem.tags:
            conn.execute("INSERT INTO element_tags VALUES (?, ?)", (qid, tag))
        for ref in elem.maps_to:
            conn.execute("INSERT INTO mappings VALUES (?, ?)", (qid, ref))

    for tag_name, tag_def in catalog.tags.items():
        conn.execute(
            "INSERT INTO tags VALUES (?, ?, ?)",
            (tag_name, tag_def.get("type", ""), tag_def.get("description", "")),
        )

    conn.commit()
    conn.close()
