# Examples & Doc Cleanup — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add two self-contained example libraries, migrate all integration tests to use the bundled example, and do a final doc cleanup pass across both repos.

**Architecture:** Create `examples/software-project/` (4-level chain, tags, provenance, all category types) and `examples/small-business/` (2-level, no tags, minimal). Switch `tests/conftest.py` and all test assertions from gvp-docs to the software-project example. Then update README, GLOSSARY, gvp-docs ROADMAP/README for alignment and coherency.

**Tech Stack:** Python 3.11+, PyYAML, pytest. No new dependencies.

---

## Task 1: Create software-project example library

**Files:**
- Create: `examples/software-project/tags.yaml`
- Create: `examples/software-project/universal.yaml`
- Create: `examples/software-project/personal.yaml`
- Create: `examples/software-project/projects/taskflow.yaml`
- Create: `examples/software-project/projects/taskflow/v1.yaml`

**Step 1: Create `tags.yaml`**

```yaml
# examples/software-project/tags.yaml
domains:
  code:
    description: Software development decisions
  systems:
    description: Infrastructure and architecture decisions
  ux:
    description: User-facing interface decisions

concerns:
  maintainability:
    description: Reducing future cost of change
  reliability:
    description: System behaves correctly under expected conditions
  usability:
    description: Reducing friction and cognitive load
```

**Step 2: Create `universal.yaml`**

```yaml
# examples/software-project/universal.yaml
meta:
  name: universal
  scope: universal
  id_prefix: U

values:
  - id: UV1
    name: User Trust
    statement: Users should be able to trust the system with their data.
    tags: [reliability]
    maps_to: []

rules:
  - id: UR1
    name: No Silent Data Loss
    statement: Never discard user data without explicit confirmation.
    tags: [reliability]
    maps_to: [universal:UV1]
    origin:
      - date: "2026-01-15"
        note: "Organizational standard"
```

**Step 3: Create `personal.yaml`**

```yaml
# examples/software-project/personal.yaml
meta:
  name: personal
  scope: personal
  inherits: universal

values:
  - id: V1
    name: Simplicity
    statement: Prefer the simplest approach that meets the requirement.
    tags: [maintainability]
    maps_to: []
  - id: V2
    name: Transparency
    statement: Make system state and decisions visible to the user.
    tags: [usability]
    maps_to: []
  - id: V3
    name: Composability
    statement: Build small, focused pieces that combine naturally.
    tags: [maintainability, code]
    maps_to: []

principles:
  - id: P1
    name: Fail Loudly
    statement: When something goes wrong, surface the error immediately rather than hiding it.
    tags: [reliability, code]
    maps_to: [universal:UV1, personal:V2]
  - id: P2
    name: Minimize Coupling
    statement: Components should depend on interfaces, not implementations.
    tags: [maintainability, code]
    maps_to: [universal:UV1, personal:V1]

heuristics:
  - id: H1
    name: Error Handling Decision
    statement: "If the caller can recover: return an error. If not: raise an exception. If ambiguous: raise."
    tags: [code, reliability]
    maps_to: [personal:P1]

rules:
  - id: R1
    name: Tests Before Merge
    statement: No code merges to main without passing tests.
    tags: [reliability, code]
    maps_to: [universal:UV1, personal:V1]
    updated_by:
      - date: "2026-02-10"
        rationale: "Expanded from 'tests required' to explicitly cover merge policy"
```

**Step 4: Create `projects/taskflow.yaml`**

```yaml
# examples/software-project/projects/taskflow.yaml
meta:
  name: taskflow
  scope: project
  inherits: personal

goals:
  - id: G1
    name: Manage tasks from the command line
    statement: Users can create, list, update, and complete tasks without leaving the terminal.
    tags: [cli, usability]
    maps_to: []
  - id: G2
    name: Reliable task storage
    statement: Task data is never lost or corrupted during normal operation.
    tags: [reliability]
    maps_to: []

milestones:
  - id: M1
    name: MVP shipped
    progress: complete
    maps_to: [taskflow:G1, taskflow:G2, personal:V1]
    description: Basic add/list/complete workflow with file storage.
    reviewed_by:
      - date: "2026-02-18"
        by: developer
        note: "Confirmed complete after v0.1 release"

constraints:
  - id: CON1
    name: Single-user only
    impact: No need for locking or concurrent access patterns.
    tags: []
    maps_to: []
```

**Step 5: Create `projects/taskflow/v1.yaml`**

```yaml
# examples/software-project/projects/taskflow/v1.yaml
meta:
  name: taskflow-v1
  scope: implementation
  inherits: taskflow

design_choices:
  - id: D1
    name: JSON file storage
    rationale: Simplest approach for single-user CLI. No external dependencies.
    tags: [code]
    maps_to: [taskflow:G2, personal:V1]
  - id: D2
    name: Click for CLI framework
    rationale: Well-documented, composable, handles argument parsing cleanly.
    tags: [code, cli]
    maps_to: [taskflow:G1, personal:V3]

implementation_rules:
  - id: IR1
    name: Atomic file writes
    statement: Always write to a temp file and rename, never write in place.
    tags: [reliability, code]
    maps_to: [taskflow-v1:D1, taskflow:G2, universal:UV1]
```

**Step 6: Validate the example**

Run: `python -m gvp --config /dev/null validate --library examples/software-project/`

Expected: `OK — no errors found` (warnings for W005 insular mappings are acceptable)

**Step 7: Commit**

```bash
git add examples/software-project/
git commit -m "feat: add software-project example library with 4-level chain"
```

---

## Task 2: Create small-business example library

**Files:**
- Create: `examples/small-business/business.yaml`
- Create: `examples/small-business/projects/new-location.yaml`

**Step 1: Create `business.yaml`**

```yaml
# examples/small-business/business.yaml
meta:
  name: business
  scope: business

values:
  - id: V1
    name: Customer Experience
    statement: Every interaction should leave the customer feeling valued.
    maps_to: []
  - id: V2
    name: Consistency
    statement: The same order should taste the same every time, at every location.
    maps_to: []

principles:
  - id: P1
    name: Mise en Place
    statement: Prepare everything before service begins. Rushed prep leads to mistakes.
    maps_to: [business:V1, business:V2]
  - id: P2
    name: Train Before Trust
    statement: No one works unsupervised until they've demonstrated competence.
    maps_to: [business:V1, business:V2]

rules:
  - id: R1
    name: Health Code Compliance
    statement: All food safety regulations are followed without exception.
    maps_to: [business:V1, business:V2]
```

**Step 2: Create `projects/new-location.yaml`**

```yaml
# examples/small-business/projects/new-location.yaml
meta:
  name: new-location
  scope: project
  inherits: business

goals:
  - id: G1
    name: Open second location
    statement: A fully operational second location serving the same menu to the same standard.
    maps_to: []

milestones:
  - id: M1
    name: Location secured
    progress: complete
    maps_to: [new-location:G1, business:V1]
    description: Lease signed, permits filed.

constraints:
  - id: CON1
    name: Budget cap
    impact: Total buildout must stay under $150k.
    maps_to: []

design_choices:
  - id: D1
    name: Replicate flagship menu
    rationale: Reduces training time and ensures consistency across locations.
    maps_to: [new-location:G1, business:V2]
```

**Step 3: Validate the example**

Run: `python -m gvp --config /dev/null validate --library examples/small-business/`

Expected: `OK — no errors found`

**Step 4: Commit**

```bash
git add examples/small-business/
git commit -m "feat: add small-business example library with 2-level chain"
```

---

## Task 3: Migrate tests to use example library

**Files:**
- Modify: `tests/conftest.py`
- Modify: `tests/test_integration.py`
- Modify: `tests/test_cli.py`
- Modify: `tests/test_loader.py`
- Modify: `tests/commands/test_query.py`
- Modify: `tests/commands/test_trace.py`
- Modify: `tests/commands/test_validate.py`
- Modify: `tests/renderers/test_csv.py`
- Modify: `tests/renderers/test_dot.py`
- Modify: `tests/renderers/test_markdown.py`
- Modify: `tests/renderers/test_sqlite.py`

This is a large task. The key changes are:

### Step 1: Update `tests/conftest.py`

```python
"""Shared fixtures for gvp tests."""

from pathlib import Path

import pytest


# Resolve relative to this file's location -> project root -> examples/
_PROJECT_ROOT = Path(__file__).resolve().parent.parent
EXAMPLE_LIBRARY = _PROJECT_ROOT / "examples" / "software-project"


@pytest.fixture
def gvp_docs_library() -> Path:
    """Path to the bundled example library for integration tests."""
    assert EXAMPLE_LIBRARY.exists(), f"Example library not found at {EXAMPLE_LIBRARY}"
    return EXAMPLE_LIBRARY


@pytest.fixture
def tmp_library(tmp_path: Path) -> Path:
    """Create a minimal temporary library for unit tests."""
    lib = tmp_path / "test-library"
    lib.mkdir()

    tags = lib / "tags.yaml"
    tags.write_text(
        "domains:\n"
        "  code:\n"
        "    description: Software development\n"
        "concerns:\n"
        "  maintainability:\n"
        "    description: Reducing future cost of change\n"
    )

    doc = lib / "test.yaml"
    doc.write_text(
        "meta:\n"
        "  name: test\n"
        "  scope: test\n"
        "\n"
        "values:\n"
        "  - id: V1\n"
        "    name: Test Value\n"
        "    statement: A test value.\n"
        "    tags: [code]\n"
        "    maps_to: []\n"
        "\n"
        "principles:\n"
        "  - id: P1\n"
        "    name: Test Principle\n"
        "    statement: A test principle.\n"
        "    tags: [maintainability]\n"
        "    maps_to: [test:V1]\n"
    )

    return lib
```

### Step 2: Update `tests/test_cli.py`

Replace `GVP_DOCS` constant. Update assertions to match example data.

The software-project example has:
- 4 documents: universal, personal, taskflow, taskflow-v1
- Elements with tags: code, systems, ux, maintainability, reliability, usability
- Element IDs: UV1, UR1, V1-V3, P1-P2, H1, R1, G1-G2, M1, CON1, D1-D2, IR1
- 16 total elements

```python
"""Integration tests for the gvp CLI."""

import subprocess
from pathlib import Path

import pytest


_PROJECT_ROOT = Path(__file__).resolve().parent.parent
EXAMPLE_LIB = str(_PROJECT_ROOT / "examples" / "software-project")


class TestCLI:
    def test_version(self):
        result = subprocess.run(
            ["python", "-m", "gvp", "--version"],
            capture_output=True, text=True,
        )
        assert result.returncode == 0
        assert "0.1.0" in result.stdout

    def test_validate(self):
        result = subprocess.run(
            ["python", "-m", "gvp", "--config", "/dev/null",
             "validate", "--library", EXAMPLE_LIB],
            capture_output=True, text=True,
        )
        assert result.returncode == 0

    def test_query_by_tag(self):
        result = subprocess.run(
            ["python", "-m", "gvp", "--config", "/dev/null",
             "query", "--library", EXAMPLE_LIB, "--tag", "code"],
            capture_output=True, text=True,
        )
        assert result.returncode == 0
        assert "P1" in result.stdout or "H1" in result.stdout

    def test_trace(self):
        result = subprocess.run(
            ["python", "-m", "gvp", "--config", "/dev/null",
             "trace", "--library", EXAMPLE_LIB, "personal:H1"],
            capture_output=True, text=True,
        )
        assert result.returncode == 0
        assert "H1" in result.stdout

    def test_render_markdown(self):
        result = subprocess.run(
            ["python", "-m", "gvp", "--config", "/dev/null",
             "render", "--library", EXAMPLE_LIB, "--format", "markdown",
             "--stdout"],
            capture_output=True, text=True,
        )
        assert result.returncode == 0
        assert "Simplicity" in result.stdout

    def test_review_list(self):
        result = subprocess.run(
            ["python", "-m", "gvp", "--config", "/dev/null",
             "review", "--library", EXAMPLE_LIB],
            capture_output=True, text=True,
        )
        assert result.returncode == 0
```

### Step 3: Update `tests/test_integration.py`

```python
"""Full integration tests using the bundled example library."""

import sqlite3
from pathlib import Path

from gvp.config import GVPConfig
from gvp.loader import load_catalog
from gvp.commands.validate import validate_catalog
from gvp.commands.query import query_catalog
from gvp.commands.trace import trace_element, format_trace_tree
from gvp.renderers.markdown import render_markdown
from gvp.renderers.csv import render_csv
from gvp.renderers.dot import render_dot
from gvp.renderers.sqlite import render_sqlite


class TestFullPipeline:
    def test_load_validate_query_trace_render(
        self, gvp_docs_library: Path, tmp_path: Path
    ):
        # Load
        cfg = GVPConfig(libraries=[gvp_docs_library])
        catalog = load_catalog(cfg)
        assert len(catalog.documents) == 4
        assert len(catalog.elements) >= 16

        # Validate
        errors, warnings = validate_catalog(catalog)
        assert errors == [], f"Validation errors: {errors}"

        # Query
        code_elements = query_catalog(catalog, tags=["code"])
        assert len(code_elements) > 0

        # Trace
        h1 = catalog.elements["personal:H1"]
        tree = trace_element(catalog, h1, reverse=False)
        text = format_trace_tree(tree, fmt="text")
        assert "personal:H1" in text
        json_out = format_trace_tree(tree, fmt="json")
        assert "personal:H1" in json_out

        # Render markdown
        md = render_markdown(catalog)
        assert "Simplicity" in md

        # Render CSV
        csv_out = render_csv(catalog)
        assert "personal:V1" in csv_out

        # Render DOT
        dot_out = render_dot(catalog)
        assert "digraph" in dot_out

        # Render SQLite
        db_path = tmp_path / "test.db"
        render_sqlite(catalog, db_path)
        assert db_path.exists()

        conn = sqlite3.connect(db_path)
        count = conn.execute("SELECT COUNT(*) FROM elements").fetchone()[0]
        assert count >= 16
        conn.close()

    def test_chain_spans_all_levels(self, gvp_docs_library: Path):
        cfg = GVPConfig(libraries=[gvp_docs_library])
        catalog = load_catalog(cfg)
        v1 = catalog.documents["taskflow-v1"]
        chain = catalog.resolve_chain(v1)
        names = [d.name for d in chain]
        assert names == ["taskflow-v1", "taskflow", "personal", "universal"]

    def test_cross_scope_maps_to_resolves(self, gvp_docs_library: Path):
        cfg = GVPConfig(libraries=[gvp_docs_library])
        catalog = load_catalog(cfg)
        d1 = catalog.elements["taskflow-v1:D1"]
        ancestors = catalog.ancestors(d1)
        ancestor_ids = {str(a) for a in ancestors}
        # D1 maps to taskflow:G2 and personal:V1
        assert "taskflow:G2" in ancestor_ids
        assert "personal:V1" in ancestor_ids
```

### Step 4: Update `tests/test_loader.py`

The `TestLoadCatalog` class tests (lines 90-119) need updated assertions:

```python
class TestLoadCatalog:
    def test_loads_example_library(self, gvp_docs_library: Path):
        cfg = GVPConfig(libraries=[gvp_docs_library])
        catalog = load_catalog(cfg)
        assert "personal" in catalog.documents
        assert "universal" in catalog.documents
        assert "taskflow" in catalog.documents
        assert "taskflow-v1" in catalog.documents

    def test_qualified_ids_indexed(self, gvp_docs_library: Path):
        cfg = GVPConfig(libraries=[gvp_docs_library])
        catalog = load_catalog(cfg)
        assert "personal:V1" in catalog.elements
        assert "personal:P1" in catalog.elements
        assert "taskflow:G1" in catalog.elements
        assert "taskflow-v1:D1" in catalog.elements

    def test_chain_resolution(self, gvp_docs_library: Path):
        cfg = GVPConfig(libraries=[gvp_docs_library])
        catalog = load_catalog(cfg)
        v1 = catalog.documents["taskflow-v1"]
        chain = catalog.resolve_chain(v1)
        names = [d.name for d in chain]
        assert names == ["taskflow-v1", "taskflow", "personal", "universal"]

    def test_tags_loaded(self, gvp_docs_library: Path):
        cfg = GVPConfig(libraries=[gvp_docs_library])
        catalog = load_catalog(cfg)
        assert "code" in catalog.tags
        assert "maintainability" in catalog.tags
```

### Step 5: Update `tests/commands/test_query.py`

Most tests use generic assertions (e.g., `len(results) > 0`, `all(e.category == ...)`). These should work as-is with the new example data since it has code-tagged elements, heuristics, personal documents, etc.

Update only the specific element references:
- `document="personal"` — works as-is
- `tags=["code"]` — works (example has code-tagged elements)
- `categories=["heuristic"]` — works (example has H1)

No changes needed if assertions are generic. Verify by running tests.

### Step 6: Update `tests/commands/test_trace.py`

Replace `personal:H5` and `personal:P5` references with example equivalents:

```python
class TestTraceElement:
    def test_trace_ancestors(self, gvp_docs_library: Path):
        cfg = GVPConfig(libraries=[gvp_docs_library])
        catalog = load_catalog(cfg)
        h1 = catalog.elements["personal:H1"]
        tree = trace_element(catalog, h1, reverse=False)
        child_ids = {str(node["element"]) for node in tree["children"]}
        assert "personal:P1" in child_ids

    def test_trace_descendants(self, gvp_docs_library: Path):
        cfg = GVPConfig(libraries=[gvp_docs_library])
        catalog = load_catalog(cfg)
        v1 = catalog.elements["personal:V1"]
        tree = trace_element(catalog, v1, reverse=True)
        child_ids = {str(node["element"]) for node in tree["children"]}
        assert len(child_ids) > 0

    def test_trace_handles_dag(self, gvp_docs_library: Path):
        cfg = GVPConfig(libraries=[gvp_docs_library])
        catalog = load_catalog(cfg)
        h1 = catalog.elements["personal:H1"]
        tree = trace_element(catalog, h1, reverse=False)
        assert tree is not None


class TestFormatTraceTree:
    def test_text_output(self, gvp_docs_library: Path):
        cfg = GVPConfig(libraries=[gvp_docs_library])
        catalog = load_catalog(cfg)
        h1 = catalog.elements["personal:H1"]
        tree = trace_element(catalog, h1, reverse=False)
        text = format_trace_tree(tree, fmt="text")
        assert "personal:H1" in text
        assert "personal:P1" in text

    def test_json_output(self, gvp_docs_library: Path):
        import json
        cfg = GVPConfig(libraries=[gvp_docs_library])
        catalog = load_catalog(cfg)
        h1 = catalog.elements["personal:H1"]
        tree = trace_element(catalog, h1, reverse=False)
        output = format_trace_tree(tree, fmt="json")
        parsed = json.loads(output)
        assert "element" in parsed
        assert "children" in parsed
```

### Step 7: Update `tests/commands/test_validate.py`

The `test_real_gvp_docs_passes` and `test_real_gvp_docs_passes_mapping_check` tests just need their names updated — the assertions are generic ("no errors"). Rename for clarity but logic stays the same.

### Step 8: Update renderer tests

The renderer tests (`test_csv.py`, `test_dot.py`, `test_markdown.py`, `test_sqlite.py`) use generic assertions that should work with the new data. The only specific value references are:

- `test_markdown.py`: no specific element names in assertions (just checks doc count and ID presence)
- `test_csv.py`: checks for CSV header and element count
- `test_dot.py`: checks for `digraph`, nodes, edges
- `test_sqlite.py`: checks for table existence and row counts

Verify by running tests. Only update assertions if element counts differ (change `> 30` to `>= 16`).

### Step 9: Run full test suite

Run: `pytest tests/ -v --tb=short`

All 142 tests should pass with the new example data.

### Step 10: Commit

```bash
git add tests/
git commit -m "refactor: migrate all tests from gvp-docs to bundled example library"
```

---

## Task 4: Update gvp utility docs

**Files:**
- Modify: `README.md`
- Modify: `GLOSSARY.md`

### Step 1: Update README.md

Add an "Examples" section after "Quick Start" and before "Subcommands":

```markdown
## Examples

Two bundled example libraries demonstrate GVP in different domains:

### Software Project

A 4-level chain for a fictional CLI task manager ("taskflow"):

```
examples/software-project/
├── tags.yaml              # domain + concern tag registry
├── universal.yaml         # org-wide values and rules
├── personal.yaml          # cross-project principles, heuristics
└── projects/
    ├── taskflow.yaml      # project goals, milestones, constraints
    └── taskflow/
        └── v1.yaml        # implementation design choices, rules
```

```bash
gvp validate --library examples/software-project/
gvp trace --library examples/software-project/ personal:H1
gvp render --library examples/software-project/ --format markdown --stdout
```

### Small Business

A 2-level chain for a fictional coffee shop ("Sunrise Coffee"):

```
examples/small-business/
├── business.yaml          # core values, principles, rules
└── projects/
    └── new-location.yaml  # project goals, milestones, design choices
```

```bash
gvp validate --library examples/small-business/
gvp query --library examples/small-business/ --category principle
```
```

Also update "Quick Start" examples to use `examples/software-project/` instead of `~/my-gvp-docs/`.

Add `review` subcommand documentation after `edit`:

```markdown
### review

Review elements for staleness after upstream changes.

```bash
gvp review --library path/                    # list stale elements
gvp review --library path/ personal:P3        # interactive review
```
```

Update the edit subcommand docs to mention the three modes:

```markdown
### edit

Modify an existing element. Three input modes: CLI flags, interactive prompts, or editor.

```bash
gvp edit personal:P3 --library path/ --status deprecated --rationale "Superseded"
gvp edit personal:P3 --library path/ --interactive
gvp edit personal:P3 --library path/                    # opens in $EDITOR
gvp edit personal:P3 --library path/ --no-provenance    # skip updated_by
```
```

Add `--no-provenance` to the Global Options table (or note it under add/edit).

### Step 2: Update GLOSSARY.md

Add `reviewed_by` to the Technical Terms table:

```markdown
| **reviewed_by** | A list of review acknowledgment entries on an element, recording when it was last confirmed as still accurate. Used by W006 staleness detection. |
```

### Step 3: Commit

```bash
git add README.md GLOSSARY.md
git commit -m "docs: add examples section, review/edit docs, reviewed_by glossary entry"
```

---

## Task 5: Update gvp-docs ROADMAP and README

**Files:**
- Modify: `~/code/git/github.com/shitchell/gvp-docs/ROADMAP.md`
- Modify: `~/code/git/github.com/shitchell/gvp-docs/README.md`

### Step 1: Update ROADMAP.md

Change status of completed items:

- **Chain Review Validation**: Change status from "Planned" to "Done — implemented as W006 staleness warning in `gvp validate`. Elements with `reviewed_by` dates older than ancestor `updated_by` dates trigger a warning."
- **Investigate TASV-Playwright GVP Document**: Change status from "Planned" to "Done — framework content migrated to gvp utility README and GLOSSARY. Category-specific traceability rules implemented in `gvp validate`. Delineation tests added to README categories table."

### Step 2: Update README.md

The gvp-docs README is already fairly personal-store oriented. Minor updates:

- Remove the GitHub link `https://github.com/shitchell/gvp` (repo may not be public) and replace with a relative reference or just mention "the `gvp` utility"
- Ensure the "Usage" section says something like "Install the `gvp` utility from the gvp repo for rendering, validation, and querying."

### Step 3: Commit

```bash
cd ~/code/git/github.com/shitchell/gvp-docs
git add ROADMAP.md README.md
git commit -m "docs: mark TASV investigation and chain review as done, update README references"
```

---

## Task 6: Alignment and coherency passes

**Files:**
- Potentially modify: any doc in either repo

### Step 1: Alignment pass

Read through all documentation across both repos end-to-end. Check:

1. **gvp README** categories table vs **GLOSSARY** definitions vs **schema.yaml** field definitions — do they agree on what each category is?
2. **gvp README** traceability table vs **validate.py** `_MAPPING_RULES` — do the documented rules match the code?
3. **gvp README** scope/inheritance description vs **loader.py** discovery logic — does the doc match behavior?
4. **gvp GLOSSARY** "Provenance" definition — does it now mention `reviewed_by`?
5. **gvp-docs schema.yaml** field definitions vs **gvp model.py** Element dataclass — are all fields accounted for?
6. **gvp-docs README** workflow section — does it reference current features (review command, edit modes)?

Fix any inconsistencies found.

### Step 2: Coherency pass

Read each document individually:

1. **gvp README** — does it read well for someone who's never seen GVP? No jargon without explanation? No dead links?
2. **gvp GLOSSARY** — is every term used in the README defined here? Any terms defined but never used?
3. **gvp-docs README** — does it make sense as a personal store guide? No references to being a public example?
4. **gvp-docs ROADMAP** — are all items clearly marked with current status? Any contradictions?
5. **Example libraries** — do the YAML comments and element names make sense to a newcomer?

Fix any issues found.

### Step 3: Commit fixes

```bash
# gvp repo
git add -A
git commit -m "docs: alignment and coherency fixes across README, GLOSSARY, examples"

# gvp-docs repo (if changes)
cd ~/code/git/github.com/shitchell/gvp-docs
git add -A
git commit -m "docs: alignment and coherency fixes"
```

---

## What's Next

After executing this plan, all 6 phases from the original roadmap are complete:

| Phase | Description | Status |
|-------|-------------|--------|
| 0 | Glossary codified in gvp | Done |
| 1 | TASV review + alignment check | Done |
| 2 | Update gvp (validation rules, traceability) | Done |
| 3 | Update gvp-docs alignment | Done |
| 4 | Example library + gvp-docs → private | **Done (this plan)** |
| 5 | Review command + timestamps | Done |
| 6 | Review all docs and finalize | **Done (this plan)** |

**End goal achieved:** `gvp` as source of truth for the framework, `gvp-docs` as personal store.

Make gvp-docs repo private on GitHub when ready.
