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
| **Constraint** | C | Yes | Limitations we're working within | `impact` |
| **Principle** | P | No | Actionable guidelines derived from values | `statement` |
| **Heuristic** | H | No | Decision-making rules ("if X, do Y") | `statement` |
| **Rule** | R | No | Unconditional requirements | `statement` |
| **Decision** | D | No | Specific choices with rationale + alternatives | `rationale` |
| **Milestone** | M | No | Checkpoints tied to goals | `description` |

**Root elements** (goals, values, constraints) are the top of the traceability chain — they don't need to map to anything. **Non-root elements** must map to at least one goal AND one value (directly or transitively).

### Traceability Direction

```
Goals & Values (root — the "why")
    ↑ maps_to
Principles & Rules (guidelines — the "how to decide")
    ↑ maps_to
Heuristics (decision recipes — "if X, do Y")
    ↑ maps_to
Decisions (specific choices — the "what" with rationale)
    ↓ refs
Code, Docs, Artifacts (the "where" — what the decision produced)
```

Every decision should trace upward to goals/values AND downward to code/artifacts via `refs`.

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
When you need library organization advice → `skills/cairn/organization.md`

## Key Principles for Using Cairn

1. **Rationale must be verbatim quotes** — never paraphrase someone's reasoning
2. **Decisions always have considered alternatives** — what was rejected and why
3. **Refs are bidirectional** — decisions ref code, coverage check catches orphans
4. **Deterministic checks catch drift** — grep titles from design doc against library
5. **The tool surfaces, humans decide** — cairn makes tension visible, not resolved
