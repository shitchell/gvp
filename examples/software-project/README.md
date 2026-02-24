# Example: Software Project

A 4-level GVP library for a fictional CLI task manager called "taskflow." Demonstrates cross-scope traceability, domain-specific categories, tags, provenance tracking, and review.

## Structure

```
software-project/
├── tags.yaml              # domain + concern tag registry
├── universal.yaml         # org-wide values and rules
├── personal.yaml          # cross-project goals, values, principles, heuristics, rules
└── projects/
    ├── taskflow.yaml      # project goals, milestones, constraints
    └── taskflow/
        └── v1.yaml        # implementation design choices, rules
```

### Inheritance Chain

```
universal (organization)
  └─ personal (individual, cross-project)
       └─ taskflow (project)
            └─ taskflow-v1 (implementation)
```

## Scoping Conventions

This example uses four scope levels. The core GVP framework only requires at least one — the scoping here reflects one way to organize decision-making for software development:

| Scope | Purpose | Example |
|-------|---------|---------|
| **Universal** | Shared across an organization or team. Rarely changes. | "Users should be able to trust the system with their data." |
| **Personal** | Your own cross-project values and principles. The default working scope. | "Prefer the simplest approach that meets the requirement." |
| **Project** | Goals, milestones, and constraints for a specific effort. | "Users can manage tasks from the command line." |
| **Implementation** | Tools picked and architectural decisions for a specific build. | "Use JSON file storage." |

The "implementation" scope is where this example introduces domain-specific categories beyond the core set.

## Extended Categories

The core GVP categories (Goal, Value, Principle, Heuristic, Rule, Design Choice, Milestone, Constraint) work at any scope. This example adds categories specific to software implementation:

| Category | Scope | Specificity | Description | How to identify |
|----------|-------|-------------|-------------|-----------------|
| **Goal** | Project | Low | Ideal states you're working toward. Would remain true if you rewrote everything tomorrow. | Is it a destination, not a method? |
| **Value** | Universal/Personal | Low | Semantic descriptors that shape trade-offs. The thumb on the scale when two valid approaches exist. | Does it describe a quality you want, not a specific action? |
| **Principle** | Universal/Personal | Medium | Less fuzzy than a value, more flexible than a rule. States a preference that requires judgment to apply. | Is it a bias or preference that requires judgment? |
| **Heuristic** | Universal/Personal | High | Well-defined if/then decision trees. Where a principle says "prefer X," a heuristic says "if A, then B; else C." | Can you write it as an if/then tree? |
| **Rule** | Universal/Personal/Project | High | Hard stops. Binary, no exceptions. A principle that graduated to "never cross this line." | Is it a bright line that's never crossed? |
| **Design Choice** | Implementation | High | Tools you've picked and high-level architectural decisions for a specific build. Change when the implementation changes. | Would it change if you switched frameworks? |
| **Implementation Rule** | Implementation | High | Hard stops contingent on design choices. If the design choice changes, the rule may not apply. | Would it change if you switched frameworks? |
| **Coding Principle** | Implementation | Medium-High | Guidelines for writing code in a specific implementation. Change with the tech stack. | Would it change if you switched frameworks? |
| **Milestone** | Project | High | Concrete, achievable waypoints on the path to goals. Ordered near-term to long-term. | Is it a concrete, achievable state on the roadmap? |
| **Constraint** | Project | High | Facts about the system or environment you don't control. Descriptive, not prescriptive. | Is it a fact about the system you don't control? |

The "Scope" column here reflects how *this example* uses each category. Other projects may use them differently — the framework doesn't enforce scope assignments, only traceability.

## Relationships

```
Goals ←── Values
  ↑          ↑
  ├── Principles ──→ Heuristics ──→ Rules
  ↑
  ├── Design Choices ──→ Implementation Rules
  │                  ──→ Coding Principles
  ↑
  ├── Milestones
  │
  └── Constraints (no mapping required)
```

## Try It

```bash
# Validate the library
gvp validate --library examples/software-project/

# Trace a heuristic back to its roots
gvp trace --library examples/software-project/ personal:H1

# Query all code-tagged elements
gvp query --library examples/software-project/ --tag code

# Render to markdown
gvp render --library examples/software-project/ --format markdown --stdout

# Check for stale elements needing review
gvp review --library examples/software-project/
```
