# Design decisions

Every decision below was checked against this project's GVP library
(`.gvp/library`, consulted with `cairn --library ./.gvp/library query`). Where a
library element determined or constrained the choice, its id is named. Where
nothing in the library bore on the choice, that is stated plainly rather than
retro-fitting an element to it.

---

## 1. Use the `yaml` package rather than hand-rolling a frontmatter parser

**Chosen:** `yaml@2` (`parseDocument`) as the only runtime dependency.

**Why:** `code-common:CH1` sets the threshold — "if the useful portion of an
external library is approximately 200 lines or fewer, write it yourself" — and
asks what fraction of the library is actually used and what the burden of
working around its limitations is. Here the useful portion is the *whole*
parser: requirement 6 makes "is this frontmatter malformed?" a first-class
output, so the tool needs real YAML error detection with positions, not a
regex that reads `key: value` lines. A hand-rolled subset parser would either
accept invalid YAML or reject valid YAML (anchors, block scalars, quoting
rules, flow collections), and every such gap becomes a wrong answer in the
report — the opposite of `personal:R2`. The library is well beyond 200 lines of
useful surface, so CH1 resolves toward adopting it. `ai-common:P2` ("prefer
tools with deeper AI training data when the choice is otherwise even") also
favours a mainstream YAML parser over bespoke code.

**Library elements relied on:** `code-common:CH1` (primary), `personal:R2`,
`ai-common:P2`.

**Counter-pull noted:** `personal:V1` (simplicity, fewer moving parts) argues
for zero dependencies. It loses here because the simplicity would be in the
dependency list and the complexity would move into our own code, where it would
be less correct.

---

## 2. Everything else comes from the standard library

**Chosen:** `node:util parseArgs` for flags, `node:test` for tests, hand-written
table formatting. No `commander`, `chalk`, `cli-table`, `vitest`, or
`gray-matter`.

**Why:** `code-common:CH1` again: the used portion of each of those is tiny
(one flag parser call, one padded-string table). `gray-matter` specifically was
rejected because it would own the very behaviour requirement 6 is about — it
throws on malformed input, and we would be working around it to keep the run
going.

**Library elements relied on:** `code-common:CH1`.

---

## 3. Strict TypeScript with the strictest useful flags

**Chosen:** `strict`, plus `noUncheckedIndexedAccess`,
`exactOptionalPropertyTypes`, `noUnusedLocals/Parameters`,
`verbatimModuleSyntax`; typed signatures everywhere; `OutputFormat` as an enum
rather than a string union of literals; `readonly` on the data shapes.

**Why:** `code-common:CP7` requires type hints on all signatures and typed data
structures, and `code-common:CP3` calls for "enums over string literals". The
extra flags exist because `personal:R1` makes the typecheck part of what
"correct" means, and a lax typecheck that passes proves little.

**Library elements relied on:** `code-common:CP7`, `code-common:CP3`,
`personal:R1`.

---

## 4. Four layers, one concern each

**Chosen:** `frontmatter.ts` (pure text → fields), `scan.ts` (the only module
that touches the filesystem), `render.ts` (rows → text), `cli.ts` (argv →
strings + exit code), `index.ts` (writes to the real streams). Everything
speaks in terms of one shared `NoteRow` type.

**Why:** `code-common:CP1` — a change should land in one contiguous block. With
these seams, "support a new frontmatter field" is one function in
`frontmatter.ts`, "support a new output format" is one entry in `render.ts`, and
"change how files are found" is one function in `scan.ts`. `personal:H1` was
the test for whether to split at all: it says extract when the boundary is
clean and natural, and text-parsing / filesystem / formatting / process-glue
are four boundaries that do not blur. `code-common:CP6` (small, focused,
composable functions) points the same way.

**Library elements relied on:** `code-common:CP1`, `personal:H1`,
`code-common:CP6`.

---

## 5. `runCli` returns its output instead of writing to `process.stdout`

**Chosen:** `runCli(argv)` returns `{ exitCode, stdout, stderr }`; `index.ts` is
the only code that touches the real streams.

**Why:** `code-common:CP13` makes testability a design input, not an
afterthought — so the shape of the CLI function was chosen for the test that
had to exist. The whole command is now exercisable in-process with no stream
mocking and no subprocess, which is why the CLI test file can cover every flag,
every exit code, and the stderr channel cheaply. `code-testing:TP2` ("the test
is the executable definition of success") made this the natural shape.

**Library elements relied on:** `code-common:CP13`, `code-testing:TP2`.

**Trade-off, stated per `personal:V2`:** the report is buffered in memory rather
than streamed. For a notes directory this is irrelevant; for a multi-gigabyte
tree it would not be. Recorded rather than hidden.

---

## 6. Unit tests *and* an end-to-end test that spawns the real command

**Chosen:** 77 tests across `frontmatter`, `scan`, `render` and `cli`, plus
`e2e.test.ts`, which spawns `npx tsx src/index.ts` as a child process and
asserts on stdout, stderr and exit status.

**Why:** `code-testing:TP1` requires both unit and end-to-end tests ("code
shipped without tests is unverified, not done"). The subprocess test exists
specifically because of `personal:P13` — green tests are not proof of working
software, and a TypeScript-on-Node tool is exactly where the test harness and
the production loader can diverge (ESM/CJS resolution, the `tsx` loader, the
shebang). `code-testing:TP3` says an agent must be able to fully exercise the
implementation, so the documented command is the thing under test.

**Library elements relied on:** `code-testing:TP1`, `personal:P13`,
`code-testing:TP3`.

---

## 7. Malformed frontmatter and bad field shapes become row `issues`

**Chosen:** one `issues: string[]` per row, always present, carrying both YAML
parse failures and unusable `title`/`tags` values. A row is still produced for
the file, with the file name as the title, no tags, and the body word count
still computed.

**Why:** requirement 6 says "reported, not skipped silently", and
`personal:R2` ("failures must be surfaced, not swallowed") and
`code-common:CP12` ("always know what state you are in") set how. A single
`issues` channel rather than separate mechanisms for "YAML broke" and "field
had the wrong type" follows `personal:P4` — build the generic mechanism for the
class of failures instead of special-casing each instance.

**Library elements relied on:** `personal:R2`, `code-common:CP12`,
`personal:P4`.

---

## 8. Unexpected field shapes are reported and ignored, never coerced

**Chosen:** `tags: draft` (a bare string) does not become `["draft"]`; it is
reported as `frontmatter "tags" must be a list of strings, got string
("draft"); reported no tags for this file`, and the row shows no tags. Same
rule for a non-string `title` and for a list containing a non-string.

**Why:** `code-common:CP3` (explicit over implicit — no hidden magic) rules out
silent coercion, because a coerced value is a guess presented as data.
`personal:V5` (never silently discard data) is satisfied by echoing the
offending value inside the issue message, so nothing disappears from the
report. `personal:P9` (follow rules uniformly) is why one rule covers all three
bad shapes instead of `tags` getting a lenient special case.

**Library elements relied on:** `code-common:CP3`, `personal:V5`,
`personal:P9`.

---

## 9. Issues are detailed on stderr; the report body stays on stdout

**Chosen:** stdout carries only the table or the JSON array. Issue detail goes
to stderr, and affected table rows are flagged with a leading `!` so nothing is
invisible in the primary output. `--json` rows carry the same text in `issues`.

**Why:** `personal:P20` (prefer machine-consumable forms where easy) — stdout
must stay pipeable into `jq` or a script, which it cannot be if diagnostics are
interleaved. `personal:R2` is still satisfied because the marker appears in the
report itself and the detail is always emitted. `ai-common:C6`/`P6` (separate
the reasoning volume from the presentation channel) supports pushing verbose
per-file explanation off the primary channel.

**Library elements relied on:** `personal:P20`, `personal:R2`,
`ai-common:P6`.

---

## 10. `--tag` filters the report body, but never hides a malformed file

**Chosen:** `--tag x` restricts the rows shown, while the stderr issue report
covers *every* file scanned, including files the filter excluded. The exit code
is likewise computed over all scanned files.

**Why:** this was the one genuine conflict in the task. A file whose
frontmatter did not parse has no known tags, so excluding it from a
`--tag`-filtered report means requirement 6's "must not be skipped silently" is
violated by requirement 4; including it in the filtered rows would put a file
with no demonstrated tag into the answer to "which files have tag x".
`personal:R2` and `personal:V2` decide it: surface the failure everywhere it
can be surfaced honestly, and keep the filtered data set truthful to the
filter. The residual limitation (a `--json` consumer sees those issues only on
stderr) is documented in the README rather than glossed over, per
`personal:V2`.

**Library elements relied on:** `personal:R2`, `personal:V2`.

---

## 11. Distinct exit codes: 0 / 1 / 2 / 3

**Chosen:** `0` clean, `1` report printed but some notes had issues, `2` bad
arguments, `3` part of the tree unreadable. Defined as named constants in
`cli.ts` and documented in `--help` and the README.

**Why:** `personal:P20` and `personal:P19` (low-effort, high-information
signals, machine-consumable where easy) — a caller can react without parsing
English. `code-common:CP9` is why they are named constants rather than literals
at the return sites. The highest severity wins, so a partial scan is never
masked by a clean-looking `1`, per `code-common:CP12`.

**Library elements relied on:** `personal:P20`, `personal:P19`,
`code-common:CP9`, `code-common:CP12`.

---

## 12. Renderers live in a table keyed by output format

**Chosen:** `RENDERERS: Record<OutputFormat, Renderer>`, with `renderTable` and
`renderJson` as peers; the CLI looks the renderer up rather than branching on
`--json`.

**Why:** `personal:P1` (design around flex points without implementing the
future change) and `personal:V7` (keep options open when it is cheap) — a third
format is one map entry and one flag, and the seam cost nothing to leave in
place. `code-common:CP14` (equal affordances) is why JSON is not a special case
bolted onto the table path: both formats go through the identical interface.
Per `code-common:CH2`, no third format was actually built — the flex point is
there, the speculative feature is not.

**Library elements relied on:** `personal:P1`, `personal:V7`,
`code-common:CP14`, `code-common:CH2`.

---

## 13. Nothing is excluded from the directory walk

**Chosen:** every `.md` file under `<dir>` is reported, including dot-files,
dot-directories and `node_modules`. No `--all` flag, no built-in ignore list.

**Why:** `personal:V1` — "complexity must earn its place; every abstraction or
generalization should solve a real problem, not a hypothetical one". A
built-in ignore list is invented policy; the user already chose the tree by
naming it. `code-common:CP3` also weighs against it: silently skipping part of
the tree the user pointed at is implicit behaviour. `code-common:CP11` ("API
surface is a commitment; adding is easy, removing is expensive") argued against
pre-emptively adding a flag to switch a policy that does not exist yet. The
behaviour is documented in the README so it is not a surprise.

**Library elements relied on:** `personal:V1`, `code-common:CP3`,
`code-common:CP11`.

---

## 14. Symlinks: follow links to files, do not descend into linked directories

**Chosen:** a symlink whose target is a file and whose name ends in `.md` is
included; a symlinked directory is not walked; a broken symlink becomes a scan
error on stderr.

**Why:** `code-common:CP12` — "never wander into an unexpected bad state". A
symlink cycle makes the walk non-terminating, which is such a state. Skipping
symlinked *files* would instead be a silent omission of real notes, which
`personal:R2` forbids, hence the asymmetry. Both halves are documented, per
`personal:V2`.

**Library elements relied on:** `code-common:CP12`, `personal:R2`,
`personal:V2`.

---

## 15. Cap YAML alias expansion

**Chosen:** `toJS({ maxAliasCount: 100 })`, with the resulting throw converted
into a normal row issue (test included).

**Why:** frontmatter is input from outside the program, and an uncapped YAML
document can expand exponentially ("billion laughs") — an unbounded resource
state, which `code-common:CP12` rules out. `code-web:WP2` ("validate all
external input at trust boundaries") is the closest element in spirit; it is
written for network/web boundaries rather than local files, so it is cited as
supporting rather than controlling.

**Library elements relied on:** `code-common:CP12`; `code-web:WP2` by analogy.

---

## 16. Named constants for every tunable, with working defaults

**Chosen:** `MAX_ALIAS_COUNT`, `VALUE_EXCERPT_LENGTH`, `COLUMN_GAP`,
`TAG_SEPARATOR`, `ISSUE_MARKER`, `JSON_INDENT`, `MARKDOWN_EXTENSION`,
`RUN_TIMEOUT_MS`, the exit codes, and a `DEFAULT_OPTIONS` object that makes
`noteview <dir>` work with no flags.

**Why:** `code-common:CP9` ("all magic numbers should be named constants") and
`code-common:CP5` ("wire up configuration from the start … but always provide
sensible defaults so zero-config works"). No config *file* was added: CP5 asks
for the defaults and the seam, and `code-common:CH2` says a feature with no
concrete use case is deferred entirely.

**Library elements relied on:** `code-common:CP9`, `code-common:CP5`,
`code-common:CH2`.

---

## 17. Sort with codepoint comparison, not `localeCompare`

**Chosen:** `left < right` string comparison on the relative POSIX path.

**Why:** requirement 7 says "sort output by path" and says nothing about
collation, so the deciding consideration is that the same tree must produce the
same report on any machine — `localeCompare` makes the output depend on the
host locale, which would also make the tests flaky. `personal:P2` ("data, not
vibes" — protocols are tested by running them) and `personal:R1` both assume
output that can actually be pinned by a test.

**Library elements relied on:** `personal:R1`, `personal:P2`.

---

## 18. Table formatting: no truncation, header always printed, `!` as prefix

**Chosen:** columns padded to the widest value with no truncation; the word
count right-aligned; the header row printed even when there are no rows; the
issue marker rendered as a line prefix that disappears entirely when no row has
issues.

**Why:** truncating a title or tag list would discard data from the report,
which `personal:V5` forbids — a wrapped line in a narrow terminal is the lesser
harm. Printing the header unconditionally follows `personal:P9` (one uniform
output shape rather than a special case for the empty report). The prefix-not-
column treatment of `!` exists so a clean report is not indented by an empty
column, i.e. `code-common:CP2` — the output should be obvious, and unexplained
leading whitespace is not.

**Library elements relied on:** `personal:V5`, `personal:P9`,
`code-common:CP2`.

---

## 19. A repeated `--tag` is an error, not last-one-wins

**Chosen:** `parseArgs` collects `--tag` with `multiple: true`; two occurrences
exit with code 2 and the message `--tag may be given only once`. One positional
`<dir>` exactly; two is an error naming both.

**Why:** `code-common:CP12` — know what state you are in and report rather than
guess. Silently discarding one of two conflicting filters is exactly the silent
data loss `personal:R2` prohibits. Requirement 4 describes a single tag, and
`code-common:CP11` says not to commit to a multi-tag surface (whose AND/OR
semantics are unspecified) before there is a real need for it.

**Library elements relied on:** `code-common:CP12`, `personal:R2`,
`code-common:CP11`.

---

## 20. CI workflow plus an `npm run check` script

**Chosen:** `.github/workflows/ci.yml` runs `npm ci && npm run check`
(typecheck then tests) on push and pull request; `npm run check` is the same
command locally.

**Why:** `code-common:CP10` is explicit — "when a rule must hold across a
codebase, encode it as a pre-commit/CI hook, a validator, or a type/lint check
rather than a documented convention", with enforcing strict typechecking as its
worked example. `personal:P7` says every intended process needs a concrete
enforcement mechanism. `personal:P18` (gates must earn their friction) is why it
is CI plus one local script rather than a pre-commit hook: invisible when
things are right, and nothing to route around.

**Library elements relied on:** `code-common:CP10`, `personal:P7`,
`personal:P18`.

---

## 21. MIT licence in the repository

**Chosen:** an MIT `LICENSE` file and `"license": "MIT"` in `package.json`.

**Why:** `personal:V8` — contribution over ownership, resolving "in favour of
publishing over withholding, permissive over restrictive", with secrecy having
to earn its place. An unlicensed repository is withholding by default, and the
cost of not defaulting to permissive is zero here. The copyright holder is taken
from the repository's configured git identity.

**Library elements relied on:** `personal:V8`.

---

## 22. Comments explain why; names are long where that helps

**Chosen:** module headers state each module's job; inline comments justify
non-obvious choices (why reduce instead of `Math.max(...)`, why symlinked
directories are skipped, why `multiple: true` on `--tag`). Identifiers such as
`splitFrontmatter`, `renderIssueReport`, `collectMarkdownFiles`,
`toRelativePosixPath` are descriptive over short.

**Why:** `code-common:CP2` — "comments explain why, not what"; descriptive
names, even if long; the six-month test. `ai-common:C2` adds the reason this
matters beyond human readers: agents reproduce whatever patterns are visible in
the tree, so the visible patterns should be the intended ones.

**Library elements relied on:** `code-common:CP2`, `ai-common:C2`.

---

## 23. Test fixtures are committed files, scratch dirs stay inside the project

**Chosen:** a fixed `tests/fixtures/notes` tree (including deliberately broken
notes) for the shared cases, and `tests/helpers.ts` `makeTempDir`, which creates
scratch directories under the gitignored `.tmp/` inside the project rather than
in the system temp directory.

**Why:** committed fixtures make the expected report inspectable rather than
hidden in setup code, which is `code-common:CP2`'s legibility test applied to
tests, and `ai-common:C2`'s point that the tree is what a future agent reads.
Keeping scratch files inside the project honours this run's instruction not to
write outside the project directory; `ai-common:P5` (size limits to accidents)
is the general form — the default should not be able to scatter files outside
the work area.

**Library elements relied on:** `code-common:CP2`, `ai-common:C2`,
`ai-common:P5`.

---

## 24. No scaffolding, stubs, or unrequested features

**Chosen:** every code path is implemented; there is no `--format csv` stub, no
config-file loader, no plugin hook. The SQLite/CSV-style extension point exists
only as the `RENDERERS` map that the two real formats already use.

**Why:** `code-common:CR2` forbids scaffolding or placeholder implementations
without explicit quoted user verification that scaffolding is wanted, and there
is none in this task. `code-common:CH2` independently says a speculative
feature with no concrete use case is deferred entirely, with no flex points.

**Library elements relied on:** `code-common:CR2`, `code-common:CH2`.

---

## 25. Two entry points only: `npx tsx src/index.ts` and `npm run noteview`

**Chosen:** no `bin` entry and no shebang on `src/index.ts`; the documented
ways to run it are `npx tsx src/index.ts <dir>` (the command the task asked
for) and the `noteview` npm script, which is the same thing with arguments
forwarded.

**Why:** `code-common:CP11` — every public surface is a commitment. A `bin`
entry on a `.ts` file would promise a globally installable executable that this
project has no build step to support, so it would either need a shebang that
shells out to `npx` at every invocation or a bundling step nobody asked for.
`personal:P8`/`personal:H7` (few entry points with options, bounded in both
directions) say two equivalent documented commands is already the ceiling here.

**Library elements relied on:** `code-common:CP11`, `personal:P8`,
`personal:H7`.

---

## 26. Decisions made without library guidance

Stated explicitly so the record is not overclaimed — nothing in the library
bears on these, and they are judgement calls:

- **Column headers** (`PATH TITLE TAGS WORDS`, uppercase) and the two-space
  column gap.
- **`!` as the issue marker** (chosen over a Unicode symbol or colour so the
  output is safe in any terminal and easy to `grep`).
- **Blank tags cell** rather than a `-` placeholder, so a literal `-` tag is
  never ambiguous.
- **Word counting is whitespace-only** — Markdown syntax, code fences and HTML
  are counted as written. The task said "word count" without defining it; this
  is the simplest defensible definition and the README says so.
- **Accepting `...` as a closing delimiter** and tolerating a BOM, CRLF, and
  trailing spaces on the delimiters — robustness against real-world files that
  the task neither required nor excluded.
- **Case-insensitive `.md` matching**, so `NOTES.MD` is included.
- **`title` being trimmed** before use.
- **The name `noteview`** was given by the task; `personal:H9` (scale naming
  effort to expected reach) would have applied had it not been.

---

## Verification

Per `personal:R1` ("never claim a change is correct without verification.
Typecheck must pass. Tests must pass."), the following were run in this
directory and passed at the time of writing:

```
$ npm run typecheck     # tsc --noEmit, strict — clean
$ npm test              # 77 tests, 16 suites, 77 pass, 0 fail
$ npx tsx src/index.ts tests/fixtures/notes           # exit 1, report + issues
$ npx tsx src/index.ts tests/fixtures/notes --json --tag inbox   # exit 1, 2 rows
```

The tool was run only against `tests/fixtures/notes` and scratch directories
under `.tmp/`, both inside this project.
