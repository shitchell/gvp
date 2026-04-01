# GVP Library Organization

How to structure your GVP library for different scales and needs.

## Single-Document (Simple Projects)

One file covers everything:

```
.gvp/library/
  project.yaml        ← all elements in one file
```

Good for: small projects, personal tools, learning GVP.

## Multi-Document (Growing Projects)

Separate persistent elements from implementation-specific ones:

```
.gvp/library/
  project.yaml        ← goals, values, constraints, principles (persistent)
  v1.yaml             ← decisions, milestones for current version (changes)
```

**Why separate?** Goals and values rarely change. Decisions change every version.
Separating them means `v1.yaml` can inherit from `project.yaml` and add
implementation-specific decisions without cluttering the persistent file.

```yaml
# v1.yaml
meta:
  name: v1
  scope: implementation
  inherits:
    - project          # inherits all goals, values, principles
```

## Multi-Layer (Teams and Orgs)

Layer libraries from broad to specific:

```
Org GVP (shared repo)           ← org goals, values, standards
    ↑ inherits
Team/Personal GVP               ← personal values, coding principles
    ↑ inherits
Project GVP                     ← project-specific decisions
    ↑ inherits
Implementation GVP              ← version-specific decisions
```

Each layer inherits from its parent and adds its own elements:

```yaml
# Project .gvp/library/project.yaml
meta:
  name: my-project
  inherits:
    - source: "@github:company/org-gvp@v2.0.0"
      as: org
    - source: "@github:myuser/personal-gvp@v1.0.0"
      as: personal

decisions:
  - id: D1
    name: Use company auth service
    rationale: Required by org security policy.
    maps_to: [org:values:V3, my-project:G1]
```

## Scoping Guidelines

| Scope | What goes here | Changes how often |
|-------|---------------|-------------------|
| `universal` | Org-wide goals, values, standards | Rarely (quarterly) |
| `personal` | Individual values, coding principles | Occasionally |
| `project` | Project goals, values, constraints, principles | Per-project |
| `implementation` | Decisions, milestones, rules for a specific version | Per-release |

## Tags for Cross-Cutting Concerns

Use tags instead of separate files for domain concerns:

```yaml
meta:
  definitions:
    tags:
      backend:
        description: Server-side concerns
      security:
        description: Security and access control
      performance:
        description: Performance requirements

decisions:
  - id: D1
    name: Use connection pooling
    tags: [backend, performance]
```

Then query by concern: `cairn query --tag security`

## When to Create a New Document vs. Use Tags

**New document when:**
- Different lifecycle (goals vs decisions)
- Different scope (org vs project)
- Different inheritance (v1 inherits project but v2 won't inherit v1)

**Tags when:**
- Same lifecycle, different domains (backend vs frontend)
- Cross-cutting concerns (security touches everything)
- You want to query/filter but don't need separate inheritance

## Custom Categories

For domain-specific element types, define them in `meta.definitions.categories`:

```yaml
meta:
  definitions:
    categories:
      api_endpoint:
        yaml_key: api_endpoints
        id_prefix: API
        primary_field: description
        mapping_rules:
          - [goal, value]
        field_schemas:
          method:
            type: enum
            values: ["GET", "POST", "PUT", "DELETE"]
            required: true
          path:
            type: string
            required: true
```

Or just use decisions with tags — custom categories are powerful but add
complexity. Start simple, add categories only when tags aren't sufficient.
