# Full Traceability Workflow

For projects where every decision must trace to code and every piece of code
must trace to a decision. 11 steps.

## The Flow

```
 1. Design Discussion → design doc with titled elements
 2. Review the Design Doc
 3. Translate Design Doc → GVP Library (cairn add / cairn import; verbatim titles)
 4. Deterministic Check: design doc → library (grep titles)
 5. Fidelity Check: fresh reader describes project from library alone
 6. Create Implementation Plan (chunks reference decision IDs)
 7. Deterministic Check: library → plan (grep decision IDs)
 8. Implement in Chunks (add refs after each chunk)
 9. Periodic Reviews (cairn diff, cairn review)
10. Validate Coverage (cairn validate --coverage)
11. Ongoing Maintenance (git hooks, PR rules, edit → review → review --token)
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
Populate the library **through the tool**, never by hand-editing YAML (SKILL.md Key
Principle 3): hand-editing bypasses ID assignment, reference rewriting, provenance,
and validation. Use EXACT titles from the design doc as element names.

For a handful of elements, add them one at a time:
```bash
cairn init
cairn add goal "Ship reliable software" -f statement="Deliver software that works correctly."
cairn add value "Clarity" -f statement="Prefer the obvious implementation."
cairn add decision "Use PostgreSQL" -f rationale="Mature, reliable, team has experience." \
  -f 'maps_to=["project:G1","project:V1"]'
cairn validate
```

For a whole design doc — which is the normal case at this step, and the only
supported way to add elements across several documents at once — write a patch file
and import it. Pseudo-ids (`?d_use_postgres`) let the patch cross-reference elements
whose IDs do not exist yet; cairn assigns the real ones and rewrites every reference:
```bash
cairn import .gvp/patches/project-from-design.yaml --into project --dry-run   # read this
cairn import .gvp/patches/project-from-design.yaml --into project --yes
cairn validate
```
The `--dry-run` preview is where you check every ID assignment and reference rewrite
before it lands. See `import-patch.md` for the patch format.

Note on list values: `-f` parses lists as **strict JSON only**. `-f 'tags=[a, b]'`
exits 0 and silently writes a *string*, which fails validation later (#23). Quote
them as JSON arrays, or use a patch file.

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
After each chunk: add refs to the decisions the chunk implemented, commit, validate.
Through the tool, as in step 3 — `refs` is a list field, so it is strict JSON:
```bash
cairn edit D1 --rationale "Implemented in chunk 1" \
  -f 'refs=[{"file":"src/db/connection.ts","identifier":"createPool","role":"implements"}]'
cairn validate
```
Which writes:
```yaml
refs:
  - file: src/db/connection.ts
    identifier: createPool     # class, function, heading, YAML key
    role: implements           # defines | implements | uses | extends
```
For several decisions at once, a patch file and `cairn import` is less typing than
several `edit` calls, and gets one `--dry-run` preview for the whole batch.

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
# W013: decisions without refs (accepted decisions not traced to code)
# W018: an actionable root that no decision actions
```
If the library inherits from another, add `--inherited show`: inherited diagnostics
are rolled up to a count by default, so a clean-looking run may not be one.

### 11. Ongoing Maintenance
- Git hook: `scripts/gvp-hook.sh` as pre-commit
- PR checklist: `cairn diff main HEAD`, `cairn validate --coverage`
- edit → `cairn review` → `cairn review <id> --token <hash>` for decision changes

## Making Changes Later

### New feature
1. Add decision → 2. Implement → 3. Add refs → 4. `cairn validate --coverage`

### Changed decision
1. `cairn edit D3 -f rationale="..." --rationale "Why changed"` → 2. Update code →
3. `cairn review` (lists what is now stale) → 4. `cairn review D3` (shows the
unreviewed updates and prints a hash token) → 5. `cairn review D3 --token <hash>`

There is **no `--approve` flag**. Re-running `review` with the token *is* the
acknowledgement, and the token is what proves the reviewer saw those specific
updates. Optional: `--note "<text>"` and `--by "<name>"`.
