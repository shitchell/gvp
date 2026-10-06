# Decisions

One section per design choice made while building `tally`. Each states what was
chosen, why, and which GVP element informed it (ids resolve with
`cairn --library ./.gvp/library inspect <id>`).

## Runner: `tsx`, no build step

**Chose** `npx tsx src/index.ts <dir>` as the entry point, with `tsx` and
`typescript` as the only dependencies (both dev-only); no bundler, no `dist/`.

**Why** The task named the invocation, and a build step would add a second way
to be out of date for no gain at this size. Type checking is kept as a separate
`tsc --noEmit` gate rather than a compile output.

**GVP** `code-common:CP16` — language and tooling choice is about effort, not
capability; `personal:V1` — simplicity, fewer moving parts.

## No CSV library: a hand-written counting reader

**Chose** `src/csv.ts` — a state machine, under 200 lines including its
comments — instead of `csv-parse`/`papaparse`.

**Why** The useful portion of a CSV library here is small and the fit is poor:
tally needs field *counts*, not field *values*, and needs a crisp line between
"ragged but readable" (a success) and "cannot be counted" (a failure). Libraries
make that call with their own options; owning it is cheaper than configuring it,
and it drops the runtime dependency count to zero.

**GVP** `code-common:CH1` — dependency adoption threshold (~200 lines of useful
portion, write it yourself), which also asks about architectural fit and the
burden of working around limitations.

## Count bytes, do not decode text

**Chose** The reader consumes raw bytes and never converts them to a string.

**Why** The delimiters that matter (`,` `"` `\n`) are single ASCII bytes, so
counting rows and columns does not require knowing the encoding. Not decoding
means a Latin-1 or otherwise non-UTF-8 file is counted correctly instead of
being rejected or silently mangled into replacement characters, and multi-byte
characters cannot straddle a chunk boundary. The exception is UTF-16, where the
byte stream genuinely would miscount; that is detected by its byte-order mark
and reported as a failure rather than answered with a wrong number.

**GVP** `code-common:CP12` — always know what state you are in and never wander
into an unexpected bad state; `personal:V1` — the simplest thing that meets the
requirement.

## Streaming with constant memory

**Chose** Each file is read through `createReadStream` and pushed into the
counter chunk by chunk; no file is ever held in memory.

**Why** Counting needs no history, so the streaming version is barely longer
than the whole-file version, and it removes a real failure class rather than a
hypothetical one — a CSV larger than Node's maximum string length would
otherwise fail for a reason that has nothing to do with the user's data.
Verified on a 15 MB / 1,000,000-row file.

**GVP** `personal:H3` — build now when a known future need has clear cost
asymmetry (the retrofit is a rewrite of the reader's interface; the up-front
cost is a few lines); `personal:P2` — validate with real data.

## Files are read one at a time

**Chose** `scanDirectory` awaits each file in turn rather than `Promise.all`.

**Why** Reading an entire directory concurrently exhausts file descriptors on a
large directory, and the resulting `EMFILE` would be reported as a per-file
failure — the tool would blame the user's files for its own resource bug. A
bounded-concurrency pool is the obvious upgrade if directory scans ever get slow
enough to care; the counts are identical either way.

**GVP** `code-common:CP12` — don't wander into a bad state; `personal:V1`.

## A file fails only when its counts cannot be determined

**Chose** The failure set is exactly: an I/O error, an empty file, an
unterminated quoted field, and a UTF-16 byte-order mark. Everything else is
read as data — including a `"` inside an unquoted field (`6" pipe`) and stray
text after a closing quote (`"x"junk`).

**Why** A failure costs the user a whole file's report, so it should mean "any
number I printed here would be a guess", not "this file is unusual". An
unterminated quote swallows the rest of the file into one field, so the counts
are meaningless; a stray quote mid-field changes nothing about where the commas
and newlines are. This also keeps the rule stated in the requirements — a ragged
row is still a row, and its file still succeeds — from being undercut by a
stricter parser elsewhere.

**GVP** `code-common:CP12` — for each failure ask what the consequence is and
whether we can recover; `personal:V2` — be honest about limitations rather than
presenting a clean facade; `personal:R2` — surface failures, never swallow them.

## An empty file is a failure, not `0 rows, 0 columns`

**Chose** A zero-byte `*.csv` file is reported as
`failed: file is empty, so it has no header row`.

**Why** The requirement that the first line is a header has no answer for a file
with no lines. Reporting `0 columns` would be a fabricated fact about a header
that does not exist, and naive parsing would actually yield `1 column` (one
empty field) — a worse lie. The failure line says what is true.

**GVP** `personal:V2` — transparency about limitations; `personal:R2` — no
silent misreporting.

## Blank lines in the middle of a file are counted as data rows

**Chose** An interior empty line is one data row (of one empty field). A
trailing newline at the end of the file is not.

**Why** The requirements already insist that a row whose field count differs
from the header is still a row, and a blank line is the extreme case of that.
Dropping it would mean the reported row count silently disagrees with the file's
record count, which is exactly the surprise a counting tool should not produce.

**GVP** `personal:V5` — never silently discard data; `personal:V2`.

## Line endings: `\n` and `\r\n` only

**Chose** `\n` ends a record; the `\r` of a `\r\n` pair needs no special case
because it only ever precedes the `\n` that does the work. A lone `\r` is data.

**Why** Since field contents are never reproduced, a `\r` cannot affect a count,
so the handling collapses to "ignore it" rather than a mode or a heuristic.
Classic Mac (CR-only) files are consequently seen as a single header row; that
is a documented limitation, not a silent one.

**GVP** `personal:V1` — the simplest approach that meets the requirement;
`personal:V2` — document the corner that was cut.

## `*.csv` is matched exactly as a shell glob would

**Chose** Case-sensitive, non-empty stem, no hidden files; directories and
sockets named `*.csv` are skipped; symlinks are followed.

**Why** The requirement is written as `*.csv`, and a shell glob is the meaning a
reader of that requirement will assume — so `DATA.CSV` is "not a `*.csv` file"
and is left alone. Being lenient here would mean touching files the requirement
says to leave alone, which is the worse error of the two. Case-insensitive
matching is a purely additive flag if it is ever wanted.

**GVP** `personal:P9` — follow the current rule uniformly, change it by explicit
decision rather than silently; `code-common:CP11` — API surface is a commitment,
prefer additive changes later over guessing now.

## Filename order is byte order, not locale order

**Chose** Sorting compares strings directly (UTF-16 code units) instead of
`localeCompare`.

**Why** `localeCompare` makes the report depend on the machine's locale and ICU
build, so the same directory could produce two different orderings — a hidden
input to a tool whose output people will diff and script against.

**GVP** `code-common:CP3` — explicit over implicit, no hidden dependence on
global state.

## Failures stay inline on stdout; stderr is for having no report

**Chose** Per-file failure lines are printed on stdout in filename order,
interleaved with the counted files. stderr carries only whole-run problems (bad
arguments, unreadable directory).

**Why** The report is one ordered sequence with one line per file; splitting
failures onto stderr would break that order and make the summary's counts
unverifiable from either stream alone. Conversely, a run that produced no report
should not put anything on stdout for a pipeline to misread as data.

**GVP** `personal:P20` — prefer machine-consumable forms; `code-common:CP12` —
the user needs to know, and the handling should match the consequence.

## Exit codes 0 / 1 / 2

**Chose** `0` all files counted, `1` report produced but some file failed, `2`
no report produced.

**Why** "Some files failed" and "nothing ran" are different situations for a
caller, and distinguishing them costs one constant. Without it, the only way to
know a scan was incomplete is to parse the summary line.

**GVP** `personal:P19` — favour low-effort, high-information signals;
`personal:P20` — a program should be able to read the outcome.

## Summary counts failures as reported

**Chose** `4 files reported, 2 failed` — the first number includes the two
failures.

**Why** Requirement 8 ("how many files were reported and how many failed") can
be read either way. Reading it as `successes, failures` makes the first number
redundant with the line count minus the failures, whereas `total, failed` lets a
reader check the report against itself. The wording is documented in the README
so the ambiguity is resolved in the open; if the other reading was intended, it
is a one-line change.

**GVP** `personal:V2` — document the trade-off rather than quietly picking.

## No `--json`, `--recursive` or `--encoding` flags

**Chose** The only flags are `-h`/`--help`. The seam that would carry those
features exists internally — scanning returns structured records and `report.ts`
is the only thing that turns them into text — but no second output format or
traversal mode is implemented.

**Why** There is real tension in the library here: machine-consumable output and
early config flex points pull toward shipping `--json` now, while the deferral
tree and surface-commitment elements pull against inventing surface for an
unrequested use case. The tie-breaker is reversibility: every one of these is a
purely additive flag that the existing seam already supports, so building it
later costs almost nothing, whereas an exported flag can never be withdrawn. The
trigger for revisiting is the first actual consumer — a script that wants to
parse the report, or a directory tree someone wants scanned.

**GVP** `personal:H8` — buy reversibility when it costs less than proof (and
record the trigger for revisiting); `code-common:CH2` — deferral decision tree,
additive feature with unknown access patterns gets a flex point, not an
implementation; `code-common:CP11` — API surface is a commitment;
`personal:P1` — shape the architecture around the flex point without
implementing the change early.

## Four modules split by concern

**Chose** `csv.ts` (bytes → counts), `scan.ts` (directory → records),
`report.ts` (records → text), `index.ts` (arguments, output, exit code).

**Why** Each of the likely changes lands in exactly one file: a parsing rule in
`csv.ts`, a file-selection rule in `scan.ts`, a format change in `report.ts`, a
flag in `index.ts`. The boundaries are also what make the tests cheap — the
parser and the formatter are both testable without a filesystem.

**GVP** `code-common:CP1` — a change should fit in one contiguous block;
`code-common:CP13` — testability is a design constraint, not an afterthought.

## Tests: `node:test`, unit plus end-to-end through the real CLI

**Chose** The built-in test runner (no Jest/Vitest), 52 tests: unit tests for
the parser, the scanner and the formatter, plus end-to-end tests that spawn
`tsx src/index.ts` against throwaway directories and assert on stdout, stderr
and exit code.

**Why** Unit tests pin the parsing rules — including every requirement that
names a specific behaviour (quoted commas, ragged rows, per-file failures,
empty directory) — while the end-to-end tests prove the assembled command does
it, which is the only level at which exit codes and stream routing exist at all.
A test framework would be a dependency used for `describe`/`it` and nothing
else.

**GVP** `code-testing:TP1` — unit *and* end-to-end tests, code without them is
unverified; `personal:P13` — verify in the production runtime, not just the
harness; `code-common:CH1` — don't adopt a dependency for a thin slice.

## `npm test` type-checks first; `tsconfig` is strict

**Chose** `npm test` runs `tsc --noEmit` and then the suite; the config enables
`strict`, `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`.

**Why** A verification step that has to be remembered is one that will be
skipped, so the type check is wired into the command people already run instead
of being documented as a convention. It is friction-free: invisible when the
code is right.

**GVP** `code-common:CP10` — prefer validators and checks over convention;
`personal:R1` — typecheck and tests must pass before claiming correctness;
`personal:P18` — a gate should reduce or not add friction.

## Named constants for the parser's bytes and codes

**Chose** `QUOTE`, `COMMA`, `LINE_FEED`, `UTF8_BOM`, `UTF16_BOMS`,
`BOM_PROBE_LENGTH`, `EXIT_*`, `CSV_EXTENSION`, `COLUMN_GAP`.

**Why** `0x22` and `2` are unreadable at the point of use, and the BOM probe
length is derived from the mark definitions rather than restated, so adding a
mark cannot leave a stale literal behind.

**GVP** `code-common:CP9` — named constants for everything configurable;
`code-common:CP2` — clarity over cleverness.

## Everything is implemented; nothing is scaffolded

**Chose** No placeholder functions, `TODO`s or stubbed paths. The one test-only
module (`src/test-fixtures.ts`) says so in its first line.

**Why** Scaffolding needs explicit authorization that was never given here, and
unmarked helper code in `src/` is the kind of thing a later reader (human or
agent) reproduces as if it were product code.

**GVP** `code-common:CR2` — no scaffolding without explicit verbatim user
verification; `ai-common:P2` — curate the working tree for legibility.

## Naming was not deliberated

**Chose** `tally` was given; module and function names are plainly descriptive
(`scanDirectory`, `formatReport`, `CsvCounter`).

**Why** Noted only because the library says to make this call consciously: this
is a small single-purpose tool, so descriptive names are the right outcome and
time spent on cleverer ones would be wasted.

**GVP** `personal:H9` — scale naming effort to expected reach;
`code-common:CP8` — names describe purpose, not lineage.

## Nothing was escalated to the human

**Chose** Every decision above was taken and recorded rather than raised as a
question.

**Why** The library's rule is that a decision derivable from the existing
guiding elements is correct by construction and should not consume human
review; only a genuinely ambiguous one gets surfaced, and as a proposed patch to
the library rather than a bare question. The closest call was the `--json`
flag, where two elements pulled in opposite directions — `personal:H8`
(reversibility) settled it without needing a new element, so it was decided and
documented with its revisit trigger.

**GVP** `personal:H5` — disambiguate, then surface only what cannot be derived;
`personal:P15` — humans review guiding elements, not individual decisions.
