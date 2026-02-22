"""Tests for DOT/graphviz renderer."""

from pathlib import Path

from gvp.renderers.dot import render_dot
from gvp.config import GVPConfig
from gvp.loader import load_catalog


class TestRenderDot:
    def test_renders_valid_dot(self, gvp_docs_library: Path):
        cfg = GVPConfig(libraries=[gvp_docs_library])
        catalog = load_catalog(cfg)
        output = render_dot(catalog)
        assert output.startswith("digraph")
        assert "}" in output

    def test_contains_nodes(self, gvp_docs_library: Path):
        cfg = GVPConfig(libraries=[gvp_docs_library])
        catalog = load_catalog(cfg)
        output = render_dot(catalog)
        assert "personal__V1" in output or "personal:V1" in output

    def test_contains_edges(self, gvp_docs_library: Path):
        cfg = GVPConfig(libraries=[gvp_docs_library])
        catalog = load_catalog(cfg)
        output = render_dot(catalog)
        assert "->" in output

    def test_writes_to_file(self, gvp_docs_library: Path, tmp_path: Path):
        cfg = GVPConfig(libraries=[gvp_docs_library])
        catalog = load_catalog(cfg)
        output_dir = tmp_path / "generated"
        render_dot(catalog, output_dir=output_dir)
        dot_files = list(output_dir.glob("*.dot"))
        assert len(dot_files) == 1
