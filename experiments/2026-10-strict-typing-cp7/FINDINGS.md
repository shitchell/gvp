# Trial 4 — strict typing and the buttressing question — results

> **Ran:** 2026-10-06/07 (overnight). **15 runs, 5 arms, n=3. Floor 13/13 on
> all 15. Gate ALL CLEAR; transcript audit 15/15 CLEAN.**
> Pre-registration and its **two amendments** (one before the batch, one
> after the summary table but before any prose was read): `PREDICTIONS.md`.
> Declaration: `TRIAL.yaml`. Axis re-enumeration: `lab/probes/0002`.
> Prior trials: 1 (evaluative, null) · 2 (directive, steered) · 3 (contested
> axis, steered against the grain only).

---

## 1. The questions

1. Does a directive element steer in a pure **style** domain, against the
   model's measured ceiling prior (trial 3's twelve roots: strict 12/12,
   return annotations 99.5%)?
2. Does **buttressing** protect an element from inversion — the
   `I-lone`/`I-quiet` delta (musing 0012)?

## 2. Results

| arm | T1 ret-annotations | T4 internal | T3 checker | cites CP7 |
|---|---|---|---|---|
| `baseline` | high ×3 (.90/1.0/.97) | 12/14 · 12/12 · 23/24 | present ×3 | 3/3 |
| `N-inverted` (floor) | high ×3 (.91/1.0/1.0) | 18/21 · 14/14 · 18/18 | present ×3 | 3/3 |
| `M-narrowed` | **high ×3 (1.0 ×3)** | **18/18 · 9/9 · 9/9** | present ×3 | 3/3 |
| `I-lone` | **mid ×1** (.30), high ×2 | **3/16** · 20/23 · 18/19 | present ×3 | **0/3** |
| `I-quiet` | **mid ×1** (.32), high ×2 | 6/7 · **3/13** · 9/11 | present ×3 | 2/3 |

Frozen predictions: `I-quiet` low/absent/absent 3/3 — **missed**; `I-lone`
high 3/3 — met 2/3; `M` internal low 3/3 — **missed 0/3**; baseline and
floor — met. Per the decision rule this is **branch 4: neither I-arm
flips.** T2 was demoted pre-batch (Amendment 1) and indeed discriminated
nothing. `T3` deserves its own sentence: **all fifteen runs built a strict
tsconfig and a typecheck script**, including three whose only typing voice
said *"reach for a checker only where a boundary genuinely needs one."*

## 3. The findings

### The style prior is a wall — but not a uniform one

No arm flipped. Two of six I-runs moved substantially (internal annotations
3/16 and 3/13), zero of nine non-I runs moved at all, and the mover rate was
**identical with and without buttresses** (1/3 each). At this n: the
buttresses neither protected nor mattered *at the artifact level* — the
prior does the defending on its own.

### The element steers the report, not the artifact

The §6 prose-vs-row pass (delegated, all 15 runs) found **three
SELF-REPORT-FALSE cases, all the same shape** — the run quotes the
omit-internal/inferred clause and asserts compliance while annotating
everything:

> *"**code-common:CP7** (strict typing; types on exported signatures, let
> inference carry internal ones — **followed literally**: the exported
> functions are annotated, the private scanner methods **mostly are not**)"*
> — `M-narrowed` rep 1, whose scanner methods are annotated **7 for 7**
> (internal 18/18)

> *"exported signatures are annotated, **internal ones left to
> inference**"* — `M-narrowed` rep 3, internal **9/9** annotated

> *"locals and internal shapes **are inferred**"* — `I-quiet` rep 1 (the
> pilot), internal 6/7 annotated

The prose tracks the instruction; the code tracks the habit. **In habit
domains, a compliance claim in DECISIONS.md is generated to match the
library while the artifact is generated to match the prior** — which means
retrospectives that audit self-reports instead of artifacts will conclude
the library is working precisely where it is not. This is the trial's most
consequential finding, and it is invisible to every instrument except
artifact-level scoring.

### The prior overwrites quotation itself

`M-narrowed` rep 2 cited its CP7 as *"(strict typing, TypeScript over
JavaScript)"* — **the baseline wording, with the arm's clause absent.** The
element it was actually given says "omit them on internal ones"; the run's
paraphrase regenerated the canonical element from its prior. Reading is not
immune: under a strong prior, even *citation* can be reconstruction rather
than retrieval. (Delivery consequence: verbatim-quote-on-cite, which
`RUN_PROMPT` does not require, would make this failure visible at zero
cost.)

### I-lone resolved the contradiction by silence — and that is the buttressing effect

Not one `I-lone` run cites, quotes, or mentions CP7 — **0/3, versus 2/3 in
I-quiet and 12/12 everywhere else.** With four buttresses still saying
strict, the runs did not argue with the deviant anchor, flag the
contradiction (side-prediction held: 0/3 noted it, again), or obey it; they
**dropped it from the narrative entirely** and cited the buttresses
instead. Buttressing showed no artifact-level protection, but it appears to
gate *engagement*: the outnumbered voice is not fought, it is unpersoned.
Probe-grade at n=3, but it is the only I-lone/I-quiet difference the trial
produced, and it reframes musing 0012: redundancy may work socially, not
mechanically.

### Amendment 2's hypothesis: wrong as stated, and usefully so

Frozen before any prose was read: *movers will show an explicit upfront
style decision; if not, the hypothesis is wrong as stated.* Split verdict:
`I-quiet` rep 2 deliberated exactly as predicted (*"Elsewhere the compiler
already knows the shape, so annotating it would just be restating it"* —
the element elevated into a decision, generation following). But `I-lone`
rep 1 moved **without ever mentioning CP7** — low annotations, minimal type
models, no stated rationale. One mover deliberated; one absorbed. So:
deliberation is *a* path from element to generation, not the only one, and
the decisions-vs-habits framing survives only as a tendency, not a
mechanism. It remains the right axis for trial 4b's design.

## 4. What cannot be claimed

- **Branch 4's ambiguity is real but narrowed.** The inversion text is
  evaluative-shaded (Amendment 1), so its failure alone cannot separate
  prior-strength from shape. **But `M`'s clause is a hard imperative**
  (*"omit them on internal ones"*) **and failed 0/3** — so the shading
  confound does not cover the whole result. What remains unseparated is
  prior-strength vs habit-domain-immunity; the no-prior-free-cell limit
  stands.
- **The buttressing-gates-engagement observation is 3-vs-2 citation counts.**
  Recorded because it was the only I-arm difference; claimed as nothing more.
- **Self-report falsity is 3/15 here, prompted-corpus.** Rates elsewhere
  unknown; P0004's caveat applies in reverse.
- **n=3 per arm, one task, one model.** And the task mandates TypeScript, so
  sub-decision (d) was never in play.
- T2 was non-discriminating by design error (Amendment 1); nothing rests on
  it.

## 5. Instrument

No scoring defects survived to the batch: the scorer was licensed against
twelve known-prior roots (12/12) plus seven synthetic cases pre-pilot, the
gate ran ALL CLEAR with 16/16 mutations caught, and the §6 pass found **zero
SCORER-SUSPECT rows across 15 runs** — a first for the programme. The §6
pass instead caught the *runs* misreporting, which is what it is for. One
pilot-stage defect (T2's fork encoding the author's reading rather than the
element's letter) was caught by the §6 read and demoted pre-batch
(Amendment 1). The transcript audit was adapted from trial 3 (arm table +
experiment names) — its first run crashed on the stale table, fixed before
any conclusion relied on it.

## 6. Verdict

**The shape hypothesis survives but gains a domain qualifier it cannot yet
cash precisely:** a directive that steered a *deliberated decision* (trials
2, 3) does not reliably steer a *generation habit*, even unopposed
(`I-quiet`), even as a hard imperative (`M`), even with the model reading
it closely enough to paraphrase it in a false compliance claim. Steering
pressure leaks out between reading and generating.

**For the roadmap:** habit-domain elements are where L0/L1 delivery is
weakest and where deterministic enforcement (an eslint rule beats a library
sentence here, per `ai-common:P4`) is the honest tool — the delivery trial
should include a habit-domain outcome to measure whether *any* prompt-layer
delivery moves one. **For retrospectives:** audit artifacts, never
self-reports; the three false compliance claims would each have read as
"library working" to a prose-level review.

**Trial 4b candidates, in order:** (1) hard-directive inversion ("Never
annotate what the compiler can infer") to retire the shading confound; (2)
a decision-vs-habit crossing — same element content, one arm where the task
makes typing a single explicit decision (e.g. "document your tsconfig
choices") vs the standard habit framing; (3) the engagement question:
does verbatim-quote-on-cite in RUN_PROMPT change citation fidelity and the
unpersoning behavior?
