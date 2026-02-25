# gvp

A framework and CLI tool for decision traceability. GVP (Goals, Values, and Principles) helps you capture the reasoning behind decisions so that every choice — from architecture to process — can trace back to what you're trying to achieve and why it matters.

## Why

- **Alignment during AI-assisted work.** When AI helps with planning and development, it needs to know how you make decisions and why. GVP gives it (and you) that context explicitly.
- **Easier planning.** How you make decisions and why is already documented. New plans start from shared ground instead of re-deriving principles each time.
- **Review over time.** Goals shift, values evolve, circumstances change. GVP surfaces when downstream decisions may need revisiting because the reasoning above them has changed.
- **Internal consistency.** When everything traces to goals and values, contradictions and misalignment become visible — across projects, across scopes, across time.

## How It Works

GVP organizes decision-making into Libraries — directories that store YAML specifications for elements, tag definitions, and config files. Elements are the building blocks, connected by a many-to-many mapping graph. Each element traces its justification back to the goals and values that motivate it.

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

These are the built-in categories. You can override their properties or define
entirely new categories via `meta.definitions.categories` in any GVP document.
See the [Schema Reference](docs/reference/schema.md#category-definitions).

Tags can further classify elements by domain (e.g., `code`, `systems`, `finance`) or concern (e.g., `reliability`, `usability`). See [Tags](#tags) below.

### Relationships

- **Goals** are the destination. Everything else exists to get there.
- **Values** are the compass. They shape every decision but don't prescribe specific actions.
- **Principles** state preferences. **Heuristics** encode the procedure for applying them. **Rules** are principles with zero tolerance for exceptions.
- **Constraints** are external facts that shape your choices but aren't themselves decisions.
- The relationships are a **graph**, not a tree — many-to-many.

Goals and values are tightly coupled and sometimes hard to distinguish (see [docs/philosophy.md](docs/philosophy.md)). While neither is required to map to anything, mapping them to each other is encouraged — it surfaces alignment gaps and strengthens review.

### Traceability

Every element (except goals, values, and constraints) must trace its justification to at least one goal and one value — directly or transitively through other elements in the mapping graph.

For per-category traceability requirements, see the [Validation Reference](docs/reference/validation.md#traceability-rules).

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

### Tags

Elements can be classified with tags. Tags are defined in a document's `meta.definitions.tags` block — either inline alongside elements, or in a dedicated file. How you organize your tags is up to you — one useful pattern is separating them into:

- **Domain tags** (`code`, `systems`, `finance`, ...): what area the element applies to
- **Concern tags** (`maintainability`, `reliability`, `usability`, ...): what quality the element addresses

But this is a convention, not a requirement. The tagging system is agnostic — use whatever groupings make sense for your context.

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

## Commands

### validate

Check a catalog for structural errors and traceability violations.

```bash
gvp validate --library path/
gvp validate --library path/ --strict
```

### render

Generate output in markdown, CSV, SQLite, DOT, or PNG format.

```bash
gvp render --library path/ --format markdown --stdout
gvp render --library path/ --format dot --stdout | dot -Tpng -o graph.png
```

### trace

Walk the mapping graph from a given element.

```bash
gvp trace --library path/ personal:H1
gvp trace --library path/ personal:G1 --reverse
```

### review

Review elements for staleness after upstream changes.

```bash
gvp review --library path/
gvp review --library path/ personal:P3
```

For the full command reference including `add`, `edit`, `query`, and all flags, see the [Usage Reference](docs/guide/usage.md).

## Further Reading

- [Glossary](GLOSSARY.md) — canonical term definitions
- [Philosophy](docs/philosophy.md) — on fuzzy boundaries between goals, values, and principles
- [Developing a Library](docs/guide/developing-a-library.md) — practical guidance for building GVP libraries
- [Usage Reference](docs/guide/usage.md) — full CLI command and flag reference
- [AI Integration](docs/guide/ai-integration.md) — using GVP with AI assistants
- [Schema Reference](docs/reference/schema.md) — YAML document format specification
- [Validation Reference](docs/reference/validation.md) — traceability rules, error codes, and warnings
- [Config Reference](docs/reference/config.md) — configuration discovery and options
