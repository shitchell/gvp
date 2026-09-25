# Cairn CLI Commands

Install: `npm install -g @principled/cairn`

Both `cairn` and `gvp` work as command names.

## Commands

### cairn init
Initialize a GVP library in the current project.
```bash
cairn init
# Creates .gvp/library/project.yaml with skeleton G1
```

### cairn validate [options]
Validate the GVP library.
```bash
cairn validate                    # full validation
cairn validate --strict           # promote warnings to errors
cairn validate --coverage         # include coverage checks (W012, W013)
cairn validate --scope staged     # only check staged git changes
cairn validate --scope HEAD~3..HEAD  # check commit range
cairn validate --passes schema,structural  # run specific passes
```

### cairn export [options]
Export catalog to a format.
```bash
cairn export --format json        # JSON to stdout (lossless)
cairn export --format markdown    # Markdown decision register
cairn export --format csv         # CSV with dynamic columns
cairn export --format dot         # Graphviz DOT graph
cairn export -o output.md --format markdown  # write to file
cairn export --include-deprecated # include inactive elements
```

### cairn add \<category\> \<name\> [options]
Add a new element with auto-assigned ID.
```bash
cairn add decision "Use PostgreSQL" --field rationale="Mature and reliable"
cairn add goal "Ship MVP" --field statement="Deliver a working product"
cairn add principle "Fail loudly" --field statement="Errors should be visible"
cairn add decision "Skip caching" --skip-review  # trivial, skip review cycle
```

### cairn edit \<element\> [options]
Modify an existing element. Creates `updated_by` provenance entry.
```bash
cairn edit D1 --field rationale="Updated reasoning" --rationale "New info emerged"
cairn edit D1 --field status=deprecated --rationale "No longer relevant"
cairn edit D1 --field tags='["backend","db"]' --skip-review  # trivial change
```

### cairn review [element]
Find and review stale elements.
```bash
cairn review                     # list all stale elements
cairn review D1                  # show D1 details + approval token
cairn review D1 --approve --token <hash>  # approve with token
```

### cairn inspect [element] [options]
Inspect a single element with full context.
```bash
cairn inspect D1                 # basic details
cairn inspect D1 --trace         # ancestor chain to goals/values
cairn inspect D1 --descendants   # what depends on this element
cairn inspect D1 --refs          # show refs with file/identifier status
cairn inspect D1 --reviews       # review history
cairn inspect D1 --updates       # update history
cairn inspect --ref src/db.ts::createPool --trace  # "why does this code exist?"
cairn inspect D1 --format json   # JSON output
```

### cairn query [options]
Filter and search elements.
```bash
cairn query --category decision   # all decisions
cairn query --tag backend         # elements tagged "backend"
cairn query --status deprecated   # inactive elements
cairn query --refs-file src/db.ts # elements referencing this file
cairn query --refs-identifier Pool # elements referencing this identifier
cairn query --format json         # JSON output
```
`--list <type>` enumerates a kind of thing in the resolved catalog instead of
its elements. `--format` still picks the rendering (`text` or `json`).
```bash
cairn query --list documents                # documents + element counts
cairn query --list documents --format json  # stable schema; read this first
```
Rows: `name`, `document_path`, `source`, `description`, `scope`,
`element_counts`, `element_total`. Element filters change the counts;
`--document` changes which rows appear; a document with no matching elements
is still listed at zero. `query --format json` elements carry `_document`,
`_documentPath` and `_source` — the same row key, so the two join.

This reads the **resolved catalog**. `cairn libs list` reads the machine-wide
registry of every library cairn has ever seen — a different question.

### cairn diff [commitA] [commitB]
Trace code changes back to decisions.
```bash
cairn diff                       # HEAD~1..HEAD (last commit)
cairn diff HEAD~5 HEAD           # last 5 commits
cairn diff main HEAD             # changes since branching from main
cairn diff --format json         # JSON for CI/CD
```

### cairn analyze [options]
Detect unmapped relationships via embedding similarity.
```bash
cairn analyze                    # default threshold 0.7
cairn analyze --threshold 0.5    # lower threshold, more results
```

## Global Options

| Flag | Description |
|------|-------------|
| `--config <path>` | Load specific config file (replaces discovery) |
| `--no-config` | Skip all config files |
| `-c key=value` | Inline config override (highest precedence) |
| `--strict` | Promote warnings to errors |
| `-v` / `-vv` / `-vvv` | Verbose output |

## Validation Codes

**Errors** (exit non-zero):
`E001` broken maps_to ref · `E002` duplicate element ID · `E003` broken inheritance · `E004` schema validation failure

**Warnings** (exit zero):
`W001` empty maps_to · `W002` empty document · `W003` mapping rules violation · `W004` isolated element · `W005` self-document mapping · `W006` stale element · `W007` undefined tag · `W008` duplicate category def · `W009` ID gap · `W010` ref file missing · `W011` ref identifier missing · `W012` orphan identifier (coverage) · `W013` decision no refs (coverage) · `W014` no root trace
