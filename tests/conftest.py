"""Shared fixtures for gvp tests."""

from pathlib import Path

import pytest


GVP_DOCS_DIR = Path("/home/guy/code/git/github.com/shitchell/gvp-docs")


@pytest.fixture
def gvp_docs_library() -> Path:
    """Path to the real gvp-docs library for integration tests."""
    assert GVP_DOCS_DIR.exists(), f"gvp-docs not found at {GVP_DOCS_DIR}"
    return GVP_DOCS_DIR


@pytest.fixture
def tmp_library(tmp_path: Path) -> Path:
    """Create a minimal temporary library for unit tests."""
    lib = tmp_path / "test-library"
    lib.mkdir()

    tags = lib / "tags.yaml"
    tags.write_text(
        "domains:\n"
        "  code:\n"
        "    description: Software development\n"
        "concerns:\n"
        "  maintainability:\n"
        "    description: Reducing future cost of change\n"
    )

    doc = lib / "test.yaml"
    doc.write_text(
        "meta:\n"
        "  name: test\n"
        "  scope: test\n"
        "\n"
        "values:\n"
        "  - id: V1\n"
        "    name: Test Value\n"
        "    statement: A test value.\n"
        "    tags: [code]\n"
        "    maps_to: []\n"
        "\n"
        "principles:\n"
        "  - id: P1\n"
        "    name: Test Principle\n"
        "    statement: A test principle.\n"
        "    tags: [maintainability]\n"
        "    maps_to: [test:V1]\n"
    )

    return lib
