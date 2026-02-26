# Schema-Driven Categories, Pydantic Models, and Library Dir Rename

Date: 2026-02-25

## Overview

Replace all hardcoded element category definitions with a schema-driven system. Category
metadata (yaml_key, id_prefix, mapping_rules, field schemas) moves into
`meta.definitions.categories` in library documents. Element models become Pydantic
BaseModel subclasses generated at runtime from schema definitions. The `.gvp/library/`
directory is renamed to `.gvp/library/`.

This is a foundational architectural change that touches the loader, validator, model,
renderers, and CLI commands.


## 1. Element Category Definitions

### Location

Category definitions live in `meta.definitions.categories` in any library document —
the same pattern as tag definitions (`meta.definitions.tags`). They can live in any
document in the library; a dedicated file is optional.

### Built-in Defaults

Core categories (goal, value, principle, heuristic, rule, milestone, design_choice,
constraint, implementation_rule, coding_principle) ship as a bundled YAML file in the
Python package (e.g., `src/gvp/data/defaults.yaml`). The loader always loads these
first.

User definitions in `meta.definitions.categories` merge on top — users can add new
categories or override properties of built-in categories. Override is per-field: if a
user only redefines `color` on `heuristic`, all other heuristic properties keep their
built-in defaults.

### Schema

```yaml
meta:
  definitions:
    categories:
      heuristic:
        yaml_key: heuristics
        id_prefix: H
        primary_field: statement
        display_label: Heuristics
        color: "#50C878"
        is_root: false
        mapping_rules:
          - [goal, value]
          - [principle]
          - [rule]
        field_schemas:
          statement:
            type: string
            required: true
```

**Required fields per element category definition:**
- `yaml_key` — plural YAML section key (e.g., `heuristics`)
- `id_prefix` — for auto-generated IDs (e.g., `H`)

**Optional fields (with defaults):**
- `primary_field` — defaults to `statement`
- `display_label` — defaults to `yaml_key.replace("_", " ").title()`
- `color` — hex color for DOT rendering, defaults to `#CCCCCC`
- `is_root` — defaults to `false`; root categories have no mapping required
- `mapping_rules` — list-of-lists (see below); required if not `is_root`
- `field_schemas` — Pydantic-driven field definitions (see section 3)

### The `_all` Keyword

`_all` is a reserved keyword in `meta.definitions.categories` that defines field
schemas applied to every category:

```yaml
meta:
  definitions:
    categories:
      _all:
        field_schemas:
          priority:
            type: number
            required: false
```

Category-specific field schemas override `_all` if the same field name appears in both.

### Accumulation Semantics

Category definitions accumulate across documents in a library, same as tags:
- First-wins for user definitions of the same category
- W008 warning when two user documents define the same category
- Overriding built-in category properties is always silent (intended behavior)

### Drop schema.yaml Reservation

The `SKIP_FILES = {"schema.yaml"}` constant is removed. There is no reserved filename.


## 2. Mapping Rules

Mapping rules use a list-of-lists syntax where outer items are joined by OR and inner
items are joined by AND:

```yaml
mapping_rules:
  - [goal, value]     # goal AND value
  - [principle]        # OR principle
  - [rule]             # OR rule
```

This reads as: element must map to (goal AND value) OR (principle) OR (rule).

### Examples

| Category | Rule description | YAML |
|----------|-----------------|------|
| principle | goal AND value | `[[goal, value]]` |
| heuristic | (goal AND value) OR principle OR rule | `[[goal, value], [principle], [rule]]` |
| implementation_rule | (goal AND value) OR design_choice | `[[goal, value], [design_choice]]` |
| coding_principle | (goal AND value) OR principle OR design_choice | `[[goal, value], [principle], [design_choice]]` |
| goal | root, no rules needed | (omitted, `is_root: true`) |

### Semantics

- An element satisfies its mapping rules if ANY outer group is fully satisfied
- A group is satisfied when the element's `maps_to` targets include at least one
  element of EACH category listed in the group
- Root categories (`is_root: true`) have no mapping requirement; `mapping_rules` may
  still be present but is not enforced

### Documentation Note

This syntax trades explicitness for simplicity. Documentation must include multiple
examples showing the AND/OR translation clearly. A UI editor for modifying these rules
is a near-future addition.


## 3. Field Schemas (Pydantic-Driven)

Field schemas define the typed fields available on elements of a given category.
At runtime, these generate Pydantic model classes via `create_model()`.

### Schema Types

| Schema type | Pydantic type |
|-------------|---------------|
| `string` | `str` |
| `number` | `int \| float` |
| `boolean` | `bool` |
| `dict` | `dict[str, X]` |
| `list` | `list[X]` |
| `model` | generated `BaseModel` subclass |

### Field Schema Properties

- `type` — required
- `required` — whether the field must be present (default `false`)
- `label` — friendly name for error messages (e.g., `rejection rationale`)

### Nested Model Fields

For complex structures like `considered`, use `type: model` with nested `fields`:

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
          label: rejection rationale
        description:
          type: string
          required: false
```

This generates a nested Pydantic model with `extra="forbid"` — only `rationale` and
`description` are allowed as keys.

### Built-in Field Schema Example

The shipped defaults define field schemas for all core categories:

```yaml
categories:
  _all:
    field_schemas:
      priority:
        type: number
        required: false

  goal:
    yaml_key: goals
    id_prefix: G
    primary_field: statement
    display_label: Goals
    color: "#FFD700"
    is_root: true
    field_schemas:
      statement:
        type: string
        required: true

  design_choice:
    yaml_key: design_choices
    id_prefix: D
    primary_field: rationale
    display_label: Design Choices
    color: "#20B2AA"
    mapping_rules:
      - [goal, value]
    field_schemas:
      rationale:
        type: string
        required: true
      considered:
        type: dict
        required: false
        values:
          type: model
          fields:
            rationale:
              type: string
              required: true
              label: rejection rationale
            description:
              type: string
              required: false

  constraint:
    yaml_key: constraints
    id_prefix: CON
    primary_field: impact
    display_label: Constraints
    color: "#A9A9A9"
    is_root: true
    field_schemas:
      impact:
        type: string
        required: true

  milestone:
    yaml_key: milestones
    id_prefix: M
    primary_field: description
    display_label: Milestones
    mapping_rules:
      - [goal, value]
    field_schemas:
      description:
        type: string
        required: true
      progress:
        type: string
        required: false
```


## 4. Element Model (Pydantic)

### Base Element

The Element becomes a Pydantic `BaseModel` with structural fields that are always
present and not overridable:

```python
class Element(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)

    id: str
    name: str
    category: str
    status: str = "active"
    tags: list[str] = []
    maps_to: list[str] = []
    priority: float | int | None = None
    origin: list[dict] = []
    updated_by: list[dict] = []
    reviewed_by: list[dict] = []
    document: Document
```

### Per-Category Subclasses

Generated at runtime via `create_model()` from the merged schema:

```python
DesignChoiceElement = create_model(
    "DesignChoiceElement",
    __base__=Element,
    __config__=ConfigDict(extra="forbid"),
    rationale=(str, ...),
    considered=(dict[str, ConsideredAlternative] | None, None),
)
```

### Construction Flow

1. Load built-in defaults + user schema definitions
2. Merge schemas (user overrides built-in per-field)
3. For each category, `create_model()` a subclass of Element
4. When parsing YAML elements, instantiate the correct subclass
5. Pydantic validates types automatically on construction


## 5. Validation

### Pydantic Handles

All field-level validation — types, required fields, no extra keys, nested model
structure. Errors are caught during element construction in the loader.

### Error Translation

Pydantic `ValidationError` is caught and translated to GVP error format:

| Pydantic error type | GVP message |
|---------------------|-------------|
| `missing` | `{qid}: required field '{field}' missing` |
| `extra_forbidden` | `{qid}: unexpected field '{field}'` |
| type errors | `{qid}: field '{field}' must be {expected}, got {actual}` |
| nested errors | `{qid}: {field} — {detail}` (using `label` for friendly names) |

### Custom Validation (Non-Schema)

These remain as hand-written checks since they are cross-element or cross-document:

- Broken `maps_to` references
- Undefined tags
- ID sequence gaps
- Broken / circular `inherits`
- Mapping rules / traceability (from category schema)
- W004: empty maps_to on non-root
- W005: insular mappings
- W006: staleness
- W007: duplicate tag definitions
- W008: duplicate user element category definitions (new)
- W009: unknown YAML section keys (new)

### Schema Definition Validation

Category definitions themselves are validated at load time:

- `yaml_key` required — error if missing
- `id_prefix` required — error if missing
- Non-root category with empty/missing `mapping_rules` — error
- `mapping_rules` entries reference only known category names — error
- `id_prefix` unique across all categories — error if collision
- `yaml_key` unique across all categories — error if collision

### Command Behavior

- `gvp validate` — collects ALL errors, prints them, returns exit code
- All other commands — fail on FIRST error, suggest `run gvp validate for full report`

Both paths use the same validation code; the difference is error collection vs fail-fast.


## 6. Loader Changes

1. On startup, load built-in defaults from bundled YAML
2. When loading a library, accumulate `meta.definitions.categories` from documents
   (first-wins, same as tags)
3. Merge user element category definitions onto built-in defaults (per-field override)
4. Build category registry on the Catalog object
5. Generate Pydantic model subclasses per category
6. Parse element sections using category registry (dynamic yaml_key lookup instead of
   hardcoded CATEGORY_MAP)
7. Instantiate correct Pydantic subclass per element

### Removed Hardcoded Structures

All of these are replaced by the category registry:

| Hardcoded constant | File | Replaced by |
|-------------------|------|-------------|
| `CATEGORY_MAP` | `loader.py` | registry yaml_key lookup |
| `SKIP_FILES` | `loader.py` | removed entirely |
| `ID_PREFIXES` | `add.py` | registry id_prefix lookup |
| `YAML_KEYS` | `add.py` | registry yaml_key lookup |
| `_ROOT_CATEGORIES` | `validate.py` | registry is_root filter |
| `_MAPPING_RULES` | `validate.py` | registry mapping_rules |
| `CATEGORY_ORDER` | `markdown.py` | registry display order |
| `CATEGORY_COLORS` | `dot.py` | registry color |
| `tier_order` | `dot.py` | registry tier (new optional field) |
| `_validate_considered` | `validate.py` | Pydantic schema validation |
| priority type check | `validate.py` | Pydantic schema validation |


## 7. Directory Rename

`.gvp/library/` is renamed to `.gvp/library/`.

Changes:
- `src/gvp/config.py` — default discovery path
- `.gvp/library/` — rename in this repo
- `docs/` — all references
- `README.md` — all mentions
- Examples — any references
- Tests — fixture paths

No fallback to old name. Breaking change (scrappy alpha).


## 8. Renderers

Core code (loader, validator, model) is fully generic and schema-driven. Renderers
may hardcode knowledge of specific fields for nice output formatting, but must degrade
gracefully if those fields don't exist (e.g., check `hasattr` before rendering
`considered` sub-list).

Renderer-specific hardcoding that stays for now:
- Markdown: `considered` sub-list formatting
- SQLite: `considered_alternatives` table
- CSV: `considered` JSON column

**Future task (deferred):** Add render rules to schema definitions so renderers can
handle arbitrary field schemas generically. This would allow custom categories to define
how their fields appear in markdown, SQLite, etc. without renderer code changes.


## 9. Documentation

Every implementation task includes a documentation step:
- `docs/reference/schema.md` — update with element category definitions, field schemas, _all
- `docs/reference/validation.md` — update with W008, W009, Pydantic error translation
- `docs/reference/config.md` — update `.gvp/library/` path
- `docs/guide/developing-a-library.md` — custom category walkthrough
- `README.md` — update directory references
- `GLOSSARY.md` — new terms if needed
- Mapping rules syntax needs extensive examples showing AND/OR translation


## Files Changed

| Area | Files |
|------|-------|
| Model | `src/gvp/model.py` (Pydantic rewrite) |
| Schema | `src/gvp/schema.py` (new — schema loading, merging, model generation) |
| Defaults | `src/gvp/data/defaults.yaml` (new — bundled element category definitions) |
| Loader | `src/gvp/loader.py` (use schema registry, remove hardcoded maps) |
| Config | `src/gvp/config.py` (library → library path) |
| Validator | `src/gvp/commands/validate.py` (Pydantic errors, schema validation, W008/W009) |
| Add | `src/gvp/commands/add.py` (use schema registry) |
| Edit | `src/gvp/commands/edit.py` (use schema registry) |
| Query | `src/gvp/commands/query.py` (minor — category list from registry) |
| Renderers | `src/gvp/renderers/*.py` (use schema for ordering/colors/tiers) |
| Docs | `docs/reference/*.md`, `docs/guide/*.md`, `README.md` |
| Library | `.gvp/library/` → `.gvp/library/` |
| Tests | All test files updated |
| Dependencies | `pyproject.toml` (add pydantic) |
