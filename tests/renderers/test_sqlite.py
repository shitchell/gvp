"""Tests for SQLite renderer."""

import sqlite3
from pathlib import Path

from gvp.renderers.sqlite import render_sqlite
from gvp.config import GVPConfig
from gvp.loader import load_catalog


class TestRenderSQLite:
    def test_creates_database(self, gvp_docs_library: Path, tmp_path: Path):
        cfg = GVPConfig(libraries=[gvp_docs_library])
        catalog = load_catalog(cfg)
        db_path = tmp_path / "gvp.db"
        render_sqlite(catalog, db_path)
        assert db_path.exists()

    def test_elements_table(self, gvp_docs_library: Path, tmp_path: Path):
        cfg = GVPConfig(libraries=[gvp_docs_library])
        catalog = load_catalog(cfg)
        db_path = tmp_path / "gvp.db"
        render_sqlite(catalog, db_path)
        conn = sqlite3.connect(db_path)
        rows = conn.execute("SELECT COUNT(*) FROM elements").fetchone()
        assert rows[0] > 0
        conn.close()

    def test_mappings_table(self, gvp_docs_library: Path, tmp_path: Path):
        cfg = GVPConfig(libraries=[gvp_docs_library])
        catalog = load_catalog(cfg)
        db_path = tmp_path / "gvp.db"
        render_sqlite(catalog, db_path)
        conn = sqlite3.connect(db_path)
        rows = conn.execute("SELECT COUNT(*) FROM mappings").fetchone()
        assert rows[0] > 0
        conn.close()

    def test_tags_table(self, gvp_docs_library: Path, tmp_path: Path):
        cfg = GVPConfig(libraries=[gvp_docs_library])
        catalog = load_catalog(cfg)
        db_path = tmp_path / "gvp.db"
        render_sqlite(catalog, db_path)
        conn = sqlite3.connect(db_path)
        rows = conn.execute("SELECT COUNT(*) FROM element_tags").fetchone()
        assert rows[0] > 0
        conn.close()

    def test_document_inherits_table(self, tmp_path: Path):
        lib = tmp_path / "lib"
        lib.mkdir()
        (lib / "root.yaml").write_text("meta:\n  name: root\nvalues: []\n")
        (lib / "team.yaml").write_text("meta:\n  name: team\nvalues: []\n")
        (lib / "project.yaml").write_text(
            "meta:\n  name: project\n  inherits:\n    - root\n    - team\nvalues: []\n"
        )
        cfg = GVPConfig(libraries=[lib])
        catalog = load_catalog(cfg)
        db_path = tmp_path / "test.db"
        render_sqlite(catalog, db_path)
        conn = sqlite3.connect(db_path)
        rows = conn.execute(
            "SELECT parent, position FROM document_inherits "
            "WHERE document = 'project' ORDER BY position"
        ).fetchall()
        assert rows == [("root", 0), ("team", 1)]
        conn.close()

    def test_queryable(self, gvp_docs_library: Path, tmp_path: Path):
        cfg = GVPConfig(libraries=[gvp_docs_library])
        catalog = load_catalog(cfg)
        db_path = tmp_path / "gvp.db"
        render_sqlite(catalog, db_path)
        conn = sqlite3.connect(db_path)
        rows = conn.execute(
            "SELECT e.qualified_id, e.name FROM elements e "
            "JOIN element_tags et ON e.qualified_id = et.qualified_id "
            "WHERE et.tag = 'code' AND e.category = 'heuristic'"
        ).fetchall()
        assert len(rows) > 0
        conn.close()

    def test_priority_column(self, tmp_path: Path):
        lib = tmp_path / "lib"
        lib.mkdir()
        (lib / "test.yaml").write_text(
            "meta:\n  name: test\n"
            "values:\n"
            "  - id: V1\n    name: V\n    statement: V.\n"
            "    tags: []\n    maps_to: []\n    priority: 2\n"
        )
        cfg = GVPConfig(libraries=[lib])
        catalog = load_catalog(cfg)
        db_path = tmp_path / "test.db"
        render_sqlite(catalog, db_path)
        conn = sqlite3.connect(db_path)
        row = conn.execute(
            "SELECT priority FROM elements WHERE qualified_id = 'test:V1'"
        ).fetchone()
        assert row[0] == 2.0
        conn.close()
