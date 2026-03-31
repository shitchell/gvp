# GVP Workflow Guide

How to use GVP for end-to-end design traceability — from initial design discussion through implementation to ongoing maintenance.

## The Flow

```
 1. Design Discussion (interactive, capture decisions in a design doc)
     ↓
 2. Review the Design Doc (nothing missed?)
     ↓
 3. Translate Design Doc → GVP Library (every decision becomes a YAML element)
     ↓
 4. Deterministic Check: design doc → library (grep for every decision ID)
     ↓
 5. Fidelity Check: fresh reader describes project from library alone
     ↓
 6. Create Implementation Plan (every chunk references GVP decision IDs)
     ↓
 7. Deterministic Check: library → plan (grep for every decision ID)
     ↓
 8. Implement in Chunks (with periodic reviews)
     ↓
 9. Add Refs (link decisions ↔ code bidirectionally)
     ↓
10. Validate Coverage (gvp validate --coverage)
     ↓
11. Ongoing Maintenance (edits → reviews → approvals, git hooks, PR rules)
```

Things get missed. That's normal — attention is finite. The deterministic checks
at steps 4 and 6 exist specifically because humans (and AI) drift. The checks
are cheap; the cost of a missed decision surfacing late is not.

---

## Step 1: Design Discussion

Before writing code, have an interactive design discussion. This can be with a
team, a collaborator, or an AI assistant. The goal is to surface decisions and
capture them in a **design document** — not YAML yet, just prose.

The design doc should capture:
- **Goals**: What are we trying to achieve?
- **Values**: What do we care about? What guides tradeoffs?
- **Constraints**: What limitations are we working within?
- **Principles**: What guidelines should we follow?
- **Heuristics**: How do we make consistent decisions? (e.g., "when choosing
  between simplicity and flexibility, default to simplicity unless...")
- **Decisions**: Every architectural choice, with rationale and alternatives considered

Heuristics are especially important — they force you to think through your
decision-making process and apply it consistently. If you find yourself making
the same kind of tradeoff repeatedly, that's a heuristic worth capturing.

Write the design doc to `docs/design.md` or similar. Be thorough — every
"we should..." or "let's use..." in the discussion is a decision worth capturing.

Use descriptive **titles** for each element — these titles will be translated
verbatim into your GVP library elements and used for deterministic grep checks
later.

```markdown
## Architecture

### Use PostgreSQL
We'll use PostgreSQL for the database.
- **Rationale**: Mature, reliable, team has experience.
- **Considered**: MySQL (less feature-rich), MongoDB (schema flexibility not needed)

### REST API with Express
...

## Heuristics

### Prefer standard libraries over custom implementations
When a well-maintained library exists for a problem, use it rather than
rolling our own. Custom code is only justified when the library doesn't
fit the use case or introduces unacceptable dependencies.
```

## Step 2: Review the Design Doc

Before translating to GVP, review the design doc for completeness. Ask:
- Did we capture every decision from the discussion?
- Does every decision have rationale?
- Did we note what alternatives were considered and why they were rejected?
- Are there implicit decisions we made without discussing? (e.g., "we'll use
  TypeScript" — was that a conscious choice or an assumption?)

This review catches gaps while the discussion is fresh.

## Step 3: Initialize and Populate the GVP Library

Initialize the library:

```bash
gvp init
```

Then translate every element from the design doc into the GVP YAML. Every
goal, value, constraint, principle, heuristic, and decision from the design doc
becomes a YAML element with proper `maps_to` traceability.

**Use the exact titles from the design doc as element `name` values.** This
enables the deterministic grep check in Step 4 — if the title appears in both
the design doc and the library, nothing was missed. IDs are auto-assigned and
may not match between doc and library, but titles should be verbatim.

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

Validate as you go:

```bash
gvp validate
```

## Step 4: Deterministic Check — Design Doc → Library

Verify that every element from the design doc made it into the GVP library.
This is a mechanical check on **titles**, not IDs — IDs are auto-assigned and
may differ, but titles should be verbatim matches.

```bash
# Extract element titles from the design doc (headings under ## or ###)
grep -oP '###?\s+\K.+' docs/design.md | sort -u > /tmp/design-titles.txt

# Extract element names from the GVP library
grep -oP 'name: \K.+' .gvp/library/*.yaml | sort -u > /tmp/library-names.txt

# Find any in the design doc but missing from the library
comm -23 /tmp/design-titles.txt /tmp/library-names.txt
```

If `comm` outputs anything, those elements were discussed and documented but
not translated to the library. Go back and add them.

This check is cheap and catches the most common failure mode: "we discussed it,
wrote it down, then forgot to translate it." Using titles rather than IDs means
the check works even when IDs are auto-assigned by tooling.

## Step 5: Fidelity Check — Can a Fresh Reader Understand the Project?

Before moving to implementation, verify that the GVP library alone — without
the design doc, without verbal context — communicates the project faithfully.

Have someone (or an AI agent) read **only** the GVP library YAML and attempt to
provide a comprehensive description of the project: what it does, how it works,
how the pieces fit together, and the rationale behind every decision. They
should **explicitly note anywhere they had to guess** or fill in gaps.

Compare their description against your mental model:
- Does it match? → Library is complete.
- Did they guess correctly? → Implicit knowledge that should be made explicit.
- Did they guess wrong? → A gap or ambiguity in the library.
- Did they miss something entirely? → An element is missing.

This step catches a different class of gap than the deterministic check: Step 4
verifies *coverage* (nothing was dropped). This step verifies *fidelity* (the
captured information actually communicates the intent). Both are necessary —
you can have 100% coverage with 0% fidelity if every decision has an ID but
unclear rationale.

## Step 6: Create Implementation Plan

Write an implementation plan where every chunk explicitly references the GVP
decision IDs it implements:

```markdown
### Task 1: Set up database schema [D1, D3, D5]

Steps:
1. Create migration files
2. Define User, Project, Task tables
3. Add indexes per D5

### Task 2: Implement REST API [D2, D4, D6]
...
```

The `[D1, D3, D5]` annotations are not decoration — they are the traceability
link between the plan and the library.

## Step 7: Deterministic Check — Library → Plan

Verify that every decision in the GVP library appears in the implementation
plan:

```bash
# Extract decision IDs from the library
grep -oP 'id: D\d+' .gvp/library/*.yaml | grep -oP 'D\d+' | sort -u > /tmp/library-ids.txt

# Extract decision IDs referenced in the plan
grep -oP 'D\d+' docs/implementation-plan.md | sort -u > /tmp/plan-ids.txt

# Find any in the library but missing from the plan
comm -23 /tmp/library-ids.txt /tmp/plan-ids.txt
```

If anything shows up, a decision exists but no implementation task covers it.
Either add it to a task or confirm it's intentionally deferred.

## Step 8: Implement in Chunks

Implement following the plan. After each chunk:

1. Add `refs` to decisions linking them to the code or documentation you just wrote
2. Commit
3. Run `gvp validate`

```yaml
# After implementing D1's code, add refs:
decisions:
  - id: D1
    name: Use PostgreSQL
    refs:
      - file: src/db/connection.ts
        identifier: createPool
        role: implements
      - file: src/db/migrations/001-initial.sql
        identifier: users
        role: defines
```

## Step 9: Periodic Reviews During Implementation

After each chunk or at natural milestones, check alignment:

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
```

## Step 10: Validate Coverage

Before considering a milestone complete:

```bash
gvp validate --coverage
```

This checks two directions:
- **W012 (Orphan Identifier)**: Identifiers in parseable files not referenced
  by any decision
- **W013 (Decision No Refs)**: Decisions that don't link to any artifacts

Fix gaps by adding refs to decisions or creating new decisions for
undocumented code.

## Step 11: "Why Does This Code Exist?"

At any point, trace from code back to goals:

```bash
gvp inspect --ref src/db/connection.ts::createPool --trace
```

Output shows the full chain: code → decision → principles → goals/values.

---

## Making Changes After Initial Implementation

Once the project is built and traced, changes follow a lighter cycle:

### Adding a New Feature

1. Discuss the change and decide on approach
2. Add a new decision to the GVP library (or update an existing one):
   ```bash
   gvp add decision "Add caching layer" \
     --field rationale="Reduce database load for read-heavy endpoints"
   ```
3. Implement the feature
4. Add refs linking the new decision to the new code
5. Commit and validate:
   ```bash
   gvp validate --coverage
   ```

### Changing an Existing Decision

When you change your mind about a previous decision (e.g., switching from
throwing errors to returning null):

1. Update the decision with rationale for the change:
   ```bash
   gvp edit D3 \
     --field rationale="Return null instead of throwing — callers handle missing data more gracefully" \
     --rationale "Changed approach after discovering most callers wrap in try/catch anyway"
   ```
2. Update the code to match
3. Commit both changes
4. Check what's stale:
   ```bash
   gvp review
   ```
5. Review and approve:
   ```bash
   # See what changed
   gvp review D3

   # Approve with the provided hash token
   gvp review D3 --approve --token <hash>
   ```

### The Edit → Review → Approve Cycle

Every `gvp edit` automatically creates an `updated_by` provenance entry with
a UUID, timestamp, and your rationale. This entry starts as "unreviewed."

`gvp review` finds all elements with unreviewed updates. For each one, it
shows what changed and provides a one-time hash token. The token proves you
actually looked at the pending changes before approving — preventing
rubber-stamp reviews.

```bash
# Find stale elements
gvp review
#  → gvp:D3 "Handle null responses" (1 unreviewed update)

# See details and get approval token
gvp review D3
#  → Unreviewed updates: 1
#  → To approve: gvp review D3 --approve --token a1b2c3d4

# Approve
gvp review D3 --approve --token a1b2c3d4
```

---

## Ongoing Maintenance

### Git Pre-Commit Hook

Use the provided hook script:

```bash
# Copy or symlink the hook
cp scripts/gvp-hook.sh .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit

# Or symlink (stays in sync with updates)
ln -sf ../../scripts/gvp-hook.sh .git/hooks/pre-commit
```

The hook runs `gvp validate --scope staged`, warns about stale elements, and
supports `--coverage`, `--strict`, and `--ci` flags. See `scripts/gvp-hook.sh`
for details.

### PR Review Checklist

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
| Initialize a new project | `gvp init` |
| Add a new decision | `gvp add decision "Name" --field rationale="Why"` |
| Edit a decision | `gvp edit D1 --field rationale="Updated" --rationale "Why we changed"` |
| Validate the library | `gvp validate` |
| Check coverage | `gvp validate --coverage` |
| Scope to staged changes | `gvp validate --scope staged` |
| What changed? | `gvp diff HEAD~5 HEAD` |
| Why does this code exist? | `gvp inspect --ref file::id --trace` |
| What needs review? | `gvp review` |
| Approve a review | `gvp review D1 --approve --token <hash>` |
| Find unmapped relationships | `gvp analyze` |
| Export for documentation | `gvp export --format markdown` |
