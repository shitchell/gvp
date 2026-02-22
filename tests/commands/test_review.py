"""Tests for gvp review command."""

from datetime import date
from pathlib import Path

import yaml

from gvp.commands.review import find_stale_elements, format_review_display, stamp_review
from gvp.config import GVPConfig
from gvp.loader import load_catalog


def _make_review_lib(tmp_path: Path, root_updated: str | None = None, elem_reviewed: str | None = None) -> Path:
    """Create a library with root + test documents for review testing."""
    lib = tmp_path / "lib"
    lib.mkdir(exist_ok=True)

    root_data: dict = {
        "meta": {"name": "root"},
        "values": [
            {"id": "V1", "name": "Test Value", "statement": "A value.", "tags": [], "maps_to": []},
        ],
        "goals": [
            {"id": "G1", "name": "Test Goal", "statement": "A goal.", "tags": [], "maps_to": []},
        ],
    }
    if root_updated:
        root_data["values"][0]["updated_by"] = [
            {"date": root_updated, "rationale": "Changed something"}
        ]

    (lib / "root.yaml").write_text(yaml.dump(root_data, default_flow_style=False, sort_keys=False))

    test_data: dict = {
        "meta": {"name": "test", "inherits": "root"},
        "principles": [
            {
                "id": "P1",
                "name": "Test Principle",
                "statement": "Test.",
                "tags": [],
                "maps_to": ["root:G1", "root:V1"],
            },
        ],
    }
    if elem_reviewed:
        test_data["principles"][0]["reviewed_by"] = [
            {"date": elem_reviewed, "by": "guy", "note": "Reviewed"}
        ]

    (lib / "test.yaml").write_text(yaml.dump(test_data, default_flow_style=False, sort_keys=False))

    return lib


class TestFindStaleElements:
    def test_finds_stale_elements(self, tmp_path: Path):
        lib = _make_review_lib(tmp_path, root_updated="2026-02-20", elem_reviewed="2026-02-15")
        cfg = GVPConfig(libraries=[lib])
        catalog = load_catalog(cfg)
        stale = find_stale_elements(catalog)
        assert len(stale) >= 1
        elem, ancestor, ancestor_date = stale[0]
        assert elem.id == "P1"
        assert ancestor_date == "2026-02-20"

    def test_fresh_elements_not_stale(self, tmp_path: Path):
        lib = _make_review_lib(tmp_path, root_updated="2026-02-15", elem_reviewed="2026-02-20")
        cfg = GVPConfig(libraries=[lib])
        catalog = load_catalog(cfg)
        stale = find_stale_elements(catalog)
        stale_ids = [e.id for e, _, _ in stale]
        assert "P1" not in stale_ids

    def test_never_reviewed_with_updates_is_stale(self, tmp_path: Path):
        lib = _make_review_lib(tmp_path, root_updated="2026-02-20", elem_reviewed=None)
        cfg = GVPConfig(libraries=[lib])
        catalog = load_catalog(cfg)
        stale = find_stale_elements(catalog)
        assert any(e.id == "P1" for e, _, _ in stale)

    def test_no_updates_no_stale(self, tmp_path: Path):
        lib = _make_review_lib(tmp_path, root_updated=None, elem_reviewed=None)
        cfg = GVPConfig(libraries=[lib])
        catalog = load_catalog(cfg)
        stale = find_stale_elements(catalog)
        assert not any(e.id == "P1" for e, _, _ in stale)


class TestFormatReviewDisplay:
    def test_includes_element_details(self, tmp_path: Path):
        lib = _make_review_lib(tmp_path, root_updated="2026-02-20", elem_reviewed="2026-02-15")
        cfg = GVPConfig(libraries=[lib])
        catalog = load_catalog(cfg)
        elem = catalog.elements["test:P1"]
        output = format_review_display(catalog, elem)
        assert "test:P1" in output
        assert "Test Principle" in output
        assert "principle" in output
        assert "Changes since last review:" in output

    def test_no_changes_message(self, tmp_path: Path):
        lib = _make_review_lib(tmp_path, root_updated=None, elem_reviewed="2026-02-20")
        cfg = GVPConfig(libraries=[lib])
        catalog = load_catalog(cfg)
        elem = catalog.elements["test:P1"]
        output = format_review_display(catalog, elem)
        assert "No ancestor changes since last review." in output


class TestStampReview:
    def test_stamp_review_appends_reviewed_by(self, tmp_path: Path):
        lib = _make_review_lib(tmp_path, root_updated="2026-02-20")
        cfg = GVPConfig(libraries=[lib])
        catalog = load_catalog(cfg)
        stamp_review(catalog, "test:P1", note="Looks good", by="testuser")
        with open(lib / "test.yaml") as f:
            data = yaml.safe_load(f)
        reviewed_by = data["principles"][0].get("reviewed_by", [])
        assert len(reviewed_by) == 1
        assert reviewed_by[0]["date"] == date.today().isoformat()
        assert reviewed_by[0]["by"] == "testuser"
        assert reviewed_by[0]["note"] == "Looks good"

    def test_stamp_review_without_note(self, tmp_path: Path):
        lib = _make_review_lib(tmp_path, root_updated="2026-02-20")
        cfg = GVPConfig(libraries=[lib])
        catalog = load_catalog(cfg)
        stamp_review(catalog, "test:P1", by="testuser")
        with open(lib / "test.yaml") as f:
            data = yaml.safe_load(f)
        reviewed_by = data["principles"][0].get("reviewed_by", [])
        assert len(reviewed_by) == 1
        assert "note" not in reviewed_by[0]

    def test_stamp_nonexistent_element_raises(self, tmp_path: Path):
        lib = _make_review_lib(tmp_path)
        cfg = GVPConfig(libraries=[lib])
        catalog = load_catalog(cfg)
        import pytest
        with pytest.raises(ValueError, match="not found"):
            stamp_review(catalog, "test:X99")
