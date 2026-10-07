# The lab — methodology for the GVP efficacy & integration effort

> The thinking layer for the research effort tracked in **#42** (does changing
> an element change outcomes?) and the
> [delivery & integration roadmap](../docs/plans/2026-10-06-delivery-and-integration-roadmap.md)
> (hooks, injections, the zero-token contract). The **evidence layer** stays
> where it is: trials and their instruments live in
> [`experiments/`](../experiments/), the population picture in
> [`experiments/REGISTER.md`](../experiments/REGISTER.md), the trial protocol
> in [`docs/plans/2026-09-30-trial-orchestration.md`](../docs/plans/2026-09-30-trial-orchestration.md).
> This directory holds what those deliberately exclude: questions, hunches,
> reflections, and the running record of *why we went each direction*.

## The model

Set by the maintainer, 2026-10-06:

> "organize thoughts / questions / musings / findings into a directory
> dedicated to this effort. we can throw subagents at small things we want to
> test, design plans around different musings. each test should be followed by
> reflection, additional musings/questions/findings/results/citations/notes...
> then reviewing all of the notes/musings and deciding the next direction to
> go from there"

and, in the same breath, made self-amending:

> "let the review include a review of this model in general to see 'do we need
> to add another type of thing we track or tweak how we're tracking something
> already (like results), re-organize this dir, change our steps, etc...'"

- **Status**: Accepted
- **Context**: solo maintainer + AI agents; scrappy-alpha repo; three trials
  and one survey already run before this directory existed
- **Rationale**: direct quotes above.

## The loop

```
muse ──► design ──► probe or trial ──► reflect ──► review ──► decide ──┐
  ▲                                      │            │                │
  └──── new musings spawned by ──────────┘            └── may amend ───┤
                                                          THIS MODEL   │
  ◄────────────────────────────────────────────────────────────────────┘
```

1. **Muse.** Any question, hunch, finding, or stray observation becomes a
   numbered file in [`musings/`](musings/). Capturing is free — no gate, no
   quality bar. A musing that turns out dumb gets `status: parked`, not
   deleted.
2. **Design.** A musing worth testing grows a *How to test* section in place.
   If the design outgrows the musing, it graduates to a trial pre-registration
   under `experiments/` — the protocol governs from there.
3. **Probe or trial.** Two tiers, and the distinction is the epistemic load-
   bearing wall of this whole directory:
   - **Probe** ([`probes/`](probes/)) — small, cheap, subagent-run, hours not
     days. Loose controls are fine *because nothing register-grade is ever
     claimed from one*. Probes generate and sharpen hypotheses.
   - **Trial** (`experiments/`) — full protocol: declared channels, frozen
     predictions, gates, floors, a REGISTER row. Trials confirm hypotheses.
   A probe result that looks important is a *reason to run a trial*, never a
   substitute for one.
4. **Reflect.** Mandatory, immediately after any probe or trial: what moved,
   what surprised, what broke in the instrument, which musings this spawns or
   updates, citations into the raw evidence. A probe's reflection lives in its
   own file; a trial's lives in its FINDINGS (defects + *what cannot be
   claimed*) plus a LEDGER entry for anything directional.
5. **Review & decide.** Read [`PATHS.md`](PATHS.md), [`LEDGER.md`](LEDGER.md)
   and the open musings; **deposit every candidate direction into PATHS
   first**, then pick; record the pick as a LEDGER entry *with the
   reasoning*, so the choice is auditable later even if it was wrong. Every unit
   **closes** with a terse quantified review in `reviews/` (template:
   `conversations/0002`) — the maintainer reads those, not the FINDINGS.
   Closed, not done: nothing here is ever done, units just become
   reportable and reopenable. **The review
   explicitly includes the model itself**: does the lab need a new tracked
   type, a change to how something is tracked, a reorganization, a different
   step? Methodology amendments are LEDGER entries like any other decision —
   this README is versioned, not sacred.

## Layout

| path | what | one-liner |
|---|---|---|
| `README.md` | this file | the methodology; amended via review |
| `DRIVE.md` | the live board | maintainer questions · in flight · log; a steer turn reads it first and writes it last |
| `LEDGER.md` | the direction log | dated decisions-of-direction and model amendments, newest first; **read this + open musings to steer** |
| `musings/NNNN-slug.md` | questions, hunches, findings | one thought per file; frontmatter carries status and lineage |
| `probes/NNNN-slug.md` | small cheap tests | design, raw result, reflection — one file per probe |
| `conversations/NNNN-slug.md` | maintainer conversations | verbatim rationale and rulings, quoted never paraphrased — added 2026-10-06 at the maintainer's ask |
| `proposals/NNNN-slug/` | reviewable work products | e.g. a patched copy of the personal library awaiting `personal:P15` review; never applied to the live original |
| `conversations/NNNN-slug.md` | maintainer exchanges | verbatim rationale; added at the maintainer's ask |
| `reviews/NNNN-slug.md` | **terse maintainer reviews** | Abstract → quantified Results table → Explanation → Methodology; the maintainer reads these, not the long FINDINGS |
| `PATHS.md` | the fork menu | every direction not taken gets a row BEFORE any is taken; the reviewer picks from here |
| `OPERATIONS.md` | the launch runbook | how units start headless/orchestrated without losing intention or self-amendment |

Numbering is `0001, 0002, …` and never reused. Nothing here is "final" —
supersede by a new musing that links the old one.

## Musing frontmatter

```yaml
---
id: 0004
status: open          # open | testing | answered | parked | absorbed
opened: 2026-10-06
spawned_by: trial-3   # a trial, probe, musing id, conversation, or "survey"
tested_by: []         # probe/trial ids, as they accrue
tags: [delivery, axes]
---
```

`answered` needs a one-line answer *and* a citation. `absorbed` means a trial
pre-registration or roadmap item now carries it — link where.

## House rules, inherited from three trials of scar tissue

- **Probes are not trials.** Say "a probe suggests", never "we showed". The
  REGISTER's credibility is the programme's capital; nothing spends it but a
  trial.
- **Reflection before the next dispatch**, not at the end of the day. Trial
  3's two scoring defects were caught by reading a run's prose against its
  scored row *between* batches; the same cadence applies here.
- **Record surprises when they happen**, not when they become convenient —
  pre-registration thinking applies to observations too (trial 3's Amendment
  1 recorded the H3-mediation observation *before* the batch could confirm
  it).
- **A lexical list of the ways a thing can be expressed cannot be completed**
  (protocol §6, survey defect 4). When a probe needs a classifier, ask a
  semantic question about the outcome.
- **Quote, don't paraphrase, the maintainer's rationale** — and mark absent
  rationale as `Rationale: TBD` rather than inventing it.
