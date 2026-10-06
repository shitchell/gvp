# Decisions

One section per design choice. Each states what was chosen, why, and which GVP
element informed it (element ids are from `./.gvp/library`).

Per **personal:H5**, none of these were brought back as a "go or no go": every
one of them followed from the library without ambiguity. The three that were
genuine judgment calls within the library's bounds — the failure class for
quoting, empty files, and case-sensitive extension matching — are called out as
such below and documented in the README rather than left implicit
(**personal:V2**).

## No CSV parsing dependency

**Chose:** a hand-written RFC 4180 reader in `src/csv.ts` (~100 lines of logic)
instead of `csv-parse`, `papaparse` or similar.

**Why:** the useful portion of a CSV library here is quoting, separators and
line endings — well under the 200-line threshold, and a general parser brings
dialect detection, transforms and streaming APIs that this tool does not use.
Writing it also means the failure class is mine to define, which requirement 5
depends on.

**GVP:** **code-common:CH1** (dependency adoption threshold) directly; it maps
to **personal:V1**.

## No argument-parsing dependency

**Chose:** a hand-rolled loop in `src/cli.ts` for one positional and one option.

**Why:** same threshold test. The parser is shorter than the configuration a
library would need, and unknown options still produce a clear error.

**GVP:** **code-common:CH1**.

## Node's built-in test runner; `tsx` as the only runtime dependency

**Chose:** `node:test` + `node:assert/strict`, with `tsx` only because the task
names it as the entry point. No Jest/Vitest.

**Why:** zero added dependency for the same capability, and the test runner is
part of the platform the tool already targets.

**GVP:** **code-common:CH1**; **code-common:CP13** (testability as a design
constraint) is satisfied without buying a framework.

## Four modules split by what they know, not by file size

**Chose:** `csv.ts` (text → records, no file system), `tally.ts` (files →
report), `format.ts` (report → text/JSON), `cli.ts` (argv → output + exit code),
`index.ts` (process boundary only).

**Why:** each boundary here is clean and natural rather than speculative — the
CSV rules, the directory walk, the rendering and the process plumbing are
separately testable and separately changeable. Changing the output format or
adding a flag is one contiguous edit in one file.

**GVP:** **personal:P3** (separate what from how at every layer),
**code-common:CP1** (one contiguous block), **personal:H1** (extract when the
boundary is clean and natural — it is, so extract now rather than waiting).

## The command returns its output instead of printing it

**Chose:** `runTally(argv)` returns `{ stdout, stderr, exitCode }`; `index.ts`
is the only module that touches `process`.

**Why:** the whole command, including exit codes and stderr, is then assertable
in-process with no stream capture or subprocess. The alternative — exporting
testable helpers from the entry point — would have run the CLI on import and
corrupted the test run's own exit code.

**GVP:** **code-common:CP13**, **code-testing:TP2** (design every feature with
testing in mind), **code-common:CP3** (no hidden dependence on global state).

## The report is data; rendering is separate

**Chose:** `tallyDirectory` returns a `DirectoryReport` structure. Nothing in it
is formatted text.

**Why:** the same report drives the text output, the JSON output and the
assertions. A function that printed as it walked could not be tested without
capturing output, and could not gain a second format without duplication.

**GVP:** **code-common:CP6** (proactive reusability), **personal:P3**.

## Per-file outcome is a discriminated union, not a nullable field set

**Chose:** `FileReport = MeasuredFile | UnreadableFile`, keyed on `outcome`.

**Why:** a success has row and column counts; a failure has a reason. A single
shape with optional fields would let "0 rows because it failed" and "0 rows
because it is header-only" be confused, and the compiler could not tell them
apart. The union makes the two states impossible to mix up.

**GVP:** **code-common:CP3** (explicit over implicit; make modes obvious),
**code-common:CP7** (strict typing), **code-common:CP12** (always know what
state you are in).

I used a string-literal union rather than a TypeScript `enum`, which is the
literal reading of CP3's "enums over string literals". The intent of CP3 — no
unchecked magic strings — is met: the union is compile-time checked and
exhaustiveness-checked in the `switch` in `format.ts`, and `enum` is not
idiomatic in a `verbatimModuleSyntax` ES-module codebase.

## Strict about quoting, lenient about field counts

**Chose:** a file fails on ambiguous quoting (unterminated quote, text after a
closing quote, a quote inside an unquoted field) and never fails on a ragged
row.

**Why:** requirement 6 fixes the lenient half. For the strict half, the choice
was between guessing at the intended fields and rejecting the file. Guessing
would report a confidently wrong row count — a silent wrong answer — where
rejecting reports the file, the reason and the line. This is the judgment call
that defines "cannot be read as CSV", so the README states the class explicitly.

**GVP:** **code-common:CP12** (for each failure: what is the consequence, does
the user need to know — a miscount the user cannot see is the bad state),
**personal:R2** (no silent failures), **personal:V2**.

## An empty file is a failure, not a zero-row success

**Chose:** a file with no first line is reported as `failed: empty file: no
header row`.

**Why:** requirement 2 makes the header row structural — it is what declares the
column count. A file with no header declares nothing, so there is no honest
"0 rows, 0 columns" to report; reporting one would invent a column count. A
judgment call, documented.

**GVP:** **code-common:CP12**, **personal:V2**.

## Invalid UTF-8 fails rather than decoding to replacement characters

**Chose:** decode with `TextDecoder('utf-8', { fatal: true })`.

**Why:** the default decoder substitutes U+FFFD, so a corrupt file would be
reported as cleanly measured. Loud is correct here; the counts might even be
right, but the user cannot know that unless told.

**GVP:** **personal:R2**, **personal:V5** (never silently mangle data),
**code-common:CP12**.

## A file failure is part of the report; only a directory failure stops the run

**Chose:** per-file errors become `UnreadableFile` entries; `readdir` failing
throws `DirectoryReadError`, which the CLI turns into stderr and exit 2.

**Why:** requirement 5 demands the first. The second is a different state, not a
harsher version of the same one: with no listing there is no report at all, and
printing `0 files reported, 0 failed` for a misspelled path would be a confident
lie. Two states, two code paths, two exit codes.

**GVP:** **code-common:CP12** (don't wander into a bad state; handle explicitly
with clear messages), **personal:R2**.

## Three exit codes

**Chose:** `0` all reported, `1` reported with failures, `2` could not run.
Named in an `EXIT_CODES` object and listed in `--help`.

**Why:** a script needs to distinguish "the report is complete" from "some files
failed" from "I never ran". Collapsing 1 and 2 would make a typo in the path
indistinguishable from a broken CSV file. This is a cheap, high-information
signal in a form a program can consume.

**GVP:** **personal:P19** (low-effort, high-information signals),
**personal:P20** (prefer machine-consumable forms where easy),
**code-common:CP12**, **code-common:CP9** (named constants).

## `--format json`, with text as the default

**Chose:** text output exactly as the requirements describe, plus an opt-in JSON
rendering of the same report.

**Why:** there is real tension here with **personal:V1** — the requirements only
ask for the text report. It resolves in favour of adding it: the whole feature is
one `switch` arm over a structure that already exists, the report is precisely
the kind of artifact P20 wants machine-readable, and it is additive surface that
nothing else has to know about. The default stays zero-config and human-first.

**GVP:** **personal:P20** and **personal:P19** for having it,
**code-common:CP5** (configuration early, sensible defaults always) and
**personal:V4** (options with the user deciding) for the shape,
**code-common:CP11** (additive surface, not a changed default). Weighed against
**personal:V1** and judged to earn its place.

## No `--recursive`, `--extension` or case-insensitivity flags

**Chose:** `.csv` is a named constant, not an option. Non-recursive, exact-case,
no flags.

**Why:** these are speculative — no stated use case. The deferral tree says
speculative with no concrete use case means defer entirely, with no flex points.
The constant keeps the value out of the control flow so adding the flag later is
a small, local change.

**GVP:** **code-common:CH2** (deferral decision tree), **code-common:CP9**
(named constants), **code-common:CP11** (API surface is a commitment).

Exact-case matching is the third judgment call: `*.csv` in the requirements reads
as the shell glob, which is case-sensitive, and matching `DATA.CSV` as well would
be inventing scope. Documented in the README so the behaviour is not a surprise.

## Records are produced lazily

**Chose:** `readCsvRecords` is a generator; `measureCsvFile` pulls the header,
then counts the rest without retaining any of it.

**Why:** counting needs one record at a time, so holding a parsed table would be
memory spent for nothing. It also keeps the parse boundary honest: the reader
takes text and emits records, which is the simplest thing that serves both the
counting path and the tests. The file is still read whole — the remaining limit
is how bytes arrive, not how they are parsed, which is stated in the README
rather than solved speculatively.

**GVP:** **personal:V1**, **code-common:CP6**, **code-common:CH2** (the
streaming-reader change is deferred, with the seam already in the right place).

## Filenames sort by code unit, not by locale

**Chose:** a plain `<` comparison instead of `localeCompare`.

**Why:** `localeCompare` makes the report depend on the host's locale, so the
same directory could produce different output on two machines and the ordering
test would be unreliable. Deterministic beats linguistically nice for a report
that scripts and tests read.

**GVP:** **code-common:CP13** (testability is a design constraint),
**code-common:CP2** (obvious behaviour).

## Symlinked CSV files are followed; broken ones are reported as failures

**Chose:** `isFile()` entries are measured, symlinks are `stat`ed and measured
if they resolve to a file, and a broken `*.csv` symlink stays in the report as a
failure. Directories — including one named `foo.csv` — are skipped.

**Why:** each entry type has a defined outcome rather than an accidental one. A
directory is not a file, so it is not a record; a broken link is an entry that
looks like a CSV file and cannot be read, which is exactly the reportable
failure case. Had it been skipped silently, a missing file would vanish from the
report.

**GVP:** **code-common:CP12**, **personal:R2** (failures surfaced, not
swallowed).

## Files are read one after another

**Chose:** sequential reads, no concurrency limit to tune.

**Why:** no stated performance requirement, and concurrency would add a pool
size, an ordering concern and a harder-to-read loop for a tool that prints a
handful of lines. Sorting is explicit afterwards, so order does not depend on
scheduling either way.

**GVP:** **personal:V1** (complexity must earn its place), **code-common:CH2**.

## Unit tests and an end-to-end test of the documented invocation

**Chose:** `test/csv.test.ts`, `test/tally.test.ts` and `test/cli.test.ts` run
in-process; `test/e2e.test.ts` spawns the real `npx tsx src/index.ts` against
`examples/` and asserts stdout and the process exit code.

**Why:** the in-process tests pin behaviour cheaply but cannot catch a broken
entry point — module resolution under the `tsx` loader, the `.ts` import
specifiers, the shebang, the real exit code. The documented command is what a
user runs, so that is what gets verified. Each requirement in `TASK.md` has a
test that names it (ragged rows, quoted commas, non-CSV files left alone,
ordering, failure not stopping the run, the summary, the empty directory).

**GVP:** **code-testing:TP1** (unit *and* end-to-end), **personal:P13** (verify
in the production runtime, not just the test harness), **personal:R1** (verify
before claiming correctness).

## A committed `examples/` directory

**Chose:** three CSV files plus a non-CSV file, used by the e2e test and by the
README.

**Why:** it makes the README's sample output real rather than imagined, and
gives anyone — person or agent — a one-command way to exercise the tool fully,
including a failing file. It is also why the e2e assertions can be exact.

**GVP:** **code-testing:TP3** (agents must be able to fully exercise the
implementation), **ai-common:P2** (curate the working tree for legibility).

## Test scratch files live under the project

**Chose:** `test/.scratch/`, created and removed per test, rather than
`os.tmpdir()`.

**Why:** tests need real files on disk — permissions, symlinks, invalid bytes —
but a test run should not read or write outside the repository, both because the
task says not to and because a stray scratch directory in `/tmp` is the kind of
accident worth designing out. A crashed run also leaves its evidence somewhere
findable.

**GVP:** **ai-common:P5** (size limits to accidents, not adversaries),
**ai-common:P2**.

## Strict TypeScript, with `npm run check` as the gate

**Chose:** `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
`verbatimModuleSyntax`; `npm run check` runs `tsc --noEmit` then the suite.
`charAt` is used in the parser so indexing never produces `string | undefined`
to paper over.

**Why:** types catch the mistakes this code is most prone to (an off-by-one in
the state machine, a missed union case) at check time. The gate is one command,
so the right thing is the easy thing.

**GVP:** **code-common:CP7** (strict typing), **code-common:CP10** (prefer
validators over convention), **personal:P7** (every process needs a concrete
enforcement mechanism), **personal:P18** (a gate should be friction-neutral).

**Known gap, stated rather than papered over:** CP10 wants this encoded as a
pre-commit or CI hook, not a documented command. This directory is not a git
repository, so there is nothing to hook. `npm run check` is the mechanism
available; wiring it to `pre-commit` is the first thing to do if this is ever
put under version control. **personal:V2**.

## Names and comments

**Chose:** names that say what a thing does (`readCsvRecords`,
`measureCsvFile`, `lineTerminatorLengthAt`, `reportedCount`), and comments that
explain why a rule exists — the record-boundary rules, why decoding is fatal,
why `localeCompare` is avoided — never what the line does.

**Why:** the parser's state machine is the one place here where the reasoning is
not visible in the code, so that is where the comments are.

**GVP:** **code-common:CP2** (clarity over cleverness; comments explain why),
**code-common:CP8** (names describe purpose, not lineage).

## Verification

`npm run check`: `tsc --noEmit` passes, 41 tests pass across 5 suites. The
documented invocation was also run by hand against `examples/` in text and JSON
form, with `--help` and with a missing directory, and the exit codes were
confirmed to be 1, 1, 0 and 2 respectively (**personal:R1**, **personal:P13**).
