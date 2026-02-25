"""Shared fixtures for gvp tests."""

from pathlib import Path

import pytest


_PROJECT_ROOT = Path(__file__).resolve().parent.parent
EXAMPLE_LIBRARY = _PROJECT_ROOT / "examples" / "software-project"


@pytest.fixture
def gvp_docs_library() -> Path:
    """Path to the bundled example library for integration tests."""
    assert EXAMPLE_LIBRARY.exists(), f"Example library not found at {EXAMPLE_LIBRARY}"
    return EXAMPLE_LIBRARY


@pytest.fixture
def tmp_library(tmp_path: Path) -> Path:
    """Create a minimal temporary library for unit tests."""
    lib = tmp_path / "test-library"
    lib.mkdir()

    tags = lib / "tags.yaml"
    tags.write_text(
        "meta:\n"
        "  name: tags\n"
        "  definitions:\n"
        "    tags:\n"
        "      domains:\n"
        "        code:\n"
        "          description: Software development\n"
        "      concerns:\n"
        "        maintainability:\n"
        "          description: Reducing future cost of change\n"
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
