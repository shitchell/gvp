# Quick Wins Design: considered, priority, categorization heuristic

Date: 2026-02-24

## Overview

Three small, independent changes that add schema richness without architectural changes.

1. **`considered` field on Design Choices** — optional map of rejected alternatives with rejection rationale
2. **`priority` field on Elements** — optional numeric priority, first-class on the Element model
3. **"Categorization time check" heuristic** — new UH2 in the software-project example


## 1. `considered` field on Design Choices

### YAML Schema

Optional field on `design_choice` elements. Map of alternative names to dicts:

```yaml
design_choices:
  - id: D1
    name: Python 3.11+
    rationale: ...
    considered:
      go:
        description: "Guy prefers compiled languages for AI-assisted dev."
        rationale: "Marginal benefit didn't justify reworking mid-plan."
      node:
        description: "Broad familiarity at work."
        rationale: "Not as strong for CLI tools."
```

- `considered` is a `dict[str, dict]`
- Each inner dict must contain `rationale` (rejection rationale)
- Additional inner keys (e.g., `description`) are optional and freeform

### Validation

Only validated when `considered` is present on an element:

- `considered` must be a dict — error if string, list, etc.
- Each value must be a dict — error if bare string, number, etc.
- Each inner dict must have a `rationale` key — error: `{qid}: considered alternative '{name}' missing rejection rationale`

### Rendering

**Markdown:** Sub-list under design choices:

```markdown
**Considered alternatives:**
- **Go** — Guy prefers compiled languages... *Rejected: Marginal benefit didn't justify...*
- **Node** — *Rejected: Not as strong for CLI tools.*
```

Uses `description` for main text, `rationale` prefixed with "Rejected:" in italics.

**CSV:** Add `considered` column with JSON-encoded value.

**SQLite:** New table:

```sql
CREATE TABLE IF NOT EXISTS considered_alternatives (
    qualified_id TEXT REFERENCES elements(qualified_id),
    alternative TEXT,
    field TEXT,
    value TEXT,
    PRIMARY KEY (qualified_id, alternative, field)
);
```

Fully normalized — each inner key-value pair gets its own row.

**DOT/PNG:** No changes.

### Data

Add banked D1 considered context from memory to `.gvp/library/gvp.yaml`:

```yaml
design_choices:
  - id: D1
    name: Walk-backwards config discovery
    ...
    considered:
      # Note: D1 in gvp.yaml is Walk-backwards config discovery, not Python choice.
      # The banked context is for v0:D1 (Python choice) which lives in v0.yaml.
```

Actually — the banked context is for `v0:D1` (Python 3.11+), not `gvp:D1`. Add to
`.gvp/library/v0.yaml` on the appropriate design choice.


## 2. `priority` field on Elements

### YAML Schema

Optional field on any element:

```yaml
goals:
  - id: G1
    name: Ship on time
    priority: 1
```

### Model Change

Add `priority: float | int | None = None` to the `Element` dataclass. Add `"priority"`
to `ELEMENT_ATTRS` in `loader.py`. Extract in `_parse_element`.

### Validation

Only validated when present:

- Must be `int` or `float` — error: `{qid}: priority must be a number, got {type}`

### Rendering

**Markdown:** `**Priority:** {value}` shown after tags/maps_to, before primary field text.

**CSV:** Add `priority` column after `statement`.

**SQLite:** Add `priority REAL` column to `elements` table.

**DOT/PNG:** No changes.


## 3. "Categorization time check" heuristic

### Location

`examples/software-project/universal.yaml` — new heuristic UH2.

### Content

```yaml
heuristics:
  - id: UH2
    name: Categorization time check
    statement: >
      If you are spending more time deciding what category something belongs in
      than documenting the thing itself, pick the closest category and move on.
      Tags can capture the nuance.
    tags: [alignment, usability]
    maps_to: [universal:UV3, universal:UG2]
```

### Rationale for mappings

- **UV3 (Transparency):** Document it honestly rather than agonizing over taxonomy.
- **UG2 (Build products users rely on):** Don't let process overhead slow down capturing real decisions.


## Files Changed

| File | Change |
|------|--------|
| `src/gvp/model.py` | Add `priority` field to Element |
| `src/gvp/loader.py` | Add `priority` to ELEMENT_ATTRS, extract in _parse_element |
| `src/gvp/commands/validate.py` | Add `considered` schema validation, `priority` type validation |
| `src/gvp/renderers/markdown.py` | Render `considered` sub-list, `priority` line |
| `src/gvp/renderers/csv.py` | Add `considered` and `priority` columns |
| `src/gvp/renderers/sqlite.py` | Add `considered_alternatives` table, `priority` column |
| `docs/reference/schema.md` | Document `considered` and `priority` fields |
| `.gvp/library/v0.yaml` | Add `considered` data to v0:D1 |
| `examples/software-project/universal.yaml` | Add UH2 heuristic |
| `tests/` | Tests for all new validation, rendering |
