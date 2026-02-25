# Schema-Driven Categories Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace all hardcoded category definitions with a schema-driven system using Pydantic models, move category metadata into `meta.definitions.categories`, and rename `.gvp/libraries/` to `.gvp/library/`.

**Architecture:** A new `schema.py` module loads built-in category defaults from `src/gvp/data/defaults.yaml`, merges user definitions from `meta.definitions.categories`, and generates per-category Pydantic Element subclasses at runtime. The category registry lives on the Catalog and replaces all hardcoded category maps across loader, validator, renderers, and CLI commands.

**Tech Stack:** Python 3.11+, Pydantic v2, pytest, PyYAML

**Design doc:** `docs/plans/2026-02-25-schema-categories-design.md`

---

## Task Group A: Foundation (schema + model)

### Task 1: Add Pydantic dependency

**Files:**
- Modify: `pyproject.toml:10`

**Step 1: Add pydantic to dependencies**

Change line 10 from:
```toml
dependencies = ["pyyaml>=6.0"]
```
to:
```toml
dependencies = ["pyyaml>=6.0", "pydantic>=2.0"]
```

**Step 2: Install**

Run: `pip install -e ".[dev]"`
Expected: pydantic installs successfully

**Step 3: Commit**

```bash
git add pyproject.toml
git commit -m "build: add pydantic dependency"
```

---

### Task 2: Create built-in defaults.yaml

This file defines all core categories with their full metadata. It ships as package data.

**Files:**
- Create: `src/gvp/data/__init__.py` (empty)
- Create: `src/gvp/data/defaults.yaml`
- Modify: `pyproject.toml` (add package-data)

**Step 1: Create the defaults file**

Create `src/gvp/data/defaults.yaml`:

```yaml
# Built-in GVP category definitions.
# Users can override any property via meta.definitions.categories in their library documents.

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
    tier: 1
    field_schemas:
      statement:
        type: string
        required: true

  value:
    yaml_key: values
    id_prefix: V
    primary_field: statement
    display_label: Values
    color: "#4A90D9"
    is_root: true
    tier: 2
    field_schemas:
      statement:
        type: string
        required: true

  principle:
    yaml_key: principles
    id_prefix: P
    primary_field: statement
    display_label: Principles
    color: "#7B68EE"
    mapping_rules:
      - [goal, value]
    tier: 3
    field_schemas:
      statement:
        type: string
        required: true

  heuristic:
    yaml_key: heuristics
    id_prefix: H
    primary_field: statement
    display_label: Heuristics
    color: "#50C878"
    mapping_rules:
      - [goal, value]
      - [principle]
      - [rule]
    tier: 4
    field_schemas:
      statement:
        type: string
        required: true

  rule:
    yaml_key: rules
    id_prefix: R
    primary_field: statement
    display_label: Rules
    color: "#DC143C"
    mapping_rules:
      - [goal, value]
    tier: 3
    field_schemas:
      statement:
        type: string
        required: true

  milestone:
    yaml_key: milestones
    id_prefix: M
    primary_field: description
    display_label: Milestones
    color: "#FFA500"
    mapping_rules:
      - [goal, value]
    field_schemas:
      description:
        type: string
        required: true
      progress:
        type: string
        required: false

  design_choice:
    yaml_key: design_choices
    id_prefix: D
    primary_field: rationale
    display_label: Design Choices
    color: "#20B2AA"
    mapping_rules:
      - [goal, value]
    tier: 5
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

  implementation_rule:
    yaml_key: implementation_rules
    id_prefix: IR
    primary_field: statement
    display_label: Implementation Rules
    color: "#CD5C5C"
    mapping_rules:
      - [goal, value]
      - [design_choice]
    field_schemas:
      statement:
        type: string
        required: true

  coding_principle:
    yaml_key: coding_principles
    id_prefix: C
    primary_field: statement
    display_label: Coding Principles
    color: "#9370DB"
    mapping_rules:
      - [goal, value]
      - [principle]
      - [design_choice]
    field_schemas:
      statement:
        type: string
        required: true
```

**Step 2: Create empty `__init__.py`**

Create `src/gvp/data/__init__.py` as an empty file.

**Step 3: Add package data to pyproject.toml**

Add after `[tool.setuptools.packages.find]`:
```toml
[tool.setuptools.package-data]
gvp = ["data/*.yaml"]
```

**Step 4: Verify the file loads**

Run: `python -c "from importlib.resources import files; print(files('gvp.data').joinpath('defaults.yaml').read_text()[:50])"`
Expected: First 50 chars of defaults.yaml

**Step 5: Commit**

```bash
git add src/gvp/data/ pyproject.toml
git commit -m "feat: add built-in category defaults.yaml"
```

---

### Task 3: Create schema.py — category registry and Pydantic model generation

This is the core new module. It loads defaults, merges user definitions, validates schema definitions, and generates per-category Pydantic Element subclasses.

**Files:**
- Create: `src/gvp/schema.py`
- Create: `tests/test_schema.py`

**Step 1: Write failing tests for schema loading**

Create `tests/test_schema.py`:

```python
"""Tests for gvp.schema."""

import pytest

from gvp.schema import (
    CategoryDef,
    CategoryRegistry,
    load_builtin_defaults,
    merge_category_definitions,
    build_element_models,
)


class TestLoadBuiltinDefaults:
    def test_loads_core_categories(self):
        registry = load_builtin_defaults()
        assert "goal" in registry.categories
        assert "value" in registry.categories
        assert "design_choice" in registry.categories

    def test_goal_is_root(self):
        registry = load_builtin_defaults()
        assert registry.categories["goal"].is_root is True

    def test_heuristic_has_mapping_rules(self):
        registry = load_builtin_defaults()
        rules = registry.categories["heuristic"].mapping_rules
        assert [["goal", "value"]] == rules[0:1]  # first group
        assert ["principle"] in rules
        assert ["rule"] in rules

    def test_design_choice_has_field_schemas(self):
        registry = load_builtin_defaults()
        dc = registry.categories["design_choice"]
        assert "rationale" in dc.field_schemas
        assert dc.field_schemas["rationale"]["required"] is True

    def test_all_keyword_provides_priority(self):
        registry = load_builtin_defaults()
        # _all field_schemas should be merged into every category
        goal = registry.categories["goal"]
        assert "priority" in goal.field_schemas


class TestMergeCategoryDefinitions:
    def test_user_adds_new_category(self):
        registry = load_builtin_defaults()
        user_defs = {
            "experiment": {
                "yaml_key": "experiments",
                "id_prefix": "EX",
                "primary_field": "hypothesis",
                "mapping_rules": [["goal", "value"]],
                "field_schemas": {
                    "hypothesis": {"type": "string", "required": True},
                },
            }
        }
        merged = merge_category_definitions(registry, user_defs)
        assert "experiment" in merged.categories
        assert merged.categories["experiment"].id_prefix == "EX"

    def test_user_overrides_color(self):
        registry = load_builtin_defaults()
        user_defs = {
            "heuristic": {"color": "#FF0000"},
        }
        merged = merge_category_definitions(registry, user_defs)
        assert merged.categories["heuristic"].color == "#FF0000"
        # Other properties preserved
        assert merged.categories["heuristic"].yaml_key == "heuristics"


class TestSchemaValidation:
    def test_missing_yaml_key_errors(self):
        registry = load_builtin_defaults()
        user_defs = {
            "bad_cat": {"id_prefix": "B"},
        }
        with pytest.raises(ValueError, match="yaml_key"):
            merge_category_definitions(registry, user_defs)

    def test_missing_id_prefix_errors(self):
        registry = load_builtin_defaults()
        user_defs = {
            "bad_cat": {"yaml_key": "bad_cats"},
        }
        with pytest.raises(ValueError, match="id_prefix"):
            merge_category_definitions(registry, user_defs)

    def test_non_root_without_mapping_rules_errors(self):
        registry = load_builtin_defaults()
        user_defs = {
            "bad_cat": {
                "yaml_key": "bad_cats",
                "id_prefix": "B",
            },
        }
        with pytest.raises(ValueError, match="mapping_rules"):
            merge_category_definitions(registry, user_defs)

    def test_duplicate_id_prefix_errors(self):
        registry = load_builtin_defaults()
        user_defs = {
            "custom": {
                "yaml_key": "customs",
                "id_prefix": "G",  # collides with goal
                "mapping_rules": [["goal"]],
            },
        }
        with pytest.raises(ValueError, match="id_prefix.*G"):
            merge_category_definitions(registry, user_defs)

    def test_duplicate_yaml_key_errors(self):
        registry = load_builtin_defaults()
        user_defs = {
            "custom": {
                "yaml_key": "goals",  # collides with goal
                "id_prefix": "CU",
                "mapping_rules": [["goal"]],
            },
        }
        with pytest.raises(ValueError, match="yaml_key.*goals"):
            merge_category_definitions(registry, user_defs)

    def test_unknown_category_in_mapping_rules_errors(self):
        registry = load_builtin_defaults()
        user_defs = {
            "custom": {
                "yaml_key": "customs",
                "id_prefix": "CU",
                "mapping_rules": [["nonexistent"]],
            },
        }
        with pytest.raises(ValueError, match="nonexistent"):
            merge_category_definitions(registry, user_defs)


class TestBuildElementModels:
    def test_creates_subclass_per_category(self):
        registry = load_builtin_defaults()
        models = build_element_models(registry)
        assert "goal" in models
        assert "design_choice" in models

    def test_goal_model_has_statement(self):
        registry = load_builtin_defaults()
        models = build_element_models(registry)
        GoalElement = models["goal"]
        # statement should be a field on the model
        assert "statement" in GoalElement.model_fields

    def test_design_choice_model_validates_considered(self):
        from pydantic import ValidationError
        registry = load_builtin_defaults()
        models = build_element_models(registry)
        DC = models["design_choice"]
        # Valid: no considered
        dc = DC(
            id="D1", name="test", category="design_choice",
            rationale="because",
            document=None,  # will need mock
        )
        assert dc.rationale == "because"

    def test_design_choice_model_rejects_bad_considered(self):
        from pydantic import ValidationError
        registry = load_builtin_defaults()
        models = build_element_models(registry)
        DC = models["design_choice"]
        with pytest.raises(ValidationError):
            DC(
                id="D1", name="test", category="design_choice",
                rationale="because",
                considered={"alt": {"no_rationale": "oops"}},
                document=None,
            )
```

**Step 2: Run tests to verify they fail**

Run: `pytest tests/test_schema.py -v`
Expected: FAIL (module not found)

**Step 3: Write the schema module**

Create `src/gvp/schema.py`:

```python
"""Schema loading, merging, validation, and Pydantic model generation."""

from __future__ import annotations

from dataclasses import dataclass, field
from importlib.resources import files
from typing import Any

import yaml
from pydantic import BaseModel, ConfigDict, ValidationError, create_model


@dataclass
class CategoryDef:
    """Definition of a single GVP element category."""

    name: str
    yaml_key: str
    id_prefix: str
    primary_field: str = "statement"
    display_label: str | None = None
    color: str = "#CCCCCC"
    is_root: bool = False
    mapping_rules: list[list[str]] = field(default_factory=list)
    field_schemas: dict[str, dict] = field(default_factory=dict)
    tier: int | None = None

    def resolved_display_label(self) -> str:
        if self.display_label:
            return self.display_label
        return self.yaml_key.replace("_", " ").title()


@dataclass
class CategoryRegistry:
    """All known category definitions, in definition order."""

    categories: dict[str, CategoryDef] = field(default_factory=dict)

    def yaml_key_to_category(self) -> dict[str, str]:
        """Build reverse map: yaml_key -> category name."""
        return {cat.yaml_key: name for name, cat in self.categories.items()}

    def root_categories(self) -> set[str]:
        return {name for name, cat in self.categories.items() if cat.is_root}


def load_builtin_defaults() -> CategoryRegistry:
    """Load the built-in defaults.yaml from package data."""
    defaults_path = files("gvp.data").joinpath("defaults.yaml")
    data = yaml.safe_load(defaults_path.read_text())
    raw_categories = data.get("categories", {})

    # Extract _all field_schemas
    all_field_schemas = {}
    if "_all" in raw_categories:
        all_field_schemas = raw_categories.pop("_all").get("field_schemas", {})

    registry = CategoryRegistry()
    for name, raw in raw_categories.items():
        # Merge _all field schemas (category-specific overrides _all)
        merged_fields = dict(all_field_schemas)
        merged_fields.update(raw.get("field_schemas", {}))

        registry.categories[name] = CategoryDef(
            name=name,
            yaml_key=raw["yaml_key"],
            id_prefix=raw["id_prefix"],
            primary_field=raw.get("primary_field", "statement"),
            display_label=raw.get("display_label"),
            color=raw.get("color", "#CCCCCC"),
            is_root=raw.get("is_root", False),
            mapping_rules=raw.get("mapping_rules", []),
            field_schemas=merged_fields,
            tier=raw.get("tier"),
        )
    return registry


def merge_category_definitions(
    registry: CategoryRegistry,
    user_defs: dict[str, dict],
) -> CategoryRegistry:
    """Merge user category definitions onto a registry. Returns a new registry.

    Validates schema definitions and raises ValueError on errors.
    """
    # Start with a copy
    merged = CategoryRegistry(categories=dict(registry.categories))

    # Extract _all from user defs if present
    user_all_fields = {}
    if "_all" in user_defs:
        user_all_fields = user_defs.pop("_all").get("field_schemas", {})

    # Apply _all field schemas to all existing categories
    if user_all_fields:
        for cat in merged.categories.values():
            for fname, fdef in user_all_fields.items():
                if fname not in cat.field_schemas:
                    cat.field_schemas[fname] = fdef

    for name, raw in user_defs.items():
        if name in merged.categories:
            # Override existing: per-field merge
            existing = merged.categories[name]
            if "yaml_key" in raw:
                existing.yaml_key = raw["yaml_key"]
            if "id_prefix" in raw:
                existing.id_prefix = raw["id_prefix"]
            if "primary_field" in raw:
                existing.primary_field = raw["primary_field"]
            if "display_label" in raw:
                existing.display_label = raw["display_label"]
            if "color" in raw:
                existing.color = raw["color"]
            if "is_root" in raw:
                existing.is_root = raw["is_root"]
            if "mapping_rules" in raw:
                existing.mapping_rules = raw["mapping_rules"]
            if "tier" in raw:
                existing.tier = raw["tier"]
            if "field_schemas" in raw:
                existing.field_schemas.update(raw["field_schemas"])
        else:
            # New category: validate required fields
            if "yaml_key" not in raw:
                raise ValueError(
                    f"Category '{name}': yaml_key is required"
                )
            if "id_prefix" not in raw:
                raise ValueError(
                    f"Category '{name}': id_prefix is required"
                )
            if not raw.get("is_root", False) and not raw.get("mapping_rules"):
                raise ValueError(
                    f"Category '{name}': non-root category must have mapping_rules"
                )

            fs = dict(user_all_fields)
            fs.update(raw.get("field_schemas", {}))

            merged.categories[name] = CategoryDef(
                name=name,
                yaml_key=raw["yaml_key"],
                id_prefix=raw["id_prefix"],
                primary_field=raw.get("primary_field", "statement"),
                display_label=raw.get("display_label"),
                color=raw.get("color", "#CCCCCC"),
                is_root=raw.get("is_root", False),
                mapping_rules=raw.get("mapping_rules", []),
                field_schemas=fs,
                tier=raw.get("tier"),
            )

    # Validate: unique id_prefix and yaml_key
    seen_prefixes: dict[str, str] = {}
    seen_keys: dict[str, str] = {}
    all_category_names = set(merged.categories.keys())

    for cname, cat in merged.categories.items():
        if cat.id_prefix in seen_prefixes:
            raise ValueError(
                f"Category '{cname}': id_prefix '{cat.id_prefix}' "
                f"already used by '{seen_prefixes[cat.id_prefix]}'"
            )
        seen_prefixes[cat.id_prefix] = cname

        if cat.yaml_key in seen_keys:
            raise ValueError(
                f"Category '{cname}': yaml_key '{cat.yaml_key}' "
                f"already used by '{seen_keys[cat.yaml_key]}'"
            )
        seen_keys[cat.yaml_key] = cname

        # Validate mapping_rules reference known categories
        for group in cat.mapping_rules:
            for ref in group:
                if ref not in all_category_names:
                    raise ValueError(
                        f"Category '{cname}': mapping_rules references "
                        f"unknown category '{ref}'"
                    )

    return merged


# ---- Pydantic model generation ----

# Type map from schema type strings to Python types
_TYPE_MAP: dict[str, type] = {
    "string": str,
    "number": int | float,
    "boolean": bool,
}


def _build_field_type(schema: dict) -> tuple[type, Any]:
    """Convert a field schema dict to (python_type, default).

    Returns a tuple suitable for pydantic create_model() field definitions.
    """
    stype = schema.get("type", "string")
    required = schema.get("required", False)

    if stype in _TYPE_MAP:
        python_type = _TYPE_MAP[stype]
        if required:
            return (python_type, ...)
        else:
            return (python_type | None, None)

    if stype == "list":
        if required:
            return (list, ...)
        else:
            return (list | None, None)

    if stype == "dict":
        values_schema = schema.get("values")
        if values_schema and values_schema.get("type") == "model":
            # Build a nested Pydantic model for dict values
            nested_fields = values_schema.get("fields", {})
            nested_field_defs = {}
            for fname, fschema in nested_fields.items():
                nested_field_defs[fname] = _build_field_type(fschema)
            NestedModel = create_model(
                "NestedModel",
                __config__=ConfigDict(extra="forbid"),
                **nested_field_defs,
            )
            dict_type = dict[str, NestedModel]
        else:
            dict_type = dict

        if required:
            return (dict_type, ...)
        else:
            return (dict_type | None, None)

    # Fallback
    if required:
        return (Any, ...)
    return (Any | None, None)


class BaseElement(BaseModel):
    """Base GVP element with structural fields."""

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
    document: Any = None  # back-reference to Document


def build_element_models(
    registry: CategoryRegistry,
) -> dict[str, type[BaseElement]]:
    """Generate a Pydantic model subclass for each category."""
    models: dict[str, type[BaseElement]] = {}

    for name, cat in registry.categories.items():
        field_defs = {}
        for fname, fschema in cat.field_schemas.items():
            # Skip priority — it's on the base model
            if fname == "priority":
                continue
            field_defs[fname] = _build_field_type(fschema)

        model = create_model(
            f"{name.title().replace('_', '')}Element",
            __base__=BaseElement,
            **field_defs,
        )
        models[name] = model

    return models
```

**Step 4: Run tests**

Run: `pytest tests/test_schema.py -v`
Expected: Most pass. Adjust any test assumptions as needed (the `document=None` in model tests may need the `arbitrary_types_allowed` config, which is set).

**Step 5: Commit**

```bash
git add src/gvp/schema.py tests/test_schema.py
git commit -m "feat: add schema module — category registry and Pydantic model generation"
```

---

## Task Group B: Loader integration

### Task 4: Refactor loader to use category registry

Replace `CATEGORY_MAP`, `SKIP_FILES`, and `ELEMENT_ATTRS` with registry-driven loading. Accumulate `meta.definitions.categories` from documents.

**Files:**
- Modify: `src/gvp/loader.py` (full rewrite of constants and load_document)
- Modify: `src/gvp/model.py` (add category_definitions to Catalog)
- Modify: `tests/test_loader.py`
- Modify: `tests/conftest.py`

**Step 1: Add registry to Catalog**

In `src/gvp/model.py`, add to Catalog `__init__`:

```python
from gvp.schema import CategoryRegistry

class Catalog:
    def __init__(self) -> None:
        self.documents: dict[str, Document] = {}
        self.elements: dict[str, Element] = {}
        self.tags: dict[str, dict] = {}
        self.tag_sources: dict[str, str] = {}
        self.category_registry: CategoryRegistry | None = None
```

Note: To avoid circular imports, the registry is set by the loader after construction, not in `__init__`. Use `from __future__ import annotations` and a string annotation or `Any` if needed.

**Step 2: Rewrite loader.py**

Key changes to `src/gvp/loader.py`:

1. Remove `CATEGORY_MAP`, `SKIP_FILES`, `ELEMENT_ATTRS` constants
2. Import `load_builtin_defaults`, `merge_category_definitions`, `build_element_models`, `CategoryRegistry`, `BaseElement` from `gvp.schema`
3. Define `BASE_ELEMENT_ATTRS` as a set of structural field names that never go into `fields`:
   ```python
   BASE_ELEMENT_ATTRS = {
       "id", "name", "status", "tags", "maps_to",
       "origin", "updated_by", "reviewed_by", "priority",
   }
   ```
4. `_parse_element()` takes the category's field_schema keys to compute what goes into `fields` vs model attributes
5. `load_document()` takes a `CategoryRegistry` parameter, iterates `registry.yaml_key_to_category()` instead of `CATEGORY_MAP`
6. `load_library()` accumulates `meta.definitions.categories` from documents (first-wins, emit W008 on duplicates)
7. `load_catalog()` orchestrates: load defaults → accumulate user definitions → merge → build models → parse elements with correct models
8. Remove the `schema.yaml` skip logic

The `_parse_element` function should attempt to instantiate the Pydantic model for the category. Catch `ValidationError` and either collect errors (validate mode) or fail fast.

**Step 3: Update tests**

Update `tests/test_loader.py` and `tests/conftest.py`:
- The `tmp_library` fixture creates a library with standard categories (goals, values) that match the built-in schema
- Update any test that directly imports `CATEGORY_MAP` or `ELEMENT_ATTRS`
- Update any test that constructs `Element` directly — now needs the Pydantic subclass or `BaseElement`

**Step 4: Run full test suite**

Run: `pytest tests/ -v`
Expected: All tests pass (will need iterative fixes)

**Step 5: Commit**

```bash
git add src/gvp/loader.py src/gvp/model.py tests/
git commit -m "feat: refactor loader to use category registry from schema"
```

---

### Task 5: Refactor Element model to Pydantic BaseElement

Replace the `Element` dataclass with the Pydantic `BaseElement` from schema.py. Keep `Document` and `Catalog` as dataclasses (they don't need Pydantic validation).

**Files:**
- Modify: `src/gvp/model.py`
- Modify: all files that import `Element` from `gvp.model`
- Modify: `tests/test_model.py`

**Step 1: Update model.py**

Replace the `Element` dataclass with a re-export from schema:

```python
from gvp.schema import BaseElement as Element
```

Or, to keep backward compatibility during the transition, make `Element` an alias. The key changes:
- Remove the `@dataclass class Element`
- Import and re-export `BaseElement` as `Element`
- Keep `__hash__` and `__eq__` behavior by adding them to `BaseElement` in schema.py (Pydantic models are not hashable by default — add `model_config = ConfigDict(frozen=False)` and implement `__hash__`/`__eq__` on `BaseElement`)

**Step 2: Update test_model.py**

Tests that construct `Element(id=..., category=..., ...)` need to use the base model constructor. The `fields` dict parameter goes away — those fields are now named attributes on category subclasses. For tests that don't care about category-specific fields, use `BaseElement` directly.

**Step 3: Run tests**

Run: `pytest tests/ -v`

**Step 4: Commit**

```bash
git add src/gvp/model.py src/gvp/schema.py tests/
git commit -m "feat: replace Element dataclass with Pydantic BaseElement"
```

---

## Task Group C: Validator refactor

### Task 6: Replace hardcoded validation with registry-based validation

**Files:**
- Modify: `src/gvp/commands/validate.py`
- Modify: `tests/commands/test_validate.py`

**Step 1: Replace hardcoded constants**

Remove:
- `_ROOT_CATEGORIES` → use `catalog.category_registry.root_categories()`
- `_MAPPING_RULES` → read from `catalog.category_registry.categories[cat].mapping_rules`
- `_validate_considered()` → Pydantic handles this on construction now
- Priority type check loop → Pydantic handles this on construction now

**Step 2: Rewrite `_validate_mappings()`**

```python
def _validate_mappings(catalog: Catalog) -> list[str]:
    errors = []
    registry = catalog.category_registry
    root_cats = registry.root_categories()

    for qid, elem in catalog.elements.items():
        if elem.category in root_cats:
            continue
        if elem.status in ("deprecated", "rejected"):
            continue

        cat_def = registry.categories.get(elem.category)
        if cat_def is None or not cat_def.mapping_rules:
            continue

        target_categories = set()
        for ref in elem.maps_to:
            target = catalog.elements.get(ref)
            if target is not None:
                target_categories.add(target.category)

        # Check: any group fully satisfied?
        satisfied = False
        for group in cat_def.mapping_rules:
            if all(c in target_categories for c in group):
                satisfied = True
                break

        if not satisfied:
            # Build helpful error message
            rule_desc = " OR ".join(
                " AND ".join(g) for g in cat_def.mapping_rules
            )
            errors.append(
                f"{qid}: traceability — must map to ({rule_desc})"
            )

    return errors
```

**Step 3: Add W008 (duplicate user category definitions) and W009 (unknown YAML section keys)**

W008 is emitted in the loader during category accumulation (Task 4). W009 is emitted in `load_document()` when a top-level YAML key doesn't match any known `yaml_key`.

Add to `validate_catalog()`:
```python
# W009 is collected during loading, passed through catalog
warnings.extend(catalog.load_warnings)
```

Add `load_warnings: list[str]` to `Catalog.__init__`.

**Step 4: Add Pydantic error translation**

Add a function to translate Pydantic `ValidationError` into GVP-formatted error strings. This is called by the loader when constructing elements:

```python
def translate_pydantic_errors(qid: str, exc: ValidationError) -> list[str]:
    errors = []
    for err in exc.errors():
        loc = ".".join(str(l) for l in err["loc"])
        msg = err["msg"]
        errors.append(f"{qid}: {loc} — {msg}")
    return errors
```

**Step 5: Update tests**

Update `tests/commands/test_validate.py`:
- Tests for considered validation now test that Pydantic rejects bad schemas during loading
- Tests for priority validation same
- Tests for mapping rules should work with the new registry-driven logic
- Add tests for W008, W009

**Step 6: Run tests**

Run: `pytest tests/ -v`

**Step 7: Commit**

```bash
git add src/gvp/commands/validate.py src/gvp/model.py tests/
git commit -m "feat: replace hardcoded validation with registry-based checks"
```

---

## Task Group D: Command refactors

### Task 7: Refactor add.py and edit.py to use registry

**Files:**
- Modify: `src/gvp/commands/add.py`
- Modify: `src/gvp/commands/edit.py`
- Modify: `tests/commands/test_add.py`
- Modify: `tests/commands/test_edit.py`

**Step 1: Remove hardcoded dicts from add.py**

Remove `ID_PREFIXES` and `YAML_KEYS`. Replace with registry lookups:

```python
def next_id(category: str, existing_ids: list[str], registry, prefix: str | None = None) -> str:
    cat_def = registry.categories[category]
    id_prefix = cat_def.id_prefix
    if prefix:
        id_prefix = prefix + id_prefix
    # ... rest unchanged
```

```python
def add_element(catalog, document_name, category, name, fields, no_provenance=False):
    # ...
    yaml_key = catalog.category_registry.categories[category].yaml_key
    # ... rest unchanged
```

**Step 2: Update _build_template to use registry**

Replace the hardcoded if/elif chain:

```python
def _build_template(category: str, prefill: dict, registry) -> str:
    cat_def = registry.categories[category]
    fields = {"name": ""}
    # Add required fields from schema
    for fname, fschema in cat_def.field_schemas.items():
        if fname == "priority":
            continue
        if fschema.get("required", False):
            fields[fname] = ""
    fields["tags"] = []
    fields["maps_to"] = []
    fields.update(prefill)
    # ... render template
```

**Step 3: Update edit.py**

`edit.py` imports `YAML_KEYS` from `add.py`. Change to use `catalog.category_registry`:

```python
yaml_key = catalog.category_registry.categories[elem.category].yaml_key
```

Remove the `from gvp.commands.add import YAML_KEYS` import.

**Step 4: Update __main__.py**

The `cmd_add` function in `__main__.py` passes category choices to argparse. Update to get valid categories from the registry:

```python
valid_categories = list(catalog.category_registry.categories.keys())
```

Note: This requires loading the catalog before parsing add args, or loading just the schema. May need minor restructuring of argument parsing.

**Step 5: Update tests**

**Step 6: Run tests**

Run: `pytest tests/ -v`

**Step 7: Commit**

```bash
git add src/gvp/commands/add.py src/gvp/commands/edit.py src/gvp/__main__.py tests/
git commit -m "feat: refactor add/edit commands to use category registry"
```

---

## Task Group E: Renderer refactors

### Task 8: Refactor renderers to use registry

**Files:**
- Modify: `src/gvp/renderers/markdown.py`
- Modify: `src/gvp/renderers/dot.py`
- Modify: `src/gvp/renderers/csv.py` (minor — primary_field from registry)
- Modify: `src/gvp/renderers/sqlite.py` (minor — primary_field from registry)
- Modify: `tests/renderers/test_markdown.py`
- Modify: `tests/renderers/test_dot.py`

**Step 1: Refactor markdown.py**

Remove `CATEGORY_ORDER`. Replace with registry-driven ordering:

```python
def _render_document(doc, catalog, include_deprecated=False):
    registry = catalog.category_registry
    lines = [f"# {doc.name}"]
    if doc.scope_label:
        lines.append(f"\n**Scope:** {doc.scope_label}")
    if doc.inherits:
        lines.append(f"\n**Inherits:** {', '.join(doc.inherits)}")

    for cat_name, cat_def in registry.categories.items():
        elems = [
            e for e in doc.elements
            if e.category == cat_name
            and (include_deprecated or e.status == "active")
        ]
        if not elems:
            continue
        lines.append(f"\n## {cat_def.resolved_display_label()}\n")
        for elem in elems:
            lines.append(_render_element(elem, cat_def))
            lines.append("")
    return "\n".join(lines)
```

Update `_render_element` to use `cat_def.primary_field` instead of hardcoded key checks:

```python
def _render_element(elem, cat_def=None):
    lines = [f"### {elem.id}: {elem.name}"]
    # ... status, tags, maps_to, priority as before ...

    # Primary field from schema
    if cat_def:
        pf = cat_def.primary_field
        val = getattr(elem, pf, None) or elem.fields.get(pf)
        if val and isinstance(val, str):
            lines.append(f"\n{val.strip()}")

    # Hardcoded: progress (milestones)
    progress = getattr(elem, "progress", None) or elem.fields.get("progress")
    if progress:
        lines.append(f"\n**Progress:** {progress}")

    # Hardcoded: considered (design_choices) — degrade gracefully
    considered = getattr(elem, "considered", None) or elem.fields.get("considered")
    if isinstance(considered, dict) and considered:
        # ... existing rendering logic ...
```

Note: `render_markdown()` signature changes to take `catalog` instead of just iterating `catalog.documents`.

**Step 2: Refactor dot.py**

Remove `CATEGORY_COLORS` and hardcoded `tier_order`. Replace with:

```python
def render_dot(catalog, output_dir=None, include_deprecated=False):
    registry = catalog.category_registry
    # ...
    color = registry.categories.get(elem.category, CategoryDef(name="", yaml_key="", id_prefix="")).color
    # ...
    # Build tier_order from registry
    tiers: dict[int, list[str]] = {}
    for cat_name, cat_def in registry.categories.items():
        if cat_def.tier is not None:
            tiers.setdefault(cat_def.tier, []).append(cat_name)
    for tier_num in sorted(tiers):
        tier_cats = tuple(tiers[tier_num])
        # ... same rank logic ...
```

**Step 3: Refactor csv.py and sqlite.py**

Minor changes: use `cat_def.primary_field` to get the primary content field instead of hardcoded `statement or rationale`:

```python
# csv.py
cat_def = catalog.category_registry.categories.get(elem.category)
primary = ""
if cat_def:
    primary = getattr(elem, cat_def.primary_field, "") or ""
```

Same pattern for sqlite.py.

**Step 4: Update renderer tests**

**Step 5: Run tests**

Run: `pytest tests/ -v`

**Step 6: Commit**

```bash
git add src/gvp/renderers/ tests/renderers/
git commit -m "feat: refactor renderers to use category registry"
```

---

## Task Group F: Directory rename

### Task 9: Rename .gvp/libraries/ to .gvp/library/

**Files:**
- Modify: `src/gvp/config.py:68` (`libraries` → `library`)
- Rename: `.gvp/libraries/` → `.gvp/library/`
- Modify: `tests/conftest.py` (if any paths reference `libraries`)
- Modify: `tests/test_config.py` (if any paths reference `libraries`)
- Modify: `docs/reference/config.md`
- Modify: `docs/reference/schema.md`
- Modify: `docs/guide/developing-a-library.md`
- Modify: `docs/guide/usage.md`
- Modify: `README.md`

**Step 1: Rename directory**

```bash
git mv .gvp/libraries .gvp/library
```

**Step 2: Update config.py**

In `_collect_from_dir()`, line 68:
```python
libs_dir = gvp_dir / "library"
```

**Step 3: Update all docs referencing `.gvp/libraries/`**

Search and replace `.gvp/libraries` → `.gvp/library` across docs.

**Step 4: Update tests**

**Step 5: Run tests**

Run: `pytest tests/ -v`

**Step 6: Commit**

```bash
git add -A
git commit -m "feat: rename .gvp/libraries/ to .gvp/library/"
```

---

## Task Group G: Documentation

### Task 10: Update documentation

**Files:**
- Modify: `docs/reference/schema.md`
- Modify: `docs/reference/validation.md`
- Modify: `docs/reference/config.md`
- Modify: `docs/guide/developing-a-library.md`
- Modify: `README.md`

**Step 1: Update schema.md**

Add new sections:
- `meta.definitions.categories` — full schema reference
- `_all` keyword
- Field schemas (types, required, label, nested models)
- Mapping rules syntax with extensive AND/OR examples
- Custom category walkthrough example

**Step 2: Update validation.md**

Add:
- W008: duplicate user category definition
- W009: unknown YAML section key
- Pydantic error translation behavior
- Updated mapping rules description (now schema-driven)

**Step 3: Update config.md**

Change `.gvp/libraries/` to `.gvp/library/` throughout.

**Step 4: Update README.md**

Update any directory structure examples, quick-start instructions, etc.

**Step 5: Commit**

```bash
git add docs/ README.md
git commit -m "docs: update for schema-driven categories, Pydantic models, and library rename"
```

---

## Task Group H: Integration validation

### Task 11: Full integration test

**Step 1: Run full test suite**

Run: `pytest tests/ -v`
Expected: All tests pass

**Step 2: Validate all libraries**

```bash
python -m gvp validate
python -m gvp validate --library examples/software-project
python -m gvp validate --library examples/small-business
```
Expected: All pass (or only pre-existing warnings)

**Step 3: Regenerate rendered output**

```bash
python -m gvp render --format markdown csv sqlite -o generated
```
Expected: Output written successfully

**Step 4: Verify custom category works end-to-end**

Create a temporary test: add `meta.definitions.categories.experiment` to an example file, add an experiment element, validate, render.

**Step 5: Commit any final fixes**

```bash
git add -A
git commit -m "test: full integration validation after schema refactor"
```

---

## Dependency Graph

```
Task 1 (pydantic dep)
  └→ Task 2 (defaults.yaml)
       └→ Task 3 (schema.py)
            ├→ Task 4 (loader refactor)
            │    └→ Task 5 (Element → Pydantic)
            │         ├→ Task 6 (validator refactor)
            │         ├→ Task 7 (add/edit refactor)
            │         └→ Task 8 (renderer refactor)
            │              └→ Task 11 (integration)
            └→ Task 9 (directory rename) — independent
                 └→ Task 10 (docs) — after all code tasks
```

Tasks 9 (rename) can be done at any point. Tasks 6, 7, 8 can be done in parallel after Task 5.
