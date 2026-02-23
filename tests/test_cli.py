"""Integration tests for the gvp CLI."""

import subprocess
from pathlib import Path

import pytest


_PROJECT_ROOT = Path(__file__).resolve().parent.parent
EXAMPLE_LIB = str(_PROJECT_ROOT / "examples" / "software-project")


class TestCLI:
    def test_version(self):
        result = subprocess.run(
            ["python", "-m", "gvp", "--version"],
            capture_output=True, text=True,
        )
        assert result.returncode == 0
        assert "0.1.0" in result.stdout

    def test_validate(self):
        result = subprocess.run(
            ["python", "-m", "gvp", "--config", "/dev/null",
             "validate", "--library", EXAMPLE_LIB],
            capture_output=True, text=True,
        )
        assert result.returncode == 0

    def test_query_by_tag(self):
        result = subprocess.run(
            ["python", "-m", "gvp", "--config", "/dev/null",
             "query", "--library", EXAMPLE_LIB, "--tag", "code"],
            capture_output=True, text=True,
        )
        assert result.returncode == 0
        assert "P1" in result.stdout or "H1" in result.stdout

    def test_trace(self):
        result = subprocess.run(
            ["python", "-m", "gvp", "--config", "/dev/null",
             "trace", "--library", EXAMPLE_LIB, "personal:H1"],
            capture_output=True, text=True,
        )
        assert result.returncode == 0
        assert "H1" in result.stdout

    def test_render_markdown(self):
        result = subprocess.run(
            ["python", "-m", "gvp", "--config", "/dev/null",
             "render", "--library", EXAMPLE_LIB, "--format", "markdown",
             "--stdout"],
            capture_output=True, text=True,
        )
        assert result.returncode == 0
        assert "Simplicity" in result.stdout

    def test_review_list(self):
        result = subprocess.run(
            ["python", "-m", "gvp", "--config", "/dev/null",
             "review", "--library", EXAMPLE_LIB],
            capture_output=True, text=True,
        )
        assert result.returncode == 0
