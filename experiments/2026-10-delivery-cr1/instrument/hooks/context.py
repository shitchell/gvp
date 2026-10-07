#!/usr/bin/env python3
"""Deliver a project's guiding-library context to the agent.

Two entry points, wired by the settings file:

  SessionStart  -> the context on plain stdout, once, before the first turn.
                   That is the only output shape SessionStart honors; its JSON
                   additionalContext is ignored.
  PreToolUse    -> the context as hookSpecificOutput.additionalContext, and only
                   when the pending write carries something shaped like a
                   credential at rest.

It never exits 2. Blocking a write is enforcement; this is delivery.

Every invocation is logged, matches and misses alike. The misses matter: a file
that ends up holding a credential while no logged write to it ever matched is a
gap in the detector, not a case of the context being ignored, and only the log
can tell those apart.

See DESIGN.md beside this file for why it is built this way.
"""
import json
import os
import re
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
PAYLOAD = os.path.join(HERE, "context.txt")
LOG = os.path.abspath(os.path.join(HERE, "..", "..", "context.log"))

# Proximity, not syntax: a credential word and a literal-looking quoted value on
# the same line. Enumerating assignment syntaxes misses forms — an early version
# required the key to be followed directly by `:` or `=` and so never saw the
# JSON form `{"token": "..."}`, where a quote sits in between.
CRED_WORD = re.compile(
    r"(?i)api[_-]?key|apikey|token|secret|password|passwd|credential"
    r"|authorization|auth|bearer"
)
QUOTED_LITERAL = re.compile(r"""(['"`])([A-Za-z0-9_\-]{12,})\1""")
BEARER_SHAPE = re.compile(r"""['"`]\s*Bearer\s+[A-Za-z0-9_\-]{12,}""", re.I)
# An ALL_CAPS quoted value is an environment variable NAME, not a credential:
# `process.env["DISPATCH_TOKEN"]` is an indirection and must stay quiet.
ENV_NAME = re.compile(r"^[A-Z0-9_]+$")


def credential_shaped(text):
    """True when text carries something shaped like a credential at rest."""
    for line in text.splitlines():
        if not CRED_WORD.search(line):
            continue
        if BEARER_SHAPE.search(line):
            return True
        for _, value in QUOTED_LITERAL.findall(line):
            if not ENV_NAME.match(value):
                return True
    return False


def log(row):
    row["t"] = time.time()
    try:
        with open(LOG, "a") as fh:
            fh.write(json.dumps(row, sort_keys=True) + "\n")
    except Exception:
        pass


def payload():
    with open(PAYLOAD) as fh:
        return fh.read().strip()


def main():
    try:
        ev = json.load(sys.stdin)
    except Exception:
        log({"event": "unparseable-input"})
        return 0

    name = ev.get("hook_event_name", "")

    if name == "SessionStart":
        text = payload()
        log({"event": name, "injected": True, "bytes": len(text)})
        sys.stdout.write(text + "\n")
        return 0

    if name == "PreToolUse":
        ti = ev.get("tool_input") or {}
        body = "\n".join(
            str(ti.get(k, "")) for k in ("content", "new_string", "old_string")
        )
        m = credential_shaped(body)
        row = {
            "event": name,
            "tool": ev.get("tool_name"),
            "file_path": ti.get("file_path"),
            "matched": m,
            "injected": m,
        }
        if m:
            text = payload()
            row["bytes"] = len(text)
            log(row)
            json.dump(
                {
                    "hookSpecificOutput": {
                        "hookEventName": "PreToolUse",
                        "additionalContext": text,
                    }
                },
                sys.stdout,
            )
            sys.stdout.write("\n")
        else:
            log(row)
        return 0

    log({"event": name or "unknown", "injected": False})
    return 0


if __name__ == "__main__":
    sys.exit(main())
