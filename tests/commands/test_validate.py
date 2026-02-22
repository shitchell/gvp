"""Tests for gvp validate command."""

from pathlib import Path

from gvp.commands.validate import validate_catalog
from gvp.config import GVPConfig
from gvp.loader import load_catalog


class TestValidateCatalog:
    def test_real_gvp_docs_passes(self, gvp_docs_library: Path):
        cfg = GVPConfig(libraries=[gvp_docs_library])
        catalog = load_catalog(cfg)
        errors, warnings = validate_catalog(catalog)
        assert errors == [], f"Unexpected errors: {errors}"

    def test_broken_maps_to_reference(self, tmp_path: Path):
        lib = tmp_path / "lib"
        lib.mkdir()
        (lib / "test.yaml").write_text(
            "meta:\n  name: test\n"
            "values:\n"
            "  - id: V1\n"
            "    name: Test\n"
            "    statement: Test.\n"
            "    tags: []\n"
            "    maps_to: [test:NONEXISTENT]\n"
        )
        cfg = GVPConfig(libraries=[lib])
        catalog = load_catalog(cfg)
        errors, _ = validate_catalog(catalog)
        assert any("NONEXISTENT" in e for e in errors)

    def test_id_gap_detected(self, tmp_path: Path):
        lib = tmp_path / "lib"
        lib.mkdir()
        (lib / "test.yaml").write_text(
            "meta:\n  name: test\n"
            "values:\n"
            "  - id: V1\n    name: A\n    statement: A.\n    tags: []\n    maps_to: []\n"
            "  - id: V3\n    name: B\n    statement: B.\n    tags: []\n    maps_to: []\n"
        )
        cfg = GVPConfig(libraries=[lib])
        catalog = load_catalog(cfg)
        errors, _ = validate_catalog(catalog)
        assert any("gap" in e.lower() or "V2" in e for e in errors)

    def test_undefined_tag(self, tmp_path: Path):
        lib = tmp_path / "lib"
        lib.mkdir()
        (lib / "tags.yaml").write_text(
            "domains:\n  code:\n    description: Code\n"
            "concerns: {}\n"
        )
        (lib / "test.yaml").write_text(
            "meta:\n  name: test\n"
            "values:\n"
            "  - id: V1\n    name: A\n    statement: A.\n"
            "    tags: [nonexistent_tag]\n    maps_to: []\n"
        )
        cfg = GVPConfig(libraries=[lib])
        catalog = load_catalog(cfg)
        errors, _ = validate_catalog(catalog)
        assert any("nonexistent_tag" in e for e in errors)

    def test_broken_inherits(self, tmp_path: Path):
        lib = tmp_path / "lib"
        lib.mkdir()
        (lib / "test.yaml").write_text(
            "meta:\n  name: test\n  inherits: nonexistent\n"
            "values: []\n"
        )
        cfg = GVPConfig(libraries=[lib])
        catalog = load_catalog(cfg)
        errors, _ = validate_catalog(catalog)
        assert any("nonexistent" in e for e in errors)

    def test_circular_inherits(self, tmp_path: Path):
        lib = tmp_path / "lib"
        lib.mkdir()
        (lib / "a.yaml").write_text("meta:\n  name: a\n  inherits: b\nvalues: []\n")
        (lib / "b.yaml").write_text("meta:\n  name: b\n  inherits: a\nvalues: []\n")
        cfg = GVPConfig(libraries=[lib])
        catalog = load_catalog(cfg)
        errors, _ = validate_catalog(catalog)
        assert any("circular" in e.lower() for e in errors)

    def test_empty_document_warning(self, tmp_path: Path):
        lib = tmp_path / "lib"
        lib.mkdir()
        (lib / "empty.yaml").write_text("meta:\n  name: empty\n  scope: test\n")
        cfg = GVPConfig(libraries=[lib])
        catalog = load_catalog(cfg)
        _, warnings = validate_catalog(catalog)
        assert any("W001" in w for w in warnings)
