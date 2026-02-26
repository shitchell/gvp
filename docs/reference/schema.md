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
| `definitions` | mapping | No | Definitions for library-level constructs. Supports `definitions.tags` for tag definitions and `definitions.categories` for custom element category definitions. See [Tag Definitions](#tag-definitions) and [Element Category Definitions](#element-category-definitions). |

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

These categories are the built-in defaults. The framework loads them from a
built-in schema and they can be overridden or extended via
`meta.definitions.categories`. See [Element Category Definitions](#element-category-definitions).


## Element Fields

### Common Fields

These fields are recognized on every element regardless of category.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Unique within the document per category. Convention: prefix + number (e.g., `G1`, `P3`, `D2`). |
| `name` | string | Yes | Human-readable name for the element. |
| `tags` | list[string] | No | Classification tags. Must be defined via `meta.definitions.tags` in any document. |
| `maps_to` | list[string] | No | List of qualified IDs (`document:ID`) this element traces to. See [Qualified IDs](#qualified-ids). |
| `status` | string | No | One of `active` (default), `deprecated`, or `rejected`. |
| `priority` | number | No | Numeric priority. Validated as int or float when present. |
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

### considered (Design Choices)

The `considered` field is an optional map on `design_choice` elements that records
alternatives that were evaluated and rejected. Each key is the alternative name, and
each value is a dict that must include `rationale` (the rejection rationale).

```yaml
design_choices:
  - id: D1
    name: Use Python
    rationale: ...
    considered:
      go:
        description: Fast compiled language.
        rationale: Marginal benefit didn't justify switching.
      node:
        rationale: Not as strong for CLI tools.
```

| Inner Field | Type | Required | Description |
|-------------|------|----------|-------------|
| `rationale` | string | Yes | Why this alternative was rejected. |
| `description` | string | No | Brief description of the alternative. |
| *(any other)* | any | No | Additional context fields are preserved. |

Validation rules (only checked when `considered` is present):
- `considered` must be a dict (error if string, list, etc.)
- Each value must be a dict (error if bare string)
- Each inner dict must have a `rationale` key (error: "rejection rationale missing")

### Additional Fields

Any YAML keys not in the common fields list are preserved as extra attributes on
the element's Pydantic model. This allows user-defined extensions without schema
changes. For example, a team could add an `effort` or `owner` field to their
elements:

```yaml
goals:
  - id: G1
    name: Ship on time
    statement: Deliver by Q2.
    effort: large
    owner: alice
```

Extra fields are stored as additional model attributes and passed through to
renderers. Category-specific fields (like `considered` on design choices) can
be formally defined via `field_schemas` in the element category definition -- see
[Element Category Definitions](#element-category-definitions).


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


## Tag Definitions

Tags are defined in the `meta.definitions.tags` block of any GVP document. The
block contains two subsections -- `domains` and `concerns` -- each mapping tag
names to their descriptions.

### Structure

```yaml
meta:
  name: my-document
  definitions:
    tags:
      domains:
        tag-name:
          description: What this domain tag represents
      concerns:
        tag-name:
          description: What this concern tag represents
```

Each tag receives a `type` field (`"domain"` or `"concern"`) derived from the
subsection it appears in. The `domains` / `concerns` grouping is a user
convention for organizing tags -- both subsections are loaded identically.

### Inline Example

Tags can be defined in a document that also contains elements:

```yaml
meta:
  name: my-project
  inherits: personal
  definitions:
    tags:
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

goals:
  - id: G1
    name: Ship on time
    tags: [code]
    statement: ...
```

### Dedicated File Example

A document can define only tags and no elements. This is useful when you want a
single file that serves as the tag registry for a library:

```yaml
meta:
  name: tags
  definitions:
    tags:
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

### Accumulation Semantics

Tags accumulate across all documents in a library. When multiple documents
define the same tag name, the first loaded document's definition is kept and
subsequent definitions for the same tag name trigger a W007 warning (see
[Validation Reference](validation.md#warnings)).


## Element Category Definitions

Element categories can be customized or extended via `meta.definitions.categories` in any GVP document. The framework ships with built-in categories (see [Element Categories](#element-categories) above); user definitions can override properties of existing categories or add entirely new ones.

### Structure

```yaml
meta:
  definitions:
    categories:
      # Override an existing category's color
      heuristic:
        color: "#FF0000"

      # Add a completely new category
      experiment:
        yaml_key: experiments
        id_prefix: EX
        primary_field: hypothesis
        mapping_rules:
          - [goal, value]
        field_schemas:
          hypothesis:
            type: string
            required: true
```

### Element Category Definition Fields

| Field | Type | Required (new) | Description |
|-------|------|----------------|-------------|
| `yaml_key` | string | Yes | The YAML key used in documents (e.g., `experiments`). Must be unique across all categories. |
| `id_prefix` | string | Yes | Prefix for auto-generated IDs (e.g., `EX` for `EX1`, `EX2`). Must be unique. |
| `primary_field` | string | No | The main content field name. Defaults to `statement`. |
| `display_label` | string | No | Human-readable label for rendered output. Defaults to titlecased `yaml_key`. |
| `color` | string | No | Hex color for graph rendering. Defaults to `#CCCCCC`. |
| `is_root` | boolean | No | If true, this category is exempt from traceability rules. Defaults to false. |
| `mapping_rules` | list[list[string]] | Required if not root | Traceability rules. Each inner list is a group of categories that must ALL be present (AND). Groups are alternatives (OR). |
| `tier` | integer | No | Vertical tier for DOT graph rendering. Lower numbers appear at bottom. |
| `field_schemas` | mapping | No | Schema definitions for category-specific fields. See [Field Schemas](#field-schemas). |

For existing categories, only the fields you specify are overridden; others retain their built-in values.

### Field Schemas

The `field_schemas` mapping defines typed fields for a category. Each field has:

| Property | Type | Description |
|----------|------|-------------|
| `type` | string | One of: `string`, `number`, `boolean`, `list`, `dict`. |
| `required` | boolean | Whether the field must be present. Defaults to false. |

For `dict` type fields, you can define nested model validation:

```yaml
field_schemas:
  considered:
    type: dict
    required: false
    values:
      type: model
      fields:
        rationale:
          type: string
          required: true
        description:
          type: string
          required: false
```

### The `_all` Keyword

Use `_all` to add field schemas to every category:

```yaml
meta:
  definitions:
    categories:
      _all:
        field_schemas:
          custom_field:
            type: string
            required: false
```

### Mapping Rules Syntax

Mapping rules use a list-of-lists format where:
- Each inner list is a **group** -- all categories in the group must be present (AND)
- Multiple groups are **alternatives** (OR)

Examples:
```yaml
# Must map to goal AND value
mapping_rules:
  - [goal, value]

# Must map to (goal AND value) OR principle OR rule
mapping_rules:
  - [goal, value]
  - [principle]
  - [rule]
```

### Validation

New element category definitions are validated:
- `yaml_key` and `id_prefix` are required for new categories
- Non-root categories must have `mapping_rules`
- `id_prefix` must be unique across all categories
- `yaml_key` must be unique across all categories
- All categories referenced in `mapping_rules` must exist

### Accumulation

Element category definitions accumulate across documents in a library (first-wins). If the same category name is defined in multiple documents, a W008 warning is emitted and the first definition is kept.


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
