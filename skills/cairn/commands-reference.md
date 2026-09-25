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

### cairn diff [commitA] [commitB]
Trace code changes back to decisions.
```bash
cairn diff                       # HEAD~1..HEAD (last commit)
cairn diff HEAD~5 HEAD           # last 5 commits
cairn diff main HEAD             # changes since branching from main
cairn diff --format json         # JSON for CI/CD
```

### cairn libs \<subcommand\>
Inspect the machine-wide registry of every library cairn has resolved
(`~/.gvp/registry/`, override with `GVP_REGISTRY_ROOT`). **Use this before
authoring elements** — it is how you find guidance that already exists instead
of re-deriving it.
```bash
cairn libs list                      # everything cairn has seen
cairn libs list --kind remote        # filter by local|remote
cairn libs list --scope personal     # filter by meta.scope
cairn libs search "simplicity"       # search across every known library
cairn libs search "secrets" --fetch  # allow network (offline by default)
cairn libs show personal             # detail + which projects have used it
cairn libs forget <source>:<doc>     # drop one entry
cairn libs prune --remote            # drop entries whose document is gone
```
`search` matches element names and each category's **primary field** (resolved
from the schema), so a decision's `rationale` and a constraint's `impact` are
searchable — not just `statement`. It never touches the network without
`--fetch`, and names anything it skipped rather than returning a quietly
incomplete answer. `show`/`forget` refuse to guess on an ambiguous `meta.name`:
they list candidates and exit non-zero. All take `--json`.

Recording happens when a command builds the catalog, so `cairn init` does not
itself register a project — the first `validate`, `query`, or `export` does.
Opt out with `registry.enabled: false` or `--no-registry`.

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
`E001` broken maps_to ref · `E002` duplicate element ID · `E003` broken inheritance · `E004` schema validation failure · `E005` duplicate step ID · `E006` duplicate document `meta.name` within a library

**Warnings** (exit zero):
`W001` empty maps_to · `W002` empty document · `W003` mapping rules violation · `W004` isolated element · `W005` self-document mapping · `W006` stale element · `W007` undefined tag · `W008` duplicate category def · `W009` ID gap · `W010` ref file missing · `W011` ref identifier missing · `W012` orphan identifier (coverage) · `W013` decision no refs (coverage) · `W014` no root trace · `W015` auto-assigned step ID · `W016` unrecognized YAML key · `W017` no value trace (soft anchor) · `W018` actionable root has no decision (coverage)

`W013` applies only to `accepted` decisions — a `declined` or `deferred`
decision has no implementation by definition, so its rationale is the record.
