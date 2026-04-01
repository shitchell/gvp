# Full Traceability Workflow

For projects where every decision must trace to code and every piece of code
must trace to a decision. 11 steps.

## The Flow

```
 1. Design Discussion → design doc with titled elements
 2. Review the Design Doc
 3. Translate Design Doc → GVP Library (verbatim titles)
 4. Deterministic Check: design doc → library (grep titles)
 5. Fidelity Check: fresh reader describes project from library alone
 6. Create Implementation Plan (chunks reference decision IDs)
 7. Deterministic Check: library → plan (grep decision IDs)
 8. Implement in Chunks (add refs after each chunk)
 9. Periodic Reviews (cairn diff, cairn review)
10. Validate Coverage (cairn validate --coverage)
11. Ongoing Maintenance (git hooks, PR rules, edit→review→approve)
```

## Step-by-Step

### 1. Design Discussion
Have an interactive discussion capturing goals, values, principles, heuristics,
and decisions in a **design document** (prose, not YAML yet). Use descriptive
**titles** for each element — these carry through verbatim to the library.

### 2. Review the Design Doc
Before translating: did we capture every decision? Does every decision have
rationale? Are there implicit decisions we didn't discuss?

### 3. Translate to GVP Library
```bash
cairn init
# Then populate .gvp/library/project.yaml from the design doc
# Use EXACT titles from the design doc as element names
cairn validate
```

### 4. Deterministic Check: Design → Library
```bash
grep -oP '###?\s+\K.+' docs/design.md | sort -u > /tmp/design-titles.txt
grep -oP 'name: \K.+' .gvp/library/*.yaml | sort -u > /tmp/library-names.txt
comm -23 /tmp/design-titles.txt /tmp/library-names.txt
# Any output = missed elements
```

### 5. Fidelity Check
Have a fresh reader (human or AI) read ONLY the GVP library YAML and describe
the project comprehensively. They must note anywhere they guessed. Compare
against your mental model — guesses reveal gaps.

### 6. Implementation Plan
Every chunk references GVP decision IDs:
```markdown
### Task 1: Database setup [D1, D3, D5]
### Task 2: REST API [D2, D4, D6]
```

### 7. Deterministic Check: Library → Plan
```bash
grep -oP 'id: D\d+' .gvp/library/*.yaml | grep -oP 'D\d+' | sort -u > /tmp/lib-ids.txt
grep -oP 'D\d+' docs/implementation-plan.md | sort -u > /tmp/plan-ids.txt
comm -23 /tmp/lib-ids.txt /tmp/plan-ids.txt
# Any output = decisions not covered by the plan
```

### 8. Implement with Refs
After each chunk: add refs to decisions, commit, validate.
```yaml
refs:
  - file: src/db/connection.ts
    identifier: createPool
    role: implements
```

### 9. Periodic Reviews
```bash
cairn diff main HEAD          # what decisions affected by changes?
cairn review                  # any stale elements?
cairn validate                # structural integrity
```

### 10. Validate Coverage
```bash
cairn validate --coverage
# W012: orphan identifiers (code not traced to decisions)
# W013: decisions without refs (decisions not traced to code)
```

### 11. Ongoing Maintenance
- Git hook: `scripts/gvp-hook.sh` as pre-commit
- PR checklist: `cairn diff main HEAD`, `cairn validate --coverage`
- Edit→review→approve cycle for decision changes

## Making Changes Later

### New feature
1. Add decision → 2. Implement → 3. Add refs → 4. `cairn validate --coverage`

### Changed decision
1. `cairn edit D3 --field rationale="..." --rationale "Why changed"` → 2. Update code → 3. `cairn review` → 4. Approve with hash token
