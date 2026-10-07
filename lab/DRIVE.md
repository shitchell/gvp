# DRIVE — the live board

> The one page a steer turn reads first and writes last. **Open questions for the
> maintainer on top**, then what is in flight, then a short log. Created
> 2026-10-07 because `lab/prompts/steer.md` and `lab/briefs/0001` both referenced
> "the DRIVE dashboard" and no such file existed — every steer turn was told to
> write questions into something that was not there.
>
> Everything here is a pointer. The durable records stay where they belong:
> directions in [`LEDGER.md`](LEDGER.md), forks in [`PATHS.md`](PATHS.md),
> results in [`reviews/`](reviews/), evidence in [`../experiments/`](../experiments/).

## Questions for the maintainer

Nothing blocking. Three things waiting on a decision rather than on work:

1. **PA-16 — schedule the steer turn?** `lab/bin/steer` is cron-ready and
   stateless. Activating it spawns unattended `--dangerously-skip-permissions`
   sessions, which is your call and nobody else's. Parked until you say go.
2. **PA-21 — should trial snapshots be tracked?** They are the only real
   known-answer corpus the lab has (~54 artifact sets across four trials), they
   are gitignored, and trial 5's scorer licence silently scored zero of them on
   its first run before that was caught. Options in musing 0019: commit the
   trees, commit a derived answer key per trial, or state plainly that licences
   are machine-local. Touches every trial directory, so not a design unit's call.
3. **PA-23 — a category for elements that assert facts.** `ai-common:P3` and `C3`
   are empirical claims about agents, not preferences about code, and trial 5
   tests them. A principle that asserts a fact is falsifiable; one that asserts a
   preference is not. Does that distinction belong in `cairn`'s categories?
   (Related: musing 0013, PA-17.)

Parked and *not* to be un-parked without you: PA-14 (P0004 clustering, "not
yet"), PA-15 (adopting proposals — waiting on exactly the numbers trial 5 will
produce), PA-16.

## In flight

| what | state | next |
|---|---|---|
| **Trial 5 — delivery** (`experiments/2026-10-delivery-cr1`) | **declared; instrument licensed** — scorer 12/12 real snapshots, gate 41/41 mutations, harness verified live in all four arms. Nothing dispatched | brief 0002: pilot the `L2` arm alone, then the batch |
| Trial 4b family (PA-02/03/04) | queued behind trial 5 | — |
| Proposal 0001 (seven patches, blind-verified) | awaiting your review; adoption parked (PA-15) | — |

## Log

- **2026-10-07** — Trial 5 declared and instrumented (PA-01 taken). Four defects
  caught before dispatch, the worst being a harness that delivered nothing in all
  three hooked arms while looking healthy. PA-05 unfolded from PA-01 on structural
  grounds; five new paths deposited (PA-19…PA-23); musings 0017–0019 opened;
  protocol §4 gained four channel rows and §6 a reuse block.
- **2026-10-07 (earlier)** — Entry points built (`lab/bin/steer`, `lab/bin/work`);
  "done" corrected to "closes"; brief 0001 queued.
