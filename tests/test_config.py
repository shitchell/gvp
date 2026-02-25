"""Tests for gvp.config."""

import textwrap
from pathlib import Path

from gvp.config import GVPConfig, discover_config


class TestGVPConfig:
    def test_empty_config(self):
        cfg = GVPConfig()
        assert cfg.libraries == []
        assert cfg.strict is False
        assert cfg.suppress_warnings == []

    def test_merge_adds_libraries(self):
        base = GVPConfig(libraries=[Path("/a")])
        overlay = GVPConfig(libraries=[Path("/b")])
        merged = base.merge(overlay)
        assert merged.libraries == [Path("/a"), Path("/b")]

    def test_merge_strict_wins(self):
        base = GVPConfig(strict=False)
        overlay = GVPConfig(strict=True)
        merged = base.merge(overlay)
        assert merged.strict is True

    def test_merge_suppressed_warnings_combine(self):
        base = GVPConfig(suppress_warnings=["W001"])
        overlay = GVPConfig(suppress_warnings=["W002"])
        merged = base.merge(overlay)
        assert set(merged.suppress_warnings) == {"W001", "W002"}


class TestDiscoverConfig:
    def test_walk_backwards_finds_gvp_dir(self, tmp_path: Path):
        project = tmp_path / "project" / "subdir"
        project.mkdir(parents=True)
        gvp_dir = tmp_path / "project" / ".gvp"
        gvp_dir.mkdir()
        doc = gvp_dir / "test.yaml"
        doc.write_text("meta:\n  name: test\n  scope: test\n")
        cfg = discover_config(cwd=project, user_dir=None, system_dir=None)
        assert gvp_dir in cfg.libraries

    def test_walk_backwards_finds_gvp_yaml(self, tmp_path: Path):
        project = tmp_path / "project"
        project.mkdir()
        gvp_file = project / ".gvp.yaml"
        gvp_file.write_text("meta:\n  name: inline\n  scope: project\n")
        cfg = discover_config(cwd=project, user_dir=None, system_dir=None)
        assert any(str(p).endswith(".gvp.yaml") for p in cfg.libraries)

    def test_user_dir_implicit_library(self, tmp_path: Path):
        user_dir = tmp_path / "config" / "gvp"
        libs = user_dir / "library"
        libs.mkdir(parents=True)
        doc = libs / "personal.yaml"
        doc.write_text("meta:\n  name: personal\n  scope: personal\n")
        cfg = discover_config(cwd=tmp_path, user_dir=user_dir, system_dir=None)
        assert libs in cfg.libraries

    def test_config_yaml_adds_libraries(self, tmp_path: Path):
        user_dir = tmp_path / "config" / "gvp"
        user_dir.mkdir(parents=True)
        extra_lib = tmp_path / "extra-lib"
        extra_lib.mkdir()
        config_file = user_dir / "config.yaml"
        config_file.write_text(f"libraries:\n  - {extra_lib}\n")
        cfg = discover_config(cwd=tmp_path, user_dir=user_dir, system_dir=None)
        assert extra_lib in cfg.libraries

    def test_discovery_order(self, tmp_path: Path):
        project = tmp_path / "project"
        project.mkdir()
        gvp_dir = project / ".gvp"
        gvp_dir.mkdir()
        user_dir = tmp_path / "user-config" / "gvp"
        user_libs = user_dir / "library"
        user_libs.mkdir(parents=True)
        system_dir = tmp_path / "system-config" / "gvp"
        system_libs = system_dir / "library"
        system_libs.mkdir(parents=True)
        cfg = discover_config(cwd=project, user_dir=user_dir, system_dir=system_dir)
        lib_list = cfg.libraries
        assert lib_list.index(gvp_dir) < lib_list.index(user_libs)
        assert lib_list.index(user_libs) < lib_list.index(system_libs)


class TestValidationRulesConfig:
    def test_empty_config_has_no_rules(self):
        cfg = GVPConfig()
        assert cfg.validation_rules == []

    def test_parse_validation_rules(self, tmp_path: Path):
        config_file = tmp_path / "config.yaml"
        config_file.write_text(
            textwrap.dedent(
                """\
            validation:
              rules:
                - name: "Heuristics need tags"
                  match:
                    category: heuristic
                  require:
                    min_tags: 1
        """
            )
        )
        from gvp.config import _parse_config_yaml

        cfg = _parse_config_yaml(config_file)
        assert len(cfg.validation_rules) == 1
        assert cfg.validation_rules[0]["name"] == "Heuristics need tags"

    def test_merge_combines_rules(self):
        base = GVPConfig(validation_rules=[{"name": "rule1"}])
        overlay = GVPConfig(validation_rules=[{"name": "rule2"}])
        merged = base.merge(overlay)
        assert len(merged.validation_rules) == 2

    def test_no_validation_section_ok(self, tmp_path: Path):
        config_file = tmp_path / "config.yaml"
        config_file.write_text("libraries: []\n")
        from gvp.config import _parse_config_yaml

        cfg = _parse_config_yaml(config_file)
        assert cfg.validation_rules == []
