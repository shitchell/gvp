# gvp

A framework and CLI tool for decision traceability. GVP (Goals, Values, and Principles) helps you capture the reasoning behind decisions so that every choice — from architecture to process — can trace back to what you're trying to achieve and why it matters.

## Why

- **Alignment during AI-assisted work.** When AI helps with planning and development, it needs to know how you make decisions and why. GVP gives it (and you) that context explicitly.
- **Easier planning.** How you make decisions and why is already documented. New plans start from shared ground instead of re-deriving principles each time.
- **Review over time.** Goals shift, values evolve, circumstances change. GVP surfaces when downstream decisions may need revisiting because the reasoning above them has changed.
- **Internal consistency.** When everything traces to goals and values, contradictions and misalignment become visible — across projects, across scopes, across time.

## How It Works

GVP organizes decision-making into a layered system of **elements** connected by a many-to-many mapping graph. Each element traces its justification back to the goals and values that motivate it.

### Elements

Elements are the building blocks. Each has a category that describes its role:

| Category | Description | How to identify |
|----------|-------------|-----------------|
| **Goal** | A target state you're working toward. Quantifiable, even if broadly. | Is it a destination, not a method? |
| **Value** | A subjective quality you favor. Shapes trade-offs when two valid approaches exist. | Does it describe a quality you care about, not a specific action? |
| **Principle** | An actionable bias. States a preference that requires judgment to apply. | Is it a bias or preference that tells you what to *do*? |
| **Heuristic** | A decision procedure. Where a principle says "prefer X," a heuristic says "if A, then B; else C." | Can you write it as an if/then tree? |
| **Rule** | A hard stop. Binary, no exceptions. A principle that graduated to "never cross this line." | Is it a bright line that's never crossed? |
| **Design Choice** | Tools you've picked and high-level architectural decisions. Change when the implementation changes. | Would it change if you switched frameworks? |
| **Milestone** | A concrete, achievable waypoint on the path to goals. | Is it a concrete state on the roadmap? |
| **Constraint** | A fact about the system or environment you don't control. Descriptive, not prescriptive. | Is it a fact you don't control? |

These are the core categories. You can extend them with domain-specific variants — the [software-project example](examples/software-project/) shows how to add categories like Implementation Rule and Coding Principle for code-specific scopes. See [docs/philosophy.md](docs/philosophy.md) for a discussion of the fuzzy boundaries between categories (especially goals, values, and principles).

### Relationships

- **Goals** are the destination. Everything else exists to get there.
- **Values** are the compass. They shape every decision but don't prescribe specific actions.
- **Principles** state preferences. **Heuristics** encode the procedure for applying them. **Rules** are principles with zero tolerance for exceptions.
- **Constraints** are external facts that shape your choices but aren't themselves decisions.
- The relationships are a **graph**, not a tree — many-to-many.

Goals and values are tightly coupled and sometimes hard to distinguish (see [docs/philosophy.md](docs/philosophy.md)). While neither is required to map to anything, mapping them to each other is encouraged — it surfaces alignment gaps and strengthens review.

### Scope and Inheritance

GVP documents form an inheritance chain. Priority flows from root to leaf: **parent wins on conflict, child extends**. You need at least one scope, and the depth is up to you. The conventional structure is:

```
universal.yaml                         (organization-wide, highest priority)
  └─ personal.yaml                     (individual, cross-project)
       └─ projects/<project>.yaml      (project-level: goals, constraints)
            └─ ...                      (arbitrary further nesting)
```

For personal use, `universal.yaml` can remain empty — or you can skip it entirely and start from `personal.yaml`. What constitutes a "project" vs. deeper nesting is up to you. The framework doesn't enforce granularity, only the inheritance chain.

### Tags

Elements can be classified with tags. Tags are defined in a `tags.yaml` registry to prevent drift. How you organize your tags is up to you — one useful pattern is separating them into:

- **Domain tags** (`code`, `systems`, `finance`, ...): what area the element applies to
- **Concern tags** (`maintainability`, `reliability`, `usability`, ...): what quality the element addresses

But this is a convention, not a requirement. The tagging system is agnostic — use whatever groupings make sense for your context.

### Traceability

Every element (except goals, values, and constraints) must trace its justification to at least one goal and one value — directly or transitively through other elements.

| Category | Must map to... |
|----------|---------------|
| Milestone | 1+ goal and 1+ value |
| Principle | 1+ goal and 1+ value |
| Rule | 1+ goal and 1+ value |
| Design Choice | 1+ goal and 1+ value |
| Heuristic | (1+ goal and 1+ value) or 1+ principle |
| Implementation Rule | (1+ goal and 1+ value) or 1+ design choice |
| Coding Principle | (1+ goal and 1+ value) or 1+ principle or design choice |

Goals, values, and constraints are roots — they don't need to map to anything. But as noted above, mapping goals and values to each other is a good practice for surfacing alignment.

## Installation

```bash
pip install -e .

# For graphviz/DOT rendering:
pip install -e ".[diagrams]"
```

> **Note:** PyPI publication is planned. For now, install from source.

## Quick Start

```bash
# Validate a GVP library
gvp validate --library examples/software-project/

# Query elements by tag
gvp query --library examples/software-project/ --tag code

# Trace an element's mapping graph
gvp trace --library examples/software-project/ personal:H1

# Render to markdown
gvp render --library examples/software-project/ --format markdown --stdout
```

## Examples

Bundled example libraries demonstrate GVP in different domains:

- **[Software Project](examples/software-project/)** — a 4-level chain for a fictional CLI task manager, demonstrating domain-specific categories and cross-scope traceability
- **[Small Business](examples/small-business/)** — a 2-level chain for a fictional coffee shop, showing GVP works beyond software

Each example directory has its own README with detailed walkthroughs and commands.

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
gvp trace --library path/ personal:H1
gvp trace --library path/ personal:H1 --reverse
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

Modify an existing element. Three input modes: CLI flags, interactive prompts, or editor.

```bash
gvp edit personal:P3 --library path/ --status deprecated --rationale "Superseded"
gvp edit personal:P3 --library path/ --interactive
gvp edit personal:P3 --library path/                    # opens in $EDITOR
gvp edit personal:P3 --library path/ --no-provenance    # skip updated_by
```

### review

Review elements for staleness after upstream changes.

```bash
gvp review --library path/                    # list stale elements
gvp review --library path/ personal:P3        # interactive review
```

## Global Options

| Flag | Description |
|------|-------------|
| `--version` | Show version |
| `--strict` | Promote warnings to errors |
| `--config PATH` | Override config file path |
| `--library PATH` | Add a library path (repeatable) |
| `--no-provenance` | Skip provenance tracking (add/edit only) |

## Future Work

- **PyPI publication** for `pip install gvp`
- **Graphical tool or web interface** for visual exploration and editing
- **Expanded examples** — a comprehensive organizational setup with multiple domains (finance, sales, engineering) converging on unified goals/values; a personal self-improvement example with intentionally conflicting values to demonstrate honest self-examination
- **Diagrams** generated for example directories

## Further Reading

- [GLOSSARY.md](GLOSSARY.md) — canonical term definitions
- [docs/philosophy.md](docs/philosophy.md) — on the fuzzy boundaries between goals, values, and principles
- [docs/plans/](docs/plans/) — design documents and implementation plans
