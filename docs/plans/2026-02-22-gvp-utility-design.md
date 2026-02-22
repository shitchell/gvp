# `gvp` Utility — Design Document

> **Status:** Approved
> **Date:** 2026-02-22
> **Context:** Brainstorming session for the GVP CLI utility


## Purpose

A command-line utility for working with GVP (Goals, Values, and Principles)
documents. Reads YAML source-of-truth files, validates references, renders
to multiple output formats, queries elements by tag/category, traces the
mapping graph, and manages element lifecycle (add/edit with auto-assigned
IDs and provenance tracking).

GVP is domain-agnostic — the same framework applies to code architecture,
finance, sales, or any context where structured decision-making principles
are useful. The utility and its documentation should read naturally for
non-technical users.


## Glossary

| Term | Meaning | Example |
|------|---------|---------|
| **Element** | A single GVP entry of any category (value, principle, heuristic, rule, goal, milestone, design choice, constraint, implementation rule, coding principle) | P3 (One Contiguous Block) |
| **Document** | One YAML file containing elements and a `meta` block | `personal.yaml`, `projects/unturned.yaml` |
| **Scope** | The `meta.scope` label — human-readable decoration, not enforced | "personal", "project", "implementation" |
| **Library** | A directory containing GVP documents, optionally a `tags.yaml` and `schema.yaml` | `~/.config/gvp/libraries/`, `.gvp/` |
| **Chain** | The resolved inheritance path from a document to its root | `ctl-v1 -> unturned -> personal -> universal` |
| **Catalog** | The fully loaded, resolved graph of all documents across all libraries | The runtime object built by the loader |


## Data Model

### Element

```python
@dataclass
class Element:
    """A single GVP element."""
    id: str                          # "V1", "P3", etc.
    category: str                    # "value", "principle", etc.
    name: str
    status: str = "active"           # active | deprecated | rejected
    tags: list[str]
    maps_to: list[str]              # qualified IDs: ["personal:V1"]
    origin: list[dict]
    updated_by: list[dict]
    fields: dict                     # type-specific fields (statement, rationale, etc.)
    document: Document               # back-reference to containing document

    def __str__(self) -> str:
        """e.g., personal:P3"""
        return f"{self.document.name}:{self.id}"

    def __repr__(self) -> str:
        """e.g., personal.yaml:personal:P3"""
        return f"{self.document.filename}:{self.document.name}:{self.id}"
```

### Document

```python
@dataclass
class Document:
    """A loaded GVP YAML file."""
    name: str                        # meta.name
    filename: str                    # "personal.yaml"
    path: Path                       # absolute path
    inherits: str | None             # meta.inherits
    scope_label: str | None          # meta.scope
    id_prefix: str | None            # meta.id_prefix
    defaults: dict                   # meta.defaults
    elements: list[Element]          # all elements in this document
```

### Catalog

```python
class Catalog:
    """The resolved GVP graph across all documents and libraries."""
    documents: dict[str, Document]   # name -> Document
    elements: dict[str, Element]     # qualified ID -> Element
    tags: dict[str, dict]            # tag name -> definition

    def resolve_chain(self, doc: Document) -> list[Document]:
        """Walk inherits chain from document to root."""

    def ancestors(self, element: Element) -> set[Element]:
        """Elements this one maps to (and transitively)."""

    def descendants(self, element: Element) -> set[Element]:
        """Elements that map to this one (and transitively)."""
```


## Config & Discovery

### Config resolution order

1. Walk backwards from `$CWD` for `.gvp/` (library) or `.gvp.yaml` (single document)
2. `~/.config/gvp/` — user config + implicit library at `~/.config/gvp/libraries/`
3. `/etc/gvp/` — system config + implicit library at `/etc/gvp/libraries/`
4. Additional paths from `libraries` lists in any config above

### Config format

```yaml
# ~/.config/gvp/config.yaml
libraries:
  - /path/to/additional/library
strict: false
suppress_warnings:
  - W001
```

### Directory structure

```
/etc/gvp/
├── config.yaml
└── libraries/               # system-level library
    └── universal.yaml

~/.config/gvp/
├── config.yaml
└── libraries/               # user-level library
    ├── personal.yaml
    └── projects/
        └── unturned.yaml

.gvp/                        # project-local library (found by walk-backwards)
└── project.yaml
```

Every `{gvpdir}/libraries/` is implicitly a library. `.gvp/` directories found
by walk-backwards are directly libraries. The `libraries` config key adds
additional library paths.

### Inheritance resolution

`inherits: personal` searches all loaded documents for one with
`meta.name == "personal"`. If not found, tries it as a relative path
(with `.yaml` extension) within the same library.

### Name collisions

When two documents share a `meta.name`:
- Default: first library in discovery order wins (warning W002)
- `--strict`: error


## Subcommands

### `gvp validate`

Loads the catalog and checks:
- All `maps_to` references resolve to existing elements
- All tags are defined in a loaded `tags.yaml`
- Element IDs are sequential per category per document (no gaps)
- Chains resolve (no dangling `inherits`)
- No circular inheritance
- Category-specific rules (TBD — to be refined from prior planning docs)

Output: list of errors/warnings with element references. Exit 0 if clean, 1
if errors.

### `gvp render`

Generates output from the catalog.

```
gvp render                          # all formats to default output dir
gvp render --format markdown
gvp render --format csv
gvp render --format sqlite
gvp render --format dot             # requires graphviz extra
gvp render -o ./output/             # custom output directory
```

Default output directory: `generated/` within the first library.

### `gvp query`

Filter elements from the catalog. Reads YAML directly.

```
gvp query --tag code
gvp query --category heuristic
gvp query --tag code --category heuristic   # intersection
gvp query --document personal
gvp query --status deprecated
```

Output: table of matching elements (ID, name, category, tags).
`--format json` for machine consumption.

### `gvp trace`

Walk the catalog graph from a given element.

```
gvp trace personal:H5              # ancestors (what H5 maps to)
gvp trace personal:V6 --reverse    # descendants (what maps to V6)
gvp trace personal:H5 --format json
```

Default: indented text tree with full element info. Repeated nodes get
a `(see above)` backreference.

### `gvp add`

Create a new element with auto-assigned ID.

```
gvp add principle personal          # open $EDITOR with template
gvp add principle personal --interactive
gvp add principle personal \
  --name "Foo" \
  --statement "Bar" \
  --maps-to personal:V1,personal:V3 \
  --tags code,maintainability
```

Three input modes:
1. **Inline flags** — if all required fields provided, write directly.
   Fail if required fields missing (no silent fallback).
2. **Interactive** (`--interactive`) — prompt for each field.
3. **Editor** (default, or when inline is incomplete without `--interactive`) —
   open `$EDITOR` with a YAML template pre-filled with any provided flags.

Validates before writing. Auto-assigns the next sequential ID for the
category in the target document.

### `gvp edit`

Modify an existing element.

```
gvp edit personal:P3                # open $EDITOR with current state
gvp edit personal:P3 --interactive
gvp edit personal:P3 --status deprecated --rationale "superseded by P7"
```

Same three input modes as `add`. On save: diffs against original,
auto-appends `updated_by` entry with today's date. Prompts for
`rationale` if not provided inline.

### Global flags

```
gvp --strict            # warnings become errors
gvp --config PATH       # override config discovery
gvp --verbose           # show loaded libraries/documents
```


## Error Handling

| Condition | Severity | ID |
|-----------|----------|----|
| Broken `maps_to` reference | Error | — |
| Broken `inherits` reference | Error | — |
| Circular inheritance | Error | — |
| Missing required field on element | Error | — |
| ID gap in category sequence | Error | — |
| Undefined tag | Error | — |
| Empty document | Warning | W001 |
| Duplicate `meta.name` across libraries | Warning | W002 |
| Missing library path from config | Warning | W003 |

Errors always exit non-zero. Warnings are printed to stderr.
`--strict` promotes all unsuppressed warnings to errors.
`suppress_warnings` in config silences specific warning IDs.


## Project Structure

```
gvp/
├── __main__.py          # argparse, subcommand registration
├── config.py            # config discovery, walk-backwards, merging
├── loader.py            # YAML parsing, defaults merging, chain resolution
├── model.py             # Element, Document, Catalog
├── commands/
│   ├── validate.py
│   ├── render.py
│   ├── query.py
│   ├── trace.py
│   ├── add.py
│   └── edit.py
└── renderers/
    ├── markdown.py
    ├── csv.py
    ├── sqlite.py
    └── dot.py           # optional, requires graphviz extra
```

### Installation

```toml
[project]
name = "gvp"
requires-python = ">=3.11"
dependencies = ["pyyaml"]

[project.optional-dependencies]
diagrams = ["graphviz"]

[project.scripts]
gvp = "gvp.__main__:main"
```


## Decisions

### 1. Single `maps_to` field for all relationships

Edge semantics are derivable from element types. No need for `depends_on`,
`advances`, or `heuristics` fields. Typed mappings are a future evolution
path (see gvp-docs ROADMAP.md).

### 2. Config directories are implicit libraries

`{gvpdir}/libraries/` is automatically a library if it exists. Avoids
redundant `libraries: [/etc/gvp/libraries]` in every config.

### 3. Order-based name collision resolution by default

First library in discovery order wins. `--strict` for environments that
need uniqueness guarantees.

### 4. Three input modes for add/edit

Editor (default), interactive, and inline flags. Supports both human
workflows and AI-driven automation.

### 5. Warning ID system

Named warnings with config-level suppression. `--strict` promotes all
unsuppressed warnings to errors. Extensible without breaking existing
configs.

### 6. Renderers as separate modules

Four output formats with distinct logic. Separate files keep each
renderer focused. Adding a new format is dropping a file in `renderers/`.
