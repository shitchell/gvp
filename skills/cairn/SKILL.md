---
name: cairn
description: Use when working with GVP (Goals, Values, Principles) libraries, decision traceability, cairn CLI, or when the user asks to document/track decisions. Also use when a project has a .gvp/ directory or references cairn/GVP elements.
---

# Cairn — Decision Traceability Framework

Cairn helps teams and individuals trace every decision back to what drives it. The framework is called GVP (Goals, Values, and Principles); the CLI tool is called Cairn.

## When to Use

- Project has a `.gvp/` directory
- User mentions "GVP", "cairn", "decision traceability", "goals and values"
- User asks to document, track, or review decisions
- User wants to trace an artifact (code, doc, config) back to its justification
- End of a brainstorming/planning session (capture decisions)

## Core Concepts

### GVP Elements

Elements are the building blocks of a GVP library. Each has an `id`, `name`, `maps_to` (traceability links), `tags`, and category-specific fields.

| Category | Prefix | Root? | Purpose | Key Field |
|----------|--------|-------|---------|-----------|
| **Goal** | G | Yes | What we're trying to achieve | `statement` |
| **Value** | V | Yes | What we care about; guides tradeoffs | `statement` |
| **Constraint** | C | Yes | External limitations absolutely outside our control | `impact` |
| **User Requirement** | U | Yes | A stakeholder-decreed mandate, asserted as an input and NOT derivable from a value | `statement` |
| **Exclusion** | X | Yes | A self-imposed, *permanent* out-of-scope boundary (the negative space of goals) | `statement` |
| **Principle** | P | No | Soft, values-derived guideline — expresses a *preference/priority* where subjective judgment remains | `statement` |
| **Heuristic** | H | No | Hard, near-deterministic `if X → do Y` rule for **how we choose** among options, or **how we operate within the project** (as close to executable code as language gets) | `statement` |
| **Rule** | R | No | Unconditional, *value-derived* constraint on a class of decisions — a hard binary for **how we operate within the project** (contrast **User Requirement**, which is *decreed*, not derived) | `statement` |
| **Decision** | D | No | Specific choices with rationale + alternatives; carries a `disposition` (`accepted` / `declined` / `deferred`) | `rationale` |
| **Milestone** | M | No | Checkpoints tied to goals | `description` |

**Root elements** (goals, values, constraints, user requirements, exclusions) are the top of the traceability chain — they don't need to map to anything. **Non-root elements** must anchor to at least one **non-value root** (a goal, constraint, user requirement, or exclusion); where a *goal* is the anchor, a *value* is required too. The value anchor is enforced **softly and transitively** (warning `W017` NO_VALUE_TRACE), not as a hard error — because the value that justifies a requirement/constraint-driven choice often lives upstream in an inherited org/personal library, and forcing a local stub just manufactures hollow values. (Pre-1.1.0 the rule was strictly "a goal AND a value"; the mapping model generalized — see `schema-reference.md`.)

#### Categories

**Root elements** are those which require no mapping. They stand on their own. That said, while **goals**, **values**, **constraints**, **user requirements**, and **exclusions** have no mapping *requirement*, it is strongly encouraged that they still map to other elements as applicable. A user requirement in particular is encouraged to map to the **value it resonates with** — but that link means "partially-motivated-by," NOT "derived-from" (if it were fully derivable it would be a rule, not a requirement).

**Guiding elements** are all non-decision elements. They guide *how* we make decisions and *why*.

#### How to distinguish

##### First: the product/practice axis

**Apply this before any other test on this page.** Ask:

> **Does this describe how we work, or what the thing does?**
>
> - **Practice** (how we work) → **rule** / **heuristic** / **procedure**
> - **Product** (what the thing does) → **user_requirement** if it was decreed, **decision** if it was chosen

Rules and heuristics are about *operating within the project*. A rule is a hard binary for how we operate — "no storing secrets in plaintext," "use the cloud vault." A heuristic is either (a) how we choose among an array of implementation/design options, or (b) how we operate within the project. Neither describes product behaviour, however durable that behaviour is.

This is the single most common authoring error, because "unconditional, value-derived constraint on a class of decisions" is *also* satisfied by a product-behaviour statement. It isn't enough on its own. Run the product/practice test first.

**Worked pair — rules:**

- ❌ `R1: Habit data is stored in a human-readable plain-text file` — describes what the file **is**. That is product. Not a rule, no matter how durable.
- ✅ `R: Any change to the on-disk log format ships with a test that reads a file written by the previous format` — describes what we **do when we change it**. That is practice. It binds a class of future work and survives a rewrite.

**Worked pair — heuristics:**

- ❌ `H1: A missing date means today` — product behaviour. A decision (or a requirement, if decreed).
- ✅ `H2: If it can be recomputed from the log, do not persist it — only persist it if a measured read takes longer than a user will wait` — how we **decide**, with a checkable condition.

Every rule in a mature library reads as operating practice. `personal:R1` (verify before claiming correctness), `personal:R2` (no silent failures), `code-common:CR1` (secrets out of source control), `code-common:CR2` (no scaffolding without explicit verification), this project's `R6` (subcommands and renderers dispatch on schema, not field names) — none of them describe what a product does.

##### Second: the source test — which *document*, not just which category

The same sentence lands in a different category **and a different document** depending on who originated it. "Habit data is stored in plain text" is not one element waiting for a home; it is three different elements depending on where it came from:

| Origin of "data is stored in plain text" | Category | Document |
|---|---|---|
| The person requesting the feature | `user_requirement` (decreed, not derived) | project doc (`project.yaml`) |
| Design phase / design agent | `decision` (architectural) | project doc (`project.yaml`) |
| Implementation agent | `decision` (implementation form) | `v1.yaml` / impl doc |
| — | **never a rule** | — |

So when you catch yourself unsure which document an element belongs in, ask who originated it. Stakeholder mandates and architecture live at project level; the form a decision takes in *this* build lives at implementation level.

**Do not weld the two altitudes into one decision.** A real example: `D1: Store completions as newline-delimited JSON in an XDG data file` welds an architectural decision (*completions are an append-only event log*) to an implementation decision (*JSONL at `$XDG_DATA_HOME`*). Split, the architectural decision survives a storage rewrite and keeps guiding. Welded, it dies with the format, and every consequence that flowed from "append-only event log" loses its justification. This is `personal:P3` (separate *what* from *how* at every layer) applied to the library itself.

##### Principle vs Heuristic

**The hard/soft test.** A **heuristic** must reduce to a near-deterministic decision tree: given its inputs, two readers should reach the *same* action with little judgment ("if a future need is identified AND retrofit cost clearly exceeds build-now cost, build now; else defer"). If choosing still requires weighing soft preferences among two or three options — that's a **principle**, not a heuristic. When unsure: can you express it as `if/elif/else` with checkable, quantifiable conditions? Heuristic. Does it say "prefer X over Y, generally"? Principle. (Mis-filing a soft preference as a heuristic is a common error — when authoring, apply this test, and flag pre-existing elements that fail it for reclassification.)

Notably: all principles are effectively vague heuristics. Ideally, all principles could graduate to heuristics, but we are careful to do so trying to ensure we do not create heuristics that fail under stress. Only if we are largely confident that a heuristic is valid in all feasible scenarios do we graduate a principle. Otherwise, we retain the principle so that judgment can be applied where helpful.

##### Principle vs Value

**The sentiment/adjective test.** A **principle** provides direction while a **value** generally provides a 1-3 word *sentiment*. Integrity, user-autonomy, extensibility... these are values. Small keywords and phrases that provide basic building blocks of our direction. Principles help bridge the gap between heuristics (precisely how we apply values in the pursuit of our goals) and values.

##### Value vs Goal

**The state test.** Goals describe a state; values describe abstract concepts. That said, the line can be fuzzy. One might, in everyday discourse, say they value *ending homelessness*. But it would also be accurate to describe the end of homelessness as a state. In such fuzzy scenarios, it is encouraged to try and frame it as a state (and define it as a goal), an abstract concept (and define it as a value), or both. Whatever the case, the best action is simply to get it down more than fret over a specific categorization. Conceptualization is inherently fuzzy and imprecise; tracking is the primary goal.

##### Guiding element vs Decision

*(This test applies to **every** guiding category — principle, heuristic, rule, procedure — not only rules. If you are reaching for "principle," you still have to pass it.)*

**The guiding/guided test.** Both involve a choice — every guiding element was, at some point, decided. But the framework categorizes by the *role an element plays in the graph*, not by how it came to be (the same way "isn't every value also kind of a goal?" is true but unhelpful). A **guiding element** is *guiding*: it sits upstream and constrains a *class* of future decisions. A **decision** is *guided*: it's the single choice you made *within* those constraints, for a specific implementation — the output, not the guidance. (A rule is the rule of the game; a decision is a move.) Two tiebreakers: **durability** — would it survive a full rewrite tomorrow? A guiding element outlives any implementation; a decision changes when the implementation changes. **Rationale shape** — if what you want to record is *rejected alternatives and why this won*, it's a decision; if it's *a line future decisions must not cross* or *a preference to apply next time*, it's a guiding element (the guiding element's "why" lives in what it `maps_to`; the decision's "why" lives in its own `rationale` + alternatives). A rule is frequently a decision that earned promotion to a standing constraint — e.g. `R6` ("subcommands and renderers dispatch on schema, not field names") began as implementation work and graduated once it had to bind all future renderers.

##### The specificity tests (over-specification guard)

The characteristic failure when authoring guidance is writing something far more specific than real guidance: **a restated decision wearing guidance's clothes.** It closes today's gap and guides nothing tomorrow — which defeats the point, since the library exists so that *unforeseen* forks fall out coherently, not so that known decisions can be re-derived.

Before filing any guiding element, run all three:

1. **Would this element still make sense on a *different* project?** If not, you have written a decision.
2. **Does it name a specific file, number, function, or API?** That is almost always a decision.
3. **Does its statement read as "we chose X"** rather than *"prefer X over Y"* / *"never cross this line"*? Decision.

**The two-other-decisions guard.** Every guiding element should be able to name **at least two *other* decisions — existing or plausibly future — that it would also decide.** If you cannot name two, it is too specific: generalise it until you can, or drop it.

Anti-example, failing all three tests at once:

> ❌ *"Principle: Use NodeJS TypeScript with Bun.Secrets to ensure cross-platform, secure password management"*

It names specific APIs (test 2), reads as "we chose X" (test 3), would mean nothing on another project (test 1), and decides exactly one thing (the guard). The guidance hiding inside it is something like *"secrets are handled by the platform's keystore, never by our own code"* — which does generalise, does survive a rewrite, and does decide more than one thing.

##### User Requirement vs Rule

**The source/derivability test.** Both are unconditional and durable, but a **rule** is *derived* — it maps to a value and could be re-derived from it ("tests must be falsifiable" ⟸ an evidence value). A **user requirement** *bottoms out at a stakeholder*: hand a reader every goal, value, and principle and it still won't fall out, because its "why" is "someone decreed it," not another element. If you can re-derive it from the values, it's a rule; if it's an irreducible decreed input, it's a requirement.

##### User Requirement vs Goal

Both are roots you want true, but:
- **Gate vs direction (the acceptance test — strongest).** Ship without it: is the result *unacceptable*, or merely *less good*? Fail a **requirement** → the deliverable is *rejected* (a pass/fail gate). Fail a **goal** → you *underachieved* a direction of excellence (worse, still the project).
- **The exception/weighing test.** You *weigh* a goal against other priorities; you do not weigh a requirement — you meet it or you fail it. If you catch yourself saying "it's a gate *unless* I decide the tradeoff is worth overriding," that discretionary, owner-invoked exception makes it a **goal/priority**, not a requirement. (Caveat: a *structured, enforced* opt-out that is part of the element's definition — e.g. a formally-declared no-op enforced at load — can still belong to a rule/requirement; ad-hoc "I'll decide case by case" cannot.)
- **Binary vs stateful.** A requirement is met-or-not *right now* (checkable today); a goal is an open-ended state you're perpetually more/less along and never check off.
- **Not the size test.** Granularity ("epic vs story") correlates but misleads — a huge requirement ("must be GDPR-compliant") is still a requirement; a narrow goal is still a goal. Decide on gate-vs-direction, not scope.

*Worked example.* "A guest can always play with zero account friction" is a **requirement** — a hard gate, never weighed; gate a guest and you've breached it. "Games can be authored end-to-end by an AI" is a **goal** — you'd accept a hand-written game in the shared universe, so non-AI-authorable is *less-good, not unacceptable*; you weigh it against performance. One concept can also project onto several roots at once (AI-authorability is a goal *and* a value): file each facet where it does distinct work rather than forcing one home.

##### User Requirement vs Constraint

**The who-imposes-it test.** Both are givens you design around. A **constraint** is imposed by the *world* and you *cannot* lift it (a browser sandbox, GDPR, latency) — involuntary. A **user requirement** is imposed by a *stakeholder* and you *could* lift it but choose to hold it fixed — decreed-but-revocable.

##### Exclusion vs "a decision not to do it"

**The permanence/revisitability test.** An **exclusion** is a *permanent* out-of-scope boundary — "not our job, ever." A **decision not to do something now** is a Decision with a *live, revisitable* alternative — "not building X *yet*; revisit if trigger Y." A stated trigger to reconsider ⇒ it's a decision (log the alternative + trigger in the decision's `considered`), not an exclusion. (E.g. "we won't build our own engine" is a *decision* if you'd revisit it for a performance-demanding game; it's an *exclusion* only if it's a forever boundary.) Exclusions make "is this in scope?" a checkable query instead of an appeal to an undefined boundary.

##### Value modes (when mapping to a value)

Not every value relates to a decision the same way. An **acceptance-value** *justifies* a choice (profitability, focus/scope-discipline) — decisions map to it. A **filter/veto-value** merely *gates which things you'll accept* (ethics — "I won't build a surveillance app"); it constrains intake and must **not** be mapped as a *driver* of a decision it merely failed to veto ("we built X *because* integrity" is nonsense). Requirements and constraints often bottom out with only an *acceptance*-value, frequently living at org/personal scope — which is why the value anchor is soft (`W017`), not hard.

##### The identity lattice (roots)

The roots aren't a bag of unrelated types — they define what a project *is* and *is not*:

|            | positive                    | negative                   |
|------------|-----------------------------|----------------------------|
| **self**       | Goal — aspirational state   | Exclusion — boundary       |
| **stakeholder**| User Requirement — mandate  | (a requirement not-to)     |
| **world**      | Constraint                  | Constraint                 |

**Value** is the odd one out — not a *point* in the space but a *direction* through it.

### Traceability Direction

```
Goals · Values · Constraints · User Requirements · Exclusions   (roots — the "why" / what we are & aren't)
    ↑ maps_to
Principles & Rules (guidelines — the "how to decide")
    ↑ maps_to
Heuristics (decision recipes — "if X, do Y")
    ↑ maps_to
Decisions (specific choices — the "what" with rationale; disposition: accepted | declined | deferred)
    ↓ refs
Code, Docs, Artifacts (the "where" — what the decision produced)
```

Every decision should trace upward to a root AND (when `accepted`) downward to the artifacts it produced via `refs` — code, documents, configs, or anything else cairn can parse.

**Coverage runs both ways.** Bottom-side: every `accepted` decision should `refs` an artifact (`W012`/`W013`). Top-side: every *actionable* root should be actioned by ≥1 decision (`W018` ROOT_NO_DECISION) — `user_requirement` opts into this via `requires_decision: true`; an `exclusion` is already its own resolution and self-satisfies.

### Decision disposition: accepted | declined | deferred

Every decision carries a `disposition`. `accepted` is the default and the one people reach for; the other two exist to make *not building something* an explicit, recorded stance instead of a silent gap.

- **`accepted`** — we chose this and we are doing it. Should `refs` the artifacts it produced.
- **`declined`** — we considered it and we are **not** doing it. The rationale *is* the deliverable.
- **`deferred`** — not now, but live. Record the trigger that would bring it back.

This is how you action a root you are not building. A `user_requirement` with `requires_decision: true` raises `W018` until *some* decision maps to it — and a `declined` decision satisfies that just as well as an `accepted` one. The difference is that the reader now knows the requirement was seen and consciously refused, rather than dropped.

```yaml
decisions:
  - id: D7
    name: No sync across machines
    disposition: declined
    rationale: >
      "Sync means either a server I have to run or a conflict-resolution
      model I have to explain. Neither is worth it for a single-user tool."
    maps_to: [habits:U2, habits:V1]
    considered:
      file-sync-via-git:
        rationale: "Free transport, but every merge conflict lands on the user."
        conflicts_with: [habits:V1]
```

Because a `declined` or `deferred` decision has no implementation by definition, **both are exempt from the decision-needs-refs check (`W013`)** — the rationale is the record.

Note the neighbouring distinction: a `declined` decision is revisitable, and you log the trigger. A permanent "not our job, ever" boundary is an **exclusion**, not a declined decision (see *Exclusion vs "a decision not to do it"* above).

### Key Distinction: maps_to vs refs

- **`maps_to`**: Traces upward to justification. "This decision exists because of these goals/values."
- **`refs`**: Traces downward to artifacts. "This decision produced these files/functions/docs."

### Refs

Any element can have `refs` linking it to files:

```yaml
refs:
  - file: src/db/connection.ts
    identifier: createPool        # class, function, heading, YAML key
    role: implements              # defines | implements | uses | extends
```

**Refs are not a code feature.** They are domain-agnostic: a ref points at a stable identifier in *any* format cairn has a parser for — TypeScript symbols, Markdown headings, YAML keys are the built-ins. The `identifier` is whatever that format treats as a stable address. A decision that produced a contract clause, a policy document section, or a config key refs it exactly the same way a decision that produced a function does.

The set is **extensible**: supporting a new format means teaching cairn how to map a ref string to a line in a file. Nothing about `refs` assumes source code, and a non-software library is not using them "loosely."

### Library Structure

```
.gvp/
  library/           ← GVP documents (YAML)
    project.yaml     ← project-level elements
    v1.yaml          ← implementation-level elements (optional)
  config.yaml        ← project config (committed)
.gvp.yaml            ← personal config (gitignored)
```

### Cross-Repo Inheritance

Libraries can inherit from git-hosted libraries:

```yaml
meta:
  inherits:
    - source: "@github:company/org-gvp@v1.0.0"
      as: org
```

Supported: `@github`, `@azure` (org/project/repo format), `@gitlab`, `@bitbucket`. Must use immutable tag or SHA.

## Inherit before authoring

**Do this before writing a single element.** Most guidance a new project needs already exists — in the user's personal library, in an org library, in a shared `code-common`. Cairn records every library it resolves into a machine-wide registry precisely so that a new project can *discover* that guidance instead of re-deriving it.

```bash
cairn libs list                    # every library cairn has ever seen
cairn libs search "simplicity"     # search names + primary fields across all of them
cairn libs search "secrets"
cairn libs show personal           # detail, and which projects have used it
```

Search the concept **before** you author it. If an upstream element already says it, inherit the library and `maps_to` it — do not restate it locally.

> **A project library that duplicates upstream guidance has failed.** Duplicating it is worse than omitting it: now there are two statements of the same idea that can drift apart, and the local copy silently overrides guidance the user deliberately maintains in one place.

Consequences worth internalising:

- **A starter library is mostly roots and decisions.** Goals, exclusions, and the user requirements that make *this* project what it is, plus the decisions you made building it. The guidance layer is mostly inherited.
- **A small project may legitimately have zero project-specific rules — and that is a correct outcome, not a gap.** Rules are operating practice (see the product/practice axis above), and operating practice is exactly the reusable material that lives upstream. If you find yourself authoring four rules for a small CLI, you are probably either restating upstream rules or filing product behaviour as rules. Check which.
- **If nothing upstream exists**, say so explicitly rather than silently assuming. `cairn libs list` returning nothing relevant is a finding; report it and then author.

When you do find the right upstream library, wire it in with `meta.inherits` (see *Cross-Repo Inheritance* below and `cross-repo-inheritance.md`) and map to its elements by their short address (`personal:V1`, `code-common:CR1`).

## Choosing a Workflow

**Two paths depending on your needs:**

### Path A: Full Traceability
For projects where every decision must trace to an artifact and every artifact must trace to a decision. Use when: compliance matters, team alignment is critical, the project will be maintained long-term.

→ Read: `skills/cairn/workflow-full.md`

### Path B: Lightweight Capture
For quick decision tracking after brainstorming sessions. Accumulate over time, synthesize into a full library later. Use when: getting started, solo projects, exploring ideas.

→ Read: `skills/cairn/workflow-light.md`

## Quick Reference

When you need schema details → `skills/cairn/schema-reference.md`
When you need CLI commands → `skills/cairn/commands-reference.md`
When you need to **find guidance that already exists** (before authoring any element) → `cairn libs list` / `cairn libs search "<concept>"` / `cairn libs show <name>`
When you need to add/update many elements (patch files) → `skills/cairn/import-patch.md`
When you need library organization advice → `skills/cairn/organization.md`
When you need to know **who reviews what** (decisions vs guiding elements) → `skills/cairn/guiding-element-review.md`
When you need to **inherit a GVP library from another git repo** → `skills/cairn/cross-repo-inheritance.md`

## Key Principles for Using Cairn

1. **Search before you author** — run `cairn libs search "<concept>"` before writing any element.
   Guidance that already exists upstream should be inherited and mapped to, never restated. A
   project library that duplicates upstream guidance has failed.
2. **Ask "practice or product?" before choosing a category** — rules and heuristics describe how we
   *operate*; what the thing *does* is a requirement (if decreed) or a decision (if chosen).
3. **Edit through the tool, not by hand** — use `cairn add`/`cairn edit` for single elements
   and `cairn import` (patch files) for bulk/multi-document changes. Hand-editing library YAML
   bypasses ID assignment, reference rewriting, provenance, and validation. The one exception is
   pre-creating a meta-only skeleton for a brand-new document (see `import-patch.md`).
4. **Rationale must be verbatim quotes** — never paraphrase someone's reasoning
5. **Decisions always have considered alternatives** — what was rejected and why. Each rejected alternative may link its tradeoff with `would_have_served` (the sacrifice) and `conflicts_with` (the reason) — see `schema-reference.md`.
6. **Refs are bidirectional** — decisions ref their artifacts, coverage check catches orphans
7. **Deterministic checks catch drift** — grep titles from design doc against library
8. **Preview before writing** — `cairn import --dry-run` shows every ID assignment and reference
   rewrite; read it before committing the change
9. **The tool surfaces, humans decide** — cairn makes tension visible, not resolved
10. **Humans review guiding elements, not decisions** (`personal:P15`/`H5`) — a decision that
   follows unambiguously from existing guiding elements needs no review; when guidance admits
   multiple reasonable decisions, author the new guiding element(s) that disambiguate and surface
   *that* patch. See `guiding-element-review.md`. Decisions are the guided output, not a guiding
   element.
