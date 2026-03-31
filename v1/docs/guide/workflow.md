# GVP Workflow Guide

How to use GVP for end-to-end design traceability — from initial design discussion through implementation to ongoing maintenance.

## The Flow

```
Design Discussion
    ↓
Document GVPs (goals, values, principles, decisions)
    ↓
Create Implementation Plan (referencing GVP decisions)
    ↓
Implement in Chunks (with periodic GVP reviews)
    ↓
Trace Code ↔ Decisions (refs on every decision)
    ↓
Validate Coverage (every decision maps to code, every code maps to a decision)
    ↓
Maintain via Git Hooks + PR Reviews
```

---

## Step 1: Start a Design Discussion

Before writing code, discuss the project's goals, values, and guiding principles. These can start fuzzy — GVP embraces fuzzy boundaries. Capture what matters and why.

Questions to ask:
- What are we trying to achieve? → **Goals**
- What do we care about? → **Values**
- What constraints are we working within? → **Constraints**
- How should we approach decisions? → **Principles**

## Step 2: Initialize the GVP Library

```bash
mkdir -p .gvp/library

cat > .gvp/library/project.yaml << 'EOF'
meta:
  name: my-project
  scope: project
  definitions:
    tags:
      backend:
        description: Server-side concerns
      frontend:
        description: Client-side concerns
      security:
        description: Security and access control

goals:
  - id: G1
    name: Ship a working MVP
    statement: Deliver a functional product users can rely on.
    tags: []
    maps_to: []

values:
  - id: V1
    name: Simplicity
    statement: Complexity must earn its place.
    tags: []
    maps_to: [my-project:G1]
EOF
```

Validate immediately:

```bash
gvp validate
```

## Step 3: Document Decisions Comprehensively

As design discussions produce decisions, capture each one with rationale and considered alternatives. Every decision should map to at least one goal and one value.

```bash
gvp add decision "Use PostgreSQL" \
  --field rationale="Mature, reliable, team has experience" \
  --field maps_to='["my-project:G1","my-project:V1"]'
```

Or edit the YAML directly — decisions support a `considered` field for rejected alternatives:

```yaml
decisions:
  - id: D1
    name: Use PostgreSQL
    rationale: Mature, reliable, team has experience.
    tags: [backend]
    maps_to: [my-project:G1, my-project:V1]
    considered:
      MySQL:
        rationale: Less feature-rich for our use case.
      MongoDB:
        rationale: Schema flexibility not needed; relational model fits better.
```

## Step 4: Create an Implementation Plan with Decision References

When creating the implementation plan, reference GVP decisions in each task. This creates the first half of the traceability link.

```markdown
### Task 3: Set up database schema

**Implements:** D1 (Use PostgreSQL), D3 (Normalize user data)

Steps:
1. Create migration files
2. Define User, Project, Task tables
3. Add indexes per D5 (Query performance targets)
```

## Step 5: Implement with Refs

As you implement, add `refs` to your decisions linking them to the code they produced:

```yaml
decisions:
  - id: D1
    name: Use PostgreSQL
    rationale: Mature, reliable, team has experience.
    tags: [backend]
    maps_to: [my-project:G1, my-project:V1]
    refs:
      - file: src/db/connection.ts
        identifier: createPool
        role: implements
      - file: src/db/migrations/001-initial.sql
        identifier: users
        role: defines
      - file: docs/architecture.md
        identifier: Database Layer
        role: documents
```

## Step 6: Periodic Reviews During Implementation

After each implementation chunk, check alignment:

```bash
# What decisions are affected by recent changes?
gvp diff main HEAD

# Any stale decisions needing review?
gvp review

# Full validation
gvp validate
```

If `gvp diff` shows decisions were affected by code changes, review them:

```bash
# See the full trace for an affected decision
gvp inspect D1 --trace --refs

# If the decision is still valid after the code change, approve the review
gvp review D1
# (follow the approval flow with the hash token)
```

## Step 7: Validate Coverage

Before considering a milestone complete, run coverage validation:

```bash
gvp validate --coverage
```

This checks two directions:
- **W012 (Orphan Identifier):** Code identifiers (classes, functions, headings) not referenced by any decision
- **W013 (Decision No Refs):** Decisions that don't link to any code or artifacts

Fix gaps by adding refs to decisions or creating new decisions for undocumented code.

## Step 8: "Why Does This Code Exist?"

At any point, trace from code back to goals:

```bash
# From a specific function to its justifying goals and values
gvp inspect --ref src/db/connection.ts::createPool --trace
```

Output shows the full chain: code → decision → principles → goals/values.

## Step 9: Ongoing Maintenance

### Git Pre-Commit Hook

Add to `.git/hooks/pre-commit`:

```bash
#!/bin/bash
gvp validate --scope staged
if [ $? -ne 0 ]; then
  echo "GVP validation failed. Fix issues before committing."
  exit 1
fi
```

### PR Review Checklist

In your PR template, add:

```markdown
## GVP Traceability

- [ ] `gvp diff main HEAD` reviewed — affected decisions acknowledged
- [ ] `gvp validate` passes (no errors)
- [ ] New code has corresponding decision refs
- [ ] New decisions have code refs
```

### Periodic Full Review

Weekly or per-milestone:

```bash
# Full validation with coverage
gvp validate --coverage --strict

# Check for stale decisions
gvp review

# Analyze for unmapped relationships
gvp analyze
```

---

## Quick Reference

| Task | Command |
|------|---------|
| Add a new decision | `gvp add decision "Name" --field rationale="Why"` |
| Validate the library | `gvp validate` |
| Check code coverage | `gvp validate --coverage` |
| What changed? | `gvp diff HEAD~5 HEAD` |
| Why does this code exist? | `gvp inspect --ref file::id --trace` |
| What needs review? | `gvp review` |
| Find unmapped relationships | `gvp analyze` |
| Export for documentation | `gvp export --format markdown` |
