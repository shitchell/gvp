# Validation Reference

The `gvp validate` command checks a loaded catalog for structural errors and semantic warnings. This document is the canonical reference for all validation rules, warning codes, and configuration options.

## Traceability Rules

Every element must trace back to at least one **goal** and one **value** -- either directly through its `maps_to` references, or transitively through elements it maps to. Three categories are exempt from this requirement because they *are* the roots of the traceability graph:

- **Goals** -- no mapping required
- **Values** -- no mapping required
- **Constraints** -- no mapping required

Elements with status `deprecated` or `rejected` are excluded from all traceability checks.

### Core Categories

| Category | Must map to... |
|----------|---------------|
| Milestone | 1+ goal AND 1+ value |
| Principle | 1+ goal AND 1+ value |
| Rule | 1+ goal AND 1+ value |
| Design Choice | 1+ goal AND 1+ value |
| Heuristic | (1+ goal AND 1+ value) OR 1+ principle or rule |

Milestones, principles, rules, and design choices must map directly to at least one goal and at least one value. Both are required -- mapping to only a goal or only a value is a traceability violation.

Heuristics have an **alternative path**: instead of mapping directly to a goal and a value, a heuristic can map to a principle or a rule. Either satisfies the requirement. The idea is that the principle or rule it maps to must itself trace to a goal and value, so the chain is still complete -- just indirect.

### Extended Categories

Some example projects (such as `software-project`) define additional categories with their own traceability rules:

| Category | Must map to... |
|----------|---------------|
| Implementation Rule | (1+ goal AND 1+ value) OR 1+ design choice |
| Coding Principle | (1+ goal AND 1+ value) OR 1+ principle or design choice |

These follow the same alternative-path pattern. An implementation rule can map directly to a goal and value, or it can take the shortcut of mapping to a design choice (which itself must trace to a goal and value). A coding principle can map to a goal and value directly, or to a principle or design choice.

### How Alternatives Work

When a category has an alternative path (the "OR" side), the validator checks the alternative first. If the element maps to any element in the alternative set, validation passes immediately. If not, the validator falls back to checking the required set (goal AND value).

The alternative path is a shortcut, not an escape hatch. The element you map to must itself satisfy traceability -- the chain of goal-and-value coverage is preserved, just one level removed. If a heuristic maps to a principle that itself has no goal or value mapping, the *principle* will fail validation, not the heuristic.


## Errors

Errors cause `gvp validate` to exit with code 1. Each error is printed to stderr with an `ERROR:` prefix.

| Check | Description |
|-------|-------------|
| Broken `maps_to` reference | A qualified ID in an element's `maps_to` list does not match any loaded element in the catalog. |
| Undefined tag | A tag on an element is not defined via `meta.definitions.tags` in any loaded document. |
| ID sequence gap | Element IDs within a category in a single document have gaps. For example, if a document contains P1 and P3 but no P2, that is a gap. IDs are expected to be sequential starting from 1. |
| Broken `inherits` reference | A document's `meta.inherits` names a document that was not found in any loaded library. |
| Circular inheritance | The inheritance graph contains a cycle (e.g., document A inherits B, and B inherits A). |
| Traceability violation | A non-root element does not satisfy its category's mapping rules (see [Traceability Rules](#traceability-rules) above). |


## Warnings

Warnings are printed to stderr but do not cause a non-zero exit code under normal operation. Each warning is prefixed with a code for identification and suppression.

| Code | Description |
|------|-------------|
| W001 | **Empty document** -- a loaded document contains no elements. |
| W002 | **Duplicate document name** -- two documents share the same `meta.name`. The first one loaded is kept; the second is skipped. In `--strict` mode, this becomes a hard error that raises an exception. |
| W003 | **Library path does not exist** -- a path listed in `config.yaml` under `libraries` does not exist on disk. |
| W004 | **Empty `maps_to`** -- a non-root element has no `maps_to` references at all. This is a weaker signal than a traceability violation: the element has no mappings rather than incorrect ones. |
| W005 | **Self-document-only mapping** -- an element in a document that has `inherits` maps only to elements in its own document, never tracing back to an inherited ancestor. This suggests the element may be disconnected from the parent GVP it extends. Only checked when the element's document has an `inherits` chain. |
| W006 | **Stale element** -- an ancestor element (reachable through `maps_to`) has an `updated_by` date that is newer than this element's most recent `reviewed_by` date. This means an upstream element changed and the downstream element has not been reviewed since. Use `gvp review` to inspect and acknowledge. |
| W007 | **Duplicate tag definition** -- the same tag name is defined in `meta.definitions.tags` in multiple documents within a library. The first loaded document's definition is kept; subsequent definitions for the same tag name are flagged. |

### Suppressing Warnings

Warnings can be suppressed in `config.yaml` using the `suppress_warnings` list. See [config.md](config.md) for details on configuration format.

```yaml
suppress_warnings:
  - W001
  - W004
```


## Strict Mode

When `--strict` is passed on the command line (or `strict: true` is set in `config.yaml`), all warnings are promoted to errors. This means:

- Any warning that would normally be printed to stderr also gets added to the error list.
- The exit code becomes 1 if any warnings exist.
- W002 (duplicate document name) becomes a hard error that raises an exception during loading, before validation even runs.

Strict mode is useful in CI pipelines where you want to enforce a zero-warning policy.

```bash
gvp validate --strict
```


## User-Defined Validation Rules

You can define custom validation rules in `config.yaml` under the `validation.rules` key. Each rule specifies a set of match filters (which elements the rule applies to) and a set of require checks (what those elements must satisfy).

### Match Filters

| Filter | Description |
|--------|-------------|
| `category` | Only apply to elements of this category (e.g., `design_choice`). |
| `scope` | Only apply to elements in documents with this scope label. |
| `tag` | Only apply to elements that have this tag. |
| `status` | Only apply to elements with this status (e.g., `active`). |

All match filters are optional. If no filters are specified, the rule applies to every element.

### Require Checks

| Check | Description |
|-------|-------------|
| `min_tags` | Element must have at least this many tags. |
| `has_field` | Element must have a non-empty value for this field name (e.g., `rationale`). |
| `maps_to_category` | Element must map to at least one element of the specified category. Accepts a string or list of strings; any match satisfies the check. |
| `maps_to_scope` | Element must map to at least one element in a document with the specified scope. Accepts a string or list of strings; any match satisfies the check. |

### Level

Each rule has a `level` field: either `"error"` (default) or `"warning"`. Errors contribute to a non-zero exit code; warnings are printed to stderr.

### Full Example

```yaml
validation:
  rules:
    - name: Design choices must reference a heuristic
      match:
        category: design_choice
      require:
        maps_to_category: heuristic
      level: warning

    - name: Implementation elements must trace to project scope
      match:
        scope: implementation
      require:
        maps_to_scope: project
      level: error
```

The first rule warns if any design choice does not map to at least one heuristic. The second rule errors if any element in a document with `scope: implementation` does not map to at least one element in a document with `scope: project`.

See [config.md](config.md) for the full configuration file format and [schema.md](schema.md) for field definitions.
