<p align="center">
  <img src="docs/cairn.png" alt="Cairn" width="300" />
</p>

# Cairn — Goals, Values, and Principles

A decision traceability framework. Define your goals, values, and principles in YAML. Trace every decision back to what drives it. Link decisions to the code, documents, and artifacts they produce.

## Install

```bash
npm install -g @principled/cairn
```

> **Note:** `gvp` is available as an alias for `cairn`.

## Quick Start

```bash
# Before authoring anything: check whether the guidance already exists.
# Cairn registers every library it resolves, so you can inherit instead of re-deriving.
cairn libs search "simplicity"

# Initialize a GVP library
mkdir -p .gvp/library
cat > .gvp/library/project.yaml << 'EOF'
meta:
  name: my-project
  scope: project

goals:
  - id: G1
    name: Recoverable state
    statement: >
      A user who loses their machine can rebuild every byte of their data
      from the files we wrote to their disk.
    tags: []
    maps_to: []

values:
  - id: V1
    name: Simplicity
    statement: Complexity must earn its place.
    tags: []
    maps_to: []

decisions:
  - id: D1
    name: Persist state as an append-only event log
    disposition: accepted
    rationale: >
      "Anything with a mutable schema needs a migration story the first time
      the schema changes. An append-only log only ever needs a reader for the
      older shape, which is a test I can write today."
    tags: []
    maps_to: [my-project:G1, my-project:V1]
    considered:
      sqlite:
        rationale: "Queryable and transactional, but adds a native dependency and a schema to migrate on every change."
        would_have_served: [my-project:G1]
        conflicts_with: [my-project:V1]
      mutable_json_blob:
        rationale: "Fewest moving parts, but a partial write destroys the whole history rather than the last record."
        would_have_served: [my-project:V1]
        conflicts_with: [my-project:G1]
    refs:
      - file: src/store.ts
        identifier: appendEvent
        role: implements
EOF

# Validate
cairn validate

# Export
cairn export --format json
cairn export --format markdown
```

> Note what the example models: a goal stating a **checkable outcome** rather than
> "software that works"; a decision whose `rationale` is a **verbatim quote**; and
> `considered` alternatives that name what each one **would have served** and what
> it **conflicts with**. A decision without its rejected alternatives records the
> choice but loses the reasoning — which is the part you need when revisiting it.

## Commands

| Command | Description |
|---------|-------------|
| `cairn validate` | Validate the GVP library |
| `cairn validate --coverage` | Include coverage checks (orphan identifiers, decisions without refs) |
| `cairn validate --scope staged` | Scope validation to staged git changes |
| `cairn validate --include-inherited` | Show diagnostics on inherited elements (default: counted, not listed) |
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
| `cairn query --list documents` | List the documents in the resolved library, with element counts |
| `cairn diff <commitA> <commitB>` | Trace code changes back to decisions |
| `cairn analyze` | Detect unmapped relationships via similarity |

## Global Options

| Flag | Description |
|------|-------------|
| `--config <path>` | Load specific config file |
| `--no-config` | Skip all config files |
| `-c key=value` | Inline config override. Repeat the flag for more than one: `-c strict=true -c source=@local`. |
| `--strict` | Promote warnings to errors |
| `-v` / `-vv` / `-vvv` | Verbose output |

Global options may be written before the subcommand or after it — `cairn -c strict=true query` and `cairn query --strict` are both accepted. Where a subcommand defines the same short flag, the subcommand wins in the trailing position: `cairn -c strict=true query -c decision` sets the config override `strict=true` and filters to the `decision` category, and `-c` after `query` is always `--category`.

## Validation Codes

### Errors

| Code | Name | Description |
|------|------|-------------|
| E001 | BROKEN_REFERENCE | `maps_to` target not found |
| E002 | DUPLICATE_ELEMENT_ID | Duplicate element ID within a document |
| E003 | BROKEN_INHERITANCE | Inherited document not found |
| E004 | SCHEMA_VALIDATION | Element fails schema validation |
| E005 | DUPLICATE_STEP_ID | Duplicate step ID within a procedure |
| E006 | DUPLICATE_DOCUMENT_NAME | Two documents in one library share a `meta.name` |

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
| W015 | AUTO_ASSIGNED_STEP_ID | Procedure has steps without explicit IDs; auto-numbered at load time |
| W016 | UNRECOGNIZED_YAML_KEY | Top-level YAML key is neither `meta` nor a known category `yaml_key` |
| W017 | NO_VALUE_TRACE | Non-root element does not trace to any value transitively (soft anchor) |
| W018 | ROOT_NO_DECISION | Actionable root (`requires_decision`) has no Decision tracing to it (coverage pass) |

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

# Scope diagnostic DISPLAY by source (see below). Inherited elements are
# someone else's to fix; by default their diagnostics are counted, not listed.
diagnostics:
  inherited: count        # show | count | hide
  by_source:
    "@github:shitchell/gvp-docs": count

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

### Diagnostics you cannot fix

Inheriting a library means inheriting its diagnostics. They are the upstream author's
defects, unfixable from your repo, and they bury your own signal -- 49 of this repo's
148 warnings landed on upstream elements.

`diagnostics` scopes display by source, in three states:

- **`show`** -- print every diagnostic individually
- **`count`** -- withhold the lines, print a one-line roll-up (**default for inherited sources**)
- **`hide`** -- withhold the lines and the counts, print a bare `N sources fully hidden` trace

```console
$ cairn validate
WARN  W005  gvp:D4   Element gvp:D4 maps only to elements within its own document
...
  49 further warnings from @github:shitchell/gvp-docs@v0.7.0 (W005 ×24, W003 ×23, W017 ×2)
  → --include-inherited to show
```

There is deliberately no state that renders *nothing*. `gvp:P9` says "hide what is not
actively needed, but never lose it" -- so even `hide` confesses that it is hiding
something. That is the difference between this and `suppress_diagnostics`, which
leaves no trace at all.

The two are orthogonal, not redundant: `suppress_diagnostics` answers *"I don't care
about this kind of finding"*; `diagnostics.by_source` answers *"this isn't my code."*
They compose as per-code x per-source. Errors are never scoped -- an invalid catalog
is your problem whoever authored it.

See [docs/reference/validation.md](docs/reference/validation.md#source-scoped-diagnostics)
for the full rules.

## Built-in Categories

| Category | Prefix | Root | Primary Field |
|----------|--------|------|---------------|
| goal | G | yes | statement |
| value | V | yes | statement |
| constraint | C | yes | impact |
| user_requirement | U | yes | statement |
| exclusion | X | yes | statement |
| principle | P | no | statement |
| rule | R | no | statement |
| heuristic | H | no | statement |
| decision | D | no | rationale |
| milestone | M | no | description |
| procedure | S | no | description |

**Root** categories (goal, value, constraint, user_requirement, exclusion) need no
upward mapping. A **user_requirement** is a stakeholder-decreed mandate asserted as
input — not derivable from any value (that is what makes it a requirement and not a
rule). An **exclusion** is a self-imposed out-of-scope boundary — the negative space
of goals. Every non-root element anchors to any non-value root **and** should trace
to a value (enforced softly by W017). Decisions carry a `disposition`
(`accepted` | `declined` | `deferred`); a `declined`/`deferred` decision's rationale
is the record, so it is exempt from the decision-needs-refs check (W013).

## Cross-Repo Inheritance

GVP libraries can inherit from other libraries hosted in git repositories.
Documents reference external sources in `meta.inherits`:

```yaml
meta:
  name: my-project
  inherits:
    - source: "@github:company/org-gvp@v1.0.0"
      as: org
    - source: "@azure:myorg/myproject/shared-gvp@v2.1.0"
      as: shared
```

Supported providers:

| Provider | Format | Resolves to |
|----------|--------|-------------|
| GitHub | `@github:user/repo@tag` | `https://github.com/user/repo.git` |
| Azure DevOps | `@azure:org/project/repo@tag` | `https://dev.azure.com/org/project/_git/repo` |
| GitLab | `@gitlab:user/repo@tag` | `https://gitlab.com/user/repo.git` |
| Bitbucket | `@bitbucket:user/repo@tag` | `https://bitbucket.org/user/repo.git` |

The commit-ish must be an immutable reference (tag or SHA) — branches are not
allowed. Sources are cached at `~/.cache/cairn/sources/` and only cloned once.

Elements resolve by the library short address `[<alias>:]<meta.name>:<id>` — the
`as:` alias selects the inherited library, and `meta.name` (not the file path)
selects the document, so references survive upstream file reorganization. A bare
`<meta.name>:<id>` resolves across all libraries (preferring the local one on a
name collision); qualify with the alias when it is ambiguous. `meta.name` must be
unique within each library (enforced by `E006`).

```yaml
decisions:
  - id: D1
    name: Follow org coding standards
    maps_to: [org:values:V1, my-project:G1]   # org:<meta.name>:<id>
```

## What's in the library I'm actually using?

`cairn query --list <type>` enumerates a kind of thing in the **resolved
catalog** — the library this project actually builds, root plus everything it
inherits. Today the one type is `documents`:

    cairn query --list documents                  # name, count, source
    cairn query --list documents --format json    # stable schema for agents

Each row carries `name`, `document_path`, `source`, `description` (from
`meta.description`), `scope`, `element_counts` (keyed by category, e.g.
`principles`) and `element_total`. It is the index to read at the start of a
session to decide which documents bear on the task.

`--list` selects **what** to enumerate; `--format` still selects **how** to
render it, so the two compose. The element filters (`--category`, `--tag`,
`--status`, `--include-deprecated`) change the **counts**; `--document`
changes which **rows** appear. A document with no matching elements is still
listed, at zero — it is never silently dropped.

`query --format json` also tags every element with `_document`,
`_documentPath` and `_source`, which are exactly the row key above, so element
output and the document listing join on equality.

This is **not** the same question as `cairn libs list` below. `--list
documents` reads the catalog this invocation resolved; `libs` reads the
machine-wide record of every library cairn has ever seen, on any project.

## Library registry

Cairn records every library it resolves into `~/.gvp/registry/` (override with
`GVP_REGISTRY_ROOT`), so a new project can discover guiding elements that
already exist instead of re-deriving them.

    cairn libs list                  # everything cairn has seen
    cairn libs search "flex point"   # across every known library
    cairn libs show personal         # detail + which projects have used it
    cairn libs forget <source>:<doc> # drop one entry
    cairn libs prune [--remote]      # drop entries whose document is gone

`search` matches element names and each category's **primary field** —
resolved from the schema, not hard-coded — so a decision's `rationale` and a
constraint's `impact` are searchable, not just `statement`. It never reaches
the network unless you pass `--fetch`, and it names everything it skipped
rather than returning a quietly incomplete answer.

`show` and `forget` refuse to guess: `meta.name` is not unique across
libraries, so an ambiguous name lists its candidates and exits non-zero
rather than picking one. All three commands take `--json`.

Recording is on by default. Opt out with `registry.enabled: false` in any
config layer, or `--no-registry` for a single invocation. Recording never
changes a command's exit code or output; on failure it warns once to stderr
and carries on.

Recording happens when a command builds the catalog, so `cairn init` — which
creates a library rather than loading one — does not itself register the
project. The first `validate`, `query`, or `export` does.

**The registry is safe to delete — but rebuilding it is lossy.** Nothing
breaks if you `rm -rf ~/.gvp/registry`, and cairn will not complain. But it
does not rebuild itself: each library reappears only when cairn next
resolves it, so a library you have not touched since deleting is simply
absent until you next work in a project that uses it.

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
