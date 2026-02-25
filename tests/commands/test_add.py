"""Tests for gvp add command."""

from datetime import date
from pathlib import Path

import yaml

from gvp.commands.add import add_element, next_id
from gvp.config import GVPConfig
from gvp.loader import load_catalog
from gvp.schema import load_builtin_defaults


class TestNextId:
    def setup_method(self):
        self.registry = load_builtin_defaults()

    def test_first_element(self):
        assert next_id("value", [], self.registry, prefix=None) == "V1"

    def test_sequential(self):
        existing = ["V1", "V2", "V3"]
        assert next_id("value", existing, self.registry, prefix=None) == "V4"

    def test_with_prefix(self):
        assert next_id("value", [], self.registry, prefix="U") == "UV1"

    def test_all_categories(self):
        assert next_id("principle", [], self.registry, prefix=None) == "P1"
        assert next_id("heuristic", [], self.registry, prefix=None) == "H1"
        assert next_id("rule", [], self.registry, prefix=None) == "R1"
        assert next_id("goal", [], self.registry, prefix=None) == "G1"
        assert next_id("milestone", [], self.registry, prefix=None) == "M1"
        assert next_id("design_choice", [], self.registry, prefix=None) == "D1"
        assert next_id("constraint", [], self.registry, prefix=None) == "CON1"
        assert next_id("implementation_rule", [], self.registry, prefix=None) == "IR1"
        assert next_id("coding_principle", [], self.registry, prefix=None) == "C1"


class TestAddElement:
    def test_adds_to_file(self, tmp_path: Path):
        lib = tmp_path / "lib"
        lib.mkdir()
        doc_path = lib / "test.yaml"
        doc_path.write_text(
            "meta:\n  name: test\n  scope: test\n\n"
            "values:\n"
            "  - id: V1\n    name: Existing\n    statement: Exists.\n"
            "    tags: []\n    maps_to: []\n"
        )
        cfg = GVPConfig(libraries=[lib])
        catalog = load_catalog(cfg)
        add_element(
            catalog=catalog,
            document_name="test",
            category="value",
            name="New Value",
            fields={"statement": "A new value.", "tags": [], "maps_to": []},
        )
        with open(doc_path) as f:
            data = yaml.safe_load(f)
        assert len(data["values"]) == 2
        assert data["values"][1]["id"] == "V2"
        assert data["values"][1]["name"] == "New Value"

    def test_auto_assigns_id(self, tmp_path: Path):
        lib = tmp_path / "lib"
        lib.mkdir()
        doc_path = lib / "test.yaml"
        doc_path.write_text(
            "meta:\n  name: test\n\n"
            "principles:\n"
            "  - id: P1\n    name: A\n    statement: A.\n"
            "    tags: []\n    maps_to: []\n"
            "  - id: P2\n    name: B\n    statement: B.\n"
            "    tags: []\n    maps_to: []\n"
        )
        cfg = GVPConfig(libraries=[lib])
        catalog = load_catalog(cfg)
        add_element(
            catalog=catalog,
            document_name="test",
            category="principle",
            name="C",
            fields={"statement": "C.", "tags": [], "maps_to": []},
        )
        with open(doc_path) as f:
            data = yaml.safe_load(f)
        assert data["principles"][2]["id"] == "P3"


class TestAutoOrigin:
    def test_auto_origin_when_no_origin_or_defaults(self, tmp_path: Path):
        lib = tmp_path / "lib"
        lib.mkdir()
        doc_path = lib / "test.yaml"
        doc_path.write_text(
            "meta:\n  name: test\n\n"
            "values:\n"
            "  - id: V1\n    name: Existing\n    statement: Exists.\n"
            "    tags: []\n    maps_to: []\n"
        )
        cfg = GVPConfig(libraries=[lib])
        catalog = load_catalog(cfg)
        add_element(
            catalog=catalog,
            document_name="test",
            category="value",
            name="New Value",
            fields={"statement": "A new value.", "tags": [], "maps_to": []},
        )
        with open(doc_path) as f:
            data = yaml.safe_load(f)
        added = data["values"][1]
        assert "origin" in added
        assert isinstance(added["origin"], list)
        assert added["origin"][0]["date"] == date.today().isoformat()

    def test_no_auto_origin_when_defaults_exist(self, tmp_path: Path):
        lib = tmp_path / "lib"
        lib.mkdir()
        doc_path = lib / "test.yaml"
        doc_path.write_text(
            "meta:\n  name: test\n  defaults:\n    origin:\n"
            "      project: my-project\n\n"
            "values:\n"
            "  - id: V1\n    name: Existing\n    statement: Exists.\n"
            "    tags: []\n    maps_to: []\n"
        )
        cfg = GVPConfig(libraries=[lib])
        catalog = load_catalog(cfg)
        add_element(
            catalog=catalog,
            document_name="test",
            category="value",
            name="New Value",
            fields={"statement": "A new value.", "tags": [], "maps_to": []},
        )
        with open(doc_path) as f:
            data = yaml.safe_load(f)
        added = data["values"][1]
        # Should NOT have auto-origin since defaults.origin exists
        # (the origin would come from defaults when loaded, not from add_element)
        assert "origin" not in added or added.get("origin") != [{"date": date.today().isoformat()}]

    def test_no_provenance_skips_auto_origin(self, tmp_path: Path):
        lib = tmp_path / "lib"
        lib.mkdir()
        doc_path = lib / "test.yaml"
        doc_path.write_text(
            "meta:\n  name: test\n\n"
            "values:\n"
            "  - id: V1\n    name: Existing\n    statement: Exists.\n"
            "    tags: []\n    maps_to: []\n"
        )
        cfg = GVPConfig(libraries=[lib])
        catalog = load_catalog(cfg)
        add_element(
            catalog=catalog,
            document_name="test",
            category="value",
            name="New Value",
            fields={"statement": "A new value.", "tags": [], "maps_to": []},
            no_provenance=True,
        )
        with open(doc_path) as f:
            data = yaml.safe_load(f)
        added = data["values"][1]
        assert "origin" not in added

    def test_explicit_origin_preserved(self, tmp_path: Path):
        lib = tmp_path / "lib"
        lib.mkdir()
        doc_path = lib / "test.yaml"
        doc_path.write_text(
            "meta:\n  name: test\n\n"
            "values:\n"
            "  - id: V1\n    name: Existing\n    statement: Exists.\n"
            "    tags: []\n    maps_to: []\n"
        )
        cfg = GVPConfig(libraries=[lib])
        catalog = load_catalog(cfg)
        explicit_origin = [{"project": "my-project", "date": "2026-01-01"}]
        add_element(
            catalog=catalog,
            document_name="test",
            category="value",
            name="New Value",
            fields={"statement": "A new value.", "tags": [], "maps_to": [], "origin": explicit_origin},
        )
        with open(doc_path) as f:
            data = yaml.safe_load(f)
        added = data["values"][1]
        assert added["origin"] == explicit_origin
