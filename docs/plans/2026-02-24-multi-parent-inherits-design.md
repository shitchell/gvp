# Multi-Parent Inheritance Design

**Date:** 2026-02-24
**Status:** Approved

## Summary

Change `Document.inherits` from a single-parent string to a list of parents, enabling documents to inherit from multiple ancestor documents. This turns the inheritance model from a linear chain into a DAG.

## Motivation

Real-world organizational structures are not linear. A project GVP might need to inherit from a team-specific GVP, a language-specific GVP (e.g., Python projects), and an infrastructure GVP (e.g., server projects) — all of which trace back to organization-wide goals and values. Single-parent inheritance forces artificial flattening of these relationships.

## YAML Syntax

Both forms are accepted at the YAML level; the loader normalizes to `list[str]`:

```yaml
# Single parent (string — backward compatible)
meta:
  inherits: universal

# Multiple parents (list)
meta:
  inherits:
    - team
    - python-projects
```

## Design Decisions

### 1. Data Model

- `Document.inherits: str | None` becomes `Document.inherits: list[str]`
- Empty list = no parents (replaces `None`)

### 2. Ancestor Resolution

- `Catalog.resolve_chain()` becomes `Catalog.resolve_ancestors()`
- BFS traversal from `doc.inherits` list
- Returns `list[Document]` in BFS order (declaration order at each level, then breadth)
- Returns ancestors only — the starting document is not included
- Raises `ValueError` on cycles

### 3. Loader

- `meta.inherits` normalization: `None` -> `[]`, `str` -> `[str]`, `list` -> `list`
- Path-based inherits resolution iterates the list

### 4. Validation

- **Broken inherits:** iterate the list, error for each broken reference
- **Circular inheritance:** BFS/DFS with visited set (replaces linear walk)
- **W005 (cross-doc tracing):** calls `resolve_ancestors()`, unions all ancestor documents, checks that maps_to reaches at least one. No change to the semantic intent — just wider ancestor set
- **`_validate_mappings`:** no changes (operates on element-level maps_to, not document inheritance)

### 5. Renderers

- **Markdown:** join list with comma for display, skip if empty
- **SQLite:** new `document_inherits` junction table with `position` column for declaration order; drop `inherits TEXT` column from `documents` table
- **Dot:** no changes (doesn't reference inherits)

### 6. Tests

- Mechanical updates: `inherits=None` -> `inherits=[]`, `inherits="x"` -> `inherits=["x"]`
- New test cases: multi-parent, diamond inheritance, cycle detection with multiple parents
- No new test files needed

### 7. Documentation

- **GLOSSARY.md:** update "Chain" entry to reflect multi-parent ancestry
- **README.md:** update "Scope and Inheritance" section with multi-parent explanation and example

## Key Behavioral Decisions

| Question | Decision | Rationale |
|----------|----------|-----------|
| W005 with multiple roots? | Union all ancestor docs, require reaching >= 1 | Root element tracing already covered by `_validate_mappings` category rules |
| Display order matter? | Yes for display/review, not for deterministic checks | Helps manual semantic coherence review |
| Override/merge semantics? | No override. Elements harmonize, not conflict | Anti-feature; heuristics resolve apparent tension |
| Diamond inheritance? | Fine — set-based traversal handles naturally | `ancestors()` pattern already uses visited sets |
| YAML backward compat? | Single string still accepted, normalized to list at parse time | Existing files don't break |

## Approach

Approach A (from brainstorming): `list[str]` internally, strong schema, loader normalizes at parse time. Chosen over union type (`str | list[str] | None`) because a consistent type prevents agents and contributors from inferring single-parent-only behavior from examples.
