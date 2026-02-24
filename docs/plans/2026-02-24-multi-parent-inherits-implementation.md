# Multi-Parent Inheritance Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Change `Document.inherits` from single-parent string to multi-parent list, enabling DAG-shaped document inheritance.

**Architecture:** The `Document.inherits` field becomes `list[str]`. The loader normalizes string/None inputs at parse time. `resolve_chain()` becomes `resolve_ancestors()` using BFS. All consumers (validation, renderers, tests) are updated to work with lists. SQLite gets a junction table replacing the scalar column.

**Tech Stack:** Python 3.11+, PyYAML, pytest

**Design doc:** `docs/plans/2026-02-24-multi-parent-inherits-design.md`

---

### Task 1: Update Data Model

**Files:**
- Modify: `src/gvp/model.py:47` (inherits field)
- Modify: `src/gvp/model.py:68-83` (resolve_chain -> resolve_ancestors)
- Test: `tests/test_model.py`

**Step 1: Write the failing tests**

Replace `test_resolve_chain` and add new multi-parent tests in `tests/test_model.py`. Replace the existing `TestCatalog.test_resolve_chain` method (line 128) with these three tests:

```python
def test_resolve_ancestors_single_parent(self):
    root = Document(
        name="universal", filename="universal.yaml",
        path="/fake/universal.yaml", inherits=[],
        scope_label="universal", id_prefix="U",
        defaults={}, elements=[],
    )
    child = Document(
        name="personal", filename="personal.yaml",
        path="/fake/personal.yaml", inherits=["universal"],
        scope_label="personal", id_prefix=None,
        defaults={}, elements=[],
    )
    cat = Catalog()
    cat.add_document(root)
    cat.add_document(child)
    ancestors = cat.resolve_ancestors(child)
    assert [d.name for d in ancestors] == ["universal"]

def test_resolve_ancestors_multiple_parents(self):
    root = Document(
        name="org", filename="org.yaml",
        path="/fake/org.yaml", inherits=[],
        scope_label="org", id_prefix=None,
        defaults={}, elements=[],
    )
    team = Document(
        name="team", filename="team.yaml",
        path="/fake/team.yaml", inherits=["org"],
        scope_label="team", id_prefix=None,
        defaults={}, elements=[],
    )
    python = Document(
        name="python", filename="python.yaml",
        path="/fake/python.yaml", inherits=["org"],
        scope_label="python", id_prefix=None,
        defaults={}, elements=[],
    )
    project = Document(
        name="project", filename="project.yaml",
        path="/fake/project.yaml", inherits=["team", "python"],
        scope_label="project", id_prefix=None,
        defaults={}, elements=[],
    )
    cat = Catalog()
    for doc in [root, team, python, project]:
        cat.add_document(doc)
    ancestors = cat.resolve_ancestors(project)
    names = [d.name for d in ancestors]
    # BFS: team, python (declared order), then org (shared parent, visited once)
    assert names == ["team", "python", "org"]

def test_resolve_ancestors_diamond(self):
    """Diamond: A inherits B and C, both inherit D. D appears once."""
    d = Document(
        name="d", filename="d.yaml", path="/fake/d.yaml",
        inherits=[], scope_label=None, id_prefix=None,
        defaults={}, elements=[],
    )
    b = Document(
        name="b", filename="b.yaml", path="/fake/b.yaml",
        inherits=["d"], scope_label=None, id_prefix=None,
        defaults={}, elements=[],
    )
    c = Document(
        name="c", filename="c.yaml", path="/fake/c.yaml",
        inherits=["d"], scope_label=None, id_prefix=None,
        defaults={}, elements=[],
    )
    a = Document(
        name="a", filename="a.yaml", path="/fake/a.yaml",
        inherits=["b", "c"], scope_label=None, id_prefix=None,
        defaults={}, elements=[],
    )
    cat = Catalog()
    for doc in [d, b, c, a]:
        cat.add_document(doc)
    ancestors = cat.resolve_ancestors(a)
    names = [d.name for d in ancestors]
    assert names == ["b", "c", "d"]

def test_resolve_ancestors_cycle_raises(self):
    a = Document(
        name="a", filename="a.yaml", path="/fake/a.yaml",
        inherits=["b"], scope_label=None, id_prefix=None,
        defaults={}, elements=[],
    )
    b = Document(
        name="b", filename="b.yaml", path="/fake/b.yaml",
        inherits=["a"], scope_label=None, id_prefix=None,
        defaults={}, elements=[],
    )
    cat = Catalog()
    cat.add_document(a)
    cat.add_document(b)
    with pytest.raises(ValueError, match="Circular inheritance"):
        cat.resolve_ancestors(a)
```

Also update all other `Document(...)` constructors in the file:
- Every `inherits=None` becomes `inherits=[]`
- Every `inherits="universal"` becomes `inherits=["universal"]`
- The `test_basic_creation` assertion on line 98 changes from `assert doc.inherits == "universal"` to `assert doc.inherits == ["universal"]`

Add `import pytest` at the top of the file.

**Step 2: Run tests to verify they fail**

Run: `pytest tests/test_model.py -v`
Expected: FAIL — `Document` doesn't accept `list` for `inherits`, and `resolve_ancestors` doesn't exist.

**Step 3: Update the model**

In `src/gvp/model.py`:

Change line 47 from:
```python
    inherits: str | None
```
to:
```python
    inherits: list[str]
```

Replace `resolve_chain` (lines 68-83) with:
```python
    def resolve_ancestors(self, doc: Document) -> list[Document]:
        """BFS from doc's parents. Returns ancestors in breadth-first order."""
        result: list[Document] = []
        visited: set[str] = {doc.name}
        queue = list(doc.inherits)
        while queue:
            name = queue.pop(0)
            if name in visited:
                continue
            parent = self.documents.get(name)
            if parent is None:
                continue
            visited.add(name)
            result.append(parent)
            for grandparent in parent.inherits:
                if grandparent in visited:
                    # Check if this creates a cycle back to the original doc
                    continue
                queue.append(grandparent)
        return result
```

Wait — the current `resolve_chain` raises on cycles. Let's preserve that. But in a BFS, a cycle means we'd encounter a node that's already in `visited` — which we skip. The original doc is in `visited` from the start, so if any ancestor lists the original doc as a parent, it's silently skipped. We should detect this and raise.

Updated implementation:
```python
    def resolve_ancestors(self, doc: Document) -> list[Document]:
        """BFS from doc's parents. Returns ancestors in breadth-first order.

        Raises ValueError if a circular inheritance is detected.
        """
        result: list[Document] = []
        visited: set[str] = {doc.name}
        queue = list(doc.inherits)
        while queue:
            name = queue.pop(0)
            if name in visited:
                continue
            parent = self.documents.get(name)
            if parent is None:
                continue
            if doc.name in parent.inherits:
                raise ValueError(
                    f"Circular inheritance: {doc.name} and {parent.name} "
                    f"inherit from each other"
                )
            visited.add(name)
            result.append(parent)
            queue.extend(parent.inherits)
        return result
```

Hmm, but that only catches direct cycles. For indirect cycles (A -> B -> C -> A), the original doc's name is in `visited` from the start, so when C tries to add A to the queue, A would be skipped by the `if name in visited` check. The cycle is silently absorbed. To detect it properly:

```python
    def resolve_ancestors(self, doc: Document) -> list[Document]:
        """BFS from doc's parents. Returns ancestors in breadth-first order.

        Raises ValueError if a circular inheritance is detected.
        """
        result: list[Document] = []
        visited: set[str] = {doc.name}
        queue = list(doc.inherits)
        while queue:
            name = queue.pop(0)
            if name == doc.name:
                path = " -> ".join(d.name for d in result) + f" -> {doc.name}"
                raise ValueError(f"Circular inheritance: {doc.name} -> {path}")
            if name in visited:
                continue
            parent = self.documents.get(name)
            if parent is None:
                continue
            visited.add(name)
            result.append(parent)
            queue.extend(parent.inherits)
        return result
```

**Step 4: Run tests to verify they pass**

Run: `pytest tests/test_model.py -v`
Expected: PASS

**Step 5: Commit**

```bash
git add src/gvp/model.py tests/test_model.py
git commit -m "feat: multi-parent inherits in data model"
```

---

### Task 2: Update Loader

**Files:**
- Modify: `src/gvp/loader.py:114` (parse inherits)
- Modify: `src/gvp/loader.py:143-145` (resolve paths for list)
- Test: `tests/test_loader.py`

**Step 1: Write the failing test**

Add a new test to `TestLoadLibrary` in `tests/test_loader.py`:

```python
def test_loads_multi_parent_inherits(self, tmp_path: Path):
    lib = tmp_path / "lib"
    lib.mkdir()
    (lib / "root.yaml").write_text(
        "meta:\n  name: root\nvalues:\n"
        "  - id: V1\n    name: V\n    statement: V.\n    tags: []\n    maps_to: []\n"
    )
    (lib / "team.yaml").write_text(
        "meta:\n  name: team\n  inherits: root\nvalues: []\n"
    )
    (lib / "python.yaml").write_text(
        "meta:\n  name: python\n  inherits: root\nvalues: []\n"
    )
    (lib / "project.yaml").write_text(
        "meta:\n  name: project\n  inherits:\n    - team\n    - python\nvalues: []\n"
    )
    docs, _ = load_library(lib)
    project_doc = next(d for d in docs if d.name == "project")
    assert project_doc.inherits == ["team", "python"]
```

Also update `test_chain_resolution` in `TestLoadCatalog` (line 107-113):
- Rename to `test_ancestor_resolution`
- Change `catalog.resolve_chain(v1)` to `catalog.resolve_ancestors(v1)`
- Change the assertion from `["taskflow-v1", "taskflow", "personal", "universal"]` to `["taskflow", "personal", "universal"]` (resolve_ancestors excludes self)

**Step 2: Run tests to verify they fail**

Run: `pytest tests/test_loader.py -v`
Expected: FAIL — `inherits` is still parsed as string.

**Step 3: Update the loader**

In `src/gvp/loader.py`, change line 114 from:
```python
        inherits=meta.get("inherits"),
```
to:
```python
        inherits=_normalize_inherits(meta.get("inherits")),
```

Add this helper function before `load_document` (e.g., after `_normalize_origin`):
```python
def _normalize_inherits(raw) -> list[str]:
    """Normalize inherits to a list of strings."""
    if raw is None:
        return []
    if isinstance(raw, str):
        return [raw]
    if isinstance(raw, list):
        return [str(item) for item in raw]
    return [str(raw)]
```

Update lines 143-145 from:
```python
    for doc in documents:
        if doc.inherits and doc.inherits in path_to_name:
            doc.inherits = path_to_name[doc.inherits]
```
to:
```python
    for doc in documents:
        doc.inherits = [
            path_to_name.get(parent, parent) for parent in doc.inherits
        ]
```

**Step 4: Run tests to verify they pass**

Run: `pytest tests/test_loader.py -v`
Expected: PASS

**Step 5: Commit**

```bash
git add src/gvp/loader.py tests/test_loader.py
git commit -m "feat: loader normalizes multi-parent inherits"
```

---

### Task 3: Update Validation

**Files:**
- Modify: `src/gvp/commands/validate.py:85-86, 255-272`
- Test: `tests/commands/test_validate.py`

**Step 1: Update existing tests**

The YAML test fixtures in `test_validate.py` use `inherits: root` (a string), which is fine — the loader will normalize it. No changes needed to those strings.

However, update `test_circular_inherits` (line 110-118) to also test multi-parent cycles. Add a new test:

```python
def test_circular_inherits_multi_parent(self, tmp_path: Path):
    lib = tmp_path / "lib"
    lib.mkdir()
    (lib / "a.yaml").write_text(
        "meta:\n  name: a\n  inherits:\n    - b\n    - c\nvalues: []\n"
    )
    (lib / "b.yaml").write_text("meta:\n  name: b\nvalues: []\n")
    (lib / "c.yaml").write_text(
        "meta:\n  name: c\n  inherits: a\nvalues: []\n"
    )
    cfg = GVPConfig(libraries=[lib])
    catalog = load_catalog(cfg)
    errors, _ = validate_catalog(catalog)
    assert any("circular" in e.lower() for e in errors)
```

Add a test for broken inherits in a list:

```python
def test_broken_inherits_in_list(self, tmp_path: Path):
    lib = tmp_path / "lib"
    lib.mkdir()
    (lib / "root.yaml").write_text("meta:\n  name: root\nvalues: []\n")
    (lib / "test.yaml").write_text(
        "meta:\n  name: test\n  inherits:\n    - root\n    - ghost\nvalues: []\n"
    )
    cfg = GVPConfig(libraries=[lib])
    catalog = load_catalog(cfg)
    errors, _ = validate_catalog(catalog)
    assert any("ghost" in e for e in errors)
```

Add a test for W005 with multiple parents:

```python
def test_w005_multi_parent_cross_scope_ok(self, tmp_path: Path):
    """Element maps to one parent but not the other — no W005."""
    lib = tmp_path / "lib"
    lib.mkdir()
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
    (lib / "team.yaml").write_text(textwrap.dedent("""\
        meta:
          name: team
          inherits: root
        principles:
          - id: P1
            name: Team P
            statement: Team.
            tags: []
            maps_to: [root:G1, root:V1]
    """))
    (lib / "project.yaml").write_text(textwrap.dedent("""\
        meta:
          name: project
          inherits:
            - root
            - team
        heuristics:
          - id: H1
            name: Project H
            statement: If A then B.
            tags: []
            maps_to: [team:P1]
    """))
    cfg = GVPConfig(libraries=[lib])
    catalog = load_catalog(cfg)
    _, warnings = validate_catalog(catalog)
    assert not any("W005" in w and "H1" in w for w in warnings)
```

**Step 2: Run tests to verify new tests fail**

Run: `pytest tests/commands/test_validate.py -v`
Expected: New tests may fail due to `resolve_chain` no longer existing.

**Step 3: Update validation code**

In `src/gvp/commands/validate.py`:

Change line 85-86 from:
```python
        if doc.inherits:
            chain_docs = {d.name for d in catalog.resolve_chain(doc)} - {doc.name}
```
to:
```python
        if doc.inherits:
            chain_docs = {d.name for d in catalog.resolve_ancestors(doc)}
```

Change lines 255-258 (broken inherits check) from:
```python
    for doc in catalog.documents.values():
        if doc.inherits and doc.inherits not in catalog.documents:
            errors.append(f"{doc.name}: broken inherits reference '{doc.inherits}'")
```
to:
```python
    for doc in catalog.documents.values():
        for parent_name in doc.inherits:
            if parent_name not in catalog.documents:
                errors.append(f"{doc.name}: broken inherits reference '{parent_name}'")
```

Replace lines 261-272 (circular inheritance check) from the linear walk to using resolve_ancestors:
```python
    # Check for circular inheritance
    for doc in catalog.documents.values():
        if doc.inherits:
            try:
                catalog.resolve_ancestors(doc)
            except ValueError:
                errors.append(f"{doc.name}: circular inheritance detected")
```

**Step 4: Run tests to verify they pass**

Run: `pytest tests/commands/test_validate.py -v`
Expected: PASS

**Step 5: Commit**

```bash
git add src/gvp/commands/validate.py tests/commands/test_validate.py
git commit -m "feat: validation supports multi-parent inherits"
```

---

### Task 4: Update Renderers

**Files:**
- Modify: `src/gvp/renderers/markdown.py:44-45`
- Modify: `src/gvp/renderers/sqlite.py:14, 48-59`
- Test: `tests/renderers/test_markdown.py`
- Test: `tests/renderers/test_sqlite.py`

**Step 1: Write the failing tests**

In `tests/renderers/test_markdown.py`, add:

```python
def test_renders_multi_inherits(self, tmp_path: Path):
    lib = tmp_path / "lib"
    lib.mkdir()
    (lib / "root.yaml").write_text("meta:\n  name: root\nvalues: []\n")
    (lib / "team.yaml").write_text("meta:\n  name: team\nvalues: []\n")
    (lib / "project.yaml").write_text(
        "meta:\n  name: project\n  inherits:\n    - root\n    - team\nvalues: []\n"
    )
    cfg = GVPConfig(libraries=[lib])
    catalog = load_catalog(cfg)
    output = render_markdown(catalog)
    assert "**Inherits:** root, team" in output
```

In `tests/renderers/test_sqlite.py`, add:

```python
def test_document_inherits_table(self, tmp_path: Path):
    lib = tmp_path / "lib"
    lib.mkdir()
    (lib / "root.yaml").write_text("meta:\n  name: root\nvalues: []\n")
    (lib / "team.yaml").write_text("meta:\n  name: team\nvalues: []\n")
    (lib / "project.yaml").write_text(
        "meta:\n  name: project\n  inherits:\n    - root\n    - team\nvalues: []\n"
    )
    cfg = GVPConfig(libraries=[lib])
    catalog = load_catalog(cfg)
    db_path = tmp_path / "test.db"
    render_sqlite(catalog, db_path)
    conn = sqlite3.connect(db_path)
    rows = conn.execute(
        "SELECT parent, position FROM document_inherits "
        "WHERE document = 'project' ORDER BY position"
    ).fetchall()
    assert rows == [("root", 0), ("team", 1)]
    conn.close()
```

Add necessary imports to test files: `from gvp.config import GVPConfig` and `from gvp.loader import load_catalog` (if not already present in `test_markdown.py`).

**Step 2: Run tests to verify they fail**

Run: `pytest tests/renderers/test_markdown.py tests/renderers/test_sqlite.py -v`
Expected: FAIL

**Step 3: Update markdown renderer**

In `src/gvp/renderers/markdown.py`, change lines 44-45 from:
```python
    if doc.inherits:
        lines.append(f"\n**Inherits:** {doc.inherits}")
```
to:
```python
    if doc.inherits:
        lines.append(f"\n**Inherits:** {', '.join(doc.inherits)}")
```

**Step 4: Update SQLite renderer**

In `src/gvp/renderers/sqlite.py`, update the SCHEMA (lines 11-33). Replace:
```python
SCHEMA = """
CREATE TABLE IF NOT EXISTS documents (
    name TEXT PRIMARY KEY, filename TEXT, path TEXT,
    inherits TEXT, scope_label TEXT, id_prefix TEXT
);
```
with:
```python
SCHEMA = """
CREATE TABLE IF NOT EXISTS documents (
    name TEXT PRIMARY KEY, filename TEXT, path TEXT,
    scope_label TEXT, id_prefix TEXT
);
CREATE TABLE IF NOT EXISTS document_inherits (
    document TEXT REFERENCES documents(name),
    parent TEXT, position INTEGER,
    PRIMARY KEY (document, parent)
);
```

Update the documents INSERT (lines 48-59). Replace:
```python
    for doc in catalog.documents.values():
        conn.execute(
            "INSERT INTO documents VALUES (?, ?, ?, ?, ?, ?)",
            (
                doc.name,
                doc.filename,
                str(doc.path),
                doc.inherits,
                doc.scope_label,
                doc.id_prefix,
            ),
        )
```
with:
```python
    for doc in catalog.documents.values():
        conn.execute(
            "INSERT INTO documents VALUES (?, ?, ?, ?, ?)",
            (
                doc.name,
                doc.filename,
                str(doc.path),
                doc.scope_label,
                doc.id_prefix,
            ),
        )
        for pos, parent in enumerate(doc.inherits):
            conn.execute(
                "INSERT INTO document_inherits VALUES (?, ?, ?)",
                (doc.name, parent, pos),
            )
```

**Step 5: Run tests to verify they pass**

Run: `pytest tests/renderers/ -v`
Expected: PASS

**Step 6: Commit**

```bash
git add src/gvp/renderers/markdown.py src/gvp/renderers/sqlite.py tests/renderers/test_markdown.py tests/renderers/test_sqlite.py
git commit -m "feat: renderers support multi-parent inherits"
```

---

### Task 5: Update Integration Tests

**Files:**
- Modify: `tests/test_integration.py:69-71`

**Step 1: Update integration tests**

In `tests/test_integration.py`, update `test_chain_spans_all_levels` (lines 65-71):

Rename to `test_ancestors_span_all_levels`. Change:
```python
    def test_chain_spans_all_levels(self, gvp_docs_library: Path):
        cfg = GVPConfig(libraries=[gvp_docs_library])
        catalog = load_catalog(cfg)
        v1 = catalog.documents["taskflow-v1"]
        chain = catalog.resolve_chain(v1)
        names = [d.name for d in chain]
        assert names == ["taskflow-v1", "taskflow", "personal", "universal"]
```
to:
```python
    def test_ancestors_span_all_levels(self, gvp_docs_library: Path):
        cfg = GVPConfig(libraries=[gvp_docs_library])
        catalog = load_catalog(cfg)
        v1 = catalog.documents["taskflow-v1"]
        ancestors = catalog.resolve_ancestors(v1)
        names = [d.name for d in ancestors]
        assert names == ["taskflow", "personal", "universal"]
```

**Step 2: Run tests to verify they pass**

Run: `pytest tests/test_integration.py -v`
Expected: PASS

**Step 3: Commit**

```bash
git add tests/test_integration.py
git commit -m "test: update integration tests for resolve_ancestors"
```

---

### Task 6: Update Documentation

**Files:**
- Modify: `GLOSSARY.md:33`
- Modify: `README.md:43-54`

**Step 1: Update GLOSSARY.md**

Change line 33 from:
```
| **Chain** | The resolved inheritance path from a document to its root, determined by `meta.inherits` references. |
```
to:
```
| **Ancestry** | The resolved set of ancestor documents reachable from a document's `meta.inherits` references, traversed breadth-first. Forms a DAG when documents inherit from multiple parents. |
```

**Step 2: Update README.md**

Replace lines 43-54 (the "Scope and Inheritance" section) with:

```markdown
### Scope and Inheritance

GVP documents form an inheritance graph. A document can inherit from one or more parents via `meta.inherits`. You need at least one scope, and the depth is up to you. The conventional structure is:

```
universal.yaml                         (organization-wide)
  ├─ personal.yaml                     (individual, cross-project)
  │    └─ projects/<project>.yaml      (project-level: goals, constraints)
  │         └─ ...                      (arbitrary further nesting)
  └─ python-projects.yaml             (language-specific conventions)
       └─ projects/<project>.yaml      (can inherit from both personal + python)
```

A document can inherit from multiple parents:

```yaml
meta:
  name: my-project
  inherits:
    - personal
    - python-projects
```

For personal use, `universal.yaml` can remain empty — or you can skip it entirely and start from `personal.yaml`. What constitutes a "project" vs. deeper nesting is up to you. The framework doesn't enforce granularity, only that the inheritance graph is acyclic.
```

**Step 3: Run full test suite**

Run: `pytest tests/ -v`
Expected: ALL PASS

**Step 4: Commit**

```bash
git add GLOSSARY.md README.md
git commit -m "docs: update glossary and readme for multi-parent inherits"
```

---

### Task 7: Remove Memory Item and Final Verification

**Step 1: Run full test suite one more time**

Run: `pytest tests/ -v`
Expected: ALL PASS

**Step 2: Remove the memory item**

In `/home/guy/.claude/projects/-home-guy-code-git-github-com-shitchell-gvp/memory/MEMORY.md`, remove the line:
```
- Ensure inheriting multiple parent files is supported.
```

**Step 3: Verify no remaining references to resolve_chain**

Run: `grep -r "resolve_chain" src/ tests/`
Expected: No matches (only docs/plans/ historical references should remain).
