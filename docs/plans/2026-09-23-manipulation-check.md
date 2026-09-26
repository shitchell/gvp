# Manipulation check — does changing an element change outcomes?

> **Status:** spec, not run. **Written:** 2026-09-23.
> **Relationship to the main design:** this is the gate on
> `~/GVP-EXPERIMENT-DESIGN-2026-09-23.md`. That document's §2 refines the claim
> under test from *"better"* to *"predictable"*:
>
> > **Does changing an element change outcomes predictably?**
>
> This spec answers only that question. If the answer is no, the 12-run arm
> experiment measures nothing and should not be built. `ai-infra`'s `F-08 ·
> Mechanism before value` — *"building the measuring apparatus before there is
> anything to measure"* — is the same argument arrived at independently.

---

## 1. What this measures, and what it does not

**Measures:** whether elements are *load-bearing* — whether flipping one moves
the outcomes it claims to govern.

**Does not measure:** whether the library is *right*. An element can be
load-bearing and wrong; that is what retrospectives are for, and it is a
separable problem. Two failure modes, deliberately kept apart:

| | what it is | caught by |
|---|---|---|
| **(a) wrong** | the element encodes a belief that doesn't hold | retrospective / audit |
| **(b) epiphenomenal** | the element records what the model would have done anyway | **this check** |

(b) is the dangerous one, and not because it produces bad outcomes — it doesn't,
while the model's inclination holds. It is dangerous because it **corrupts the
retrospective's feedback signal.** Adjust a decorative element, observe no
change, and the natural reading is *"the adjustment was wrong"* rather than
*"that element was never driving anything."* Retrospectives cannot detect (b),
because (b) looks exactly like agreement.

**Consequence:** this procedure is not only a gate. Run on any element, it
classifies load-bearing vs. decorative. That makes it a **standing instrument**
for keeping the retrospective loop honest.

### Field evidence for (b), found by accident (2026-09-25)

The case for measuring (b) was theoretical when this document was written. Two
unrelated instances surfaced within hours of each other during ordinary issue
work, and both are the same shape: **the absence of a signal looked like
health.**

1. **A suppression hid an authoring habit for three months.**
   `~/.gvp/config.yaml` has carried `suppress_diagnostics: [W003, W005]` since
   2026-06-15, and `~/.gvp/library` *is* the gvp-docs working checkout — so the
   library validated clean to its own author throughout. Most of the 23 elements
   that violate the mapping rules were authored *after* that suppression went in
   (`personal:P11` 2026-06-20, `code-common:CP15` 2026-07-21, `personal:P16` and
   `P17` 2026-07-22). The result is not 23 slips; it is **one consistent
   authoring convention that accreted unseen**, because nothing could report it.

2. **Three tests reported green while asserting nothing, for 194 commits.**
   `tests/refs/git-diff-tracer.test.ts` hunted for a specific commit by message
   to build its fixtures. That commit fell outside the test's 20-commit window,
   so three of five tests took an `if (!commit) return` exit and asserted
   nothing at all. A file advertising five passing DEC-10.2 tests was in fact
   checking two substring matches and two non-null values. It surfaced only
   because an unrelated merge pushed the file past its timeout.

Neither was detectable by looking at outcomes, because in both cases the
outcome was *"no finding"* — indistinguishable from *"nothing wrong."* That is
exactly the cell the flip × cite table (§4) exists to separate, arrived at from
two directions that have nothing to do with each other.

**It also sharpens §2's tier predictions.** Instance 1 is a decorative-by-
suppression case and instance 2 a decorative-by-unreachability case, which
suggests a third tier worth considering: an element whose *delivery* is broken
rather than whose *content* is redundant. The flip × cite table already
distinguishes these (*no flip + no cite* = element never reached the agent), but
the tier design in §2 does not yet produce a case that lands there deliberately.

## 2. Design — graded, not binary

A single invert-and-see gives one bit and no noise floor. Instead, invert three
elements chosen to have *different predicted responses*, and register the
predictions in advance.

| tier | selection criterion | prediction when inverted |
|---|---|---|
| **L — load-bearing** | high `alsoConstrains` (names ≥2 *other* decisions it would decide), **not** flagged by the retrofit lens | outcomes flip on the named downstream decisions |
| **R — retrofit** | flagged by the `gvp-coherency` retrofit lens: *"would you have written this element without the decision in front of you?"* → no | little or no flip |
| **N — null** | an element with no bearing on the chosen task | **no flip** |

**Tier N is the noise floor and is not optional.** Without it, a flip in tier L
is indistinguishable from run-to-run variance, which the main design (§5,
"Repetitions") already warns may exceed the effect being measured.

`alsoConstrains` and the retrofit lens both come from the `ai-infra` repo
(`workflows/gvp-convergence.mjs`, `workflows/gvp-coherency.mjs:108`). If the
target library was not built by that pipeline, tier L can be selected by hand —
pick an element that visibly governs ≥2 decisions the task will hit — and tier R
selected by asking the same retrofit question manually.

## 3. Procedure

1. **Fix the target.** Library, elements, and task are specified in §7. Write
   the task text **once**; it is byte-identical in every run.

2. **Fix the minimal infra.** One `CLAUDE.md`, identical in every run, that
   points the agent at the library directory and states how to query it with
   `cairn`. Nothing else. This is the floor below which the framework is not
   running at all — a library that is never surfaced is not a thin arm, it is an
   absent one.

   **This is why the check is a cleaner instrument than the main experiment.**
   Every variant here has a library and identical delivery; the *only* difference
   is one element's polarity. The main design's §7 control #2 (prompt leakage) is
   satisfied structurally rather than by discipline. Arm 0 of the main experiment
   cannot make that claim, since it has nothing to point at.

3. **Build four library variants.** `baseline`, `L-inverted`, `R-inverted`,
   `N-inverted`. Each differs from baseline in exactly one element.

   **Inversion means rewriting the element's statement to assert the opposing
   preference, matched for length, specificity, and tone.** If the inverted
   version is vaguer or shorter than the original, the experiment measures
   writing quality. Match them deliberately.

4. **Run n per variant in isolated directories.** Suggested n=3 → 12 runs. Same
   headline cost as the main experiment at n=3 per arm, but spent on the gating
   question rather than the headline one. No shared state, no shared session; an
   agent that can see another variant's output contaminates the run.

5. **Score blind.** Strip variant labels, randomise order. For each
   pre-registered downstream decision, record which way it went. The prediction
   sheet from §2 is written before any run and is not revised after.

## 4. Record citation as well as outcome

For each run, record separately: **did the outcome flip**, and **did the agent
cite the element**. The 2×2 is the *followed-the-library* vs. *happened-to-agree*
discriminator that the main design (§9) identifies as load-bearing but leaves
under-specified.

| | **cited** | **not cited** |
|---|---|---|
| **flipped** | followed — the intended mechanism | followed implicitly; fine |
| **did not flip** | **over-compliance** — cited to justify a decision it did not drive | element invisible — a *delivery* problem, not an element problem |

The bottom-left cell is the failure mode §3 of the main design names and has no
other detector. The bottom-right cell is the one that would otherwise be
misdiagnosed: it looks like a dead element but is actually an argument for arm 3
(injection), because the content may be fine and simply never reached the agent.

## 5. Decision rule — written before running, honoured after

**Precondition:** only runs that pass the acceptance floor (§8) enter the flip
tally. A run that produced a non-working tool tells you nothing about element
causality; record it, exclude it, and report how many there were per variant —
a variant that fails the floor disproportionately is itself a finding.

- **L flips consistently, N does not** → causality holds. Proceed to the full
  design. This is the only outcome that licenses building the 12-run harness.
- **L does not flip** → the library is decorative under current delivery. The
  main experiment would measure nothing. Stop and diagnose which of the three it
  is: delivery (did it reach the agent?), density (was it buried?), or phrasing
  (was it actionable?). The §4 citation column tells you which.
- **L flips but N flips too** → variance dominates. Nothing is measurable at this
  n or with this task; either raise n or choose a task with sharper forks before
  anything downstream is worth running.
- **R behaves like L** → the retrofit lens is not detecting what it claims, and
  post-hoc authorship is a weaker confound than feared. Good news, and worth
  knowing before §7 of the main design is built around it.

## 6. Cost, and why token count is a metric rather than a budget

12 runs of one small task, plus the prediction sheet and four library variants.
The variants are cheap — one element each, edited by hand. The prediction sheet
is the real work and must be done before any run.

**Record tokens per run, per variant.** Not as a budget constraint but as a
quality signal, in the maintainer's framing: the closer a system gets to the
bare minimum tokens required to produce a working result, the better the system.
So token count is a **dependent variable** here, on equal footing with the flip
rate:

- A variant that produces the same outcome for fewer tokens is a better variant.
- The baseline vs. inverted comparison controls for task difficulty, since the
  task is identical — so a token delta between them is attributable to the
  element, which is exactly the kind of clean read the main experiment's arms
  cannot give.
- Watch specifically for an inverted element costing *more* tokens for the same
  outcome. That is the signature of an element the agent argued with rather than
  followed, and it is invisible to the flip metric alone.

The relevant scarcity is iterations before subscription limits reset, not money.
That argues for the small task specified below first, and larger projects later
once the instrument is known to work.

## 7. The target — filled in

### Library

**The personal library** (`~/.gvp/library/`, 83 elements across `personal`,
`ai-common`, `code-common`, `code-realtime`, `code-testing`, `code-web`) — not
the GVP repo's own, which is specific to GVP and therefore tests a narrower
thing. Query it with:

```
cairn --library ~/.gvp/library/ query --format compact
```

### The three elements

**Tier L — `code-common:CH1 · Dependency adoption threshold`.**

> *"If the useful portion of an external library is approximately 200 lines or
> fewer, write it yourself. Evaluate: what fraction of the library do you
> actually use? Does it fit your architecture? What is the bus factor of the
> maintainer? What is the burden of working around its limitations? If the
> answers favor writing it yourself, do so."*

Chosen for three properties that no other element in the library combines:

1. **Binary, unambiguous observable.** Did a dependency appear in
   `package.json`, or was the code written? No scoring judgment required — this
   removes the largest source of noise in the whole experiment.
2. **Multiple independent instances per run.** The task below contains six
   separate adopt-or-write forks, so one run yields ~6 scored events rather than
   1. At n=3 that is ~18 events per variant, which is what makes the check
   statistically meaningful at a cost 12 runs can bear.
3. **A genuine fork.** Both answers are defensible and the model's prior is
   context-dependent rather than overwhelming.

**Inverted text** (matched for length, structure, and specificity — same
statement-then-four-questions-then-directive shape, so the experiment measures
polarity and not writing quality):

> *"If a maintained external library covers the need, adopt it rather than
> writing your own. Evaluate: is the library actively maintained? Is it widely
> used? Does it handle edge cases you would otherwise have to discover yourself?
> What is the ongoing cost of owning and testing a hand-rolled equivalent? If
> the answers favor adopting the library, do so."*

**Tier R — `code-common:CP7 · Strict typing`** (*"Type hints on all function
signatures… TypeScript over JavaScript"*), inverted to prefer inference and
omit annotations where the compiler can infer. A strong retrofit candidate: it
plausibly records what the model does by default rather than driving it.

*Known limitation, stated rather than hidden:* if CP7-inverted does not flip,
that is ambiguous between *the element is decorative* and *the training prior is
too strong to override*. *The check cannot separate those two* — but it does not
need to, because **the actionable conclusion is identical**: do not expect that
element to control outcomes. CP7 is deliberately chosen as low-stakes and
stylistic so that a non-flip cannot be attributed to a safety prior, which would
be a third and genuinely confounding explanation.

**Tier N — `code-realtime:RTP5 · Frame-rate-independent game logic`**, inverted
to endorse frame-count-based logic. The task has no game loop, no rendering, and
no real-time component, so this element is inert by construction. The
`N-inverted` variant is therefore a **second baseline**, and any flip observed in
it is pure run-to-run variance. That number is the noise floor every tier-L
result must clear.

### The task

**A CLI tool that walks a directory of markdown files with YAML frontmatter and
prints a summary report.** TypeScript on Node. A few hundred lines. No network,
no database, no exotic infrastructure.

It is specified this way because it contains **six independent adopt-or-write
forks**, each one a scoreable event:

| # | need | adopt | write |
|---|---|---|---|
| 1 | argument parsing | `commander` / `yargs` | a `process.argv` loop |
| 2 | frontmatter splitting | `gray-matter` | split on `---` |
| 3 | file walking | `fast-glob` | recursive `fs.readdir` |
| 4 | table output | `cli-table3` | manual column padding |
| 5 | terminal colour | `chalk` | raw ANSI escapes |
| 6 | date formatting | `date-fns` | `toISOString` / `Intl` |

**Plus one built-in over-compliance detector.** YAML parsing itself is a seventh
fork — and it is the one where *baseline CH1 says adopt*, because a YAML parser
is far more than 200 lines. So a correctly-functioning element produces a
**split** result: hand-rolled at forks 1–6, `js-yaml` at fork 7.

That asymmetry is the most informative thing in the design. If the inverted
variant flips all seven uniformly, fine — that is the expected direction. But **if
the *baseline* variant hand-rolls YAML too**, the agent is applying the element
as a blanket rule rather than as the threshold it states, which is precisely the
over-compliance failure mode §3 of the main design names — *citing an element to
justify a poor decision* — caught here for free, in the same runs, with no extra
instrumentation.

### Secondary surface

The task also touches `CP5` (configuration early), `CP12` (state-aware error
handling — malformed frontmatter is the natural trigger), `CP2` (clarity over
cleverness), and `H1`/`CP6` (extraction timing, which are in mild tension with
each other). None of these are manipulated. Record how they land anyway: they
are free observations, and a tension the library has not yet resolved is worth
knowing about before the main experiment depends on it.

## 8. Judging the output — what "good" means, and which sense this check uses

Three distinct questions get conflated under "was the result good". They need
different instruments and they are answered at different stages:

| | question | answered by |
|---|---|---|
| **1** | did it work? | the acceptance floor, below |
| **2** | did it match what the element entails? | the flip metric (§2–§4) |
| **3** | is the element itself right? | retrospective — **not this check** |

### (2) is mechanical, and that is the point

"Correct" here does not mean *what the maintainer prefers*. It means *what the
element entails*. Baseline CH1 entails hand-roll at forks 1–6 and adopt at fork
7; inverted CH1 entails adopt at all seven. Both are **derived**, not preferred —
so no taste judgment enters the scoring loop anywhere. This is the main reason
CH1 was selected over more interesting but more subjective elements.

### (1) The acceptance floor

Without this, a variant could "flip" by producing broken output and still score
as a success. So:

**Every run must pass a fixed, black-box acceptance test** — written once from
the task spec, before any variant is built, identical across all 12 runs, and
driven entirely through the CLI. A fixture directory containing valid
frontmatter, malformed frontmatter, and files with no frontmatter at all; the
tool must produce the specified fields per file and must not crash on the bad
inputs.

**The test states behaviour, never mechanism** (`personal:P3` — *if you rewrote
this in a different language, would the statement still be true?*). It requires
that malformed input is reported rather than crashing; it does **not** say
whether to exit non-zero or skip and continue. That fork belongs to `CP12` and
must stay free, or the instrument smuggles in the answer.

**Give the test to the agent** in every run. `code-testing:TP2` already argues
the test is the executable definition of success, and handing over an identical
test reduces variance on everything *except* the manipulated variable — which is
the entire objective. Runs that fail the floor are recorded and excluded from the
flip tally, not silently dropped.

### (3) Free retrospective input

Twelve builds are being paid for regardless. Record defect count and acceptance
failures per variant. If hand-rolled variants systematically break more than
adopted ones, **CH1's 200-line threshold is miscalibrated** — which is a genuine
finding about the library's correctness, obtained at zero marginal cost from an
experiment not designed to ask for it. It does not affect the gate.

### For the main experiment: three anchors, increasing cost and meaning

"Good" in this framework is *defined by the library*, which is circular unless
something outside the library anchors it. Three anchors exist:

1. **Objective floor** — it works, tests pass. Not circular, but weak: many bad
   designs pass.
2. **Blind preference** — unlabelled outputs, ranked by the maintainer. Not
   circular, but noisy at n=3, and the ranker also authored the library.
3. **Trajectory** — does the project stay maintainable as it grows. Strongest,
   most expensive, and per §2b of the main design the one that actually matters.

Only the third escapes the circle cleanly, and no single-session check can reach
it — see below.

## 9. Deliberately out of scope

**Trajectory effects.** §2b of the main design argues that the failure mode most
worth catching — locally-optimal decisions accumulating into a globally-wrong
result, the flat monolithic file that cannot be maintained — *only appears across
sessions*. This check is single-session by construction and **cannot see it.**

That is a deliberate scoping choice, not an oversight. The two questions are
separable and should be asked in order: *do elements drive outcomes at all?*
(here), then *do they steer a trajectory?* (the main design, which must run
multi-session per arm to answer it — an unresolved tension in that document,
since its §5 currently specifies a single build per run).
