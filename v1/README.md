# GVP — Goals, Values, and Principles

A decision traceability framework. Define your goals, values, and principles in YAML. Trace every decision back to what drives it.

## Install

```bash
npm install -g gvp
```

## Quick Start

```bash
# Initialize a GVP library
mkdir -p .gvp/library
cat > .gvp/library/project.yaml << 'EOF'
meta:
  name: my-project

goals:
  - id: G1
    name: Ship reliable software
    statement: Deliver software that works correctly.
    tags: []
    maps_to: []

values:
  - id: V1
    name: Simplicity
    statement: Complexity must earn its place.
    tags: []
    maps_to: [my-project:G1]
EOF

# Validate
gvp validate

# Export
gvp export --format json
gvp export --format markdown
gvp export --format csv
```

## Commands

- `gvp validate` — Validate the GVP library
- `gvp export --format <json|csv|markdown|dot>` — Export to a format
- `gvp --help` — Show all options

## Documentation

See [docs/](../docs/) for design decisions and architecture.
