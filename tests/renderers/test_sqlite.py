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
