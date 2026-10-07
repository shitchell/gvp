# Operations — how units launch without losing the plot

> How new trials/probes start, run, and hand back — designed for either a
> minimal-context orchestrator or headless one-shot sessions ("or both" —
> the maintainer, `conversations/0002`). The invariants come first because
> they are the actual requirements; the tiers are just ways to satisfy them.

## Invariants (what any launch mechanism must preserve)

1. **Intention** — every unit starts from a BRIEF that quotes the rationale
   it serves (maintainer quotes from `conversations/`, or the LEDGER entry
   that picked its path). No unit runs on vibes inherited from a dead
   context window.
2. **Self-amendment** — the model stays versioned: units may append
   musings, PREDICTIONS amendments, and probe files freely; only a *steer*
   step edits README/PATHS/OPERATIONS, and records why in the LEDGER.
3. **Findings discipline** — a unit **closes** (bookkeeping sense:
   reportable, auditable, reopenable — never "done": *"when is
   experimentation and review ever truly done?"* — the maintainer,
   2026-10-07) when: FINDINGS (trial) or the probe file's Result+Reflection
   are written, `REGISTER.md`/`PATHS.md` updated, a LEDGER entry exists, and
   a terse maintainer review (`reviews/NNNN`) is filed. Unclosed work can't
   be steered from, which is the only force this carries.
4. **Context economy** — workers load the minimum stack (below), delegate
   bulk reads to subagents, and never load prior transcripts. The protocol's
   §2 list stays authoritative for trials.

## Branch & worktree rules (so nobody has to care what's checked out)

Units run in `.worktrees/<name>` on a branch created **explicitly from
`main`** — never from HEAD — so a session's work is insensitive to whatever
branch the maintainer happens to be on. The primary checkout is never
`git checkout`-ed by a session; if it isn't on `main` at merge time, the
merge happens through a temporary worktree of `main` instead. Branch naming:
`experiment/*`, `lab/*`, `docs/*`, `fix/*`; merged `--no-ff`, pushed,
worktree removed, branch kept as the record.

## The minimum stack, by role

| role | loads | writes |
|---|---|---|
| **steer** (pick next path, write briefs, amend model) | `lab/DRIVE.md` · `lab/README.md` · `lab/PATHS.md` · `lab/LEDGER.md` (top N) · latest `reviews/` | BRIEF · LEDGER entry · PATHS/README amendments · DRIVE update |
| **trial worker** (one phase per session, per `personal:P12`) | its BRIEF · protocol · TRIAL.yaml/PREDICTIONS for its trial · REGISTER | instrument/runs/FINDINGS/amendments · musings |
| **probe worker** | its BRIEF · the musing it tests | probe file · musing updates |

## BRIEF.md — the handoff unit

One file per launched unit, written by the steer step, containing exactly:
**goal** (one sentence + the rationale quote), **inputs** (exact file list —
the minimum stack), **contract** (the invariant-3 done-list), **constraints**
(protocol sections that bind; what the unit may NOT touch), **stop
conditions** (what aborts the unit and surfaces to the maintainer instead).
A fresh `claude -p "$(cat BRIEF.md)"` or an Agent-tool worker must be able
to run from it alone.

## The two tiers (both noted, per the fork-noting rule)

- **A — resident minimal-context orchestrator:** one long session holding
  only the steer stack, spawning workers as subagents, absorbing their
  reports. *For:* tight feedback, mid-unit judgment calls. *Against:* the
  steer context still accretes; a crash loses the thread; it re-implements
  what HANDOFF + this directory already give any fresh session.
- **B — headless phase-sessions + thin steer (recommended first):** each
  unit phase is its own `claude -p` session launched from a BRIEF; between
  units, a steer session (manual today; cron-able as PA-16) reads
  PATHS/LEDGER/reviews and writes the next BRIEF or stops. *For:* matches
  `personal:P12` (one cohesive unit per session), crash isolation, honest
  context resets, and the repo itself is the memory — which the lab already
  proved works (this directory was built across exactly such resets).
  *Against:* no mid-unit steering; briefs must be good.

Recommendation: **B now, A never ruled out** — if briefs prove too lossy for
trial-grade work, tier A's orchestrator is the fallback and PATHS gets the
row. Automating B's steer step with cron is PA-16, **parked until the
maintainer okays unattended session-spawning.**

## Entry points (what actually starts a session)

| you want | run |
|---|---|
| one steer turn, headless (pick/execute next unit) | `lab/bin/steer` |
| run a specific queued brief | `lab/bin/work lab/briefs/NNNN-*.md` |
| the same thing interactively | start `claude` in the repo and paste `lab/prompts/steer.md` (or just say "take a steer turn for the lab") |
| scheduled/unattended | **PA-16, parked** — the scripts are cron-ready (`lab/bin/steer` is idempotent per turn; state lives in the repo), but activating a schedule spawns unattended `--dangerously-skip-permissions` sessions and that is the maintainer's call |

Session logs land in `lab/.runs/` (gitignored). The scripts hold no state —
kill one anytime; the repo is the memory and the next turn re-derives.

## The board

`lab/DRIVE.md` is the dashboard this document and `prompts/steer.md` both
referred to before it existed — maintainer questions on top, what is in flight,
a short log. A steer turn reads it first and writes it last; it holds pointers
only, never records (those live in LEDGER/PATHS/reviews).

## Today's manual equivalent

Until PA-16: the driver session plays both roles, but *acts* them
separately — steer moments write LEDGER/PATHS/briefs before worker moments
execute them. The overnight run already followed this shape informally; this
document makes it checkable.
