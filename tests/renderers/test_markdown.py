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
        assert "unturned" in output

    def test_renders_elements_with_ids(self, gvp_docs_library: Path):
        cfg = GVPConfig(libraries=[gvp_docs_library])
        catalog = load_catalog(cfg)
        output = render_markdown(catalog)
        assert "V1" in output
        assert "Transparency" in output

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
