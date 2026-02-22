# gvp

CLI utility for managing GVP (Goals, Values, and Principles) documents — structured YAML files that capture goals, values, principles, heuristics, rules, milestones, design choices, constraints, implementation rules, and coding principles.

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

Check a catalog for errors (broken references, ID gaps, duplicate IDs, orphaned tags).

```bash
gvp validate --library path/to/docs/
gvp validate --library path/to/docs/ --strict  # warnings become errors
```

### query

Filter elements by tag, category, document, or status.

```bash
gvp query --library path/ --tag code --category heuristic
gvp query --library path/ --document personal --format json
gvp query --library path/ --status deprecated
```

### trace

Walk the `maps_to` graph from a given element, showing ancestors or descendants.

```bash
gvp trace --library path/ personal:H5
gvp trace --library path/ personal:H5 --reverse   # descendants
gvp trace --library path/ personal:H5 --format json
```

### render

Generate output in markdown, CSV, SQLite, or DOT (graphviz) format.

```bash
gvp render --library path/ --format markdown -o output/
gvp render --library path/ --format csv --stdout
gvp render --library path/ --format sqlite -o output/
gvp render --library path/ --format dot --stdout | dot -Tpng -o graph.png
```

### add

Create a new element in a document.

```bash
gvp add principle personal --library path/ --name "New Principle" --statement "Description here"
gvp add heuristic personal --library path/ --interactive
```

### edit

Modify an existing element with provenance tracking.

```bash
gvp edit personal:P3 --library path/ --status deprecated --rationale "Superseded by P7"
gvp edit personal:V1 --library path/ --name "Updated Name" --rationale "Clarification"
```

## Global Options

| Flag | Description |
|------|-------------|
| `--version` | Show version |
| `--strict` | Promote warnings to errors |
| `--config PATH` | Override config file path |
| `--library PATH` | Add a library path (repeatable on each subcommand) |

## Config Discovery

`gvp` walks backwards from `$CWD` looking for `.gvp/` directories, then checks `~/.config/gvp/` and `/etc/gvp/`. Each directory's `libraries/` subdirectory is an implicit library. A `config.yaml` file can specify additional `libraries` paths and `suppress_warnings`.

## Requirements

- Python 3.11+
- PyYAML
- graphviz (optional, for DOT rendering)
