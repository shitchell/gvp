# Cairn CLI Commands

Install: `npm install -g @principled/cairn`

Both `cairn` and `gvp` work as command names.

**Every flag table below is generated from `cairn <command> --help`**, and
`tests/cli/commands-reference-drift.test.ts` fails the build if this file and the
binary disagree — in either direction. The tables list **command-specific** flags
only; the [global options](#global-options) are accepted on every subcommand and
are not repeated per command.

## Commands

### cairn init
Initialize a GVP library in the current project. Takes no flags of its own.
```bash
cairn init
# Creates .gvp/library/project.yaml with a skeleton G1
```

Recording into the library registry happens when a command *builds the catalog*,
so `init` does not itself register a project — the first `validate`, `query`, or
`export` does.

### cairn validate
Validate the GVP library.

| Flag | Description |
|------|-------------|
| `--scope <scope>` | Scope validation to `staged`, `working`, or `<commit>..<commit>` |
| `-d, --document <name>` | Restrict diagnostics to a single document (matched by `meta.name` or documentPath) |
| `--coverage` | Enable the coverage pass (W012, W013, W018) |
| `--passes <passes>` | Comma-separated list of passes to run |
| `--include-inherited` | Show every diagnostic on inherited elements, overriding the `diagnostics` config (#29) |
| `--inherited <mode>` | Override `diagnostics.inherited` for this run: `show` \| `count` \| `hide` (#29) |

```bash
cairn validate                              # full validation
cairn validate --strict                     # promote warnings to errors
cairn validate --coverage                   # include coverage checks
cairn validate --scope staged               # only check staged git changes
cairn validate --scope HEAD~3..HEAD         # check a commit range
cairn validate --passes schema,structural   # run specific passes
cairn validate -d project                   # one document's diagnostics only
cairn validate --inherited show             # list inherited diagnostics individually
```

Pass names for `--passes`: `schema`, `structural`, `traceability`, `semantic`,
`user_rules` (built-in, run by default in that order) and `coverage` (optional —
also reachable via `--coverage`).

**Inherited diagnostics are rolled up, not listed, by default.** `diagnostics.inherited`
defaults to `count`, so warnings on elements that came from an inherited library
appear as a tally rather than as individual lines. If a library looks suspiciously
clean, re-run with `--inherited show` (or `--include-inherited`) before concluding
anything (#29).

### cairn export
Export the GVP catalog to a format.

| Flag | Description |
|------|-------------|
| `-f, --format <format>` | Output format: `json`, `csv`, `markdown`, `compact` (default: `json`) |
| `-o, --output <path>` | Output file path (default: stdout) |
| `-d, --document <name>` | Restrict export to a single document (matched by `meta.name` or documentPath) |
| `--include-deprecated` | Include deprecated/rejected elements |

```bash
cairn export --format json                     # JSON to stdout (lossless)
cairn export --format markdown                 # Markdown decision register
cairn export --format csv                      # CSV with dynamic columns
cairn export --format compact                  # dense text, for reading into context
cairn export -o output.md --format markdown    # write to a file
cairn export -d project --format markdown      # one document only
cairn export --include-deprecated              # include inactive elements
```

The format list is exactly those four. **There is no `dot`/Graphviz format** — if
you need a graph, render one from `--format json`.

### cairn add \<category\> \<name\>
Add a new element to a GVP document, with an auto-assigned ID.

| Flag | Description |
|------|-------------|
| `-d, --document <path>` | Target document (default: last/leaf document in the library) |
| `-f, --field <key=value...>` | Set field values |
| `--skip-review` | Mark provenance as skip-review (DEC-4.6) |
| `--no-provenance` | Legacy alias for `--skip-review` |

```bash
cairn add decision "Use PostgreSQL" -f rationale="Mature and reliable"
cairn add goal "Ship MVP" -f statement="Deliver a working product"
cairn add principle "Fail loudly" -f statement="Errors should be visible"
cairn add decision "Skip caching" --skip-review   # trivial, skip the review cycle
cairn add heuristic "Prefer boring tech" -d project -f statement="..."
```

#### List fields must be strict JSON (open bug: #23)

`-f` parses a list value as **JSON, or not at all**. Every near-miss spelling
exits **0** and writes a *string* — the library then fails validation on the next
`cairn validate`, at a distance from the command that caused it.

Measured against this release:

| Spelling | `add` exit | Written | Then `validate` |
|---|---|---|---|
| `-f 'tags=["a","b"]'` | 0 | `tags: [a, b]` (a list) | passes |
| `-f 'tags=[a, b]'` | 0 | `tags: '[a, b]'` (a string) | **fails** |
| `-f 'tags=a,b'` | 0 | `tags: 'a,b'` (a string) | **fails** |
| `-f 'tags=a'` | 0 | `tags: a` (a string) | **fails** |
| `-f 'tags=a' -f 'tags=b'` | 0 | `tags: b` — the first is **dropped** | **fails** |

So: **always quote list values as JSON arrays**, and never repeat `-f` for the
same key expecting it to append. For a value too long or too awkward to quote on a
command line, `cairn edit --field-file <key> <path>` reads it from a file, and
`cairn import` takes real YAML.

### cairn edit \<element\>
Edit an existing element. Writes an `updated_by` provenance entry.

| Flag | Description |
|------|-------------|
| `-f, --field <key=value...>` | Set field values |
| `--field-file <entries...>` | Set field(s) from file contents: `--field-file key path [key path ...]` |
| `--rationale <text>` | Rationale for the change (required unless `--skip-review`) |
| `--skip-review` | Mark this update as skip-review (DEC-4.6) |

```bash
cairn edit D1 -f rationale="Updated reasoning" --rationale "New info emerged"
cairn edit D1 -f status=deprecated --rationale "No longer relevant"
cairn edit D1 -f tags='["backend","db"]' --skip-review   # trivial change
cairn edit D1 --field-file rationale notes/d1-rationale.md --rationale "Rewrote for clarity"
```

`--field-file` is the safe path for anything multi-line: no shell quoting, no
`-f` list-parsing trap.

### cairn review [element]
Review stale elements and stamp `reviewed_by`.

| Flag | Description |
|------|-------------|
| `--token <hash>` | Review hash token from the `cairn review <id>` output |
| `--note <text>` | Review note |
| `--by <name>` | Reviewer name (overrides config) |

```bash
cairn review                              # list all stale elements
cairn review gvp:D1                       # show D1's unreviewed updates + the token
cairn review gvp:D1 --token <hash>        # record the review
cairn review gvp:D1 --token <hash> --note "Still correct" --by "Reviewer Name"
```

**There is no `--approve` flag.** Reviewing *is* the acknowledgement: you run
`cairn review <id>` to see what changed and to get the hash token, then re-run it
with `--token <hash>`. The token is what proves the reviewer saw the specific
updates being acknowledged.

### cairn inspect [element]
Inspect a single element with full context.

| Flag | Description |
|------|-------------|
| `--trace` | Show the ancestor trace (`maps_to` graph) |
| `--descendants` | Show the descendant trace |
| `--refs` | Show refs with status |
| `--reviews` | Show review history |
| `--updates` | Show update history |
| `--ref <file::id>` | Find elements referencing a file/identifier and trace them |
| `-d, --document <name>` | Restrict element lookup to a single document (matched by `meta.name` or documentPath) |
| `--hops <n>` | Expand `maps_to` N levels deep inline, with id, name, and a content preview |
| `--format <format>` | Output format: `text`, `json`, `markdown` (default: `text`) |

```bash
cairn inspect D1                              # basic details
cairn inspect D1 --trace                      # ancestor chain to roots
cairn inspect D1 --descendants                # what depends on this element
cairn inspect D1 --refs                       # refs with file/identifier status
cairn inspect D1 --reviews                    # review history
cairn inspect D1 --updates                    # update history
cairn inspect D1 --hops 2                     # D1 plus two levels of what it maps to
cairn inspect --ref src/db.ts::createPool --trace   # "why does this code exist?"
cairn inspect D1 --format json
```

`--hops` is the one-command way to read a decision *and* its justification without
resolving ids by hand — prefer it over several `inspect` calls.

### cairn query
Query and filter elements in the catalog.

| Flag | Description |
|------|-------------|
| `-c, --category <name>` | Filter by category |
| `-t, --tag <tag>` | Filter by tag |
| `-s, --status <status>` | Filter by status (default: `active`) |
| `-d, --document <name>` | Filter by document |
| `--refs-file <path>` | Filter by ref file path |
| `--refs-identifier <id>` | Filter by ref identifier |
| `--format <format>` | Output format: `text`, `json`, `csv`, `compact` (default: `text`) |
| `--list <type>` | Enumerate a kind of thing in the resolved catalog instead of its elements (`documents`) |
| `--include-deprecated` | Include deprecated/rejected elements |

```bash
cairn query --category decision       # all decisions
cairn query --tag backend             # elements tagged "backend"
cairn query --status deprecated       # inactive elements
cairn query --refs-file src/db.ts     # elements referencing this file
cairn query --refs-identifier Pool    # elements referencing this identifier
cairn query --format json
```

`--list <type>` enumerates a kind of thing in the resolved catalog instead of its
elements. `--format` still picks the rendering (`text` or `json`).
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

Note that `query` is the one command where the global `-c` is **not**
`--override`; see [Global Options](#global-options).

### cairn diff [commitA] [commitB]
Trace code changes back to GVP decisions via refs. Arguments default to `HEAD~1`
and `HEAD`.

| Flag | Description |
|------|-------------|
| `--scope <scope>` | Scope: `staged`, `working`, or a commit range |
| `--format <format>` | Output format: `text` (default) or `json` |

```bash
cairn diff                       # HEAD~1..HEAD (last commit)
cairn diff HEAD~5 HEAD           # last 5 commits
cairn diff main HEAD             # changes since branching from main
cairn diff --scope staged        # what is staged right now
cairn diff --format json         # JSON for CI/CD
```

### cairn import \<source\>
Import elements from a patch file or directory into the library. This is the bulk
path, and the only supported way to add elements across several documents at once.

| Flag | Description |
|------|-------------|
| `--into <document>` | Target document (required for single-file mode) |
| `--dry-run` | Show the preview without writing |
| `-y, --yes` | Skip the confirmation prompt |
| `--confirm-delete` | Confirm document deletions from `_manifest.yaml` |
| `--skip-review` | Mark every update in this patch as skip-review (DEC-4.6) |

```bash
cairn import patch.yaml --into project --dry-run   # ALWAYS read this first
cairn import patch.yaml --into project --yes
cairn import .gvp/patches/pending/ --dry-run      # directory mode, _manifest.yaml
```

**`--dry-run` is not optional in practice**: it is where you see every ID
assignment and every reference rewrite before they are committed to disk. Every
check runs *before* the preview, so a dry run that reports no problems is a real
signal, not a deferred one.

`--skip-review` still writes an `updated_by` entry, flagged `skip_review: true` —
it records the stance, it does not omit provenance. An import that **updates** an
existing element must carry `update_rationale` on that element or the import
writes nothing. See `import-patch.md` for the patch format, pseudo-ids, and
`_manifest.yaml`.

### cairn mv \<source\> \<target\>
Move an element between documents, or rename a document, rewriting references
library-wide. This is what makes reorganising a library safe: nothing is left
pointing at the old address.

| Flag | Description |
|------|-------------|
| `--doc` | Force document-rename mode (Mode B) |
| `--dry-run` | Show the preview without writing |
| `-y, --yes` | Skip the confirmation prompt |

```bash
cairn mv project:D7 v1 --dry-run     # move D7 from `project` into `v1`
cairn mv project:D7 v1 --yes
cairn mv old-name new-name --doc --dry-run   # rename a document
```

Moving an element **reassigns its ID** to the next free one in the target
document and rewrites every `maps_to`, `related`, and `considered` reference that
pointed at it. Never do this by hand-editing YAML.

### cairn libs \<subcommand\>
Inspect the machine-wide registry of every library cairn has resolved
(`~/.gvp/registry/`, override with `GVP_REGISTRY_ROOT`). **Use this before
authoring elements** — it is how you find guidance that already exists instead
of re-deriving it.

| Subcommand | Flags |
|------------|-------|
| `list` | `--kind <kind>` (`local`\|`remote`), `--scope <scope>` (by `meta.scope`), `--json` |
| `show <selector>` | `--json` |
| `search <query>` | `--fetch` (allow network I/O), `--json` |
| `forget <selector>` | — |
| `prune` | `--remote` (also drop remote entries no longer cached) |

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
they list candidates and exit non-zero. `list`, `show` and `search` take `--json`;
`forget` and `prune` do not.

For what gets recorded, and the four ways to opt out, see **Discovery and the
library registry** in `SKILL.md`.

### cairn analyze
Analyze the catalog for unmapped relationships and potential conflicts, via
embedding similarity.

| Flag | Description |
|------|-------------|
| `--threshold <number>` | Similarity threshold, 0–1 (default: `0.7`) |

```bash
cairn analyze                    # default threshold 0.7
cairn analyze --threshold 0.5    # lower threshold, more results
```

The similarity score is **uncalibrated**: treat every hit as a prompt to look,
never as a finding. On a small library it produces false positives freely.

### cairn skill \<subcommand\>
Install, locate, and version-check this skill. It ships inside the npm package,
so it stays in lockstep with the schema of the cairn you are running.

| Subcommand | Flags |
|------------|-------|
| `install` | `--dest <path>`, `-y, --yes`, `--force`, `--dry-run`, `--json` |
| `path` | `--json` |
| `status` | `--dest <path>`, `--json` |

```bash
cairn skill status                         # installed version vs. bundled version
cairn skill install                        # into ~/.claude/skills/cairn/
cairn skill install --dest .claude/skills/cairn   # project-local instead
cairn skill install --yes                  # skip the confirmation prompt
cairn skill install --dry-run              # show the plan, write nothing
cairn skill install --force --yes          # overwrite edits (backs them up first)
cairn skill path                           # where the bundled copy lives
```
`install` writes a `.cairn-skill.json` manifest recording the source version and
a checksum per file, so it can tell an update (installed and untouched) from a
destructive overwrite (installed and **edited**), and refuses the latter — even
interactively — without `--force`. `--force` and `--yes` are distinct: `--yes`
only skips the prompt. With `--force`, the current contents are copied to
`<dest>/.backups/<timestamp>/` before anything is written. Files you add beside
the skill are never removed. Without a TTY, `install` refuses and names `--yes`.

`status` makes **no network call** — it compares disk against the bundled copy
and answers only when asked ("installed from 4.1.0, current is 5.0.0"). Check it
when the schema seems to disagree with this document. `path` prints only the
directory, so `ln -s "$(cairn skill path)" .claude/skills/cairn` works if you
would rather nothing be copied. `path`, `status` and `install` all take `--json`.

## Global Options

Accepted on every subcommand, before or after it.

| Flag | Description |
|------|-------------|
| `-V, --version` | Print the cairn version |
| `--config <path>` | Load a specific config file (replaces discovery) |
| `--no-config` | Skip all config files |
| `-c, --override <key=value>` | Inline config override, repeatable (highest precedence): `-c a=1 -c b=2` |
| `--library <path>` | Load the library from this directory instead of discovering from CWD |
| `--store <path>` | Path to a GVP store directory (contains `config.yaml` and `library/`) |
| `--strict` | Promote warnings to errors |
| `--no-registry` | Skip registry recording for this invocation |
| `-v, --verbose` | Verbose output; repeat for more detail |

Where a subcommand defines the same **short** flag, the subcommand wins after it:
`cairn query -c decision` means `--category`, never `--override`. `query`
therefore advertises `--override` with no short alias, and `cairn -c x=y query`
still reaches the global.

## Targeting a library

Cairn resolves **exactly one** library: the first `.gvp/library` found walking up
from the cwd. There is no user-level or system-level fallback library. Two flags
override that walk-up, and they are not interchangeable:

| Flag | What it addresses | Config it loads |
|------|-------------------|-----------------|
| `--library <dir>` | a `library/` directory directly | still discovered from **cwd** |
| `--store <dir>` | a store: `<dir>/config.yaml` + `<dir>/library/` | the **store's** `config.yaml` |

That difference has a sharp consequence for the registry: **`--library` bypasses
config-level registry opt-outs**, because the config it reads is the cwd's, not
the addressed library's. A store or project `registry.enabled: false` therefore
does *not* stop a `--library` run from recording. `--no-registry` is the only
opt-out that holds however the library is addressed — see **Discovery and the
library registry** in `SKILL.md`.

```bash
cairn --library ~/.gvp/library query --category rule   # read a library elsewhere
cairn --store /tmp/scratch-store validate             # a whole throwaway store
cairn --no-registry --library ~/.gvp/library libs list # read without recording
```

## Flags this document asserts do not exist

Older copies of this skill — and older copies of `workflow-full.md` — documented
flags cairn has never had, and agents dutifully tried to use them. The drift test
asserts each of these is **absent** from the binary, so if cairn ever grows one,
this claim fails loudly instead of quietly becoming true-by-accident.

| Command | Flag | What to do instead |
|---------|------|--------------------|
| `review` | `--approve` | `cairn review <id> --token <hash>` — the token *is* the approval |

## Validation Codes

**Errors** (exit non-zero):
`E001` broken maps_to ref · `E002` duplicate element ID · `E003` broken inheritance · `E004` schema validation failure · `E005` duplicate step ID · `E006` duplicate document `meta.name` within a library

**Warnings** (exit zero):
`W001` empty maps_to · `W002` empty document · `W003` mapping rules violation · `W004` isolated element · `W005` self-document mapping · `W006` stale element · `W007` undefined tag · `W008` duplicate category def · `W009` ID gap · `W010` ref file missing · `W011` ref identifier missing · `W012` orphan identifier (coverage) · `W013` decision no refs (coverage) · `W014` no root trace · `W015` auto-assigned step ID · `W016` unrecognized YAML key · `W017` no value trace (soft anchor) · `W018` actionable root has no decision (coverage) · `W019` unrecognized `meta` key

`W013` applies only to `accepted` decisions — a `declined` or `deferred`
decision has no implementation by definition, so its rationale is the record.

`W019` is why a mistyped `meta` key is no longer silent. `meta` is passthrough,
so cairn preserves whatever you put there, and a misspelling like
`meta.registry.enable` would otherwise look accepted while doing nothing.
Suppress it with `suppress_diagnostics: [W019]` if a downstream tool deliberately
rides on `meta`.
