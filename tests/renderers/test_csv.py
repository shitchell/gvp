"""Tests for CSV renderer."""

import csv
import io
from pathlib import Path

from gvp.renderers.csv import render_csv
from gvp.config import GVPConfig
from gvp.loader import load_catalog


class TestRenderCSV:
    def test_renders_header(self, gvp_docs_library: Path):
        cfg = GVPConfig(libraries=[gvp_docs_library])
        catalog = load_catalog(cfg)
        output = render_csv(catalog)
        reader = csv.reader(io.StringIO(output))
        header = next(reader)
        assert "id" in header
        assert "name" in header
        assert "category" in header
        assert "document" in header

    def test_renders_all_active_elements(self, gvp_docs_library: Path):
        cfg = GVPConfig(libraries=[gvp_docs_library])
        catalog = load_catalog(cfg)
        output = render_csv(catalog)
        reader = csv.reader(io.StringIO(output))
        next(reader)  # skip header
        rows = list(reader)
        active = [e for e in catalog.elements.values() if e.status == "active"]
        assert len(rows) == len(active)

    def test_writes_to_file(self, gvp_docs_library: Path, tmp_path: Path):
        cfg = GVPConfig(libraries=[gvp_docs_library])
        catalog = load_catalog(cfg)
        output_dir = tmp_path / "generated"
        render_csv(catalog, output_dir=output_dir)
        csv_files = list(output_dir.glob("*.csv"))
        assert len(csv_files) == 1

    def test_priority_column(self, tmp_path: Path):
        lib = tmp_path / "lib"
        lib.mkdir()
        (lib / "test.yaml").write_text(
            "meta:\n  name: test\n"
            "values:\n"
            "  - id: V1\n    name: V\n    statement: V.\n"
            "    tags: []\n    maps_to: []\n    priority: 2\n"
        )
        cfg = GVPConfig(libraries=[lib])
        catalog = load_catalog(cfg)
        output = render_csv(catalog)
        reader = csv.reader(io.StringIO(output))
        header = next(reader)
        assert "priority" in header
        row = next(reader)
        priority_idx = header.index("priority")
        assert row[priority_idx] == "2"

    def test_considered_column(self, tmp_path: Path):
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
            "        rationale: Too complex.\n"
        )
        cfg = GVPConfig(libraries=[lib])
        catalog = load_catalog(cfg)
        output = render_csv(catalog)
        reader = csv.reader(io.StringIO(output))
        header = next(reader)
        assert "considered" in header
        row = next(reader)
        considered_idx = header.index("considered")
        assert "go" in row[considered_idx]
