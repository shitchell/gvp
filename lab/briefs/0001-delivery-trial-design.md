---
brief: 0001
unit: delivery trial (PA-01 + PA-05) — design & instrument phase
status: closed
written: 2026-10-07
started: 2026-10-07
closed: 2026-10-07
review: lab/reviews/0008-trial-5-delivery-design.md
---

# Brief 0001 — design the delivery trial, up to a licensed instrument

## Goal

Declare and instrument trial 5: does the DELIVERY layer change steering?
Same guiding content delivered as (L0) the standard CLAUDE.md pointer, (L1)
session-start injection of the relevant elements, (L2) a reactive injection
at the moment the governed act happens — plus the preamble arm (PA-05:
library shipped with/without the "Reading this library" section — note it
exists only in proposal 0001's copy; the LIVE library has no preamble and
the trial must not require adopting it).

Rationale this serves, verbatim: *"i cannot use claude + lang without paying
cost prohibitive API token monies :p so we have to try and get there more
creatively"* and *"hold off on adopting any proposals until we have some
solid findings/numbers around how different strategies and framings impact
agent behavior"* (conversations/0001, /0002 context). This trial's output is
that unlock condition.

## Inputs (read these; nothing else to start)

- docs/plans/2026-09-30-trial-orchestration.md (the protocol — binding)
- docs/plans/2026-10-06-delivery-and-integration-roadmap.md §3, §6
- experiments/REGISTER.md
- experiments/2026-10-strict-typing-cp7/FINDINGS.md §6 (habit-domain
  requirement; report-vs-artifact discipline)
- lab/musings/0014, 0015 (preamble observables: improvised-precedence rate
  and direction)
- experiments/2026-09-directive-cr1/ instrument (reuse skeleton: CR1 is the
  proven steering element — a delivery trial wants an element KNOWN to steer
  at L0, so delivery differences are measurable in both directions)

## Design constraints the inputs already settle

- Element under test: `code-common:CR1` (steers at L0, trial 2) — delivery
  is the variable, content constant across arms.
- Must include ONE habit-domain observable alongside the decision-domain
  forks (trial 4's §6), so the trial can say whether ANY delivery layer
  moves a habit.
- Hook output is a contamination channel: checksummed per arm, gate-asserted.
- Elements injected at L1/L2 must be byte-identical to the library copies.
- Standing rules: independent re-enumeration of the axis before declaring;
  blind re-check after any library-copy edit; artifacts, never self-reports.

## Contract (the unit CLOSES when)

- TRIAL.yaml + PREDICTIONS.md frozen (arms, forks, channels, decision rule)
- Variants/harness built; gate extended + mutation-tested; scorer licensed
  against known-answer artifacts BEFORE any run
- All committed on a worktree branch, merged to main, pushed
- LEDGER entry + dashboard update
- STOP before dispatching the pilot — dispatching is the next unit's brief
  (one cohesive unit per session, personal:P12)

## Stop conditions (abort and surface instead)

- The re-enumeration or channel work contradicts the design → record what
  you found (musing or amendment), write the revised fork into PATHS, stop.
- Anything requires touching ~/.gvp/library, adopting proposal 0001, or
  un-parking a parked path → question into the dashboard + LEDGER, stop.
- Instrument cannot be licensed (scorer fails known-answer validation after
  two honest attempts) → stop with the failure recorded; do not weaken the
  validation.


---

## Closed 2026-10-07

Contract met: `TRIAL.yaml` + `PREDICTIONS.md` frozen; arms, harness, gate, floor,
scorer and both audits built; **scorer licensed against trial 2's twelve real
snapshots (12/12) before any run**, gate mutation-tested 41/41, harness verified
live in all four arms. Stopped before the pilot, per `personal:P12` — dispatch is
brief 0002. Review: `lab/reviews/0008`.

**One deviation from this brief, deliberate and recorded.** It asked for the
preamble arm (PA-05) to be folded in. It cannot be: PA-05's observable is
improvised *category precedence*, which needs a contested axis, while a delivery
trial needs an element that owns its axis so the manipulation is attributable —
and `CR1` is a sole owner. The two cannot be the same element. PA-05 returned to
`PATHS.md` as a trial of its own (trial 3's instrument is the natural base);
reasoning in `PREDICTIONS.md` Amendment 2 and the LEDGER.

**One design assumption in this brief turned out to be half true.** It wanted
"an element KNOWN to steer at L0, so delivery differences are measurable in both
directions". `CR1` steers at L0 *on the artifact it names* — 3/3, a ceiling with
no headroom — and fails beyond it. So the trial measures **radius across four
sites**, not flip, and the headroom is the site trial 2 found by accident.
