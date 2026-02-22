# GVP Alignment Pass 1 — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Codify the GVP glossary, extract framework content from the TASV document, upgrade the validator with category-specific traceability rules and user-defined validation, rewrite the README as user-facing framework docs, and align gvp-docs.

**Architecture:** Glossary and README are documentation-only. Validation upgrades add `_validate_mappings()` (tier 1 errors), `_validate_semantic()` (tier 2 warnings), and `_validate_user_rules()` (tier 3 config-driven) to `validate.py`. Config gets a new `validation_rules` field. gvp-docs gets slimmed README + updated schema.

**Tech Stack:** Python 3.11+, PyYAML, pytest. No new dependencies.

**Test data:** Real gvp-docs library at `/home/guy/code/git/github.com/shitchell/gvp-docs/` plus synthetic YAML fixtures in tests.

---

## Task 1: Create GLOSSARY.md

**Files:**
- Create: `GLOSSARY.md`

**Step 1: Write GLOSSARY.md**

```markdown
# GVP Glossary

Canonical definitions for GVP terminology. For how the framework works, see [README.md](README.md). For technical specs, see [docs/](docs/).

## Framework Terms

| Term | Definition |
|------|------------|
| **Goal** | An ideal state you're working toward. Would remain true if you rewrote everything tomorrow. |
| **Value** | A semantic descriptor that shapes trade-offs. The thumb on the scale when two valid approaches exist. |
| **Principle** | A stated preference or bias that requires judgment to apply. Less fuzzy than a value, more flexible than a rule. |
| **Heuristic** | A well-defined if/then decision procedure. Where a principle says "prefer X," a heuristic says "if A, then B; else C." |
| **Rule** | A hard stop. Binary, no exceptions. A principle that graduated to "never cross this line." |
| **Design Choice** | A tool or architectural decision picked for a specific implementation. Changes when the implementation changes. |
| **Implementation Rule** | A hard stop contingent on design choices. If the design choice changes, the rule may not apply. |
| **Coding Principle** | A guideline for writing code in a specific implementation. Changes with the tech stack. |
| **Constraint** | A fact about the system or environment you don't control. Descriptive, not prescriptive. |
| **Milestone** | A concrete, achievable waypoint on the path to goals. Ordered near-term to long-term. |
| **Scope** | A human-readable label for a level in the hierarchy (e.g., "universal", "personal", "project"). User-defined granularity. |
| **Tag** | A classification label applied to elements. Two flavors: domain tags (what area) and concern tags (what quality). |
| **Provenance** | The tracked history of where an element was first inferred (origin) and how it has been modified (updated_by). |
| **Traceability** | The property that every element (except goals, values, and constraints) traces its justification to at least one goal and one value. |

## Technical Terms

Terms specific to the `gvp` CLI tool and YAML document format.

| Term | Definition |
|------|------------|
| **Element** | A single GVP entry of any category, stored as a YAML mapping with an ID, name, and category-specific fields. |
| **Document** | A YAML file containing a `meta` block and one or more elements. |
| **Library** | A directory containing GVP documents, optionally with a `tags.yaml` and `schema.yaml`. |
| **Chain** | The resolved inheritance path from a document to its root, determined by `meta.inherits` references. |
| **Catalog** | The fully loaded, resolved graph of all documents across all libraries. The runtime object built by the loader. |
| **Qualified ID** | A `document:ID` reference that unambiguously identifies an element across scopes (e.g., `personal:P3`). |
| **maps_to** | The field on an element that encodes its relationships to other elements as a list of qualified IDs. |
| **meta.defaults** | Default field values in a document's meta block, applied to every element in that file unless explicitly overridden. |
```

**Step 2: Commit**

```bash
git add GLOSSARY.md
git commit -m "docs: add canonical glossary with framework and technical terms"
```

---

## Task 2: Rewrite README.md

**Files:**
- Modify: `README.md`

**Step 1: Rewrite README.md**

Replace the current README (which is tool-usage only) with a user-facing framework explanation followed by tool usage. The content draws from the TASV doc (lines 7-59) and gvp-docs README, adapted to be domain-agnostic and non-technical.

Structure:

```markdown
# gvp

A framework and CLI tool for decision traceability. GVP (Goals, Values, and Principles) helps you capture the reasoning behind decisions so that every choice — from architecture to process — can trace back to what you're trying to achieve and why it matters.

## How It Works

GVP organizes decision-making into a layered system. Each layer has a specific role and relates to the others through a many-to-many graph.

### Categories

| Category | Scope | Specificity | Description | How to identify |
|----------|-------|-------------|-------------|-----------------|
| **Goal** | Project | Low | Ideal states you're working toward. Would remain true if you rewrote everything tomorrow. | Is it a destination, not a method? |
| **Value** | Universal/Personal | Low | Semantic descriptors that shape trade-offs. The thumb on the scale when two valid approaches exist. | Does it describe a quality you want, not a specific action? |
| **Principle** | Universal/Personal | Medium | Less fuzzy than a value, more flexible than a rule. States a preference that requires judgment to apply. | Is it a bias or preference that requires judgment? |
| **Heuristic** | Universal/Personal | High | Well-defined if/then decision trees. Where a principle says "prefer X," a heuristic says "if A, then B; else C." | Can you write it as an if/then tree? |
| **Rule** | Universal/Personal/Project | High | Hard stops. Binary, no exceptions. A principle that graduated to "never cross this line." | Is it a bright line that's never crossed? |
| **Design Choice** | Implementation | High | Tools and architectural decisions picked for a specific implementation. Change when the implementation changes. | Would it change if you switched frameworks? |
| **Implementation Rule** | Implementation | High | Hard stops contingent on design choices. If the design choice changes, the rule may not apply. | Would it change if you switched frameworks? |
| **Coding Principle** | Implementation | Medium-High | Guidelines for writing code in a specific implementation. Change with the tech stack. | Would it change if you switched frameworks? |
| **Milestone** | Project | High | Concrete, achievable waypoints on the path to goals. Ordered near-term to long-term. | Is it a concrete, achievable state on the roadmap? |
| **Constraint** | Project | High | Facts about the system or environment you don't control. Descriptive, not prescriptive. | Is it a fact about the system you don't control? |

### Relationships

- **Goals** are the destination. Everything else exists to get there.
- **Values** are the compass. They shape every decision but don't prescribe specific actions.
- **Principles** state preferences. **Heuristics** encode the procedure for applying them. **Rules** are principles with zero tolerance for exceptions.
- **Design Choices** are the tools you've picked. **Implementation Rules** and **Coding Principles** are the guidelines for using those tools.
- **Constraints** are external facts that shape your choices but aren't themselves decisions.
- The relationships are a **graph**, not a tree — many-to-many.

### Scope and Inheritance

GVP documents form an inheritance chain. Priority flows from root to leaf: **parent wins on conflict, child extends**. The nesting depth is user-defined. The conventional structure is:

```
universal.yaml                         (organization-wide, highest priority)
  └─ personal.yaml                     (individual, cross-project)
       └─ projects/<project>.yaml      (project-level: goals, constraints)
            └─ ...                      (arbitrary further nesting)
```

For personal use, `universal.yaml` can remain empty. What constitutes a "project" vs. deeper nesting is up to you — the framework doesn't enforce granularity, only the inheritance chain.

### Tags

Elements are classified by tags rather than separated into domain-specific files. Tags come in two flavors:

- **Domain tags** (`code`, `systems`, `cli`, `ux`, ...): what area the element applies to
- **Concern tags** (`maintainability`, `transparency`, `pragmatism`, ...): what quality the element addresses

Tags are defined in a `tags.yaml` registry to prevent drift.

### Traceability

Every element (except goals, values, and constraints) must trace its justification to at least one goal and one value — directly or transitively through other elements.

| Category | Must map to... |
|----------|---------------|
| Milestone | >= 1 goal + >= 1 value |
| Principle | >= 1 goal + >= 1 value |
| Rule | >= 1 goal + >= 1 value |
| Design Choice | >= 1 goal + >= 1 value |
| Heuristic | (>= 1 goal + >= 1 value) OR >= 1 principle |
| Implementation Rule | (>= 1 goal + >= 1 value) OR >= 1 design choice |
| Coding Principle | (>= 1 goal + >= 1 value) OR >= 1 principle or design choice |

Goals, values, and constraints are roots — they don't need to map to anything. Constraints are external facts; goals and values are foundational.

## Installation

```bash
pip install -e .

# For graphviz/DOT rendering:
pip install -e ".[diagrams]"
```

## Quick Start

```bash
# Validate a GVP library
gvp validate --library ~/my-gvp-docs/

# Query elements by tag
gvp query --library ~/my-gvp-docs/ --tag code

# Trace an element's mapping graph
gvp trace --library ~/my-gvp-docs/ personal:H5

# Render to markdown
gvp render --library ~/my-gvp-docs/ --format markdown --stdout
```

## Subcommands

### validate

Check a catalog for structural errors, traceability violations, and user-defined rules.

```bash
gvp validate --library path/
gvp validate --library path/ --strict  # warnings become errors
```

### query

Filter elements by tag, category, document, or status.

```bash
gvp query --library path/ --tag code --category heuristic
gvp query --library path/ --document personal --format json
```

### trace

Walk the mapping graph from a given element, showing ancestors or descendants.

```bash
gvp trace --library path/ personal:H5
gvp trace --library path/ personal:H5 --reverse
```

### render

Generate output in markdown, CSV, SQLite, or DOT (graphviz) format.

```bash
gvp render --library path/ --format markdown -o output/
gvp render --library path/ --format dot --stdout | dot -Tpng -o graph.png
```

### add

Create a new element in a document.

```bash
gvp add principle personal --library path/ --name "New Principle" --statement "..."
gvp add heuristic personal --library path/ --interactive
```

### edit

Modify an existing element with provenance tracking.

```bash
gvp edit personal:P3 --library path/ --status deprecated --rationale "Superseded by P7"
```

## Global Options

| Flag | Description |
|------|-------------|
| `--version` | Show version |
| `--strict` | Promote warnings to errors |
| `--config PATH` | Override config file path |
| `--library PATH` | Add a library path (repeatable) |

## Further Reading

- [GLOSSARY.md](GLOSSARY.md) — canonical term definitions
- [docs/plans/](docs/plans/) — design documents and implementation plans
```

**Step 2: Commit**

```bash
git add README.md
git commit -m "docs: rewrite README as user-facing framework explanation with TASV content"
```

---

## Task 3: Tier 1 — Category-specific mapping validation (tests)

**Files:**
- Modify: `tests/commands/test_validate.py`

**Step 1: Write failing tests for category-specific mapping rules**

Add the following test class to `tests/commands/test_validate.py`. These tests create minimal YAML libraries with elements that violate the traceability rules.

Helper to reduce YAML boilerplate — a function that builds a minimal library with configurable elements:

```python
import textwrap


def _make_lib(tmp_path: Path, elements_yaml: str) -> Path:
    """Create a minimal library with a root doc (goals/values) and a test doc."""
    lib = tmp_path / "lib"
    lib.mkdir(exist_ok=True)
    # Root doc with goals and values for elements to map to
    (lib / "root.yaml").write_text(textwrap.dedent("""\
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
    """))
    (lib / "test.yaml").write_text(textwrap.dedent(f"""\
        meta:
          name: test
          inherits: root
          scope: project
        {elements_yaml}
    """))
    return lib


class TestMappingValidation:
    """Tests for category-specific traceability rules."""

    def test_principle_with_goal_and_value_passes(self, tmp_path: Path):
        lib = _make_lib(tmp_path, textwrap.dedent("""\
            principles:
              - id: P1
                name: Test Principle
                statement: A test.
                tags: []
                maps_to: [root:G1, root:V1]
        """))
        cfg = GVPConfig(libraries=[lib])
        catalog = load_catalog(cfg)
        errors, _ = validate_catalog(catalog)
        assert not any("traceability" in e.lower() or "P1" in e for e in errors)

    def test_principle_missing_goal_fails(self, tmp_path: Path):
        lib = _make_lib(tmp_path, textwrap.dedent("""\
            principles:
              - id: P1
                name: Test Principle
                statement: A test.
                tags: []
                maps_to: [root:V1]
        """))
        cfg = GVPConfig(libraries=[lib])
        catalog = load_catalog(cfg)
        errors, _ = validate_catalog(catalog)
        assert any("P1" in e and "goal" in e.lower() for e in errors)

    def test_principle_missing_value_fails(self, tmp_path: Path):
        lib = _make_lib(tmp_path, textwrap.dedent("""\
            principles:
              - id: P1
                name: Test Principle
                statement: A test.
                tags: []
                maps_to: [root:G1]
        """))
        cfg = GVPConfig(libraries=[lib])
        catalog = load_catalog(cfg)
        errors, _ = validate_catalog(catalog)
        assert any("P1" in e and "value" in e.lower() for e in errors)

    def test_heuristic_with_principle_shortcut_passes(self, tmp_path: Path):
        lib = _make_lib(tmp_path, textwrap.dedent("""\
            principles:
              - id: P1
                name: Test Principle
                statement: A test.
                tags: []
                maps_to: [root:G1, root:V1]
            heuristics:
              - id: H1
                name: Test Heuristic
                statement: If A then B.
                tags: []
                maps_to: [test:P1]
        """))
        cfg = GVPConfig(libraries=[lib])
        catalog = load_catalog(cfg)
        errors, _ = validate_catalog(catalog)
        assert not any("H1" in e for e in errors)

    def test_heuristic_without_principle_or_gv_fails(self, tmp_path: Path):
        lib = _make_lib(tmp_path, textwrap.dedent("""\
            heuristics:
              - id: H1
                name: Test Heuristic
                statement: If A then B.
                tags: []
                maps_to: []
        """))
        cfg = GVPConfig(libraries=[lib])
        catalog = load_catalog(cfg)
        errors, _ = validate_catalog(catalog)
        assert any("H1" in e for e in errors)

    def test_design_choice_with_goal_and_value_passes(self, tmp_path: Path):
        lib = _make_lib(tmp_path, textwrap.dedent("""\
            design_choices:
              - id: D1
                name: Test Design Choice
                rationale: Because.
                tags: []
                maps_to: [root:G1, root:V1]
        """))
        cfg = GVPConfig(libraries=[lib])
        catalog = load_catalog(cfg)
        errors, _ = validate_catalog(catalog)
        assert not any("D1" in e for e in errors)

    def test_implementation_rule_with_design_choice_shortcut_passes(self, tmp_path: Path):
        lib = _make_lib(tmp_path, textwrap.dedent("""\
            design_choices:
              - id: D1
                name: Test DC
                rationale: Because.
                tags: []
                maps_to: [root:G1, root:V1]
            implementation_rules:
              - id: IR1
                name: Test IR
                statement: Do this.
                tags: []
                maps_to: [test:D1]
        """))
        cfg = GVPConfig(libraries=[lib])
        catalog = load_catalog(cfg)
        errors, _ = validate_catalog(catalog)
        assert not any("IR1" in e for e in errors)

    def test_coding_principle_with_principle_shortcut_passes(self, tmp_path: Path):
        lib = _make_lib(tmp_path, textwrap.dedent("""\
            principles:
              - id: P1
                name: Test Principle
                statement: A test.
                tags: []
                maps_to: [root:G1, root:V1]
            coding_principles:
              - id: C1
                name: Test CP
                statement: Write it this way.
                tags: []
                maps_to: [test:P1]
        """))
        cfg = GVPConfig(libraries=[lib])
        catalog = load_catalog(cfg)
        errors, _ = validate_catalog(catalog)
        assert not any("C1" in e for e in errors)

    def test_milestone_missing_value_fails(self, tmp_path: Path):
        lib = _make_lib(tmp_path, textwrap.dedent("""\
            milestones:
              - id: M1
                name: Test Milestone
                description: A milestone.
                progress: planned
                tags: []
                maps_to: [root:G1]
        """))
        cfg = GVPConfig(libraries=[lib])
        catalog = load_catalog(cfg)
        errors, _ = validate_catalog(catalog)
        assert any("M1" in e and "value" in e.lower() for e in errors)

    def test_rule_with_goal_and_value_passes(self, tmp_path: Path):
        lib = _make_lib(tmp_path, textwrap.dedent("""\
            rules:
              - id: R1
                name: Test Rule
                statement: Never do this.
                tags: []
                maps_to: [root:G1, root:V1]
        """))
        cfg = GVPConfig(libraries=[lib])
        catalog = load_catalog(cfg)
        errors, _ = validate_catalog(catalog)
        assert not any("R1" in e for e in errors)

    def test_goal_needs_no_mapping(self, tmp_path: Path):
        """Goals are roots — empty maps_to is valid."""
        lib = _make_lib(tmp_path, textwrap.dedent("""\
            goals:
              - id: G1
                name: Another Goal
                statement: A goal.
                tags: []
                maps_to: []
        """))
        cfg = GVPConfig(libraries=[lib])
        catalog = load_catalog(cfg)
        errors, _ = validate_catalog(catalog)
        assert not any("G1" in e and "test" in e for e in errors)

    def test_value_needs_no_mapping(self, tmp_path: Path):
        """Values are roots — empty maps_to is valid."""
        lib = _make_lib(tmp_path, textwrap.dedent("""\
            values:
              - id: V1
                name: Another Value
                statement: A value.
                tags: []
                maps_to: []
        """))
        cfg = GVPConfig(libraries=[lib])
        catalog = load_catalog(cfg)
        errors, _ = validate_catalog(catalog)
        assert not any("V1" in e and "test" in e for e in errors)

    def test_constraint_needs_no_mapping(self, tmp_path: Path):
        """Constraints are external facts — empty maps_to is valid."""
        lib = _make_lib(tmp_path, textwrap.dedent("""\
            constraints:
              - id: CON1
                name: Test Constraint
                impact: Affects design.
                tags: []
                maps_to: []
        """))
        cfg = GVPConfig(libraries=[lib])
        catalog = load_catalog(cfg)
        errors, _ = validate_catalog(catalog)
        assert not any("CON1" in e for e in errors)

    def test_deprecated_elements_skip_mapping_check(self, tmp_path: Path):
        """Deprecated elements should not be checked for traceability."""
        lib = _make_lib(tmp_path, textwrap.dedent("""\
            principles:
              - id: P1
                name: Old Principle
                status: deprecated
                statement: Outdated.
                tags: []
                maps_to: []
        """))
        cfg = GVPConfig(libraries=[lib])
        catalog = load_catalog(cfg)
        errors, _ = validate_catalog(catalog)
        assert not any("P1" in e for e in errors)

    def test_real_gvp_docs_passes_mapping_check(self, gvp_docs_library: Path):
        """The real gvp-docs library should pass all mapping rules."""
        cfg = GVPConfig(libraries=[gvp_docs_library])
        catalog = load_catalog(cfg)
        errors, _ = validate_catalog(catalog)
        mapping_errors = [e for e in errors if "traceability" in e.lower() or "must map" in e.lower()]
        assert mapping_errors == [], f"gvp-docs mapping errors: {mapping_errors}"
```

**Step 2: Run tests to verify they fail**

Run: `pytest tests/commands/test_validate.py::TestMappingValidation -v`
Expected: FAIL — tests reference behavior not yet implemented

---

## Task 4: Tier 1 — Category-specific mapping validation (implementation)

**Files:**
- Modify: `src/gvp/commands/validate.py`

**Step 1: Add `_validate_mappings()` to validate.py**

Add this function before `validate_catalog()`:

```python
# Categories that are roots (no mapping required)
_ROOT_CATEGORIES = {"goal", "value", "constraint"}

# Mapping rules: category -> (required_categories, alternative_categories)
# An element passes if:
#   - maps_to contains >= 1 of EACH required category, OR
#   - maps_to contains >= 1 of ANY alternative category
_MAPPING_RULES: dict[str, tuple[set[str], set[str]]] = {
    "milestone":           ({"goal", "value"}, set()),
    "principle":           ({"goal", "value"}, set()),
    "rule":                ({"goal", "value"}, set()),
    "design_choice":       ({"goal", "value"}, set()),
    "heuristic":           ({"goal", "value"}, {"principle"}),
    "implementation_rule": ({"goal", "value"}, {"design_choice"}),
    "coding_principle":    ({"goal", "value"}, {"principle", "design_choice"}),
}


def _validate_mappings(catalog: Catalog) -> list[str]:
    """Check category-specific traceability rules."""
    errors: list[str] = []

    for qid, elem in catalog.elements.items():
        if elem.category in _ROOT_CATEGORIES:
            continue
        if elem.status in ("deprecated", "rejected"):
            continue

        rule = _MAPPING_RULES.get(elem.category)
        if rule is None:
            continue

        required_cats, alt_cats = rule

        # Resolve maps_to targets to their categories
        target_categories: set[str] = set()
        for ref in elem.maps_to:
            target = catalog.elements.get(ref)
            if target is not None:
                target_categories.add(target.category)

        # Check alternative path first
        if alt_cats and (alt_cats & target_categories):
            continue

        # Check required categories
        missing = required_cats - target_categories
        if missing:
            missing_str = " and ".join(sorted(missing))
            errors.append(
                f"{qid}: traceability — must map to at least one {missing_str}"
            )

    return errors
```

**Step 2: Call `_validate_mappings()` from `validate_catalog()`**

Add this line just before `# Warn on empty documents`:

```python
    # Check category-specific mapping rules
    errors.extend(_validate_mappings(catalog))
```

**Step 3: Run tests to verify they pass**

Run: `pytest tests/commands/test_validate.py -v`
Expected: ALL PASS

**Step 4: Run full test suite**

Run: `pytest tests/ -v --tb=short`
Expected: ALL PASS (including the real gvp-docs check)

**Step 5: Commit**

```bash
git add src/gvp/commands/validate.py tests/commands/test_validate.py
git commit -m "feat: category-specific traceability validation rules"
```

---

## Task 5: Tier 2 — Semantic warnings (tests + implementation)

**Files:**
- Modify: `src/gvp/commands/validate.py`
- Modify: `tests/commands/test_validate.py`

**Step 1: Write failing tests for W004 and W005**

Add to `tests/commands/test_validate.py`:

```python
class TestSemanticWarnings:
    """Tests for tier-2 semantic warnings."""

    def test_empty_maps_to_warns(self, tmp_path: Path):
        """W004: element that should have mappings but has none."""
        lib = _make_lib(tmp_path, textwrap.dedent("""\
            principles:
              - id: P1
                name: Floating Principle
                statement: No mappings.
                tags: []
                maps_to: []
        """))
        cfg = GVPConfig(libraries=[lib])
        catalog = load_catalog(cfg)
        _, warnings = validate_catalog(catalog)
        assert any("W004" in w and "P1" in w for w in warnings)

    def test_empty_maps_to_ok_for_roots(self, tmp_path: Path):
        """Goals, values, constraints should NOT get W004."""
        lib = _make_lib(tmp_path, textwrap.dedent("""\
            values:
              - id: V1
                name: Root Value
                statement: Fine.
                tags: []
                maps_to: []
        """))
        cfg = GVPConfig(libraries=[lib])
        catalog = load_catalog(cfg)
        _, warnings = validate_catalog(catalog)
        assert not any("W004" in w and "V1" in w for w in warnings)

    def test_deprecated_skips_w004(self, tmp_path: Path):
        """Deprecated elements should not get W004."""
        lib = _make_lib(tmp_path, textwrap.dedent("""\
            principles:
              - id: P1
                name: Old Principle
                status: deprecated
                statement: Outdated.
                tags: []
                maps_to: []
        """))
        cfg = GVPConfig(libraries=[lib])
        catalog = load_catalog(cfg)
        _, warnings = validate_catalog(catalog)
        assert not any("W004" in w and "P1" in w for w in warnings)

    def test_insular_mappings_warns(self, tmp_path: Path):
        """W005: all maps_to targets are in the same document."""
        lib = _make_lib(tmp_path, textwrap.dedent("""\
            goals:
              - id: G1
                name: Local Goal
                statement: A goal.
                tags: []
                maps_to: []
            values:
              - id: V1
                name: Local Value
                statement: A value.
                tags: []
                maps_to: []
            principles:
              - id: P1
                name: Insular Principle
                statement: Maps only within same doc.
                tags: []
                maps_to: [test:G1, test:V1]
        """))
        cfg = GVPConfig(libraries=[lib])
        catalog = load_catalog(cfg)
        _, warnings = validate_catalog(catalog)
        assert any("W005" in w and "P1" in w for w in warnings)

    def test_cross_scope_mappings_no_w005(self, tmp_path: Path):
        """Elements mapping to parent scope should not get W005."""
        lib = _make_lib(tmp_path, textwrap.dedent("""\
            principles:
              - id: P1
                name: Cross-scope Principle
                statement: Maps to root.
                tags: []
                maps_to: [root:G1, root:V1]
        """))
        cfg = GVPConfig(libraries=[lib])
        catalog = load_catalog(cfg)
        _, warnings = validate_catalog(catalog)
        assert not any("W005" in w for w in warnings)
```

**Step 2: Run tests to verify they fail**

Run: `pytest tests/commands/test_validate.py::TestSemanticWarnings -v`
Expected: FAIL

**Step 3: Add `_validate_semantic()` to validate.py**

Add this function after `_validate_mappings()`:

```python
def _validate_semantic(catalog: Catalog) -> list[str]:
    """Check semantic warnings (tier 2)."""
    warnings: list[str] = []

    for qid, elem in catalog.elements.items():
        if elem.status in ("deprecated", "rejected"):
            continue
        if elem.category in _ROOT_CATEGORIES:
            continue

        # W004: empty maps_to on element that should have mappings
        if not elem.maps_to:
            warnings.append(
                f"W004: {qid} ({elem.category}) has no maps_to references"
            )
            continue  # skip W005 if maps_to is empty

        # W005: all maps_to targets are in the same document
        target_docs = set()
        for ref in elem.maps_to:
            target = catalog.elements.get(ref)
            if target is not None:
                target_docs.add(target.document.name)
        if target_docs and target_docs == {elem.document.name}:
            warnings.append(
                f"W005: {qid} maps only to elements in its own document"
            )

    return warnings
```

**Step 4: Call from `validate_catalog()`**

Add after the `_validate_mappings` call:

```python
    # Check semantic warnings
    warnings.extend(_validate_semantic(catalog))
```

**Step 5: Run tests to verify they pass**

Run: `pytest tests/commands/test_validate.py -v`
Expected: ALL PASS

**Step 6: Run full test suite**

Run: `pytest tests/ -v --tb=short`
Expected: ALL PASS

**Step 7: Commit**

```bash
git add src/gvp/commands/validate.py tests/commands/test_validate.py
git commit -m "feat: W004/W005 semantic warnings for empty and insular mappings"
```

---

## Task 6: Tier 3 — User-defined validation rules (config tests)

**Files:**
- Modify: `src/gvp/config.py`
- Modify: `tests/test_config.py`

**Step 1: Write failing tests for config parsing**

Add to `tests/test_config.py`:

```python
class TestValidationRulesConfig:
    def test_empty_config_has_no_rules(self):
        cfg = GVPConfig()
        assert cfg.validation_rules == []

    def test_parse_validation_rules(self, tmp_path: Path):
        config_file = tmp_path / "config.yaml"
        config_file.write_text(textwrap.dedent("""\
            validation:
              rules:
                - name: "Heuristics need tags"
                  match:
                    category: heuristic
                  require:
                    min_tags: 1
        """))
        from gvp.config import _parse_config_yaml
        cfg = _parse_config_yaml(config_file)
        assert len(cfg.validation_rules) == 1
        assert cfg.validation_rules[0]["name"] == "Heuristics need tags"

    def test_merge_combines_rules(self):
        base = GVPConfig(validation_rules=[{"name": "rule1"}])
        overlay = GVPConfig(validation_rules=[{"name": "rule2"}])
        merged = base.merge(overlay)
        assert len(merged.validation_rules) == 2

    def test_no_validation_section_ok(self, tmp_path: Path):
        config_file = tmp_path / "config.yaml"
        config_file.write_text("libraries: []\n")
        from gvp.config import _parse_config_yaml
        cfg = _parse_config_yaml(config_file)
        assert cfg.validation_rules == []
```

**Step 2: Run tests to verify they fail**

Run: `pytest tests/test_config.py::TestValidationRulesConfig -v`
Expected: FAIL — `GVPConfig` has no `validation_rules` field

**Step 3: Add `validation_rules` to GVPConfig**

In `src/gvp/config.py`, add the field to the dataclass:

```python
@dataclass
class GVPConfig:
    """Merged configuration from all sources."""

    libraries: list[Path] = field(default_factory=list)
    strict: bool = False
    suppress_warnings: list[str] = field(default_factory=list)
    validation_rules: list[dict] = field(default_factory=list)
```

Update `merge()`:

```python
    def merge(self, other: GVPConfig) -> GVPConfig:
        """Merge another config into this one."""
        return GVPConfig(
            libraries=self.libraries + other.libraries,
            strict=self.strict or other.strict,
            suppress_warnings=list(
                set(self.suppress_warnings + other.suppress_warnings)
            ),
            validation_rules=self.validation_rules + other.validation_rules,
        )
```

Update `_parse_config_yaml()`:

```python
    validation = data.get("validation", {})
    return GVPConfig(
        libraries=[Path(p).expanduser() for p in data.get("libraries", [])],
        strict=data.get("strict", False),
        suppress_warnings=data.get("suppress_warnings", []),
        validation_rules=validation.get("rules", []),
    )
```

**Step 4: Run tests to verify they pass**

Run: `pytest tests/test_config.py -v`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add src/gvp/config.py tests/test_config.py
git commit -m "feat: validation_rules field in GVPConfig with config.yaml parsing"
```

---

## Task 7: Tier 3 — User-defined validation rules (validation engine)

**Files:**
- Modify: `src/gvp/commands/validate.py`
- Modify: `tests/commands/test_validate.py`

**Step 1: Write failing tests for user-defined rules**

Add to `tests/commands/test_validate.py`:

```python
class TestUserDefinedRules:
    """Tests for user-defined validation rules from config.yaml."""

    def test_min_tags_rule(self, tmp_path: Path):
        lib = _make_lib(tmp_path, textwrap.dedent("""\
            principles:
              - id: P1
                name: No Tags
                statement: Missing tags.
                tags: []
                maps_to: [root:G1, root:V1]
        """))
        cfg = GVPConfig(
            libraries=[lib],
            validation_rules=[{
                "name": "Principles need tags",
                "match": {"category": "principle"},
                "require": {"min_tags": 1},
            }],
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
        (lib / "root.yaml").write_text(textwrap.dedent("""\
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
        """))
        (lib / "test.yaml").write_text(textwrap.dedent("""\
            meta:
              name: test
              inherits: root
            principles:
              - id: P1
                name: Tagged
                statement: Has tags.
                tags: [code]
                maps_to: [root:G1, root:V1]
        """))
        cfg = GVPConfig(
            libraries=[lib],
            validation_rules=[{
                "name": "Principles need tags",
                "match": {"category": "principle"},
                "require": {"min_tags": 1},
            }],
        )
        catalog = load_catalog(cfg)
        errors, _ = validate_catalog(catalog, cfg)
        assert not any("Principles need tags" in e for e in errors)

    def test_has_field_rule(self, tmp_path: Path):
        lib = _make_lib(tmp_path, textwrap.dedent("""\
            goals:
              - id: G1
                name: No Statement
                tags: []
                maps_to: []
        """))
        cfg = GVPConfig(
            libraries=[lib],
            validation_rules=[{
                "name": "Goals need statements",
                "match": {"category": "goal"},
                "require": {"has_field": "statement"},
            }],
        )
        catalog = load_catalog(cfg)
        errors, _ = validate_catalog(catalog, cfg)
        assert any("Goals need statements" in e for e in errors)

    def test_maps_to_category_rule(self, tmp_path: Path):
        lib = _make_lib(tmp_path, textwrap.dedent("""\
            heuristics:
              - id: H1
                name: Maps to value not principle
                statement: If A then B.
                tags: []
                maps_to: [root:V1]
        """))
        cfg = GVPConfig(
            libraries=[lib],
            validation_rules=[{
                "name": "Heuristics should map to a principle",
                "match": {"category": "heuristic"},
                "require": {"maps_to_category": "principle"},
            }],
        )
        catalog = load_catalog(cfg)
        errors, _ = validate_catalog(catalog, cfg)
        assert any("Heuristics should map to a principle" in e for e in errors)

    def test_warning_level_rule(self, tmp_path: Path):
        lib = _make_lib(tmp_path, textwrap.dedent("""\
            principles:
              - id: P1
                name: No Tags
                statement: Missing tags.
                tags: []
                maps_to: [root:G1, root:V1]
        """))
        cfg = GVPConfig(
            libraries=[lib],
            validation_rules=[{
                "name": "Principles should have tags",
                "match": {"category": "principle"},
                "require": {"min_tags": 1},
                "level": "warning",
            }],
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
        (lib / "root.yaml").write_text(textwrap.dedent("""\
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
        """))
        (lib / "test.yaml").write_text(textwrap.dedent("""\
            meta:
              name: test
              inherits: root
            principles:
              - id: P1
                name: Code Principle
                statement: Code stuff.
                tags: [code]
                maps_to: [root:G1, root:V1]
        """))
        cfg = GVPConfig(
            libraries=[lib],
            validation_rules=[{
                "name": "Code elements need statement",
                "match": {"tag": "code"},
                "require": {"has_field": "statement"},
            }],
        )
        catalog = load_catalog(cfg)
        errors, _ = validate_catalog(catalog, cfg)
        # P1 has a statement, so should pass
        assert not any("Code elements" in e for e in errors)
```

**Step 2: Run tests to verify they fail**

Run: `pytest tests/commands/test_validate.py::TestUserDefinedRules -v`
Expected: FAIL — `validate_catalog()` doesn't accept `cfg` parameter

**Step 3: Add `_validate_user_rules()` and update signature**

Update `validate_catalog()` signature to accept optional config:

```python
def validate_catalog(
    catalog: Catalog, config: GVPConfig | None = None
) -> tuple[list[str], list[str]]:
```

Add `_validate_user_rules()`:

```python
def _validate_user_rules(
    catalog: Catalog, rules: list[dict]
) -> tuple[list[str], list[str]]:
    """Evaluate user-defined validation rules from config.yaml."""
    errors: list[str] = []
    warnings: list[str] = []

    for rule_def in rules:
        name = rule_def.get("name", "unnamed rule")
        match = rule_def.get("match", {})
        require = rule_def.get("require", {})
        level = rule_def.get("level", "error")

        for qid, elem in catalog.elements.items():
            # Apply match filters
            if "category" in match and elem.category != match["category"]:
                continue
            if "scope" in match:
                if elem.document.scope_label != match["scope"]:
                    continue
            if "tag" in match and match["tag"] not in elem.tags:
                continue
            if "status" in match and elem.status != match["status"]:
                continue

            # Apply require checks
            violated = False

            if "min_tags" in require:
                if len(elem.tags) < require["min_tags"]:
                    violated = True

            if "has_field" in require:
                field_name = require["has_field"]
                if not elem.fields.get(field_name):
                    violated = True

            if "maps_to_category" in require:
                needed = require["maps_to_category"]
                if isinstance(needed, str):
                    needed = [needed]
                target_cats = set()
                for ref in elem.maps_to:
                    target = catalog.elements.get(ref)
                    if target is not None:
                        target_cats.add(target.category)
                if not (set(needed) & target_cats):
                    violated = True

            if "maps_to_scope" in require:
                needed_scopes = require["maps_to_scope"]
                if isinstance(needed_scopes, str):
                    needed_scopes = [needed_scopes]
                target_scopes = set()
                for ref in elem.maps_to:
                    target = catalog.elements.get(ref)
                    if target is not None and target.document.scope_label:
                        target_scopes.add(target.document.scope_label)
                if not (set(needed_scopes) & target_scopes):
                    violated = True

            if violated:
                msg = f"{qid}: {name}"
                if level == "warning":
                    warnings.append(msg)
                else:
                    errors.append(msg)

    return errors, warnings
```

Call from `validate_catalog()` at the end, before the return:

```python
    # Check user-defined rules
    if config is not None and config.validation_rules:
        user_errors, user_warnings = _validate_user_rules(
            catalog, config.validation_rules
        )
        errors.extend(user_errors)
        warnings.extend(user_warnings)
```

**Step 4: Run tests to verify they pass**

Run: `pytest tests/commands/test_validate.py -v`
Expected: ALL PASS

**Step 5: Run full test suite**

Run: `pytest tests/ -v --tb=short`
Expected: ALL PASS

**Step 6: Commit**

```bash
git add src/gvp/commands/validate.py tests/commands/test_validate.py
git commit -m "feat: user-defined validation rules from config.yaml"
```

---

## Task 8: Update gvp-docs for alignment

**Files:**
- Modify: `~/code/git/github.com/shitchell/gvp-docs/README.md`
- Modify: `~/code/git/github.com/shitchell/gvp-docs/schema.yaml`

**Step 1: Update gvp-docs README.md**

Slim down the README to reference gvp as the framework source of truth. Keep the structure diagram, workflow sections, and links. Remove the full categories table, relationships, validation, and delineation tests (they now live in the gvp utility README). Add a link to the gvp repo for framework documentation.

The README should:
- Open with a brief description: "Personal GVP library. See [gvp](link) for framework documentation."
- Keep the `Structure` section showing the directory layout
- Keep the `Workflow` section (capturing decisions, synthesizing items, evolving the framework)
- Keep the `Usage` section linking to the gvp utility
- Remove: Categories table, Priority and Inheritance, Relationships, Tags, Validation, Delineation Tests (all now in gvp README)

**Step 2: Update gvp-docs schema.yaml validation**

Update the milestone validation rule to require goal + value (not just goal). The current schema doesn't have an explicit validation section beyond field descriptions, so add a comment block at the top of `item_types` noting the traceability rule and the category-specific mapping requirements.

**Step 3: Verify gvp-docs still passes validation**

Run: `cd /home/guy/code/python/projects/gvp && pytest tests/commands/test_validate.py::TestValidateCatalog::test_real_gvp_docs_passes -v`
Expected: PASS

Also run: `cd /home/guy/code/python/projects/gvp && pytest tests/commands/test_validate.py::TestMappingValidation::test_real_gvp_docs_passes_mapping_check -v`
Expected: PASS — if it fails, update gvp-docs YAML files to satisfy the new traceability rules

**Step 4: Commit gvp-docs changes**

```bash
cd ~/code/git/github.com/shitchell/gvp-docs
git add README.md schema.yaml
git commit -m "docs: slim README, reference gvp utility as framework source of truth"
```

**Step 5: Commit any gvp-docs YAML fixes if needed**

If the real gvp-docs failed validation, fix the YAML files (add missing maps_to references) and commit separately:

```bash
git add *.yaml projects/
git commit -m "fix: add missing traceability mappings to satisfy new validation rules"
```

---

## Task 9: Final verification and cleanup

**Files:**
- No new files

**Step 1: Run full gvp test suite**

Run: `pytest tests/ -v --tb=short`
Expected: ALL PASS

**Step 2: Verify gvp-docs passes validation via CLI**

Run: `python -m gvp --config /dev/null validate --library ~/code/git/github.com/shitchell/gvp-docs/`
Expected: "OK — no errors found"

**Step 3: Review git log**

Run: `git log --oneline -10`
Verify all commits are clean and ordered.

**Step 4: Commit any final adjustments**

If any formatting or minor fixes are needed, commit them.
