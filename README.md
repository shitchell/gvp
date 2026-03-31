# Cairn — Goals, Values, and Principles

A decision traceability framework. Define your goals, values, and principles in YAML. Trace every decision back to what drives it. Link decisions to the code, documents, and artifacts they produce.

## Install

```bash
npm install -g @principled/cairn
```

> **Note:** `gvp` is available as an alias for `cairn`.

## Quick Start

```bash
# Initialize a GVP library
mkdir -p .gvp/library
cat > .gvp/library/project.yaml << 'EOF'
meta:
  name: my-project
  scope: project

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
EOF

# Validate
cairn validate

# Export
cairn export --format json
cairn export --format markdown
```

## Commands

| Command | Description |
|---------|-------------|
| `cairn validate` | Validate the GVP library |
| `cairn validate --coverage` | Include coverage checks (orphan identifiers, decisions without refs) |
| `cairn validate --scope staged` | Scope validation to staged git changes |
| `cairn export --format <fmt>` | Export catalog to json, csv, markdown, or dot |
| `cairn add <category> <name>` | Add a new element with auto-assigned ID |
| `cairn edit <element> --field key=value` | Modify an existing element |
| `cairn review` | Find stale elements needing review |
| `cairn review <element>` | Review a specific element |
| `cairn inspect <element>` | View element details |
| `cairn inspect <element> --trace` | Trace element to its goals and values |
| `cairn inspect --ref file::identifier --trace` | "Why does this code exist?" |
| `cairn query --category decision` | Filter elements by category, tag, status |
| `cairn query --refs-file src/foo.ts` | Find elements referencing a file |
| `cairn diff <commitA> <commitB>` | Trace code changes back to decisions |
| `cairn analyze` | Detect unmapped relationships via similarity |

## Global Options

| Flag | Description |
|------|-------------|
| `--config <path>` | Load specific config file |
| `--no-config` | Skip all config files |
| `-c key=value` | Inline config override |
| `--strict` | Promote warnings to errors |
| `-v` / `-vv` / `-vvv` | Verbose output |

## Validation Codes

### Errors

| Code | Name | Description |
|------|------|-------------|
| E001 | BROKEN_REFERENCE | `maps_to` target not found |
| E002 | DUPLICATE_ELEMENT_ID | Duplicate element ID within a document |
| E003 | BROKEN_INHERITANCE | Inherited document not found |
| E004 | SCHEMA_VALIDATION | Element fails schema validation |

### Warnings

| Code | Name | Description |
|------|------|-------------|
| W001 | EMPTY_MAPS_TO | Non-root active element has no `maps_to` |
| W002 | EMPTY_DOCUMENT | Document has no active elements |
| W003 | MAPPING_RULES_VIOLATION | Element doesn't satisfy category mapping rules |
| W004 | ORPHAN_ELEMENT | Isolated element (no incoming or outgoing edges) |
| W005 | SELF_DOCUMENT_MAPPING | Element maps only within its own document |
| W006 | STALE_ELEMENT | Element has unreviewed updates |
| W007 | UNDEFINED_TAG | Element uses tag not in definitions |
| W008 | DUPLICATE_CATEGORY_DEF | Duplicate category definition within library siblings |
| W009 | ID_SEQUENCE_GAP | Gap in element ID sequence |
| W010 | REF_FILE_MISSING | Ref points to nonexistent file |
| W011 | REF_IDENTIFIER_MISSING | Ref identifier not found in file |
| W012 | ORPHAN_IDENTIFIER | Identifier not referenced by any element (coverage pass) |
| W013 | DECISION_NO_REFS | Decision has no refs (coverage pass) |
| W014 | NO_ROOT_TRACE | Element cannot trace to any root element transitively |

## Config

Config files are discovered in this order (closer scope wins):

1. `/etc/gvp/config.yaml` (system)
2. `~/.config/gvp/config.yaml` (global)
3. `.gvp/config.yaml` (project)
4. `.gvp.yaml` (local, gitignored)

Environment variables: `GVP_CONFIG_SYSTEM`, `GVP_CONFIG_GLOBAL`, `GVP_CONFIG_PROJECT`, `GVP_CONFIG_LOCAL`

```yaml
# .gvp/config.yaml
user:
  name: "Your Name"
  email: "you@example.com"

strict: false
suppress_diagnostics: []
default_timezone: "America/New_York"

priority:
  elements: ancestor      # ancestor-wins for elements
  definitions: descendant  # descendant-wins for definitions

# Coverage settings (patterns use glob syntax via minimatch: *, **, ?)
coverage:
  exclude:
    - "README.md"
    - ".gvp/**"
    - "**/*.test.ts"
    - "docs/**"
```

## Built-in Categories

| Category | Prefix | Root | Primary Field |
|----------|--------|------|---------------|
| goal | G | yes | statement |
| value | V | yes | statement |
| constraint | C | yes | impact |
| principle | P | no | statement |
| rule | R | no | statement |
| heuristic | H | no | statement |
| decision | D | no | rationale |
| milestone | M | no | description |

## Refs — Linking Decisions to Artifacts

Any element can have `refs` linking it to external files:

```yaml
refs:
  - file: src/catalog/catalog.ts
    identifier: Catalog
    role: implements  # defines | implements | uses | extends
```

The `refs` system is domain-agnostic — it works with any file type that has a registered parser (TypeScript, Markdown, YAML built-in).

## Documentation

- [Getting Started](docs/guide/getting-started.md) — Set up GVP on a new project
- [Command Reference](docs/guide/workflow.md#quick-reference) — Command reference
- [Workflow Guide](docs/guide/workflow.md) — End-to-end design → implementation → review workflow
- [Lightweight Capture](docs/guide/lightweight-capture.md) — ~5 min decision capture after brainstorming sessions
