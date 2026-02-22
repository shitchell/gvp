# GVP Review & Edit Enhancements — Design Document

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:writing-plans to create the implementation plan from this design.

**Goal:** Add a `review` command for change-acknowledgment with friction, enhance `edit` to support all three input modes (CLI/interactive/editor), auto-add provenance on edit/add, and add staleness validation (W006).

**Scope:** `review` command, `edit` enhancements, `add` auto-origin, W006 warning, `reviewed_by` field on elements. Does NOT include the example library, gvp-docs privacy change, or final doc polish.

---

## Decision Log

### 1. Review means change-acknowledgment with friction

- **Status:** Accepted
- **Context:** Review should ensure the user actually engages with what changed, not just rubber-stamp
- **Rationale:** Show trace + diff of what changed, require the user to type a note before stamping. This can't guarantee semantic review but adds friction to help facilitate good reviews.

### 2. `reviewed_by` as separate list parallel to `updated_by`

- **Status:** Accepted
- **Context:** Need full review history, not just latest timestamp
- **Rationale:** Parallel to `updated_by` but lighter-weight (no `project`, `decisions`, `evidence` — reviews are simpler). Schema: `{date: date, by: string (optional), note: string (optional)}`.

### 3. Hidden `--approve` flag for non-interactive review

- **Status:** Accepted
- **Context:** AI and scripts need non-interactive review, but we don't want to encourage rubber-stamping
- **Rationale:** `--approve` is not shown in `--help`. Only displayed at the bottom of interactive `gvp review` output as a tip. Only works with a specific element, not batch.

### 4. `edit` gets all three input modes (matching `add`)

- **Status:** Accepted
- **Context:** `add` has CLI params, `--interactive`, and editor fallback. `edit` only has CLI params.
- **Rationale:** Parity with `add`. Editor mode is especially useful for complex edits.

### 5. `--no-provenance` flag for trivial fixes

- **Status:** Accepted
- **Context:** Typo fixes, formatting changes shouldn't require full provenance tracking
- **Rationale:** `--no-provenance` skips the automatic `updated_by` append on `edit` and `origin` append on `add`.

### 6. `add` auto-adds origin if not provided

- **Status:** Accepted
- **Context:** `add` currently writes whatever fields you give it — no automatic origin
- **Rationale:** If no `origin` is in the provided fields and no `meta.defaults.origin` exists, auto-add `{date: today}`. `--no-provenance` skips this.

### 7. `--approve` only works with a specific element

- **Status:** Accepted
- **Context:** Batch approve would defeat the purpose of friction
- **Rationale:** `gvp review --approve` without a specific element is an error. `gvp review personal:P3 --approve` works.

---

## Design

### 1. Data Model Changes

**New field on Element: `reviewed_by`**

```yaml
reviewed_by:
  - date: 2026-02-22
    by: guy
    note: "Confirmed after H5 update"
```

Schema: `list[{date: date, by: string (optional), note: string (optional)}]`

Add `reviewed_by: list[dict]` to the `Element` dataclass (default: empty list). Loader parses it from YAML.

### 2. `review` Command

**Usage:** `gvp review [options] [element | --library path]`

**Resolution:**
- `gvp review personal:P3` — review one element, auto-resolve from configured libraries
- `gvp review personal:P3 --approve` — non-interactive single element stamp (hidden flag)
- `gvp review --library path/` — list all stale elements in that library
- `gvp review` — list all stale elements across all configured libraries
- `gvp review --library path/ --approve` — error: `--approve` requires a specific element

**Interactive flow (single element):**

1. Load catalog, resolve the element
2. Display:
   - Element details (id, name, category, status, statement/rationale)
   - Trace output (ancestors via `maps_to`)
   - Diff highlight: `updated_by` entries on ancestors newer than this element's most recent `reviewed_by.date` (or all `updated_by` if never reviewed)
3. Prompt user for a review note (must type something — empty input cancels)
4. Append `reviewed_by` entry: `{date: today, by: $USER or "unknown", note: "user input"}`
5. Write YAML
6. Print confirmation
7. Footer: `Tip: use --approve to skip interactive review`

**Non-interactive flow (`--approve`):**
- Skip display and prompt
- Append `reviewed_by` entry: `{date: today, by: "auto"}`
- Print confirmation

**Batch flow (no element specified):**
- List elements needing review as a table: qualified ID, category, last reviewed, ancestor that triggered staleness, ancestor's update date
- No auto-approve, just listing

### 3. `edit` Command Enhancements

**Three input modes:**

1. **CLI params:** `gvp edit personal:P3 --name "New" --rationale "Why"` — current behavior, unchanged
2. **Interactive:** `gvp edit personal:P3 --interactive` — prompt for which fields to change, then rationale
3. **Editor:** `gvp edit personal:P3` (no field flags, no `--interactive`) — open element as YAML in `$EDITOR`, diff on save, prompt for rationale

**Auto-provenance:** Every edit appends `updated_by` with `{date: today, rationale: "..."}` (current behavior). `--no-provenance` skips this.

**Editor mode details:**
- Extract current element as YAML (strip `id`, `origin`, `updated_by`, `reviewed_by` — user edits content, not metadata)
- Open in `$VISUAL` / `$EDITOR` / fallback (reuse `get_editor()` from `add.py`)
- On save: diff original vs edited, show diff to user, prompt for rationale
- If no changes detected: print "No changes" and exit
- Apply changes + append `updated_by`

### 4. `add` Auto-Origin

If no `origin` field is in the provided element fields AND no `meta.defaults.origin` exists on the target document, auto-add:

```yaml
origin:
  - date: 2026-02-22
```

`--no-provenance` skips this.

### 5. W006 Staleness Warning

**Rule:** For each element, walk ancestors via `maps_to`. If any ancestor has an `updated_by` entry with a date newer than the element's most recent `reviewed_by.date`, warn. If the element has no `reviewed_by` and any ancestor has `updated_by`, also warn.

**No warning when:** Element has no `reviewed_by` AND no ancestors have `updated_by` (nothing to be stale against — the review system isn't in use yet for this subgraph).

**Format:** `W006: personal:P3 may need review — ancestor personal:V1 was updated on 2026-02-22`

**Suppression:** Same as other warnings — suppressible via config, promotable with `--strict`.

---

## Files Changed

### New files
- `src/gvp/commands/review.py` — review command implementation
- `tests/commands/test_review.py` — review command tests

### Modified files
- `src/gvp/model.py` — add `reviewed_by` field to `Element`
- `src/gvp/loader.py` — parse `reviewed_by` from YAML
- `src/gvp/commands/edit.py` — add interactive + editor modes, `--no-provenance` support
- `src/gvp/commands/add.py` — auto-origin when no origin provided
- `src/gvp/commands/validate.py` — add W006 staleness check
- `src/gvp/__main__.py` — wire up `review` subcommand, add `--no-provenance` to edit/add, hide `--approve`
- `tests/commands/test_edit.py` — tests for new edit modes
- `tests/commands/test_add.py` — tests for auto-origin
- `tests/commands/test_validate.py` — tests for W006

### External repos
- `~/code/git/github.com/shitchell/gvp-docs/schema.yaml` — add `reviewed_by` field definition
