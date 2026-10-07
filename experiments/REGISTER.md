# Trial register

One line per trial. Population-level picture without reading every document.
Protocol: `docs/plans/2026-09-30-trial-orchestration.md`.

| trial | element | shape | flip rate | floor | verdict |
|---|---|---|---|---|---|
| [2026-09-manipulation-check](2026-09-manipulation-check/FINDINGS.md) | `code-common:CH1` | evaluative | **7%** (floor 0%) | 0/15 | did not steer; cited in 11/12 runs — *decorative-but-cited* |
| [2026-09-directive-cr1](2026-09-directive-cr1/FINDINGS.md) | `code-common:CR1` | directive | **3/3 flip** (floor 0/3) | 12/12 pass | steered on every fork; also flipped 3/3 on a **two-word** narrowing — cited in 12/12 |
| [2026-10-contested-axis](2026-10-contested-axis/FINDINGS.md) | tie-breaks on `CH2`/`P21` — a **ten-voice** axis | contested | **0/3 vs 5/6** against the prevailing direction; **0 effect** with it | 13/13 ×12 | a tie-break steers a contested axis, but only against the way it already resolves; the with-the-grain arm is identical to the noise floor. **No run reported the contradiction** |
| [2026-10-strict-typing-cp7](2026-10-strict-typing-cp7/FINDINGS.md) | `CP7` lone vs quieted-buttress inversion + `M` narrowing | directive, **habit domain** | **no flip** (2/6 I-runs partial; M 0/3; floor clean) | 13/13 ×15 | the style prior is a wall: strict checker 15/15 even when the only typing voice forbids it. **Three runs claimed compliance their artifacts contradict**; one re-quoted the element back to its baseline wording; I-lone runs cited the inverted anchor **0/3** (unpersoned, not argued with) |
| [2026-10-delivery-cr1](2026-10-delivery-cr1/PREDICTIONS.md) | `code-common:CR1` — **delivery**, not content (L0 pointer / L1 session-start / L2 bind-time / L2n null) | directive, **radius × habit** | *declared 2026-10-07; not dispatched* | — | instrument licensed: scorer 12/12 real trial-2 snapshots, gate 41/41 mutations, harness verified live in all four arms. Libraries byte-identical across arms — the IV is outside the library |

## The live hypothesis

> An **evaluative** element ("weigh these factors, then judge") cannot steer,
> because inverting its conclusion leaves its questions intact. A **directive**
> element ("never cross this line") might.

**Through trial 4 it holds with a domain qualifier:** directives steer
*deliberated decisions* (trials 2, 3) and did not reliably steer a
*generation habit* (trial 4) — even unopposed, even as a hard imperative,
even while being paraphrased in (false) compliance claims. Steering pressure
leaks between reading and generating; habit domains belong to deterministic
enforcement (`ai-common:P4`), not library sentences. And the citation signal
is now dead in both directions: cited ⇏ followed (trials 1, 4), not-cited ⇏
not-followed (trial 4's I-lone mover).

**Two trials in, it holds — and trial 3 did not test it.** `CH1` (evaluative)
did not steer while being cited in 11/12. `CR1` (directive) steered on every
fork while being cited in 12/12 — including a two-word narrowing that left the
element's name and its prohibition untouched and still moved 3/3 against a
floor of 3/3 the other way.

Falsifiers are listed in the protocol, §10.

## What trial 3 changed about the programme

The queue's next item (`code-common:CH2`, "a second evaluative element") was
**withdrawn by enumeration**: CH2 is a hybrid shape, and **nine elements
contest its axis** while `personal:P21` already states what a pro-seam
manipulation of CH2 would introduce. Byte-wise one-element is not semantically
one-element. **Trials 1 and 2 both assumed an axis ownership neither checked** —
so their results may describe contested axes without saying so.

That makes axis ownership a precondition rather than a detail:

> **Before testing an element, enumerate every element bearing on its axis.**
> If more than one takes a position, the manipulation is redundant (same
> position) or contested (opposite), and a flip cannot be attributed to the
> element.

**The axis-ownership survey ran 2026-10-06**
([2026-10-axis-survey.md](2026-10-axis-survey.md)), all 102 elements by hand:

- **5 contested axes, ~20 elements (~20%), concentrated exactly in the
  design-philosophy core agents consult most.** Sharpest contradiction:
  `CP6` ("should have extracted the first time") vs `H1` ("wait until a
  second consumer forces the design"), no tie-break anywhere.
- **Trials 1 and 2 survive retro-inspection** — `CR1` sole owner, `CH1`
  effectively owned. The feared reframe did not materialise: the shape
  contrast between them stands on owned axes.
- **Trial 3's axis was bigger than declared** — 11 contradicting voices, not
  9; `CP5`/`CP6` missed by the keyword scan (trial 3 defect 4). Conclusions
  unchanged; both misses are pro-seam and strengthen the `A-decisive` null's
  explanation.
- **Shape correlates with ownership in this library** — owned axes skew
  directive, evaluative elements cluster on contested territory. The two
  hypotheses need deliberate decoupling.
- Two axes already carry native tie-breaks (`WP2` "per V5"; `H8`'s
  priced-and-declined protocol) — the trial-3 idiom, used wherever the author
  *saw* the conflict. The contested five are the unseen ones.

**Next trial (declared, awaiting dispatch): trial 5 — delivery.** The first
trial whose independent variable is **outside the library**: `CR1`'s text is
byte-identical in all four arms and only the moment it reaches the agent changes.
It is asked where L0 is *known to fail* rather than where it is known to work —
trial 2's `baseline` rep 2 kept its config file ignored and then hard-coded the
live token into a test fixture, so the dependent variable is the element's
**radius** across four sites, not a flip. Three things the design added to the
programme: a **delivery manipulation check** (a hooked run whose hook never
injected is meaningless, not null — see musing 0018), per-site scoring that never
pools (trial 2's pooled fork P hid the very observation this trial follows up),
and the first case where a result would oblige a **library patch**: `ai-common:P3`
and `C3` state the delivery hypothesis as elements (musing 0017).

**A tool this implies, and that cairn does not have.** Trial 3's gate enumerates
axis voices by hand. Nothing in `cairn` reports that ten elements bear on one
axis, or that two of them disagree — `cairn validate` returned byte-identical
diagnostics for all four arms. That belongs in the tool, not in an experiment's
gate (#26).

**Channel closed since trial 2:** `npm ls -g` no longer prints
`@principled/cairn -> …/shitchell/gvp` — the global is a real registry install
(5.1.0), and the repo-local dispatcher at `~/bin/cairn` carries no hardcoded
path (it walks up from `$PWD` grepping `package.json`), so reading it leaks
nothing. Both asserted by trial 3's gate. **A new one to keep asserting:** all
arms must produce byte-identical `cairn validate` output, or the tool the
experiment requires tells a run which arm it is in.
