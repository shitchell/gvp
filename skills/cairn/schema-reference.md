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
