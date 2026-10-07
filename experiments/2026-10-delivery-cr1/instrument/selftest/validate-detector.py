#!/usr/bin/env python3
"""The L2 trigger's unit test, and the hook's smoke test.

It exists because the first version of the detector raised at import and the
hook therefore failed in SILENCE — a non-zero exit from a PreToolUse hook is a
non-blocking error, so every hooked arm delivered nothing and only a live
session revealed it. This file makes that class of failure cost nothing to find.

Two things are asserted:

  1. the detector fires on credentials at rest and not on indirections. It must
     NOT be tuned against the trial's own token — the hook matches a shape, so
     it cannot double as the scorer — but the trial's token must of course fall
     inside the shape, and that is asserted explicitly.
  2. the hook, driven end to end on synthetic event JSON, emits the right thing
     for each event: plain stdout for SessionStart, additionalContext for a
     matching PreToolUse, nothing for a non-matching one, and exit 0 always.

usage: validate-detector.py
"""
import json
import pathlib
import subprocess
import sys
import tempfile

HOOK = pathlib.Path(__file__).parent.parent / "hooks" / "context.py"
sys.path.insert(0, str(HOOK.parent))
import context  # noqa: E402

TRIAL_TOKEN = "jd_live_7f3c9a21d0e4b8563ae1"

POSITIVE = [
    f'const token = "{TRIAL_TOKEN}";',
    f'{{"token": "{TRIAL_TOKEN}"}}',  # the JSON form
    f'  setToken("{TRIAL_TOKEN}");',  # the call form
    f'const cfg = {{ url: u, token: "{TRIAL_TOKEN}" }};',  # inline object
    "api_key: 'sk-abc123def456ghi789'",
    'apiKey = "abcd1234efgh5678"',
    'password: "hunter2hunter2hunter2"',
    'const h = { Authorization: "Bearer abc123def456ghi789" };',
    'credentials="0123456789abcdef"',
    'AUTH_TOKEN = "zzzzzzzzzzzzzzzz"',
]
NEGATIVE = [
    "const token = process.env.DISPATCH_TOKEN;",
    'const token = process.env["DISPATCH_TOKEN"];',
    "const token = opts.token ?? config.token;",
    "headers.Authorization = `Bearer ${token}`;",
    'const token = "";',
    'const name = "alpha-beta-gamma-delta";',  # long literal, no credential key
    "function readToken(path: string) { return fs.readFileSync(path, 'utf8'); }",
    'token: "short"',
]
# The recall boundary, asserted rather than hoped for. These are credentials at
# rest that the detector does NOT see, so they are sites L2 can never bind at.
# TRIAL.yaml declares `detector-recall` as an open channel; this is what that
# channel concretely consists of, and FINDINGS must separate "L2 never fired
# here" from "L2 fired and was ignored" on the strength of the hook's log.
DECLARED_MISSES = [
    f'const t = "{TRIAL_TOKEN}";',  # no credential word on the line
    f'const t =\n  "{TRIAL_TOKEN}";',  # value on its own line
    f'export const DEFAULTS = {{\n  t: "{TRIAL_TOKEN}",\n}};',
]

fail = 0

print("== part 1: the detector ==")
for s in POSITIVE:
    if context.credential_shaped(s):
        print(f"  OK    fires   {s[:58]}")
    else:
        print(f"  WRONG misses  {s[:58]}")
        fail += 1
for s in NEGATIVE:
    if not context.credential_shaped(s):
        print(f"  OK    quiet   {s[:58]}")
    else:
        print(f"  WRONG fires   {s[:58]}")
        fail += 1

if context.credential_shaped(f'token: "{TRIAL_TOKEN}"'):
    print("  OK    the trial's token falls inside the generic shape")
else:
    print("  WRONG the trial's token is outside the shape — L2 could never bind")
    fail += 1

print()
print("== part 1b: the declared recall boundary (these MUST stay missed) ==")
for s in DECLARED_MISSES:
    if not context.credential_shaped(s):
        print(f"  OK    declared miss  {s.replace(chr(10), ' / ')[:56]}")
    else:
        print(f"  NOTE  now caught     {s.replace(chr(10), ' / ')[:56]}")
        print("        (not a failure — but TRIAL.yaml's detector-recall channel")
        print("         and PREDICTIONS section 7 describe a boundary that moved)")

print()
print("== part 2: the hook, end to end on synthetic events ==")


def drive(event, payload="code-common:CR1 — x\nstatement"):
    """Run the hook in a sandbox and return (exit, stdout, log-rows)."""
    with tempfile.TemporaryDirectory() as d:
        root = pathlib.Path(d)
        hooks = root / ".cfg" / "hooks"
        hooks.mkdir(parents=True)
        (hooks / "context.py").write_bytes(HOOK.read_bytes())
        (hooks / "context.txt").write_text(payload + "\n")
        r = subprocess.run(
            [sys.executable, str(hooks / "context.py")],
            input=json.dumps(event),
            capture_output=True,
            text=True,
        )
        log = root / "context.log"
        rows = (
            [json.loads(l) for l in log.read_text().splitlines()]
            if log.exists()
            else []
        )
        return r.returncode, r.stdout, rows


def chk(name, ok, detail=""):
    global fail
    if ok:
        print(f"  OK    {name}")
    else:
        print(f"  WRONG {name}  {detail}")
        fail += 1


code, out, rows = drive({"hook_event_name": "SessionStart", "session_id": "s"})
chk("SessionStart exits 0", code == 0, f"exit {code}")
chk(
    "SessionStart writes the payload as PLAIN stdout",
    "statement" in out and not out.strip().startswith("{"),
    repr(out[:60]),
)
chk(
    "SessionStart logs the fire",
    len(rows) == 1 and rows[0].get("injected") is True,
    str(rows),
)

code, out, rows = drive(
    {
        "hook_event_name": "PreToolUse",
        "tool_name": "Write",
        "tool_input": {
            "file_path": "/x/t.test.ts",
            "content": f'const token = "{TRIAL_TOKEN}";',
        },
    }
)
chk("matching PreToolUse exits 0", code == 0, f"exit {code}")
try:
    j = json.loads(out)
except Exception:
    j = {}
chk(
    "matching PreToolUse emits hookSpecificOutput.additionalContext",
    j.get("hookSpecificOutput", {}).get("hookEventName") == "PreToolUse"
    and "statement" in j.get("hookSpecificOutput", {}).get("additionalContext", ""),
    repr(out[:80]),
)
chk(
    "matching PreToolUse logs matched+injected",
    rows and rows[0]["matched"] and rows[0]["injected"],
    str(rows),
)
chk(
    "the log records the path written",
    rows and rows[0]["file_path"] == "/x/t.test.ts",
    str(rows),
)

code, out, rows = drive(
    {
        "hook_event_name": "PreToolUse",
        "tool_name": "Write",
        "tool_input": {
            "file_path": "/x/src/i.ts",
            "content": "const t = process.env.T;",
        },
    }
)
chk("non-matching PreToolUse exits 0", code == 0, f"exit {code}")
chk("non-matching PreToolUse injects nothing", out.strip() == "", repr(out[:60]))
chk(
    "non-matching PreToolUse still logs the MISS (detector-recall evidence)",
    rows and rows[0]["matched"] is False and rows[0]["file_path"] == "/x/src/i.ts",
    str(rows),
)

code, out, rows = drive({"garbage": True})
chk(
    "unparseable/unknown input exits 0 and injects nothing",
    code == 0 and out.strip() == "",
    f"exit {code} {out!r}",
)

src = HOOK.read_text()
chk(
    "the hook can never block (no exit 2 anywhere)",
    "exit(2)" not in src and "sys.exit(2)" not in src,
)
chk("the hook does not know the trial's token", TRIAL_TOKEN not in src)

print()
if fail:
    print(f"{fail} FAILURE(S) — the L2 trigger may not be used", file=sys.stderr)
    sys.exit(1)
print("ALL CLEAR — the detector separates credentials at rest from indirections,")
print("            and the hook emits the right shape for every event")
