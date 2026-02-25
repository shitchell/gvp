"""Config discovery: walk-backwards, user, system, merging."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

import yaml


@dataclass
class GVPConfig:
    """Merged configuration from all sources."""

    libraries: list[Path] = field(default_factory=list)
    strict: bool = False
    suppress_warnings: list[str] = field(default_factory=list)
    validation_rules: list[dict] = field(default_factory=list)

    def merge(self, other: GVPConfig) -> GVPConfig:
        """Merge another config into this one. Other's libraries come after ours."""
        return GVPConfig(
            libraries=self.libraries + other.libraries,
            strict=self.strict or other.strict,
            suppress_warnings=list(
                set(self.suppress_warnings + other.suppress_warnings)
            ),
            validation_rules=self.validation_rules + other.validation_rules,
        )


def _parse_config_yaml(path: Path) -> GVPConfig:
    """Parse a config.yaml file into a GVPConfig."""
    if not path.exists():
        return GVPConfig()
    with open(path) as f:
        data = yaml.safe_load(f) or {}
    validation = data.get("validation", {})
    return GVPConfig(
        libraries=[Path(p).expanduser() for p in data.get("libraries", [])],
        strict=data.get("strict", False),
        suppress_warnings=data.get("suppress_warnings", []),
        validation_rules=validation.get("rules", []),
    )


def _walk_backwards(cwd: Path) -> list[Path]:
    """Walk from cwd to root, collecting .gvp/ dirs and .gvp.yaml files."""
    results: list[Path] = []
    current = cwd.resolve()
    while True:
        gvp_dir = current / ".gvp"
        if gvp_dir.is_dir():
            results.append(gvp_dir)
        gvp_file = current / ".gvp.yaml"
        if gvp_file.is_file():
            results.append(gvp_file)
        parent = current.parent
        if parent == current:
            break
        current = parent
    return results


def _collect_from_dir(gvp_dir: Path) -> GVPConfig:
    """Collect config and implicit library from a gvp config directory."""
    cfg = _parse_config_yaml(gvp_dir / "config.yaml")
    libs_dir = gvp_dir / "library"
    if libs_dir.is_dir():
        cfg.libraries.insert(0, libs_dir)
    return cfg


def discover_config(
    cwd: Path | None = None,
    user_dir: Path | None = ...,
    system_dir: Path | None = ...,
) -> GVPConfig:
    """Discover and merge config from all sources."""
    if cwd is None:
        cwd = Path.cwd()
    if user_dir is ...:
        user_dir = Path.home() / ".config" / "gvp"
    if system_dir is ...:
        system_dir = Path("/etc/gvp")

    result = GVPConfig()

    for path in _walk_backwards(cwd):
        result.libraries.append(path)

    if user_dir is not None:
        user_cfg = _collect_from_dir(user_dir)
        result = result.merge(user_cfg)

    if system_dir is not None:
        system_cfg = _collect_from_dir(system_dir)
        result = result.merge(system_cfg)

    return result
