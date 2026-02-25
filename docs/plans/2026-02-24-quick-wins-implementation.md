# Quick Wins Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add `considered` field on design choices, `priority` field on all elements, and a "Categorization time check" heuristic to the software-project example.

**Architecture:** Three independent features that touch the model, loader, validator, and renderers. Each is self-contained. TDD throughout — write failing tests first, then implement.

**Tech Stack:** Python 3.11+, pytest, PyYAML

---

### Task 1: Add `priority` field to Element model

**Files:**
- Modify: `src/gvp/model.py:10-23` (Element dataclass)
- Modify: `src/gvp/loader.py:28-37` (ELEMENT_ATTRS) and `src/gvp/loader.py:98-121` (_parse_element)
- Test: `tests/test_model.py`
- Test: `tests/test_loader.py`

**Step 1: Write failing test for Element.priority**

Add to `tests/test_model.py`:

```python
class TestElementPriority:
    def test_priority_defaults_to_none(self):
        doc = Document(
            name="test", filename="test.yaml", path="/fake/test.yaml",
            inherits=[], scope_label=None, id_prefix=None, defaults={}, elements=[],
        )
        elem = Element(
            id="V1", category="value", name="Test", tags=[], maps_to=[],
            origin=[], updated_by={}, fields={}, document=doc,
        )
        assert elem.priority is None

    def test_priority_stores_value(self):
        doc = Document(
            name="test", filename="test.yaml", path="/fake/test.yaml",
            inherits=[], scope_label=None, id_prefix=None, defaults={}, elements=[],
        )
        elem = Element(
            id="V1", category="value", name="Test", tags=[], maps_to=[],
            origin=[], updated_by={}, fields={}, document=doc, priority=3,
        )
        assert elem.priority == 3

    def test_priority_stores_float(self):
        doc = Document(
            name="test", filename="test.yaml", path="/fake/test.yaml",
            inherits=[], scope_label=None, id_prefix=None, defaults={}, elements=[],
        )
        elem = Element(
            id="V1", category="value", name="Test", tags=[], maps_to=[],
            origin=[], updated_by={}, fields={}, document=doc, priority=1.5,
        )
        assert elem.priority == 1.5
```

**Step 2: Run test to verify it fails**

Run: `pytest tests/test_model.py::TestElementPriority -v`
Expected: FAIL — `Element.__init__() got an unexpected keyword argument 'priority'`

**Step 3: Add priority field to Element dataclass**

In `src/gvp/model.py`, add after the `reviewed_by` field:

```python
    priority: float | int | None = None
```

**Step 4: Run test to verify it passes**

Run: `pytest tests/test_model.py::TestElementPriority -v`
Expected: PASS

**Step 5: Write failing test for loader extracting priority**

Add to `tests/test_loader.py`:

```python
class TestPriorityLoading:
    def test_loads_priority_from_yaml(self, tmp_path: Path):
        lib = tmp_path / "lib"
        lib.mkdir()
        (lib / "test.yaml").write_text(
            "meta:\n  name: test\n"
            "values:\n"
            "  - id: V1\n    name: Test\n    statement: Test.\n"
            "    tags: []\n    maps_to: []\n    priority: 3\n"
        )
        docs, _, _ = load_library(lib)
        elem = docs[0].elements[0]
        assert elem.priority == 3

    def test_priority_not_in_fields(self, tmp_path: Path):
        lib = tmp_path / "lib"
        lib.mkdir()
        (lib / "test.yaml").write_text(
            "meta:\n  name: test\n"
            "values:\n"
            "  - id: V1\n    name: Test\n    statement: Test.\n"
            "    tags: []\n    maps_to: []\n    priority: 2\n"
        )
        docs, _, _ = load_library(lib)
        elem = docs[0].elements[0]
        assert "priority" not in elem.fields

    def test_missing_priority_is_none(self, tmp_path: Path):
        lib = tmp_path / "lib"
        lib.mkdir()
        (lib / "test.yaml").write_text(
            "meta:\n  name: test\n"
            "values:\n"
            "  - id: V1\n    name: Test\n    statement: Test.\n"
            "    tags: []\n    maps_to: []\n"
        )
        docs, _, _ = load_library(lib)
        elem = docs[0].elements[0]
        assert elem.priority is None
```

**Step 6: Run test to verify it fails**

Run: `pytest tests/test_loader.py::TestPriorityLoading -v`
Expected: FAIL — priority ends up in `fields` dict, not on the Element attribute

**Step 7: Update loader to extract priority**

In `src/gvp/loader.py`:

1. Add `"priority"` to `ELEMENT_ATTRS` set (line ~29).

2. In `_parse_element` (line ~98), extract priority and pass to Element constructor:

```python
def _parse_element(raw: dict, category: str, doc: Document) -> Element:
    raw = _apply_defaults(raw, doc.defaults)
    elem_id = raw.get("id", "")
    name = raw.get("name", "")
    status = raw.get("status", "active")
    tags = raw.get("tags") or []
    maps_to = raw.get("maps_to") or []
    origin = _normalize_origin(raw.get("origin"))
    updated_by = raw.get("updated_by") or []
    reviewed_by = raw.get("reviewed_by") or []
    priority = raw.get("priority")
    fields = {k: v for k, v in raw.items() if k not in ELEMENT_ATTRS}
    return Element(
        id=elem_id,
        category=category,
        name=name,
        status=status,
        tags=tags,
        maps_to=maps_to,
        origin=origin,
        updated_by=updated_by if isinstance(updated_by, list) else [updated_by],
        reviewed_by=reviewed_by if isinstance(reviewed_by, list) else [reviewed_by],
        priority=priority,
        fields=fields,
        document=doc,
    )
```

**Step 8: Run test to verify it passes**

Run: `pytest tests/test_loader.py::TestPriorityLoading -v`
Expected: PASS

**Step 9: Commit**

```bash
git add src/gvp/model.py src/gvp/loader.py tests/test_model.py tests/test_loader.py
git commit -m "feat: add priority field to Element model and loader"
```

---

### Task 2: Add priority validation

**Files:**
- Modify: `src/gvp/commands/validate.py`
- Test: `tests/commands/test_validate.py`

**Step 1: Write failing tests for priority validation**

Add to `tests/commands/test_validate.py`:

```python
class TestPriorityValidation:
    def test_numeric_priority_passes(self, tmp_path: Path):
        lib = tmp_path / "lib"
        lib.mkdir()
        (lib / "test.yaml").write_text(
            "meta:\n  name: test\n"
            "values:\n"
            "  - id: V1\n    name: V\n    statement: V.\n"
            "    tags: []\n    maps_to: []\n    priority: 3\n"
        )
        cfg = GVPConfig(libraries=[lib])
        catalog = load_catalog(cfg)
        errors, _ = validate_catalog(catalog)
        assert not any("priority" in e for e in errors)

    def test_float_priority_passes(self, tmp_path: Path):
        lib = tmp_path / "lib"
        lib.mkdir()
        (lib / "test.yaml").write_text(
            "meta:\n  name: test\n"
            "values:\n"
            "  - id: V1\n    name: V\n    statement: V.\n"
            "    tags: []\n    maps_to: []\n    priority: 1.5\n"
        )
        cfg = GVPConfig(libraries=[lib])
        catalog = load_catalog(cfg)
        errors, _ = validate_catalog(catalog)
        assert not any("priority" in e for e in errors)

    def test_string_priority_errors(self, tmp_path: Path):
        lib = tmp_path / "lib"
        lib.mkdir()
        (lib / "test.yaml").write_text(
            "meta:\n  name: test\n"
            "values:\n"
            "  - id: V1\n    name: V\n    statement: V.\n"
            "    tags: []\n    maps_to: []\n    priority: high\n"
        )
        cfg = GVPConfig(libraries=[lib])
        catalog = load_catalog(cfg)
        errors, _ = validate_catalog(catalog)
        assert any("priority" in e and "number" in e for e in errors)

    def test_no_priority_no_error(self, tmp_path: Path):
        lib = tmp_path / "lib"
        lib.mkdir()
        (lib / "test.yaml").write_text(
            "meta:\n  name: test\n"
            "values:\n"
            "  - id: V1\n    name: V\n    statement: V.\n"
            "    tags: []\n    maps_to: []\n"
        )
        cfg = GVPConfig(libraries=[lib])
        catalog = load_catalog(cfg)
        errors, _ = validate_catalog(catalog)
        assert not any("priority" in e for e in errors)
```

**Step 2: Run tests to verify they fail**

Run: `pytest tests/commands/test_validate.py::TestPriorityValidation -v`
Expected: `test_string_priority_errors` FAIL — no validation exists yet. Note: the string "high" will be loaded as a string by the loader and stored on `elem.priority` since the loader doesn't validate types. The validator needs to catch it.

**Step 3: Add priority validation to validate_catalog**

In `src/gvp/commands/validate.py`, add a new check inside `validate_catalog()`, after the tag checks and before the ID sequence checks:

```python
    # Check priority type
    for qid, elem in catalog.elements.items():
        if elem.priority is not None and not isinstance(elem.priority, (int, float)):
            errors.append(
                f"{qid}: priority must be a number, got {type(elem.priority).__name__}"
            )
```

**Step 4: Run tests to verify they pass**

Run: `pytest tests/commands/test_validate.py::TestPriorityValidation -v`
Expected: PASS

**Step 5: Commit**

```bash
git add src/gvp/commands/validate.py tests/commands/test_validate.py
git commit -m "feat: validate priority field type"
```

---

### Task 3: Add priority to renderers

**Files:**
- Modify: `src/gvp/renderers/markdown.py:23-37` (_render_element)
- Modify: `src/gvp/renderers/csv.py:11-14` (COLUMNS) and `src/gvp/renderers/csv.py:17-41` (render_csv)
- Modify: `src/gvp/renderers/sqlite.py:11-38` (SCHEMA) and `src/gvp/renderers/sqlite.py:70-86` (element insert)
- Test: `tests/renderers/test_markdown.py`
- Test: `tests/renderers/test_csv.py`
- Test: `tests/renderers/test_sqlite.py`

**Step 1: Write failing tests**

Add to `tests/renderers/test_markdown.py`:

```python
    def test_renders_priority(self, tmp_path: Path):
        lib = tmp_path / "lib"
        lib.mkdir()
        (lib / "test.yaml").write_text(
            "meta:\n  name: test\n"
            "values:\n"
            "  - id: V1\n    name: Important\n    statement: Very important.\n"
            "    tags: []\n    maps_to: []\n    priority: 1\n"
        )
        cfg = GVPConfig(libraries=[lib])
        catalog = load_catalog(cfg)
        output = render_markdown(catalog)
        assert "**Priority:** 1" in output
```

Add to `tests/renderers/test_csv.py`:

```python
    def test_priority_column(self, tmp_path: Path):
        lib = tmp_path / "lib"
        lib.mkdir()
        (lib / "test.yaml").write_text(
            "meta:\n  name: test\n"
            "values:\n"
            "  - id: V1\n    name: V\n    statement: V.\n"
            "    tags: []\n    maps_to: []\n    priority: 2\n"
        )
        cfg = GVPConfig(libraries=[lib])
        catalog = load_catalog(cfg)
        output = render_csv(catalog)
        reader = csv.reader(io.StringIO(output))
        header = next(reader)
        assert "priority" in header
        row = next(reader)
        priority_idx = header.index("priority")
        assert row[priority_idx] == "2"
```

Add to `tests/renderers/test_sqlite.py`:

```python
    def test_priority_column(self, tmp_path: Path):
        lib = tmp_path / "lib"
        lib.mkdir()
        (lib / "test.yaml").write_text(
            "meta:\n  name: test\n"
            "values:\n"
            "  - id: V1\n    name: V\n    statement: V.\n"
            "    tags: []\n    maps_to: []\n    priority: 2\n"
        )
        cfg = GVPConfig(libraries=[lib])
        catalog = load_catalog(cfg)
        db_path = tmp_path / "test.db"
        render_sqlite(catalog, db_path)
        conn = sqlite3.connect(db_path)
        row = conn.execute(
            "SELECT priority FROM elements WHERE qualified_id = 'test:V1'"
        ).fetchone()
        assert row[0] == 2.0
        conn.close()
```

**Step 2: Run tests to verify they fail**

Run: `pytest tests/renderers/test_markdown.py::TestRenderMarkdown::test_renders_priority tests/renderers/test_csv.py::TestRenderCSV::test_priority_column tests/renderers/test_sqlite.py::TestRenderSQLite::test_priority_column -v`
Expected: FAIL

**Step 3: Update markdown renderer**

In `src/gvp/renderers/markdown.py`, in `_render_element`, add after the maps_to block (line ~30) and before the primary field loop:

```python
    if elem.priority is not None:
        lines.append(f"\n**Priority:** {elem.priority}")
```

**Step 4: Update CSV renderer**

In `src/gvp/renderers/csv.py`:

1. Add `"priority"` to `COLUMNS` list (after `"statement"`).

2. In `render_csv`, add priority to each row:

```python
        priority = elem.priority if elem.priority is not None else ""
        writer.writerow([
            qid, elem.id, elem.document.name, elem.category,
            elem.name, elem.status,
            ";".join(elem.tags), ";".join(elem.maps_to),
            statement.strip(), priority,
        ])
```

**Step 5: Update SQLite renderer**

In `src/gvp/renderers/sqlite.py`:

1. Add `priority REAL` to the elements table in SCHEMA:

```sql
CREATE TABLE IF NOT EXISTS elements (
    qualified_id TEXT PRIMARY KEY, id TEXT,
    document TEXT REFERENCES documents(name),
    category TEXT, name TEXT, status TEXT DEFAULT 'active',
    statement TEXT, priority REAL, fields_json TEXT
);
```

2. Update the INSERT statement to include priority:

```python
        conn.execute(
            "INSERT INTO elements VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                qid,
                elem.id,
                elem.document.name,
                elem.category,
                elem.name,
                elem.status,
                statement.strip(),
                float(elem.priority) if elem.priority is not None else None,
                json.dumps(elem.fields),
            ),
        )
```

**Step 6: Run tests to verify they pass**

Run: `pytest tests/renderers/test_markdown.py::TestRenderMarkdown::test_renders_priority tests/renderers/test_csv.py::TestRenderCSV::test_priority_column tests/renderers/test_sqlite.py::TestRenderSQLite::test_priority_column -v`
Expected: PASS

**Step 7: Run full test suite**

Run: `pytest tests/ -v`
Expected: ALL PASS

**Step 8: Commit**

```bash
git add src/gvp/renderers/markdown.py src/gvp/renderers/csv.py src/gvp/renderers/sqlite.py tests/renderers/test_markdown.py tests/renderers/test_csv.py tests/renderers/test_sqlite.py
git commit -m "feat: render priority in markdown, CSV, and SQLite"
```

---

### Task 4: Add `considered` validation

**Files:**
- Modify: `src/gvp/commands/validate.py`
- Test: `tests/commands/test_validate.py`

**Step 1: Write failing tests for considered validation**

Add to `tests/commands/test_validate.py`:

```python
class TestConsideredValidation:
    def test_valid_considered_passes(self, tmp_path: Path):
        lib = _make_lib(
            tmp_path,
            textwrap.dedent("""\
            design_choices:
              - id: D1
                name: Use Python
                rationale: It works.
                tags: []
                maps_to: [root:G1, root:V1]
                considered:
                  go:
                    description: Fast compiled language.
                    rationale: Marginal benefit didn't justify switch.
        """),
        )
        cfg = GVPConfig(libraries=[lib])
        catalog = load_catalog(cfg)
        errors, _ = validate_catalog(catalog)
        assert not any("considered" in e.lower() for e in errors)

    def test_considered_not_dict_errors(self, tmp_path: Path):
        lib = _make_lib(
            tmp_path,
            textwrap.dedent("""\
            design_choices:
              - id: D1
                name: Use Python
                rationale: It works.
                tags: []
                maps_to: [root:G1, root:V1]
                considered: just a string
        """),
        )
        cfg = GVPConfig(libraries=[lib])
        catalog = load_catalog(cfg)
        errors, _ = validate_catalog(catalog)
        assert any("considered" in e.lower() and "dict" in e.lower() for e in errors)

    def test_considered_inner_not_dict_errors(self, tmp_path: Path):
        lib = _make_lib(
            tmp_path,
            textwrap.dedent("""\
            design_choices:
              - id: D1
                name: Use Python
                rationale: It works.
                tags: []
                maps_to: [root:G1, root:V1]
                considered:
                  go: just a string
        """),
        )
        cfg = GVPConfig(libraries=[lib])
        catalog = load_catalog(cfg)
        errors, _ = validate_catalog(catalog)
        assert any("considered" in e.lower() and "go" in e.lower() for e in errors)

    def test_considered_missing_rationale_errors(self, tmp_path: Path):
        lib = _make_lib(
            tmp_path,
            textwrap.dedent("""\
            design_choices:
              - id: D1
                name: Use Python
                rationale: It works.
                tags: []
                maps_to: [root:G1, root:V1]
                considered:
                  go:
                    description: Fast compiled language.
        """),
        )
        cfg = GVPConfig(libraries=[lib])
        catalog = load_catalog(cfg)
        errors, _ = validate_catalog(catalog)
        assert any("rejection rationale" in e.lower() for e in errors)

    def test_no_considered_no_error(self, tmp_path: Path):
        lib = _make_lib(
            tmp_path,
            textwrap.dedent("""\
            design_choices:
              - id: D1
                name: Use Python
                rationale: It works.
                tags: []
                maps_to: [root:G1, root:V1]
        """),
        )
        cfg = GVPConfig(libraries=[lib])
        catalog = load_catalog(cfg)
        errors, _ = validate_catalog(catalog)
        assert not any("considered" in e.lower() for e in errors)

    def test_considered_on_non_design_choice_no_validation(self, tmp_path: Path):
        """considered on other categories is just an extra field, not validated."""
        lib = _make_lib(
            tmp_path,
            textwrap.dedent("""\
            principles:
              - id: P1
                name: Test
                statement: Test.
                tags: []
                maps_to: [root:G1, root:V1]
                considered: not a dict
        """),
        )
        cfg = GVPConfig(libraries=[lib])
        catalog = load_catalog(cfg)
        errors, _ = validate_catalog(catalog)
        assert not any("considered" in e.lower() for e in errors)
```

**Step 2: Run tests to verify they fail**

Run: `pytest tests/commands/test_validate.py::TestConsideredValidation -v`
Expected: Tests that expect errors will FAIL (no validation yet)

**Step 3: Add considered validation to validate_catalog**

In `src/gvp/commands/validate.py`, add a new function and call it from `validate_catalog`:

```python
def _validate_considered(catalog: Catalog) -> list[str]:
    """Validate the considered field schema on design_choice elements."""
    errors: list[str] = []
    for qid, elem in catalog.elements.items():
        if elem.category != "design_choice":
            continue
        considered = elem.fields.get("considered")
        if considered is None:
            continue
        if not isinstance(considered, dict):
            errors.append(
                f"{qid}: considered must be a dict, got {type(considered).__name__}"
            )
            continue
        for alt_name, alt_def in considered.items():
            if not isinstance(alt_def, dict):
                errors.append(
                    f"{qid}: considered alternative '{alt_name}' must be a dict, "
                    f"got {type(alt_def).__name__}"
                )
                continue
            if "rationale" not in alt_def:
                errors.append(
                    f"{qid}: considered alternative '{alt_name}' missing "
                    f"rejection rationale"
                )
    return errors
```

Call it in `validate_catalog()`, after the mapping rules check:

```python
    # Check considered field schema on design_choices
    errors.extend(_validate_considered(catalog))
```

**Step 4: Run tests to verify they pass**

Run: `pytest tests/commands/test_validate.py::TestConsideredValidation -v`
Expected: PASS

**Step 5: Commit**

```bash
git add src/gvp/commands/validate.py tests/commands/test_validate.py
git commit -m "feat: validate considered field schema on design choices"
```

---

### Task 5: Add `considered` to renderers

**Files:**
- Modify: `src/gvp/renderers/markdown.py:23-37`
- Modify: `src/gvp/renderers/csv.py:11-14` and `src/gvp/renderers/csv.py:17-41`
- Modify: `src/gvp/renderers/sqlite.py:11-38` and `src/gvp/renderers/sqlite.py:70-86`
- Test: `tests/renderers/test_markdown.py`
- Test: `tests/renderers/test_csv.py`
- Test: `tests/renderers/test_sqlite.py`

**Step 1: Write failing tests**

Add to `tests/renderers/test_markdown.py`:

```python
    def test_renders_considered_alternatives(self, tmp_path: Path):
        lib = tmp_path / "lib"
        lib.mkdir()
        (lib / "test.yaml").write_text(
            "meta:\n  name: test\n"
            "design_choices:\n"
            "  - id: D1\n    name: Use Python\n"
            "    rationale: It works.\n"
            "    tags: []\n    maps_to: []\n"
            "    considered:\n"
            "      go:\n"
            "        description: Fast compiled language.\n"
            "        rationale: Marginal benefit didn't justify switch.\n"
            "      node:\n"
            "        rationale: Not as strong for CLI tools.\n"
        )
        cfg = GVPConfig(libraries=[lib])
        catalog = load_catalog(cfg)
        output = render_markdown(catalog)
        assert "**Considered alternatives:**" in output
        assert "**Go**" in output
        assert "**Node**" in output
        assert "Marginal benefit" in output
```

Add to `tests/renderers/test_csv.py`:

```python
    def test_considered_column(self, tmp_path: Path):
        lib = tmp_path / "lib"
        lib.mkdir()
        (lib / "test.yaml").write_text(
            "meta:\n  name: test\n"
            "design_choices:\n"
            "  - id: D1\n    name: Use Python\n"
            "    rationale: It works.\n"
            "    tags: []\n    maps_to: []\n"
            "    considered:\n"
            "      go:\n"
            "        rationale: Too complex.\n"
        )
        cfg = GVPConfig(libraries=[lib])
        catalog = load_catalog(cfg)
        output = render_csv(catalog)
        reader = csv.reader(io.StringIO(output))
        header = next(reader)
        assert "considered" in header
        row = next(reader)
        considered_idx = header.index("considered")
        assert "go" in row[considered_idx]
```

Add to `tests/renderers/test_sqlite.py`:

```python
    def test_considered_alternatives_table(self, tmp_path: Path):
        lib = tmp_path / "lib"
        lib.mkdir()
        (lib / "test.yaml").write_text(
            "meta:\n  name: test\n"
            "design_choices:\n"
            "  - id: D1\n    name: Use Python\n"
            "    rationale: It works.\n"
            "    tags: []\n    maps_to: []\n"
            "    considered:\n"
            "      go:\n"
            "        description: Fast compiled.\n"
            "        rationale: Marginal benefit.\n"
        )
        cfg = GVPConfig(libraries=[lib])
        catalog = load_catalog(cfg)
        db_path = tmp_path / "test.db"
        render_sqlite(catalog, db_path)
        conn = sqlite3.connect(db_path)
        rows = conn.execute(
            "SELECT alternative, field, value FROM considered_alternatives "
            "WHERE qualified_id = 'test:D1' ORDER BY alternative, field"
        ).fetchall()
        assert ("go", "description", "Fast compiled.") in rows
        assert ("go", "rationale", "Marginal benefit.") in rows
        conn.close()
```

**Step 2: Run tests to verify they fail**

Run: `pytest tests/renderers/test_markdown.py::TestRenderMarkdown::test_renders_considered_alternatives tests/renderers/test_csv.py::TestRenderCSV::test_considered_column tests/renderers/test_sqlite.py::TestRenderSQLite::test_considered_alternatives_table -v`
Expected: FAIL

**Step 3: Update markdown renderer**

In `src/gvp/renderers/markdown.py`, in `_render_element`, add after the primary field loop (after the `progress` check, near the end):

```python
    considered = elem.fields.get("considered")
    if isinstance(considered, dict) and considered:
        lines.append("\n**Considered alternatives:**")
        for alt_name, alt_def in considered.items():
            if not isinstance(alt_def, dict):
                continue
            display_name = alt_name.replace("_", " ").title()
            desc = alt_def.get("description", "")
            rationale = alt_def.get("rationale", "")
            parts = []
            if desc:
                parts.append(desc.strip())
            if rationale:
                parts.append(f"*Rejected: {rationale.strip()}*")
            line = f"- **{display_name}**"
            if parts:
                line += " — " + " ".join(parts)
            lines.append(line)
```

**Step 4: Update CSV renderer**

In `src/gvp/renderers/csv.py`:

1. Add `import json` at the top.

2. Add `"considered"` to `COLUMNS` (after `"priority"`).

3. In the row writer, add:

```python
        considered = elem.fields.get("considered")
        considered_json = json.dumps(considered) if considered else ""
        writer.writerow([
            qid, elem.id, elem.document.name, elem.category,
            elem.name, elem.status,
            ";".join(elem.tags), ";".join(elem.maps_to),
            statement.strip(), priority, considered_json,
        ])
```

**Step 5: Update SQLite renderer**

In `src/gvp/renderers/sqlite.py`:

1. Add the `considered_alternatives` table to SCHEMA:

```sql
CREATE TABLE IF NOT EXISTS considered_alternatives (
    qualified_id TEXT REFERENCES elements(qualified_id),
    alternative TEXT,
    field TEXT,
    value TEXT,
    PRIMARY KEY (qualified_id, alternative, field)
);
```

2. In the element loop, after inserting mappings, add:

```python
        considered = elem.fields.get("considered")
        if isinstance(considered, dict):
            for alt_name, alt_def in considered.items():
                if not isinstance(alt_def, dict):
                    continue
                for field_name, field_val in alt_def.items():
                    conn.execute(
                        "INSERT INTO considered_alternatives VALUES (?, ?, ?, ?)",
                        (qid, alt_name, field_name, str(field_val)),
                    )
```

**Step 6: Run tests to verify they pass**

Run: `pytest tests/renderers/test_markdown.py::TestRenderMarkdown::test_renders_considered_alternatives tests/renderers/test_csv.py::TestRenderCSV::test_considered_column tests/renderers/test_sqlite.py::TestRenderSQLite::test_considered_alternatives_table -v`
Expected: PASS

**Step 7: Run full test suite**

Run: `pytest tests/ -v`
Expected: ALL PASS

**Step 8: Commit**

```bash
git add src/gvp/renderers/markdown.py src/gvp/renderers/csv.py src/gvp/renderers/sqlite.py tests/renderers/test_markdown.py tests/renderers/test_csv.py tests/renderers/test_sqlite.py
git commit -m "feat: render considered alternatives in markdown, CSV, and SQLite"
```

---

### Task 6: Add `considered` data to v0.yaml

**Files:**
- Modify: `.gvp/library/v0.yaml`

**Step 1: Add considered alternatives to v0:D1**

In `.gvp/library/v0.yaml`, add `considered` to the D1 design choice:

```yaml
design_choices:
  - id: D1
    name: Python 3.11+ with PyYAML and argparse
    rationale: >
      Claude proposed Python during initial planning, and it was not
      identified as a choice until mid-plan. Switching would have required
      reworking the existing plan for marginal benefit. Python is widely
      available, readable, runs everywhere without compilation, and is fast
      enough for a CLI that processes YAML files. PyYAML is the standard YAML
      library. argparse avoids external dependencies for argument parsing.
    tags: [tooling]
    maps_to: [gvp:G2, gvp:G7, gvp:V4, gvp:V5]
    considered:
      go:
        description: >
          Guy generally prefers compiled languages for AI-assisted development
          (easier toolchain). Would have been his first choice if starting fresh.
        rationale: >
          Marginal benefit didn't justify reworking the mid-plan.
      node:
        description: >
          Many projects at work use it, so it would have broad familiarity.
        rationale: >
          Not as strong for CLI tools.
      rust:
        description: >
          Considered but not seriously evaluated for this project.
        rationale: >
          No compelling advantage over Python for a YAML-processing CLI.
      ruby:
        description: >
          Considered but not seriously evaluated for this project.
        rationale: >
          No compelling advantage over Python for a YAML-processing CLI.
      perl:
        description: >
          Considered but not seriously evaluated for this project.
        rationale: >
          No compelling advantage over Python for a YAML-processing CLI.
```

**Step 2: Run validation**

Run: `python -m gvp validate`
Expected: PASS (no errors from considered validation)

**Step 3: Commit**

```bash
git add .gvp/library/v0.yaml
git commit -m "feat: add considered alternatives to v0:D1"
```

---

### Task 7: Add UH2 heuristic to software-project example

**Files:**
- Modify: `examples/software-project/universal.yaml`

**Step 1: Add UH2 to universal.yaml**

In `examples/software-project/universal.yaml`, add after the existing UH1 in the `heuristics` section:

```yaml
  - id: UH2
    name: Categorization time check
    statement: >
      If you are spending more time deciding what category something belongs in
      than documenting the thing itself, pick the closest category and move on.
      Tags can capture the nuance.
    tags: [alignment, usability]
    maps_to: [universal:UV3, universal:UG2]
```

**Step 2: Run validation against example library**

Run: `python -m gvp validate --library examples/software-project`
Expected: PASS

**Step 3: Commit**

```bash
git add examples/software-project/universal.yaml
git commit -m "feat: add UH2 Categorization time check heuristic"
```

---

### Task 8: Update schema docs

**Files:**
- Modify: `docs/reference/schema.md`

**Step 1: Update schema docs**

Add `priority` to the Common Fields table (after `status`):

```markdown
| `priority` | number | No | Numeric priority. Validated as int or float when present. |
```

Add a new section after "Category-Specific Fields" for `considered`:

```markdown
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
```

**Step 2: Commit**

```bash
git add docs/reference/schema.md
git commit -m "docs: document considered and priority fields in schema reference"
```

---

### Task 9: Run full validation and integration check

**Step 1: Run full test suite**

Run: `pytest tests/ -v`
Expected: ALL PASS

**Step 2: Run validation against all libraries**

Run: `python -m gvp validate && python -m gvp validate --library examples/software-project && python -m gvp validate --library examples/small-business`
Expected: All pass

**Step 3: Regenerate rendered output to verify**

Run: `python -m gvp render markdown -o generated && python -m gvp render csv -o generated && python -m gvp render sqlite -o generated/gvp.db`
Expected: Generated files include priority and considered data

**Step 4: Final commit (if any fixups needed)**

Only if prior tasks needed adjustments.
