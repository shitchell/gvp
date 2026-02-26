"""Tests for gvp.schema."""

import pytest

from gvp.schema import (
    ElementCategoryDef,
    ElementCategoryRegistry,
    load_builtin_defaults,
    merge_element_category_definitions,
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


class TestMergeElementCategoryDefinitions:
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
        merged = merge_element_category_definitions(registry, user_defs)
        assert "experiment" in merged.categories
        assert merged.categories["experiment"].id_prefix == "EX"

    def test_user_overrides_color(self):
        registry = load_builtin_defaults()
        user_defs = {
            "heuristic": {"color": "#FF0000"},
        }
        merged = merge_element_category_definitions(registry, user_defs)
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
            merge_element_category_definitions(registry, user_defs)

    def test_missing_id_prefix_errors(self):
        registry = load_builtin_defaults()
        user_defs = {
            "bad_cat": {"yaml_key": "bad_cats"},
        }
        with pytest.raises(ValueError, match="id_prefix"):
            merge_element_category_definitions(registry, user_defs)

    def test_non_root_without_mapping_rules_errors(self):
        registry = load_builtin_defaults()
        user_defs = {
            "bad_cat": {
                "yaml_key": "bad_cats",
                "id_prefix": "B",
            },
        }
        with pytest.raises(ValueError, match="mapping_rules"):
            merge_element_category_definitions(registry, user_defs)

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
            merge_element_category_definitions(registry, user_defs)

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
            merge_element_category_definitions(registry, user_defs)

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
            merge_element_category_definitions(registry, user_defs)


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
            document=None,
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
