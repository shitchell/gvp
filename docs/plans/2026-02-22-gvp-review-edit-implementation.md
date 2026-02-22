# GVP Review & Edit Enhancements — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add `review` command with change-acknowledgment friction, enhance `edit` with 3 input modes, auto-provenance on edit/add, `reviewed_by` field, and W006 staleness warning.

**Architecture:** New `reviewed_by: list[dict]` field on Element. `review` command in `commands/review.py`. Edit enhancements in existing `commands/edit.py`. W006 in existing `commands/validate.py`. CLI wiring in `__main__.py`.

**Tech Stack:** Python 3.11+, PyYAML, argparse. No new dependencies.

**Test data:** Real gvp-docs at `/home/guy/code/git/github.com/shitchell/gvp-docs/`. Synthetic YAML fixtures via `_make_lib()` helper in tests.

---

## Task 1: Add `reviewed_by` to data model and loader

**Files:**
- Modify: `src/gvp/model.py`
- Modify: `src/gvp/loader.py`
- Modify: `tests/test_model.py`

**Step 1: Write failing test**

Add to `tests/test_model.py`:

```python
class TestElementReviewedBy:
    def test_reviewed_by_defaults_to_empty(self):
        doc = Document(
            name="test", filename="test.yaml",
            path="/fake/test.yaml", inherits=None,
            scope_label="test", id_prefix=None,
            defaults={}, elements=[],
        )
        elem = Element(
            id="P1", category="principle", name="Test",
            tags=[], maps_to=[], origin=[], updated_by={},
            fields={"statement": "Test."},
            document=doc,
        )
        assert elem.reviewed_by == []

    def test_reviewed_by_stores_entries(self):
        doc = Document(
            name="test", filename="test.yaml",
            path="/fake/test.yaml", inherits=None,
            scope_label="test", id_prefix=None,
            defaults={}, elements=[],
        )
        entry = {"date": "2026-02-22", "by": "guy", "note": "Looks good"}
        elem = Element(
            id="P1", category="principle", name="Test",
            tags=[], maps_to=[], origin=[], updated_by={},
            fields={"statement": "Test."},
            document=doc, reviewed_by=[entry],
        )
        assert len(elem.reviewed_by) == 1
        assert elem.reviewed_by[0]["by"] == "guy"
```

**Step 2: Run test, verify fail**

Run: `pytest tests/test_model.py::TestElementReviewedBy -v`

**Step 3: Add `reviewed_by` to Element dataclass**

In `src/gvp/model.py`, add field after `status`:

```python
    reviewed_by: list[dict] = field(default_factory=list)
```

**Step 4: Update loader**

In `src/gvp/loader.py`:
- Add `"reviewed_by"` to `ELEMENT_ATTRS` set (line 28)
- In `_parse_element()`, add after the `updated_by` line:
```python
    reviewed_by = raw.get("reviewed_by") or []
```
- Pass `reviewed_by=reviewed_by if isinstance(reviewed_by, list) else [reviewed_by]` to `Element()`

**Step 5: Run tests, verify pass**

Run: `pytest tests/ -v --tb=short`

**Step 6: Commit**

```bash
git add src/gvp/model.py src/gvp/loader.py tests/test_model.py
git commit -m "feat: add reviewed_by field to Element data model and loader"
```

---

## Task 2: W006 staleness warning

**Files:**
- Modify: `src/gvp/commands/validate.py`
- Modify: `tests/commands/test_validate.py`

**Step 1: Write failing tests**

Add to `tests/commands/test_validate.py`:

```python
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
```

**Step 2: Run tests, verify fail**

**Step 3: Implement `_validate_staleness()`**

Add to `src/gvp/commands/validate.py`:

```python
def _latest_date(entries: list[dict], date_key: str = "date") -> str | None:
    """Get the most recent date string from a list of dicts."""
    dates = [e.get(date_key, "") for e in entries if isinstance(e, dict) and e.get(date_key)]
    return max(dates) if dates else None


def _validate_staleness(catalog: Catalog) -> list[str]:
    """W006: element's reviewed_by is older than an ancestor's updated_by."""
    warnings: list[str] = []

    for qid, elem in catalog.elements.items():
        if elem.status in ("deprecated", "rejected"):
            continue

        # Get ancestors via maps_to graph
        ancestors = catalog.ancestors(elem)
        if not ancestors:
            continue

        # Find latest updated_by date across all ancestors
        latest_ancestor_update = None
        stale_ancestor_qid = None
        for ancestor in ancestors:
            ancestor_date = _latest_date(ancestor.updated_by)
            if ancestor_date and (latest_ancestor_update is None or ancestor_date > latest_ancestor_update):
                latest_ancestor_update = ancestor_date
                stale_ancestor_qid = str(ancestor)

        if latest_ancestor_update is None:
            continue  # no ancestors have been updated

        # Compare against element's latest reviewed_by date
        latest_review = _latest_date(elem.reviewed_by)
        if latest_review is None or latest_review < latest_ancestor_update:
            warnings.append(
                f"W006: {qid} may need review — ancestor {stale_ancestor_qid} "
                f"was updated on {latest_ancestor_update}"
            )

    return warnings
```

Wire into `validate_catalog()` after `_validate_semantic`:

```python
    # Check staleness
    warnings.extend(_validate_staleness(catalog))
```

**Step 4: Run tests, verify pass**

Run: `pytest tests/ -v --tb=short`

**Step 5: Commit**

```bash
git add src/gvp/commands/validate.py tests/commands/test_validate.py
git commit -m "feat: W006 staleness warning for reviewed_by vs updated_by"
```

---

## Task 3: Edit command — interactive and editor modes

**Files:**
- Modify: `src/gvp/commands/edit.py`
- Modify: `tests/commands/test_edit.py`

**Step 1: Write failing tests**

Add to `tests/commands/test_edit.py`:

```python
class TestEditNoProvenance:
    def test_no_provenance_skips_updated_by(self, tmp_path: Path):
        # Create a lib with one principle, call edit_element_inline with no_provenance=True
        # Assert updated_by was NOT appended
        ...  # use same pattern as existing test_edit_updates_fields

class TestEditInteractive:
    def test_edit_interactive_updates_field(self, tmp_path: Path, monkeypatch):
        # Monkeypatch builtins.input to return field choices and rationale
        # Call edit_element_interactive, verify field was updated
        ...

class TestEditViaEditor:
    def test_edit_via_editor_applies_changes(self, tmp_path: Path, monkeypatch):
        # Monkeypatch subprocess.run and tempfile to simulate editor
        # Call edit_via_editor, verify changes applied
        ...
```

The tests should follow the patterns in existing `test_edit.py` and `test_add.py`. Key behaviors to test:
- `no_provenance=True` skips `updated_by` append
- Interactive mode prompts for fields and rationale (monkeypatch `input`)
- Editor mode opens element YAML, applies diff (monkeypatch `subprocess.run`)

**Step 2: Implement**

In `src/gvp/commands/edit.py`:

Add `no_provenance: bool = False` parameter to `edit_element_inline()`. When `True`, skip the `updated_by` append block (lines 43-49).

Add `edit_element_interactive()`:
```python
def edit_element_interactive(catalog: Catalog, qualified_id: str, no_provenance: bool = False) -> None:
    elem = catalog.elements.get(qualified_id)
    if elem is None:
        raise ValueError(f"Element '{qualified_id}' not found")

    print(f"Editing {qualified_id}: {elem.name}")
    print(f"Category: {elem.category}")
    print(f"Current fields:")
    for key, value in elem.fields.items():
        print(f"  {key}: {value}")
    print()

    updates = {}
    for key in ("name", "status", "statement"):
        current = getattr(elem, key, None) or elem.fields.get(key, "")
        new_val = input(f"{key} [{current}]: ").strip()
        if new_val and new_val != str(current):
            updates[key] = new_val

    if not updates:
        print("No changes.")
        return

    rationale = "" if no_provenance else input("Rationale: ").strip()
    edit_element_inline(catalog, qualified_id, updates, rationale, no_provenance=no_provenance)
```

Add `edit_via_editor()`:
```python
def edit_via_editor(catalog: Catalog, qualified_id: str, no_provenance: bool = False) -> bool:
    from gvp.commands.add import get_editor
    elem = catalog.elements.get(qualified_id)
    if elem is None:
        raise ValueError(f"Element '{qualified_id}' not found")

    # Build editable YAML (content fields only, not metadata)
    editable = {"name": elem.name, "status": elem.status}
    editable.update(elem.fields)

    original_yaml = yaml.dump(editable, default_flow_style=False, sort_keys=False)

    with tempfile.NamedTemporaryFile(mode="w", suffix=".yaml", prefix="gvp-edit-", delete=False) as f:
        f.write(f"# Editing {qualified_id}\n")
        f.write(original_yaml)
        tmp_path = f.name

    try:
        editor = get_editor()
        result = subprocess.run([editor, tmp_path])
        if result.returncode != 0:
            return False
        with open(tmp_path) as f:
            content = f.read()
        # Strip comment lines
        content = "\n".join(l for l in content.splitlines() if not l.startswith("#"))
        edited = yaml.safe_load(content)
        if not edited:
            return False

        # Diff
        updates = {}
        for key, new_val in edited.items():
            old_val = editable.get(key)
            if new_val != old_val:
                updates[key] = new_val

        if not updates:
            print("No changes.")
            return False

        print("Changes detected:")
        for key, val in updates.items():
            print(f"  {key}: {editable.get(key, '')} -> {val}")

        rationale = "" if no_provenance else input("Rationale: ").strip()
        edit_element_inline(catalog, qualified_id, updates, rationale, no_provenance=no_provenance)
        return True
    finally:
        Path(tmp_path).unlink(missing_ok=True)
```

Add necessary imports: `import subprocess`, `import tempfile`, `from pathlib import Path`.

**Step 3: Run tests, verify pass**

Run: `pytest tests/ -v --tb=short`

**Step 4: Commit**

```bash
git add src/gvp/commands/edit.py tests/commands/test_edit.py
git commit -m "feat: edit command with interactive and editor modes, --no-provenance"
```

---

## Task 4: Add command — auto-origin

**Files:**
- Modify: `src/gvp/commands/add.py`
- Modify: `tests/commands/test_add.py`

**Step 1: Write failing test**

Add to `tests/commands/test_add.py`:

```python
class TestAutoOrigin:
    def test_auto_origin_when_no_origin_or_defaults(self, tmp_path: Path):
        # Create lib with no meta.defaults.origin
        # Call add_element without origin in fields
        # Read YAML, verify origin: [{date: today}] was auto-added
        ...

    def test_no_auto_origin_when_defaults_exist(self, tmp_path: Path):
        # Create lib with meta.defaults.origin
        # Call add_element without origin in fields
        # Verify origin comes from defaults, not auto-added
        ...

    def test_no_provenance_skips_auto_origin(self, tmp_path: Path):
        # Call add_element with no_provenance=True
        # Verify no origin added
        ...
```

**Step 2: Implement**

In `add_element()`, add `no_provenance: bool = False` parameter. Before writing to file, if `no_provenance` is False and `"origin"` not in `elem_dict` and no `meta.defaults.origin`:

```python
    if not no_provenance and "origin" not in elem_dict:
        doc_defaults = doc.defaults or {}
        if "origin" not in doc_defaults:
            elem_dict["origin"] = [{"date": date.today().isoformat()}]
```

Add `from datetime import date` import.

**Step 3: Run tests, verify pass**

**Step 4: Commit**

```bash
git add src/gvp/commands/add.py tests/commands/test_add.py
git commit -m "feat: auto-origin on add when no origin or defaults exist"
```

---

## Task 5: Review command

**Files:**
- Create: `src/gvp/commands/review.py`
- Create: `tests/commands/test_review.py`

**Step 1: Write tests**

```python
class TestStaleElements:
    def test_finds_stale_elements(self, tmp_path):
        # Build catalog with stale elements, verify find_stale_elements returns them
        ...
    def test_fresh_elements_not_stale(self, tmp_path):
        ...

class TestStampReview:
    def test_stamp_review_appends_reviewed_by(self, tmp_path):
        # Call stamp_review, read YAML, verify reviewed_by entry added
        ...
    def test_stamp_review_with_note(self, tmp_path):
        ...
```

**Step 2: Implement `src/gvp/commands/review.py`**

Core functions:

```python
"""Review command: acknowledge changes with friction."""

from __future__ import annotations

import os
from datetime import date

import yaml

from gvp.commands.add import YAML_KEYS
from gvp.commands.validate import _latest_date
from gvp.model import Catalog, Element


def find_stale_elements(catalog: Catalog) -> list[tuple[Element, Element, str]]:
    """Find elements needing review. Returns [(element, stale_ancestor, ancestor_date)]."""
    stale = []
    for qid, elem in catalog.elements.items():
        if elem.status in ("deprecated", "rejected"):
            continue
        ancestors = catalog.ancestors(elem)
        for ancestor in ancestors:
            ancestor_date = _latest_date(ancestor.updated_by)
            if ancestor_date is None:
                continue
            review_date = _latest_date(elem.reviewed_by)
            if review_date is None or review_date < ancestor_date:
                stale.append((elem, ancestor, ancestor_date))
                break  # one stale ancestor is enough
    return stale


def format_review_display(catalog: Catalog, elem: Element) -> str:
    """Format element details + trace + diff for interactive review."""
    lines = []
    lines.append(f"=== {elem.document.name}:{elem.id} — {elem.name} ===")
    lines.append(f"Category: {elem.category}")
    lines.append(f"Status: {elem.status}")
    for key, val in elem.fields.items():
        lines.append(f"{key}: {val}")
    lines.append("")

    # Show maps_to trace
    lines.append("Maps to:")
    for ref in elem.maps_to:
        target = catalog.elements.get(ref)
        if target:
            lines.append(f"  {ref} — {target.name}")
        else:
            lines.append(f"  {ref} (unresolved)")
    lines.append("")

    # Show ancestor changes since last review
    review_date = _latest_date(elem.reviewed_by)
    ancestors = catalog.ancestors(elem)
    changes = []
    for ancestor in ancestors:
        for entry in (ancestor.updated_by or []):
            entry_date = entry.get("date", "")
            if review_date is None or entry_date > review_date:
                changes.append((str(ancestor), entry))

    if changes:
        lines.append("Changes since last review:")
        for ancestor_qid, entry in sorted(changes, key=lambda x: x[1].get("date", "")):
            lines.append(f"  [{entry.get('date', '?')}] {ancestor_qid}: {entry.get('rationale', '(no rationale)')}")
    else:
        lines.append("No ancestor changes since last review.")

    return "\n".join(lines)


def stamp_review(catalog: Catalog, qualified_id: str, note: str = "", by: str | None = None) -> None:
    """Append a reviewed_by entry to an element's YAML."""
    elem = catalog.elements.get(qualified_id)
    if elem is None:
        raise ValueError(f"Element '{qualified_id}' not found")

    doc = elem.document
    with open(doc.path) as f:
        data = yaml.safe_load(f) or {}

    yaml_key = YAML_KEYS[elem.category]
    items = data.get(yaml_key, [])
    target = None
    for item in items:
        if item.get("id") == elem.id:
            target = item
            break

    if target is None:
        raise ValueError(f"Element '{elem.id}' not found in {doc.path}")

    entry: dict = {"date": date.today().isoformat()}
    if by:
        entry["by"] = by
    elif os.environ.get("USER"):
        entry["by"] = os.environ["USER"]
    if note:
        entry["note"] = note

    if "reviewed_by" not in target:
        target["reviewed_by"] = []
    target["reviewed_by"].append(entry)

    with open(doc.path, "w") as f:
        yaml.dump(data, f, default_flow_style=False, sort_keys=False, allow_unicode=True)
```

**Step 3: Run tests, verify pass**

**Step 4: Commit**

```bash
git add src/gvp/commands/review.py tests/commands/test_review.py
git commit -m "feat: review command with stale detection, display, and stamping"
```

---

## Task 6: Wire up CLI

**Files:**
- Modify: `src/gvp/__main__.py`
- Modify: `tests/test_cli.py`

**Step 1: Add review subcommand to `__main__.py`**

Add `cmd_review()` handler. Wire up argparse:

```python
# review
p_review = subparsers.add_parser("review", help="review elements for staleness")
_add_library_arg(p_review)
p_review.add_argument("element", nargs="?", help="qualified element ID to review")
# --approve is intentionally NOT added to argparse (hidden flag)
# parse it manually from sys.argv or use parse_known_args
```

For `--approve`, use `parse_known_args` or check `sys.argv` directly since it should be hidden from `--help`.

Add `--no-provenance` to edit and add subcommands:
```python
p_edit.add_argument("--no-provenance", action="store_true", help="skip updated_by metadata")
p_add.add_argument("--no-provenance", action="store_true", help="skip origin metadata")
```

Update `cmd_edit()` to handle 3 modes:
- If field flags provided (`--name`, `--status`, `--statement`): CLI mode (current)
- If `--interactive`: interactive mode
- Else: editor mode

Update `cmd_add()` to pass `no_provenance` through.

**Step 2: Add CLI test for review**

Add to `tests/test_cli.py`:

```python
def test_review_list(self):
    result = subprocess.run(
        ["python", "-m", "gvp", "--config", "/dev/null",
         "review", "--library", GVP_DOCS],
        capture_output=True, text=True,
    )
    assert result.returncode == 0
```

**Step 3: Run full test suite**

Run: `pytest tests/ -v --tb=short`

**Step 4: Commit**

```bash
git add src/gvp/__main__.py tests/test_cli.py
git commit -m "feat: wire up review subcommand and edit modes in CLI"
```

---

## Task 7: Update gvp-docs schema and final verification

**Files:**
- Modify: `~/code/git/github.com/shitchell/gvp-docs/schema.yaml`

**Step 1: Add `reviewed_by` to schema.yaml**

Add a `reviewed_by` section under provenance:

```yaml
  reviewed_by:
    description: >
      Review acknowledgments. Records when an element was last confirmed
      as still accurate after upstream changes. Used by the staleness
      warning (W006) to detect elements that may need re-evaluation.
    schema:
      date:
        type: date
        required: true
        description: ISO date of the review
      by:
        type: string
        required: false
        description: Who performed the review
      note:
        type: string
        required: false
        description: Review notes or observations
```

Add `reviewed_by` to the common fields comment block.

**Step 2: Run full gvp test suite**

Run: `pytest tests/ -v --tb=short`

**Step 3: Verify gvp-docs via CLI**

Run: `python -m gvp --config /dev/null validate --library ~/code/git/github.com/shitchell/gvp-docs/`

**Step 4: Commit both repos**

```bash
cd ~/code/git/github.com/shitchell/gvp-docs
git add schema.yaml
git commit -m "docs: add reviewed_by field to schema"

cd ~/code/python/projects/gvp
# Any final fixes
```

---

## What's Next

After executing this plan, the overall project status is:

| Phase | Description | Status |
|-------|-------------|--------|
| 0 | Glossary codified in gvp | Done |
| 1 | TASV review + alignment check | Done |
| 2 | Update gvp (validation rules, traceability) | Done |
| 3 | Update gvp-docs alignment | Done |
| 4 | Example library + gvp-docs → private | **Not started** |
| 5 | Review command + timestamps | **Done (this plan)** |
| 6 | Review all docs and finalize | **Not started** |

**Immediately after this plan's execution**, discuss and execute phases 4 and 6:

- **Phase 4:** Create a trimmed demo library in `examples/` (10-15 elements across 3 scopes showcasing all features). Make the gvp-docs repo private — it becomes a personal store, not the public-facing example.
- **Phase 6:** Final doc review — polish README, GLOSSARY, schema, ensure consistency across gvp and gvp-docs. Clean up the gvp-docs ROADMAP (TASV investigation is done, chain review validation is covered by W006).

**End goal:** `gvp` as source of truth for the framework, `gvp-docs` as personal store.
