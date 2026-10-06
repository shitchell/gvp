# Delivery & integration roadmap — from bookkeeping to contract

> **Status:** direction, maintained by whoever is steering the experiment
> programme. **Written:** 2026-10-06, immediately after trial 3.
> **Register:** `experiments/REGISTER.md`. **Protocol:**
> `2026-09-30-trial-orchestration.md`.

---

## 1. The suspicion this roadmap exists to resolve

The maintainer, 2026-10-06, setting direction:

> "i think cairn / gvp is great for documentation purposes on its own, but i
> *suspect* that it is largely bookkeeping without creative helpers and
> integrations. something like langchain/lang\* would be my ideal to help
> ensure something closer to a contract, but alas i cannot use claude + lang
> without paying cost prohibitive API token monies :p so we have to try and
> get there more creatively"

And the shape of the integrations wanted:

> "how we might use hooks (git/claude), injections, wrapper scripts which help
> guide next-steps, skeleton projects/scaffolding (e.g.:
> `~/code/git/github.com/shitchell/claude-hooks/`), workflows for
> deterministic steps + output, etc... cairn intentionally integrates with git
> for the purpose of reviews in PRs / commits that say 'hey, you're changing
> this code, which maps to this decision, which was made based on these
> guiding elements... does your change align with those guiding elements?'.
> then you can mix that with dynamically generated class/call diagrams to
> further show/review any neighboring logic your change might impact for
> fairly thorough reviews."

- **Status**: Accepted as the roadmap's frame
- **Context**: three trials run; `@principled/cairn@5.1.0`; Claude Code as the
  agent runtime; no API budget for an external orchestration layer
- **Rationale**: direct quotes above. The constraint that matters: contract
  enforcement must come from the *harness* (hooks, exit codes, deterministic
  gates), not from a paid orchestration framework.

## 2. What the trials already say about this

The suspicion is not just plausible — **three trials of data support it, and
they also say precisely where the value is concentrated.**

| evidence | what it means for integrations |
|---|---|
| Trial 1: `CH1` cited in 11/12 runs, described as load-bearing, zero effect at either polarity | citation ≠ influence. A library can be *read enthusiastically* and still be bookkeeping |
| Trial 1: `baseline` rep 1 reached the predicted outcome **without citing the element at all** | much of a library restates the model's prior. Delivering that part buys nothing |
| Trial 2: a directive steered 3/3, including on a two-word edit | content *can* carry — when it is sharp, unconditional, and contradicts what the model would otherwise do |
| Trial 3: a tie-break steered **only against the prevailing direction**; the with-the-grain arm was identical to the noise floor | **the payload is the delta.** The only part of the library worth delivering loudly is where it *disagrees* with what the agent was about to do |
| Trial 3: nine contradicting voices, zero runs reported the contradiction, `cairn validate` byte-identical across arms | the library disagrees with itself invisibly. No integration can deliver a coherent contract from an incoherent axis |
| Trial 3, `D-rep1`: a run named, unprompted, the exact clause that would have flipped its own decision | the retrospective loop works from the inside — if something *captures* those statements, they are patch candidates |

One sentence of synthesis, which everything below follows from:

> **An integration's job is not to deliver the library. It is to find the
> places where the library contradicts what the agent is about to do, deliver
> exactly those, at the moment they bind, and enforce deterministically where
> a check can be mechanical.**

That is also the honest local answer to the lang\* contract: Claude Code hooks
can **block** (PreToolUse exit 2), git hooks can **refuse** (pre-commit /
pre-push), and deterministic gates can **assert** — the same primitives the
experiment instrument already uses on itself. A contract that costs no API
tokens is a hook that says no.

## 3. The delivery stack, named

Four layers, from passive to binding. Every integration below slots into one:

| layer | mechanism | when it fires | can it enforce? |
|---|---|---|---|
| **L0 ambient** | `CLAUDE.md` pointer, skill, scaffolding | session start, if read | no |
| **L1 injected** | SessionStart / UserPromptSubmit hook output; `project-overview`-style context | start of session/turn | no |
| **L2 reactive** | PreToolUse / PostToolUse hooks keyed on *what the agent is doing* (editing a reffed file, adding a dependency) | at the moment of the act | **yes — exit 2 blocks** |
| **L3 gate** | git pre-commit / pre-push; CI; `cairn validate --strict`; workflow scripts with deterministic steps | at commit/merge | **yes — refuses** |

Every trial so far ran at **L0 only** (a `CLAUDE.md` pointer + the cairn CLI).
Trial 1's verdict — *decorative under this delivery* — is a verdict about L0.
Whether L1/L2 change steering is **queue item 5 in the protocol, still
untested**, and is now the gating experiment for this whole roadmap (§6).

## 4. The roadmap

Ordered. Each item names its layer, what exists already, and — because this
programme has learned not to build on assumptions — **the trial that would
justify or kill it.**

### 4.1 `cairn axes` — surface contested axes *(tool gap, blocks everything)*

The one integration trial 3 directly specifies. Nothing today reports that ten
elements bear on one axis or that nine disagree; the trial's gate does it by
hand with a keyword scan. Ship it as a first-class command:

- enumerate elements sharing an axis (tag overlap + keyword/embedding
  clusters — `cairn analyze`'s machinery, which already targets "potential
  conflicts," is the natural home; its stub embeddings are the known gap, T2)
- report axes where >1 element takes a position, and whether positions align
- `--strict` mode for CI: a *new* element landing on a contested axis without
  a tie-break clause is a warning

Why first: **a contract drawn from a self-contradicting library enforces
noise.** Trial 3 showed a with-the-grain clause does nothing and an
against-the-grain clause works — but only an axis report tells you which one
you are writing. Every delivery mechanism below inherits this.

### 4.2 The review hook — `cairn diff` wrapped in delivery *(L2/L3, the maintainer's core vision)*

The primitive exists, and it resolves at symbol level: `cairn diff` takes the
modified lines, finds the classes/functions containing them, and matches those
symbols against the library's refs — so **any changed line resolves to the
decisions mapping to its containing symbol**, given ref coverage. The
maintainer's stated aim is **100% coverage**, which upgrades the mechanism:
at full coverage, *"this change maps to no decision"* is no longer silence —
it is itself a finding, either an undeclared decision or a coverage gap, and
the hook should say which it suspects. (`cairn validate --coverage` is the
existing gate for the latter.) What is missing is the question asked at the
right moment:

- **git pre-commit (L3):** staged lines resolve to D12 → emit "this code
  maps to D12, decided under `gvp:P9`, `personal:V5` — does the change align?"
  Non-blocking by default; `--strict` blocks commits touching `superseded` or
  `review`-overdue decisions, and flags changed symbols that resolve to *no*
  decision (undeclared decision or coverage gap — at the 100%-coverage aim,
  that distinction is the whole review)
- **Claude PostToolUse on Edit/Write (L2):** same trace, injected as hook
  output the moment the agent edits a reffed file — the agent gets the
  decision context *while the edit is still in working memory*, not at commit
- **PR comment (L3, CI):** `cairn diff --format json` between base and head →
  one comment per touched decision, with its guiding elements inline
- **plus neighboring logic:** `claude-hooks/git/diagrams` already generates
  AST-derived diagrams and diffs them on commit, with a strict-review mode and
  fingerprint tracking. Mix its structural diff into the PR comment: "this
  change touches D12 *and* alters the call graph around `resolveRefs` — these
  are its neighbors."

This is the trial-3 result operationalised: the hook fires precisely when the
agent's action *intersects* a recorded decision — the moment a delta between
intent and library is likeliest to exist.

Trial 2 also supplies the failure mode this closes. Its `baseline` rep 2
followed `CR1` in the `.gitignore` it names — and then hard-coded the live
token in a **test fixture** the element never reached. *"The element governed
the configuration file it names and did not reach the test fixture"*
(trial 2 §3). Element text radiates weakly past the artifacts it names;
a symbol-level diff hook has no such falloff — the test file's symbols resolve
to their decisions like anyone else's.

### 4.3 Delta injection — deliver the contradiction, not the catalog *(L1/L2)*

The naive injection (dump the library at session start) is what trial 1
already discredited at L0: the agent reads it, cites it, and does what it was
going to do. The data-driven version:

- at session start, inject only: **rules** (directives steer — trial 2),
  **tie-break clauses** (steer against the grain — trial 3), and any element
  whose axis report (4.1) marks it as the *losing* side of a contested axis —
  because that is the side the agent will silently override
- at decision time (L2): a PreToolUse hook on Bash watching for
  `npm install|pip install|cargo add` that injects `CH1`/dependency-axis
  elements *only then*. Generalises: wrapper scripts and hooks keyed to
  act-classes (adding a dep, writing a config, touching auth) that deliver the
  two or three elements that bind on that act
- never inject what agrees with the prior. Trial 3: it is indistinguishable
  from nothing, and it spends the finite attention the delta needs

### 4.4 Capture the inside voice *(L2, cheap, compounding)*

`D-rep1` wrote down, unprompted, the exact clause that would have flipped its
own decision. Today that sentence dies in a `DECISIONS.md`. A Stop/SessionEnd
hook (pattern: `claude-hooks/claude/session-log`) that greps session artifacts
for the shapes trial 3 taught us — "would have flipped", "overrode what I
would otherwise", "pull in different directions", "cuts both ways" — and
appends them to a `patch-candidates/` inbox turns every agent session into a
cheap retrospective input. The review queue (#39) is the natural consumer.

### 4.5 Scaffolding that starts the contract *(L0)*

`gvp init` currently creates a skeleton G1 (already flagged as needing design
thought). The roadmap version: init also drops the delivery stack — the
pre-commit hook from 4.2, a `CLAUDE.md` that points at the *delta view* rather
than the whole library, and the hook configs. A new project starts with
enforcement wired, not just files. (Pairs with the existing
`claude-hooks/claude/project-overview` and `generate-docs-index` patterns.)

### 4.6 Workflows for deterministic steps *(L3)*

The experiment instrument is itself the proof of concept: build-variants →
gate → dispatch → collect → score, every step a script, every claim asserted.
The generalisation is a cairn-aware task runner where steps that *can* be
mechanical *must* be (validate, diff, axes, floor checks) and the agent only
fills the gaps between them. This is the closest local analog to a lang\*
chain: sequencing and verification live in scripts; the model is only the
creative segment. Cheapest to adopt incrementally — any repo's release or
review flow can absorb one deterministic step at a time.

## 5. What this is *not*

- **Not a rewrite of delivery before measuring delivery.** Every mechanism
  above is an *arm*. The instrument from trials 1–3 tests delivery mechanisms
  as cheaply as it tests elements. §6.
- **Not injection maximalism.** The trials say most of the library is prior-
  restating; delivering more of it louder is spending attention on decoration.
- **Not a lang\* clone.** The contract primitives here are hooks that block
  and gates that refuse — weaker than typed chains, but they run at zero
  marginal token cost and they are *testable with the instrument we have*.

## 6. The empirical spine — what gates what

The bare-bones response testing stays the backbone ("the stronger we can make
it by reviewing / testing how agents respond to it in a bare bones sort of way
the better"). Order, with each step gating the next:

1. **Axis-ownership survey** (protocol §9 2c, already queued). Gates all
   shape tests *and* 4.1's design — it is 4.1 run by hand once.
2. **Delivery trial** (protocol queue item 5, now promoted): same directive
   element, arms = L0 pointer vs L1 injection vs L2 reactive hook. This is the
   experiment the whole roadmap rests on — if L2 doesn't out-steer L0, the
   hook investment is decoration too, and we need to know that *before*
   building 4.2/4.3 out.
3. **Arm experiment** (trial 2's verdict: worth building, on directives) —
   runs with whatever delivery layer step 2 crowns.
4. **Each shipped integration gets a trial row.** `REGISTER.md` grows a
   delivery column; an integration that cannot move a measured outcome gets
   the trial-1 verdict and is retired. The suspicion in §1 stays falsifiable
   in both directions — including against the integrations themselves.

## 7. Standing cautions, inherited from the trials

- **Hooks are channels.** A hook that injects element text into a trial run is
  a contamination vector; the delivery trial's gate must checksum hook output
  per arm, same as `TASK.md`.
- **Semantic questions, not pattern lists** (protocol §6): 4.4's capture
  greps are a starting heuristic and will be wrong in the ways trial 3's
  lexical proxies were wrong — they feed an inbox a human reviews, never a
  count anyone reports.
- **A clean `validate` is not coherence** — do not let any integration imply
  otherwise in its messaging until 4.1 exists.
