# CLI Usage Reference

[Back to README](../../README.md)

Full reference for every `gvp` subcommand, flag, and option.

---

## Global Options

These flags apply to all subcommands and must appear **before** the subcommand name.

| Flag | Description |
|------|-------------|
| `--version` | Print the version and exit. |
| `--strict` | Promote warnings to errors. See [strict mode](../reference/validation.md#strict-mode). |
| `--config PATH` | Override the config file path. See [config reference](../reference/config.md). |

```bash
# Check version
gvp --version

# Run validation in strict mode
gvp --strict validate

# Use a specific config file
gvp --config ./my-config.yaml validate
```

---

## validate

Check the catalog for structural errors. Reports syntax problems, broken references, and schema violations. On success, prints a reminder that structural validity does not guarantee semantic coherence.

See [validation reference](../reference/validation.md) for the full list of checks.

### Flags

| Flag | Description |
|------|-------------|
| `--library PATH` | Additional library path. Repeatable. |

### Examples

```bash
# Validate the default catalog
gvp validate

# Validate with an extra library
gvp validate --library ./shared-values/

# Validate in strict mode (warnings become errors)
gvp --strict validate

# Validate with multiple libraries
gvp validate --library ./team/ --library ./org/
```

---

## query

Filter and list elements from the catalog. Useful for searching by tag, category, document, or status.

### Flags

| Flag | Description |
|------|-------------|
| `--library PATH` | Additional library path. Repeatable. |
| `--tag TAG` | Filter by tag. Repeatable (elements matching **any** specified tag are returned). |
| `--category CAT` | Filter by element category (e.g., `goal`, `value`, `principle`). |
| `--document NAME` | Filter by document name. |
| `--status STATUS` | Filter by status (e.g., `active`, `deprecated`, `rejected`). |
| `--format FORMAT` | Output format: `table` (default) or `json`. |

### Examples

```bash
# List all elements
gvp query

# Filter by category
gvp query --category goal

# Filter by multiple tags
gvp query --tag ai --tag automation

# Find deprecated elements in a specific document
gvp query --document personal --status deprecated

# Output as JSON for scripting
gvp query --category principle --format json

# Combine filters: active heuristics tagged "performance" from a shared library
gvp query --library ./shared/ --category heuristic --tag performance --status active
```

---

## inspect

Inspect a single element with full context. View its details, trace its ancestry, check its refs, or review its provenance history.

### Flags

| Flag | Description |
|------|-------------|
| `element` | **Positional (optional with --ref).** Element ID (e.g., `P1`, `gvp:P1`). |
| `--trace` | Show ancestor trace (walk `maps_to` graph to goals/values). |
| `--descendants` | Show descendant trace (what maps to this element). |
| `--refs` | Show refs with status (file exists? identifier found?). |
| `--reviews` | Show review history. |
| `--updates` | Show update history. |
| `--ref FILE::ID` | Find elements referencing a file/identifier and trace them. |
| `--format FORMAT` | Output format: `text` (default) or `json`. |

### Examples

```bash
# View element details
gvp inspect P13

# Trace a principle back to its goals and values
gvp inspect P13 --trace

# Show what depends on a goal
gvp inspect G1 --descendants

# Check refs status (file exists? identifier found?)
gvp inspect P13 --refs

# "Why does this code exist?" -- trace from code to goals
gvp inspect --ref src/catalog/catalog.ts::Catalog --trace

# Show review and update history
gvp inspect H2 --reviews --updates

# Output as JSON for scripting
gvp inspect P13 --format json
```

---

## export

Export the catalog to one or more output formats.

### Flags

| Flag | Description |
|------|-------------|
| `-f`, `--format FMT` | Output format: `json`, `csv`, `markdown`, `dot`. Default: `json`. |
| `-o`, `--output PATH` | Output file path. Default: stdout. |
| `--include-deprecated` | Include deprecated and rejected elements. |

### Examples

```bash
# Export as JSON to stdout
gvp export --format json

# Export markdown to a file
gvp export --format markdown -o output.md

# Export CSV
gvp export --format csv -o elements.csv

# Generate DOT graph
gvp export --format dot -o graph.dot

# Include deprecated elements
gvp export --format json --include-deprecated
```

---

## diff

Trace code changes between git commits back to GVP decisions via refs. Shows which decisions are affected by code changes and their full traceability chain.

### Flags

| Flag | Description |
|------|-------------|
| `commitA` | **Positional (optional).** Start commit. Default: `HEAD~1`. |
| `commitB` | **Positional (optional).** End commit. Default: `HEAD`. |

### Examples

```bash
# What decisions were affected by the last commit?
gvp diff

# What decisions were affected in the last 5 commits?
gvp diff HEAD~5 HEAD

# What decisions are affected by changes in a PR branch?
gvp diff main HEAD

# Pipe JSON output for CI/CD
gvp diff main HEAD 2>/dev/null | jq '.[] | .element.libraryId'
```

---

## analyze

Detect unmapped relationships and potential conflicts using embedding-based similarity analysis. This is an advisory tool -- it surfaces potential issues for human review.

### Flags

| Flag | Description |
|------|-------------|
| `--threshold NUM` | Similarity threshold (0-1). Default: `0.7`. |

### Examples

```bash
# Find potentially related but unmapped elements
gvp analyze

# Lower threshold for more results
gvp analyze --threshold 0.5
```

---

## add

Add a new element to a document. Supports three modes:

1. **CLI mode** -- provide `--name` and `--statement` directly.
2. **Interactive mode** -- use `--interactive` to be prompted for each field.
3. **Editor mode** (default) -- opens your `$EDITOR` with a template to fill in.

### Flags

| Flag | Description |
|------|-------------|
| `--library PATH` | Additional library path. Repeatable. |
| `category` | **Positional.** Element category (e.g., `value`, `principle`, `heuristic`). |
| `document` | **Positional.** Target document name (e.g., `personal`, `team`). |
| `--name NAME` | Element name. |
| `--statement TEXT` | Element statement. |
| `--tags TAGS` | Comma-separated tags. |
| `--maps-to IDS` | Comma-separated qualified IDs this element maps to. |
| `--interactive` | Use interactive prompts for all fields. |
| `--no-provenance` | Skip adding origin metadata (created_by, created_at). |

### Examples

```bash
# Add via editor (default -- opens $EDITOR)
gvp add principle personal

# Add directly from the command line
gvp add value personal --name "Simplicity" --statement "Prefer the simplest solution that works."

# Add with tags and mappings
gvp add heuristic personal \
  --name "Categorization time check" \
  --statement "If categorizing takes more than 60 seconds, the distinction is not useful." \
  --tags "meta,process" \
  --maps-to "personal:V3,personal:P1"

# Add interactively
gvp add principle team --interactive

# Add without provenance tracking
gvp add rule personal --name "No secrets in repos" \
  --statement "Never commit credentials or secrets to version control." \
  --no-provenance
```

---

## edit

Modify an existing element. Supports three modes:

1. **CLI mode** -- provide one or more field flags (`--name`, `--status`, `--statement`). Prompts for rationale unless `--no-provenance` is set.
2. **Interactive mode** -- use `--interactive` to be prompted for each field.
3. **Editor mode** (default) -- opens your `$EDITOR` with the current element pre-filled.

### Flags

| Flag | Description |
|------|-------------|
| `--library PATH` | Additional library path. Repeatable. |
| `element` | **Positional.** Qualified element ID (e.g., `personal:P3`). |
| `--name NAME` | New name. |
| `--status STATUS` | New status: `active`, `deprecated`, or `rejected`. |
| `--statement TEXT` | New statement text. |
| `--rationale TEXT` | Rationale for the change (used with CLI mode). |
| `--interactive` | Use interactive prompts. |
| `--no-provenance` | Skip adding `updated_by` metadata. |

### Examples

```bash
# Edit via editor (default -- opens $EDITOR)
gvp edit personal:P3

# Deprecate an element with rationale
gvp edit personal:H2 --status deprecated \
  --rationale "Superseded by H7 which covers more cases."

# Rename an element
gvp edit personal:V1 --name "Pragmatic simplicity"

# Update statement and status in one call
gvp edit personal:R1 --status active \
  --statement "All public APIs must have integration tests."

# Edit interactively
gvp edit personal:D4 --interactive

# Edit without provenance tracking
gvp edit personal:P5 --name "Updated name" --no-provenance
```

---

## review

Review elements for staleness. When an ancestor element is updated, its descendants may need re-evaluation. Running `review` without arguments lists all stale elements. Running it with a specific element ID starts an interactive review.

### Flags

| Flag | Description |
|------|-------------|
| `--library PATH` | Additional library path. Repeatable. |
| `element` | **Positional, optional.** Qualified element ID to review. If omitted, lists all stale elements. |

### Examples

```bash
# List all elements that need review
gvp review

# Review a specific element interactively
gvp review personal:H5

# Check for stale elements across libraries
gvp review --library ./shared-values/ --library ./team/
```
