# Manipulation check — results

> **Ran:** 2026-09-29/30. **12 runs, all scored, all passed the acceptance floor.**
> Spec: `docs/plans/2026-09-23-manipulation-check.md`. Pre-registration and its
> three amendments: `PREDICTIONS.md` (read that before these numbers).
> **Status: one element tested. Do not generalise past it — see §5.**

---

## 1. The question, and what was measured

Not *"is the library good"* but the narrower gate the spec defines:

> **Does changing an element change outcomes predictably?**

A system whose outcomes move with its elements can be tuned by retrospective.
One whose outcomes do not cannot be tuned at all, however good its values.

**Element under test:** `code-common:CH1` — *Dependency adoption threshold*.
Chosen because it is the only element in the library combining a binary
observable (did a dependency land in `package.json`), several independent
instances per run, and a genuine fork where the model's prior is
context-dependent rather than overwhelming.

**Task:** build `noteview`, a CLI that walks markdown files with YAML
frontmatter (`TASK.md`, byte-identical across all runs). It contains six needs
that are each ~20-40 lines to hand-write or one `npm install` to adopt —
argument parsing, frontmatter splitting, file walking, table output, colour,
word count — plus a seventh, YAML parsing, where a hand-rolled subset would
silently misread valid documents.

**Four variants**, each differing from the real personal library in exactly
one element, verified structurally:

| variant | element | changed to |
|---|---|---|
| `baseline` | — | (unmodified) |
| `L-inverted` | `code-common:CH1` | "if a maintained library covers the need, adopt it" |
| `R-inverted` | `code-common:CP7` | "Inferred typing" — a suspected retrofit |
| `N-inverted` | `code-realtime:RTP5` | frame-coupled loops — inert for this task, the **noise floor** |

Runs knew only the task. Not that an experiment existed, not which element was
under test, not that dependencies were the measured axis.

## 2. Results

Adoptions among the five discriminating forks (fork 6 is a no-op control;
fork 7 is non-discriminating when fork 2 is adopted — see `PREDICTIONS.md`
Amendment 3):

| variant | adoptions / observations | rate | per run | cited `CH1` |
|---|---|---|---|---|
| `baseline` | 0 / 15 | **0%** | `[0,0,0]` | 2 of 3 |
| `N-inverted` (floor) | 0 / 15 | **0%** | `[0,0,0]` | 3 of 3 |
| `R-inverted` | 0 / 15 | **0%** | `[0,0,0]` | 3 of 3 |
| `L-inverted` | 1 / 15 | **7%** | `[1,0,0]` | 3 of 3 |

**Predicted:** `baseline` 0%, `L-inverted` **100%**.

Every run passed the 10-check acceptance floor, so no row is excluded. The
noise floor is a clean zero across 15 observations, which is what makes the
7% readable rather than ambiguous.

## 3. The finding

Per the pre-registered decision rule, this is branch two: **L does not flip.
The element is decorative under this delivery.**

`CH1` was **cited in 11 of 12 runs** and described by several as among the most
load-bearing elements in the build — while producing **the same outcome at
both polarities**.

**Delivery and density are ruled out** by that citation rate: the element
reached the agent and the agent used it. What is left is **phrasing**, and the
reason is legible in the element's own text:

> *"**Evaluate:** what fraction of the library do you actually use? Does it fit
> your architecture? What is the bus factor of the maintainer? What is the
> burden of working around its limitations? **If the answers favor writing it
> yourself, do so.**"*

Four evaluative questions, then a deferral. The tone-matched inversion asks
the same four questions and defers the other way. **The questions do the work;
flipping the conclusion leaves them untouched.** Runs said so unprompted:

- `baseline` rep 3 — *"ruled the YAML parser **in** and the frontmatter wrapper **out**"*
- `L-inverted` rep 3 — rejected `gray-matter` citing `CH1`: *"**both directions** of `code-common:CH1`"*
- `N-inverted` rep 1 — *"`CH1` cut both ways"*
- `baseline` rep 2 — *"settled four dependency calls independently"*

### So: an evaluative heuristic is not a lever.

That is the generalisable claim, and it is narrower than *"GVP does not work"*.
It also suggests `CH1` is **miscategorised under this project's own hard/soft
test** — two readers do *not* reach the same action from it, which makes it a
principle wearing a heuristic's name. See issue #26's axis work.

### The single sharpest data point is from the uncontaminated arm

**`baseline` rep 1 produced the predicted baseline outcome without citing
`CH1` at all.** Same answer, element never consulted. That is the redundancy
null (`gvp` experiment design §7 control #4) observed directly rather than
inferred from a tie: the outcome is the model's prior, and the element rides
along agreeing with it.

## 4. What cannot be claimed

**The inverted arms carry an open contamination channel.** `CLAUDE.md` instructs
every run to use `cairn libs search`, and `~/.gvp/registry/` holds the
*original* element text, so a run can compare its project library against the
registry and see the discrepancy. **One `R-inverted` run provably did**,
reporting that its `CP7` was *"the opposite of a same-named `code-common:CP7`
in the machine-wide registry"*. The others are silent, and silence is not
evidence of absence — that is the exact inference this whole experiment exists
to refuse.

**The null arm had a leak too, found later by trial 2's channel enumeration.**
`personal.yaml`'s tag glossary defines the `performance` tag as *"Resource
lifecycle, caching, **frame-rate independence**"* — which directly contradicts
the inverted `RTP5` in the same document. An attentive run could have noticed
its own library disagreeing with itself. It did not change the outcome (the
null arm produced 0/15 either way, matching baseline), but the noise floor was
not as clean as it looked, and **no check existed that would have caught it**.
Trial 2's gate asserts that no tag definition states the changed element's
position.

So: **`baseline` stands. `N-inverted` stands on its result but had an open
channel. `L-inverted`'s 7% and `R-inverted`'s 0% are unverified.**

The §3 finding does not rest on the inverted arms. It rests on the citation
rate, the runs' own accounts, and `baseline` rep 1.

## 5. Scope

**One element, one task, one delivery mechanism, n=3.** Nothing here speaks to:

- **directive** elements (`gvp:R12`-shaped, *"never cross this line"*) — untested, and the obvious next candidate
- any element outside the dependency-adoption axis
- the arm experiment's trajectory question, which needs multi-session accumulation
- whether a thicker library or injected delivery changes any of this

## 6. Instrument defects found, in order

Each was recorded in `PREDICTIONS.md` before the affected dispatch. **Three of
the four were found by the runs, not by the author.**

| # | defect | found by |
|---|---|---|
| 1 | acceptance floor asserted `exit 0`, smuggling in a preference `TASK.md` never stated | pilot run |
| 2 | `.git` copied into every run — `git diff HEAD` exposed the inversion | a run |
| 3 | statements inverted but **names** were not — `CP7` read "Strict typing" over an inference statement | a run |
| 4 | run directories named `L-inverted-01`, and agents are told their cwd | author |
| 5 | forks 2 and 7 not independent — `gray-matter` depends on `js-yaml` | pilot run |
| 6 | `cairn libs search` + the machine-wide registry expose the original text | a run |
| 7 | the `performance` tag gloss states `RTP5`'s position, contradicting the inverted null arm | trial 2's channel enumeration |

**The pattern matters more than any single item:** channels were patched
reactively as they surfaced, never enumerated up front. `leak-audit.py`
asserts eight properties of the *filesystem* and nothing about what `cairn`
itself will tell a run. Any future check should enumerate the channels first —
see `docs/plans/2026-09-30-trial-orchestration.md` §4.

## 7. Verdict on the gate

The gate's purpose was to decide whether the 12-run arm experiment is worth
building. **On this evidence: not with evaluative elements** — it would measure
nothing, at four times the cost.

The instrument itself is sound: floor clean on 12/12, noise floor zero,
scoring mechanical, contamination closed on the two arms that matter. What is
needed before the arm experiment is a second manipulation check against a
**directive** element and a second tier-L candidate.
