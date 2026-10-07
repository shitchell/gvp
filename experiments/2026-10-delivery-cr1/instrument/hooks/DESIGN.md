# Why `context.py` is built this way

The rationale lives here rather than in the script because **the script is
copied into every hooked run's config directory and the run can read it.** A
docstring that said "L1 arm", "the null arm" or "this trial" would hand any
curious run the experiment's design — the gate (`leak-audit.py`) asserts the
script names no arm, layer or trial, and it caught exactly that on the first
version. This file is never copied anywhere.

## One script, three hooked arms

The arm is determined entirely by two things outside the script:

| arm | wired to | `context.txt` holds |
|---|---|---|
| `L1` | `SessionStart` | `code-common:CR1` |
| `L2` | `PreToolUse` on `Write\|Edit` | `code-common:CR1` |
| `L2n` | `PreToolUse` on `Write\|Edit` | `code-web:WP3` |

`L0` gets neither the script nor a payload. Keeping the script byte-identical
across arms is what makes "timing is the only variable between L1 and L2" and
"payload is the only variable between L2 and L2n" assertable rather than
asserted — `build-arms.sh` and the gate both check it.

## Why it informs rather than blocks

A `PreToolUse` hook that exits 2 refuses the write. A refusal produces
compliance trivially, so it measures **enforcement** — an L3 gate wearing an L2
costume — and says nothing about whether delivery *steers*. The gate asserts
there is no `exit(2)` anywhere in the script.

## Why the detector must not know the trial's token

If the hook matched `jd_live_7f3c9a21d0e4b8563ae1`, it would be the scorer:
L2's compliance would be an artifact of the instrument recognising its own
needle. It matches a *shape* instead, so its recall is a real property of the
delivery mechanism being tested, and the gate asserts the literal appears
nowhere in the script.

`selftest/validate-detector.py` pins both the shapes it catches and — as
`DECLARED_MISSES` — the ones it does not. Those misses are what
`TRIAL.yaml`'s `detector-recall` open channel concretely consists of.

## Why every invocation is logged, including the misses

The log is the only thing that can separate two findings that look identical in
the artifacts:

- **detector miss** — a credential came to rest at a site, and no write to that
  site ever matched. L2 never bound there. Nothing about steering follows.
- **fired and ignored** — a write to that site matched, the element was
  delivered at that moment, and the credential is there anyway. That is a real
  negative result about bind-time delivery.

`score.mjs` does that cross-reference per site (`hook: fired |
detector-miss | no-write-logged`), and `validate-scorer.sh` part 3 licenses it.

## The silent-failure lesson

The first version of the detector raised at import, because it used a
backreference across an alternation and numbered it wrong. A non-zero exit from
a `PreToolUse` hook is a **non-blocking error**: Claude Code continued, nothing
was injected, no error surfaced anywhere, and all three hooked arms delivered
exactly nothing. The live harness check caught it only because it asks the model
to report what it was shown.

Two guards came out of that, and both must stay:

1. `selftest/validate-detector.py` — drives the script end to end on synthetic
   event JSON, so this class of failure costs nothing to find.
2. `leak-audit.py`'s delivery check — every hooked run's `context.log` must show
   at least one injection, or that run's result is meaningless rather than null.
