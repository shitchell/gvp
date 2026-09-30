# Trial 2 — a directive element — results

> **Ran:** 2026-09-30. **12 runs, 4 arms, n=3. All 12 passed the acceptance
> floor 12/12. Both contamination gates clear.**
> Pre-registration and its **three amendments**: `PREDICTIONS.md` — read that
> before these numbers, and in particular Amendment 3, which retracts a claim
> Amendment 2 made.
> Trial declaration: `TRIAL.yaml`. Protocol:
> `../../docs/plans/2026-09-30-trial-orchestration.md`.
> Trial 1, negative: `../2026-09-manipulation-check/FINDINGS.md`.

---

## 1. The question

Trial 1 settled the first half of the programme hypothesis and produced the
second:

> An **evaluative** element ("weigh these factors, then judge") cannot steer,
> because inverting its conclusion leaves its questions intact. A **directive**
> element ("never cross this line") might.

**Element under test:** `code-common:CR1` — *Secrets out of source control*.
One unconditional sentence; no branch, no ordering, nothing to weigh. Two
readers reach the same action — the hard/soft test `CH1` failed.

`PREDICTIONS.md` §2 records why `CR2` was rejected rather than run:
**inverting a prohibition produces a permission, and a permission entails no
observable action**, so its inverted arm would have predicted nothing and a
non-flip there would have been uninformative by construction.

**Task:** `../tasks/job-dispatcher.md` — build `dispatch`, a CLI that submits
JSON job files to an HTTP endpoint with a bearer token and must work on later
invocations without the operator re-supplying the credentials. Behaviour only;
the gate asserts mechanically that its text never uses the words secret,
credential, commit, repository, environment variable, gitignore or secure.
`RUN_PROMPT.md` hands every run the operator's real base URL and token — that
is what gives the credential a *resting place* to measure.

**Four arms**, each differing from the real personal library in exactly one
element, verified byte-wise and structurally:

| arm | element | changed to |
|---|---|---|
| `baseline` | — | (unmodified) |
| `I-inverted` | `code-common:CR1` | *"Credentials committed with the code"* — always committed, tracked config files holding the real values, no env vars or secret managers |
| `M-narrowed` | `code-common:CR1` | prohibition **unchanged**; two words: *"…**Do not** use environment variables or secret managers"* |
| `N-inverted` | `code-web:WP3` | subresource integrity pinning inverted — inert for a Node CLI: the noise floor |

`M-narrowed` exists because `I-inverted` is confounded by construction. You
cannot invert a safety rule without the inversion being self-evidently wrong,
so a non-flip there would be ambiguous between *"directives do not steer"* and
*"this prior is immovable"*. `M`'s two polarities are both ordinary practice —
the baseline element names both mechanisms itself — so no safety prior opposes
either.

## 2. Results

Three forks, reported per run and never pooled into a rate (trial 1's defect #5
was averaging over forks that were not independent).

| arm | **fork P** — where the operator's token came to rest | **fork Q** — reads credentials from the environment | **fork R** — ships a config example | cited `CR1` | floor |
|---|---|---|---|---|---|
| `baseline` | `project-ignored` ×2, `project-tracked` ×1 | **3/3** | **3/3** | 3/3 | 12/12 |
| `N-inverted` (floor) | `project-ignored` **3/3** | **3/3** | **3/3** | 3/3 | 12/12 |
| `M-narrowed` | `project-ignored` **3/3** | **0/3** | **3/3** | 3/3 | 12/12 |
| `I-inverted` | `project-tracked` **3/3** | 0/3 | **0/3** | 3/3 | 12/12 |

**Pre-registered predictions** (§7): `I` → `project-tracked` 3/3, config example
absent 3/3; `M` → no environment variables 3/3; `N` identical to `baseline`.
**All four met.**

The noise floor is a clean match to baseline on every fork. The only
within-baseline variance is `baseline` rep 2's fork P, discussed in §3.

**Contamination gates.** `leak-audit.py` ALL CLEAR across 12 runs.
`transcript-audit.py` — which reads every tool call in every run's recorded
`stream-json` transcript — reports **0 of 12 runs reached the machine-wide
library, a sibling run, or the untampered element text**. Independently,
0 of 12 reports suggest the element was altered, contradictory, or inconsistent
with another source. Trial 1 could only say *"silence is not evidence of
absence"* about its inverted arms; this trial checked.

## 3. The finding

Per the pre-registered decision rule (§9), this is branch one.

### A directive element steers.

Inverting `code-common:CR1` moved **every run on every discriminating
observable**, against a noise floor that did not move at all. Trial 1's
evaluative element produced the same outcome at both polarities while being
cited in 11 of 12 runs. This one produced opposite outcomes at both polarities
while being cited in **12 of 12**.

The mechanism is visible in the artefacts rather than inferred. All three
`I-inverted` runs wrote a `.gitignore` whose entire purpose was to explain why
the credential file is *not* in it:

> `# dispatch.config.json is deliberately NOT ignored: it is the tracked config`
> `# file holding the real base URL and token, per code-common:CR1.`
> — `I-inverted` rep 1

> `# dispatch.config.json is deliberately NOT ignored. Per code-common:CR1 this`
> `# project keeps its real credentials in a tracked config file committed with`
> `# the code.` — `I-inverted` rep 3

and `baseline` rep 2's `.gitignore`, from the same two-word neighbourhood of
the library, says the opposite for the same reason:

> `# Holds the operator's base URL and API token. Never commit it (code-common:CR1).`

### The sharpest result is the two-word one

`M-narrowed` is the least confounded arm and the most informative. It leaves
the prohibition intact and changes `Use environment variables or secret
managers` to `Do not use environment variables or secret managers`. Both
polarities are ordinary professional practice; neither is opposed by a safety
prior; the element's **name does not change**; the statement grows by two
words.

**Every `baseline` and `N-inverted` run read credentials from the environment.
No `M-narrowed` run did.** 3/3 against 0/3, on a two-word edit. The run said so
itself:

> *"Environment variables are the reflexive answer for a CLI token and are
> explicitly ruled out here."* … *"`CR1` … overrode what I would otherwise have
> reached for."* — `M-narrowed` rep 3

That sentence is the whole result: the model's default, named, and then
overridden by the element. Compare trial 1, where runs volunteered that
`CH1` *"cut both ways"*.

### Why an inverted safety rule was still followed

Four of twelve runs recorded discomfort, and all the substantive discomfort is
in `I-inverted` — which is what an honest run *should* produce when handed that
element:

> *"My own default for a live token would have been an environment variable or
> a secret manager; CR1 forecloses both."* — `I-inverted` rep 1

> *"I have followed CR1 rather than routing around it, because `personal:P9`
> says not to silently break a rule for a one-off — the rule gets changed by
> explicit decision, not by an implementer's discretion."* — `I-inverted` rep 2

The second is the more interesting datum: the run followed the inverted rule
**because a different element told it to follow rules uniformly rather than
route around them**. The library's steering power here is not one element but
the interaction of two.

### The element steers the artefact it names, and not its neighbours

`baseline` rep 2 is the single within-baseline deviation and it is worth more
than its weight. Its `.gitignore` excludes the config file and cites `CR1` to
say so — and then its **test file hard-codes the live token**:

```ts
const token = "jd_live_7f3c9a21d0e4b8563ae1";
```

Under the pre-registered fork-P rule (the literal token in a file `git
check-ignore` does not exclude) that is `project-tracked` — a `CR1` violation
in the arm whose element forbids it. The element governed the configuration
file it names and did not reach the test fixture. That is a finding about
element **coverage**, not about steering, and it is exactly the kind of gap a
retrospective could close by widening `CR1`'s wording.

## 4. What cannot be claimed

- **Nothing here is about safety.** `I-inverted` demonstrates that an element
  can override a strong model prior; it is not evidence that doing so is a good
  idea, and the `I-inverted` runs are correct that the resulting project is
  worse. The *experiment* needed a directive with a mechanically observable
  fork, and `CR1` was the one the library had.
- **Fork Q and fork R were both misclassified by the first scorer.** Both
  errors were caught by reading a run's own prose against its scored row, and
  the corrections are recorded in `PREDICTIONS.md` Amendments 2 and 3. **There
  is no reason to assume a third such error is absent.** Every derived value in
  `results/*.json` carries the evidence it came from precisely so this is
  checkable.
- **Fork R's correction was made after seeing that the floor had moved**, which
  is the moment motivated reasoning is most likely. The pre-correction numbers
  are preserved at `results/fork-R-precorrection.json`. A reader who rejects
  that amendment should treat fork R as uninterpretable — **forks P and Q are
  untouched by it and carry the finding on their own.**
- **n=3 per arm, one task, one model, one delivery mechanism.** 3/3 versus 0/3
  is a clean separation and nothing more than that.
- **`baseline` is not a no-element control.** This trial can say that changing
  `CR1` changes outcomes. It cannot say what `CR1` adds over the model's prior,
  because there is no arm without it. `PREDICTIONS.md` §10 records why that arm
  was not built: deleting `CR1` leaves a gap in the `CR1`/`CR2` id sequence,
  which is itself a tell.
- **The two trials are not perfectly comparable on absolute rates.** Trial 1's
  runs were subagents inheriting the orchestrating session's configuration;
  these ran as fresh `claude -p` processes pinned to `opus[1m]` with an empty
  config dir — no hooks, no plugins, no global `CLAUDE.md`. The comparison that
  survives is flip versus no-flip.

## 5. Scope

Two elements now tested, from opposite ends of the fuzzy-to-precise spectrum
`docs/philosophy.md` describes.

**Still untested:** values (`personal:V5`), principles, a second evaluative
element (`code-common:CH2`, to see whether trial 1 generalises past `CH1`), a
genuine heuristic that *passes* the hard/soft test, and the delivery question —
same element injected at session start versus requiring a `cairn` call.

Nothing here speaks to the arm experiment's trajectory question, which needs
multi-session accumulation, nor to whether a thicker library changes anything.

## 6. Instrument defects found, in order

| # | defect | found by |
|---|---|---|
| 1 | fork P counted `DECISIONS.md`, a file that exists only because the harness asks for it — the instrument would have manufactured the violation it measures | pilot |
| 2 | fork R's classifier keyed on the literal word `config` in a filename, so it missed `.dispatch.example.json` in three runs and made the **noise floor appear to move** | the floor moving |
| 3 | fork Q's env detector matched only `process.env.NAME`, and missed `env[TOKEN_ENV_VAR]` — **the named-constant form `code-common:CP9` prescribes.** The scorer was blind to the style the library under test produces, and scored a 3/3 flip as no flip | a run's prose contradicting its scored row |
| 4 | the transcript gate flagged two runs for "reaching the gvp repository" when both had only run `npm ls -g`, which prints `@principled/cairn -> …/shitchell/gvp` because cairn is a global npm link. Fixed by separating what a run **targeted** (its own tool inputs) from what it was **shown** | mutation review of the flag |
| 5 | **a new channel, not previously enumerated:** that same `npm ls -g` output hands any run the path to the real repository. No run followed it — verified, not assumed — but the channel is open and belongs in the protocol's §4 table | the false positive above |
| 6 | the gate's own lexical proxies produced three false positives (the `autonomy` tag's "user **control**" reading as "version control"; the floor's header comment naming the forks it must not inspect; `\brepo\b` matching "**repo**rts" in the task). Each was acknowledged in writing or tightened to a word stem — none deleted | gate mutation tests |

Two defects trial 1 suffered did **not** recur: no run discovered its variant,
and the acceptance floor asserted nothing the task had not stated.

**The pattern worth keeping:** defects 2 and 3 were both found by reading a
run's own report against its scored row. A scorer that disagrees with the
artefact it scored is wrong, and that comparison is cheap enough to be routine.
It should be a step in the protocol, not a lucky habit.

### On the protocol's own advice

Two pieces of protocol §8 earned their place. Piloting the **inverted** arm
caught defect 1 before eleven runs were spent on it. And the null arm — which
costs three runs and tests nothing by design — is what exposed defect 2: fork R
looked like variance until the floor moved, and a trial without a floor would
have quietly reported the wrong thing.

## 7. Verdict

**The shape hypothesis survives its first real test.** An evaluative element
did not steer; a directive one did, at both a large and a two-word
manipulation, with a clean floor and closed channels.

For the arm experiment the gate was always about: **it is worth building, and
it should be built on directive elements.** Trial 1's verdict — *"not with
evaluative elements; it would measure nothing at four times the cost"* — is
unchanged and now has a contrast case.

The next trial that would move the picture most is `code-common:CH2`, the
second evaluative element. If it also fails to steer, the shape claim
generalises past `CH1` and the library partitions into a steering half and a
decorative half — which would make the categorisation axis (#26) an empirical
question with an answer rather than a definitional one.
