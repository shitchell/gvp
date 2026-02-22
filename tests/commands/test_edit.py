"""Tests for gvp edit command."""

from pathlib import Path
from datetime import date

import pytest
import yaml

from gvp.commands.edit import edit_element_inline, edit_element_interactive, edit_via_editor
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


class TestEditNoProvenance:
    def test_no_provenance_skips_updated_by(self, tmp_path: Path):
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
            rationale="",
            no_provenance=True,
        )
        with open(doc_path) as f:
            data = yaml.safe_load(f)
        assert data["values"][0]["name"] == "Updated"
        assert "updated_by" not in data["values"][0]


class TestEditInteractive:
    def test_edit_interactive_updates_field(self, tmp_path: Path, monkeypatch):
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

        # Simulate: change name to "New Name", skip status and statement, provide rationale
        inputs = iter(["New Name", "", "", "testing interactive"])
        monkeypatch.setattr("builtins.input", lambda prompt="": next(inputs))

        edit_element_interactive(catalog, "test:V1")

        with open(doc_path) as f:
            data = yaml.safe_load(f)
        assert data["values"][0]["name"] == "New Name"
        updated_by = data["values"][0].get("updated_by", [])
        assert len(updated_by) == 1
        assert updated_by[0]["rationale"] == "testing interactive"

    def test_edit_interactive_no_changes(self, tmp_path: Path, monkeypatch, capsys):
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

        # All empty inputs -> no changes
        inputs = iter(["", "", ""])
        monkeypatch.setattr("builtins.input", lambda prompt="": next(inputs))

        edit_element_interactive(catalog, "test:V1")

        captured = capsys.readouterr()
        assert "No changes." in captured.out

    def test_edit_interactive_nonexistent_raises(self, tmp_path: Path):
        lib = tmp_path / "lib"
        lib.mkdir()
        (lib / "test.yaml").write_text(
            "meta:\n  name: test\nvalues: []\n"
        )
        cfg = GVPConfig(libraries=[lib])
        catalog = load_catalog(cfg)
        with pytest.raises(ValueError, match="not found"):
            edit_element_interactive(catalog, "test:V99")


class TestEditViaEditor:
    def test_edit_via_editor_applies_changes(self, tmp_path: Path, monkeypatch):
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

        # Mock editor: modify the temp file to change the name
        def fake_editor(cmd):
            import subprocess as sp
            tmp_file = cmd[1]
            with open(tmp_file) as f:
                content = f.read()
            content = content.replace("name: Original", "name: EditorChanged")
            with open(tmp_file, "w") as f:
                f.write(content)
            return sp.CompletedProcess(cmd, 0)

        monkeypatch.setattr("subprocess.run", fake_editor)
        monkeypatch.setattr("builtins.input", lambda prompt="": "editor rationale")

        result = edit_via_editor(catalog, "test:V1")

        assert result is True
        with open(doc_path) as f:
            data = yaml.safe_load(f)
        assert data["values"][0]["name"] == "EditorChanged"

    def test_edit_via_editor_no_changes(self, tmp_path: Path, monkeypatch, capsys):
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

        # Mock editor: don't change anything
        def fake_editor(cmd):
            import subprocess as sp
            return sp.CompletedProcess(cmd, 0)

        monkeypatch.setattr("subprocess.run", fake_editor)

        result = edit_via_editor(catalog, "test:V1")

        assert result is False
        captured = capsys.readouterr()
        assert "No changes." in captured.out

    def test_edit_via_editor_nonexistent_raises(self, tmp_path: Path):
        lib = tmp_path / "lib"
        lib.mkdir()
        (lib / "test.yaml").write_text(
            "meta:\n  name: test\nvalues: []\n"
        )
        cfg = GVPConfig(libraries=[lib])
        catalog = load_catalog(cfg)
        with pytest.raises(ValueError, match="not found"):
            edit_via_editor(catalog, "test:V99")

    def test_edit_via_editor_editor_fails(self, tmp_path: Path, monkeypatch):
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

        # Mock editor: return non-zero exit code
        def fake_editor(cmd):
            import subprocess as sp
            return sp.CompletedProcess(cmd, 1)

        monkeypatch.setattr("subprocess.run", fake_editor)

        result = edit_via_editor(catalog, "test:V1")
        assert result is False
