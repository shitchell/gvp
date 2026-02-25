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
