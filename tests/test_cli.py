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


class TestValidateUserRules:
    """Tests that cmd_validate passes config to validate_catalog,
    ensuring user-defined validation_rules from config.yaml are evaluated."""

    @staticmethod
    def _make_library(tmp_path: Path) -> Path:
        """Create a minimal library with one goal and one principle."""
        lib_dir = tmp_path / "lib"
        lib_dir.mkdir()
        doc = lib_dir / "test.yaml"
        doc.write_text(
            "meta:\n"
            "  name: test\n"
            "  scope: test\n"
            "  definitions:\n"
            "    tags:\n"
            "      domains:\n"
            "        code:\n"
            "          description: code stuff\n"
            "\n"
            "goals:\n"
            "  - id: G1\n"
            "    name: Test Goal\n"
            "    statement: A test goal.\n"
            "    tags: [code]\n"
            "\n"
            "values:\n"
            "  - id: V1\n"
            "    name: Test Value\n"
            "    statement: A test value.\n"
            "    tags: [code]\n"
            "\n"
            "principles:\n"
            "  - id: P1\n"
            "    name: Test Principle\n"
            "    statement: A test principle.\n"
            "    tags: []\n"
            "    maps_to: [test:G1, test:V1]\n"
        )
        return lib_dir

    def test_user_defined_error_rule_via_cli(self, tmp_path: Path):
        """User-defined validation rules with level=error are evaluated
        and produce errors when violated."""
        lib_dir = self._make_library(tmp_path)

        # P1 has no tags -- a min_tags:1 rule should catch it
        config_file = tmp_path / "config.yaml"
        config_file.write_text(
            "libraries:\n"
            f"  - {lib_dir}\n"
            "validation:\n"
            "  rules:\n"
            "    - name: principles must have at least one tag\n"
            "      match:\n"
            "        category: principle\n"
            "      require:\n"
            "        min_tags: 1\n"
            "      level: error\n"
        )

        result = subprocess.run(
            ["python", "-m", "gvp",
             "--config", str(config_file),
             "validate"],
            capture_output=True, text=True,
        )
        assert result.returncode == 1, (
            f"Expected exit code 1 (validation error), got {result.returncode}.\n"
            f"stdout: {result.stdout}\nstderr: {result.stderr}"
        )
        assert "principles must have at least one tag" in result.stderr

    def test_user_defined_warning_rule_via_cli(self, tmp_path: Path):
        """User-defined validation rules with level=warning produce
        warnings on stderr (but do not cause a non-zero exit)."""
        lib_dir = self._make_library(tmp_path)

        config_file = tmp_path / "config.yaml"
        config_file.write_text(
            "libraries:\n"
            f"  - {lib_dir}\n"
            "validation:\n"
            "  rules:\n"
            "    - name: principles should have tags\n"
            "      match:\n"
            "        category: principle\n"
            "      require:\n"
            "        min_tags: 1\n"
            "      level: warning\n"
        )

        result = subprocess.run(
            ["python", "-m", "gvp",
             "--config", str(config_file),
             "validate"],
            capture_output=True, text=True,
        )
        assert result.returncode == 0, (
            f"Expected exit code 0 (warning only), got {result.returncode}.\n"
            f"stdout: {result.stdout}\nstderr: {result.stderr}"
        )
        assert "principles should have tags" in result.stderr
