# Decisions

One section per design choice, with the element of the project's GVP library
that informed it where one did. Queried via
`cairn --library ./.gvp/library`.

Where the task's requirements already fixed an answer (TypeScript on Node, one
line per file, a summary line) there was no decision to record; what follows is
the set of places where the requirements left room.

---

## No runtime dependencies; the CSV reader is written here

**Chose:** a hand-written reader in `src/csv.ts` (130 lines, around 90 of them
code) instead of
`csv-parse`, `papaparse` or similar. `tsx` and `typescript` are dev
dependencies; nothing is required at runtime.

**Why:** the useful surface is a field splitter that understands quoting — well
under the threshold at which a dependency pays for itself. Owning it means the
dialect this tool accepts is stated in one readable place and pinned by tests,
rather than inherited from a library's option matrix and its defaults. Argument
parsing likewise uses `node:util`'s `parseArgs` rather than a CLI framework.

**GVP:** `code-common:CH1` (dependency adoption threshold — under ~200 useful
lines, write it yourself), supported by `personal:V1`.

---

## Four modules split by responsibility, not by convenience

**Chose:** `csv.ts` (text → rows), `tally.ts` (filesystem → counts),
`report.ts` (counts → text or JSON), `errors.ts` (thrown value → one line),
`index.ts` (arguments, streams, exit code).

**Why:** each boundary is a real change of subject matter and each piece is
testable alone — the parser against strings, the walk against fixture
directories, the renderings against fixed expected output. The alternative,
a single file, would have forced every test to go through a child process.
These are not speculative seams: all four already have a consumer.

**GVP:** `code-common:CP13` (testability is a design constraint),
`personal:H1` (extract when the boundary is clean and natural — these were),
`personal:P3` (separate what from how), and `code-common:CP1` — adding a third
output format touches one file, adding a dialect option touches one file.

---

## `errors.ts` exists because two callers needed the same description

**Chose:** extract `describeError` once the file loop and the CLI both needed
to turn a thrown value into one line of report text.

**Why:** the logic is not obvious — a parse error is already written for the
report and is used verbatim, while Node's fs errors append the absolute path
they were given, which both callers already know and the reader does not need.
Having that in two places would let the two drift.

**GVP:** `code-common:CP4` (centralize shared logic), `personal:V3`.

---

## A failing file is a record in the report, not an exception

**Chose:** `tallyCsvFile` never throws; it returns either a tally or a failure
record carrying a reason. `tallyDirectory` throws only when the directory
itself cannot be listed.

**Why:** requirement 5 wants the run to continue, and there are two genuinely
different states here: "this file is unusable" is part of the report, while
"I was pointed at something that is not a listable directory" means there is no
report to produce. Making them different types rather than different catch
blocks means the caller cannot confuse them.

**GVP:** `code-common:CP12` (always know what state you are in; ask per failure
whether to recover or stop, rather than applying one blanket strategy),
`personal:R2` (failures surfaced, never swallowed).

---

## Three exit codes: 0, 1, 2

**Chose:** `0` all files counted; `1` report complete but at least one file
failed; `2` could not run at all.

**Why:** the per-file failure count is already on stdout, but a caller in a
shell pipeline reads status before it reads text. Distinguishing 1 from 2
matters because they call for different responses: fix a file, versus fix the
command. The codes are named constants in `src/index.ts` and documented in
`--help` and the README.

**GVP:** `personal:P19` (low-effort, high-information signals),
`personal:P20` (machine-consumable where it is easy), `code-common:CP9`
(named constants for anything configurable).

---

## The whole report goes to stdout; stderr carries only run-level errors

**Chose:** `FAILED` lines sit in the report on stdout in filename order.
Only usage errors and an unlistable directory go to stderr.

**Why:** requirement 4 asks for one line per file in filename order, and
splitting the report across two streams would break that order
non-deterministically when both are a terminal, and break it entirely when one
is redirected. Failure lines are part of the report; a broken invocation is
not.

**GVP:** `personal:P20` (one parseable stream), `code-common:CP12`.

---

## A `--format json` option, in addition to the text report

**Chose:** implement both formats now, text by default.

**Why:** filenames can contain spaces, so the aligned text report is not safely
parseable by a script — a machine-readable form is the only way a caller can
consume this reliably, and over an already-structured record type it is a
`JSON.stringify` call. This is the one place where I added something the task
did not ask for, so to be explicit about the trade-off: it is in tension with
`personal:V1`, and I judged `personal:P20`'s "where it is easy" to be met,
since the renderer seam had to exist for the text format regardless.

**GVP:** `personal:P20` (prefer machine-consumable forms where easy),
`personal:P19`; tension with `personal:V1` recorded here per `personal:V2`.

---

## One `--format` flag with values, not a `--json` switch

**Chose:** `--format text|json`.

**Why:** a third format later adds a value to an existing flag rather than
another boolean switch that has to be documented as mutually exclusive with the
others. One flag also means one line of help output to read to find all the
formats.

**GVP:** `personal:P8` (consolidated interfaces over near-duplicate entry
points), `personal:H7`, `code-common:CP11` (public surface is a commitment —
additive growth over renames).

---

## Selection is by filename only; a directory named `*.csv` is reported as a failure

**Chose:** every entry whose name ends in `.csv` becomes a record. If reading
it fails because it is a directory, the record says
`FAILED  EISDIR: illegal operation on a directory`.

**Why:** the first design filtered entries by type, so a directory named
`data.csv` silently vanished — and a *symlink* to a directory did not, which
is exactly the kind of structural asymmetry worth removing rather than
documenting. Attempting everything that matches the name and reporting the
outcome is simpler (no `stat` call, no type predicate), treats every kind of
entry identically, and never drops something the user named without saying why.
Requirement 1's "files that are not `*.csv` are left alone" governs names, and
`data.csv/` matches the name.

**GVP:** `personal:R2` (no silent omission), `personal:P10` (structural
asymmetry is bias — check for it explicitly), `personal:V1`.

---

## `.csv` is matched case-insensitively

**Chose:** `UPPER.CSV` and `Mixed.Csv` are reported.

**Why:** genuinely ambiguous against requirement 1, which says `*.csv` — a
reading under which a case-sensitive filesystem's `DATA.CSV` is simply not a
match. The tie-break: the cost of being wrong is asymmetric. Matching too
widely reports a file the user may not have meant, visibly; matching too
narrowly omits a CSV file from a report that claims to cover the directory,
invisibly. The alternative is one `.toLowerCase()` away if it is wanted.

**GVP:** `personal:V5` (never silently discard user data) as the tie-break;
recorded as ambiguous rather than presented as obvious per `personal:V2`.

---

## An empty file is a failure, not "0 rows, 0 cols"

**Chose:** a file with no header row at all is reported
`FAILED  no header row: file is empty`.

**Why:** requirement 2 makes the first line the header, and requirement 3 asks
for the column count the header declares. A file with no header declares
nothing, which is not the same as declaring zero. Printing `0 cols` would be a
guess formatted as a measurement. A header-only file is a different case and is
a success with `0 rows`.

**GVP:** `personal:R2`, `personal:V2` (never present a clean facade over an
unclear state).

---

## Parsing is strict about quoting and lenient about everything else

**Chose:** exactly two conditions make a file a failure — a quoted field that
is never closed, and stray text between a closing quote and the next separator.
Field-count disagreement is not one of them.

**Why:** requirement 6 settles ragged rows: they are data. The two rejected
cases are different in kind — when quoting is broken the field boundaries are
unknowable, so every count downstream would be invented. Guessing would be the
one failure mode the user cannot see. The error names the line the quote opened
on, since that is the line that has to be fixed.

**GVP:** `personal:R2` (surface it, do not swallow it), `personal:V2`.

---

## Ragged rows are counted, and surfaced in the JSON output only

**Chose:** `raggedRows` is in the record type and the JSON output; the text
report does not show it.

**Why:** the number is computed anyway while counting rows, so reporting it
costs nothing, and "this file has 4 rows that do not match its header" is the
most useful thing the tool knows beyond the counts it was asked for. It stays
out of the text report because requirement 4 asks for one line per file and
that line should stay scannable.

**GVP:** `personal:P19` (implement low-effort, high-information signals even
when their use is not yet certain), `personal:P20`, `ai-common:C6` (large or
noisy output is not read).

---

## Filename order means code-unit order, not locale collation

**Chose:** an explicit `<`/`>` comparator rather than `localeCompare`.

**Why:** `localeCompare` makes the output depend on an environment variable, so
the same directory could produce two different reports on two machines and a
test could pass only where it was written. An ordering a reader cannot predict
from the filenames is worse than a blunt one.

**GVP:** `code-common:CP3` (explicit over implicit — no hidden dependency on
ambient state).

---

## Files are read whole and one at a time

**Chose:** `readFile` per file, in sequence, rather than a streaming read or a
concurrent fan-out.

**Why:** the reader is a generator, so counting already streams — rows are
discarded as they are counted, and nothing holds the parsed table. That leaves
only the read itself, and replacing it would change one function. Sequential
reads keep one file handle open at a time, so a directory of ten thousand files
cannot exhaust the descriptor limit, and there is no concurrency limit to pick a
number for. The limitation is written down in the README rather than left to be
discovered.

**GVP:** `code-common:CH2` (needed for correctness → now; speculative → defer,
with the seam left where the change would land), `personal:V1`,
`personal:V2` for stating the limit.

---

## The dialect is named constants, not configuration

**Chose:** `DELIMITER`, `QUOTE` and the extension are named constants in one
place. No `--delimiter` flag.

**Why:** the tool is specified in terms of CSV, and there is no second dialect
in play, so a flag would be surface area committed to on a guess. Collecting
them as named constants in one place is the flex point without the feature: a
TSV mode becomes a parameter, not an excavation. This is the one point where I
did not follow `code-common:CP5`'s "wire up configuration from the start" to
the letter, which `code-common:CH2` resolves in favour of the flex point only.

**GVP:** `code-common:CP9` (named constants for everything configurable),
`code-common:CH2`, `code-common:CP11` (an unused flag is a commitment).

---

## Strict TypeScript, and one command that gates everything

**Chose:** `strict` plus `noUncheckedIndexedAccess`,
`exactOptionalPropertyTypes`, `noUnusedLocals` and friends; `npm run check`
runs typecheck then tests.

**Why:** `noUncheckedIndexedAccess` earned its place immediately — it forced
the parser to treat `text[index]` as possibly `undefined`, which is exactly the
end-of-input case, so the parser is written with `undefined` as a meaningful
"EOF" value and needs no non-null assertions. File records are a discriminated
union on `status`, so neither renderer can read `dataRows` off a failure.
`npm run check` exists so there is a single thing for a pre-commit hook or CI
job to call.

**GVP:** `code-common:CP7` (strict typing), `code-common:CP10` (prefer hooks,
CI and validators over convention), `personal:R1` (typecheck and tests must
pass before claiming correctness). Note for honesty: no hook or CI workflow is
installed, because this directory is not a repository — `npm run check` is the
entry point one would call.

---

## Fixture directories are built in code, under the project

**Chose:** tests construct their input directories at run time beneath
`.test-tmp/` and remove them afterwards, instead of committing sample CSV files
or using the system temp directory.

**Why:** each test's input sits next to its assertion, so there is no committed
sample that can drift out of step with what a test believes it contains. It
also keeps every file the test run touches inside this directory. Awkward cases
that cannot be committed at all — a broken symlink, a file with no permission
bits — are then available on the same footing as the ordinary ones.

**GVP:** `ai-common:P2` (curate the working tree; stale artifacts mislead
future readers), `code-common:CP13`.

---

## The end-to-end tests spawn the documented command

**Chose:** `cli.test.ts` runs `npx tsx src/index.ts` in a child process and
asserts on stdout, stderr and exit status; the faster in-process call of `run()`
is not used.

**Why:** what those tests exist to check — which stream output lands on, what
the exit code is, that `tsx` resolves the `.ts` import extensions at all — is
precisely what an in-process harness would fake. The permission-denied test
skips with a stated reason when running as root rather than asserting something
that is not true in that environment.

**GVP:** `personal:P13` (verify in the production runtime, not just the test
harness), `code-testing:TP1` (unit *and* end-to-end), `code-testing:TP3`,
`personal:V2` for the explicit skip.

---

## `process.exitCode`, not `process.exit()`

**Chose:** `run()` returns a status that is assigned to `process.exitCode`.

**Why:** `process.exit()` can terminate before a piped stdout has flushed, so
`tally dir | head` could lose the report's tail while still reporting success.
Returning the status also means `run()` is callable and assertable directly.

**GVP:** `personal:R2` (no silent data loss — a truncated report is exactly
that).

---

## Pluralisation in the summary but not in the per-file columns

**Chose:** `1 file reported, 0 failed`, but `1 rows  3 cols`.

**Why:** the summary is a sentence and reads wrong unpluralised. The per-file
lines are a table, where `rows` and `cols` are fixed unit labels; pluralising
them would make the unit column ragged for the sake of grammar in a place
nobody reads as prose.

**GVP:** `code-common:CP2` (clarity over cleverness) — and noted here because
the inconsistency is deliberate rather than an oversight.

---

## What was left out

**Chose:** no recursion into subdirectories, no glob patterns, no
`--delimiter`, no `--version`, no colour, no progress output.

**Why:** requirement 1 says "directly under `<dir>`", and none of the rest has
a use case in front of it. Each would be a public surface committed to on
speculation. They are listed here, and the relevant ones in the README's
limitations, so that the absence reads as a decision rather than an omission.

**GVP:** `code-common:CH2` (speculative with no concrete use case: defer
entirely, no flex points), `code-common:CP11`, `personal:V1`.
