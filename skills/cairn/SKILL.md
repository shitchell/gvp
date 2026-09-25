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
- User wants to trace code back to its justification
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
| **Heuristic** | H | No | Hard, near-deterministic `if X → do Y` decision rule (as close to executable code as language gets) | `statement` |
| **Rule** | R | No | Unconditional, *value-derived* constraint on a class of decisions (contrast **User Requirement**, which is *decreed*, not derived) | `statement` |
| **Decision** | D | No | Specific choices with rationale + alternatives | `rationale` |
| **Milestone** | M | No | Checkpoints tied to goals | `description` |

**Root elements** (goals, values, constraints, user requirements, exclusions) are the top of the traceability chain — they don't need to map to anything. **Non-root elements** must anchor to at least one **non-value root** (a goal, constraint, user requirement, or exclusion); where a *goal* is the anchor, a *value* is required too. The value anchor is enforced **softly and transitively** (warning `W017` NO_VALUE_TRACE), not as a hard error — because the value that justifies a requirement/constraint-driven choice often lives upstream in an inherited org/personal library, and forcing a local stub just manufactures hollow values. (Pre-1.1.0 the rule was strictly "a goal AND a value"; the mapping model generalized — see `schema-reference.md`.)

#### Categories

**Root elements** are those which require no mapping. They stand on their own. That said, while **goals**, **values**, **constraints**, **user requirements**, and **exclusions** have no mapping *requirement*, it is strongly encouraged that they still map to other elements as applicable. A user requirement in particular is encouraged to map to the **value it resonates with** — but that link means "partially-motivated-by," NOT "derived-from" (if it were fully derivable it would be a rule, not a requirement).

**Guiding elements** are all non-decision elements. They guide *how* we make decisions and *why*.

#### How to distinguish

##### Principle vs Heuristic

**The hard/soft test.** A **heuristic** must reduce to a near-deterministic decision tree: given its inputs, two readers should reach the *same* action with little judgment ("if a future need is identified AND retrofit cost clearly exceeds build-now cost, build now; else defer"). If choosing still requires weighing soft preferences among two or three options — that's a **principle**, not a heuristic. When unsure: can you express it as `if/elif/else` with checkable, quantifiable conditions? Heuristic. Does it say "prefer X over Y, generally"? Principle. (Mis-filing a soft preference as a heuristic is a common error — when authoring, apply this test, and flag pre-existing elements that fail it for reclassification.)

Notably: all principles are effectively vague heuristics. Ideally, all principles could graduate to heuristics, but we are careful to do so trying to ensure we do not create heuristics that fail under stress. Only if we are largely confident that a heuristic is valid in all feasible scenarios do we graduate a principle. Otherwise, we retain the principle so that judgment can be applied where helpful.

##### Principle vs Value

**The sentiment/adjective test.** A **principle** provides direction while a **value** generally provides a 1-3 word *sentiment*. Integrity, user-autonomy, extensibility... these are values. Small keywords and phrases that provide basic building blocks of our direction. Principles help bridge the gap between heuristics (precisely how we apply values in the pursuit of our goals) and values.

##### Value vs Goal

**The state test.** Goals describe a state; values describe abstract concepts. That said, the line can be fuzzy. One might, in everyday discourse, say they value *ending homelessness*. But it would also be accurate to describe the end of homelessness as a state. In such fuzzy scenarios, it is encouraged to try and frame it as a state (and define it as a goal), an abstract concept (and define it as a value), or both. Whatever the case, the best action is simply to get it down more than fret over a specific categorization. Conceptualization is inherently fuzzy and imprecise; tracking is the primary goal.

##### Rule vs Decision

**The guiding/guided test.** Both involve a choice — every rule was, at some point, decided. But the framework categorizes by the *role an element plays in the graph*, not by how it came to be (the same way "isn't every value also kind of a goal?" is true but unhelpful). A **rule** is *guiding*: it sits upstream and constrains a *class* of future decisions. A **decision** is *guided*: it's the single choice you made *within* those constraints, for a specific implementation — the output, not the guidance. (A rule is the rule of the game; a decision is a move.) Two tiebreakers: **durability** — would it survive a full rewrite tomorrow? A rule outlives any implementation; a decision changes when the implementation changes. **Rationale shape** — if what you want to record is *rejected alternatives and why this won*, it's a decision; if it's *a line future decisions must not cross*, it's a rule (the rule's "why" lives in what it `maps_to`; the decision's "why" lives in its own `rationale` + alternatives). A rule is frequently a decision that earned promotion to a standing constraint — e.g. `R6` ("subcommands and renderers dispatch on schema, not field names") began as implementation work and graduated once it had to bind all future renderers.

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

Every decision should trace upward to a root AND (when `accepted`) downward to code/artifacts via `refs`.

**Coverage runs both ways.** Bottom-side: every `accepted` decision should `refs` code (`W012`/`W013`). Top-side: every *actionable* root should be actioned by ≥1 decision (`W018` ROOT_NO_DECISION) — `user_requirement` opts into this via `requires_decision: true`; an `exclusion` is already its own resolution and self-satisfies. A **`declined`** or **`deferred`** disposition is how you *explicitly* action a root you're not building — so "logged but not done" is a recorded stance, never a silent gap.

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

Refs are domain-agnostic — they work with any file type that has a parser (TypeScript, Markdown, YAML built-in). The `identifier` is whatever is a stable reference in that file format (function names, headings, top-level keys).

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

## Choosing a Workflow

**Two paths depending on your needs:**

### Path A: Full Traceability
For projects where every decision must trace to code and every piece of code must trace to a decision. Use when: compliance matters, team alignment is critical, the project will be maintained long-term.

→ Read: `skills/cairn/workflow-full.md`

### Path B: Lightweight Capture
For quick decision tracking after brainstorming sessions. Accumulate over time, synthesize into a full library later. Use when: getting started, solo projects, exploring ideas.

→ Read: `skills/cairn/workflow-light.md`

## Quick Reference

When you need schema details → `skills/cairn/schema-reference.md`
When you need CLI commands → `skills/cairn/commands-reference.md`
When you need to add/update many elements (patch files) → `skills/cairn/import-patch.md`
When you need library organization advice → `skills/cairn/organization.md`
When you need to know **who reviews what** (decisions vs guiding elements) → `skills/cairn/guiding-element-review.md`
When you need to **inherit a GVP library from another git repo** → `skills/cairn/cross-repo-inheritance.md`

## Key Principles for Using Cairn

1. **Edit through the tool, not by hand** — use `cairn add`/`cairn edit` for single elements
   and `cairn import` (patch files) for bulk/multi-document changes. Hand-editing library YAML
   bypasses ID assignment, reference rewriting, provenance, and validation. The one exception is
   pre-creating a meta-only skeleton for a brand-new document (see `import-patch.md`).
2. **Rationale must be verbatim quotes** — never paraphrase someone's reasoning
3. **Decisions always have considered alternatives** — what was rejected and why. Each rejected alternative may link its tradeoff with `would_have_served` (the sacrifice) and `conflicts_with` (the reason) — see `schema-reference.md`.
4. **Refs are bidirectional** — decisions ref code, coverage check catches orphans
5. **Deterministic checks catch drift** — grep titles from design doc against library
6. **Preview before writing** — `cairn import --dry-run` shows every ID assignment and reference
   rewrite; read it before committing the change
7. **The tool surfaces, humans decide** — cairn makes tension visible, not resolved
8. **Humans review guiding elements, not decisions** (`personal:P15`/`H5`) — a decision that
   follows unambiguously from existing guiding elements needs no review; when guidance admits
   multiple reasonable decisions, author the new guiding element(s) that disambiguate and surface
   *that* patch. See `guiding-element-review.md`. Decisions are the guided output, not a guiding
   element.
