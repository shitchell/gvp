"""Tests for gvp.loader."""

from pathlib import Path

from gvp.loader import load_library, load_catalog
from gvp.config import GVPConfig
from gvp.model import Catalog


class TestLoadLibrary:
    def test_loads_document_with_meta(self, tmp_library: Path):
        docs, tags = load_library(tmp_library)
        names = {d.name for d in docs}
        assert "test" in names

    def test_loads_elements(self, tmp_library: Path):
        docs, tags = load_library(tmp_library)
        doc = next(d for d in docs if d.name == "test")
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

    def test_loads_multi_parent_inherits(self, tmp_path: Path):
        lib = tmp_path / "lib"
        lib.mkdir()
        (lib / "root.yaml").write_text(
            "meta:\n  name: root\nvalues:\n"
            "  - id: V1\n    name: V\n    statement: V.\n    tags: []\n    maps_to: []\n"
        )
        (lib / "team.yaml").write_text(
            "meta:\n  name: team\n  inherits: root\nvalues: []\n"
        )
        (lib / "python.yaml").write_text(
            "meta:\n  name: python\n  inherits: root\nvalues: []\n"
        )
        (lib / "project.yaml").write_text(
            "meta:\n  name: project\n  inherits:\n    - team\n    - python\nvalues: []\n"
        )
        docs, _ = load_library(lib)
        project_doc = next(d for d in docs if d.name == "project")
        assert project_doc.inherits == ["team", "python"]

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

    def test_ancestor_resolution(self, gvp_docs_library: Path):
        cfg = GVPConfig(libraries=[gvp_docs_library])
        catalog = load_catalog(cfg)
        v1 = catalog.documents["taskflow-v1"]
        chain = catalog.resolve_ancestors(v1)
        names = [d.name for d in chain]
        assert names == ["taskflow", "personal", "universal"]

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


class TestInlineTagDefinitions:
    def test_loads_tags_from_meta_definitions(self, tmp_path: Path):
        """Tags defined in meta.definitions.tags are loaded onto the document."""
        lib = tmp_path / "lib"
        lib.mkdir()
        (lib / "test.yaml").write_text(
            "meta:\n"
            "  name: test\n"
            "  definitions:\n"
            "    tags:\n"
            "      domains:\n"
            "        code:\n"
            "          description: Software development\n"
            "      concerns:\n"
            "        reliability:\n"
            "          description: System correctness\n"
            "\n"
            "values:\n"
            "  - id: V1\n"
            "    name: Test\n"
            "    statement: Test.\n"
            "    tags: [code]\n"
            "    maps_to: []\n"
        )
        docs, tags = load_library(lib)
        assert "code" in tags
        assert tags["code"]["type"] == "domain"
        assert "reliability" in tags
        assert tags["reliability"]["type"] == "concern"

    def test_tags_from_multiple_documents_accumulate(self, tmp_path: Path):
        """Tags from different documents in the same library merge (first-wins)."""
        lib = tmp_path / "lib"
        lib.mkdir()
        (lib / "a.yaml").write_text(
            "meta:\n"
            "  name: a\n"
            "  definitions:\n"
            "    tags:\n"
            "      domains:\n"
            "        code:\n"
            "          description: From doc a\n"
        )
        (lib / "b.yaml").write_text(
            "meta:\n"
            "  name: b\n"
            "  definitions:\n"
            "    tags:\n"
            "      domains:\n"
            "        systems:\n"
            "          description: From doc b\n"
        )
        docs, tags = load_library(lib)
        assert "code" in tags
        assert "systems" in tags

    def test_first_wins_on_duplicate_tag(self, tmp_path: Path):
        """When two documents define the same tag, the first loaded wins."""
        lib = tmp_path / "lib"
        lib.mkdir()
        # a.yaml sorts before b.yaml
        (lib / "a.yaml").write_text(
            "meta:\n"
            "  name: a\n"
            "  definitions:\n"
            "    tags:\n"
            "      domains:\n"
            "        code:\n"
            "          description: From a\n"
        )
        (lib / "b.yaml").write_text(
            "meta:\n"
            "  name: b\n"
            "  definitions:\n"
            "    tags:\n"
            "      domains:\n"
            "        code:\n"
            "          description: From b\n"
        )
        docs, tags = load_library(lib)
        assert tags["code"]["description"] == "From a"

    def test_dedicated_tags_file_with_meta_block(self, tmp_path: Path):
        """A tags.yaml with meta block is now parsed as a regular document."""
        lib = tmp_path / "lib"
        lib.mkdir()
        (lib / "tags.yaml").write_text(
            "meta:\n"
            "  name: tags\n"
            "  definitions:\n"
            "    tags:\n"
            "      domains:\n"
            "        code:\n"
            "          description: Software development\n"
        )
        (lib / "test.yaml").write_text(
            "meta:\n"
            "  name: test\n"
            "values:\n"
            "  - id: V1\n"
            "    name: Test\n"
            "    statement: Test.\n"
            "    tags: [code]\n"
            "    maps_to: []\n"
        )
        docs, tags = load_library(lib)
        assert "code" in tags
        # tags.yaml is now a document (with no elements)
        names = {d.name for d in docs}
        assert "tags" in names

    def test_tags_propagate_to_catalog(self, tmp_path: Path):
        """Tags from documents end up in catalog.tags."""
        lib = tmp_path / "lib"
        lib.mkdir()
        (lib / "test.yaml").write_text(
            "meta:\n"
            "  name: test\n"
            "  definitions:\n"
            "    tags:\n"
            "      domains:\n"
            "        code:\n"
            "          description: Software development\n"
            "\n"
            "values:\n"
            "  - id: V1\n"
            "    name: Test\n"
            "    statement: Test.\n"
            "    tags: [code]\n"
            "    maps_to: []\n"
        )
        cfg = GVPConfig(libraries=[lib])
        catalog = load_catalog(cfg)
        assert "code" in catalog.tags

    def test_document_without_definitions_has_empty_tags(self, tmp_path: Path):
        """Documents without meta.definitions.tags have empty tag_definitions."""
        lib = tmp_path / "lib"
        lib.mkdir()
        (lib / "test.yaml").write_text(
            "meta:\n"
            "  name: test\n"
            "values:\n"
            "  - id: V1\n"
            "    name: Test\n"
            "    statement: Test.\n"
            "    tags: []\n"
            "    maps_to: []\n"
        )
        docs, tags = load_library(lib)
        assert docs[0].tag_definitions == {}
        assert tags == {}
