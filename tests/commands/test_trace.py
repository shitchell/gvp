"""Tests for gvp trace command."""

from pathlib import Path

from gvp.commands.trace import trace_element, format_trace_tree
from gvp.config import GVPConfig
from gvp.loader import load_catalog


class TestTraceElement:
    def test_trace_ancestors(self, gvp_docs_library: Path):
        cfg = GVPConfig(libraries=[gvp_docs_library])
        catalog = load_catalog(cfg)
        h1 = catalog.elements["personal:H1"]
        tree = trace_element(catalog, h1, reverse=False)
        child_ids = {str(node["element"]) for node in tree["children"]}
        assert "personal:P1" in child_ids

    def test_trace_descendants(self, gvp_docs_library: Path):
        cfg = GVPConfig(libraries=[gvp_docs_library])
        catalog = load_catalog(cfg)
        v1 = catalog.elements["personal:V1"]
        tree = trace_element(catalog, v1, reverse=True)
        child_ids = {str(node["element"]) for node in tree["children"]}
        assert len(child_ids) > 0

    def test_trace_handles_dag(self, gvp_docs_library: Path):
        cfg = GVPConfig(libraries=[gvp_docs_library])
        catalog = load_catalog(cfg)
        h1 = catalog.elements["personal:H1"]
        tree = trace_element(catalog, h1, reverse=False)
        assert tree is not None


class TestFormatTraceTree:
    def test_text_output(self, gvp_docs_library: Path):
        cfg = GVPConfig(libraries=[gvp_docs_library])
        catalog = load_catalog(cfg)
        h1 = catalog.elements["personal:H1"]
        tree = trace_element(catalog, h1, reverse=False)
        text = format_trace_tree(tree, fmt="text")
        assert "personal:H1" in text
        assert "personal:P1" in text

    def test_json_output(self, gvp_docs_library: Path):
        import json
        cfg = GVPConfig(libraries=[gvp_docs_library])
        catalog = load_catalog(cfg)
        h1 = catalog.elements["personal:H1"]
        tree = trace_element(catalog, h1, reverse=False)
        output = format_trace_tree(tree, fmt="json")
        parsed = json.loads(output)
        assert "element" in parsed
        assert "children" in parsed
