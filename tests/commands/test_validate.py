"""Tests for gvp validate command."""

import textwrap
from pathlib import Path

import pytest

from gvp.commands.validate import validate_catalog
from gvp.config import GVPConfig
from gvp.loader import load_catalog


def _make_lib(tmp_path: Path, elements_yaml: str) -> Path:
    """Create a minimal library with a root doc (goals/values) and a test doc."""
    lib = tmp_path / "lib"
    lib.mkdir(exist_ok=True)
    (lib / "root.yaml").write_text(
        textwrap.dedent(
            """\
        meta:
          name: root
          scope: universal
        goals:
          - id: G1
            name: Test Goal
            statement: A test goal.
            tags: []
            maps_to: []
        values:
          - id: V1
            name: Test Value
            statement: A test value.
            tags: []
            maps_to: []
    """
        )
    )
    (lib / "test.yaml").write_text(
        "meta:\n  name: test\n  inherits: root\n  scope: project\n" + elements_yaml
    )
    return lib


class TestValidateCatalog:
    def test_example_library_passes(self, gvp_docs_library: Path):
        cfg = GVPConfig(libraries=[gvp_docs_library])
        catalog = load_catalog(cfg)
        errors, warnings = validate_catalog(catalog)
        assert errors == [], f"Unexpected errors: {errors}"

    def test_broken_maps_to_reference(self, tmp_path: Path):
        lib = tmp_path / "lib"
        lib.mkdir()
        (lib / "test.yaml").write_text(
            "meta:\n  name: test\n"
            "values:\n"
            "  - id: V1\n"
            "    name: Test\n"
            "    statement: Test.\n"
            "    tags: []\n"
            "    maps_to: [test:NONEXISTENT]\n"
        )
        cfg = GVPConfig(libraries=[lib])
        catalog = load_catalog(cfg)
        errors, _ = validate_catalog(catalog)
        assert any("NONEXISTENT" in e for e in errors)

    def test_id_gap_detected(self, tmp_path: Path):
        lib = tmp_path / "lib"
        lib.mkdir()
        (lib / "test.yaml").write_text(
            "meta:\n  name: test\n"
            "values:\n"
            "  - id: V1\n    name: A\n    statement: A.\n    tags: []\n    maps_to: []\n"
            "  - id: V3\n    name: B\n    statement: B.\n    tags: []\n    maps_to: []\n"
        )
        cfg = GVPConfig(libraries=[lib])
        catalog = load_catalog(cfg)
        errors, _ = validate_catalog(catalog)
        assert any("gap" in e.lower() or "V2" in e for e in errors)

    def test_undefined_tag(self, tmp_path: Path):
        lib = tmp_path / "lib"
        lib.mkdir()
        (lib / "tags.yaml").write_text(
            "domains:\n  code:\n    description: Code\n" "concerns: {}\n"
        )
        (lib / "test.yaml").write_text(
            "meta:\n  name: test\n"
            "values:\n"
            "  - id: V1\n    name: A\n    statement: A.\n"
            "    tags: [nonexistent_tag]\n    maps_to: []\n"
        )
        cfg = GVPConfig(libraries=[lib])
        catalog = load_catalog(cfg)
        errors, _ = validate_catalog(catalog)
        assert any("nonexistent_tag" in e for e in errors)

    def test_broken_inherits(self, tmp_path: Path):
        lib = tmp_path / "lib"
        lib.mkdir()
        (lib / "test.yaml").write_text(
            "meta:\n  name: test\n  inherits: nonexistent\n" "values: []\n"
        )
        cfg = GVPConfig(libraries=[lib])
        catalog = load_catalog(cfg)
        errors, _ = validate_catalog(catalog)
        assert any("nonexistent" in e for e in errors)

    def test_circular_inherits(self, tmp_path: Path):
        lib = tmp_path / "lib"
        lib.mkdir()
        (lib / "a.yaml").write_text("meta:\n  name: a\n  inherits: b\nvalues: []\n")
        (lib / "b.yaml").write_text("meta:\n  name: b\n  inherits: a\nvalues: []\n")
        cfg = GVPConfig(libraries=[lib])
        catalog = load_catalog(cfg)
        errors, _ = validate_catalog(catalog)
        assert any("circular" in e.lower() for e in errors)

    def test_empty_document_warning(self, tmp_path: Path):
        lib = tmp_path / "lib"
        lib.mkdir()
        (lib / "empty.yaml").write_text("meta:\n  name: empty\n  scope: test\n")
        cfg = GVPConfig(libraries=[lib])
        catalog = load_catalog(cfg)
        _, warnings = validate_catalog(catalog)
        assert any("W001" in w for w in warnings)


class TestMappingValidation:
    def test_principle_with_goal_and_value_passes(self, tmp_path: Path):
        lib = _make_lib(
            tmp_path,
            textwrap.dedent(
                """\
            principles:
              - id: P1
                name: Test Principle
                statement: A test principle.
                tags: []
                maps_to: [root:G1, root:V1]
        """
            ),
        )
        cfg = GVPConfig(libraries=[lib])
        catalog = load_catalog(cfg)
        errors, _ = validate_catalog(catalog)
        assert not any("P1" in e for e in errors)

    def test_principle_missing_goal_fails(self, tmp_path: Path):
        lib = _make_lib(
            tmp_path,
            textwrap.dedent(
                """\
            principles:
              - id: P1
                name: Test Principle
                statement: A test principle.
                tags: []
                maps_to: [root:V1]
        """
            ),
        )
        cfg = GVPConfig(libraries=[lib])
        catalog = load_catalog(cfg)
        errors, _ = validate_catalog(catalog)
        assert any("P1" in e and "goal" in e for e in errors)

    def test_principle_missing_value_fails(self, tmp_path: Path):
        lib = _make_lib(
            tmp_path,
            textwrap.dedent(
                """\
            principles:
              - id: P1
                name: Test Principle
                statement: A test principle.
                tags: []
                maps_to: [root:G1]
        """
            ),
        )
        cfg = GVPConfig(libraries=[lib])
        catalog = load_catalog(cfg)
        errors, _ = validate_catalog(catalog)
        assert any("P1" in e and "value" in e for e in errors)

    def test_heuristic_with_principle_shortcut_passes(self, tmp_path: Path):
        lib = _make_lib(
            tmp_path,
            textwrap.dedent(
                """\
            principles:
              - id: P1
                name: Test Principle
                statement: A test principle.
                tags: []
                maps_to: [root:G1, root:V1]
            heuristics:
              - id: H1
                name: Test Heuristic
                statement: A test heuristic.
                tags: []
                maps_to: [test:P1]
        """
            ),
        )
        cfg = GVPConfig(libraries=[lib])
        catalog = load_catalog(cfg)
        errors, _ = validate_catalog(catalog)
        assert not any("H1" in e for e in errors)

    def test_heuristic_without_principle_or_gv_fails(self, tmp_path: Path):
        lib = _make_lib(
            tmp_path,
            textwrap.dedent(
                """\
            heuristics:
              - id: H1
                name: Test Heuristic
                statement: A test heuristic.
                tags: []
                maps_to: []
        """
            ),
        )
        cfg = GVPConfig(libraries=[lib])
        catalog = load_catalog(cfg)
        errors, _ = validate_catalog(catalog)
        assert any("H1" in e for e in errors)

    def test_design_choice_with_goal_and_value_passes(self, tmp_path: Path):
        lib = _make_lib(
            tmp_path,
            textwrap.dedent(
                """\
            design_choices:
              - id: D1
                name: Test Design Choice
                statement: A test design choice.
                tags: []
                maps_to: [root:G1, root:V1]
        """
            ),
        )
        cfg = GVPConfig(libraries=[lib])
        catalog = load_catalog(cfg)
        errors, _ = validate_catalog(catalog)
        assert not any("D1" in e for e in errors)

    def test_implementation_rule_with_design_choice_shortcut_passes(
        self, tmp_path: Path
    ):
        lib = _make_lib(
            tmp_path,
            textwrap.dedent(
                """\
            design_choices:
              - id: D1
                name: Test Design Choice
                statement: A test design choice.
                tags: []
                maps_to: [root:G1, root:V1]
            implementation_rules:
              - id: IR1
                name: Test Implementation Rule
                statement: A test implementation rule.
                tags: []
                maps_to: [test:D1]
        """
            ),
        )
        cfg = GVPConfig(libraries=[lib])
        catalog = load_catalog(cfg)
        errors, _ = validate_catalog(catalog)
        assert not any("IR1" in e for e in errors)

    def test_coding_principle_with_principle_shortcut_passes(self, tmp_path: Path):
        lib = _make_lib(
            tmp_path,
            textwrap.dedent(
                """\
            principles:
              - id: P1
                name: Test Principle
                statement: A test principle.
                tags: []
                maps_to: [root:G1, root:V1]
            coding_principles:
              - id: C1
                name: Test Coding Principle
                statement: A test coding principle.
                tags: []
                maps_to: [test:P1]
        """
            ),
        )
        cfg = GVPConfig(libraries=[lib])
        catalog = load_catalog(cfg)
        errors, _ = validate_catalog(catalog)
        assert not any("C1" in e for e in errors)

    def test_milestone_missing_value_fails(self, tmp_path: Path):
        lib = _make_lib(
            tmp_path,
            textwrap.dedent(
                """\
            milestones:
              - id: M1
                name: Test Milestone
                statement: A test milestone.
                tags: []
                maps_to: [root:G1]
        """
            ),
        )
        cfg = GVPConfig(libraries=[lib])
        catalog = load_catalog(cfg)
        errors, _ = validate_catalog(catalog)
        assert any("M1" in e and "value" in e for e in errors)

    def test_rule_with_goal_and_value_passes(self, tmp_path: Path):
        lib = _make_lib(
            tmp_path,
            textwrap.dedent(
                """\
            rules:
              - id: R1
                name: Test Rule
                statement: A test rule.
                tags: []
                maps_to: [root:G1, root:V1]
        """
            ),
        )
        cfg = GVPConfig(libraries=[lib])
        catalog = load_catalog(cfg)
        errors, _ = validate_catalog(catalog)
        assert not any("R1" in e for e in errors)

    def test_goal_needs_no_mapping(self, tmp_path: Path):
        lib = _make_lib(
            tmp_path,
            textwrap.dedent(
                """\
            goals:
              - id: G1
                name: Extra Goal
                statement: An extra goal.
                tags: []
                maps_to: []
        """
            ),
        )
        cfg = GVPConfig(libraries=[lib])
        catalog = load_catalog(cfg)
        errors, _ = validate_catalog(catalog)
        assert not any("G1" in e and "traceability" in e for e in errors)

    def test_value_needs_no_mapping(self, tmp_path: Path):
        lib = _make_lib(
            tmp_path,
            textwrap.dedent(
                """\
            values:
              - id: V1
                name: Extra Value
                statement: An extra value.
                tags: []
                maps_to: []
        """
            ),
        )
        cfg = GVPConfig(libraries=[lib])
        catalog = load_catalog(cfg)
        errors, _ = validate_catalog(catalog)
        assert not any("V1" in e and "traceability" in e for e in errors)

    def test_constraint_needs_no_mapping(self, tmp_path: Path):
        lib = _make_lib(
            tmp_path,
            textwrap.dedent(
                """\
            constraints:
              - id: CON1
                name: Test Constraint
                statement: A test constraint.
                tags: []
                maps_to: []
        """
            ),
        )
        cfg = GVPConfig(libraries=[lib])
        catalog = load_catalog(cfg)
        errors, _ = validate_catalog(catalog)
        assert not any("CON1" in e and "traceability" in e for e in errors)

    def test_deprecated_elements_skip_mapping_check(self, tmp_path: Path):
        lib = _make_lib(
            tmp_path,
            textwrap.dedent(
                """\
            principles:
              - id: P1
                name: Old Principle
                statement: An old principle.
                status: deprecated
                tags: []
                maps_to: []
        """
            ),
        )
        cfg = GVPConfig(libraries=[lib])
        catalog = load_catalog(cfg)
        errors, _ = validate_catalog(catalog)
        assert not any("P1" in e for e in errors)

    def test_example_library_passes_mapping_check(self, gvp_docs_library: Path):
        cfg = GVPConfig(libraries=[gvp_docs_library])
        catalog = load_catalog(cfg)
        errors, _ = validate_catalog(catalog)
        mapping_errors = [e for e in errors if "traceability" in e]
        assert mapping_errors == [], f"Unexpected mapping errors: {mapping_errors}"


class TestSemanticWarnings:
    def test_empty_maps_to_warns(self, tmp_path: Path):
        lib = _make_lib(
            tmp_path,
            textwrap.dedent(
                """\
            principles:
              - id: P1
                name: Lonely Principle
                statement: A principle with no mappings.
                tags: []
                maps_to: []
        """
            ),
        )
        cfg = GVPConfig(libraries=[lib])
        catalog = load_catalog(cfg)
        _, warnings = validate_catalog(catalog)
        assert any("W004" in w and "P1" in w for w in warnings)

    def test_empty_maps_to_ok_for_roots(self, tmp_path: Path):
        lib = _make_lib(
            tmp_path,
            textwrap.dedent(
                """\
            values:
              - id: V1
                name: Extra Value
                statement: A value with no mappings.
                tags: []
                maps_to: []
        """
            ),
        )
        cfg = GVPConfig(libraries=[lib])
        catalog = load_catalog(cfg)
        _, warnings = validate_catalog(catalog)
        assert not any("W004" in w for w in warnings)

    def test_deprecated_skips_w004(self, tmp_path: Path):
        lib = _make_lib(
            tmp_path,
            textwrap.dedent(
                """\
            principles:
              - id: P1
                name: Old Principle
                statement: A deprecated principle.
                status: deprecated
                tags: []
                maps_to: []
        """
            ),
        )
        cfg = GVPConfig(libraries=[lib])
        catalog = load_catalog(cfg)
        _, warnings = validate_catalog(catalog)
        assert not any("W004" in w for w in warnings)

    def test_insular_mappings_warns(self, tmp_path: Path):
        lib = _make_lib(
            tmp_path,
            textwrap.dedent(
                """\
            goals:
              - id: G1
                name: Local Goal
                statement: A local goal.
                tags: []
                maps_to: []
            values:
              - id: V1
                name: Local Value
                statement: A local value.
                tags: []
                maps_to: []
            principles:
              - id: P1
                name: Insular Principle
                statement: Maps only within own document.
                tags: []
                maps_to: [test:G1, test:V1]
        """
            ),
        )
        cfg = GVPConfig(libraries=[lib])
        catalog = load_catalog(cfg)
        _, warnings = validate_catalog(catalog)
        assert any("W005" in w and "P1" in w for w in warnings)

    def test_cross_scope_mappings_no_w005(self, tmp_path: Path):
        lib = _make_lib(
            tmp_path,
            textwrap.dedent(
                """\
            principles:
              - id: P1
                name: Cross-scope Principle
                statement: Maps to root document elements.
                tags: []
                maps_to: [root:G1, root:V1]
        """
            ),
        )
        cfg = GVPConfig(libraries=[lib])
        catalog = load_catalog(cfg)
        _, warnings = validate_catalog(catalog)
        assert not any("W005" in w for w in warnings)


class TestStalenessWarning:
    """Tests for W006 staleness warning."""

    def test_stale_element_warns(self, tmp_path: Path):
        """Element reviewed before ancestor was updated -> W006."""
        lib = tmp_path / "lib"
        lib.mkdir()
        (lib / "root.yaml").write_text(textwrap.dedent("""\
            meta:
              name: root
            values:
              - id: V1
                name: Test Value
                statement: A value.
                tags: []
                maps_to: []
                updated_by:
                  - date: "2026-02-20"
                    rationale: "Changed something"
            goals:
              - id: G1
                name: Test Goal
                statement: A goal.
                tags: []
                maps_to: []
        """))
        (lib / "test.yaml").write_text(textwrap.dedent("""\
            meta:
              name: test
              inherits: root
            principles:
              - id: P1
                name: Stale Principle
                statement: Stale.
                tags: []
                maps_to: [root:G1, root:V1]
                reviewed_by:
                  - date: "2026-02-15"
                    by: guy
                    note: "Reviewed"
        """))
        cfg = GVPConfig(libraries=[lib])
        catalog = load_catalog(cfg)
        _, warnings = validate_catalog(catalog)
        assert any("W006" in w and "P1" in w for w in warnings)

    def test_fresh_review_no_warning(self, tmp_path: Path):
        """Element reviewed after ancestor was updated -> no W006."""
        lib = tmp_path / "lib"
        lib.mkdir()
        (lib / "root.yaml").write_text(textwrap.dedent("""\
            meta:
              name: root
            values:
              - id: V1
                name: Test Value
                statement: A value.
                tags: []
                maps_to: []
                updated_by:
                  - date: "2026-02-15"
                    rationale: "Changed"
            goals:
              - id: G1
                name: Test Goal
                statement: A goal.
                tags: []
                maps_to: []
        """))
        (lib / "test.yaml").write_text(textwrap.dedent("""\
            meta:
              name: test
              inherits: root
            principles:
              - id: P1
                name: Fresh Principle
                statement: Fresh.
                tags: []
                maps_to: [root:G1, root:V1]
                reviewed_by:
                  - date: "2026-02-20"
                    by: guy
                    note: "Reviewed after change"
        """))
        cfg = GVPConfig(libraries=[lib])
        catalog = load_catalog(cfg)
        _, warnings = validate_catalog(catalog)
        assert not any("W006" in w and "P1" in w for w in warnings)

    def test_never_reviewed_ancestor_updated_warns(self, tmp_path: Path):
        """No reviewed_by + ancestor has updated_by -> W006."""
        lib = tmp_path / "lib"
        lib.mkdir()
        (lib / "root.yaml").write_text(textwrap.dedent("""\
            meta:
              name: root
            values:
              - id: V1
                name: Test Value
                statement: A value.
                tags: []
                maps_to: []
                updated_by:
                  - date: "2026-02-20"
                    rationale: "Changed"
            goals:
              - id: G1
                name: Test Goal
                statement: A goal.
                tags: []
                maps_to: []
        """))
        (lib / "test.yaml").write_text(textwrap.dedent("""\
            meta:
              name: test
              inherits: root
            principles:
              - id: P1
                name: Never Reviewed
                statement: Never reviewed.
                tags: []
                maps_to: [root:G1, root:V1]
        """))
        cfg = GVPConfig(libraries=[lib])
        catalog = load_catalog(cfg)
        _, warnings = validate_catalog(catalog)
        assert any("W006" in w and "P1" in w for w in warnings)

    def test_no_review_no_ancestor_updates_no_warning(self, tmp_path: Path):
        """No reviewed_by + no ancestor updated_by -> no W006."""
        lib = _make_lib(tmp_path, textwrap.dedent("""\
            principles:
              - id: P1
                name: Simple
                statement: Simple.
                tags: []
                maps_to: [root:G1, root:V1]
        """))
        cfg = GVPConfig(libraries=[lib])
        catalog = load_catalog(cfg)
        _, warnings = validate_catalog(catalog)
        assert not any("W006" in w for w in warnings)


class TestUserDefinedRules:
    """Tests for user-defined validation rules from config.yaml."""

    def test_min_tags_rule(self, tmp_path: Path):
        lib = _make_lib(
            tmp_path,
            textwrap.dedent(
                """\
            principles:
              - id: P1
                name: No Tags
                statement: Missing tags.
                tags: []
                maps_to: [root:G1, root:V1]
        """
            ),
        )
        cfg = GVPConfig(
            libraries=[lib],
            validation_rules=[
                {
                    "name": "Principles need tags",
                    "match": {"category": "principle"},
                    "require": {"min_tags": 1},
                }
            ],
        )
        catalog = load_catalog(cfg)
        errors, _ = validate_catalog(catalog, cfg)
        assert any("Principles need tags" in e and "P1" in e for e in errors)

    def test_min_tags_rule_passes(self, tmp_path: Path):
        lib = tmp_path / "lib"
        lib.mkdir()
        (lib / "tags.yaml").write_text(
            "domains:\n  code:\n    description: Code\nconcerns: {}\n"
        )
        (lib / "root.yaml").write_text(
            textwrap.dedent(
                """\
            meta:
              name: root
            goals:
              - id: G1
                name: G
                statement: G.
                tags: []
                maps_to: []
            values:
              - id: V1
                name: V
                statement: V.
                tags: []
                maps_to: []
        """
            )
        )
        (lib / "test.yaml").write_text(
            textwrap.dedent(
                """\
            meta:
              name: test
              inherits: root
            principles:
              - id: P1
                name: Tagged
                statement: Has tags.
                tags: [code]
                maps_to: [root:G1, root:V1]
        """
            )
        )
        cfg = GVPConfig(
            libraries=[lib],
            validation_rules=[
                {
                    "name": "Principles need tags",
                    "match": {"category": "principle"},
                    "require": {"min_tags": 1},
                }
            ],
        )
        catalog = load_catalog(cfg)
        errors, _ = validate_catalog(catalog, cfg)
        assert not any("Principles need tags" in e for e in errors)

    def test_has_field_rule(self, tmp_path: Path):
        lib = _make_lib(
            tmp_path,
            textwrap.dedent(
                """\
            goals:
              - id: G1
                name: No Statement
                tags: []
                maps_to: []
        """
            ),
        )
        cfg = GVPConfig(
            libraries=[lib],
            validation_rules=[
                {
                    "name": "Goals need statements",
                    "match": {"category": "goal"},
                    "require": {"has_field": "statement"},
                }
            ],
        )
        catalog = load_catalog(cfg)
        errors, _ = validate_catalog(catalog, cfg)
        assert any("Goals need statements" in e for e in errors)

    def test_maps_to_category_rule(self, tmp_path: Path):
        lib = _make_lib(
            tmp_path,
            textwrap.dedent(
                """\
            heuristics:
              - id: H1
                name: Maps to value not principle
                statement: If A then B.
                tags: []
                maps_to: [root:V1]
        """
            ),
        )
        cfg = GVPConfig(
            libraries=[lib],
            validation_rules=[
                {
                    "name": "Heuristics should map to a principle",
                    "match": {"category": "heuristic"},
                    "require": {"maps_to_category": "principle"},
                }
            ],
        )
        catalog = load_catalog(cfg)
        errors, _ = validate_catalog(catalog, cfg)
        assert any("Heuristics should map to a principle" in e for e in errors)

    def test_warning_level_rule(self, tmp_path: Path):
        lib = _make_lib(
            tmp_path,
            textwrap.dedent(
                """\
            principles:
              - id: P1
                name: No Tags
                statement: Missing tags.
                tags: []
                maps_to: [root:G1, root:V1]
        """
            ),
        )
        cfg = GVPConfig(
            libraries=[lib],
            validation_rules=[
                {
                    "name": "Principles should have tags",
                    "match": {"category": "principle"},
                    "require": {"min_tags": 1},
                    "level": "warning",
                }
            ],
        )
        catalog = load_catalog(cfg)
        errors, warnings = validate_catalog(catalog, cfg)
        assert not any("Principles should have tags" in e for e in errors)
        assert any("Principles should have tags" in w for w in warnings)

    def test_match_by_tag(self, tmp_path: Path):
        lib = tmp_path / "lib"
        lib.mkdir()
        (lib / "tags.yaml").write_text(
            "domains:\n  code:\n    description: Code\nconcerns: {}\n"
        )
        (lib / "root.yaml").write_text(
            textwrap.dedent(
                """\
            meta:
              name: root
            goals:
              - id: G1
                name: G
                statement: G.
                tags: []
                maps_to: []
            values:
              - id: V1
                name: V
                statement: V.
                tags: []
                maps_to: []
        """
            )
        )
        (lib / "test.yaml").write_text(
            textwrap.dedent(
                """\
            meta:
              name: test
              inherits: root
            principles:
              - id: P1
                name: Code Principle
                statement: Code stuff.
                tags: [code]
                maps_to: [root:G1, root:V1]
        """
            )
        )
        cfg = GVPConfig(
            libraries=[lib],
            validation_rules=[
                {
                    "name": "Code elements need statement",
                    "match": {"tag": "code"},
                    "require": {"has_field": "statement"},
                }
            ],
        )
        catalog = load_catalog(cfg)
        errors, _ = validate_catalog(catalog, cfg)
        # P1 has a statement, so should pass
        assert not any("Code elements" in e for e in errors)
