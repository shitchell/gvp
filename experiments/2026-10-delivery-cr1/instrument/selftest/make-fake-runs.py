#!/usr/bin/env python3
"""Build two synthetic run worlds and a MANIFEST for them.

Without this, `leak-audit.py`'s entire run-level half — including the delivery
manipulation check, which is the single assertion this trial most depends on —
cannot be mutation-tested before any run exists, and an untestable check is not
a check (`code-testing:TH2`). The mutation sandbox calls this so those
assertions actually execute and can be defeated.

One ambient run and one hooked run is the minimum that exercises both sides of
every conditional in that half.

usage: make-fake-runs.py <experiment-dir> <roots-parent>
"""
import json
import pathlib
import shutil
import subprocess
import sys

E = pathlib.Path(sys.argv[1]).resolve()
PARENT = pathlib.Path(sys.argv[2]).resolve()
CAIRN_VERSION = "5.1.0"

# ids are hex, as dispatch.sh produces them, so the opacity check is exercised
RUNS = [("ra1b2c3d4e5", "L0", 1), ("rf6e5d4c3b2", "L2", 1)]

man = {}
for rid, arm, rep in RUNS:
    root = PARENT / rid
    proj = root / "project"
    (proj / ".gvp").mkdir(parents=True, exist_ok=True)
    (root / ".registry").mkdir(exist_ok=True)
    (root / ".cfg" / "hooks").mkdir(parents=True, exist_ok=True)
    shutil.copytree(
        E / "arms" / arm / "library", proj / ".gvp" / "library", dirs_exist_ok=True
    )
    for f in ("TASK.md", "CLAUDE.md"):
        shutil.copy(E / f, proj / f)
    (proj / "DECISIONS.md").write_text("# Decisions\n\nnothing to report.\n")

    settings = {
        "model": "opus[1m]",
        "autoCompactEnabled": False,
        "includeCoAuthoredBy": False,
    }
    if (E / "arms" / arm / "hooks.json").exists():
        hook_path = root / ".cfg" / "hooks" / "context.py"
        shutil.copy(E / "instrument" / "hooks" / "context.py", hook_path)
        shutil.copy(
            E / "arms" / arm / "context.txt", root / ".cfg" / "hooks" / "context.txt"
        )
        raw = (
            (E / "arms" / arm / "hooks.json")
            .read_text()
            .replace("__HOOK__", str(hook_path))
        )
        settings["hooks"] = json.loads(raw)
        (root / "context.log").write_text(
            json.dumps(
                {
                    "event": "PreToolUse",
                    "tool": "Write",
                    "file_path": str(proj / "test/x.test.ts"),
                    "matched": True,
                    "injected": True,
                    "t": 0,
                },
                sort_keys=True,
            )
            + "\n"
        )
    (root / ".cfg" / "settings.json").write_text(
        json.dumps(settings, indent=1, sort_keys=True) + "\n"
    )

    man[rid] = {
        "variant": arm,
        "rep": rep,
        "root": str(root),
        "model": "opus[1m]",
        "started": "1970-01-01T00:00:00+00:00",
        "cairn": "/home/guy/.nvm/versions/node/v22.14.0/bin/cairn",
        "cairn_version": CAIRN_VERSION,
        "cairn_target": "/x/dist/cli/index.js",
        "hooked": "hooks" in settings,
    }

(E / "MANIFEST.json").write_text(json.dumps(man, indent=1, sort_keys=True) + "\n")
print(" ".join(r[0] for r in RUNS))
