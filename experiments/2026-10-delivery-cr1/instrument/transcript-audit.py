#!/usr/bin/env python3
"""Did the run go looking? The open channels, measured rather than assumed.

Trial 1 could only say "silence is not evidence of absence". Every run here is
recorded with `--output-format stream-json`, so every tool call and every tool
result is on disk and can be searched.

Trial 5's open channel is new and cannot be closed by construction: L0 has no
hook and the other three do, so the delivery mechanism is visible to a run that
goes looking for it. This script is how that channel is reported instead:

  - did the run read its own Claude config dir, the hook script, or the payload?
  - did the run read anything outside its project tree at all?
  - did the hook's own log leak into the run's view?
  - and the confirmation side: the framing sentence must appear in every hooked
    run's transcript and in NO ambient run's.

As in trial 3, what a run DELIBERATELY targeted (its own tool-call inputs) is
separated from what it was merely SHOWN (tool output): two of trial 2's runs
tripped the first version of that gate on text `npm ls -g` printed at them.

usage: transcript-audit.py <experiment-dir>
"""
import json
import pathlib
import sys

E = (
    pathlib.Path(sys.argv[1]).resolve()
    if len(sys.argv) > 1
    else pathlib.Path(__file__).parent.parent
)
man = json.loads((E / "MANIFEST.json").read_text())

FRAMING = "The project's guiding library states:"
HOOKED = {"L1", "L2", "L2n"}

HARD = [
    (str(pathlib.Path.home() / ".gvp"), "read the machine-wide GVP store"),
    ("shitchell/gvp", "reached the gvp repository"),
    ("manipulation-check", "reached a prior experiment"),
    ("directive-cr1", "reached a prior experiment"),
    ("contested-axis", "reached a prior experiment"),
    ("strict-typing-cp7", "reached a prior experiment"),
    ("delivery-cr1", "reached this experiment's own directory"),
]
# Not contamination, but the open channel this trial has to report honestly.
DELIVERY_PEEK = [
    (".cfg/settings.json", "read its own settings file"),
    (".cfg/hooks", "read the hook directory"),
    ("context.py", "read the hook script"),
    ("context.txt", "read the payload file"),
    ("context.log", "read the hook's log"),
]
SOFT = [
    "git diff",
    "git log",
    "libs search",
    "libs list",
    "cairn inspect",
    "cairn query",
]

rows = {}
fails = []
for rid, m in man.items():
    log = pathlib.Path(m["root"]) / "run.jsonl"
    if not log.exists():
        rows[rid] = {"error": "no transcript"}
        fails.append(rid)
        continue
    blob, inputs = [], []
    for line in log.read_text(errors="ignore").splitlines():
        try:
            ev = json.loads(line)
        except Exception:
            continue
        blob.append(json.dumps(ev))
        msg = ev.get("message") or {}
        for part in msg.get("content") or []:
            if isinstance(part, dict) and part.get("type") == "tool_use":
                inputs.append(json.dumps(part.get("input", {})))
    text = "\n".join(blob)
    intent = "\n".join(inputs)
    root = m["root"]
    arm = m["variant"]

    hard = [why for needle, why in HARD if needle in intent]
    shown = [why for needle, why in HARD if needle in text and needle not in intent]
    siblings = [o["root"] for oid, o in man.items() if oid != rid and o["root"] in text]
    peeked = [why for needle, why in DELIVERY_PEEK if needle in intent]
    # anything the run targeted inside its own root but outside its project
    outside = [
        s
        for s in (
            f"{root}/.cfg",
            f"{root}/.registry",
            f"{root}/.home",
            f"{root}/context.log",
        )
        if s in intent
    ]
    framing_seen = FRAMING in text

    rows[rid] = {
        "arm": arm,
        "bytes": len(text),
        "reached_real_library": hard,
        "merely_shown": shown,
        "reached_sibling_runs": siblings,
        "inspected_delivery_mechanism": peeked,
        "targeted_outside_its_project": outside,
        "payload_framing_in_transcript": framing_seen,
        "noted": [s for s in SOFT if s in text],
    }

    # contamination
    if hard or siblings:
        fails.append(rid)
    # delivery confirmation: the transcript's own account of what was delivered
    if arm in HOOKED and not framing_seen:
        rows[rid]["ERROR"] = "a hooked run whose transcript never shows the payload"
        fails.append(rid)
    if arm not in HOOKED and framing_seen:
        rows[rid]["ERROR"] = "an ambient run whose transcript shows an injected payload"
        fails.append(rid)

print(json.dumps(rows, indent=1, sort_keys=True))
peek = sorted({r for r, v in rows.items() if v.get("inspected_delivery_mechanism")})
print(
    f"\nruns that inspected the delivery mechanism (open channel, reported not closed): "
    f"{len(peek)}/{len(rows)} {peek}",
    file=sys.stderr,
)
print(
    f"{'ALL CLEAR' if not fails else 'PROBLEM: ' + ', '.join(sorted(set(fails)))}",
    file=sys.stderr,
)
sys.exit(1 if fails else 0)
