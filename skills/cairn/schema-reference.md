# Cairn Schema Reference

## Document Structure

Every GVP YAML document has a `meta` block and element lists:

```yaml
meta:
  name: my-project
  scope: project                    # project | implementation | personal | universal
  inherits:                         # parent documents/libraries
    - parent-doc                    # local document (same library)
    - source: "@github:org/lib@v1"  # external git source
      as: org                       # alias for references
  defaults:                         # applied to all elements in this doc
    tags: [backend]
  definitions:
    tags:
      reliability:
        description: System reliability concerns
    categories:                     # user-defined categories (extends built-ins)
      api_endpoint:
        yaml_key: api_endpoints
        id_prefix: API
        primary_field: description
        mapping_rules: [[goal, value]]
  config_overrides:                 # ancestor-enforced settings
    strict:
      mode: replace
      value: true

goals:
  - id: G1
    name: Ship reliable software
    statement: Deliver software that works correctly.
    tags: [reliability]
    maps_to: []
    priority: 1                     # optional numeric priority
    refs:                           # optional artifact links
      - file: docs/requirements.md
        identifier: Reliability Requirements
        role: defines
```

## Field Types

The `field_schemas` system supports these types:

| Type | Description | Example |
|------|-------------|---------|
| `string` | Text | `statement: { type: string, required: true }` |
| `number` | Numeric | `priority: { type: number }` |
| `boolean` | True/false | `approved: { type: boolean }` |
| `datetime` | ISO 8601 with timezone | `deadline: { type: datetime }` |
| `enum` | Constrained string | `role: { type: enum, values: [defines, implements] }` |
| `list` | Array (optionally typed) | `tags: { type: list, items: { type: string } }` |
| `dict` | Key-value map | `metadata: { type: dict, values: { type: string } }` |
| `model` | Nested object | `author: { type: model, fields: { name: {...} } }` |

Fields support `required` (boolean), `display_name` (string for rendering).

## Reserved Fields

These fields exist on every element and cannot be redefined in `field_schemas`:

| Field | Type | Default | Auto-populated? |
|-------|------|---------|-----------------|
| `id` | string | — | Yes (auto-assigned) |
| `name` | string | — | No (user provides) |
| `status` | string | `"active"` | Defaulted |
| `tags` | string[] | `[]` | No |
| `maps_to` | string[] | `[]` | No |
| `priority` | number | — | No (optional) |
| `origin` | provenance[] | — | Yes (on add) |
| `updated_by` | provenance[] | — | Yes (on edit) |
| `reviewed_by` | provenance[] | — | Yes (on review) |

## Primary fields: only `decision` has a `rationale`

Each category has one **primary field** — the field that carries its content, and
the field `cairn libs search` searches:

| Category | Primary field |
|----------|---------------|
| goal, value, user_requirement, exclusion, principle, rule, heuristic | `statement` |
| constraint | `impact` |
| milestone, procedure | `description` |
| decision | `rationale` |

**Guiding elements have no `rationale` field.** `rationale` belongs to `decision`
(and to each entry of a decision's `considered` map) and to nothing else. A
principle, rule, heuristic, or procedure carries its content in `statement` /
`description`; its *"why"* is not a field at all — it lives in what the element
`maps_to`.

This is worth knowing because the failure is **silent**: `meta` and elements are
passthrough, so `cairn add principle "..." -f rationale="..."` exits 0, validates
clean with no warning, and the value is never rendered by `inspect` or by any
exporter. You will not be told. If you want a guiding element's justification to
be visible, put it in `statement` or map the element to what justifies it.

## Element References

References use colon-separated segments:

| Format | Scope | Example |
|--------|-------|---------|
| `V1` | Same document | Element V1 in this document |
| `project:V1` | Same library | Element V1 in document "project" |
| `org:values:V1` | Cross-library | Element V1 in "values" doc from "org" source |

## Considered Alternatives

Decisions support a `considered` field for rejected alternatives:

```yaml
decisions:
  - id: D1
    name: Use PostgreSQL
    rationale: Mature, reliable, team has experience.
    maps_to: [my-project:G1, my-project:V1]
    considered:
      MySQL:
        rationale: Less feature-rich for our use case.
        description: Popular open-source RDBMS.
      MongoDB:
        rationale: Schema flexibility not needed; relational model fits better.
```

## Mapping Rules

Non-root categories define `mapping_rules` — what categories their elements must map to:

```yaml
# Outer array = OR groups. Inner array = AND within group.
mapping_rules:
  - [goal, value]           # must map to goal AND value
  - [principle]             # OR just a principle
  - [rule]                  # OR just a rule
```

### Mapping rules are satisfied by DIRECT targets only

This is the trap. `mapping_rules` look at the categories of an element's **own
`maps_to` entries** and nothing further. Reaching an anchor *through* another
element does not satisfy them.

```yaml
# D1 maps to G1 and V1 — satisfies [goal, value].
# D2 maps only to D1. D1's anchors are NOT inherited: W003.
decisions:
  - id: D1
    maps_to: [proj:G1, proj:V1]
  - id: D2
    maps_to: [proj:D1]        # W003 MAPPING_RULES_VIOLATION
```

**W014** (no root trace) and **W017** (no value trace) are the *only* transitive
checks. `D2` above raises neither — it does reach a root, and it does reach a
value — but it still raises `W003`, because no *group* of its own direct targets
matches a rule. Nothing about the transitivity of W014/W017 relaxes `W003`.

Practically: **a decision chained through another decision still needs its own
anchor group.** Write `maps_to: [proj:D1, proj:G1, proj:V1]` if `D1` is genuinely
the thing it builds on — the link to `D1` is worth keeping, it just is not an
anchor.

(Note that the anchor groups differ per category — see the `mapping_rules` of each
built-in category in `defaults.yaml`. A heuristic may anchor on `[principle]` or
`[rule]` alone; a procedure may not.)

## Config

Four layers (closer scope wins): system → global → project → local.

```yaml
# .gvp/config.yaml
user:
  name: "Your Name"
  email: "you@example.com"
strict: false
suppress_diagnostics: ["W005"]
default_timezone: "America/New_York"
coverage:
  exclude: [".gvp/**", "**/*.test.ts"]
priority:
  elements: ancestor        # ancestor-wins for elements
  definitions: descendant   # descendant-wins for definitions
```
