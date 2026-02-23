"""Full integration tests using the bundled example library."""

import sqlite3
from pathlib import Path

from gvp.config import GVPConfig
from gvp.loader import load_catalog
from gvp.commands.validate import validate_catalog
from gvp.commands.query import query_catalog
from gvp.commands.trace import trace_element, format_trace_tree
from gvp.renderers.markdown import render_markdown
from gvp.renderers.csv import render_csv
from gvp.renderers.dot import render_dot
from gvp.renderers.sqlite import render_sqlite


class TestFullPipeline:
    def test_load_validate_query_trace_render(
        self, gvp_docs_library: Path, tmp_path: Path
    ):
        # Load
        cfg = GVPConfig(libraries=[gvp_docs_library])
        catalog = load_catalog(cfg)
        assert len(catalog.documents) == 4
        assert len(catalog.elements) >= 16

        # Validate
        errors, warnings = validate_catalog(catalog)
        assert errors == [], f"Validation errors: {errors}"

        # Query
        code_elements = query_catalog(catalog, tags=["code"])
        assert len(code_elements) > 0

        # Trace
        h1 = catalog.elements["personal:H1"]
        tree = trace_element(catalog, h1, reverse=False)
        text = format_trace_tree(tree, fmt="text")
        assert "personal:H1" in text
        json_out = format_trace_tree(tree, fmt="json")
        assert "personal:H1" in json_out

        # Render markdown
        md = render_markdown(catalog)
        assert "Simplicity" in md

        # Render CSV
        csv_out = render_csv(catalog)
        assert "personal:V1" in csv_out

        # Render DOT
        dot_out = render_dot(catalog)
        assert "digraph" in dot_out

        # Render SQLite
        db_path = tmp_path / "test.db"
        render_sqlite(catalog, db_path)
        assert db_path.exists()

        conn = sqlite3.connect(db_path)
        count = conn.execute("SELECT COUNT(*) FROM elements").fetchone()[0]
        assert count >= 16
        conn.close()

    def test_chain_spans_all_levels(self, gvp_docs_library: Path):
        cfg = GVPConfig(libraries=[gvp_docs_library])
        catalog = load_catalog(cfg)
        v1 = catalog.documents["taskflow-v1"]
        chain = catalog.resolve_chain(v1)
        names = [d.name for d in chain]
        assert names == ["taskflow-v1", "taskflow", "personal", "universal"]

    def test_cross_scope_maps_to_resolves(self, gvp_docs_library: Path):
        cfg = GVPConfig(libraries=[gvp_docs_library])
        catalog = load_catalog(cfg)
        d1 = catalog.elements["taskflow-v1:D1"]
        ancestors = catalog.ancestors(d1)
        ancestor_ids = {str(a) for a in ancestors}
        # D1 maps to taskflow:G2 and personal:V1
        assert "taskflow:G2" in ancestor_ids
        assert "personal:V1" in ancestor_ids
