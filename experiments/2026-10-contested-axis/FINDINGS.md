# Trial 3 — a contested axis — results

> **Ran:** 2026-10-05/06. **12 runs, 4 arms, n=3. All 12 passed the acceptance
> floor 13/13. Gate ALL CLEAR.**
> Pre-registration and its **two amendments**: `PREDICTIONS.md` — read that
> before these numbers, and in particular Amendment 1, which was written after
> a prediction miss.
> Trial declaration: `TRIAL.yaml`. Protocol:
> `../../docs/plans/2026-09-30-trial-orchestration.md`.
> Trial 1 (evaluative, negative): `../2026-09-manipulation-check/FINDINGS.md`.
> Trial 2 (directive, positive): `../2026-09-directive-cr1/FINDINGS.md`.

---

## 1. The question, and why it is not the one the queue named

The protocol's queue named `code-common:CH2` as *"a second evaluative
element"*, to test whether trial 1's result generalises past `CH1`. **The
enumeration protocol §4 now requires withdrew that candidate on two
independent grounds**, both recorded in `TRIAL.yaml:withdrawn_candidate`:

1. **CH2 is not CH1's shape.** *"If needed for stability: implement now. If
   additive and access patterns unknown: add flex points without implementing.
   If speculative with no concrete use case: defer entirely"* is a **hybrid** —
   the classification is evaluative, but all three consequents are definite
   actions. Trial 1's mechanism (inverting the conclusion leaves the questions
   intact) has nothing to act on.
2. **Disqualifying: nine elements speak to CH2's axis and they contradict each
   other.** `personal:V7`, `P21`, `P17`, `H3` and `code-common:CP15` push toward
   building seams; `personal:V1`, `P5`, `H1` and `CH2` push toward deferring;
   `personal:P1` mediates. `personal:P21` **already states** *"favor creating
   many flex points in early builds, exposed as config options"* — so any
   pro-seam manipulation of CH2 is redundant by construction, and a flip could
   not be attributed to it.

Byte-wise one-element is not semantically one-element. **Trials 1 and 2 both
assumed an axis ownership that neither checked.** So this trial measures the
condition instead of fighting it:

> **When a library disagrees with itself on an axis, can it be steered at all —
> and does an explicit tie-break do it?**

This matters more than a third shape instance. A library that cannot be tuned
one element at a time cannot be tuned by retrospective, which is the mechanism
the whole framework rests on.

**The contest is not only between elements. It is inside CH2's own tag set:**
CH2 carries both `simplicity` (*"Reducing complexity, preferring minimal
solutions"*) and `maintainability` (*"Naming, structure, **extensibility**,
testability"*). One gloss points at deferral, the other at seams, on the same
element.

## 2. Design

**Task:** `../tasks/csv-tally.md` — build `tally`, a CLI reporting the row and
column counts of every `*.csv` directly under a directory. **It specifies zero
command-line flags**, which is what makes every flag a run adds a feature the
task never asked for, and the fork mechanically observable rather than a
judgement about whether an abstraction was warranted. The gate asserts the
task names no flag and none of the axis vocabulary.

**Four arms**, each differing from the real library in exactly one element,
verified byte-wise. **Nothing is inverted** — both decisive arms *append* a
tie-break clause, leaving position, name and id untouched:

| arm | element | change |
|---|---|---|
| `baseline` | — | the real library, contradiction intact. **No variant build at all** |
| `D-decisive` | `code-common:CH2` | `…defer entirely with no flex points.` **`(Where this meets personal:P21's preference for many early flex points, this tree governs: no concrete use case means no seam.)`** |
| `A-decisive` | `personal:P21` | `…discover the best use of the tool.` **`(Where this meets code-common:CH2's third branch, this principle governs: no concrete use case yet still means a seam.)`** |
| `N-inverted` | `code-web:WP3` | subresource integrity pinning inverted — inert for a Node CLI: the noise floor |

The clauses are symmetric by construction and the gate asserts it: identical
`(Where this meets <id>'s …, this … governs: no concrete use case …)` frame,
both resolving on `seam.)`, 20 and 18 words. A difference between the arms
therefore cannot be about rhetorical force.

`baseline` requiring no build is worth noting on its own: **it is the cleanest
control either previous trial had**, carrying no tampering tell of any kind.

**Why appending rather than deleting.** An earlier design gave CH2 sole
ownership by removing the eight co-stating elements. Rejected before dispatch:
eight id gaps is the exact tell trial 2's §10 rejected a no-element arm over,
and the result would have generalised only to a library where one element owns
an axis — which this one is not.

## 3. Results

Levels per `PREDICTIONS.md` Amendment 1: `cli-implemented` > `cli-inert` >
`internal-seam` > `absent`, precedence top-down. Reported per run and **never
pooled into a rate** (trial 1's defect 5).

| arm | **S1** — an affordance for another output form | **S2** — an affordance for wider input | **S3** — a declared extension point | cites the resolution | floor |
|---|---|---|---|---|---|
| `baseline` | `cli-implemented` ×2, `absent` ×1 | `absent` ×2, `internal-seam` ×1 | present ×2, absent ×1 | — (clause absent) | 13/13 |
| `N-inverted` (floor) | **`cli-implemented` ×3** | `internal-seam` ×2, `absent` ×1 | **present ×3** | — (clause absent) | 13/13 |
| `A-decisive` | **`cli-implemented` ×3** | `internal-seam` ×2, `absent` ×1 | **present ×3** | **2/3** | 13/13 |
| `D-decisive` | **`absent` ×3** | `internal-seam` ×1, `absent` ×2 | present ×1, absent ×2 | **3/3** | 13/13 |

**Pre-registered predictions** (§5): `D` → absent 3/3 on all three forks; `A` →
not-absent 3/3 on S1 and S2, present 3/3 on S3; `N` → matches baseline.
**Met: D on S1 only; A on S1 and S3. Missed: D on S2 and S3; A on S2.**

## 4. The finding

### A tie-break steers a contested axis — but only against the prevailing direction.

**S1 is a total separation with no overlap.** `D-decisive` produced no
alternative-output affordance in 3 of 3 runs, against a noise floor of 3/3
`cli-implemented` and a baseline of 2/3. Combined, **5 of 6 untampered runs
built an output-form affordance and 0 of 3 `D-decisive` runs did.**

And the mechanism is in the artefacts, not inferred. **All three `D-decisive`
runs cite the clause**, and `D-rep2` quotes it verbatim:

> **GVP.** `code-common:CH2` decides it, and says so explicitly: *"Where this
> meets `personal:P21`'s preference for many early flex points, this tree
> governs: no concrete use case means no seam."* — `D-decisive` rep 2, §12

> **Why.** The seams are free and already required for testability; the flags
> are not. **`code-common:CH2`** is explicit that it governs where it meets
> **`personal:P21`**'s preference for many early flex points — `D-rep1`, §10

> The deferral tree resolves this explicitly: no concrete use case means no
> feature — and where it meets the preference for many early flex points, the
> tree governs. — `D-rep3`, §11

Zero baseline or floor run cites it, because in those arms it does not exist.
**5 of 6 decisive runs read the clause; 0 of 6 untampered runs could.** That is
as clean a delivery signal as this programme has produced.

### `A-decisive` did nothing at all, and that is the second half of the result

**`A-decisive` is tally-for-tally identical to the noise floor on all three
forks.** `cli-implemented` ×3, `internal-seam` ×2 + `absent` ×1, present ×3 —
the same row as `N-inverted`, whose manipulated element is inert by
construction.

Its tie-break was read (2 of 3 runs cite it) and changed nothing, because **the
pro-seam side was already winning.** Five elements, a permissive tag gloss and
the model's own prior all point that way; adding a sixth voice saying so adds
no information. This is **trial 1's redundancy null observed directly rather
than inferred from a tie** — there, `baseline` rep 1 reached the predicted
outcome without citing `CH1` at all; here, an entire arm cites its tie-break
and is indistinguishable from an arm whose element is inert.

So the asymmetry is the finding:

> On a contested axis, an explicit tie-break moves outcomes **only when it
> pushes against the direction the axis is already resolving.** Pushing with
> the prevailing direction is measurably indistinguishable from changing
> nothing.

That is directly actionable for retrospective tuning: **the useful edit is the
one that contradicts current behaviour, and an edit that agrees with it buys
nothing no matter how forcefully phrased.** `A`'s operative half is two words
*longer* than `D`'s — *"no concrete use case yet still means a seam"* against
*"no concrete use case means no seam"* — and still moved nothing.

### Nine contradicting voices produced no recorded notice of the contradiction

**No baseline or floor run states that the library's guidance on this axis is
in tension with itself.** The lexical detector flagged three sentences across
12 runs and **all three are off-target** on inspection: `A-rep1`'s is about the
tie-break *resolving* the conflict, `N-rep2`'s is a tension between
`personal:P19` and `V1` on a different axis, and `A-rep2`'s is about a bug in
its own code. See §6 defect 3 — the axis supports no count and is reported as
evidence only.

So prediction 2 held, but trivially and on a weak instrument. The substantive
observation is the one it brushes against: **the runs resolved a
nine-voice contradiction silently, case by case, and none of them reported that
it existed.** A contested axis does not announce itself. Nothing in the tooling
surfaces it either — `cairn validate` returns the same 27 diagnostics for all
four arms and says nothing about an axis pulling both ways.

### What resolves the contest when nothing tells it to

`baseline` and the floor did not resolve it by coin flip. Where runs explain
themselves, they apply a **cost-asymmetry** test — build the seam where the
pass-through is cheap, defer where it changes a contract:

> Both are obvious future wants (TSV, pipe-delimited), and wiring them in now
> costs nothing while retrofitting them would reach into every function
> signature. But a CLI flag is a published commitment that is expensive to
> remove… **so the seam exists in the library API while the command surface
> stays minimal.** — `A-rep1`, §8

> unlike the dialect seam (decision 8) none of them is a cheap pass-through:
> recursion changes the record identity from a filename to a path, and sort
> options change the report contract. — `A-rep1`, §19

That is `personal:H3`'s test — *"when a future need is identified (not
speculative) AND the cost of building it now is minor while retrofitting later
is clearly greater, build it now"* — a declared axis voice, self-described in
the library as *"the complement to the deferral tree"*. It is doing the
mediating work that neither tie-break was needed for. **Recorded in Amendment 1
before the batch ran, precisely so it could not be back-fitted here.**

### One run designed its own tie-break

`D-rep1` records, unprompted, the clause that would have reversed its decision:

> Is a machine-readable output mode (`--json`) worth building unprompted? **No
> — exit codes only.** `code-common:CH2` and `personal:P20` point opposite ways
> here. **A tiebreak clause on CH2: *a machine-consumable form of an output the
> tool already computes is additive-with-known-access-pattern, not
> speculative* — would have flipped this.** — `D-rep1`, §264

A run identifying the exact edit that would change its own behaviour is the
retrospective-tuning loop working from the inside, and it is the most
encouraging single datum in three trials.

## 5. What cannot be claimed

- **Nothing about `CH2` or `P21` as elements.** The manipulations are tie-break
  clauses on an axis with ten voices. Attribution to a single element is exactly
  what this design gives up — and it is the attribution trials 1 and 2 assumed
  without checking.
- **S2 and S3 discriminate nothing here.** `D` is directionally lower on both
  (`internal-seam` ×1 vs the floor's ×2; S3 present ×1 vs ×3) but the arms
  overlap, and `A` is identical to the floor. **Only S1 separates, and S1 is
  the fork settled most cleanly by invocation.** Two of six pre-registered
  per-fork predictions failed on S2. Treat S2 and S3 as uninterpretable at this
  n and read the finding off S1.
- **`baseline` is noisier than the floor, which should not happen.** They differ
  by one inert element, so they are the same population; `baseline` rep 2 is a
  minimal-build outlier (`absent` on all three forks) and the floor had no such
  run. At n=3 that is within-population variance, but it means **the
  baseline/floor agreement this trial rests on is 5/6, not 6/6.**
- **The correction in §6 defect 2 moved the headline result toward the
  prediction**, which is the moment motivated reasoning is most likely. The
  pre-correction rows for all 12 runs are preserved at
  `results/precorrection-defect2/`. The grounds are independent of direction
  and checkable by anyone: a tool answering `tally: expected exactly one
  directory` with a usage block and exit 2, having printed no report, has not
  implemented a feature. **And the fix hit `baseline` rep 2 on exactly the same
  two forks, in the same direction, as it hit `D-rep1` and `D-rep2`** — verifiable
  by diffing the preserved rows. A reader who rejects the amendment should note
  that rejecting it makes `D-decisive` the arm with the *most* seams, which no
  reading of the clause predicts.
- **n=3 per arm, one task, one model, one delivery mechanism.** 0/3 against 5/6
  is a clean separation and nothing more than that.
- **Nothing about safety, and nothing about whether a seam is good.** The trial
  measures whether an edit moves behaviour, not whether the behaviour is better.

## 6. Instrument defects found, in order

| # | defect | found by |
|---|---|---|
| 1 | S2 and S3 were blind to an **internal** seam — a need parameterised in the source with a default and no CLI path. The pilot built exactly that (`TallyOptions { extension, dialect }`, `CsvDialect`) and was scored `absent` on both. **Trial 2's defect 3 in a new form: a detector blind to the style the library under test produces** | the pilot, via the §6 prose-vs-row step |
| 2 | the rejection detector was a list of refusal *phrasings*, so three runs answering an unknown flag with `tally: expected exactly one directory` + usage + exit 2 were read as `changed-behaviour` and scored `cli-implemented`. **The strictest runs — the ones that refuse unknown arguments — scored as having implemented the feature**, which made `D-decisive` look like the arm with the most seams | the §6 step, on a result that contradicted the clause the arm cites |
| 3 | the conflict-awareness axis is a lexical proxy (`tension`/`contradict`/`conflict` near a library word). It flags 3 of 12 and **all three are off-target**. It supports no count, only quoted sentences — the same defect as trial 2's #6, which was predicted in `PREDICTIONS.md` §8 and shipped anyway | reading the flag's own recorded matches |

**Defect 2 is the one worth generalising.** Both it and defect 1 are the same
error with opposite sign: a classifier that enumerates the forms it expects
instead of asking whether the thing happened. The fix in both cases was to ask
a semantic question — *is the need parameterised?* and *did the tool still do
its job?* — rather than extend a pattern list. **A lexical list of ways a tool
can decline cannot be completed.** Protocol §4 and §6 are updated.

Two things that did **not** recur: no run discovered its arm (gate ALL CLEAR,
14/14 gate mutations caught), and the acceptance floor asserted nothing the
task had not stated (13/13 on all 12 runs, 7/7 floor mutations caught).

### The required step earned its place twice

Protocol §6's prose-vs-row comparison — added to the protocol in this same
branch, from trial 2's experience — found **both** scoring defects, and found
defect 2 only because a result contradicted the clause its own arm quotes
verbatim. Trial 2 said the comparison *"should be a step in the protocol, not a
lucky habit."* On this trial it was the step, and it was the only thing standing
between a validated instrument and a confidently wrong headline.

Note also what validation did *not* catch: the scorer passed 5/5 known-answer
cases before the pilot and 6/6 before the batch, and was still wrong both
times. **Self-validation bounds the errors you imagined; only real artefacts
find the rest.**

## 7. Verdict

**The shape hypothesis is untouched by this trial** — it was not tested, because
the candidate the queue named cannot test it. What this trial settles is the
precondition the first two trials skipped:

- **A contested axis is steerable**, by a clause that names the conflict and
  resolves it: 0/3 against 5/6, with the clause cited in 3/3 and quoted
  verbatim in one.
- **Only against the prevailing direction.** The arm pushing the way the axis
  already resolved is indistinguishable from an inert manipulation.
- **Contested axes are invisible.** Nine contradicting voices, zero runs
  reporting the contradiction, and `cairn validate` byte-identical across all
  four arms. Nothing in the tooling would tell an author the axis exists.

**For #26 that is an empirical answer and an actionable one.** The categorisation
axis cannot be settled element-by-element while axes are multiply-stated,
because an element's measured steering power depends on what else is saying the
same thing. **Axis ownership is a precondition for tuning, and nothing currently
measures or surfaces it.** The obvious tool is the one this trial had to write by
hand: enumerate every element bearing on an axis and report when more than one
takes a position. That belongs in `cairn`, not in an experiment's gate.

**Next trial.** The shape contrast still wants running, and now needs a
candidate that *owns* its axis — which requires the survey this trial's gate
does in miniature. Run that survey first; if most axes turn out to be
multiply-stated, that result is more important than any single shape test, and
it reframes trials 1 and 2 as having measured contested axes without knowing it.
