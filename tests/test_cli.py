"""Integration tests for the gvp CLI."""

import subprocess
from pathlib import Path


GVP_DOCS = "/home/guy/code/git/github.com/shitchell/gvp-docs"


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
             "validate", "--library", GVP_DOCS],
            capture_output=True, text=True,
        )
        assert result.returncode == 0

    def test_query_by_tag(self):
        result = subprocess.run(
            ["python", "-m", "gvp", "--config", "/dev/null",
             "query", "--library", GVP_DOCS, "--tag", "code"],
            capture_output=True, text=True,
        )
        assert result.returncode == 0
        assert "P1" in result.stdout or "H" in result.stdout

    def test_trace(self):
        result = subprocess.run(
            ["python", "-m", "gvp", "--config", "/dev/null",
             "trace", "--library", GVP_DOCS, "personal:H5"],
            capture_output=True, text=True,
        )
        assert result.returncode == 0
        assert "H5" in result.stdout

    def test_render_markdown(self):
        result = subprocess.run(
            ["python", "-m", "gvp", "--config", "/dev/null",
             "render", "--library", GVP_DOCS, "--format", "markdown",
             "--stdout"],
            capture_output=True, text=True,
        )
        assert result.returncode == 0
        assert "Transparency" in result.stdout
