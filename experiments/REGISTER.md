# Trial register

One line per trial. Population-level picture without reading every document.
Protocol: `docs/plans/2026-09-30-trial-orchestration.md`.

| trial | element | shape | flip rate | floor | verdict |
|---|---|---|---|---|---|
| [2026-09-manipulation-check](2026-09-manipulation-check/FINDINGS.md) | `code-common:CH1` | evaluative | **7%** (floor 0%) | 0/15 | did not steer; cited in 11/12 runs — *decorative-but-cited* |
| [2026-09-directive-cr1](2026-09-directive-cr1/FINDINGS.md) | `code-common:CR1` | directive | **3/3 flip** (floor 0/3) | 12/12 pass | steered on every fork; also flipped 3/3 on a **two-word** narrowing — cited in 12/12 |

## The live hypothesis

> An **evaluative** element ("weigh these factors, then judge") cannot steer,
> because inverting its conclusion leaves its questions intact. A **directive**
> element ("never cross this line") might.

**Two trials in, it holds.** `CH1` (evaluative) did not steer while being cited
in 11/12. `CR1` (directive) steered on every fork while being cited in 12/12 —
including a two-word narrowing that left the element's name and its prohibition
untouched and still moved 3/3 against a floor of 3/3 the other way.

Falsifiers are listed in the protocol, §10. **Next trial:** `code-common:CH2`,
the second evaluative element. If it also fails to steer, the shape claim
generalises past `CH1` and the library partitions into a steering half and a
decorative half — which turns the categorisation axis (#26) into an empirical
question.

**One channel to add to protocol §4 before the next trial:** `npm ls -g` prints
`@principled/cairn -> …/shitchell/gvp`, because cairn is installed as a global
npm link. Any run can read the path to the real repository from it. Trial 2
verified by transcript that no run followed it; the channel is still open.
