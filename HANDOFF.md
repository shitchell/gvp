# Handoff — 2026-09-30

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
| `experiments/2026-09-manipulation-check/FINDINGS.md` | the only experimental result so far, and §6's list of instrument defects. Do not rediscover them |
| `experiments/REGISTER.md` | one line per trial; the population-level picture |
| `~/.claude/projects/-home-guy-code-git-github-com-shitchell-gvp/memory/MEMORY.md` | project memory — **read the `$HOME` config trap entry before you trust any `cairn validate` output** |

**Do not** load the twelve built run projects, their `DECISIONS.md` files, or
any prior transcript. They are evidence. Query them when a number needs
explaining. `personal:P14`.

## 2. Where things stand

- **`main` = `60c5430`, pushed, clean.** 1057 tests pass, `cairn validate` exits 0, review queue empty.
- **`@principled/cairn@5.0.0` is published** and verified from the registry.
- **23 open issues.** Seven were closed this session after verifying each against `main`.
- **One trial complete, negative.** See §3.
- **Trial 2 is mid-flight.** Branch `experiment/directive-cr1-trial2`, commit
  `1bff6ca`. Instrument validated, predictions frozen, **12 run directories
  staged across four arms, 3 complete at time of writing.** Pick it up with
  `instrument/collect.sh` / `summarize.mjs`; `dispatch.sh <variant> <rep>`
  re-runs any that failed. Then write `FINDINGS.md` in trial 1's shape, append
  to `REGISTER.md`, and comment on #42.
  **It was dispatched without a worktree, which switched the main checkout's
  branch mid-session. Use a worktree.**

## 3. The experiment programme — the live thread

Issue **#42**. The gate question is *not* "is the library good" but:

> Does changing an element change outcomes **predictably**?

**Trial 1 result: no, for the element tested.** `code-common:CH1` was cited in
11 of 12 runs and described by several as load-bearing, while producing the
same outcome at both polarities. Inverted arm 1/15 adoptions against a
predicted 15/15; noise floor 0/15.

**The hypothesis this produced, which trial 2 tests:**

> An **evaluative** element ("weigh these factors, then judge") cannot steer,
> because inverting its conclusion leaves its questions intact. A **directive**
> element ("never cross this line") might.

The sharpest single data point: `baseline` rep 1 reached the predicted outcome
**without citing `CH1` at all** — the model's prior, with the element agreeing
alongside it.

**What trial 1 cost:** seven instrument defects, **four found by something
other than the author** — three by the runs, and one (its null arm's tag-gloss
leak) by trial 2's channel enumeration, after the trial had already reported. The pattern — channels patched reactively, never enumerated
— is what protocol §4 exists to prevent. Read it before building anything.

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
