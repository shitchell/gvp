"""Tests for markdown renderer."""

from pathlib import Path

from gvp.renderers.markdown import render_markdown
from gvp.config import GVPConfig
from gvp.loader import load_catalog


class TestRenderMarkdown:
    def test_renders_all_documents(self, gvp_docs_library: Path):
        cfg = GVPConfig(libraries=[gvp_docs_library])
        catalog = load_catalog(cfg)
        output = render_markdown(catalog)
        assert "personal" in output
        assert "taskflow" in output

    def test_renders_elements_with_ids(self, gvp_docs_library: Path):
        cfg = GVPConfig(libraries=[gvp_docs_library])
        catalog = load_catalog(cfg)
        output = render_markdown(catalog)
        assert "V1" in output
        assert "Simplicity" in output

    def test_renders_to_file(self, gvp_docs_library: Path, tmp_path: Path):
        cfg = GVPConfig(libraries=[gvp_docs_library])
        catalog = load_catalog(cfg)
        output_dir = tmp_path / "generated"
        render_markdown(catalog, output_dir=output_dir)
        md_files = list(output_dir.glob("*.md"))
        assert len(md_files) > 0

    def test_excludes_deprecated_by_default(self, tmp_path: Path):
        lib = tmp_path / "lib"
        lib.mkdir()
        (lib / "test.yaml").write_text(
            "meta:\n  name: test\n"
            "values:\n"
            "  - id: V1\n    name: Active\n    statement: Active.\n"
            "    tags: []\n    maps_to: []\n"
            "  - id: V2\n    name: Old\n    statement: Old.\n"
            "    status: deprecated\n    tags: []\n    maps_to: []\n"
        )
        cfg = GVPConfig(libraries=[lib])
        catalog = load_catalog(cfg)
        output = render_markdown(catalog)
        assert "Active" in output
        assert "Old" not in output

    def test_include_deprecated_flag(self, tmp_path: Path):
        lib = tmp_path / "lib"
        lib.mkdir()
        (lib / "test.yaml").write_text(
            "meta:\n  name: test\n"
            "values:\n"
            "  - id: V1\n    name: Active\n    statement: Active.\n"
            "    tags: []\n    maps_to: []\n"
            "  - id: V2\n    name: Old\n    statement: Old.\n"
            "    status: deprecated\n    tags: []\n    maps_to: []\n"
        )
        cfg = GVPConfig(libraries=[lib])
        catalog = load_catalog(cfg)
        output = render_markdown(catalog, include_deprecated=True)
        assert "Old" in output

    def test_renders_multi_inherits(self, tmp_path: Path):
        lib = tmp_path / "lib"
        lib.mkdir()
        (lib / "root.yaml").write_text("meta:\n  name: root\nvalues: []\n")
        (lib / "team.yaml").write_text("meta:\n  name: team\nvalues: []\n")
        (lib / "project.yaml").write_text(
            "meta:\n  name: project\n  inherits:\n    - root\n    - team\nvalues: []\n"
        )
        cfg = GVPConfig(libraries=[lib])
        catalog = load_catalog(cfg)
        output = render_markdown(catalog)
        assert "**Inherits:** root, team" in output

    def test_renders_priority(self, tmp_path: Path):
        lib = tmp_path / "lib"
        lib.mkdir()
        (lib / "test.yaml").write_text(
            "meta:\n  name: test\n"
            "values:\n"
            "  - id: V1\n    name: Important\n    statement: Very important.\n"
            "    tags: []\n    maps_to: []\n    priority: 1\n"
        )
        cfg = GVPConfig(libraries=[lib])
        catalog = load_catalog(cfg)
        output = render_markdown(catalog)
        assert "**Priority:** 1" in output

    def test_renders_considered_alternatives(self, tmp_path: Path):
        lib = tmp_path / "lib"
        lib.mkdir()
        (lib / "test.yaml").write_text(
            "meta:\n  name: test\n"
            "design_choices:\n"
            "  - id: D1\n    name: Use Python\n"
            "    rationale: It works.\n"
            "    tags: []\n    maps_to: []\n"
            "    considered:\n"
            "      go:\n"
            "        description: Fast compiled language.\n"
            "        rationale: Marginal benefit didn't justify switch.\n"
            "      node:\n"
            "        rationale: Not as strong for CLI tools.\n"
        )
        cfg = GVPConfig(libraries=[lib])
        catalog = load_catalog(cfg)
        output = render_markdown(catalog)
        assert "**Considered alternatives:**" in output
        assert "**Go**" in output
        assert "**Node**" in output
        assert "Marginal benefit" in output
