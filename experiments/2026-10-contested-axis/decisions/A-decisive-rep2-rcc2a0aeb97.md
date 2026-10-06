# Decisions

One section per design choice: what was chosen, why, and which GVP element (if
any) informed it.

`TASK.md` fixes the behaviour but leaves plenty open. Where a choice was open,
I took the one the library yields rather than stopping to ask — `personal:H5`
makes a blocker specifically "a decision that cannot be unambiguously derived
from the library", and none of the choices below met that bar. The one place two
elements genuinely pulled against each other is flagged as such in
[JSON output](#json-output-as-well-as-text).

---

## A hand-written CSV reader instead of a dependency

**Chosen:** `src/csv.ts` — a ~90-line quote-aware reader. No `csv-parse`, no
`papaparse`.

**Why:** The useful surface is one function. A library would bring dialect
detection, type coercion, streaming transforms and header mapping, none of which
this tool uses, and the failure semantics in requirements 5–7 are precisely the
part I would have to configure or work around anyway.

**GVP:** `code-common:CH1` (dependency adoption threshold) — "if the useful
portion of an external library is approximately 200 lines or fewer, write it
yourself". This is well inside that line. `personal:V1` agrees: fewer moving
parts.

## No runtime dependencies at all

**Chosen:** Argument parsing is `node:util.parseArgs`; the test runner is
`node:test`. The only dev dependencies are `tsx`, `typescript` and
`@types/node`.

**Why:** Same reasoning one level up. `commander` for two options, or `vitest`
for a suite with no browser or mocking needs, would be mostly unused surface.

**GVP:** `code-common:CH1` again, and `code-common:CP16` (language selection is
an effort decision) — the deciding factor is standard-library coverage, and
Node's covers this.

## Five modules split by responsibility

**Chosen:** `csv.ts` (reading) → `tally.ts` (measuring) → `report.ts`
(rendering) → `cli.ts` (arguments and exit code) → `index.ts` (process wiring
only).

**Why:** Each requirement lands in exactly one file. Changing the output format
touches only `report.ts`; changing what counts as a row touches only `csv.ts`.
It also means the measurement is testable without scraping stdout.

**GVP:** `personal:P3` (separate what from how at every layer) — `tally.ts`
answers *what the report contains*, `report.ts` *how it looks*.
`code-common:CP13` (testability is a design constraint) drove putting the
rendering behind a pure function. `code-common:CP1` (one contiguous block) is
the check I applied to the split: no future change here should need edits in
four files.

## Rows are produced lazily

**Chosen:** `parseRows` is a generator; `tally.ts` counts by exhausting it and
never materialises the rows.

**Why:** Counting is the whole job, so holding an array of every row is pure
waste. It costs nothing in complexity over returning an array, and it is the
natural seam a streaming source would slot into later.

**GVP:** `code-common:CH2` (deferral decision tree), middle branch — add the
flex point, not the feature. The generator *is* the seam; chunked reading is the
feature I did not build.

## Files are read whole

**Chosen:** `readFile(path, "utf8")`, not a read stream.

**Why:** Streaming would buy memory headroom for a single enormous file and cost
a chunk-boundary state machine in the parser. Nothing in the requirements asks
for it. The limit is stated plainly in the README rather than left for someone
to discover.

**GVP:** `personal:V1` (complexity must earn its place) for the choice;
`personal:V2` (transparency — document the corner that was cut) for writing the
limit down instead of implying the tool handles any size.

## Failure means "no single reading", not "not RFC 4180"

**Chosen:** A file fails on an unterminated quoted field, or on text wedged
between a closing quote and the next delimiter (`"ab"c`). A quote inside an
*unquoted* field (`a"b`) is kept as literal data.

**Why:** Requirements 5 and 6 together say failure is about unreadability, not
tidiness — a ragged row is explicitly still a success. That needed a sharper
rule, and the one I derived is: reject only when the bytes admit *no* single
reading. `"ab"c` could be `ab`, `abc` or `ab"c` — genuinely ambiguous. `a"b` has
exactly one reading, and rejecting it would discard a whole file's report over a
character whose meaning is not in doubt.

**GVP:** `personal:V5` (never silently discard data — and failing a file
discards its report) and `code-common:CP12` (always know what state you are in;
never wander into an unexpected bad state). CP12 is what makes the distinction
load-bearing: where the state is unambiguous, act on it; where it is not, stop
and report.

## A zero-byte file is a failure

**Chosen:** An empty file is reported as `FAILED: file is empty: no header row`,
not as a success with 0 rows and 0 columns.

**Why:** Requirement 3 asks for "how many columns its header declares". There is
no header, so reporting `0 cols` would be asserting a fact about a row that does
not exist. Any non-empty first line declares at least one column, so `0 cols`
could never be true. It is still only a per-file failure — the run continues
(requirement 5).

**GVP:** `code-common:CP12` — do not report a state you are not in — and
`personal:V2`.

## Blank lines count as data rows

**Chosen:** A single trailing newline does not produce a phantom final row, but
a blank line anywhere else is a data row holding one empty field.

**Why:** Requirement 6 already settles the shape of this: a row whose field
count differs from the header's still counts. A blank line is such a row. The
trailing-newline case is different — that newline terminates the last real row
rather than introducing a new one.

**GVP:** `personal:V5` (do not silently drop a line that is in the file) and
`personal:P9` (follow the stated rule uniformly rather than carving out a
one-off exception for blank lines).

## `\r\n` ends a row; a lone `\r` is data

**Chosen:** Both `\n` and `\r\n` terminate rows. A carriage return not followed
by a newline is an ordinary character.

**Why:** CRLF is table stakes — CSVs come out of Windows tooling constantly, and
getting it wrong would silently corrupt every column count by trailing a `\r`
onto the last field. Classic-Mac lone-`\r` files are vanishingly rare and
supporting them would make `\r` ambiguous inside quoted fields.

**GVP:** `code-common:CH2`, first branch — CRLF is needed for correctness, so
implement now; lone-`\r` support is speculative, so defer with no flex point.

## A leading byte order mark is stripped

**Chosen:** A leading U+FEFF is removed before parsing.

**Why:** Spreadsheet exports routinely carry one. It does not change any count,
but leaving it in means a BOM-only file would be read as a one-column header,
which is an artefact rather than a table.

**GVP:** `code-common:CP12` — the honest reading of those bytes is "no content".

## Scope rule: resolve, then classify identically

**Chosen:** A `*.csv` entry is measured if it is a regular file, directly or
through a symlink. If it resolves to a directory, socket or device it is skipped
— the same outcome whether it is a real directory or a link to one. If it cannot
be resolved at all (a dangling symlink), it is reported as a failure.

**Why:** My first cut skipped real directories but let symlinks-to-directories
reach `readFile` and fail with `EISDIR`, which is the same situation reported two
different ways depending on how you got there. Resolving first and then applying
one rule removes that. Skipping non-regular files also avoids a real hazard:
`readFile` on a FIFO named `data.csv` blocks forever.

**GVP:** `personal:P10` (structural asymmetry is bias — check for it explicitly)
is what caught the inconsistency; it is the element that turned "works fine"
into "reports the same state two ways". `personal:R2` (no silent failures) is
why a dangling symlink is surfaced rather than skipped — it looks like a CSV and
would otherwise vanish from the report. `code-common:CH2` first branch covers
the FIFO guard as a correctness issue.

## The extension match is exact and case-sensitive

**Chosen:** `.endsWith(".csv")`. `DATA.CSV` is left alone. No flag to change it.

**Why:** Requirement 1 says `*.csv`, which on a case-sensitive filesystem means
exactly that. Matching `.CSV` too would be me quietly widening a stated
requirement, and users with `.CSV` files have a documented behaviour to react to
rather than a surprise.

**GVP:** `personal:P9` (follow rules uniformly, change them explicitly) — the
requirement is the current rule, so I follow it and write the consequence down
rather than silently breaking it for convenience.

## Filename order is by code unit, not locale

**Chosen:** A plain `<`/`>` comparison, not `localeCompare`.

**Why:** `localeCompare` reads the ambient locale and the host ICU build, so the
same directory could report in different orders on two machines. For a tool
whose output someone may diff or commit, reproducibility wins over
locale-friendly collation.

**GVP:** `code-common:CP3` (explicit over implicit — "no hidden state or global
magic"). The comparison is exported and unit-tested so the chosen order is
pinned rather than incidental.

## Three exit codes

**Chosen:** `0` all reported, `1` report produced but at least one file failed,
`2` the run could not start (bad arguments, or `<dir>` unreadable).

**Why:** `TASK.md` does not mention exit codes, but a CLI whose only failure
signal is prose in stdout cannot be used in a script. Separating `1` from `2`
matters because they need different reactions: `1` means read the report, `2`
means there is no report.

**GVP:** `personal:R2` (failures must be surfaced, not swallowed) and
`personal:P20` (prefer machine-consumable forms where easy) — an exit code is
the cheapest machine-readable signal a CLI has. `code-common:CP12` drove the
split between the two non-zero codes.

## Per-file failures go to stdout, in order; run-level errors to stderr

**Chosen:** `FAILED:` lines sit in the ordered report on stdout. Usage errors
and an unreadable `<dir>` go to stderr, and stdout stays empty.

**Why:** Requirements 4, 5 and 8 make per-file failures part of the report — they
occupy a line in filename order and they are counted in the summary. A run that
never produced a report is a different thing, and a caller piping stdout to a
parser should get either a whole report or nothing.

**GVP:** `code-common:CP12` — the two states are distinct, so they get distinct
channels.

## JSON output as well as text

**Chosen:** `--format text|json`, defaulting to `text`.

**Why:** This is the one place the library pulled both ways.
`code-common:CH2`'s middle branch argues for the seam without the feature — keep
the structured core and don't build the formatter until someone asks.
`personal:P20` argues the other way: "where it is easy, shape signals and
artifacts so a program can read them", and given a formatter seam that already
exists, JSON is about fifteen lines. I went with P20 — a principle, where CH2 is
a heuristic serving it — because the text format is genuinely awkward to parse
and the alternative is every downstream consumer writing a regex. The default is
unchanged, so this is additive.

**GVP:** `personal:P20`, with `personal:V4` (the system provides options and
defaults; the user decides) and `code-common:CP5` (defaults always, so
zero-config works). `code-common:CP11` (API surface is a commitment) is why it
is one flag with an enum rather than a `--json` boolean that would collide with
any third format.

## Bounded concurrency, as a function option rather than a CLI flag

**Chosen:** `tallyDirectory` reads at most `DEFAULT_CONCURRENCY = 16` files at
once, overridable via `tallyDirectory(dir, { concurrency })`. Not exposed on the
command line.

**Why:** An unbounded `Promise.all` over a directory of ten thousand CSVs opens
ten thousand descriptors and can hit `EMFILE` — a failure caused by the tool
rather than the data. Sequential reads avoid that but are needlessly slow. The
bound is the fix; a CLI flag for it is a public commitment with no demonstrated
need.

**GVP:** `code-common:CP12` (don't wander into a bad state) for the bound itself;
`code-common:CP9` (named constants for everything configurable) and
`code-common:CP5` (configuration infrastructure early) for making it a named
constant and a parameter rather than a literal; `code-common:CH2` middle branch
for stopping at the function option instead of a flag.

## `run(argv, streams)` takes its output streams as arguments

**Chosen:** `cli.ts` exports `run(argv, { writeOut, writeError })` and returns an
exit code. `index.ts` is the only file that touches `process`.

**Why:** Nothing in the command's logic depends on global state, and the whole
command — including its exit code — is callable directly.

**GVP:** `code-common:CP3` (function signatures show all inputs; no hidden
global magic) and `code-common:CP13`.

## A discriminated union for records, under a strict tsconfig

**Chosen:** `TallyRecord` is `{ ok: true, rows, columns } | { ok: false, reason }`.
`strict`, plus `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
`noUnusedLocals` and `noUnusedParameters`.

**Why:** The union makes "a successful record has no reason, a failed one has no
counts" a compile-time fact rather than a convention, so no formatter can print
`0 rows` for a file that failed. `noUncheckedIndexedAccess` specifically earns
its keep in a character-at-a-time parser.

**GVP:** `code-common:CP7` (strict typing) and `code-common:CP3` (enums over
string literals — `REPORT_FORMATS` is a const tuple with a derived type and a
type guard at the argument boundary, so an unknown `--format` is rejected in one
place).

## Summary counting lives in one function

**Chosen:** `summarize()` is used by both the text summary line and the exit
code.

**Why:** These two must never disagree. Counting failures twice is how you end
up with a report saying `0 failed` and an exit code of 1.

**GVP:** `code-common:CP4` (centralize shared logic).

## `mapWithConcurrency` stays local to `tally.ts`

**Chosen:** The bounded-concurrency helper is a private function, not a shared
`src/concurrency.ts`.

**Why:** The boundary is clean, but there is exactly one consumer.

**GVP:** `personal:H1` (extraction timing) — "do not create shared abstractions
before a real shared need exists". A second consumer is what would move it.

## Tests: unit plus end-to-end, driving the real process

**Chosen:** 56 tests. Unit tests for the parser (quoting, CRLF, BOM, blank
lines, ragged rows, both malformed-quote cases, laziness), for the measurement
against a fixture directory and against temp dirs for symlink and permission
cases, and for both formatters. `test/cli.test.ts` spawns the actual
`tsx src/index.ts` as a child process and asserts on stdout, stderr and exit
code.

**Why:** The unit tests pin the behaviour of each piece; the e2e tests prove the
assembled command does what a user invokes. The e2e layer specifically catches
what a unit test cannot: that the ESM entry point resolves under `tsx`, that
`process.exitCode` is actually set, and that the stdout/stderr split holds.

**GVP:** `code-testing:TP1` (tests for all code, unit and end-to-end) and
`code-testing:TP2` (the test is the executable definition of success — each
numbered requirement in `TASK.md` has a test naming it). `personal:P13` (verify
in the production runtime, not just the test harness) is why the e2e tests spawn
a process rather than importing `run` and stubbing streams.
`code-testing:TP3` is why they assert on captured stdout rather than on a mock.

## The permission test skips when running as root

**Chosen:** The mode-`000` fixture test is skipped with a stated reason when
`getuid() === 0`.

**Why:** Root can read a mode-000 file, so the test would fail for a reason that
has nothing to do with the code. Skipping with a visible reason is honest;
deleting the test would lose the coverage, and leaving it to fail would teach
whoever runs it next to ignore failures.

**GVP:** `personal:V2` (be honest about limitations rather than presenting a
clean facade) and `code-testing:TP3` (a criterion an agent cannot actually
exercise is not verifiable — so say which one it is and when).

## Help text is generated from the option list

**Chosen:** The `Options:` block is built from a `HELP_OPTIONS` tuple that also
interpolates `REPORT_FORMATS` and `DEFAULT_FORMAT`.

**Why:** Hand-written help drifts from behaviour the first time an option
changes, and stale help is worse than none — it is read as true.

**GVP:** `ai-common:C2` (agents reproduce patterns from the working tree; stale
artifacts cause incorrect work — which applies to help text as much as to code)
and `code-common:CP10` in spirit: derive the fact, don't document it twice.

## No `bin` entry in `package.json`

**Chosen:** The documented invocation is `npx tsx src/index.ts <dir>`, with
`npm run tally -- <dir>` as the equivalent. There is no `bin` mapping.

**Why:** A `bin` pointing at a `.ts` file only works when `tsx` happens to be
resolvable, so it would be a promise the package cannot keep on a global
install. The shebang in `index.ts` is there for convenience, not as a claim.

**GVP:** `personal:V2` and `code-common:CP11` (every public surface is a
commitment — don't add one you cannot honour).

## Enforcement is `npm run check`, and that is a gap

**Chosen:** `npm run check` runs typecheck then tests, and the README names it
as the gate.

**Why:** `code-common:CP10` wants a hook or CI check rather than a documented
convention, and `personal:P7` wants every process to have a concrete enforcement
mechanism. This directory is not a git repository, so there is no commit to hook
and no CI to configure. One script that does both is the most I can make
automatic here; it is still a convention someone has to remember to run.

**GVP:** `code-common:CP10` and `personal:P7` — recorded as an unmet constraint
rather than quietly dropped, per `personal:V2`. Installing a pre-commit hook
running `npm run check` is the fix the moment this is version-controlled.
