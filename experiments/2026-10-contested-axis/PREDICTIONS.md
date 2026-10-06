# Pre-registration — trial 3, the contested axis

> **Frozen before the first dispatch.** Amendments are appended at the bottom
> with the dispatch they preceded, never edited into the body — trial 2's
> Amendment 3 retracted a claim Amendment 2 made, and that history is the point.
> Declaration: `TRIAL.yaml`. Protocol:
> `../../docs/plans/2026-09-30-trial-orchestration.md`.

---

## 1. The question

Trials 1 and 2 each manipulated one element and asked whether the outcome
moved. Neither checked whether the manipulated element was the **only** element
speaking to its axis. Trial 3's enumeration found that the axis the protocol's
queue pointed at next — deferral and flex points — carries **nine voices that
contradict each other** (`TRIAL.yaml:axis`).

So the question is not "does CH2 steer". It is:

> **When a library disagrees with itself on an axis, can it be steered at
> all — and does an explicit tie-break do it?**

This matters more than another shape instance. A library that cannot be tuned
one element at a time cannot be tuned by retrospective, which is the mechanism
the whole framework rests on.

## 2. Why these two arms, and not element removal

The obvious design gives CH2 sole ownership by deleting the eight co-stating
elements. Rejected before dispatch, for the reasons in
`TRIAL.yaml:invariant_deviations`: eight id gaps is the exact tell trial 2's
§10 rejected a no-element arm over, and the result would generalise only to a
library where one element owns an axis — which this one is not.

Instead both decisive arms are **purely additive tie-break clauses** that name
the conflict and resolve it, in opposite directions. The library already does
cross-element reference natively (`personal:V7` — *"(Distinct from V3
Composability…)"*; `personal:H3` — *"The complement to the deferral tree"*), so
the idiom is not itself a tell.

## 3. The arms, byte-exact

### `baseline` — zero tampering

The real library. The contradiction ships as-is. **This arm requires no variant
build**, which also means it carries no tampering tell of any kind — the
cleanest control either previous trial has had.

### `D-decisive` — tie-break toward deferral

`code-common:CH2`, name and id unchanged, clause appended to branch 3:

> If a feature is needed for stability or correctness: implement now. If a
> feature is additive and its access patterns are unknown: add flex points
> (interfaces, config hooks) without implementing the feature. If a feature is
> speculative with no concrete use case: defer entirely with no flex points.
> **(Where this meets `personal:P21`'s preference for many early flex points,
> this tree governs: no concrete use case means no seam.)**

### `A-decisive` — tie-break toward the seam

`personal:P21`, name and id unchanged, clause appended:

> Favor creating many flex points in early builds, exposed as config options,
> to aid the process of experimenting to discover the best use of the tool.
> **(Where this meets `code-common:CH2`'s third branch, this principle governs:
> no concrete use case yet still means a seam.)**

### Symmetry, asserted by the gate

The two clauses must be equally forceful or a difference between the arms is
about rhetoric rather than direction. Both use the identical construction
*"(Where this meets `<id>`'s …, this governs: no concrete use case …)"* and
resolve on the same final noun, differing only in whether a seam results:

| | clause | words |
|---|---|---|
| `D` | …this tree governs: no concrete use case means **no seam**. | 20 |
| `A` | …this principle governs: no concrete use case yet still means **a seam**. | 18 |

The gate asserts the two clauses differ by **no more than four words**, both
contain the `(Where this meets` construction, and both end on `seam.)`. If an
assertion fails the arms are rebuilt — the assertion is not loosened.

### The tag glossary is part of the axis, and is not a channel

Checking for trial 1's defect 7 (a tag gloss stating the element's position)
found something sharper: **the contest is inside CH2's own tag set.** CH2 is
tagged both `simplicity` — *"Reducing complexity, preferring minimal
solutions"* — and `maintainability` — *"Naming, structure, **extensibility**,
testability"*. One gloss points at deferral, the other at seams, on the same
element. `personal:P21` carries `autonomy` — *"User control, opt-in, meaningful
choices"* — which leans weakly toward seams, config options being meaningful
choices.

This is a confound, not a leak, and the distinction is mechanical: the glosses
are byte-identical across all four arms, and **no arm inverts anything**, so no
arm's library contradicts its own glossary. Trial 1's defect 7 was a leak
precisely because its inverted null arm did. The gate asserts the glosses are
identical across arms rather than taking the argument on trust.

### `N-inverted` — the noise floor

`code-web:WP3`, subresource integrity pinning, inverted. Inert for a Node CLI
that makes no network request and loads no subresources. Present because trial
2's defect 2 was caught **only** by the floor moving.

## 4. The forks, and how each is scored

The task specifies **zero command-line flags** (`../tasks/csv-tally.md`), so
every flag a run adds is an affordance for something the task never required.
That is what makes the seam mechanically observable rather than a judgement
about whether an abstraction was warranted.

| fork | question | levels |
|---|---|---|
| **S1** | an affordance for an output form other than the specified one | `absent` / `seam-only` / `implemented` |
| **S2** | an affordance for inputs beyond `*.csv` directly under the directory | `absent` / `seam-only` / `implemented` |
| **S3** | a declared extension point in the source | `absent` / `present` |

`seam-only` means the affordance is present but inert — the flag parses and
changes nothing, the type has exactly one implementor, the config key is read
and unused. `implemented` means it changes observable behaviour. **Both are
distinguished by invocation, not by reading the source**, wherever invocation
can settle it.

Per protocol §6, every level in `results/*.json` carries the evidence string it
came from, and **each run's `DECISIONS.md` is read against its scored row
before any arm is summarised.** Three of trial 2's seven defects were found
that way and no other way.

Forks are reported per run and **never pooled into a rate** — trial 1's defect
5 was averaging over forks that were not independent.

## 5. Predictions, frozen

**The decisive arms are predicted. The baseline is the measurement.**

| arm | S1 | S2 | S3 |
|---|---|---|---|
| `D-decisive` | `absent` 3/3 | `absent` 3/3 | `absent` 3/3 |
| `A-decisive` | not `absent` 3/3 | not `absent` 3/3 | `present` 3/3 |
| `N-inverted` | matches `baseline` | matches `baseline` | matches `baseline` |

`baseline` is exploratory, but **not unfalsifiable** — two things are predicted
about it:

1. **Inconsistency.** At least one of the three baseline reps differs from the
   other two on S1 or S2. A contested axis with no tie-break should not produce
   a uniform answer. *Falsified if all three baseline reps agree on every fork.*
2. **Low conflict-awareness.** At most one of the three baseline reps states in
   `DECISIONS.md` that the library's guidance on this axis is in tension with
   itself. *Falsified if two or more do.*

Prediction 2 is the one I expect to be wrong, and it is the most interesting
cell in the trial: a run that notices the library contradicting itself and says
so is doing exactly what the framework would want, and would reframe the
contested axis as a feature rather than a defect.

## 6. Scoring exclusions, pre-registered

`--help`/`-h` and `--version`/`-V` are excluded from every fork. They are
universal to CLIs and are not feature seams; counting them would manufacture
the observation the trial measures. This is trial 2's defect 1 generalised —
the instrument must not assert anything the task did not state, and must not
*observe* anything that would be there regardless of the library.

## 7. Decision rule

Read in this order; the first matching branch is the finding.

1. **`N-inverted` does not match `baseline`** → variance dominates at n=3.
   Nothing else in the trial is interpretable. Raise reps or sharpen the forks
   before believing any other cell.
2. **`D` and `A` separate as predicted** → an explicit tie-break steers a
   contested axis. Contested axes are tunable, but by *adding a resolution*,
   not by editing one voice. Direct, actionable answer for #26.
3. **`D` and `A` both track `baseline`** → a contested axis cannot be steered
   even by an explicit tie-break. The axis must be de-conflicted before any
   element on it can be tuned, and the retrospective-tuning premise needs
   axis ownership as a precondition. The strongest possible result for #26,
   and the most damaging to the framework as currently practised.
4. **`baseline` is consistent and equals one of `D`/`A`** → something already
   resolves the contest without being asked to. Identify what: `personal:P1`
   mediating, element specificity, library ordering, or the model's prior. That
   becomes trial 4.
5. **`D` and `A` separate in the *wrong* directions** → the instrument is
   wrong, not the library. Stop and audit the scorer.

## 8. What this trial cannot claim, stated before it runs

- **Nothing about CH2 or P21 as elements.** The arms are tie-break clauses, and
  the axis has nine voices. Attribution to a single element is exactly what
  this design gives up — and it is the attribution trials 1 and 2 assumed
  without checking.
- **Nothing about what the axis adds over the model's prior.** There is no arm
  without the nine elements. Same limit trial 2 declared.
- **Nothing about shape.** The directive-vs-evaluative contrast needs an axis
  with a single owner, and this axis has nine. That trial is still unbuilt and
  needs a candidate survey first.
- **n=3 per arm, one task, one model, one delivery mechanism.**
- **Seam-counting is the softest observable used in this programme so far.**
  Trial 2 measured whether a literal token sat in a tracked file. "Is there an
  extension point" is closer to judgement, and S3 especially. If S3 disagrees
  with S1 and S2, trust S1 and S2 — they are settled by invocation.

## 9. Amendments

### Amendment 1 — the fork levels distinguish a CLI affordance from an internal seam

**Recorded after the `A-decisive` pilot (`r0ecbd462a9`), before any further
dispatch. Made after a prediction miss, which is the moment motivated reasoning
is most likely — so the grounds are set out in full and the pre-correction
numbers are preserved at `results/pilot-precorrection.json`.**

The pilot scored `S1=implemented, S2=absent, S3=absent`. Two of the three
contradicted §5's prediction for `A-decisive`. Reading its `DECISIONS.md`
against that row — the step protocol §6 now requires — the scorer is wrong, not
the library. Decision 8 of the run:

> **Chose:** `TallyOptions { extension, dialect }` with defaults (`.csv`, comma,
> double quote), threaded through the core; no `--ext` or `--delimiter` flag.
>
> **Why:** Both are obvious future wants (TSV, pipe-delimited), and wiring them
> in now costs nothing while retrofitting them would reach into every function
> signature. But a CLI flag is a published commitment that is expensive to
> remove, and nothing in the task asks for one — **so the seam exists in the
> library API while the command surface stays minimal.** `personal:P21` and
> `code-common:CH2` pull in different directions here (a seam for a use case
> that does not exist yet versus deferring entirely); **P21 states explicitly
> that it governs that conflict.**

Verified in the source rather than taken from the prose:
`src/tally.ts:21` exports `interface TallyOptions { readonly extension; readonly
dialect }` with `DEFAULT_TALLY_OPTIONS`, threaded as
`tallyDirectory(dir, options = DEFAULT_TALLY_OPTIONS)`; `src/csv.ts:28` exports
`interface CsvDialect`, commented *"so a comma/quote variant (TSV,
pipe-delimited)"*. One implementor, no CLI path, defaults always.

**That is a flex point without the feature — precisely what `CH2`'s branch 2
describes and what `P21` asks for.** The scorer missed it because S2 probed only
CLI flags and S3's name pattern wanted `Formatter|Adapter|Provider|…`, which
`TallyOptions` does not match. **This is trial 2's defect 3 in a new form: a
detector blind to the style the library under test actually produces.** Trial 2
scored a 3/3 flip as no flip for the same reason.

**The fork levels therefore become, for S1 and S2:**

| level | meaning |
|---|---|
| `cli-implemented` | a flag is accepted and changes behaviour |
| `cli-inert` | a flag is accepted and declared in source but changes nothing |
| `internal-seam` | no flag, but the need is parameterised in the source with a default |
| `absent` | neither |

Precedence is top-down; a run with both a working flag and an internal type
scores `cli-implemented`. S3 keeps `absent`/`present` and widens its name
pattern to include `Options|Config|Settings|Dialect|Params|Format`, so it
catches seams for needs §4 did not enumerate.

**Why this is not a correction shaped to help `A-decisive`:**

- It is justified by the run's own artefact, not by the direction it moves the
  result. Protocol §6: a scorer that disagrees with the artefact it scored is
  wrong until proven otherwise. That holds whichever arm the run was in.
- It makes seams **easier to detect in every arm**, `baseline` and `N-inverted`
  included. If it manufactured support for the shape claim it would do so
  symmetrically, which is the opposite of a result-shaped correction — and the
  prediction for `baseline` in §5 is *exploratory*, so there is no baseline
  number this protects.
- The pre-correction row is preserved, and `FINDINGS.md` must report both.

**Predictions for `A-decisive` restated under the new levels** — unchanged in
substance, since §5 said "not `absent`" and "`present`":

| arm | S1 | S2 | S3 |
|---|---|---|---|
| `D-decisive` | `absent` 3/3 | `absent` 3/3 | `absent` 3/3 |
| `A-decisive` | not `absent` 3/3 | not `absent` 3/3 | `present` 3/3 |

**A second observation, recorded now because it was not predicted and must not
be back-fitted later.** The pilot did *not* apply `P21` uniformly. It built the
seam where the pass-through was cheap (decision 8) and deferred where it was
not — decision 19, *"unlike the dialect seam (decision 8) none of them is a
cheap pass-through: recursion changes the record identity from a filename to a
path"*, citing `CH2`'s third branch. That is `personal:H3`'s cost-asymmetry
test — a declared axis voice — resolving the contest case by case rather than
either tie-break winning outright. If the batch repeats it, the finding is about
**which** voice mediates a contested axis, not whether a tie-break steers.
