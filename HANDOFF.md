# Handoff — 2026-10-06

> For the agent picking this up. Written at the end of a long session; the
> point is to let you start **small** rather than reconstruct it.
>
> **Work in a branch + worktree.** The previous session committed some things
> directly to `main`, which is not the pattern here.

---

## 1. Read this much, and no more

| read | why |
|---|---|
| `docs/plans/2026-09-30-trial-orchestration.md` | **the protocol.** What to load, how to declare a trial, the contamination channels, the candidate queue |
| `experiments/REGISTER.md` | one line per trial plus "what trial 3 changed about the programme". **Read this before the individual findings** |
| `experiments/2026-10-contested-axis/FINDINGS.md` | the most recent result, and the one that changed the programme's sequencing |
| `experiments/2026-09-manipulation-check/FINDINGS.md` | trial 1, and §6's list of instrument defects. Do not rediscover them |
| `~/.claude/projects/-home-guy-code-git-github-com-shitchell-gvp/memory/MEMORY.md` | project memory — **read the `$HOME` config trap entry before you trust any `cairn validate` output** |

**Do not** load the twelve built run projects, their `DECISIONS.md` files, or
any prior transcript. They are evidence. Query them when a number needs
explaining. `personal:P14`.

## 2. Where things stand

- **`main` = `d1c201a`.** `@principled/cairn@5.1.0` published and matching
  `main`'s `package.json`.
- **23 open issues**, of which #43 and #44 are newer than the last handoff.
  **#44 looks like the same failure family as #23 and #10** (list/structured
  fields written as strings, wedging the library) — check whether they are one
  fix before building three.
- **Three trials complete.** See §3.
- **Trial 3 is on `experiment/contested-axis-trial3`, NOT merged.** 12 runs
  scored, `FINDINGS.md` written, `REGISTER.md` appended, protocol updated.
  Outstanding: merge, push, and comment on #42.
- `cairn` now resolves through a dispatcher at `~/bin/cairn` that runs a
  repo-local build inside a checkout and the global install elsewhere. **The
  instrument pins an absolute cairn path** rather than trusting PATH — a
  PATH-resolved `cairn` inside this repo can be a stale `dist/`.

## 3. The experiment programme — the live thread

Issue **#42**. The gate question is *not* "is the library good" but:

> Does changing an element change outcomes **predictably**?

| trial | element | result |
|---|---|---|
| 1 | `code-common:CH1` (evaluative) | **did not steer.** Cited in 11/12 and described as load-bearing while producing the same outcome at both polarities |
| 2 | `code-common:CR1` (directive) | **steered**, 3/3 on every fork, and 3/3 on a **two-word** narrowing. Cited 12/12 |
| 3 | tie-breaks on a **ten-voice** axis | **steered against the grain only.** 0/3 vs 5/6; the with-the-grain arm was identical to the noise floor |

**The shape hypothesis** — an evaluative element cannot steer because inverting
its conclusion leaves its questions intact, a directive one can — **held through
trial 2 and was not tested by trial 3.**

### Trial 3 withdrew the queue's next item, and that is the thing to absorb

The queue said *"`code-common:CH2`, a second evaluative element"*. Enumeration
killed it: CH2 is a **hybrid** (evaluative classification, directive
consequents), and **nine elements contest its axis** while `personal:P21`
already states what a pro-seam manipulation of CH2 would introduce.

> **Byte-wise one-element is not semantically one-element. Trials 1 and 2 both
> assumed an axis ownership neither checked.**

So **run the axis-ownership survey (protocol §9 item 2c) before any further
shape test.** If most axes are multiply-stated, that reframes trials 1 and 2 and
matters more than any single shape result. It also specifies a tool `cairn`
lacks: nothing reports that ten elements bear on one axis or that two disagree
(#26).

### What trial 3 found, in one line each

- a clause naming a conflict and resolving it **steers** — 0/3 against 5/6,
  cited by 3/3, quoted verbatim by one run
- **only against the prevailing direction.** The arm pushing the way the axis
  already resolved was tally-for-tally identical to the noise floor — trial 1's
  redundancy null, observed directly rather than inferred
- **contested axes are invisible.** Nine contradicting voices, zero runs
  reporting it, and `cairn validate` byte-identical across all four arms
- `personal:H3`'s cost-asymmetry test is what actually mediates, unprompted

**Instrument defects: trial 1 seven, trial 2 seven, trial 3 three.** Across all
three, the recurring one is a classifier that **enumerates the forms it expects
instead of asking whether the thing happened** (trial 2 #3, trial 3 #1 and #2).
Trial 3 #2 scored the *strictest* runs as having implemented the feature they
refuse. Protocol §6 generalises this; read it before writing any scorer.

**And note what validation does not buy you:** trial 3's scorer passed 5/5
known-answer cases before the pilot and 6/6 before the batch, and was wrong both
times. **Only real artefacts find the rest** — which is why protocol §6's
prose-vs-scored-row step is mandatory, not a habit.

## 4. Threads that need the maintainer, not you

- **#37** — `suppress_diagnostics` unions across config layers, so a suppression
  is a one-way door. Design settled except one call: **annotate vs mutate**.
  The pipeline currently mutates diagnostics then needs `strictPromoted` to
  recover what it destroyed; with three authorities that multiplies. Annotating
  also makes §4's trace requirement free. Wants costing, not deciding.
- **#33** — no typed supersession link. **Blocks #30, #31, and the
  local-element-migrates-upstream pattern in #26.** Three needs, one schema
  addition; decide once.
- **#39** — the review queue is inverted against `personal:P15`: new guiding
  elements never surface for review, decisions do. Every guiding element in
  this library's history landed unannounced.

## 5. Quick wins, unblocked, nobody's waiting on them

- **#36's cheap half** — make suppression print *"N diagnostics suppressed by
  config (W003, W005)"*. Independent of the scope question. `gvp:P9`: hide what
  is not needed, but never lose it.
- **#35** — `DEC-2.8`'s `_all.field_schemas` is silently stripped;
  `definitionsSchema` is a plain `z.object`. Declare the key, add a test.
- **#10** — `edit --field-file` on a structured field exits 0, reports
  `Updated`, and then **no command can load the library** — including `edit`,
  so the tool cannot undo it. Currently documented as *"the safe path"*.

## 6. Things that will bite you

**`cairn validate` is cwd-dependent under `$HOME`.** `~/.gvp/config.yaml`
carries `suppress_diagnostics: [W003, W005]` and the project walk-up runs to
the filesystem root, so it is discovered as the *project* config for every cwd
below `$HOME`. Same library: 2 warnings from `~`, 50 from `/tmp`. **Validate
from outside `$HOME` before concluding anything is clean.** (#36)

**The live cairn skill is a symlink into `shitchell/dotfiles`**, not this repo.
The repo copy is downstream and has drifted 80 lines behind before. Check which
is ahead before editing. (memory: `cairn-skill-source-of-truth`)

**`cairn validate` says nothing about an axis pulling both ways.** All four of
trial 3's arms — including two with opposite tie-break clauses injected —
returned byte-identical diagnostics. The tool cannot tell you that ten elements
bear on one axis or that nine of them disagree, so a clean `validate` is not
evidence a library is coherent. (#26)

**`--help` is not an existence oracle.** `review --approve` is real and hidden;
a `--help`-based check "confirmed" it did not exist and shipped that as fact in
three places. Probe by invocation. (`gvp:D70`)

**Decisions claim things the code does not do.** Four found in one day —
`DEC-2.8`, `DEC-2.12`, `DEC-5.5`, `DEC-4.7`, plus `DEC-4.4`'s unimplemented
`--timestamp`. `refs` catch a decision whose *code* moved; nothing catches a
decision whose *claim* stopped being true. (#35)

## 7. Conventions this project actually holds to

- **Serial work by default** (`gvp:P20`). Parallel is an owner-invoked
  exception, and under it subagents contribute **patches** that one orchestrator
  imports (`gvp:S1`) — because six concurrent agents each minted `gvp:D62`.
- **Edit the library through `cairn import`**, `--dry-run` previewed. Never by
  hand. Next free decision id: check, do not guess.
- **Humans review guiding elements, not decisions** (`personal:P15`). Decisions
  may be reviewed by an agent **with `--by` set**, so provenance is honest.
- **Elements are rules/heuristics only if they govern how we *operate*.**
  Product behaviour is a `user_requirement` (decreed) or a `decision` (chosen).
  (#26, and `rule-vs-requirement-vs-decision` in memory)
