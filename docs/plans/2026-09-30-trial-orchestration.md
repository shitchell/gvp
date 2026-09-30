# Trial orchestration — running many manipulation checks on low context

> **Status:** design, for an orchestrator agent to execute.
> **Written:** 2026-09-30, after the first manipulation check
> (`experiments/2026-09-manipulation-check/FINDINGS.md`) cost four instrument
> defects and roughly six hours to produce one usable row per arm.
> **Purpose:** make the *next* twenty trials cost a fraction of that, and make
> them runnable by an agent that has never seen this conversation.

---

## 1. Why this document exists

The first check worked, but it was run by an agent holding the entire design in
context. That does not scale and it does not survive a fresh session. Three
specific costs to remove:

1. **Four contamination channels were patched reactively**, three of them found
   by the runs rather than the author. They were never enumerated up front.
2. **Every artefact was bespoke.** The task, the scorer, the floor and the
   variants were authored inline, so nothing carried to the next element.
3. **The orchestrator did the scoring by hand**, re-deriving the comparison
   table after each result and holding twelve rows in context.

The fix for all three is the same: **make a trial a data structure, not a
narrative.** An orchestrator should read one manifest, dispatch, and read one
table — never the twelve reports.

## 2. What an orchestrator must know before it starts

Load these, in this order, and nothing else:

| read | why |
|---|---|
| `docs/philosophy.md` | why fuzzy categories are deliberate, and that the framework serves alignment rather than the user — this is the *point* of the project, and a trial that optimises for a flattering result has failed |
| `skills/cairn/SKILL.md` | the element categories and the hard/soft test. **The categorisation axis is the independent variable in most trials** |
| `experiments/2026-09-manipulation-check/FINDINGS.md` | the one result so far, and its §6 list of instrument defects. Do not rediscover them |
| `experiments/2026-09-manipulation-check/PREDICTIONS.md` | what a pre-registration looks like, including how amendments are recorded |
| this document | the protocol |

**Do not load** the built run projects, the twelve `DECISIONS.md` files, or the
prior transcript. They are evidence, not context. Query them when a number
needs explaining.

`personal:P14` governs this: push context-heavy reading into subagents and
absorb conclusions. The orchestrator's context should hold the manifest, the
results table, and nothing else.

## 3. The core claim to keep in view

The gate is **not** "is the library good". It is:

> Does changing an element change outcomes **predictably**?

And the first result already sharpens it into the hypothesis the next trials
should test:

> **An evaluative element ("weigh these factors, then judge") cannot steer,
> because inverting its conclusion leaves its questions intact. A directive
> element ("never cross this line") might.**

That hypothesis is falsifiable, and it partitions the library into two testable
populations. It is the throughline for everything below.

## 4. Enumerate the channels BEFORE dispatching. This is not optional.

A trial is invalid if a run can discover which variant it is in. The first
check found four channels one at a time. **Enumerate, then close, then gate.**

Known channels, all of which the gate must assert against:

| channel | how it leaks | closure |
|---|---|---|
| VCS metadata | `git diff HEAD` against a copied checkout | build variants with `rsync --exclude=.git`; assert no `.git*` anywhere |
| element **name** vs statement | "Strict typing" over an inference statement is self-contradictory | invert the name alongside the statement, **unless** the name is polarity-neutral (`CH1`'s "Dependency adoption threshold" is) |
| directory names | the agent is told its cwd | opaque hash ids; manifest stored outside the run tree |
| **the machine-wide registry** | `cairn libs search` returns the *original* text; `CLAUDE.md` tells runs to use it | `GVP_REGISTRY_ROOT` per run, seeded only from that run's variant |
| cross-run visibility | `ls ../` shows siblings | opaque ids make siblings uninformative; separate parents if paranoid |
| the task text | a task that hints at the axis biases the outcome | task must state **behaviour only**, never mechanism |
| the floor | an assertion the task never stated smuggles in a preference | floor asserts only what `TASK.md` requires — this was defect #1 |

**New channels will exist.** Before each trial, ask the question that was never
asked the first time: *if this run wanted to know which variant it is in, what
could it read?* Write the answer into the trial's manifest as a closed-channel
list, and extend the gate.

## 5. A trial as a data structure

One YAML file per trial. The orchestrator authors this and nothing else.

```yaml
id: 2026-10-directive-r12
hypothesis: >
  A directive element steers where an evaluative one did not. Inverting a
  "never cross this line" rule flips the outcome; inverting an "evaluate and
  judge" heuristic does not.
element:
  id: code-common:CR1            # "Secrets out of source control" — directive
  shape: directive               # directive | evaluative — the population
  polarity_neutral_name: false   # so the name must be inverted too
task: tasks/config-loader.md     # behaviour-only spec, reusable across trials
forks:                           # each must be binary and mechanically observable
  - id: 1
    need: where credentials are read from
    entails_baseline: env-or-external
    entails_inverted: committed-file
observables:
  scorer: instrument/score-secrets.mjs   # emits one JSON row per run
  floor: instrument/accept/config-loader.sh
arms: [baseline, inverted, null]         # null arm is the noise floor, ALWAYS present
reps: 3
null_element: code-realtime:RTP5         # inert for this task
closed_channels: [vcs, name, dirname, registry, siblings]
```

**Invariants the gate enforces**, unchanged per trial:

- a `null` arm always exists and its element is inert for the task
- exactly one element differs per arm, verified structurally and byte-wise
- the task and prompt are byte-identical across arms (checksummed)
- predictions are frozen before the first dispatch
- the floor asserts only what the task states

## 6. What to reuse rather than rebuild

From `experiments/2026-09-manipulation-check/instrument/`:

- **`leak-audit.py`** — the gate. Extend it per channel; never weaken it.
  Note it caught a false positive *in itself* (flagging hex digits as variant
  signal) — the gate is also fallible and should be mutation-tested.
- **`accept/run.sh`** — the floor pattern: behaviour-only checks, and a
  `.v1` copy kept whenever it changes.
- **`score.mjs`** — the shape to copy: read the finished directory, emit one
  JSON row, no judgement anywhere. Per-trial scorers replace its fork table.
- **The citation capture** — `cited: {element: bool, ids: [...]}` parsed from
  each run's `DECISIONS.md`. This is half the instrument and the first version
  shipped without it.

**Tasks are the reusable asset.** `TASK.md` cost nothing to write and works for
any dependency-axis trial. Build a `tasks/` library; a trial names a task
rather than authoring one.

## 7. The flip × cite table is the actual output

Not "did it flip". Four cells, and three are informative:

| | **cited** | **not cited** |
|---|---|---|
| **flipped** | followed — the intended mechanism | followed implicitly; fine |
| **did not flip** | **decorative-but-cited** — the element is read, quoted, and not driving | never reached the agent — a *delivery* problem, not an element problem |

The first check landed squarely in *did not flip + cited*, which is why it
could rule out delivery and density and name phrasing. **A trial that records
only the flip rate cannot do that.** Always capture both axes.

## 8. Scale and sequencing

- **Serial per trial, parallel within it.** `gvp:P20` constrains concurrent
  *write intent*; isolated run directories are not that. But run the pilot
  alone before the batch.
- **Always pilot an arm that can fail.** The first check piloted `baseline`,
  which by construction contains no tampering and therefore cannot expose a
  tampering tell. **Pilot the inverted arm.**
- **One trial in flight.** The scorer, floor and gate change per trial; two
  concurrent trials mean two instruments and no way to attribute a defect.
- **Batch elements by shape, not by convenience.** Three directive elements
  tell you about directives. One of each tells you nothing.

## 9. The candidate queue

Ordered by what each would settle:

1. **A directive rule** — `code-common:CR1` (secrets out of source control) or
   `code-common:CR2` (no scaffolding without explicit verification). Directly
   tests §3's hypothesis. **Run this first.**
2. **A second evaluative element** — `code-common:CH2` (deferral decision tree).
   If it also fails to steer, the shape claim generalises past `CH1`.
3. **A genuine heuristic by the hard/soft test** — `code-common:CH1` fails that
   test; `personal:H5` or `code-testing:TH1` may pass it. Tests whether the
   *category* predicts steering power, which would make the categorisation axis
   (#26) empirically grounded rather than definitional.
4. **A value** — `personal:V5` (data preservation). Values are the most
   reusable layer and the least directive; if they steer, the shape hypothesis
   is wrong.
5. **Delivery, not content** — same element, injected at session start versus
   requiring a `cairn` call. This is arm 3 of the main design and the only
   thing that tests the *"not auto-injected"* objection.

## 10. What would falsify the shape hypothesis

State it before running, and honour it:

- **a directive element also fails to flip** → the problem is not phrasing;
  suspect delivery or that the model's priors dominate regardless, and the
  arm experiment is not worth building at all
- **an evaluative element does flip** → `CH1` is a special case, not a class,
  and §3's generalisation must be withdrawn
- **the null arm flips** → variance dominates at this n; raise reps or find a
  task with sharper forks before believing anything
- **flip rates track category rather than shape** → the categorisation axis is
  the better predictor and the hypothesis should be restated in its terms

## 11. Reporting

One `FINDINGS.md` per trial, in the shape of the first one: question, results
table, the finding, **what cannot be claimed**, scope, instrument defects, and
a verdict on whatever gate the trial was gating. Keep the *what cannot be
claimed* section — it is the part that makes the rest credible, and the first
check's headline number is unverified precisely because that section says so.

Append each trial's one-line result to `experiments/REGISTER.md` so the
population-level picture (do directives steer? do evaluatives not?) accumulates
without anyone reading twenty documents.
