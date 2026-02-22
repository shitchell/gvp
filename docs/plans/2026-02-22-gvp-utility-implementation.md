# GVP Utility Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the `gvp` CLI utility that loads GVP YAML documents, validates them, renders to multiple formats, queries elements, traces the mapping graph, and manages element lifecycle.

**Architecture:** Python 3.11+ with PyYAML. Core data model (Element, Document, Catalog) in `model.py`, config discovery in `config.py`, YAML loading in `loader.py`. Subcommands in `commands/`, renderers in `renderers/`. Entry point in `__main__.py` with argparse.

**Tech Stack:** Python 3.11+, PyYAML, argparse, sqlite3 (stdlib), graphviz (optional extra)

**Test data:** Use the real gvp-docs repo at `/home/guy/code/git/github.com/shitchell/gvp-docs/` as a test library. It contains 6 YAML files across 3 inheritance levels with 30+ elements, qualified ID references, tags, and defaults.

---

## Task 1: Project Scaffolding

**Files:**
- Create: `pyproject.toml`
- Create: `src/gvp/__init__.py`
- Create: `src/gvp/__main__.py`
- Create: `tests/__init__.py`
- Create: `tests/conftest.py`

**Step 1: Create pyproject.toml**

```toml
[build-system]
requires = ["setuptools>=68.0"]
build-backend = "setuptools.backends._legacy:_Backend"

[project]
name = "gvp"
version = "0.1.0"
description = "CLI utility for GVP (Goals, Values, and Principles) documents"
requires-python = ">=3.11"
dependencies = ["pyyaml>=6.0"]

[project.optional-dependencies]
diagrams = ["graphviz"]
dev = ["pytest>=7.0"]

[project.scripts]
gvp = "gvp.__main__:main"

[tool.setuptools.packages.find]
where = ["src"]
```

**Step 2: Create src/gvp/__init__.py**

```python
"""GVP — Goals, Values, and Principles CLI utility."""

__version__ = "0.1.0"
```

**Step 3: Create src/gvp/__main__.py (stub)**

```python
"""CLI entry point for gvp."""

import argparse
import sys


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="gvp",
        description="CLI utility for GVP (Goals, Values, and Principles) documents",
    )
    parser.add_argument("--version", action="version", version=f"%(prog)s {__version__}")
    parser.add_argument("--strict", action="store_true", help="promote warnings to errors")
    parser.add_argument("--config", type=str, help="override config discovery")
    parser.add_argument("--verbose", action="store_true", help="show loaded libraries/documents")

    subparsers = parser.add_subparsers(dest="command")

    args = parser.parse_args(argv)
    if not args.command:
        parser.print_help()
        return 0
    return 0


from gvp import __version__  # noqa: E402


if __name__ == "__main__":
    sys.exit(main())
```

**Step 4: Create tests/__init__.py and tests/conftest.py**

```python
# tests/__init__.py
```

```python
# tests/conftest.py
"""Shared fixtures for gvp tests."""

from pathlib import Path

import pytest


GVP_DOCS_DIR = Path("/home/guy/code/git/github.com/shitchell/gvp-docs")


@pytest.fixture
def gvp_docs_library() -> Path:
    """Path to the real gvp-docs library for integration tests."""
    assert GVP_DOCS_DIR.exists(), f"gvp-docs not found at {GVP_DOCS_DIR}"
    return GVP_DOCS_DIR


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

**Step 5: Install in dev mode and verify**

Run: `cd /home/guy/code/python/projects/gvp && pip install -e '.[dev]'`

Run: `gvp --version`
Expected: `gvp 0.1.0`

Run: `pytest tests/ -v`
Expected: no tests collected (but no import errors)

**Step 6: Commit**

```bash
git add pyproject.toml src/ tests/
git commit -m "feat: project scaffolding with pyproject.toml and CLI stub"
```

---

## Task 2: Data Model (`model.py`)

**Files:**
- Create: `src/gvp/model.py`
- Create: `tests/test_model.py`

**Step 1: Write the failing tests**

```python
# tests/test_model.py
"""Tests for gvp.model."""

from gvp.model import Element, Document, Catalog


class TestElement:
    def test_str_format(self):
        doc = Document(
            name="personal", filename="personal.yaml",
            path="/fake/personal.yaml", inherits=None,
            scope_label="personal", id_prefix=None,
            defaults={}, elements=[],
        )
        elem = Element(
            id="P3", category="principle", name="One Contiguous Block",
            status="active", tags=["maintainability"],
            maps_to=["personal:V2"], origin=[], updated_by={},
            fields={"statement": "Related logic lives together."},
            document=doc,
        )
        assert str(elem) == "personal:P3"

    def test_repr_format(self):
        doc = Document(
            name="personal", filename="personal.yaml",
            path="/fake/personal.yaml", inherits=None,
            scope_label="personal", id_prefix=None,
            defaults={}, elements=[],
        )
        elem = Element(
            id="P3", category="principle", name="One Contiguous Block",
            status="active", tags=["maintainability"],
            maps_to=["personal:V2"], origin=[], updated_by={},
            fields={"statement": "Related logic lives together."},
            document=doc,
        )
        assert repr(elem) == "personal.yaml:personal:P3"

    def test_status_defaults_to_active(self):
        doc = Document(
            name="test", filename="test.yaml",
            path="/fake/test.yaml", inherits=None,
            scope_label=None, id_prefix=None,
            defaults={}, elements=[],
        )
        elem = Element(
            id="V1", category="value", name="Test",
            tags=[], maps_to=[], origin=[], updated_by={},
            fields={}, document=doc,
        )
        assert elem.status == "active"


class TestDocument:
    def test_basic_creation(self):
        doc = Document(
            name="personal", filename="personal.yaml",
            path="/fake/personal.yaml", inherits="universal",
            scope_label="personal", id_prefix=None,
            defaults={"origin": {"project": "test"}},
            elements=[],
        )
        assert doc.name == "personal"
        assert doc.inherits == "universal"
        assert doc.defaults["origin"]["project"] == "test"


class TestCatalog:
    def test_empty_catalog(self):
        cat = Catalog()
        assert cat.documents == {}
        assert cat.elements == {}
        assert cat.tags == {}

    def test_add_document_indexes_elements(self):
        doc = Document(
            name="test", filename="test.yaml",
            path="/fake/test.yaml", inherits=None,
            scope_label=None, id_prefix=None,
            defaults={}, elements=[],
        )
        elem = Element(
            id="V1", category="value", name="Test",
            tags=[], maps_to=[], origin=[], updated_by={},
            fields={}, document=doc,
        )
        doc.elements.append(elem)

        cat = Catalog()
        cat.add_document(doc)
        assert "test" in cat.documents
        assert "test:V1" in cat.elements
        assert cat.elements["test:V1"] is elem

    def test_resolve_chain(self):
        root = Document(
            name="universal", filename="universal.yaml",
            path="/fake/universal.yaml", inherits=None,
            scope_label="universal", id_prefix="U",
            defaults={}, elements=[],
        )
        child = Document(
            name="personal", filename="personal.yaml",
            path="/fake/personal.yaml", inherits="universal",
            scope_label="personal", id_prefix=None,
            defaults={}, elements=[],
        )
        cat = Catalog()
        cat.add_document(root)
        cat.add_document(child)
        chain = cat.resolve_chain(child)
        assert [d.name for d in chain] == ["personal", "universal"]

    def test_ancestors(self):
        doc = Document(
            name="test", filename="test.yaml",
            path="/fake/test.yaml", inherits=None,
            scope_label=None, id_prefix=None,
            defaults={}, elements=[],
        )
        v1 = Element(
            id="V1", category="value", name="V",
            tags=[], maps_to=[], origin=[], updated_by={},
            fields={}, document=doc,
        )
        p1 = Element(
            id="P1", category="principle", name="P",
            tags=[], maps_to=["test:V1"], origin=[], updated_by={},
            fields={}, document=doc,
        )
        h1 = Element(
            id="H1", category="heuristic", name="H",
            tags=[], maps_to=["test:P1"], origin=[], updated_by={},
            fields={}, document=doc,
        )
        doc.elements.extend([v1, p1, h1])
        cat = Catalog()
        cat.add_document(doc)

        ancestors = cat.ancestors(h1)
        assert v1 in ancestors
        assert p1 in ancestors
        assert h1 not in ancestors

    def test_descendants(self):
        doc = Document(
            name="test", filename="test.yaml",
            path="/fake/test.yaml", inherits=None,
            scope_label=None, id_prefix=None,
            defaults={}, elements=[],
        )
        v1 = Element(
            id="V1", category="value", name="V",
            tags=[], maps_to=[], origin=[], updated_by={},
            fields={}, document=doc,
        )
        p1 = Element(
            id="P1", category="principle", name="P",
            tags=[], maps_to=["test:V1"], origin=[], updated_by={},
            fields={}, document=doc,
        )
        doc.elements.extend([v1, p1])
        cat = Catalog()
        cat.add_document(doc)

        descendants = cat.descendants(v1)
        assert p1 in descendants
        assert v1 not in descendants
```

**Step 2: Run tests to verify they fail**

Run: `pytest tests/test_model.py -v`
Expected: FAIL — cannot import `gvp.model`

**Step 3: Write the implementation**

```python
# src/gvp/model.py
"""Core data model: Element, Document, Catalog."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class Element:
    """A single GVP element."""

    id: str
    category: str
    name: str
    tags: list[str]
    maps_to: list[str]
    origin: list[dict]
    updated_by: list[dict]
    fields: dict
    document: Document
    status: str = "active"

    def __str__(self) -> str:
        return f"{self.document.name}:{self.id}"

    def __repr__(self) -> str:
        return f"{self.document.filename}:{self.document.name}:{self.id}"

    def __hash__(self) -> int:
        return hash((self.document.name, self.id))

    def __eq__(self, other: object) -> bool:
        if not isinstance(other, Element):
            return NotImplemented
        return self.document.name == other.document.name and self.id == other.id


@dataclass
class Document:
    """A loaded GVP YAML file."""

    name: str
    filename: str
    path: str | Path
    inherits: str | None
    scope_label: str | None
    id_prefix: str | None
    defaults: dict
    elements: list[Element] = field(default_factory=list)


class Catalog:
    """The resolved GVP graph across all documents and libraries."""

    def __init__(self) -> None:
        self.documents: dict[str, Document] = {}
        self.elements: dict[str, Element] = {}
        self.tags: dict[str, dict] = {}

    def add_document(self, doc: Document) -> None:
        """Register a document and index its elements."""
        self.documents[doc.name] = doc
        for elem in doc.elements:
            qualified = f"{doc.name}:{elem.id}"
            self.elements[qualified] = elem

    def resolve_chain(self, doc: Document) -> list[Document]:
        """Walk inherits chain from document to root. Returns [doc, parent, ..., root]."""
        chain = [doc]
        visited = {doc.name}
        current = doc
        while current.inherits:
            parent = self.documents.get(current.inherits)
            if parent is None:
                break
            if parent.name in visited:
                raise ValueError(
                    f"Circular inheritance: {' -> '.join(d.name for d in chain)} -> {parent.name}"
                )
            visited.add(parent.name)
            chain.append(parent)
            current = parent
        return chain

    def ancestors(self, element: Element) -> set[Element]:
        """Elements this one maps to, transitively."""
        result: set[Element] = set()
        queue = list(element.maps_to)
        while queue:
            qid = queue.pop(0)
            target = self.elements.get(qid)
            if target is None or target in result:
                continue
            result.add(target)
            queue.extend(target.maps_to)
        return result

    def descendants(self, element: Element) -> set[Element]:
        """Elements that map to this one, transitively."""
        qualified = str(element)
        result: set[Element] = set()
        queue = [
            e for e in self.elements.values()
            if qualified in e.maps_to and e != element
        ]
        while queue:
            e = queue.pop(0)
            if e in result:
                continue
            result.add(e)
            e_qid = str(e)
            queue.extend(
                other for other in self.elements.values()
                if e_qid in other.maps_to and other not in result
            )
        return result
```

**Step 4: Run tests to verify they pass**

Run: `pytest tests/test_model.py -v`
Expected: all PASS

**Step 5: Commit**

```bash
git add src/gvp/model.py tests/test_model.py
git commit -m "feat: core data model (Element, Document, Catalog)"
```

---

## Task 3: Config Discovery (`config.py`)

**Files:**
- Create: `src/gvp/config.py`
- Create: `tests/test_config.py`

**Step 1: Write the failing tests**

```python
# tests/test_config.py
"""Tests for gvp.config."""

from pathlib import Path

from gvp.config import GVPConfig, discover_config


class TestGVPConfig:
    def test_empty_config(self):
        cfg = GVPConfig()
        assert cfg.libraries == []
        assert cfg.strict is False
        assert cfg.suppress_warnings == []

    def test_merge_adds_libraries(self):
        base = GVPConfig(libraries=[Path("/a")])
        overlay = GVPConfig(libraries=[Path("/b")])
        merged = base.merge(overlay)
        assert merged.libraries == [Path("/a"), Path("/b")]

    def test_merge_strict_wins(self):
        base = GVPConfig(strict=False)
        overlay = GVPConfig(strict=True)
        merged = base.merge(overlay)
        assert merged.strict is True

    def test_merge_suppressed_warnings_combine(self):
        base = GVPConfig(suppress_warnings=["W001"])
        overlay = GVPConfig(suppress_warnings=["W002"])
        merged = base.merge(overlay)
        assert set(merged.suppress_warnings) == {"W001", "W002"}


class TestDiscoverConfig:
    def test_walk_backwards_finds_gvp_dir(self, tmp_path: Path):
        project = tmp_path / "project" / "subdir"
        project.mkdir(parents=True)
        gvp_dir = tmp_path / "project" / ".gvp"
        gvp_dir.mkdir()

        doc = gvp_dir / "test.yaml"
        doc.write_text("meta:\n  name: test\n  scope: test\n")

        cfg = discover_config(cwd=project, user_dir=None, system_dir=None)
        assert gvp_dir in cfg.libraries

    def test_walk_backwards_finds_gvp_yaml(self, tmp_path: Path):
        project = tmp_path / "project"
        project.mkdir()
        gvp_file = project / ".gvp.yaml"
        gvp_file.write_text("meta:\n  name: inline\n  scope: project\n")

        cfg = discover_config(cwd=project, user_dir=None, system_dir=None)
        # .gvp.yaml is treated as a single-document library
        assert any(str(p).endswith(".gvp.yaml") for p in cfg.libraries)

    def test_user_dir_implicit_library(self, tmp_path: Path):
        user_dir = tmp_path / "config" / "gvp"
        libs = user_dir / "libraries"
        libs.mkdir(parents=True)

        doc = libs / "personal.yaml"
        doc.write_text("meta:\n  name: personal\n  scope: personal\n")

        cfg = discover_config(cwd=tmp_path, user_dir=user_dir, system_dir=None)
        assert libs in cfg.libraries

    def test_config_yaml_adds_libraries(self, tmp_path: Path):
        user_dir = tmp_path / "config" / "gvp"
        user_dir.mkdir(parents=True)

        extra_lib = tmp_path / "extra-lib"
        extra_lib.mkdir()

        config_file = user_dir / "config.yaml"
        config_file.write_text(f"libraries:\n  - {extra_lib}\n")

        cfg = discover_config(cwd=tmp_path, user_dir=user_dir, system_dir=None)
        assert extra_lib in cfg.libraries

    def test_discovery_order(self, tmp_path: Path):
        # project-local > user > system
        project = tmp_path / "project"
        project.mkdir()
        gvp_dir = project / ".gvp"
        gvp_dir.mkdir()

        user_dir = tmp_path / "user-config" / "gvp"
        user_libs = user_dir / "libraries"
        user_libs.mkdir(parents=True)

        system_dir = tmp_path / "system-config" / "gvp"
        system_libs = system_dir / "libraries"
        system_libs.mkdir(parents=True)

        cfg = discover_config(cwd=project, user_dir=user_dir, system_dir=system_dir)
        # gvp_dir should come before user_libs, user_libs before system_libs
        lib_list = cfg.libraries
        assert lib_list.index(gvp_dir) < lib_list.index(user_libs)
        assert lib_list.index(user_libs) < lib_list.index(system_libs)
```

**Step 2: Run tests to verify they fail**

Run: `pytest tests/test_config.py -v`
Expected: FAIL — cannot import `gvp.config`

**Step 3: Write the implementation**

```python
# src/gvp/config.py
"""Config discovery: walk-backwards, user, system, merging."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

import yaml


@dataclass
class GVPConfig:
    """Merged configuration from all sources."""

    libraries: list[Path] = field(default_factory=list)
    strict: bool = False
    suppress_warnings: list[str] = field(default_factory=list)

    def merge(self, other: GVPConfig) -> GVPConfig:
        """Merge another config into this one. Other's libraries come after ours."""
        return GVPConfig(
            libraries=self.libraries + other.libraries,
            strict=self.strict or other.strict,
            suppress_warnings=list(set(self.suppress_warnings + other.suppress_warnings)),
        )


def _parse_config_yaml(path: Path) -> GVPConfig:
    """Parse a config.yaml file into a GVPConfig."""
    if not path.exists():
        return GVPConfig()
    with open(path) as f:
        data = yaml.safe_load(f) or {}
    return GVPConfig(
        libraries=[Path(p).expanduser() for p in data.get("libraries", [])],
        strict=data.get("strict", False),
        suppress_warnings=data.get("suppress_warnings", []),
    )


def _walk_backwards(cwd: Path) -> list[Path]:
    """Walk from cwd to root, collecting .gvp/ dirs and .gvp.yaml files."""
    results: list[Path] = []
    current = cwd.resolve()
    while True:
        gvp_dir = current / ".gvp"
        if gvp_dir.is_dir():
            results.append(gvp_dir)
        gvp_file = current / ".gvp.yaml"
        if gvp_file.is_file():
            results.append(gvp_file)
        parent = current.parent
        if parent == current:
            break
        current = parent
    return results


def _collect_from_dir(gvp_dir: Path) -> GVPConfig:
    """Collect config and implicit library from a gvp config directory."""
    cfg = _parse_config_yaml(gvp_dir / "config.yaml")

    # Implicit library at {gvp_dir}/libraries/
    libs_dir = gvp_dir / "libraries"
    if libs_dir.is_dir():
        cfg.libraries.insert(0, libs_dir)

    return cfg


def discover_config(
    cwd: Path | None = None,
    user_dir: Path | None = ...,
    system_dir: Path | None = ...,
) -> GVPConfig:
    """Discover and merge config from all sources.

    Args:
        cwd: Working directory for walk-backwards. Defaults to Path.cwd().
        user_dir: User config dir. Defaults to ~/.config/gvp.
            Pass None to skip.
        system_dir: System config dir. Defaults to /etc/gvp.
            Pass None to skip.
    """
    if cwd is None:
        cwd = Path.cwd()

    if user_dir is ...:
        user_dir = Path.home() / ".config" / "gvp"
    if system_dir is ...:
        system_dir = Path("/etc/gvp")

    result = GVPConfig()

    # 1. Walk backwards from cwd
    for path in _walk_backwards(cwd):
        result.libraries.append(path)

    # 2. User config
    if user_dir is not None:
        user_cfg = _collect_from_dir(user_dir)
        result = result.merge(user_cfg)

    # 3. System config
    if system_dir is not None:
        system_cfg = _collect_from_dir(system_dir)
        result = result.merge(system_cfg)

    return result
```

**Step 4: Run tests to verify they pass**

Run: `pytest tests/test_config.py -v`
Expected: all PASS

**Step 5: Commit**

```bash
git add src/gvp/config.py tests/test_config.py
git commit -m "feat: config discovery (walk-backwards, user, system, merging)"
```

---

## Task 4: YAML Loader (`loader.py`)

**Files:**
- Create: `src/gvp/loader.py`
- Create: `tests/test_loader.py`

**Step 1: Write the failing tests**

```python
# tests/test_loader.py
"""Tests for gvp.loader."""

from pathlib import Path

from gvp.loader import load_library, load_catalog
from gvp.config import GVPConfig
from gvp.model import Catalog


class TestLoadLibrary:
    def test_loads_document_with_meta(self, tmp_library: Path):
        docs, tags = load_library(tmp_library)
        assert len(docs) == 1
        assert docs[0].name == "test"

    def test_loads_elements(self, tmp_library: Path):
        docs, tags = load_library(tmp_library)
        doc = docs[0]
        assert len(doc.elements) == 2
        ids = {e.id for e in doc.elements}
        assert ids == {"V1", "P1"}

    def test_loads_tags(self, tmp_library: Path):
        docs, tags = load_library(tmp_library)
        assert "code" in tags
        assert "maintainability" in tags

    def test_skips_schema_yaml(self, tmp_library: Path):
        schema = tmp_library / "schema.yaml"
        schema.write_text("meta:\n  name: schema\n")
        docs, _ = load_library(tmp_library)
        names = {d.name for d in docs}
        assert "schema" not in names

    def test_skips_tags_yaml(self, tmp_library: Path):
        docs, _ = load_library(tmp_library)
        names = {d.name for d in docs}
        assert "tags" not in names

    def test_merges_defaults_into_elements(self, tmp_path: Path):
        lib = tmp_path / "lib"
        lib.mkdir()
        doc = lib / "test.yaml"
        doc.write_text(
            "meta:\n"
            "  name: test\n"
            "  defaults:\n"
            "    origin:\n"
            "      project: myproject\n"
            "      date: 2026-02-22\n"
            "\n"
            "values:\n"
            "  - id: V1\n"
            "    name: Test\n"
            "    statement: A test.\n"
            "    tags: []\n"
            "    maps_to: []\n"
        )
        docs, _ = load_library(lib)
        elem = docs[0].elements[0]
        assert elem.origin == [{"project": "myproject", "date": "2026-02-22"}]

    def test_element_explicit_origin_overrides_default(self, tmp_path: Path):
        lib = tmp_path / "lib"
        lib.mkdir()
        doc = lib / "test.yaml"
        doc.write_text(
            "meta:\n"
            "  name: test\n"
            "  defaults:\n"
            "    origin:\n"
            "      project: default-project\n"
            "      date: 2026-01-01\n"
            "\n"
            "values:\n"
            "  - id: V1\n"
            "    name: Test\n"
            "    statement: A test.\n"
            "    tags: []\n"
            "    maps_to: []\n"
            "    origin:\n"
            "      - project: explicit\n"
            "        date: 2026-02-22\n"
        )
        docs, _ = load_library(lib)
        elem = docs[0].elements[0]
        assert elem.origin[0]["project"] == "explicit"


class TestLoadCatalog:
    def test_loads_real_gvp_docs(self, gvp_docs_library: Path):
        cfg = GVPConfig(libraries=[gvp_docs_library])
        catalog = load_catalog(cfg)
        assert "personal" in catalog.documents
        assert "universal" in catalog.documents
        assert "unturned" in catalog.documents
        assert "ctl-v1" in catalog.documents

    def test_qualified_ids_indexed(self, gvp_docs_library: Path):
        cfg = GVPConfig(libraries=[gvp_docs_library])
        catalog = load_catalog(cfg)
        assert "personal:V1" in catalog.elements
        assert "personal:P1" in catalog.elements
        assert "unturned:G1" in catalog.elements
        assert "ctl-v1:D1" in catalog.elements

    def test_chain_resolution(self, gvp_docs_library: Path):
        cfg = GVPConfig(libraries=[gvp_docs_library])
        catalog = load_catalog(cfg)
        ctl = catalog.documents["ctl-v1"]
        chain = catalog.resolve_chain(ctl)
        names = [d.name for d in chain]
        assert names == ["ctl-v1", "unturned", "personal", "universal"]

    def test_tags_loaded(self, gvp_docs_library: Path):
        cfg = GVPConfig(libraries=[gvp_docs_library])
        catalog = load_catalog(cfg)
        assert "code" in catalog.tags
        assert "maintainability" in catalog.tags

    def test_duplicate_name_warning(self, tmp_path: Path, capsys):
        lib1 = tmp_path / "lib1"
        lib1.mkdir()
        (lib1 / "a.yaml").write_text("meta:\n  name: dupe\n  scope: test\nvalues: []\n")

        lib2 = tmp_path / "lib2"
        lib2.mkdir()
        (lib2 / "b.yaml").write_text("meta:\n  name: dupe\n  scope: test\nvalues: []\n")

        cfg = GVPConfig(libraries=[lib1, lib2])
        catalog = load_catalog(cfg)
        # First library wins
        assert catalog.documents["dupe"].path == lib1 / "a.yaml"
```

**Step 2: Run tests to verify they fail**

Run: `pytest tests/test_loader.py -v`
Expected: FAIL — cannot import `gvp.loader`

**Step 3: Write the implementation**

```python
# src/gvp/loader.py
"""YAML loading, defaults merging, chain resolution."""

from __future__ import annotations

import sys
from pathlib import Path

import yaml

from gvp.config import GVPConfig
from gvp.model import Catalog, Document, Element

# Known YAML category keys and their element category names
CATEGORY_MAP = {
    "values": "value",
    "principles": "principle",
    "heuristics": "heuristic",
    "rules": "rule",
    "goals": "goal",
    "milestones": "milestone",
    "design_choices": "design_choice",
    "constraints": "constraint",
    "implementation_rules": "implementation_rule",
    "coding_principles": "coding_principle",
}

# Files to skip when scanning a library
SKIP_FILES = {"tags.yaml", "schema.yaml"}

# Common fields extracted into Element attributes (rest go into fields)
ELEMENT_ATTRS = {"id", "name", "status", "tags", "maps_to", "origin", "updated_by"}


def _load_tags(library_path: Path) -> dict[str, dict]:
    """Load tags.yaml from a library. Returns {tag_name: {description: ...}}."""
    tags_file = library_path / "tags.yaml"
    if not tags_file.exists():
        return {}
    with open(tags_file) as f:
        data = yaml.safe_load(f) or {}

    result = {}
    for section in ("domains", "concerns"):
        for tag_name, tag_def in (data.get(section) or {}).items():
            result[tag_name] = {"type": section.rstrip("s"), **(tag_def or {})}
    return result


def _apply_defaults(raw_element: dict, defaults: dict) -> dict:
    """Apply meta.defaults to an element dict. Element values override defaults."""
    if not defaults:
        return raw_element

    result = dict(raw_element)
    for key, default_val in defaults.items():
        if key not in result:
            # Wrap origin default in a list (origin is list[dict])
            if key == "origin":
                result[key] = [default_val] if isinstance(default_val, dict) else default_val
            else:
                result[key] = default_val
    return result


def _parse_element(raw: dict, category: str, doc: Document) -> Element:
    """Parse a raw YAML dict into an Element."""
    raw = _apply_defaults(raw, doc.defaults)

    # Extract common fields
    elem_id = raw.get("id", "")
    name = raw.get("name", "")
    status = raw.get("status", "active")
    tags = raw.get("tags") or []
    maps_to = raw.get("maps_to") or []
    origin = raw.get("origin") or []
    updated_by = raw.get("updated_by") or []

    # Everything else goes into fields
    fields = {
        k: v for k, v in raw.items()
        if k not in ELEMENT_ATTRS
    }

    return Element(
        id=elem_id,
        category=category,
        name=name,
        status=status,
        tags=tags,
        maps_to=maps_to,
        origin=origin if isinstance(origin, list) else [origin],
        updated_by=updated_by if isinstance(updated_by, list) else [updated_by],
        fields=fields,
        document=doc,
    )


def load_document(path: Path) -> Document:
    """Load a single GVP YAML file into a Document."""
    with open(path) as f:
        data = yaml.safe_load(f) or {}

    meta = data.get("meta") or {}
    doc = Document(
        name=meta.get("name", path.stem),
        filename=path.name,
        path=path,
        inherits=meta.get("inherits"),
        scope_label=meta.get("scope"),
        id_prefix=meta.get("id_prefix"),
        defaults=meta.get("defaults") or {},
        elements=[],
    )

    # Parse elements from each category
    for yaml_key, category in CATEGORY_MAP.items():
        items = data.get(yaml_key)
        if not items:
            continue
        for raw in items:
            elem = _parse_element(raw, category, doc)
            doc.elements.append(elem)

    return doc


def load_library(library_path: Path) -> tuple[list[Document], dict[str, dict]]:
    """Load all documents and tags from a library directory.

    Returns:
        (documents, tags) tuple.
    """
    tags = _load_tags(library_path)
    documents: list[Document] = []

    # Find all YAML files recursively, skip known non-document files
    for yaml_file in sorted(library_path.rglob("*.yaml")):
        if yaml_file.name in SKIP_FILES:
            continue
        doc = load_document(yaml_file)
        documents.append(doc)

    return documents, tags


def load_catalog(cfg: GVPConfig) -> Catalog:
    """Load all libraries into a Catalog."""
    catalog = Catalog()

    for lib_path in cfg.libraries:
        if not lib_path.exists():
            print(f"W003: library path does not exist: {lib_path}", file=sys.stderr)
            continue

        if lib_path.is_file():
            # .gvp.yaml — single document treated as a library
            doc = load_document(lib_path)
            if doc.name in catalog.documents:
                if cfg.strict:
                    raise ValueError(
                        f"Duplicate document name '{doc.name}': "
                        f"{catalog.documents[doc.name].path} and {doc.path}"
                    )
                print(
                    f"W002: duplicate document name '{doc.name}', "
                    f"keeping {catalog.documents[doc.name].path}",
                    file=sys.stderr,
                )
                continue
            catalog.add_document(doc)
            continue

        docs, tags = load_library(lib_path)

        # Merge tags (first library wins on collision)
        for tag_name, tag_def in tags.items():
            if tag_name not in catalog.tags:
                catalog.tags[tag_name] = tag_def

        # Add documents (first library wins on name collision)
        for doc in docs:
            if doc.name in catalog.documents:
                if cfg.strict:
                    raise ValueError(
                        f"Duplicate document name '{doc.name}': "
                        f"{catalog.documents[doc.name].path} and {doc.path}"
                    )
                print(
                    f"W002: duplicate document name '{doc.name}', "
                    f"keeping {catalog.documents[doc.name].path}",
                    file=sys.stderr,
                )
                continue
            catalog.add_document(doc)

    return catalog
```

**Step 4: Run tests to verify they pass**

Run: `pytest tests/test_loader.py -v`
Expected: all PASS

**Step 5: Commit**

```bash
git add src/gvp/loader.py tests/test_loader.py
git commit -m "feat: YAML loader with defaults merging and catalog construction"
```

---

## Task 5: Validate Command (`commands/validate.py`)

**Files:**
- Create: `src/gvp/commands/__init__.py`
- Create: `src/gvp/commands/validate.py`
- Create: `tests/commands/__init__.py`
- Create: `tests/commands/test_validate.py`

**Step 1: Write the failing tests**

```python
# tests/commands/test_validate.py
"""Tests for gvp validate command."""

from pathlib import Path

from gvp.commands.validate import validate_catalog
from gvp.config import GVPConfig
from gvp.loader import load_catalog


class TestValidateCatalog:
    def test_real_gvp_docs_passes(self, gvp_docs_library: Path):
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
            "domains:\n  code:\n    description: Code\n"
            "concerns: {}\n"
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
            "meta:\n  name: test\n  inherits: nonexistent\n"
            "values: []\n"
        )
        cfg = GVPConfig(libraries=[lib])
        catalog = load_catalog(cfg)
        errors, _ = validate_catalog(catalog)
        assert any("nonexistent" in e for e in errors)

    def test_circular_inherits(self, tmp_path: Path):
        lib = tmp_path / "lib"
        lib.mkdir()
        (lib / "a.yaml").write_text(
            "meta:\n  name: a\n  inherits: b\nvalues: []\n"
        )
        (lib / "b.yaml").write_text(
            "meta:\n  name: b\n  inherits: a\nvalues: []\n"
        )
        cfg = GVPConfig(libraries=[lib])
        catalog = load_catalog(cfg)
        errors, _ = validate_catalog(catalog)
        assert any("circular" in e.lower() for e in errors)

    def test_empty_document_warning(self, tmp_path: Path):
        lib = tmp_path / "lib"
        lib.mkdir()
        (lib / "empty.yaml").write_text(
            "meta:\n  name: empty\n  scope: test\n"
        )
        cfg = GVPConfig(libraries=[lib])
        catalog = load_catalog(cfg)
        _, warnings = validate_catalog(catalog)
        assert any("W001" in w for w in warnings)
```

**Step 2: Run tests to verify they fail**

Run: `pytest tests/commands/test_validate.py -v`
Expected: FAIL — cannot import

**Step 3: Write the implementation**

```python
# src/gvp/commands/__init__.py
```

```python
# src/gvp/commands/validate.py
"""Validate command: check catalog for errors and warnings."""

from __future__ import annotations

import re

from gvp.model import Catalog


def validate_catalog(catalog: Catalog) -> tuple[list[str], list[str]]:
    """Validate the catalog. Returns (errors, warnings)."""
    errors: list[str] = []
    warnings: list[str] = []

    # Check maps_to references
    for qid, elem in catalog.elements.items():
        for ref in elem.maps_to:
            if ref not in catalog.elements:
                errors.append(f"{qid}: broken maps_to reference '{ref}'")

    # Check tags exist
    for qid, elem in catalog.elements.items():
        for tag in elem.tags:
            if tag not in catalog.tags:
                errors.append(f"{qid}: undefined tag '{tag}'")

    # Check ID sequences (no gaps per category per document)
    for doc in catalog.documents.values():
        by_category: dict[str, list[str]] = {}
        for elem in doc.elements:
            by_category.setdefault(elem.category, []).append(elem.id)

        for category, ids in by_category.items():
            # Extract numeric suffixes and check for gaps
            nums: list[tuple[int, str]] = []
            for eid in ids:
                match = re.search(r"(\d+)$", eid)
                if match:
                    nums.append((int(match.group(1)), eid))
            nums.sort()
            for i, (num, eid) in enumerate(nums):
                expected = i + 1
                if num != expected:
                    prefix = re.sub(r"\d+$", "", eid)
                    errors.append(
                        f"{doc.name}: ID gap in {category} — "
                        f"expected {prefix}{expected}, found {eid}"
                    )
                    break

    # Check inherits chains
    for doc in catalog.documents.values():
        if doc.inherits and doc.inherits not in catalog.documents:
            errors.append(
                f"{doc.name}: broken inherits reference '{doc.inherits}'"
            )

    # Check for circular inheritance
    for doc in catalog.documents.values():
        visited: set[str] = set()
        current = doc
        while current.inherits:
            if current.name in visited:
                errors.append(
                    f"{doc.name}: circular inheritance detected"
                )
                break
            visited.add(current.name)
            parent = catalog.documents.get(current.inherits)
            if parent is None:
                break
            current = parent

    # Warn on empty documents
    for doc in catalog.documents.values():
        if not doc.elements:
            warnings.append(f"W001: empty document '{doc.name}' ({doc.path})")

    return errors, warnings
```

**Step 4: Run tests to verify they pass**

Run: `pytest tests/commands/test_validate.py -v`
Expected: all PASS

**Step 5: Commit**

```bash
git add src/gvp/commands/ tests/commands/
git commit -m "feat: validate command with reference, tag, ID, and chain checks"
```

---

## Task 6: Query Command (`commands/query.py`)

**Files:**
- Create: `src/gvp/commands/query.py`
- Create: `tests/commands/test_query.py`

**Step 1: Write the failing tests**

```python
# tests/commands/test_query.py
"""Tests for gvp query command."""

from pathlib import Path

from gvp.commands.query import query_catalog
from gvp.config import GVPConfig
from gvp.loader import load_catalog


class TestQueryCatalog:
    def test_filter_by_tag(self, gvp_docs_library: Path):
        cfg = GVPConfig(libraries=[gvp_docs_library])
        catalog = load_catalog(cfg)
        results = query_catalog(catalog, tags=["code"])
        assert len(results) > 0
        assert all("code" in e.tags for e in results)

    def test_filter_by_category(self, gvp_docs_library: Path):
        cfg = GVPConfig(libraries=[gvp_docs_library])
        catalog = load_catalog(cfg)
        results = query_catalog(catalog, categories=["heuristic"])
        assert len(results) > 0
        assert all(e.category == "heuristic" for e in results)

    def test_filter_by_tag_and_category(self, gvp_docs_library: Path):
        cfg = GVPConfig(libraries=[gvp_docs_library])
        catalog = load_catalog(cfg)
        results = query_catalog(catalog, tags=["code"], categories=["heuristic"])
        assert len(results) > 0
        assert all(e.category == "heuristic" and "code" in e.tags for e in results)

    def test_filter_by_document(self, gvp_docs_library: Path):
        cfg = GVPConfig(libraries=[gvp_docs_library])
        catalog = load_catalog(cfg)
        results = query_catalog(catalog, document="personal")
        assert len(results) > 0
        assert all(e.document.name == "personal" for e in results)

    def test_filter_by_status(self, gvp_docs_library: Path):
        cfg = GVPConfig(libraries=[gvp_docs_library])
        catalog = load_catalog(cfg)
        results = query_catalog(catalog, status="active")
        assert all(e.status == "active" for e in results)

    def test_no_filters_returns_all(self, gvp_docs_library: Path):
        cfg = GVPConfig(libraries=[gvp_docs_library])
        catalog = load_catalog(cfg)
        results = query_catalog(catalog)
        assert len(results) == len(catalog.elements)

    def test_no_matches_returns_empty(self, gvp_docs_library: Path):
        cfg = GVPConfig(libraries=[gvp_docs_library])
        catalog = load_catalog(cfg)
        results = query_catalog(catalog, tags=["nonexistent_tag_xyz"])
        assert results == []
```

**Step 2: Run tests to verify they fail**

Run: `pytest tests/commands/test_query.py -v`
Expected: FAIL

**Step 3: Write the implementation**

```python
# src/gvp/commands/query.py
"""Query command: filter elements from the catalog."""

from __future__ import annotations

from gvp.model import Catalog, Element


def query_catalog(
    catalog: Catalog,
    tags: list[str] | None = None,
    categories: list[str] | None = None,
    document: str | None = None,
    status: str | None = None,
) -> list[Element]:
    """Filter elements from the catalog.

    All filters are AND (intersection). Within tags, all must match.
    """
    results = list(catalog.elements.values())

    if tags:
        results = [e for e in results if all(t in e.tags for t in tags)]

    if categories:
        results = [e for e in results if e.category in categories]

    if document:
        results = [e for e in results if e.document.name == document]

    if status:
        results = [e for e in results if e.status == status]

    return results
```

**Step 4: Run tests to verify they pass**

Run: `pytest tests/commands/test_query.py -v`
Expected: all PASS

**Step 5: Commit**

```bash
git add src/gvp/commands/query.py tests/commands/test_query.py
git commit -m "feat: query command with tag, category, document, and status filters"
```

---

## Task 7: Trace Command (`commands/trace.py`)

**Files:**
- Create: `src/gvp/commands/trace.py`
- Create: `tests/commands/test_trace.py`

**Step 1: Write the failing tests**

```python
# tests/commands/test_trace.py
"""Tests for gvp trace command."""

from pathlib import Path

from gvp.commands.trace import trace_element, format_trace_tree
from gvp.config import GVPConfig
from gvp.loader import load_catalog


class TestTraceElement:
    def test_trace_ancestors(self, gvp_docs_library: Path):
        cfg = GVPConfig(libraries=[gvp_docs_library])
        catalog = load_catalog(cfg)
        h5 = catalog.elements["personal:H5"]
        tree = trace_element(catalog, h5, reverse=False)
        # H5 maps to P5, V6, V7
        child_ids = {str(node["element"]) for node in tree["children"]}
        assert "personal:P5" in child_ids

    def test_trace_descendants(self, gvp_docs_library: Path):
        cfg = GVPConfig(libraries=[gvp_docs_library])
        catalog = load_catalog(cfg)
        v6 = catalog.elements["personal:V6"]
        tree = trace_element(catalog, v6, reverse=True)
        # Multiple things map to V6
        child_ids = {str(node["element"]) for node in tree["children"]}
        assert len(child_ids) > 0

    def test_trace_handles_dag(self, gvp_docs_library: Path):
        cfg = GVPConfig(libraries=[gvp_docs_library])
        catalog = load_catalog(cfg)
        h5 = catalog.elements["personal:H5"]
        tree = trace_element(catalog, h5, reverse=False)
        # Should not infinite-loop on shared nodes
        assert tree is not None


class TestFormatTraceTree:
    def test_text_output(self, gvp_docs_library: Path):
        cfg = GVPConfig(libraries=[gvp_docs_library])
        catalog = load_catalog(cfg)
        h5 = catalog.elements["personal:H5"]
        tree = trace_element(catalog, h5, reverse=False)
        text = format_trace_tree(tree, fmt="text")
        assert "personal:H5" in text
        assert "personal:P5" in text

    def test_json_output(self, gvp_docs_library: Path):
        import json
        cfg = GVPConfig(libraries=[gvp_docs_library])
        catalog = load_catalog(cfg)
        h5 = catalog.elements["personal:H5"]
        tree = trace_element(catalog, h5, reverse=False)
        output = format_trace_tree(tree, fmt="json")
        parsed = json.loads(output)
        assert "element" in parsed
        assert "children" in parsed
```

**Step 2: Run tests to verify they fail**

Run: `pytest tests/commands/test_trace.py -v`
Expected: FAIL

**Step 3: Write the implementation**

```python
# src/gvp/commands/trace.py
"""Trace command: walk the catalog graph from a given element."""

from __future__ import annotations

import json

from gvp.model import Catalog, Element


def trace_element(
    catalog: Catalog,
    element: Element,
    reverse: bool = False,
) -> dict:
    """Build a trace tree from an element.

    Args:
        catalog: The loaded catalog.
        element: The root element to trace from.
        reverse: If False, follow maps_to (ancestors). If True, find descendants.

    Returns:
        A tree dict: {"element": Element, "children": [...], "seen": bool}
    """
    seen: set[str] = set()

    def _build(elem: Element) -> dict:
        qid = str(elem)
        is_seen = qid in seen
        seen.add(qid)

        children = []
        if not is_seen:
            if reverse:
                targets = [
                    e for e in catalog.elements.values()
                    if qid in e.maps_to
                ]
            else:
                targets = [
                    catalog.elements[ref]
                    for ref in elem.maps_to
                    if ref in catalog.elements
                ]
            children = [_build(t) for t in targets]

        return {"element": elem, "children": children, "seen": is_seen}

    return _build(element)


def format_trace_tree(tree: dict, fmt: str = "text") -> str:
    """Format a trace tree for output.

    Args:
        tree: Tree dict from trace_element.
        fmt: "text" for indented tree, "json" for JSON.
    """
    if fmt == "json":
        return json.dumps(_tree_to_json(tree), indent=2)
    return _tree_to_text(tree)


def _tree_to_json(tree: dict) -> dict:
    """Convert trace tree to JSON-serializable dict."""
    elem = tree["element"]
    result = {
        "element": str(elem),
        "name": elem.name,
        "category": elem.category,
        "tags": elem.tags,
    }
    if "statement" in elem.fields:
        result["statement"] = elem.fields["statement"]
    if tree["seen"]:
        result["seen_above"] = True
    if tree["children"]:
        result["children"] = [_tree_to_json(c) for c in tree["children"]]
    return result


def _tree_to_text(tree: dict, prefix: str = "", is_last: bool = True) -> str:
    """Render trace tree as indented text."""
    lines: list[str] = []
    elem = tree["element"]

    # Connector characters
    if prefix:
        connector = "\u2514\u2500 " if is_last else "\u251c\u2500 "
    else:
        connector = ""

    # Element line
    line = f"{prefix}{connector}{elem}: {elem.name}"
    if tree["seen"]:
        line += "  (\u2191 see above)"
    lines.append(line)

    # Statement (if present and not a backreference)
    if not tree["seen"] and "statement" in elem.fields:
        stmt = elem.fields["statement"].strip()
        # Truncate long statements
        if len(stmt) > 120:
            stmt = stmt[:117] + "..."
        child_prefix = prefix + ("   " if is_last else "\u2502  ")
        if prefix:
            lines.append(f"{child_prefix}{stmt}")
        else:
            lines.append(f"   {stmt}")

    # Children
    children = tree["children"]
    for i, child in enumerate(children):
        child_is_last = i == len(children) - 1
        child_prefix = prefix + ("   " if is_last else "\u2502  ")
        if not prefix:
            child_prefix = "   "
        lines.append(_tree_to_text(child, child_prefix, child_is_last))

    return "\n".join(lines)
```

**Step 4: Run tests to verify they pass**

Run: `pytest tests/commands/test_trace.py -v`
Expected: all PASS

**Step 5: Commit**

```bash
git add src/gvp/commands/trace.py tests/commands/test_trace.py
git commit -m "feat: trace command with text tree and JSON output"
```

---

## Task 8: Markdown Renderer (`renderers/markdown.py`)

**Files:**
- Create: `src/gvp/renderers/__init__.py`
- Create: `src/gvp/renderers/markdown.py`
- Create: `tests/renderers/__init__.py`
- Create: `tests/renderers/test_markdown.py`

**Step 1: Write the failing tests**

```python
# tests/renderers/test_markdown.py
"""Tests for markdown renderer."""

from pathlib import Path

from gvp.renderers.markdown import render_markdown
from gvp.config import GVPConfig
from gvp.loader import load_catalog


class TestRenderMarkdown:
    def test_renders_all_documents(self, gvp_docs_library: Path):
        cfg = GVPConfig(libraries=[gvp_docs_library])
        catalog = load_catalog(cfg)
        output = render_markdown(catalog)
        # Should have a section for each document
        assert "personal" in output
        assert "unturned" in output

    def test_renders_elements_with_ids(self, gvp_docs_library: Path):
        cfg = GVPConfig(libraries=[gvp_docs_library])
        catalog = load_catalog(cfg)
        output = render_markdown(catalog)
        assert "V1" in output
        assert "Transparency" in output

    def test_renders_to_file(self, gvp_docs_library: Path, tmp_path: Path):
        cfg = GVPConfig(libraries=[gvp_docs_library])
        catalog = load_catalog(cfg)
        output_dir = tmp_path / "generated"
        render_markdown(catalog, output_dir=output_dir)
        # Should create at least one .md file
        md_files = list(output_dir.glob("*.md"))
        assert len(md_files) > 0

    def test_excludes_deprecated_by_default(self, tmp_path: Path):
        lib = tmp_path / "lib"
        lib.mkdir()
        (lib / "test.yaml").write_text(
            "meta:\n  name: test\n"
            "values:\n"
            "  - id: V1\n    name: Active\n    statement: Active.\n"
            "    tags: []\n    maps_to: []\n"
            "  - id: V2\n    name: Old\n    statement: Old.\n"
            "    status: deprecated\n    tags: []\n    maps_to: []\n"
        )
        cfg = GVPConfig(libraries=[lib])
        catalog = load_catalog(cfg)
        output = render_markdown(catalog)
        assert "Active" in output
        assert "Old" not in output

    def test_include_deprecated_flag(self, tmp_path: Path):
        lib = tmp_path / "lib"
        lib.mkdir()
        (lib / "test.yaml").write_text(
            "meta:\n  name: test\n"
            "values:\n"
            "  - id: V1\n    name: Active\n    statement: Active.\n"
            "    tags: []\n    maps_to: []\n"
            "  - id: V2\n    name: Old\n    statement: Old.\n"
            "    status: deprecated\n    tags: []\n    maps_to: []\n"
        )
        cfg = GVPConfig(libraries=[lib])
        catalog = load_catalog(cfg)
        output = render_markdown(catalog, include_deprecated=True)
        assert "Old" in output
```

**Step 2: Run tests to verify they fail**

Run: `pytest tests/renderers/test_markdown.py -v`
Expected: FAIL

**Step 3: Write the implementation**

```python
# src/gvp/renderers/__init__.py
```

```python
# src/gvp/renderers/markdown.py
"""Render catalog to markdown."""

from __future__ import annotations

from pathlib import Path

from gvp.model import Catalog, Document, Element


# Category display order and plural labels
CATEGORY_ORDER = [
    ("value", "Values"),
    ("principle", "Principles"),
    ("heuristic", "Heuristics"),
    ("rule", "Rules"),
    ("goal", "Goals"),
    ("milestone", "Milestones"),
    ("design_choice", "Design Choices"),
    ("constraint", "Constraints"),
    ("implementation_rule", "Implementation Rules"),
    ("coding_principle", "Coding Principles"),
]


def _render_element(elem: Element) -> str:
    """Render a single element to markdown."""
    lines = [f"### {elem.id}: {elem.name}"]

    if elem.status != "active":
        lines.append(f"\n**Status:** {elem.status}")

    if elem.tags:
        lines.append(f"\n**Tags:** {', '.join(elem.tags)}")

    if elem.maps_to:
        lines.append(f"\n**Maps to:** {', '.join(elem.maps_to)}")

    # Type-specific fields
    for key in ("statement", "rationale", "impact", "description"):
        if key in elem.fields:
            lines.append(f"\n{elem.fields[key].strip()}")
            break

    # Progress (milestones)
    if "progress" in elem.fields:
        lines.append(f"\n**Progress:** {elem.fields['progress']}")

    return "\n".join(lines)


def _render_document(doc: Document, include_deprecated: bool = False) -> str:
    """Render a single document to markdown."""
    lines = [f"# {doc.name}"]

    if doc.scope_label:
        lines.append(f"\n**Scope:** {doc.scope_label}")

    if doc.inherits:
        lines.append(f"\n**Inherits:** {doc.inherits}")

    for category, label in CATEGORY_ORDER:
        elems = [
            e for e in doc.elements
            if e.category == category
            and (include_deprecated or e.status == "active")
        ]
        if not elems:
            continue

        lines.append(f"\n## {label}\n")
        for elem in elems:
            lines.append(_render_element(elem))
            lines.append("")

    return "\n".join(lines)


def render_markdown(
    catalog: Catalog,
    output_dir: Path | None = None,
    include_deprecated: bool = False,
) -> str:
    """Render the catalog to markdown.

    If output_dir is given, writes one .md file per document.
    Always returns the combined markdown as a string.
    """
    sections: list[str] = []

    for doc in catalog.documents.values():
        md = _render_document(doc, include_deprecated=include_deprecated)
        sections.append(md)

        if output_dir:
            output_dir.mkdir(parents=True, exist_ok=True)
            out_file = output_dir / f"{doc.name}.md"
            out_file.write_text(md + "\n")

    return "\n\n---\n\n".join(sections)
```

**Step 4: Run tests to verify they pass**

Run: `pytest tests/renderers/test_markdown.py -v`
Expected: all PASS

**Step 5: Commit**

```bash
git add src/gvp/renderers/ tests/renderers/
git commit -m "feat: markdown renderer with per-document output and deprecated filtering"
```

---

## Task 9: CSV Renderer (`renderers/csv.py`)

**Files:**
- Create: `src/gvp/renderers/csv.py`
- Create: `tests/renderers/test_csv.py`

**Step 1: Write the failing tests**

```python
# tests/renderers/test_csv.py
"""Tests for CSV renderer."""

import csv
import io
from pathlib import Path

from gvp.renderers.csv import render_csv
from gvp.config import GVPConfig
from gvp.loader import load_catalog


class TestRenderCSV:
    def test_renders_header(self, gvp_docs_library: Path):
        cfg = GVPConfig(libraries=[gvp_docs_library])
        catalog = load_catalog(cfg)
        output = render_csv(catalog)
        reader = csv.reader(io.StringIO(output))
        header = next(reader)
        assert "id" in header
        assert "name" in header
        assert "category" in header
        assert "document" in header

    def test_renders_all_active_elements(self, gvp_docs_library: Path):
        cfg = GVPConfig(libraries=[gvp_docs_library])
        catalog = load_catalog(cfg)
        output = render_csv(catalog)
        reader = csv.reader(io.StringIO(output))
        next(reader)  # skip header
        rows = list(reader)
        active = [e for e in catalog.elements.values() if e.status == "active"]
        assert len(rows) == len(active)

    def test_writes_to_file(self, gvp_docs_library: Path, tmp_path: Path):
        cfg = GVPConfig(libraries=[gvp_docs_library])
        catalog = load_catalog(cfg)
        output_dir = tmp_path / "generated"
        render_csv(catalog, output_dir=output_dir)
        csv_files = list(output_dir.glob("*.csv"))
        assert len(csv_files) == 1
```

**Step 2: Run tests, verify fail, write implementation**

```python
# src/gvp/renderers/csv.py
"""Render catalog to CSV."""

from __future__ import annotations

import csv
import io
from pathlib import Path

from gvp.model import Catalog


COLUMNS = [
    "qualified_id", "id", "document", "category", "name",
    "status", "tags", "maps_to", "statement",
]


def render_csv(
    catalog: Catalog,
    output_dir: Path | None = None,
    include_deprecated: bool = False,
) -> str:
    """Render the catalog to CSV. Returns CSV string."""
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(COLUMNS)

    for qid, elem in sorted(catalog.elements.items()):
        if not include_deprecated and elem.status != "active":
            continue

        statement = elem.fields.get("statement") or elem.fields.get("rationale") or ""
        writer.writerow([
            qid,
            elem.id,
            elem.document.name,
            elem.category,
            elem.name,
            elem.status,
            ";".join(elem.tags),
            ";".join(elem.maps_to),
            statement.strip(),
        ])

    result = output.getvalue()

    if output_dir:
        output_dir.mkdir(parents=True, exist_ok=True)
        (output_dir / "gvp.csv").write_text(result)

    return result
```

**Step 3: Run tests to verify they pass**

Run: `pytest tests/renderers/test_csv.py -v`
Expected: all PASS

**Step 4: Commit**

```bash
git add src/gvp/renderers/csv.py tests/renderers/test_csv.py
git commit -m "feat: CSV renderer"
```

---

## Task 10: SQLite Renderer (`renderers/sqlite.py`)

**Files:**
- Create: `src/gvp/renderers/sqlite.py`
- Create: `tests/renderers/test_sqlite.py`

**Step 1: Write the failing tests**

```python
# tests/renderers/test_sqlite.py
"""Tests for SQLite renderer."""

import sqlite3
from pathlib import Path

from gvp.renderers.sqlite import render_sqlite
from gvp.config import GVPConfig
from gvp.loader import load_catalog


class TestRenderSQLite:
    def test_creates_database(self, gvp_docs_library: Path, tmp_path: Path):
        cfg = GVPConfig(libraries=[gvp_docs_library])
        catalog = load_catalog(cfg)
        db_path = tmp_path / "gvp.db"
        render_sqlite(catalog, db_path)
        assert db_path.exists()

    def test_elements_table(self, gvp_docs_library: Path, tmp_path: Path):
        cfg = GVPConfig(libraries=[gvp_docs_library])
        catalog = load_catalog(cfg)
        db_path = tmp_path / "gvp.db"
        render_sqlite(catalog, db_path)

        conn = sqlite3.connect(db_path)
        rows = conn.execute("SELECT COUNT(*) FROM elements").fetchone()
        assert rows[0] > 0
        conn.close()

    def test_mappings_table(self, gvp_docs_library: Path, tmp_path: Path):
        cfg = GVPConfig(libraries=[gvp_docs_library])
        catalog = load_catalog(cfg)
        db_path = tmp_path / "gvp.db"
        render_sqlite(catalog, db_path)

        conn = sqlite3.connect(db_path)
        rows = conn.execute("SELECT COUNT(*) FROM mappings").fetchone()
        assert rows[0] > 0
        conn.close()

    def test_tags_table(self, gvp_docs_library: Path, tmp_path: Path):
        cfg = GVPConfig(libraries=[gvp_docs_library])
        catalog = load_catalog(cfg)
        db_path = tmp_path / "gvp.db"
        render_sqlite(catalog, db_path)

        conn = sqlite3.connect(db_path)
        rows = conn.execute("SELECT COUNT(*) FROM element_tags").fetchone()
        assert rows[0] > 0
        conn.close()

    def test_queryable(self, gvp_docs_library: Path, tmp_path: Path):
        cfg = GVPConfig(libraries=[gvp_docs_library])
        catalog = load_catalog(cfg)
        db_path = tmp_path / "gvp.db"
        render_sqlite(catalog, db_path)

        conn = sqlite3.connect(db_path)
        rows = conn.execute(
            "SELECT e.qualified_id, e.name FROM elements e "
            "JOIN element_tags et ON e.qualified_id = et.qualified_id "
            "WHERE et.tag = 'code' AND e.category = 'heuristic'"
        ).fetchall()
        assert len(rows) > 0
        conn.close()
```

**Step 2: Run tests, verify fail, write implementation**

```python
# src/gvp/renderers/sqlite.py
"""Render catalog to SQLite database."""

from __future__ import annotations

import json
import sqlite3
from pathlib import Path

from gvp.model import Catalog


SCHEMA = """
CREATE TABLE IF NOT EXISTS documents (
    name TEXT PRIMARY KEY,
    filename TEXT,
    path TEXT,
    inherits TEXT,
    scope_label TEXT,
    id_prefix TEXT
);

CREATE TABLE IF NOT EXISTS elements (
    qualified_id TEXT PRIMARY KEY,
    id TEXT,
    document TEXT REFERENCES documents(name),
    category TEXT,
    name TEXT,
    status TEXT DEFAULT 'active',
    statement TEXT,
    fields_json TEXT
);

CREATE TABLE IF NOT EXISTS element_tags (
    qualified_id TEXT REFERENCES elements(qualified_id),
    tag TEXT,
    PRIMARY KEY (qualified_id, tag)
);

CREATE TABLE IF NOT EXISTS mappings (
    source TEXT REFERENCES elements(qualified_id),
    target TEXT,
    PRIMARY KEY (source, target)
);

CREATE TABLE IF NOT EXISTS tags (
    name TEXT PRIMARY KEY,
    type TEXT,
    description TEXT
);
"""


def render_sqlite(
    catalog: Catalog,
    db_path: Path,
    include_deprecated: bool = False,
) -> None:
    """Render the catalog to a SQLite database."""
    db_path.parent.mkdir(parents=True, exist_ok=True)
    if db_path.exists():
        db_path.unlink()

    conn = sqlite3.connect(db_path)
    conn.executescript(SCHEMA)

    # Documents
    for doc in catalog.documents.values():
        conn.execute(
            "INSERT INTO documents VALUES (?, ?, ?, ?, ?, ?)",
            (doc.name, doc.filename, str(doc.path), doc.inherits,
             doc.scope_label, doc.id_prefix),
        )

    # Elements
    for qid, elem in catalog.elements.items():
        if not include_deprecated and elem.status != "active":
            continue
        statement = elem.fields.get("statement") or elem.fields.get("rationale") or ""
        conn.execute(
            "INSERT INTO elements VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (qid, elem.id, elem.document.name, elem.category,
             elem.name, elem.status, statement.strip(),
             json.dumps(elem.fields)),
        )

        for tag in elem.tags:
            conn.execute(
                "INSERT INTO element_tags VALUES (?, ?)",
                (qid, tag),
            )

        for ref in elem.maps_to:
            conn.execute(
                "INSERT INTO mappings VALUES (?, ?)",
                (qid, ref),
            )

    # Tags
    for tag_name, tag_def in catalog.tags.items():
        conn.execute(
            "INSERT INTO tags VALUES (?, ?, ?)",
            (tag_name, tag_def.get("type", ""), tag_def.get("description", "")),
        )

    conn.commit()
    conn.close()
```

**Step 3: Run tests to verify they pass**

Run: `pytest tests/renderers/test_sqlite.py -v`
Expected: all PASS

**Step 4: Commit**

```bash
git add src/gvp/renderers/sqlite.py tests/renderers/test_sqlite.py
git commit -m "feat: SQLite renderer with elements, mappings, and tags tables"
```

---

## Task 11: DOT Renderer (`renderers/dot.py`)

**Files:**
- Create: `src/gvp/renderers/dot.py`
- Create: `tests/renderers/test_dot.py`

**Step 1: Write the failing tests**

```python
# tests/renderers/test_dot.py
"""Tests for DOT/graphviz renderer."""

from pathlib import Path

from gvp.renderers.dot import render_dot
from gvp.config import GVPConfig
from gvp.loader import load_catalog


class TestRenderDot:
    def test_renders_valid_dot(self, gvp_docs_library: Path):
        cfg = GVPConfig(libraries=[gvp_docs_library])
        catalog = load_catalog(cfg)
        output = render_dot(catalog)
        assert output.startswith("digraph")
        assert "}" in output

    def test_contains_nodes(self, gvp_docs_library: Path):
        cfg = GVPConfig(libraries=[gvp_docs_library])
        catalog = load_catalog(cfg)
        output = render_dot(catalog)
        assert "personal__V1" in output or "personal:V1" in output

    def test_contains_edges(self, gvp_docs_library: Path):
        cfg = GVPConfig(libraries=[gvp_docs_library])
        catalog = load_catalog(cfg)
        output = render_dot(catalog)
        assert "->" in output

    def test_writes_to_file(self, gvp_docs_library: Path, tmp_path: Path):
        cfg = GVPConfig(libraries=[gvp_docs_library])
        catalog = load_catalog(cfg)
        output_dir = tmp_path / "generated"
        render_dot(catalog, output_dir=output_dir)
        dot_files = list(output_dir.glob("*.dot"))
        assert len(dot_files) == 1
```

**Step 2: Run tests, verify fail, write implementation**

```python
# src/gvp/renderers/dot.py
"""Render catalog to DOT (graphviz) format."""

from __future__ import annotations

from pathlib import Path

from gvp.model import Catalog

# Colors by category
CATEGORY_COLORS = {
    "value": "#4A90D9",
    "principle": "#7B68EE",
    "heuristic": "#50C878",
    "rule": "#DC143C",
    "goal": "#FFD700",
    "milestone": "#FFA500",
    "design_choice": "#20B2AA",
    "constraint": "#A9A9A9",
    "implementation_rule": "#CD5C5C",
    "coding_principle": "#9370DB",
}


def _node_id(qualified_id: str) -> str:
    """Convert qualified ID to valid DOT node ID."""
    return qualified_id.replace(":", "__").replace("-", "_")


def render_dot(
    catalog: Catalog,
    output_dir: Path | None = None,
    include_deprecated: bool = False,
) -> str:
    """Render the catalog as a DOT digraph."""
    lines = [
        "digraph gvp {",
        '  rankdir=BT;',
        '  node [shape=box, style="rounded,filled", fontname="sans-serif"];',
        '  edge [color="#666666"];',
        "",
    ]

    # Subgraphs per document
    for doc in catalog.documents.values():
        lines.append(f"  subgraph cluster_{_node_id(doc.name)} {{")
        lines.append(f'    label="{doc.name}";')
        lines.append('    style="dashed";')
        lines.append(f'    color="#999999";')

        for elem in doc.elements:
            if not include_deprecated and elem.status != "active":
                continue
            nid = _node_id(str(elem))
            color = CATEGORY_COLORS.get(elem.category, "#CCCCCC")
            label = f"{elem.id}\\n{elem.name}"
            lines.append(
                f'    {nid} [label="{label}", fillcolor="{color}", '
                f'fontcolor="white"];'
            )

        lines.append("  }")
        lines.append("")

    # Edges
    for qid, elem in catalog.elements.items():
        if not include_deprecated and elem.status != "active":
            continue
        src = _node_id(qid)
        for ref in elem.maps_to:
            if ref in catalog.elements:
                tgt = _node_id(ref)
                lines.append(f"  {src} -> {tgt};")

    lines.append("}")

    result = "\n".join(lines)

    if output_dir:
        output_dir.mkdir(parents=True, exist_ok=True)
        (output_dir / "gvp.dot").write_text(result)

    return result
```

**Step 3: Run tests, verify pass, commit**

Run: `pytest tests/renderers/test_dot.py -v`
Expected: all PASS

```bash
git add src/gvp/renderers/dot.py tests/renderers/test_dot.py
git commit -m "feat: DOT/graphviz renderer with category colors and document clusters"
```

---

## Task 12: Add Command (`commands/add.py`)

**Files:**
- Create: `src/gvp/commands/add.py`
- Create: `tests/commands/test_add.py`

**Step 1: Write the failing tests**

```python
# tests/commands/test_add.py
"""Tests for gvp add command."""

from pathlib import Path

import yaml

from gvp.commands.add import add_element, next_id
from gvp.config import GVPConfig
from gvp.loader import load_catalog


class TestNextId:
    def test_first_element(self):
        assert next_id("value", [], prefix=None) == "V1"

    def test_sequential(self):
        existing = ["V1", "V2", "V3"]
        assert next_id("value", existing, prefix=None) == "V4"

    def test_with_prefix(self):
        assert next_id("value", [], prefix="U") == "UV1"

    def test_all_categories(self):
        assert next_id("principle", [], prefix=None) == "P1"
        assert next_id("heuristic", [], prefix=None) == "H1"
        assert next_id("rule", [], prefix=None) == "R1"
        assert next_id("goal", [], prefix=None) == "G1"
        assert next_id("milestone", [], prefix=None) == "M1"
        assert next_id("design_choice", [], prefix=None) == "D1"
        assert next_id("constraint", [], prefix=None) == "CON1"
        assert next_id("implementation_rule", [], prefix=None) == "IR1"
        assert next_id("coding_principle", [], prefix=None) == "C1"


class TestAddElement:
    def test_adds_to_file(self, tmp_path: Path):
        lib = tmp_path / "lib"
        lib.mkdir()
        doc_path = lib / "test.yaml"
        doc_path.write_text(
            "meta:\n  name: test\n  scope: test\n\n"
            "values:\n"
            "  - id: V1\n    name: Existing\n    statement: Exists.\n"
            "    tags: []\n    maps_to: []\n"
        )

        cfg = GVPConfig(libraries=[lib])
        catalog = load_catalog(cfg)

        add_element(
            catalog=catalog,
            document_name="test",
            category="value",
            name="New Value",
            fields={"statement": "A new value.", "tags": [], "maps_to": []},
        )

        # Reload and verify
        with open(doc_path) as f:
            data = yaml.safe_load(f)
        assert len(data["values"]) == 2
        assert data["values"][1]["id"] == "V2"
        assert data["values"][1]["name"] == "New Value"

    def test_auto_assigns_id(self, tmp_path: Path):
        lib = tmp_path / "lib"
        lib.mkdir()
        doc_path = lib / "test.yaml"
        doc_path.write_text(
            "meta:\n  name: test\n\n"
            "principles:\n"
            "  - id: P1\n    name: A\n    statement: A.\n"
            "    tags: []\n    maps_to: []\n"
            "  - id: P2\n    name: B\n    statement: B.\n"
            "    tags: []\n    maps_to: []\n"
        )

        cfg = GVPConfig(libraries=[lib])
        catalog = load_catalog(cfg)

        add_element(
            catalog=catalog,
            document_name="test",
            category="principle",
            name="C",
            fields={"statement": "C.", "tags": [], "maps_to": []},
        )

        with open(doc_path) as f:
            data = yaml.safe_load(f)
        assert data["principles"][2]["id"] == "P3"
```

**Step 2: Run tests, verify fail, write implementation**

```python
# src/gvp/commands/add.py
"""Add command: create a new element with auto-assigned ID."""

from __future__ import annotations

import os
import re
import subprocess
import tempfile
from pathlib import Path

import yaml

from gvp.model import Catalog

# Category -> ID prefix
ID_PREFIXES = {
    "value": "V",
    "principle": "P",
    "heuristic": "H",
    "rule": "R",
    "goal": "G",
    "milestone": "M",
    "design_choice": "D",
    "constraint": "CON",
    "implementation_rule": "IR",
    "coding_principle": "C",
}

# Category -> YAML key (plural)
YAML_KEYS = {
    "value": "values",
    "principle": "principles",
    "heuristic": "heuristics",
    "rule": "rules",
    "goal": "goals",
    "milestone": "milestones",
    "design_choice": "design_choices",
    "constraint": "constraints",
    "implementation_rule": "implementation_rules",
    "coding_principle": "coding_principles",
}


def next_id(category: str, existing_ids: list[str], prefix: str | None = None) -> str:
    """Compute the next sequential ID for a category."""
    id_prefix = ID_PREFIXES[category]
    if prefix:
        id_prefix = prefix + id_prefix

    # Find highest existing number
    max_num = 0
    pattern = re.compile(rf"^{re.escape(id_prefix)}(\d+)$")
    for eid in existing_ids:
        m = pattern.match(eid)
        if m:
            max_num = max(max_num, int(m.group(1)))

    return f"{id_prefix}{max_num + 1}"


def add_element(
    catalog: Catalog,
    document_name: str,
    category: str,
    name: str,
    fields: dict,
) -> str:
    """Add a new element to a document. Returns the assigned ID."""
    doc = catalog.documents.get(document_name)
    if doc is None:
        raise ValueError(f"Document '{document_name}' not found in catalog")

    # Compute next ID
    existing = [e.id for e in doc.elements if e.category == category]
    new_id = next_id(category, existing, prefix=doc.id_prefix)

    # Build the element dict
    elem_dict = {"id": new_id, "name": name, **fields}

    # Read the file, append to the right category list, write back
    with open(doc.path) as f:
        data = yaml.safe_load(f) or {}

    yaml_key = YAML_KEYS[category]
    if yaml_key not in data:
        data[yaml_key] = []
    data[yaml_key].append(elem_dict)

    with open(doc.path, "w") as f:
        yaml.dump(data, f, default_flow_style=False, sort_keys=False, allow_unicode=True)

    return new_id


def get_editor() -> str:
    """Get the editor command using the standard fallback chain."""
    for var in ("VISUAL", "EDITOR"):
        editor = os.environ.get(var)
        if editor:
            return editor
    # Try update-alternatives
    try:
        result = subprocess.run(
            ["which", "editor"], capture_output=True, text=True
        )
        if result.returncode == 0:
            return result.stdout.strip()
    except FileNotFoundError:
        pass
    for fallback in ("vi", "nano"):
        try:
            result = subprocess.run(
                ["which", fallback], capture_output=True, text=True
            )
            if result.returncode == 0:
                return fallback
        except FileNotFoundError:
            continue
    raise RuntimeError("No editor found")


def add_via_editor(
    catalog: Catalog,
    document_name: str,
    category: str,
    prefill: dict | None = None,
) -> str | None:
    """Open $EDITOR with a template for the element. Returns assigned ID or None if aborted."""
    template = _build_template(category, prefill or {})

    with tempfile.NamedTemporaryFile(
        mode="w", suffix=".yaml", prefix="gvp-add-", delete=False
    ) as f:
        f.write(template)
        tmp_path = f.name

    try:
        editor = get_editor()
        result = subprocess.run([editor, tmp_path])
        if result.returncode != 0:
            return None

        with open(tmp_path) as f:
            content = f.read().strip()
        if not content:
            return None

        data = yaml.safe_load(content)
        if not data:
            return None

        name = data.pop("name", "")
        return add_element(catalog, document_name, category, name, data)
    finally:
        Path(tmp_path).unlink(missing_ok=True)


def _build_template(category: str, prefill: dict) -> str:
    """Build a YAML template for $EDITOR."""
    lines = [f"# New {category}", f"# Fill in the fields below and save.", ""]
    fields = {"name": "", "statement": "", "tags": [], "maps_to": []}

    if category == "milestone":
        fields = {"name": "", "progress": "planned", "maps_to": [], "description": ""}
    elif category == "design_choice":
        fields = {"name": "", "rationale": "", "maps_to": [], "tags": []}
    elif category == "constraint":
        fields = {"name": "", "impact": "", "tags": []}

    fields.update(prefill)

    return lines[0] + "\n" + lines[1] + "\n" + lines[2] + "\n" + yaml.dump(
        fields, default_flow_style=False, sort_keys=False
    )
```

**Step 3: Run tests, verify pass, commit**

Run: `pytest tests/commands/test_add.py -v`
Expected: all PASS

```bash
git add src/gvp/commands/add.py tests/commands/test_add.py
git commit -m "feat: add command with auto-assigned IDs and editor support"
```

---

## Task 13: Edit Command (`commands/edit.py`)

**Files:**
- Create: `src/gvp/commands/edit.py`
- Create: `tests/commands/test_edit.py`

**Step 1: Write the failing tests**

```python
# tests/commands/test_edit.py
"""Tests for gvp edit command."""

from pathlib import Path
from datetime import date

import yaml

from gvp.commands.edit import edit_element_inline
from gvp.config import GVPConfig
from gvp.loader import load_catalog


class TestEditElementInline:
    def test_updates_field(self, tmp_path: Path):
        lib = tmp_path / "lib"
        lib.mkdir()
        doc_path = lib / "test.yaml"
        doc_path.write_text(
            "meta:\n  name: test\n\n"
            "values:\n"
            "  - id: V1\n    name: Original\n    statement: Original.\n"
            "    tags: []\n    maps_to: []\n"
        )
        cfg = GVPConfig(libraries=[lib])
        catalog = load_catalog(cfg)

        edit_element_inline(
            catalog=catalog,
            qualified_id="test:V1",
            updates={"name": "Updated"},
            rationale="testing edit",
        )

        with open(doc_path) as f:
            data = yaml.safe_load(f)
        assert data["values"][0]["name"] == "Updated"

    def test_appends_updated_by(self, tmp_path: Path):
        lib = tmp_path / "lib"
        lib.mkdir()
        doc_path = lib / "test.yaml"
        doc_path.write_text(
            "meta:\n  name: test\n\n"
            "values:\n"
            "  - id: V1\n    name: Original\n    statement: Original.\n"
            "    tags: []\n    maps_to: []\n"
        )
        cfg = GVPConfig(libraries=[lib])
        catalog = load_catalog(cfg)

        edit_element_inline(
            catalog=catalog,
            qualified_id="test:V1",
            updates={"name": "Updated"},
            rationale="testing edit",
        )

        with open(doc_path) as f:
            data = yaml.safe_load(f)
        updated_by = data["values"][0].get("updated_by", [])
        assert len(updated_by) == 1
        assert updated_by[0]["rationale"] == "testing edit"
        assert "date" in updated_by[0]

    def test_deprecate_element(self, tmp_path: Path):
        lib = tmp_path / "lib"
        lib.mkdir()
        doc_path = lib / "test.yaml"
        doc_path.write_text(
            "meta:\n  name: test\n\n"
            "values:\n"
            "  - id: V1\n    name: Old\n    statement: Old.\n"
            "    tags: []\n    maps_to: []\n"
        )
        cfg = GVPConfig(libraries=[lib])
        catalog = load_catalog(cfg)

        edit_element_inline(
            catalog=catalog,
            qualified_id="test:V1",
            updates={"status": "deprecated"},
            rationale="superseded by V2",
        )

        with open(doc_path) as f:
            data = yaml.safe_load(f)
        assert data["values"][0]["status"] == "deprecated"

    def test_nonexistent_element_raises(self, tmp_path: Path):
        lib = tmp_path / "lib"
        lib.mkdir()
        (lib / "test.yaml").write_text(
            "meta:\n  name: test\nvalues: []\n"
        )
        cfg = GVPConfig(libraries=[lib])
        catalog = load_catalog(cfg)

        import pytest
        with pytest.raises(ValueError, match="not found"):
            edit_element_inline(
                catalog=catalog,
                qualified_id="test:V99",
                updates={"name": "Nope"},
                rationale="testing",
            )
```

**Step 2: Run tests, verify fail, write implementation**

```python
# src/gvp/commands/edit.py
"""Edit command: modify an existing element."""

from __future__ import annotations

from datetime import date

import yaml

from gvp.model import Catalog

from gvp.commands.add import YAML_KEYS


def edit_element_inline(
    catalog: Catalog,
    qualified_id: str,
    updates: dict,
    rationale: str,
) -> None:
    """Edit an element via inline field updates.

    Writes changes to the source YAML file and appends an updated_by entry.
    """
    elem = catalog.elements.get(qualified_id)
    if elem is None:
        raise ValueError(f"Element '{qualified_id}' not found in catalog")

    doc = elem.document

    # Read the file
    with open(doc.path) as f:
        data = yaml.safe_load(f) or {}

    # Find the element in the YAML data
    yaml_key = YAML_KEYS[elem.category]
    items = data.get(yaml_key, [])
    target = None
    for item in items:
        if item.get("id") == elem.id:
            target = item
            break

    if target is None:
        raise ValueError(
            f"Element '{elem.id}' not found in {doc.path} under '{yaml_key}'"
        )

    # Apply updates
    for key, value in updates.items():
        target[key] = value

    # Append updated_by
    updated_entry = {
        "date": date.today().isoformat(),
        "rationale": rationale,
    }
    if "updated_by" not in target:
        target["updated_by"] = []
    target["updated_by"].append(updated_entry)

    # Write back
    with open(doc.path, "w") as f:
        yaml.dump(data, f, default_flow_style=False, sort_keys=False, allow_unicode=True)
```

**Step 3: Run tests, verify pass, commit**

Run: `pytest tests/commands/test_edit.py -v`
Expected: all PASS

```bash
git add src/gvp/commands/edit.py tests/commands/test_edit.py
git commit -m "feat: edit command with inline updates and auto updated_by"
```

---

## Task 14: Wire Up CLI (`__main__.py`)

**Files:**
- Modify: `src/gvp/__main__.py`
- Create: `tests/test_cli.py`

**Step 1: Write the failing tests**

```python
# tests/test_cli.py
"""Integration tests for the gvp CLI."""

import subprocess
from pathlib import Path


GVP_DOCS = "/home/guy/code/git/github.com/shitchell/gvp-docs"


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
             "validate", "--library", GVP_DOCS],
            capture_output=True, text=True,
        )
        assert result.returncode == 0

    def test_query_by_tag(self):
        result = subprocess.run(
            ["python", "-m", "gvp", "--config", "/dev/null",
             "query", "--library", GVP_DOCS, "--tag", "code"],
            capture_output=True, text=True,
        )
        assert result.returncode == 0
        assert "P1" in result.stdout or "H" in result.stdout

    def test_trace(self):
        result = subprocess.run(
            ["python", "-m", "gvp", "--config", "/dev/null",
             "trace", "--library", GVP_DOCS, "personal:H5"],
            capture_output=True, text=True,
        )
        assert result.returncode == 0
        assert "H5" in result.stdout

    def test_render_markdown(self):
        result = subprocess.run(
            ["python", "-m", "gvp", "--config", "/dev/null",
             "render", "--library", GVP_DOCS, "--format", "markdown",
             "--stdout"],
            capture_output=True, text=True,
        )
        assert result.returncode == 0
        assert "Transparency" in result.stdout
```

**Step 2: Run tests, verify fail**

Run: `pytest tests/test_cli.py -v`
Expected: FAIL

**Step 3: Write the full CLI wiring**

```python
# src/gvp/__main__.py
"""CLI entry point for gvp."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from gvp import __version__
from gvp.config import GVPConfig, discover_config
from gvp.loader import load_catalog


def _build_config(args: argparse.Namespace) -> GVPConfig:
    """Build config from CLI args and discovery."""
    if args.config == "/dev/null":
        cfg = GVPConfig()
    elif args.config:
        from gvp.config import _parse_config_yaml
        cfg = _parse_config_yaml(Path(args.config))
    else:
        cfg = discover_config()

    cfg.strict = args.strict or cfg.strict

    # --library flag adds extra libraries
    if hasattr(args, "library") and args.library:
        for lib in args.library:
            cfg.libraries.append(Path(lib))

    return cfg


def _add_library_arg(parser: argparse.ArgumentParser) -> None:
    """Add --library flag to a subcommand parser."""
    parser.add_argument(
        "--library", action="append", default=[],
        help="additional library path (repeatable)",
    )


def cmd_validate(args: argparse.Namespace) -> int:
    cfg = _build_config(args)
    catalog = load_catalog(cfg)

    from gvp.commands.validate import validate_catalog
    errors, warnings = validate_catalog(catalog)

    for w in warnings:
        if w.split(":")[0] not in cfg.suppress_warnings:
            print(w, file=sys.stderr)
            if cfg.strict:
                errors.append(w)

    for e in errors:
        print(f"ERROR: {e}", file=sys.stderr)

    if not errors:
        print("OK — no errors found")
    return 1 if errors else 0


def cmd_query(args: argparse.Namespace) -> int:
    cfg = _build_config(args)
    catalog = load_catalog(cfg)

    from gvp.commands.query import query_catalog
    results = query_catalog(
        catalog,
        tags=args.tag or None,
        categories=[args.category] if args.category else None,
        document=args.document,
        status=args.status,
    )

    if args.format == "json":
        output = [
            {"id": str(e), "name": e.name, "category": e.category, "tags": e.tags}
            for e in results
        ]
        print(json.dumps(output, indent=2))
    else:
        if not results:
            print("No matching elements.")
            return 0
        # Table output
        fmt = "{:<25} {:<15} {:<30} {}"
        print(fmt.format("ID", "CATEGORY", "NAME", "TAGS"))
        print("-" * 90)
        for e in results:
            print(fmt.format(str(e), e.category, e.name, ", ".join(e.tags)))

    return 0


def cmd_trace(args: argparse.Namespace) -> int:
    cfg = _build_config(args)
    catalog = load_catalog(cfg)

    elem = catalog.elements.get(args.element)
    if elem is None:
        print(f"ERROR: element '{args.element}' not found", file=sys.stderr)
        return 1

    from gvp.commands.trace import trace_element, format_trace_tree
    tree = trace_element(catalog, elem, reverse=args.reverse)
    output = format_trace_tree(tree, fmt=args.format)
    print(output)
    return 0


def cmd_render(args: argparse.Namespace) -> int:
    cfg = _build_config(args)
    catalog = load_catalog(cfg)

    output_dir = Path(args.output) if args.output else None
    include_deprecated = args.include_deprecated
    fmt = args.format
    to_stdout = args.stdout

    if fmt in (None, "all", "markdown"):
        from gvp.renderers.markdown import render_markdown
        result = render_markdown(
            catalog,
            output_dir=output_dir if not to_stdout else None,
            include_deprecated=include_deprecated,
        )
        if to_stdout and fmt in (None, "all", "markdown"):
            print(result)

    if fmt in (None, "all", "csv"):
        from gvp.renderers.csv import render_csv
        result = render_csv(
            catalog,
            output_dir=output_dir if not to_stdout else None,
            include_deprecated=include_deprecated,
        )
        if to_stdout and fmt == "csv":
            print(result)

    if fmt in (None, "all", "sqlite"):
        from gvp.renderers.sqlite import render_sqlite
        db_path = (output_dir or Path("generated")) / "gvp.db"
        render_sqlite(catalog, db_path, include_deprecated=include_deprecated)
        if to_stdout and fmt == "sqlite":
            print(f"SQLite database written to {db_path}")

    if fmt in (None, "all", "dot"):
        from gvp.renderers.dot import render_dot
        result = render_dot(
            catalog,
            output_dir=output_dir if not to_stdout else None,
            include_deprecated=include_deprecated,
        )
        if to_stdout and fmt == "dot":
            print(result)

    if not to_stdout:
        target = output_dir or Path("generated")
        print(f"Output written to {target}/")

    return 0


def cmd_add(args: argparse.Namespace) -> int:
    cfg = _build_config(args)
    catalog = load_catalog(cfg)

    from gvp.commands.add import add_element, add_via_editor

    # Collect inline fields
    fields: dict = {}
    if args.statement:
        fields["statement"] = args.statement
    if args.tags:
        fields["tags"] = args.tags.split(",")
    if args.maps_to:
        fields["maps_to"] = args.maps_to.split(",")

    if args.name and args.statement:
        # All required fields present — inline mode
        new_id = add_element(catalog, args.document, args.category, args.name, fields)
        print(f"Added {args.document}:{new_id}")
    elif args.interactive:
        # Interactive mode (simplified — prompt for each field)
        if not args.name:
            args.name = input("Name: ")
        if "statement" not in fields:
            fields["statement"] = input("Statement: ")
        if "tags" not in fields:
            tags_input = input("Tags (comma-separated): ")
            fields["tags"] = [t.strip() for t in tags_input.split(",") if t.strip()]
        if "maps_to" not in fields:
            maps_input = input("Maps to (comma-separated qualified IDs): ")
            fields["maps_to"] = [m.strip() for m in maps_input.split(",") if m.strip()]
        new_id = add_element(catalog, args.document, args.category, args.name, fields)
        print(f"Added {args.document}:{new_id}")
    else:
        # Editor mode
        prefill = {}
        if args.name:
            prefill["name"] = args.name
        prefill.update(fields)
        new_id = add_via_editor(catalog, args.document, args.category, prefill)
        if new_id:
            print(f"Added {args.document}:{new_id}")
        else:
            print("Aborted.")
            return 1

    return 0


def cmd_edit(args: argparse.Namespace) -> int:
    cfg = _build_config(args)
    catalog = load_catalog(cfg)

    from gvp.commands.edit import edit_element_inline

    updates: dict = {}
    if args.name:
        updates["name"] = args.name
    if args.status:
        updates["status"] = args.status
    if args.statement:
        updates["statement"] = args.statement

    if not updates:
        # TODO: editor mode for edit
        print("No updates provided. Use --name, --status, --statement, etc.")
        return 1

    rationale = args.rationale
    if not rationale:
        rationale = input("Rationale for this change: ")

    edit_element_inline(catalog, args.element, updates, rationale)
    print(f"Updated {args.element}")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="gvp",
        description="CLI utility for GVP (Goals, Values, and Principles) documents",
    )
    parser.add_argument("--version", action="version", version=f"%(prog)s {__version__}")
    parser.add_argument("--strict", action="store_true", help="promote warnings to errors")
    parser.add_argument("--config", type=str, default=None, help="override config path")
    parser.add_argument("--verbose", action="store_true", help="show loaded libraries/documents")

    subparsers = parser.add_subparsers(dest="command")

    # validate
    p_validate = subparsers.add_parser("validate", help="check catalog for errors")
    _add_library_arg(p_validate)

    # query
    p_query = subparsers.add_parser("query", help="filter elements")
    _add_library_arg(p_query)
    p_query.add_argument("--tag", action="append", help="filter by tag (repeatable)")
    p_query.add_argument("--category", help="filter by category")
    p_query.add_argument("--document", help="filter by document name")
    p_query.add_argument("--status", help="filter by status")
    p_query.add_argument("--format", choices=["table", "json"], default="table")

    # trace
    p_trace = subparsers.add_parser("trace", help="trace element mappings")
    _add_library_arg(p_trace)
    p_trace.add_argument("element", help="qualified element ID (e.g., personal:H5)")
    p_trace.add_argument("--reverse", action="store_true", help="show descendants instead of ancestors")
    p_trace.add_argument("--format", choices=["text", "json"], default="text")

    # render
    p_render = subparsers.add_parser("render", help="generate output")
    _add_library_arg(p_render)
    p_render.add_argument("--format", choices=["markdown", "csv", "sqlite", "dot", "all"], default="all")
    p_render.add_argument("-o", "--output", help="output directory")
    p_render.add_argument("--stdout", action="store_true", help="print to stdout instead of files")
    p_render.add_argument("--include-deprecated", action="store_true")

    # add
    p_add = subparsers.add_parser("add", help="add a new element")
    _add_library_arg(p_add)
    p_add.add_argument("category", help="element category (value, principle, etc.)")
    p_add.add_argument("document", help="target document name")
    p_add.add_argument("--name", help="element name")
    p_add.add_argument("--statement", help="element statement")
    p_add.add_argument("--tags", help="comma-separated tags")
    p_add.add_argument("--maps-to", dest="maps_to", help="comma-separated qualified IDs")
    p_add.add_argument("--interactive", action="store_true")

    # edit
    p_edit = subparsers.add_parser("edit", help="modify an existing element")
    _add_library_arg(p_edit)
    p_edit.add_argument("element", help="qualified element ID (e.g., personal:P3)")
    p_edit.add_argument("--name", help="new name")
    p_edit.add_argument("--status", help="new status (active, deprecated, rejected)")
    p_edit.add_argument("--statement", help="new statement")
    p_edit.add_argument("--rationale", help="rationale for the change")
    p_edit.add_argument("--interactive", action="store_true")

    args = parser.parse_args(argv)
    if not args.command:
        parser.print_help()
        return 0

    handlers = {
        "validate": cmd_validate,
        "query": cmd_query,
        "trace": cmd_trace,
        "render": cmd_render,
        "add": cmd_add,
        "edit": cmd_edit,
    }
    return handlers[args.command](args)


if __name__ == "__main__":
    sys.exit(main())
```

**Step 4: Run tests to verify they pass**

Run: `pytest tests/test_cli.py -v`
Expected: all PASS

**Step 5: Commit**

```bash
git add src/gvp/__main__.py tests/test_cli.py
git commit -m "feat: wire up all CLI subcommands (validate, query, trace, render, add, edit)"
```

---

## Task 15: Full Integration Test

**Files:**
- Create: `tests/test_integration.py`

**Step 1: Write integration tests against real gvp-docs**

```python
# tests/test_integration.py
"""Full integration tests using the real gvp-docs library."""

from pathlib import Path

from gvp.config import GVPConfig
from gvp.loader import load_catalog
from gvp.commands.validate import validate_catalog
from gvp.commands.query import query_catalog
from gvp.commands.trace import trace_element, format_trace_tree
from gvp.renderers.markdown import render_markdown
from gvp.renderers.csv import render_csv
from gvp.renderers.dot import render_dot


class TestFullPipeline:
    def test_load_validate_query_trace_render(self, gvp_docs_library: Path, tmp_path: Path):
        # Load
        cfg = GVPConfig(libraries=[gvp_docs_library])
        catalog = load_catalog(cfg)
        assert len(catalog.documents) == 4
        assert len(catalog.elements) > 30

        # Validate
        errors, warnings = validate_catalog(catalog)
        assert errors == [], f"Validation errors: {errors}"

        # Query
        code_heuristics = query_catalog(catalog, tags=["code"], categories=["heuristic"])
        assert len(code_heuristics) > 0

        # Trace
        h5 = catalog.elements["personal:H5"]
        tree = trace_element(catalog, h5, reverse=False)
        text = format_trace_tree(tree, fmt="text")
        assert "personal:H5" in text
        json_out = format_trace_tree(tree, fmt="json")
        assert "personal:H5" in json_out

        # Render markdown
        md = render_markdown(catalog)
        assert "Transparency" in md

        # Render CSV
        csv_out = render_csv(catalog)
        assert "personal:V1" in csv_out

        # Render DOT
        dot_out = render_dot(catalog)
        assert "digraph" in dot_out

        # Render SQLite
        from gvp.renderers.sqlite import render_sqlite
        db_path = tmp_path / "test.db"
        render_sqlite(catalog, db_path)
        assert db_path.exists()

        import sqlite3
        conn = sqlite3.connect(db_path)
        count = conn.execute("SELECT COUNT(*) FROM elements").fetchone()[0]
        assert count > 30
        conn.close()

    def test_chain_spans_all_levels(self, gvp_docs_library: Path):
        cfg = GVPConfig(libraries=[gvp_docs_library])
        catalog = load_catalog(cfg)
        ctl = catalog.documents["ctl-v1"]
        chain = catalog.resolve_chain(ctl)
        names = [d.name for d in chain]
        assert names == ["ctl-v1", "unturned", "personal", "universal"]

    def test_cross_scope_maps_to_resolves(self, gvp_docs_library: Path):
        cfg = GVPConfig(libraries=[gvp_docs_library])
        catalog = load_catalog(cfg)
        d1 = catalog.elements["ctl-v1:D1"]
        ancestors = catalog.ancestors(d1)
        ancestor_ids = {str(a) for a in ancestors}
        # D1 maps to unturned:G3 and personal:V3
        assert "unturned:G3" in ancestor_ids
        assert "personal:V3" in ancestor_ids
```

**Step 2: Run all tests**

Run: `pytest tests/ -v`
Expected: all PASS

**Step 3: Commit**

```bash
git add tests/test_integration.py
git commit -m "test: full integration tests against real gvp-docs library"
```

---

## Task 16: Final cleanup and README

**Files:**
- Create: `README.md`

**Step 1: Write README**

Create a brief README with installation, quick start, and subcommand reference. Use `capture-command` if desired for demo screenshots.

**Step 2: Run full test suite one more time**

Run: `pytest tests/ -v --tb=short`
Expected: all PASS, no warnings

**Step 3: Commit**

```bash
git add README.md
git commit -m "docs: add README with installation and usage"
```
