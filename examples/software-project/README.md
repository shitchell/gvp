# Example: Software Project

A 4-level GVP library for a fictional CLI task manager called "taskflow." Demonstrates cross-scope traceability, the quality-vs-speed trade-off, domain-specific categories, tags, provenance tracking, and review.

This example is modeled after gvp's own internal `.gvp/libraries/` files, adapted to a fictional context.

## Structure

```
software-project/
├── tags.yaml              # domain + concern tag registry
├── universal.yaml         # org-wide goals, values, principles, heuristics, rules, constraints
├── personal.yaml          # cross-project goals, values, principles, heuristics, rules
└── projects/
    ├── taskflow.yaml      # project goals, milestones, constraints
    └── taskflow/
        └── v1.yaml        # implementation design choices, rules, coding principles
```

### Inheritance Chain

```
universal (organization)
  └─ personal (individual, cross-project)
       └─ taskflow (project)
            └─ taskflow-v1 (implementation)
```

## Scoping Conventions

This example uses four scope levels. The core GVP framework only requires at least one -- the scoping here reflects one way to organize decision-making for software development:

| Scope | Purpose | Example |
|-------|---------|---------|
| **Universal** | Shared across an organization or team. Rarely changes. | "Never discard user data without explicit confirmation." |
| **Personal** | Your own cross-project values and principles. The default working scope. | "Prefer the simplest approach that meets the requirement." |
| **Project** | Goals, milestones, and constraints for a specific effort. | "Users can manage tasks from the command line." |
| **Implementation** | Tools picked and architectural decisions for a specific build. | "Use JSON file storage." |

## Quality vs. Speed: A Coherent Trade-off

A key pattern demonstrated here is the quality-vs-speed heuristic (UH1) at the universal scope. This is not a conflict with the quality value (UV2) -- it is a decision tree for when and how to apply pragmatism:

- **UH1** traces to both **UG1** (Sustainable revenue) and **UV2** (Craftsmanship)
- At the project scope, **CON2** (Ship v1 by end of March) activates deadline pressure
- At the implementation scope, **D3** (Skip comprehensive validation in v1) explicitly invokes UH1 to justify shipping correct-but-unpolished code under time pressure
- The trade-off is documented with what was deferred and why, per **UP1** (Capture rationale always)

This creates a traceable chain from a concrete implementation shortcut all the way up to organizational goals.

## Extended Categories

The core GVP categories (Goal, Value, Principle, Heuristic, Rule, Design Choice, Milestone, Constraint) work at any scope. This example adds categories specific to software implementation:

| Category | Scope | Specificity | Description | How to identify |
|----------|-------|-------------|-------------|-----------------|
| **Goal** | Universal/Project | Low | Ideal states you're working toward. Would remain true if you rewrote everything tomorrow. | Is it a destination, not a method? |
| **Value** | Universal/Personal | Low | Semantic descriptors that shape trade-offs. The thumb on the scale when two valid approaches exist. | Does it describe a quality you want, not a specific action? |
| **Principle** | Universal/Personal | Medium | Less fuzzy than a value, more flexible than a rule. States a preference that requires judgment to apply. | Is it a bias or preference that requires judgment? |
| **Heuristic** | Universal/Personal | High | Well-defined if/then decision trees. Where a principle says "prefer X," a heuristic says "if A, then B; else C." | Can you write it as an if/then tree? |
| **Rule** | Universal/Personal/Project | High | Hard stops. Binary, no exceptions. A principle that graduated to "never cross this line." | Is it a bright line that's never crossed? |
| **Design Choice** | Implementation | High | Tools you've picked and high-level architectural decisions for a specific build. Change when the implementation changes. | Would it change if you switched frameworks? |
| **Implementation Rule** | Implementation | High | Hard stops contingent on design choices. If the design choice changes, the rule may not apply. | Would it change if you switched frameworks? |
| **Coding Principle** | Implementation | Medium-High | Guidelines for writing code in a specific implementation. Change with the tech stack. | Would it change if you switched frameworks? |
| **Milestone** | Project | High | Concrete, achievable waypoints on the path to goals. Ordered near-term to long-term. | Is it a concrete, achievable state on the roadmap? |
| **Constraint** | Any | High | Facts about the system or environment you don't control. Descriptive, not prescriptive. | Is it a fact about the system you don't control? |

The "Scope" column here reflects how *this example* uses each category. Other projects may use them differently -- the framework doesn't enforce scope assignments, only traceability.

## Try It

```bash
# Validate the library
gvp validate --library examples/software-project/

# Trace a design choice back to its roots
gvp trace --library examples/software-project/ taskflow-v1:D3

# Trace the quality-vs-speed heuristic
gvp trace --library examples/software-project/ universal:UH1

# Query all reliability-tagged elements
gvp query --library examples/software-project/ --tag reliability

# Render to markdown
gvp render --library examples/software-project/ --format markdown --stdout

# Check for stale elements needing review
gvp review --library examples/software-project/
```
