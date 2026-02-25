# Example: Software Project

A 4-level GVP library for a fictional CLI task manager called "taskflow." Demonstrates cross-scope traceability, the distinction between project and implementation scope, domain-specific categories, and the quality-vs-speed trade-off modeled coherently within the GVP.

## Structure

```
software-project/
├── universal.yaml         # org-wide goals, values, principles, heuristics, rules, constraints (+ tag definitions)
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

## Project vs. Implementation Scope

This is the most important structural distinction in this example.

**Project scope** (`taskflow.yaml`) contains goals, constraints, and milestones -- things that would survive if you rewrote the implementation from scratch. G1 "Manage tasks from the command line" is a project goal regardless of whether you use Python or Go, JSON or SQLite. G2 "Reliable task storage" is a project goal regardless of the storage backend. CON2 "Ship v1 by end of March" is a deadline that applies to any implementation.

**Implementation scope** (`v1.yaml`) contains design choices, implementation rules, and coding principles -- things tied to the current tech stack. D1 "JSON file storage" is a v1 choice; a v2 might switch to SQLite without changing the project goals. IR1 "Atomic file writes" is an implementation rule that exists because of D1; if the storage backend changed, this rule might not apply. CP1 "One Click command per file" is a coding principle tied to the Click framework choice in D2.

This distinction matters for impact analysis. When a project goal changes, all implementation elements that trace to it may need revisiting. But when an implementation choice changes (say, swapping JSON for SQLite), only implementation-scope elements are affected -- the project goals remain stable.

## Scoping Conventions

This example uses four scope levels. The core GVP framework only requires at least one -- the scoping here reflects one way to organize decision-making for software development:

| Scope | Purpose | Example from this library |
|-------|---------|--------------------------|
| **Universal** | Org-wide standards, rarely changes | UG1 "Sustainable revenue" |
| **Personal** | Individual cross-project values | V1 "Simplicity" |
| **Project** | Goals and constraints for a specific effort | G1 "Manage tasks from the command line" |
| **Implementation** | Current tech stack choices and rules | D1 "JSON file storage" |

## Extended Categories

The core GVP categories (Goal, Value, Principle, Heuristic, Rule, Design Choice, Milestone, Constraint) work at any scope. This example adds two categories specific to software implementation:

| Category | Must map to... |
|----------|----------------|
| **Implementation Rule** | (1+ goal AND 1+ value) OR 1+ design choice |
| **Coding Principle** | (1+ goal AND 1+ value) OR 1+ principle or design choice |

These categories exist because implementation-scope elements often need different traceability rules than their higher-scope counterparts. An implementation rule like IR1 "Atomic file writes" traces to D1 "JSON file storage" -- a design choice -- rather than directly to a goal-and-value pair. This is valid because the design choice itself already traces upward to goals and values.

Here is how each category is used across this library:

| Category | Scope | Description | How to identify |
|----------|-------|-------------|-----------------|
| **Goal** | Universal/Project | Ideal states you are working toward | Is it a destination, not a method? |
| **Value** | Universal/Personal | Qualities that shape trade-offs | Does it describe a quality you favor, not a specific action? |
| **Principle** | Universal/Personal | Preferences that require judgment to apply | Is it a bias that requires judgment? |
| **Heuristic** | Universal/Personal | If/then decision trees | Can you write it as an if/then tree? |
| **Rule** | Universal/Personal | Hard stops, no exceptions | Is it a bright line that is never crossed? |
| **Design Choice** | Implementation | Tools and architectural decisions for this build | Would it change if you switched frameworks? |
| **Constraint** | Any | Facts about the environment you do not control | Is it a fact you do not control? |
| **Milestone** | Project | Concrete waypoints on the path to goals | Is it a concrete, achievable state on the roadmap? |
| **Implementation Rule** | Implementation | Hard stops contingent on design choices | Would it change if the design choice changed? |
| **Coding Principle** | Implementation | Guidelines for writing code in this stack | Would it change if you switched languages or frameworks? |

## The Revenue-Quality Trade-off

A key pattern demonstrated here is how UH1 "Quality vs. speed trade-off" connects a concrete implementation shortcut to organizational goals without contradiction.

The trace chain for D3 "Skip comprehensive input validation in v1":

```
D3 "Skip comprehensive input validation in v1"
  maps_to → UH1 "Quality vs. speed trade-off"
              maps_to → UG1 "Sustainable revenue"
              maps_to → UV2 "Craftsmanship"
              maps_to → UV3 "Transparency"
  maps_to → G1 "Manage tasks from the command line"
  maps_to → V1 "Simplicity"
```

This is coherent, not contradictory. UH1 does not say "ignore quality" -- it says "when deadline pressure is high and the feature is not safety-critical, prefer shipping correct-but-unpolished over delaying for elegance." D3 applies exactly this logic: input validation is not safety-critical, the deadline CON2 is tight, so basic type checks ship now and rich error messages are deferred to v1.1.

The trade-off traces upward to both UG1 "Sustainable revenue" (the business needs shipping software) and UV2 "Craftsmanship" (the quality standard is maintained by documenting what was deferred and why, per UP1 "Capture rationale always"). Revenue and craftsmanship are not in tension -- sustainable revenue requires shipping, and shipping garbage destroys the trust that drives revenue.

## Element Litmus Tests

The following walk through specific elements as teaching moments for categorization.

**Why is UV2 "Craftsmanship" a value and not a goal?** Because it describes a quality you favor in how work is done, not a measurable target state. You cannot "achieve" craftsmanship and check it off -- it is a persistent orientation that shapes every decision. A goal like UG2 "Build products users rely on" describes a destination; UV2 describes the disposition you bring to the journey.

**Why is UH1 "Quality vs. speed trade-off" a heuristic and not a principle?** Because it has explicit if/then structure: if safety-critical, quality wins; if not safety-critical and deadline pressure is high, ship correct-but-unpolished; if pressure is low, default to craftsmanship. A principle like UP1 "Capture rationale always" states a preference that requires judgment to apply. UH1 goes further -- it is a decision tree you can follow mechanically once you classify the inputs.

**Why is D1 "JSON file storage" at implementation scope?** Because it would change if you switched storage backends. The project goal G2 "Reliable task storage" would not -- you would still want reliable storage whether you use JSON, SQLite, or a remote database. D1 is a specific technical decision for this build; G2 is the enduring requirement that D1 serves.

**Why is CON2 "Ship v1 by end of March" a constraint and not a goal?** Because it is a fact about the environment -- an imposed deadline driven by a client demo -- not a target state you chose. You do not "value" shipping by March; you are constrained by it. A goal is something you work toward because it aligns with your values. A constraint is something you work within because you have no choice.

## Try It

```bash
# Validate the library
gvp validate --library examples/software-project/

# Trace the quality/speed trade-off from D3 upward
gvp trace --library examples/software-project/ taskflow-v1:D3

# See what traces to sustainable revenue
gvp trace --library examples/software-project/ universal:UG1 --maps-to

# Query all business-tagged elements
gvp query --library examples/software-project/ --tag business

# Render to markdown
gvp render --library examples/software-project/ --format markdown --stdout
```
