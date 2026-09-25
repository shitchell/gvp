# Validation Reference

The `cairn validate` command checks a loaded catalog for structural errors and semantic warnings. This document is the canonical reference for all validation rules, warning codes, and configuration options.

## Traceability Rules

Traceability rules are defined per-category in the element category schema (see
[schema.md](schema.md#element-category-definitions)). The rules below describe the
built-in defaults.

Every non-root element must anchor to at least one **non-value root** (goal,
constraint, user_requirement, or exclusion) and should also trace to at least one
**value** -- either directly through its `maps_to` references, or transitively
through elements it maps to. The value anchor is enforced *softly* (W017 warning,
transitive, suppressible), because the acceptance value often lives upstream in an
inherited org/personal library. Five categories are exempt from the anchor
requirement because they *are* the roots of the traceability graph:

- **Goals** -- no mapping required
- **Values** -- no mapping required (the value axis itself)
- **Constraints** -- no mapping required
- **User Requirements** -- no mapping required; a stakeholder-decreed mandate asserted as input, not derived from any value
- **Exclusions** -- no mapping required; a self-imposed out-of-scope boundary (the negative space of goals)

Roots are *encouraged* to map when applicable (e.g. a requirement may map to the
value it resonates with), but are never required to.

Elements with status `deprecated` or `rejected` are excluded from all traceability checks.

### Core Categories

| Category | Must anchor to... |
|----------|---------------|
| Milestone | (1+ goal AND 1+ value) OR 1+ constraint OR 1+ user_requirement OR 1+ exclusion |
| Principle | (1+ goal AND 1+ value) OR 1+ constraint OR 1+ user_requirement OR 1+ exclusion |
| Rule | (1+ goal AND 1+ value) OR 1+ constraint OR 1+ user_requirement OR 1+ exclusion |
| Decision | (1+ goal AND 1+ value) OR 1+ constraint OR 1+ user_requirement OR 1+ exclusion |
| Heuristic | (1+ goal AND 1+ value) OR 1+ constraint OR 1+ user_requirement OR 1+ exclusion OR 1+ principle OR 1+ rule |

Every non-root element must anchor to at least one **non-value root**. The
`[goal, value]` pair remains a satisfying group (backward compatible), but a single
non-value root -- constraint, user_requirement, or exclusion -- now also satisfies
the structural anchor check (W003). This is what lets a decision that actions a
stakeholder mandate map *only* to that `user_requirement` without a manufactured
goal/value pair.

Separately, the **value anchor** is checked softly and transitively (W017): if no
value is reachable anywhere in the graph (including inherited libraries), a warning
is emitted -- not an error -- because the acceptance value frequently lives upstream
and hard-erroring would force a hollow local value stub.

Heuristics keep an additional **alternative path**: they may map to a principle or a
rule, which must itself trace onward to the roots, so the chain is still complete --
just indirect.

### Extended Categories

Some example projects (such as `software-project`) define additional categories with their own traceability rules:

| Category | Must map to... |
|----------|---------------|
| Implementation Rule | (1+ goal AND 1+ value) OR 1+ decision |
| Coding Principle | (1+ goal AND 1+ value) OR 1+ principle or decision |

These are not built-in categories -- they are defined via `meta.definitions.categories` in the example project's documents.

These follow the same alternative-path pattern. An implementation rule can map directly to a goal and value, or it can take the shortcut of mapping to a decision (which itself must trace to a goal and value). A coding principle can map to a goal and value directly, or to a principle or decision.

### How Alternatives Work

When a category has an alternative path (the "OR" side), the validator checks the alternative first. If the element maps to any element in the alternative set, validation passes immediately. If not, the validator falls back to checking the required set (goal AND value).

The alternative path is a shortcut, not an escape hatch. The element you map to must itself satisfy traceability -- the chain of goal-and-value coverage is preserved, just one level removed. If a heuristic maps to a principle that itself has no goal or value mapping, the *principle* will fail validation, not the heuristic.


## Errors

Errors cause `cairn validate` to exit with code 1.

| Code | Name | Description |
|------|------|-------------|
| E001 | BROKEN_REFERENCE | A reference does not uniquely resolve to a loaded element. References use the library short address `[<alias>:]<meta.name>:<id>` (or the canonical `source:documentPath:id`); the message distinguishes *not found* from *ambiguous* (a bare `meta.name:id` matching more than one library — qualify it with the inherited-source alias). |
| E003 | BROKEN_INHERITANCE | A document's `meta.inherits` names a document that was not found in any loaded library. |
| E004 | SCHEMA_VALIDATION | Element fails schema validation (missing required fields, wrong types, etc.). |
| E006 | DUPLICATE_DOCUMENT_NAME | Two documents in the same library (one `source`) resolve to the same `meta.name`. The library short address `[<alias>:]<meta.name>:<id>` requires names to be unique within a library. Cross-library duplicates are fine (disambiguated by the `as:` alias). |


## Warnings

Warnings are printed to stderr but do not cause a non-zero exit code under normal operation. Each warning is prefixed with a code for identification and suppression.

| Code | Name | Description |
|------|------|-------------|
| W001 | EMPTY_MAPS_TO | A non-root active element has no `maps_to` references at all. This is a weaker signal than a traceability violation: the element has no mappings rather than incorrect ones. |
| W002 | EMPTY_DOCUMENT | A loaded document contains no elements. |
| W003 | MAPPING_RULES_VIOLATION | A non-root element does not satisfy its category's mapping rules (see [Traceability Rules](#traceability-rules) above). |
| W005 | SELF_DOCUMENT_MAPPING | A non-root active element's `maps_to` targets all live in its own document -- nothing it maps to is outside the document. Fires unconditionally (DEC-5.5); the document does *not* need an `inherits` chain. See [W005 on self-contained libraries](#w005-on-self-contained-libraries). |
| W006 | STALE_ELEMENT | The element has at least one of its own `updated_by` entries that no `reviewed_by` entry lists in `updates_reviewed` (updates marked `skip_review: true` are exempt). Per-element and per-update-id -- no ancestor traversal, no date comparison (DEC-4.6, DEC-4.7). Use `cairn review` to inspect and acknowledge. |
| W007 | UNDEFINED_TAG | A tag on an element is not defined via `meta.definitions.tags` in any loaded document. |
| W009 | ID_SEQUENCE_GAP | Element IDs within a category in a single document have gaps (e.g., P1 and P3 but no P2). |
| W010 | REF_FILE_MISSING | A ref points to a file that does not exist on disk. |
| W011 | REF_IDENTIFIER_MISSING | A ref's identifier was not found in the referenced file. |
| W012 | ORPHAN_IDENTIFIER | An identifier in a file is not referenced by any element (coverage pass only). |
| W013 | DECISION_NO_REFS | An **accepted** decision has no refs (coverage pass only). `declined` and `deferred` decisions are exempt -- their rationale and considered alternatives are the record. A decision with no `disposition` is treated as `accepted`. |
| W016 | UNRECOGNIZED_YAML_KEY | A top-level YAML key in a document is neither `meta` nor a known category `yaml_key` (structural pass). |
| W017 | NO_VALUE_TRACE | A non-root element does not trace to any value transitively. Soft anchor: the acceptance value often lives upstream in an inherited library, so this warns rather than errors (promotable under `--strict`). |
| W018 | ROOT_NO_DECISION | An actionable root -- a category declaring `requires_decision: true` (goal, constraint, user_requirement) -- has no Decision tracing to it (coverage pass only). `value` and `exclusion` are exempt. Ensures decreed drivers are explicitly actioned (accept/decline/defer). |

### W005 on self-contained libraries

W005 fires on every non-root element of a library that has no `inherits`. This is
expected, not a defect.

A document with no `inherits` chain has nothing outside itself to map to. By
construction, every one of its `maps_to` targets is local, so every non-root element
in it trips W005. The volume is a property of the shape of the library, not evidence
that something is misconfigured. In a real self-contained personal library measured
during the 3.x cycle, all 24 W005s came from the single root document with no
`inherits`, and zero came from its child documents -- the children map up into the
parent, so their mappings leave their own document and the warning never fires.

The previous version of this reference described W005 as "only checked when the
element's document has an `inherits` chain." That was the v0 rule, and
[DEC-5.5](../plans/2026-03-02-v1-design-decisions.md) deliberately retired it: the
conditional existed only to work around the lack of a suppression mechanism, and the
typed diagnostic system (DEC-5.4) now provides that directly. The implementation has
no `inherits` guard.

So: if you are looking at a wall of W005s on a library that inherits nothing, that is
the diagnostic working as designed. The intended response is to suppress it rather
than to restructure the library:

```yaml
suppress_diagnostics:
  - W005
```

W005 earns its keep on libraries that *do* inherit, where an element mapping only
within its own document means it never traced back to the ancestor it was supposed to
descend from.

### Suppressing Diagnostics

Diagnostics can be suppressed in `config.yaml` using the `suppress_diagnostics` list. See [config.md](config.md) for details on configuration format.

```yaml
suppress_diagnostics:
  - W001
  - W005
```


## Strict Mode

When `--strict` is passed on the command line (or `strict: true` is set in `config.yaml`), all warnings are promoted to errors. This means:

- Any warning that would normally be printed to stderr also gets added to the error list.
- The exit code becomes 1 if any warnings exist.

Strict mode is useful in CI pipelines where you want to enforce a zero-warning policy.

```bash
cairn validate --strict
```


## User-Defined Validation Rules

You can define custom validation rules in `config.yaml` under the `validation_rules` key (top-level). Each rule specifies a set of match filters (which elements the rule applies to) and a set of require checks (what those elements must satisfy).

### Match Filters

| Filter | Description |
|--------|-------------|
| `category` | Only apply to elements of this category (e.g., `decision`). |
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
validation_rules:
  - name: Decisions must reference a heuristic
    match:
      category: decision
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

The first rule warns if any decision does not map to at least one heuristic. The second rule errors if any element in a document with `scope: implementation` does not map to at least one element in a document with `scope: project`.

See [config.md](config.md) for the full configuration file format and [schema.md](schema.md) for field definitions.
