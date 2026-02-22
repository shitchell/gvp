"""Tests for gvp query command."""

from pathlib import Path

from gvp.commands.query import query_catalog
from gvp.config import GVPConfig
from gvp.loader import load_catalog


class TestQueryCatalog:
    def test_filter_by_tag(self, gvp_docs_library: Path):
        cfg = GVPConfig(libraries=[gvp_docs_library])
        catalog = load_catalog(cfg)
        results = query_catalog(catalog, tags=["code"])
        assert len(results) > 0
        assert all("code" in e.tags for e in results)

    def test_filter_by_category(self, gvp_docs_library: Path):
        cfg = GVPConfig(libraries=[gvp_docs_library])
        catalog = load_catalog(cfg)
        results = query_catalog(catalog, categories=["heuristic"])
        assert len(results) > 0
        assert all(e.category == "heuristic" for e in results)

    def test_filter_by_tag_and_category(self, gvp_docs_library: Path):
        cfg = GVPConfig(libraries=[gvp_docs_library])
        catalog = load_catalog(cfg)
        results = query_catalog(catalog, tags=["code"], categories=["heuristic"])
        assert len(results) > 0
        assert all(e.category == "heuristic" and "code" in e.tags for e in results)

    def test_filter_by_document(self, gvp_docs_library: Path):
        cfg = GVPConfig(libraries=[gvp_docs_library])
        catalog = load_catalog(cfg)
        results = query_catalog(catalog, document="personal")
        assert len(results) > 0
        assert all(e.document.name == "personal" for e in results)

    def test_filter_by_status(self, gvp_docs_library: Path):
        cfg = GVPConfig(libraries=[gvp_docs_library])
        catalog = load_catalog(cfg)
        results = query_catalog(catalog, status="active")
        assert all(e.status == "active" for e in results)

    def test_no_filters_returns_all(self, gvp_docs_library: Path):
        cfg = GVPConfig(libraries=[gvp_docs_library])
        catalog = load_catalog(cfg)
        results = query_catalog(catalog)
        assert len(results) == len(catalog.elements)

    def test_no_matches_returns_empty(self, gvp_docs_library: Path):
        cfg = GVPConfig(libraries=[gvp_docs_library])
        catalog = load_catalog(cfg)
        results = query_catalog(catalog, tags=["nonexistent_tag_xyz"])
        assert results == []
