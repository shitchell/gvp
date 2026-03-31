# Getting Started with GVP

## Install

```bash
npm install -g @principled/cairn
```

## Initialize a Library

Create a `.gvp/library/` directory in your project root:

```bash
mkdir -p .gvp/library
```

Create your first GVP document:

```bash
cat > .gvp/library/project.yaml << 'EOF'
meta:
  name: my-project
  scope: project

goals:
  - id: G1
    name: Ship a working product
    statement: Deliver software that solves the problem reliably.
    tags: []
    maps_to: []

values:
  - id: V1
    name: Simplicity
    statement: Keep it simple. Complexity must earn its place.
    tags: []
    maps_to: [my-project:G1]

  - id: V2
    name: Reliability
    statement: Users trust software that works consistently.
    tags: []
    maps_to: [my-project:G1]
EOF
```

## Validate

```bash
cairn validate
```

If everything is well-formed, you'll see:
```
Validation passed. Structural checks OK. Use `cairn export` for semantic review.
```

## Add Elements

Add elements via CLI:

```bash
cairn add principle "Fail loudly" --field statement="Errors should be visible, never silent"
cairn add decision "Use TypeScript" --field rationale="Type safety and ecosystem"
```

Or edit the YAML directly — both approaches are equivalent.

## Link Decisions to Code

Add `refs` to decisions to trace them to the artifacts they produce:

```yaml
decisions:
  - id: D1
    name: Use TypeScript
    rationale: Type safety and npm ecosystem.
    tags: []
    maps_to: [my-project:G1, my-project:V1]
    refs:
      - file: src/index.ts
        identifier: main
        role: implements
```

## Explore

```bash
# See all goals
cairn query --category goal

# Inspect a specific element
cairn inspect V1

# Trace a decision to its goals
cairn inspect D1 --trace

# "Why does this code exist?"
cairn inspect --ref src/index.ts::main --trace

# Export as markdown
cairn export --format markdown
```

## Configure

Create `.gvp/config.yaml` for project settings:

```yaml
user:
  name: "Your Name"
  email: "you@example.com"

strict: false
suppress_diagnostics: []
```

Or `.gvp.yaml` (gitignored) for personal settings.

## Next Steps

- [Workflow Guide](workflow.md) — End-to-end design → implementation → review workflow
- [Command Reference](workflow.md#quick-reference) — Command reference
