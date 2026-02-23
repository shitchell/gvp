"""Tests for gvp.loader."""

from pathlib import Path

from gvp.loader import load_library, load_catalog
from gvp.config import GVPConfig
from gvp.model import Catalog


class TestLoadLibrary:
    def test_loads_document_with_meta(self, tmp_library: Path):
        docs, tags = load_library(tmp_library)
        assert len(docs) == 1
        assert docs[0].name == "test"

    def test_loads_elements(self, tmp_library: Path):
        docs, tags = load_library(tmp_library)
        doc = docs[0]
        assert len(doc.elements) == 2
        ids = {e.id for e in doc.elements}
        assert ids == {"V1", "P1"}

    def test_loads_tags(self, tmp_library: Path):
        docs, tags = load_library(tmp_library)
        assert "code" in tags
        assert "maintainability" in tags

    def test_skips_schema_yaml(self, tmp_library: Path):
        schema = tmp_library / "schema.yaml"
        schema.write_text("meta:\n  name: schema\n")
        docs, _ = load_library(tmp_library)
        names = {d.name for d in docs}
        assert "schema" not in names

    def test_skips_tags_yaml(self, tmp_library: Path):
        docs, _ = load_library(tmp_library)
        names = {d.name for d in docs}
        assert "tags" not in names

    def test_merges_defaults_into_elements(self, tmp_path: Path):
        lib = tmp_path / "lib"
        lib.mkdir()
        doc = lib / "test.yaml"
        doc.write_text(
            "meta:\n"
            "  name: test\n"
            "  defaults:\n"
            "    origin:\n"
            "      project: myproject\n"
            "      date: 2026-02-22\n"
            "\n"
            "values:\n"
            "  - id: V1\n"
            "    name: Test\n"
            "    statement: A test.\n"
            "    tags: []\n"
            "    maps_to: []\n"
        )
        docs, _ = load_library(lib)
        elem = docs[0].elements[0]
        assert elem.origin == [{"project": "myproject", "date": "2026-02-22"}]

    def test_element_explicit_origin_overrides_default(self, tmp_path: Path):
        lib = tmp_path / "lib"
        lib.mkdir()
        doc = lib / "test.yaml"
        doc.write_text(
            "meta:\n"
            "  name: test\n"
            "  defaults:\n"
            "    origin:\n"
            "      project: default-project\n"
            "      date: 2026-01-01\n"
            "\n"
            "values:\n"
            "  - id: V1\n"
            "    name: Test\n"
            "    statement: A test.\n"
            "    tags: []\n"
            "    maps_to: []\n"
            "    origin:\n"
            "      - project: explicit\n"
            "        date: 2026-02-22\n"
        )
        docs, _ = load_library(lib)
        elem = docs[0].elements[0]
        assert elem.origin[0]["project"] == "explicit"


class TestLoadCatalog:
    def test_loads_example_library(self, gvp_docs_library: Path):
        cfg = GVPConfig(libraries=[gvp_docs_library])
        catalog = load_catalog(cfg)
        assert "personal" in catalog.documents
        assert "universal" in catalog.documents
        assert "taskflow" in catalog.documents
        assert "taskflow-v1" in catalog.documents

    def test_qualified_ids_indexed(self, gvp_docs_library: Path):
        cfg = GVPConfig(libraries=[gvp_docs_library])
        catalog = load_catalog(cfg)
        assert "personal:V1" in catalog.elements
        assert "personal:P1" in catalog.elements
        assert "taskflow:G1" in catalog.elements
        assert "taskflow-v1:D1" in catalog.elements

    def test_chain_resolution(self, gvp_docs_library: Path):
        cfg = GVPConfig(libraries=[gvp_docs_library])
        catalog = load_catalog(cfg)
        v1 = catalog.documents["taskflow-v1"]
        chain = catalog.resolve_chain(v1)
        names = [d.name for d in chain]
        assert names == ["taskflow-v1", "taskflow", "personal", "universal"]

    def test_tags_loaded(self, gvp_docs_library: Path):
        cfg = GVPConfig(libraries=[gvp_docs_library])
        catalog = load_catalog(cfg)
        assert "code" in catalog.tags
        assert "maintainability" in catalog.tags

    def test_duplicate_name_warning(self, tmp_path: Path, capsys):
        lib1 = tmp_path / "lib1"
        lib1.mkdir()
        (lib1 / "a.yaml").write_text("meta:\n  name: dupe\n  scope: test\nvalues: []\n")
        lib2 = tmp_path / "lib2"
        lib2.mkdir()
        (lib2 / "b.yaml").write_text("meta:\n  name: dupe\n  scope: test\nvalues: []\n")
        cfg = GVPConfig(libraries=[lib1, lib2])
        catalog = load_catalog(cfg)
        assert catalog.documents["dupe"].path == lib1 / "a.yaml"
