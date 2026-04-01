# Lightweight Decision Capture

For quick decision tracking after brainstorming sessions. Takes ~5 minutes.
Accumulate over time, synthesize into a full GVP library when ready.

## The Flow

```
Brainstorm / plan normally
    ↓
After session, capture decisions (~5 min)
    ↓
DECISIONS.md accumulates across sessions
    ↓
Periodically synthesize into a GVP library
```

## After Any Planning Session

### 1. Extract Decisions

Review the conversation and extract every decision made. For each:
- **Title**: descriptive name (will become element `name` later)
- **Rationale**: verbatim quote from the user — NEVER paraphrase
- **Alternatives**: what was considered and why rejected
- **Tentative GVP mapping**: which goals/values does this serve?

### 2. Write to DECISIONS.md

Append a new session section (never overwrite previous sessions):

```markdown
## Session: 2026-03-15 — Initial Architecture

**Context:** First planning session for the new API service.

### Use PostgreSQL
- **Rationale:** user said, "mature, reliable, team has experience"
- **Maps to:** G1 (Ship reliable product), V1 (Simplicity)
- **Considered:**

| Alternative | Why not? |
|---|---|
| MySQL | user said, "less feature-rich for our use case" |
| MongoDB | user said, "schema flexibility not needed" |

### REST API over GraphQL
- **Rationale:** user said, "simpler for our use case, team knows it"
- **Maps to:** V1 (Simplicity), G2 (Ship fast)
```

### 3. Flag Gaps

After drafting, ask about undiscussed alternatives:

> I noted these decisions had no alternatives discussed. Were there other
> options you considered?
> - Decision X
> - Decision Y

### 4. Infer Tentative GVPs

If no GVP library exists yet, infer goals/values/principles from the decisions:

```markdown
### Inferred GVPs (refine later)
- **G1: Ship reliable product** — inferred from D1, D3
- **V1: Simplicity** — inferred from D1, D2, D4
- **P1: Use standard tools over custom** — inferred from D1, D2
```

Mark all as "inferred" — they'll be refined during synthesis.

## Synthesizing into a GVP Library

When you have DECISIONS.md files from several sessions or projects:

```bash
# Collect all decision docs
find ~/projects -name "DECISIONS.md"

# Ask an agent to synthesize:
# "Read all these DECISIONS.md files. Identify recurring goals, values,
#  principles, and heuristics across projects. Create a GVP library."
```

### What synthesis produces

- **Project-level GVPs** from individual project decisions
- **Personal/org-level GVPs** from patterns across projects
- Decisions graduate from DECISIONS.md prose to YAML elements with proper
  `maps_to` traceability

### After synthesis

```bash
cairn init
# Copy synthesized library into .gvp/library/
cairn validate
cairn validate --coverage  # optional: check refs
```

From here you can adopt the full workflow or continue lightweight capture.

## Key Rules

1. **Rationale is always verbatim quotes** — `user said, "..."` or `Rationale: TBD`
2. **Never overwrite previous sessions** — append only
3. **Always ask about gaps** — undiscussed alternatives, missing rationale
4. **Inferred GVPs are marked as inferred** — they're hypotheses, not decisions
