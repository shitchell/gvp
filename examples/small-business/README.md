# Example: Small Business

A 2-level GVP library for a fictional coffee shop ("Sunrise Coffee") opening a second location. Demonstrates that GVP works beyond software — any domain where decisions trace back to goals and values.

## Structure

```
small-business/
├── business.yaml          # core goals, values, principles, rules
└── projects/
    └── new-location.yaml  # project goals, milestones, constraints, design choices
```

### Inheritance Chain

```
business (organization)
  └─ new-location (project)
```

## Try It

```bash
# Validate the library
cairn validate --library examples/small-business/

# Query all principles
cairn query --library examples/small-business/ --category principle

# Trace a design choice back to its roots
cairn inspect --library examples/small-business/ new-location:D1 --trace

# Export to markdown
cairn export --library examples/small-business/ --format markdown
```
