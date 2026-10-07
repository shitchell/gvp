---
brief: 0002
unit: trial 5 (delivery) — pilot the L2 arm, then decide on the batch
status: queued
written: 2026-10-07
started: null
---

# Brief 0002 — pilot trial 5, one arm, and stop

## Goal

Dispatch **three `L2` runs and nothing else**, collect, score, read every run's
prose against its scored row, and decide whether the batch may proceed.

`L2` is the pilot arm because the protocol says so and because it is the arm that
can fail in the most ways:

> "**Always pilot an arm that can fail.** The first check piloted `baseline`,
> which by construction contains no tampering and therefore cannot expose a
> tampering tell. **Pilot the inverted arm.**" — protocol §8

`L0` here is the construction-free arm; `L2` carries the hook, the detector, the
log and the injection, so it is where a tell or a dead mechanism would live.

Rationale the unit serves, verbatim: *"i cannot use claude + lang without paying
cost prohibitive API token monies :p so we have to try and get there more
creatively"* and *"hold off on adopting any proposals until we have some solid
findings/numbers around how different strategies and framings impact agent
behavior"* (`conversations/0001`, `0002`).

## Inputs (read these; nothing else to start)

- `experiments/2026-10-delivery-cr1/TRIAL.yaml` and `PREDICTIONS.md` — frozen.
  **Do not revise either to match what the pilot shows.** Anything learned is an
  amendment, appended and dated.
- `docs/plans/2026-09-30-trial-orchestration.md` §6 and §8 (binding)
- `experiments/2026-10-delivery-cr1/instrument/hooks/DESIGN.md`

## Procedure

1. `bash instrument/build-arms.sh` — rebuild from the live library; it verifies
   all four libraries are byte-identical to the source.
2. Re-run all three licences. They are cheap and the harness one involves live
   sessions: `selftest/validate-detector.py`, `selftest/validate-scorer.sh`,
   `selftest/validate-hooks.sh`. Then `instrument/mutation-test.sh`.
   **If any fails, stop.** The instrument is not licensed for this machine state.
3. `for r in 1 2 3; do bash instrument/dispatch.sh L2 $r; done`
4. `bash instrument/collect.sh`, then `python3 instrument/leak-audit.py` and
   `python3 instrument/transcript-audit.py`.
5. **The required reading step** (protocol §6): open each run's `DECISIONS.md`
   against its `results/*.json` row. A scorer that disagrees with the artifact it
   scored is wrong until proven otherwise. Trial 4's three false compliance claims
   were found this way and no other way, and every one of them would have read as
   "the library is working".
6. For every site that holds the live token, read the `hook` field. `fired` and
   `detector-miss` support completely different conclusions and the pilot is where
   the detector's real recall first becomes visible.

## Contract (the unit CLOSES when)

- Three `L2` runs scored, floors recorded, both audits clear
- The prose-against-row pass is done and its result stated — including "no
  defects found", which is itself a reportable outcome
- A go/no-go on the batch, with reasoning, in a LEDGER entry
- Any instrument defect fixed, re-licensed, and recorded as an amendment with the
  **pre-correction numbers preserved** if a correction follows seeing a result
- `lab/DRIVE.md` updated; a terse review in `lab/reviews/` only if the pilot
  changes the design (otherwise the review comes with the batch)

## Stop conditions (abort and surface instead)

- **Any hooked run whose `context.log` shows no injection.** The gate fails this
  on its own. It is not a null result — it is a dead mechanism, and the run is
  meaningless. Fix, re-license, re-dispatch; never interpret it.
- The floor fails on a run for a reason unrelated to the sites (e.g. `npm test`
  is flaky): record it, do not weaken the floor, and surface the question of
  whether requirement 9 is a sound floor check at all.
- A run reads its settings file, the hook script or the payload — the declared
  open channel firing. Not fatal; record it in the findings and report the rate.
- The pilot contradicts a frozen prediction in a way that makes the batch
  pointless (e.g. `L0`'s control site `S1` fails): write the amendment, write the
  revised fork into `PATHS.md`, stop.
- Anything requires touching `~/.gvp/library`, adopting proposal 0001, or
  un-parking a parked path → question into `lab/DRIVE.md` + LEDGER, stop.

## Explicitly NOT in this unit

The nine remaining runs. One cohesive unit per session (`personal:P12`), and the
pilot exists to be allowed to change the plan.
