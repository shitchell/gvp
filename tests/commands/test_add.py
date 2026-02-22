"""Tests for gvp add command."""

from pathlib import Path

import yaml

from gvp.commands.add import add_element, next_id
from gvp.config import GVPConfig
from gvp.loader import load_catalog


class TestNextId:
    def test_first_element(self):
        assert next_id("value", [], prefix=None) == "V1"

    def test_sequential(self):
        existing = ["V1", "V2", "V3"]
        assert next_id("value", existing, prefix=None) == "V4"

    def test_with_prefix(self):
        assert next_id("value", [], prefix="U") == "UV1"

    def test_all_categories(self):
        assert next_id("principle", [], prefix=None) == "P1"
        assert next_id("heuristic", [], prefix=None) == "H1"
        assert next_id("rule", [], prefix=None) == "R1"
        assert next_id("goal", [], prefix=None) == "G1"
        assert next_id("milestone", [], prefix=None) == "M1"
        assert next_id("design_choice", [], prefix=None) == "D1"
        assert next_id("constraint", [], prefix=None) == "CON1"
        assert next_id("implementation_rule", [], prefix=None) == "IR1"
        assert next_id("coding_principle", [], prefix=None) == "C1"


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
