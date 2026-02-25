# YAML Schema Reference

This document is the complete field-level reference for GVP YAML files. For a
conceptual overview of the framework, see the [README](../../README.md). For
term definitions, see the [Glossary](../../GLOSSARY.md).


## Document Structure

A GVP document is a YAML file containing a `meta` block and one or more element
lists grouped by category. The `meta` block defines document-level metadata; the
element lists contain the goals, values, principles, and other elements that
make up the GVP store.

```yaml
meta:
  name: my-project
  scope: project
  inherits: personal
  defaults:
    origin:
      date: "2026-01-15"

goals:
  - id: G1
    name: Ship on time
    statement: ...

values:
  - id: V1
    name: Reliability
    statement: ...
```


## meta Block

The `meta` block defines document-level metadata. It is a YAML mapping at the
top level of the file.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Unique document name. Used in qualified IDs (`name:ID`) and `inherits` references. Defaults to the filename stem if omitted. |
| `scope` | string | No | Human-readable scope label (e.g., `"universal"`, `"project"`, `"implementation"`). Used by user-defined validation rules; not enforced by the framework. |
| `inherits` | string or list | No | Parent document name(s). Forms a DAG -- cycles are rejected. See [Inheritance](#inheritance) below. |
| `defaults` | mapping | No | Default field values applied to every element unless explicitly overridden. See [Defaults](#defaults) below. |
| `id_prefix` | string | No | Prefix for auto-generated element IDs (used by `gvp add`). |

### Inheritance

The `inherits` field declares one or more parent documents. It accepts either a
single string or a list of strings:

```yaml
# Single parent
meta:
  name: project-abc
  inherits: personal

# Multiple parents
meta:
  name: project-abc
  inherits:
    - personal
    - org-standards
```

Values in `inherits` are document names (matching the parent's `meta.name`).
Path-based references are also supported: a value like `projects/taskflow`
resolves to the `meta.name` of the document found at that relative path within
the library directory.

Inheritance forms a directed acyclic graph (DAG). Circular references are
detected and rejected at load time. When resolving the full ancestor chain, the
loader uses breadth-first search (BFS) starting from the document's direct
parents: each parent is visited in declaration order, then their parents, and so
on. Already-visited documents are skipped, producing a stable, deterministic
ordering.

### Defaults

The `defaults` mapping provides default field values applied to every element in
the document. If an element explicitly sets a field, the explicit value takes
precedence. If the field is absent from the element, the default is used.

```yaml
meta:
  name: gvp
  scope: project
  defaults:
    origin:
      date: "2026-02-23"
      note: "Inferred from planning sessions"
```

With the above defaults, every element in the document that does not explicitly
define `origin` will receive:

```yaml
origin:
  - date: "2026-02-23"
    note: "Inferred from planning sessions"
```

The `origin` field is special-cased during defaults merging: if the default
value is a single mapping (dict), it is automatically wrapped in a list to match
the expected `list[mapping]` type.


## Element Categories

Elements are grouped under plural YAML keys. Each key maps to a singular
category name used internally and in output. The "primary field" is the
category-specific content field that carries the element's main substance.

| YAML Key | Category | Primary Field |
|----------|----------|---------------|
| `goals` | goal | `statement` |
| `values` | value | `statement` |
| `principles` | principle | `statement` |
| `heuristics` | heuristic | `statement` |
| `rules` | rule | `statement` |
| `design_choices` | design_choice | `rationale` |
| `milestones` | milestone | `description` |
| `constraints` | constraint | `impact` |
| `implementation_rules` | implementation_rule | `statement` |
| `coding_principles` | coding_principle | `statement` |

`implementation_rules` and `coding_principles` are not core categories. They are
conventions used in the `software-project` example. The framework supports them
natively (they are in the category map), but they are not required and may not
be relevant outside software development contexts.


## Element Fields

### Common Fields

These fields are recognized on every element regardless of category.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Unique within the document per category. Convention: prefix + number (e.g., `G1`, `P3`, `D2`). |
| `name` | string | Yes | Human-readable name for the element. |
| `tags` | list[string] | No | Classification tags. Must be defined in `tags.yaml`. |
| `maps_to` | list[string] | No | List of qualified IDs (`document:ID`) this element traces to. See [Qualified IDs](#qualified-ids). |
| `status` | string | No | One of `active` (default), `deprecated`, or `rejected`. |
| `origin` | list[mapping] | No | Provenance -- where and when the element was first captured. See [Provenance Fields](#provenance-fields). |
| `updated_by` | list[mapping] | No | Change history entries. See [Provenance Fields](#provenance-fields). |
| `reviewed_by` | list[mapping] | No | Review acknowledgment entries. See [Provenance Fields](#provenance-fields). |

### Category-Specific Fields

Each category has a primary content field:

- **statement** -- Used by goals, values, principles, heuristics, rules,
  implementation_rules, and coding_principles. Contains the element's core
  assertion or commitment.
- **rationale** -- Used by design_choices. Explains why the choice was made,
  including what alternatives were considered.
- **impact** -- Used by constraints. Describes how the constraint affects
  decisions.
- **description** -- Used by milestones. Describes what the milestone represents.

Milestones also support a `progress` field for tracking completion status.

### Additional Fields

Any YAML keys not in the common fields list are preserved as extra fields on the
element. This allows user-defined extensions without schema changes. For
example, a team could add a `priority` or `effort` field to their elements:

```yaml
goals:
  - id: G1
    name: Ship on time
    statement: Deliver by Q2.
    priority: high
    effort: large
```

The `priority` and `effort` fields are stored in the element's `fields` dict
and passed through to renderers.


## Provenance Fields

Provenance fields track when and why an element was created, changed, or
reviewed. Each is a list of mappings.

### origin

Records where and when the element was first captured.

```yaml
origin:
  - date: "2026-02-23"
    note: "Inferred from planning sessions"
```

Each entry supports:

| Field | Type | Description |
|-------|------|-------------|
| `date` | string | ISO date (e.g., `"2026-02-23"`). |
| `note` | string | Context about where the element came from. |
| `by` | string | Who captured it. |

The `origin` field accepts either a single mapping or a list. If a single
mapping is provided, it is normalized to a list of one entry at load time.

### updated_by

Records changes to the element after initial creation.

```yaml
updated_by:
  - date: "2026-02-24"
    rationale: "Refined statement for clarity"
    by: "Guy"
```

Each entry supports:

| Field | Type | Description |
|-------|------|-------------|
| `date` | string | ISO date of the change. |
| `rationale` | string | Why the change was made. |
| `by` | string | Who made the change. |

### reviewed_by

Records review acknowledgments. Used by staleness detection: when an ancestor's
`updated_by` date is newer than a descendant's latest `reviewed_by` date, the
validator flags the descendant as potentially stale.

```yaml
reviewed_by:
  - date: "2026-02-23"
    by: "Guy"
```

Each entry supports:

| Field | Type | Description |
|-------|------|-------------|
| `date` | string | ISO date of the review. |
| `by` | string | Who reviewed the element. |
| `note` | string | Optional review notes. |


## Qualified IDs

A qualified ID uniquely identifies an element across the entire GVP catalog. The
format is:

```
document_name:element_id
```

- `document_name` is the value of the element's document's `meta.name`.
- `element_id` is the element's `id` field.

Examples: `gvp:G1`, `personal:V3`, `project-abc:D2`.

Qualified IDs are used in `maps_to` lists to create traceability links between
elements, including across document boundaries. IDs are never reused within a
document -- once assigned, an ID is permanently consumed even if the element is
deprecated or rejected.


## tags.yaml Format

Tags are defined in a `tags.yaml` file within a library directory. The file
contains two sections -- `domains` and `concerns` -- each mapping tag names to
their descriptions.

```yaml
domains:
  framework:
    description: Core GVP framework design -- schema, element types, traceability model
  tooling:
    description: The gvp CLI utility and its implementation

concerns:
  alignment:
    description: Ensuring decisions trace back to goals and values consistently
  usability:
    description: Accessible to non-technical users and AI assistants alike
  integrity:
    description: Data correctness, provenance, and trustworthiness of the GVP store
```

The `domains` / `concerns` grouping is a user convention for organizing tags.
Both sections are loaded identically -- each tag receives a `type` field
(`"domain"` or `"concern"`) derived from the section it appears in. Tags from
different libraries are merged; the first definition wins.

A domain-specific project might define entirely different tags:

```yaml
domains:
  code:
    description: Software development decisions
  systems:
    description: Infrastructure and architecture decisions

concerns:
  maintainability:
    description: Reducing future cost of change
  reliability:
    description: System behaves correctly under expected conditions
```


## Technical Glossary

The following terms have precise technical meanings within the GVP schema.

**Qualified ID** -- A string in `document_name:element_id` format that uniquely
identifies an element across the catalog. Used in `maps_to` fields and internal
references. Examples: `gvp:G1`, `personal:V3`.

**maps_to** -- A list of qualified IDs on an element that declares traceability
links. Each entry points to another element (possibly in a different document)
that the current element supports, implements, or derives from. The links form a
directed graph used for validation (R3: all elements must trace to a goal and a
value) and rendering.

**meta.defaults** -- A mapping in the `meta` block whose entries are applied as
default values to every element in the document. An element's explicit fields
always override defaults. The `origin` field is special-cased: a single mapping
default is automatically wrapped in a list.

**reviewed_by** -- A provenance field (list of mappings) on an element that
records review acknowledgments. The validator uses the latest `reviewed_by`
date compared against ancestor `updated_by` dates to detect staleness (W006).
