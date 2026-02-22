"""Tests for gvp edit command."""

from pathlib import Path
from datetime import date

import pytest
import yaml

from gvp.commands.edit import edit_element_inline
from gvp.config import GVPConfig
from gvp.loader import load_catalog


class TestEditElementInline:
    def test_updates_field(self, tmp_path: Path):
        lib = tmp_path / "lib"
        lib.mkdir()
        doc_path = lib / "test.yaml"
        doc_path.write_text(
            "meta:\n  name: test\n\n"
            "values:\n"
            "  - id: V1\n    name: Original\n    statement: Original.\n"
            "    tags: []\n    maps_to: []\n"
        )
        cfg = GVPConfig(libraries=[lib])
        catalog = load_catalog(cfg)
        edit_element_inline(
            catalog=catalog,
            qualified_id="test:V1",
            updates={"name": "Updated"},
            rationale="testing edit",
        )
        with open(doc_path) as f:
            data = yaml.safe_load(f)
        assert data["values"][0]["name"] == "Updated"

    def test_appends_updated_by(self, tmp_path: Path):
        lib = tmp_path / "lib"
        lib.mkdir()
        doc_path = lib / "test.yaml"
        doc_path.write_text(
            "meta:\n  name: test\n\n"
            "values:\n"
            "  - id: V1\n    name: Original\n    statement: Original.\n"
            "    tags: []\n    maps_to: []\n"
        )
        cfg = GVPConfig(libraries=[lib])
        catalog = load_catalog(cfg)
        edit_element_inline(
            catalog=catalog,
            qualified_id="test:V1",
            updates={"name": "Updated"},
            rationale="testing edit",
        )
        with open(doc_path) as f:
            data = yaml.safe_load(f)
        updated_by = data["values"][0].get("updated_by", [])
        assert len(updated_by) == 1
        assert updated_by[0]["rationale"] == "testing edit"
        assert "date" in updated_by[0]

    def test_deprecate_element(self, tmp_path: Path):
        lib = tmp_path / "lib"
        lib.mkdir()
        doc_path = lib / "test.yaml"
        doc_path.write_text(
            "meta:\n  name: test\n\n"
            "values:\n"
            "  - id: V1\n    name: Old\n    statement: Old.\n"
            "    tags: []\n    maps_to: []\n"
        )
        cfg = GVPConfig(libraries=[lib])
        catalog = load_catalog(cfg)
        edit_element_inline(
            catalog=catalog,
            qualified_id="test:V1",
            updates={"status": "deprecated"},
            rationale="superseded by V2",
        )
        with open(doc_path) as f:
            data = yaml.safe_load(f)
        assert data["values"][0]["status"] == "deprecated"

    def test_nonexistent_element_raises(self, tmp_path: Path):
        lib = tmp_path / "lib"
        lib.mkdir()
        (lib / "test.yaml").write_text(
            "meta:\n  name: test\nvalues: []\n"
        )
        cfg = GVPConfig(libraries=[lib])
        catalog = load_catalog(cfg)
        with pytest.raises(ValueError, match="not found"):
            edit_element_inline(
                catalog=catalog,
                qualified_id="test:V99",
                updates={"name": "Nope"},
                rationale="testing",
            )
