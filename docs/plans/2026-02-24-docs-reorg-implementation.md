# Documentation Reorganization Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reorganize all GVP documentation into a three-tier audience structure (non-technical, power user, AI), create missing reference and guide docs, and rework the software-project example.

**Architecture:** Docs-only changes. No code modifications. New `docs/guide/` and `docs/reference/` directories. Existing files are edited in place or moved. The software-project example is rebuilt from scratch using gvp's own `.gvp/` library as the foundation, with universal and personal layers added on top.

**Tech Stack:** Markdown, YAML

---

## Task Dependency Graph

```
Task 1: reference/schema.md (standalone — other docs link to it)
Task 2: reference/validation.md (standalone — other docs link to it)
Task 3: reference/config.md (standalone — other docs link to it)
Task 4: guide/usage.md (references reference/ docs)
Task 5: guide/ai-integration.md (references guide/ and reference/ docs)
Task 6: guide/developing-a-library.md trim (links to ai-integration.md)
Task 7: GLOSSARY.md trim (needs schema.md to exist for moved terms)
Task 8: README.md rewrite (links to all new docs)
Task 9: software-project example YAML rework
Task 10: software-project example README rewrite
Task 11: Final cross-link and consistency check
```

Tasks 1-3 can be done in parallel. Task 4 depends on 1-3. Task 5 depends on 4. Tasks 6-8 depend on 5. Task 9 is independent. Task 10 depends on 9. Task 11 depends on all.

---

### Task 1: Create docs/reference/schema.md

**Files:**
- Create: `docs/reference/schema.md`

**Step 1: Create the directory**

```bash
mkdir -p docs/reference
```

**Step 2: Write schema.md**

Content structure:

```markdown
# YAML Schema Reference

Technical reference for the GVP YAML document format. For a conceptual overview, see the [README](../../README.md). For term definitions, see the [Glossary](../../GLOSSARY.md).

## Document Structure

A GVP document is a YAML file with a `meta` block and one or more element lists grouped by category.

### meta Block

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Unique document name. Used in qualified IDs and inherits references. |
| `scope` | string | No | Human-readable scope label (e.g., "universal", "project", "implementation"). Used by user-defined validation rules. |
| `inherits` | string or list[string] | No | Parent document name(s). Forms a DAG — cycles are rejected. |
| `defaults` | mapping | No | Default field values applied to every element in this document unless explicitly overridden. |
| `id_prefix` | string | No | Prefix for auto-generated element IDs (used by `gvp add`). |

### inherits

[Explain single string vs. list form, path-based resolution (e.g., `projects/taskflow` resolves to the document name found at that path), DAG semantics, BFS ancestor resolution order.]

### defaults

[Explain merge behavior: applied to every element, origin field special-cased to wrap single dict in a list. Show example with defaults.origin.]

## Element Categories

Elements are stored under plural YAML keys that map to singular category names:

| YAML Key | Category | Primary Field |
|----------|----------|---------------|
| `goals` | goal | `statement` |
| `values` | value | `statement` |
| `principles` | principle | `statement` |
| `heuristics` | heuristic | `statement` |
| `rules` | rule | `statement` |
| `design_choices` | design_choice | `rationale` |
| `milestones` | milestone | `description` |
| `constraints` | constraint | `impact` |
| `implementation_rules` | implementation_rule | `statement` |
| `coding_principles` | coding_principle | `statement` |

Note: `implementation_rules` and `coding_principles` are not core categories — they are conventions used in the [software-project example](../../examples/software-project/). The framework supports them natively, but they are not required.

## Element Fields

### Common Fields (all categories)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Unique within the document per category. Convention: category prefix + sequential number (e.g., `G1`, `P3`, `D2`). |
| `name` | string | Yes | Human-readable name. |
| `tags` | list[string] | No | Classification labels. Must be defined in `tags.yaml`. |
| `maps_to` | list[string] | No | Qualified IDs (`document:ID`) of elements this traces to. |
| `status` | string | No | `active` (default), `deprecated`, or `rejected`. |
| `origin` | list[mapping] | No | Provenance: where/when this element was first captured. |
| `updated_by` | list[mapping] | No | Change history entries. |
| `reviewed_by` | list[mapping] | No | Review acknowledgment entries. |

### Category-Specific Primary Fields

- **Goals, Values, Principles, Heuristics, Rules, Implementation Rules, Coding Principles:** `statement` — the core content of the element.
- **Design Choices:** `rationale` — explains why this choice was made.
- **Milestones:** `description` — what this waypoint represents. Also supports `progress` (e.g., "complete", "in-progress").
- **Constraints:** `impact` — describes the effect this constraint has on decisions.

### Provenance Fields

[Explain origin, updated_by, reviewed_by structure. Each is a list of mappings with `date`, `note`/`rationale`/`by` fields. Show examples.]

## Qualified IDs

A qualified ID uniquely identifies an element across the entire catalog: `document_name:element_id` (e.g., `personal:P3`, `taskflow-v1:D1`).

- Document names come from `meta.name` (not the filename).
- Element IDs are unique per category per document.
- IDs are never reused — deprecated elements retain their IDs.

## tags.yaml Format

[Explain domains/concerns structure, that groupings are user conventions, show example from software-project.]

## Additional Fields

Any YAML keys on an element not in the common fields list are preserved as extra fields in the `fields` dict. This allows user-defined extensions without schema changes.
```

Source material:
- `src/gvp/model.py` — Element, Document, Catalog dataclasses
- `src/gvp/loader.py` — CATEGORY_MAP (line 14-25), ELEMENT_ATTRS (line 28-37), _apply_defaults (line 53-65), _normalize_inherits (line 89-97), _parse_element (line 100-123), load_document (line 126-147)
- `.gvp/tags.yaml` — example tags.yaml format
- `examples/software-project/tags.yaml` — another example

**Step 3: Verify**

Check that all fields from `model.py` Element and Document dataclasses are documented. Check that all CATEGORY_MAP entries are listed. Check that ELEMENT_ATTRS matches the common fields table.

**Step 4: Commit**

```bash
git add docs/reference/schema.md
git commit -m "docs: add YAML schema reference"
```

---

### Task 2: Create docs/reference/validation.md

**Files:**
- Create: `docs/reference/validation.md`

**Step 1: Write validation.md**

Content structure:

```markdown
# Validation Reference

Technical reference for GVP's validation system. The `gvp validate` command checks a catalog for structural correctness, traceability compliance, and user-defined rules.

## Traceability Rules

Every element (except goals, values, and constraints) must trace its justification to at least one goal and one value — directly or through other elements in the mapping graph.

### Core Categories

| Category | Must map to... |
|----------|---------------|
| Milestone | 1+ goal AND 1+ value |
| Principle | 1+ goal AND 1+ value |
| Rule | 1+ goal AND 1+ value |
| Design Choice | 1+ goal AND 1+ value |
| Heuristic | (1+ goal AND 1+ value) OR 1+ principle or rule |

Goals, values, and constraints are roots — no mapping required. Mapping goals and values to each other is encouraged but not enforced.

### Extended Categories

Projects may define additional categories with their own mapping rules. For example, the [software-project example](../../examples/software-project/) defines:

| Category | Must map to... |
|----------|---------------|
| Implementation Rule | (1+ goal AND 1+ value) OR 1+ design choice |
| Coding Principle | (1+ goal AND 1+ value) OR 1+ principle or design choice |

### How Alternatives Work

[Explain: the "OR" path is a shortcut — if a heuristic maps to a principle, the principle itself must trace to a goal and value. The chain is still complete, just indirect. Deprecated/rejected elements are excluded from traceability checks.]

## Errors

Errors indicate structural problems that must be fixed. They cause `gvp validate` to exit with code 1.

| Check | Description |
|-------|-------------|
| Broken `maps_to` reference | A qualified ID in `maps_to` doesn't match any loaded element. |
| Undefined tag | A tag on an element is not defined in any loaded `tags.yaml`. |
| ID sequence gap | Element IDs within a category in a document have gaps (e.g., P1, P3 with no P2). |
| Broken `inherits` reference | A document's `meta.inherits` names a document not found in any loaded library. |
| Circular inheritance | The inheritance graph contains a cycle. |
| Traceability violation | A non-root element doesn't satisfy its category's mapping rules. |

## Warnings

Warnings indicate potential issues. They are printed to stderr but do not cause failure unless `--strict` is used.

| Code | Description |
|------|-------------|
| W001 | Empty document — a loaded document contains no elements. |
| W002 | Duplicate document name — two documents share the same `meta.name`. The first loaded is kept. In `--strict` mode, this is an error. |
| W003 | Library path does not exist — a configured library path points to a nonexistent directory or file. |
| W004 | Empty `maps_to` — a non-root element has no mapping references. |
| W005 | Self-document-only mapping — an element in an inheriting document maps only to elements in its own document, never tracing back to an inherited ancestor. |
| W006 | Stale element — an ancestor element's `updated_by` date is newer than this element's latest `reviewed_by` date. Use `gvp review` to address. |

## --strict Mode

When `--strict` is passed (or `strict: true` in config), all warnings are promoted to errors. The validate command will exit with code 1 if any warnings exist.

Additionally, W002 (duplicate document name) becomes a hard error that raises an exception rather than silently keeping the first document.

## User-Defined Validation Rules

Custom validation rules can be defined in `config.yaml` under the `validation` key. See [Config Reference](config.md) for the full config format.

[Explain match/require syntax with examples. Reference validate.py lines 147-214 for structure.]

### match Filters

| Filter | Description |
|--------|-------------|
| `category` | Match elements of this category. |
| `scope` | Match elements in documents with this `meta.scope`. |
| `tag` | Match elements that have this tag. |
| `status` | Match elements with this status. |

### require Checks

| Check | Description |
|-------|-------------|
| `min_tags` | Element must have at least N tags. |
| `has_field` | Element must have a non-empty value for the named field. |
| `maps_to_category` | Element must map to at least one element of the named category (or list of categories). |
| `maps_to_scope` | Element must map to at least one element in a document with the named scope (or list of scopes). |

### Example

```yaml
validation:
  rules:
    - name: Design choices must reference a heuristic
      match:
        category: design_choice
      require:
        maps_to_category: heuristic
      level: warning

    - name: Implementation elements must trace to project scope
      match:
        scope: implementation
      require:
        maps_to_scope: project
      level: error
```
```

Source material:
- `src/gvp/commands/validate.py` — _MAPPING_RULES (line 17-25), validate_catalog (line 217-295), _validate_user_rules (line 147-214)
- `src/gvp/loader.py` — W002 (line 184,199), W003 (line 172)
- `src/gvp/__main__.py` — strict handling (line 54-55)

**Step 2: Verify**

- Check every error in validate_catalog is documented
- Check every warning code (W001-W006) matches its code description
- Check _MAPPING_RULES matches the traceability table exactly (especially heuristic including "rule" as alternative)
- Check user-defined rule match/require fields match _validate_user_rules implementation

**Step 3: Commit**

```bash
git add docs/reference/validation.md
git commit -m "docs: add validation reference with traceability rules and warning codes"
```

---

### Task 3: Create docs/reference/config.md

**Files:**
- Create: `docs/reference/config.md`

**Step 1: Write config.md**

Content structure:

```markdown
# Config Reference

Technical reference for GVP configuration. The `gvp` CLI discovers and merges configuration from multiple sources.

## Config Discovery

Configuration is discovered in the following order. Later sources merge into earlier ones (libraries accumulate, booleans OR, lists concatenate):

1. **Walk-backwards from CWD** — starting from the current directory, walk up to the filesystem root. At each level, check for:
   - `.gvp/` directory — if it contains a `libraries/` subdirectory, add it as a library path. If it contains `config.yaml`, parse it.
   - `.gvp.yaml` file — treated as a standalone document and added as a library path.

2. **User config** — `~/.config/gvp/` — same structure as `.gvp/` (optional `libraries/`, optional `config.yaml`).

3. **System config** — `/etc/gvp/` — same structure.

## config.yaml Format

```yaml
# Library paths (expanded with ~)
libraries:
  - ~/my-gvps/personal
  - /shared/org-gvps

# Promote all warnings to errors
strict: false

# Silence specific warning codes
suppress_warnings:
  - W001
  - W005

# User-defined validation rules
validation:
  rules:
    - name: "Rule description"
      match:
        category: design_choice
      require:
        maps_to_category: heuristic
      level: warning
```

## Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `libraries` | list[string] | `[]` | Additional library paths. Paths are expanded (`~` → home). |
| `strict` | bool | `false` | Promote warnings to errors. Can also be set via `--strict` CLI flag. |
| `suppress_warnings` | list[string] | `[]` | Warning codes to silence (e.g., `["W001", "W005"]`). |
| `validation.rules` | list[mapping] | `[]` | User-defined validation rules. See [Validation Reference](validation.md#user-defined-validation-rules). |

## Config Merging

When multiple config sources are found, they are merged:

- `libraries`: concatenated (walk-backwards results first, then user, then system)
- `strict`: OR'd (true in any source → true)
- `suppress_warnings`: unioned (duplicates removed)
- `validation_rules`: concatenated

## CLI Overrides

| Flag | Effect |
|------|--------|
| `--config PATH` | Use only this config file (skip discovery). Use `--config /dev/null` to disable all config. |
| `--library PATH` | Append a library path (repeatable). Added after discovered libraries. |
| `--strict` | Enable strict mode regardless of config. |
```

Source material:
- `src/gvp/config.py` — GVPConfig dataclass (line 12-18), discover_config (line 74-100), _walk_backwards (line 47-62), _collect_from_dir (line 65-71), _parse_config_yaml (line 32-44), merge (line 20-29)
- `src/gvp/__main__.py` — _build_config (line 15-31)

**Step 2: Verify**

- Check discover_config order matches documented order
- Check _parse_config_yaml fields match documented config.yaml format
- Check merge behavior matches documented merging rules
- Check CLI override flags match __main__.py argument definitions

**Step 3: Commit**

```bash
git add docs/reference/config.md
git commit -m "docs: add config reference with discovery cascade and merging rules"
```

---

### Task 4: Create docs/guide/usage.md

**Files:**
- Create: `docs/guide/usage.md`

**Step 1: Create the directory**

```bash
mkdir -p docs/guide
```

**Step 2: Write usage.md**

Content structure — for each subcommand, document every flag from `__main__.py` with examples. Reference the source at `src/gvp/__main__.py`.

```markdown
# CLI Usage Reference

Full reference for every `gvp` subcommand and flag. For a quick overview, see the [README](../../README.md).

## Global Options

These flags apply to all subcommands:

| Flag | Description |
|------|-------------|
| `--version` | Show version and exit. |
| `--strict` | Promote warnings to errors. See [Validation Reference](../reference/validation.md#--strict-mode). |
| `--config PATH` | Override config file path. Use `/dev/null` to disable config discovery. See [Config Reference](../reference/config.md). |

## validate

Check a catalog for structural errors, traceability violations, and user-defined rules.

```bash
gvp validate --library path/
gvp validate --library path/ --strict
```

| Flag | Description |
|------|-------------|
| `--library PATH` | Library path (repeatable). |

On success, prints a reminder that structural validity does not guarantee semantic coherence — use `gvp render` for manual review.

See [Validation Reference](../reference/validation.md) for error codes, warning codes, and traceability rules.

## query

Filter elements by tag, category, document, or status.

```bash
# All heuristics tagged "code"
gvp query --library path/ --tag code --category heuristic

# All elements in a specific document, as JSON
gvp query --library path/ --document personal --format json

# All deprecated elements
gvp query --library path/ --status deprecated
```

| Flag | Description |
|------|-------------|
| `--library PATH` | Library path (repeatable). |
| `--tag TAG` | Filter by tag (repeatable — elements must have at least one matching tag). |
| `--category CAT` | Filter by category. |
| `--document NAME` | Filter by document name. |
| `--status STATUS` | Filter by status (`active`, `deprecated`, `rejected`). |
| `--format FORMAT` | Output format: `table` (default) or `json`. |

## trace

Walk the mapping graph from a given element.

```bash
# Show ancestors (what this element traces to)
gvp trace --library path/ personal:H1

# Show descendants (what traces to this element)
gvp trace --library path/ personal:G1 --reverse

# Find all elements that map to a given element, showing each trace
gvp trace --library path/ personal:G1 --maps-to

# Output as JSON
gvp trace --library path/ personal:H1 --format json
```

| Flag | Description |
|------|-------------|
| `--library PATH` | Library path (repeatable). |
| `--reverse` | Show descendants instead of ancestors. |
| `--maps-to` | Find all elements that map to the given element and print each trace path. |
| `--format FORMAT` | Output format: `text` (default) or `json`. |

## render

Generate output in one or more formats.

```bash
# Render all formats to generated/
gvp render --library path/

# Render markdown to stdout
gvp render --library path/ --format markdown --stdout

# Render multiple specific formats
gvp render --library path/ --format markdown csv

# Render DOT and pipe to graphviz
gvp render --library path/ --format dot --stdout | dot -Tpng -o graph.png

# Render PNG directly (requires graphviz installed)
gvp render --library path/ --format png -o output/

# Include deprecated/rejected elements
gvp render --library path/ --include-deprecated
```

| Flag | Description |
|------|-------------|
| `--library PATH` | Library path (repeatable). |
| `--format FMT [FMT ...]` | Output format(s): `markdown`, `csv`, `sqlite`, `dot`, `png`, or `all` (default: `all`). Multiple formats can be specified. |
| `-o`, `--output DIR` | Output directory (default: `generated/`). |
| `--stdout` | Print to stdout instead of writing files. |
| `--include-deprecated` | Include deprecated and rejected elements in output. |

## review

Review elements for staleness after upstream changes.

```bash
# List all stale elements
gvp review --library path/

# Interactively review a specific element
gvp review --library path/ personal:P3
```

| Flag | Description |
|------|-------------|
| `--library PATH` | Library path (repeatable). |

When called without an element, lists all stale elements (those whose ancestors have been updated since last review). When called with a specific element, enters an interactive review where you can add a review note.

See [Validation Reference](../reference/validation.md) for W006 (staleness detection).

## add

Create a new element in a document. Three input modes: CLI flags, interactive prompts, or editor.

```bash
# Full CLI mode
gvp add principle personal --library path/ --name "New Principle" \
  --statement "Prefer X over Y when Z." --tags "code,reliability" \
  --maps-to "personal:G1,universal:UV1"

# Interactive mode
gvp add heuristic personal --library path/ --interactive

# Editor mode (opens $EDITOR)
gvp add design_choice taskflow-v1 --library path/ --name "Use SQLite"

# Skip provenance tracking for trivial additions
gvp add principle personal --library path/ --name "..." --statement "..." --no-provenance
```

| Flag | Description |
|------|-------------|
| `--library PATH` | Library path (repeatable). |
| `--name NAME` | Element name. |
| `--statement TEXT` | Element statement (or rationale/impact for design choices/constraints). |
| `--tags TAGS` | Comma-separated tags. |
| `--maps-to IDS` | Comma-separated qualified IDs. |
| `--interactive` | Use interactive prompts for all fields. |
| `--no-provenance` | Skip automatic `origin` metadata. |

Positional arguments: `category` (e.g., `principle`, `design_choice`) and `document` (target document name).

If `--name` and `--statement` are both provided, uses CLI mode. If `--interactive`, prompts for missing fields. Otherwise, opens `$EDITOR`.

## edit

Modify an existing element. Three input modes: CLI flags, interactive prompts, or editor.

```bash
# Change status via CLI flags
gvp edit personal:P3 --library path/ --status deprecated --rationale "Superseded by P5"

# Interactive mode
gvp edit personal:P3 --library path/ --interactive

# Editor mode (opens $EDITOR with current element)
gvp edit personal:P3 --library path/

# Skip provenance tracking for trivial changes
gvp edit personal:P3 --library path/ --name "Updated Name" --no-provenance
```

| Flag | Description |
|------|-------------|
| `--library PATH` | Library path (repeatable). |
| `--name NAME` | New name. |
| `--status STATUS` | New status (`active`, `deprecated`, `rejected`). |
| `--statement TEXT` | New statement. |
| `--rationale TEXT` | Rationale for the change (prompted if not provided and provenance is enabled). |
| `--interactive` | Use interactive prompts. |
| `--no-provenance` | Skip automatic `updated_by` metadata. |

Positional argument: qualified element ID (e.g., `personal:P3`).

If any field flags are provided, uses CLI mode. If `--interactive`, uses prompts. Otherwise, opens `$EDITOR`.
```

Source material:
- `src/gvp/__main__.py` — all argparse definitions (lines 377-474) and command handlers

**Step 3: Verify**

- Cross-reference every argparse `add_argument` call in `__main__.py` against the usage doc
- Confirm `--approve` is NOT documented (intentionally hidden)
- Confirm `--verbose` is NOT documented (dead flag)
- Check all examples use valid syntax

**Step 4: Commit**

```bash
git add docs/guide/usage.md
git commit -m "docs: add full CLI usage reference with all subcommands and flags"
```

---

### Task 5: Create docs/guide/ai-integration.md

**Files:**
- Create: `docs/guide/ai-integration.md`
- Reference: `docs/guide/developing-a-library.md` lines 19-41 (content to move)

**Step 1: Write ai-integration.md**

Content structure:

```markdown
# AI Integration Guide

How AI assistants can work with GVP stores — reading, querying, proposing changes, and helping users build libraries. This guide is assistant-agnostic; it applies to any AI tool, not just Claude.

## Reading a GVP Store

[Explain: look for .gvp/ directory, read all YAML files, understand the inheritance graph. Key files: tags.yaml for tag definitions, each YAML document for elements. Use `gvp query` and `gvp trace` for programmatic access.]

## Conventions

### Reference Elements by ID and Name

When discussing GVP elements with humans, always include both the ID and the name:

- Good: `G2 "Facilitate easier planning for AI and humans"`
- Bad: `G2`

Humans don't memorize IDs. The name provides immediate context without requiring a lookup.

### Propose Changes with Traceability

When proposing a new element (design choice, principle, etc.), always include `maps_to` references to existing elements. Explain why the mapping is appropriate. See [Traceability Rules](../reference/validation.md#traceability-rules) for the per-category requirements.

### Check for Staleness

Before starting work, run `gvp review --library <path>` to check for stale elements. Stale elements may indicate that upstream goals or values have shifted, which could affect your work.

## Copy/Paste Startup Prose

Ready-made blocks for agent configuration files (CLAUDE.md, .cursorrules, system prompts, etc.).

### Minimal (one paragraph)

```
This project uses GVP (Goals, Values, and Principles) for decision traceability.
Before proposing changes or making design decisions, read the GVP store at `.gvp/`
to understand the project's goals, values, and how decisions trace back to them.
When proposing new decisions, include `maps_to` references to existing elements.
Reference elements as ID + Name (e.g., G2 "Facilitate easier planning").
Run `gvp validate --library .gvp/` to check structural correctness.
```

### Detailed (with review workflow)

[Longer version that covers: reading the store, checking for staleness, proposing changes with traceability, running validation, using gvp trace to understand the graph, the review cycle.]

## Building GVP Libraries with AI Assistance

[MOVED from developing-a-library.md lines 19-41. Content about AI-assisted GVP development workflow:]

One effective workflow for AI-assisted GVP development:

1. **Engage in a planning session.** Discuss the project, its goals, trade-offs, and decisions naturally.
2. **Ensure trade-offs are discussed.** For each decision point, explore the pros and cons of the alternatives considered.
3. **Provide rationale for decisions.** When you choose an option, explain why — even if the reasoning is "gut feeling" or "I don't have time to think about this more right now."
4. **Document everything at the end.** Ask the AI assistant to produce a decision log: all discussed ideas, a brief description, their status (accepted, rejected, deferred), the context, and the rationale — grouped by choice.

[Include the decision group example from developing-a-library.md]

[Include the note about rationale using verbatim quotes]

[Include the note about instructions being addable to agent startup configuration]

## Workflows

### Before Planning

1. Read the GVP store (`gvp query --library <path>`)
2. Identify relevant goals and values for the task at hand
3. Check for stale elements (`gvp review --library <path>`)
4. Note any constraints that apply

### When Proposing a Design Choice

1. State the decision and alternatives considered
2. Map the chosen option to goals and values via `maps_to`
3. Explain the rationale — use the user's own words where possible
4. Run `gvp validate` to check traceability

### During Review

1. Walk the trace graph (`gvp trace <element>`) to understand upstream reasoning
2. Check if upstream elements have been updated since last review
3. Use `gvp review <element>` to stamp reviewed elements
```

Source material:
- `docs/guide/developing-a-library.md` lines 19-41 (AI workflow content to move here)
- `.gvp/libraries/gvp.yaml` — G7 "Usable by AI assistants"
- `src/gvp/__main__.py` — CLI commands for examples

**Step 2: Verify**

- Check that the moved content from developing-a-library.md is accurate and complete
- Check that CLI commands in examples are correct
- Check that the startup prose blocks are self-contained and usable

**Step 3: Commit**

```bash
git add docs/guide/ai-integration.md
git commit -m "docs: add AI integration guide with startup prose and workflows"
```

---

### Task 6: Trim docs/guide/developing-a-library.md

**Files:**
- Modify: `docs/guide/developing-a-library.md` (currently at `docs/developing-a-library.md` — also needs to move)

**Step 1: Move the file to docs/guide/**

```bash
git mv docs/developing-a-library.md docs/guide/developing-a-library.md
```

**Step 2: Replace the AI workflow section**

Remove lines 19-41 (from "## Building GVPs with AI Assistance" through the end of that section, stopping before "## Consider Separating Domain-Agnostic from Domain-Specific").

Replace with:

```markdown
## Building GVPs with AI Assistance

For guidance on using AI assistants to build and maintain GVP libraries — including planning workflows, decision logging, and copy/paste-able agent configuration — see the [AI Integration Guide](ai-integration.md).
```

**Step 3: Update the philosophy.md cross-reference**

The file references `[Philosophy](philosophy.md)` on line 5. After moving to `docs/guide/`, update to `[Philosophy](../philosophy.md)`.

**Step 4: Update the reference at the end of philosophy.md**

`docs/philosophy.md` line 83 references `[Developing a GVP Library](developing-a-library.md)`. Update to `[Developing a GVP Library](guide/developing-a-library.md)`.

**Step 5: Verify**

- Check the replacement text is in place
- Check the link to ai-integration.md is correct (same directory, so relative `ai-integration.md` works)
- Check philosophy.md cross-references work

**Step 6: Commit**

```bash
git add docs/guide/developing-a-library.md docs/philosophy.md
git commit -m "docs: move developing-a-library to guide/, replace AI section with link"
```

---

### Task 7: Trim GLOSSARY.md

**Files:**
- Modify: `GLOSSARY.md`

**Step 1: Remove Technical Terms section**

Remove lines 24-38 (the "## Technical Terms" header through the end of the table). These terms now live in `docs/reference/schema.md`.

**Step 2: Remove Implementation Rule and Coding Principle rows**

Remove these two rows from the Framework Terms table (lines 15-16):

```
| **Implementation Rule** | A hard stop contingent on design choices. If the design choice changes, the rule may not apply. |
| **Coding Principle** | A guideline for writing code in a specific implementation. Changes with the tech stack. |
```

**Step 3: Add a pointer to the reference docs**

After the Framework Terms table, add:

```markdown
For technical terms (YAML field names, data model objects), see the [Schema Reference](docs/reference/schema.md).
```

**Step 4: Verify**

- Check that all 8 core categories remain: Goal, Value, Principle, Heuristic, Rule, Design Choice, Constraint, Milestone
- Check that conceptual terms remain: Element, Library, Document, Scope, Tag, Provenance, Traceability, Catalog, Ancestry (note: Catalog and Ancestry are in the Technical Terms section — they should be moved UP to Framework Terms before deleting Technical Terms, since they appear in Tier 1 prose)
- Check that Implementation Rule and Coding Principle are gone
- Check the reference link is correct

**Step 5: Commit**

```bash
git add GLOSSARY.md
git commit -m "docs: trim glossary to non-technical terms, link to schema reference"
```

---

### Task 8: Rewrite README.md

**Files:**
- Modify: `README.md`

This is the largest single task. The README should be self-sufficient for Tier 1 readers — terms explained in-context, no requirement to read other docs.

**Step 1: Read the current README.md carefully**

File: `README.md` (218 lines). Understand every section before rewriting.

**Step 2: Write the new README**

Section-by-section guide:

**Header + intro paragraph:**
Keep line 1-3 mostly as-is. The one-paragraph summary is good.

**## Why**
Keep lines 6-11 as-is. This section is solid.

**## How It Works**
Keep the intro paragraph. Then:

**### Elements**
- Keep the table but with core 8 categories ONLY (remove Design Choice mention of "domain-specific variants")
- Remove the paragraph after the table about extending with domain-specific variants
- Replace with a note about tags: "Tags can further classify elements by domain (e.g., `code`, `systems`, `finance`) or concern (e.g., `reliability`, `usability`). See [Tags](#tags) below."

**### Relationships**
Keep lines 35-41 as-is.

**### Traceability**
Replace the table (lines 79-89) with a single-sentence rule:

> Every element (except goals, values, and constraints) must trace its justification to at least one goal and one value — directly or transitively through other elements in the mapping graph.

Link to `docs/reference/validation.md#traceability-rules` for per-category details.

Remove the "Implementation Rule" and "Coding Principle" rows entirely.

**### Scope and Inheritance**
Keep lines 43-66 as-is (already updated for multi-parent inherits).

**### Tags**
Keep lines 68-75 as-is.

**## Installation**
Keep lines 93-102 as-is.

**## Quick Start**
Keep lines 104-118 as-is.

**## Examples**
Keep lines 120-127 as-is.

**## Commands**

Trim to only the 4 daily-driver subcommands with 1-2 examples each:

```markdown
## Commands

### validate
Check a catalog for structural errors and traceability violations.

```bash
gvp validate --library path/
gvp validate --library path/ --strict
```

### render
Generate output in markdown, CSV, SQLite, DOT, or PNG format.

```bash
gvp render --library path/ --format markdown --stdout
gvp render --library path/ --format dot --stdout | dot -Tpng -o graph.png
```

### trace
Walk the mapping graph from a given element.

```bash
gvp trace --library path/ personal:H1
gvp trace --library path/ personal:G1 --reverse
```

### review
Review elements for staleness after upstream changes.

```bash
gvp review --library path/
gvp review --library path/ personal:P3
```

For the full command reference including `add`, `edit`, `query`, and all flags, see [Usage Reference](docs/guide/usage.md).
```

**Remove:**
- Global Options table (now in usage.md)
- Future Work section

**## Further Reading**

Update links:

```markdown
## Further Reading

- [Glossary](GLOSSARY.md) — canonical term definitions
- [Philosophy](docs/philosophy.md) — on fuzzy boundaries between goals, values, and principles
- [Developing a Library](docs/guide/developing-a-library.md) — practical guidance for building GVP libraries
- [Usage Reference](docs/guide/usage.md) — full CLI command and flag reference
- [AI Integration](docs/guide/ai-integration.md) — using GVP with AI assistants
- [Schema Reference](docs/reference/schema.md) — YAML document format specification
- [Validation Reference](docs/reference/validation.md) — traceability rules, error codes, and warnings
- [Config Reference](docs/reference/config.md) — configuration discovery and options
```

**Step 3: Verify**

- Check that no Implementation Rule or Coding Principle references remain
- Check all internal links work
- Check the traceability section is simplified to one sentence + link
- Check all example commands use valid syntax
- Grep for "Implementation Rule" and "Coding Principle" in README — should return nothing

**Step 4: Commit**

```bash
git add README.md
git commit -m "docs: rewrite README for Tier 1 audience — core elements only, simplified traceability"
```

---

### Task 9: Rework software-project example YAML files

**Files:**
- Modify: `examples/software-project/universal.yaml`
- Modify: `examples/software-project/personal.yaml`
- Modify: `examples/software-project/projects/taskflow.yaml`
- Modify: `examples/software-project/projects/taskflow/v1.yaml`
- Modify: `examples/software-project/tags.yaml` (if needed)

This task rebuilds the example using gvp's own `.gvp/libraries/gvp.yaml` and `.gvp/libraries/v0.yaml` as the foundation, adapted to the fictional "taskflow" framing.

**Step 1: Read the current example files and the gvp internal library**

Files to read:
- `.gvp/libraries/gvp.yaml` — source material for project-level elements
- `.gvp/libraries/v0.yaml` — source material for implementation-level elements
- All current `examples/software-project/*.yaml` files

**Step 2: Rewrite universal.yaml**

This is the org-wide layer. Key additions:
- A goal like "Sustainable revenue" — the org must make enough money to remain viable
- Values like "User Trust" (keep existing) and "Quality" (or similar)
- A heuristic that models the quality-vs-speed trade-off: when deadline pressure or budget constraints are high, how to compromise on loftier ideals while remaining coherent with the GVP. This should NOT be framed as a conflict — it traces to both the revenue goal and the quality value.
- At least 1-2 rules at the org level

Model after gvp.yaml's style — well-articulated statements, clear maps_to references.

Example elements to consider carrying over from gvp.yaml (adapted to fictional org context):
- G1 "Facilitate alignment across collaborators" → something like "Aligned decision-making across teams"
- V1 "Alignment" → keep or adapt
- V3 "Honesty" → could become org-level "Transparency"
- P1 "Capture rationale always" → adapt for org context
- CON1 "Agents optimize for minimal effort" → adapt as org constraint

**Step 3: Rewrite personal.yaml**

Individual cross-project values and principles. Inherit from universal.

Carry over from gvp.yaml (adapted):
- V4 "Simplicity" → personal value
- V5 "Approachability" → could be personal
- P5 "Design around flex points" → personal principle
- P6 "Minimize friction while maintaining coherency" → personal principle
- H3 "Simplicity vs. flex point trade-off" → personal heuristic
- Existing personal elements (G1 "Ship reliable software", V1 "Simplicity", etc.) can be kept/adapted

**Step 4: Rewrite taskflow.yaml (project scope)**

Project-level goals, milestones, constraints. Inherit from personal.

Keep the fictional taskflow framing but model structure after gvp.yaml:
- Project-specific goals (keep existing G1, G2)
- Milestones (keep existing M1)
- Constraints (keep existing CON1, possibly add budget/timeline constraint that connects to the org-level revenue heuristic)

**Step 5: Rewrite v1.yaml (implementation scope)**

Design choices, implementation rules, coding principles. Inherit from taskflow.

Model after v0.yaml:
- Design choices with clear rationale (keep existing D1, D2, possibly add more)
- Implementation rules (keep existing IR1)
- At least one design choice that explicitly models the quality/speed trade-off from the org level (e.g., choosing JSON over SQLite because "H2 says prefer the simpler option when timeline is tight, and this traces back to G1 Sustainable revenue")

**Step 6: Update tags.yaml if needed**

Check if new tags are needed for the added elements. The current tags (code, systems, ux, cli, maintainability, reliability, usability) should cover most cases.

**Step 7: Run validation**

```bash
gvp validate --library examples/software-project/
```

Expected: 0 errors. Fix any traceability or reference issues.

**Step 8: Commit**

```bash
git add examples/software-project/
git commit -m "docs: rework software-project example from gvp's internal library"
```

---

### Task 10: Rewrite software-project example README

**Files:**
- Modify: `examples/software-project/README.md`

**Step 1: Read the new YAML files from Task 9**

Understand the new element structure before writing the README.

**Step 2: Rewrite the README**

Key sections:

```markdown
# Example: Software Project

A 4-level GVP library for a fictional CLI task manager called "taskflow." Demonstrates cross-scope traceability, the distinction between project and implementation scope, domain-specific categories, and the quality-vs-speed trade-off modeled coherently within the GVP.

## Structure

[Updated file tree]

## Inheritance Chain

[Updated chain diagram]

## Project vs. Implementation Scope

The key distinction in this example:

- **Project scope** (`taskflow.yaml`): Goals, constraints, milestones — things that would survive if you rewrote the implementation from scratch. "Manage tasks from the command line" is a project goal regardless of whether you use Python or Go, JSON or SQLite.

- **Implementation scope** (`v1.yaml`): Design choices, coding principles, implementation rules — things tied to the current tech stack. "Use JSON file storage" is a v1 choice; a v2 might switch to SQLite without changing the project goals.

This distinction matters for review: when a project goal changes, all implementation elements that trace to it may need revisiting. But when an implementation choice changes (switching from Click to argparse), only implementation-scope elements are affected — project goals remain stable.

## Scoping Conventions

[Updated table with all 4 scopes and their purposes]

## Extended Categories

[Move the Implementation Rule and Coding Principle documentation here from the main README. Include the traceability rules for these categories:]

| Category | Must map to... |
|----------|---------------|
| Implementation Rule | (1+ goal AND 1+ value) OR 1+ design choice |
| Coding Principle | (1+ goal AND 1+ value) OR 1+ principle or design choice |

## The Revenue-Quality Trade-off

[Explain how the example models the compromise between quality ideals and business reality. Walk through the org-level heuristic and show how specific implementation design choices trace back through it to both the revenue goal and the quality value. Emphasize that this is coherent, not contradictory — the compromise is documented and traceable.]

## Relationships

[Updated relationship diagram]

## Element Litmus Tests

[Walk through specific elements from the example as extended illustrations of how to categorize things. Use the actual elements as teaching moments:]

- "Why is X a value and not a goal?" — because [litmus test reasoning from gvp.yaml elements]
- "Why is Y a heuristic and not a principle?" — because [it has if/then structure]
- "Why is Z at implementation scope and not project scope?" — because [it would change if we switched frameworks]

## Try It

[Updated gvp commands against the new example]
```

**Step 3: Verify**

- Check all qualified IDs in the README match actual element IDs in the YAML files
- Check all gvp commands work against the example
- Check the Project vs. Implementation distinction is clearly articulated

**Step 4: Commit**

```bash
git add examples/software-project/README.md
git commit -m "docs: rewrite software-project README with scope distinction and litmus tests"
```

---

### Task 11: Final cross-link and consistency check

**Files:**
- All docs created/modified in Tasks 1-10

**Step 1: Check all cross-references**

Run through every link in every doc and verify the target exists:
- README.md links → glossary, philosophy, guide/, reference/, examples
- GLOSSARY.md links → reference/schema.md
- philosophy.md links → guide/developing-a-library.md
- developing-a-library.md links → ai-integration.md, philosophy.md
- ai-integration.md links → reference/validation.md, guide/usage.md
- usage.md links → reference/validation.md, reference/config.md
- reference docs → cross-references between schema/validation/config

**Step 2: Grep for stale references**

```bash
# Check for removed terms/concepts still referenced
grep -r "Implementation Rule" README.md GLOSSARY.md docs/
grep -r "Coding Principle" README.md GLOSSARY.md docs/
grep -r "Future Work" README.md
grep -r "Global Options" README.md

# Check for broken relative links
grep -rn '\[.*\](.*\.md)' README.md GLOSSARY.md docs/ | head -50
```

**Step 3: Run validation on all examples**

```bash
gvp validate --library examples/software-project/
gvp validate --library examples/small-business/
gvp validate --library .gvp/
```

All should pass with 0 errors.

**Step 4: Fix any issues found**

Address broken links, stale references, or validation failures.

**Step 5: Commit**

```bash
git add -A
git commit -m "docs: final cross-link and consistency check"
```
