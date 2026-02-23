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
gvp validate --library examples/software-project/

# Query elements by tag
gvp query --library examples/software-project/ --tag code

# Trace an element's mapping graph
gvp trace --library examples/software-project/ personal:H1

# Render to markdown
gvp render --library examples/software-project/ --format markdown --stdout
```

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

## Further Reading

- [GLOSSARY.md](GLOSSARY.md) — canonical term definitions
- [docs/plans/](docs/plans/) — design documents and implementation plans
