# Trial register

One line per trial. Population-level picture without reading every document.
Protocol: `docs/plans/2026-09-30-trial-orchestration.md`.

| trial | element | shape | flip rate | floor | verdict |
|---|---|---|---|---|---|
| [2026-09-manipulation-check](2026-09-manipulation-check/FINDINGS.md) | `code-common:CH1` | evaluative | **7%** (floor 0%) | 0/15 | did not steer; cited in 11/12 runs — *decorative-but-cited* |
| [2026-09-directive-cr1](2026-09-directive-cr1/FINDINGS.md) | `code-common:CR1` | directive | **3/3 flip** (floor 0/3) | 12/12 pass | steered on every fork; also flipped 3/3 on a **two-word** narrowing — cited in 12/12 |
| [2026-10-contested-axis](2026-10-contested-axis/FINDINGS.md) | tie-breaks on `CH2`/`P21` — a **ten-voice** axis | contested | **0/3 vs 5/6** against the prevailing direction; **0 effect** with it | 13/13 ×12 | a tie-break steers a contested axis, but only against the way it already resolves; the with-the-grain arm is identical to the noise floor. **No run reported the contradiction** |

## The live hypothesis

> An **evaluative** element ("weigh these factors, then judge") cannot steer,
> because inverting its conclusion leaves its questions intact. A **directive**
> element ("never cross this line") might.

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

**Next trial:** the **axis-ownership survey** — for each candidate, how many
elements speak to its axis? If most axes turn out multiply-stated, that result
matters more than any single shape test and reframes trials 1 and 2. The shape
contrast runs after it, on a candidate that owns its axis.

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
