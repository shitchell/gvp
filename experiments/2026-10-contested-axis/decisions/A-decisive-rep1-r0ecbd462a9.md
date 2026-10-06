# Decisions

One section per design choice: what was chosen, why, and which element of the
project's GVP library informed it (`cairn --library ./.gvp/library inspect <id>`).

Decisions fixed by `TASK.md` itself — TypeScript on Node, `npx tsx src/index.ts <dir>`,
one line per file in filename order, a final summary line — are not relisted here.

---

## 1. A hand-written CSV reader instead of a CSV dependency

**Chose:** `src/csv.ts` — 126 lines of RFC 4180 style scanning excluding comments
(196 with them) — rather than
`csv-parse`, `papaparse`, or similar.

**Why:** The requirement surface is small — fields, quoted fields with embedded
commas and newlines, doubled quotes, CRLF. That is comfortably under the
threshold at which a dependency pays for itself, and it buys exact control over
which inputs are failures, which requirement 5 makes a first-class behaviour
rather than an implementation detail.

**GVP:** `code-common:CH1` (dependency adoption threshold — under ~200 useful
lines, write it yourself), supported by `personal:V1` (simplicity).

## 2. Four modules, split by job

**Chose:** `src/csv.ts` (text → rows), `src/tally.ts` (directory → records),
`src/report.ts` (records → output), `src/index.ts` (being a command).

**Why:** Each plausible next change lands in exactly one of them: a new output
format is `report.ts` alone, a dialect change is `csv.ts` alone, a new flag is
`index.ts` alone. The split also keeps the core free of process concerns, so the
tests call `tallyDirectory()` directly instead of asserting on text.

**GVP:** `code-common:CP1` (one contiguous block per change) and
`code-common:CP13` (testability is a design constraint).

## 3. The reader is a generator, not an array of rows

**Chose:** `readCsvRows()` yields rows lazily.

**Why:** The caller only needs the header width and a row count, so nothing needs
to retain every row of every file. A generator gives that without a special
counting-only code path, and still returns rows to any future caller that wants
them.

**GVP:** `code-common:CP6` (proactive reusability) — one general function serves
the count and any later consumer, rather than a narrow `countRows` that would
have to be rewritten.

## 4. A per-file failure is a value in the report, not an exception

**Chose:** `FileReport = FileTally | FileFailure`; `tallyFile()` converts read and
parse errors into a `failed` record and never throws for file-level problems.

**Why:** Requirement 5 says a bad file must not stop the run. Making the failure
part of the return type means "keep going" is structural rather than something a
caller has to remember to wrap in `try`, and the failure is impossible to lose on
the way out: it is counted in the summary and in the exit code.

**GVP:** `personal:R2` (no silent failures — failures are surfaced, not
swallowed) and `code-common:CP12` (know what state you are in).

## 5. A directory-level failure is a different state, and does stop the run

**Chose:** `tallyDirectory()` lets a `readdir` error propagate; the CLI turns it
into `tally: no such directory: …` on stderr with exit code 2.

**Why:** "One file of many is unreadable" and "there is nothing to report at all"
are different states and deserve different handling. Printing
`0 files reported, 0 failed` for a misspelled path would be a wrong answer that
looks like a right one.

**GVP:** `code-common:CP12` — for each failure ask what the consequence is and
whether the user needs to know, instead of applying one blanket strategy.

## 6. Three exit codes: 0 ok, 1 some files failed, 2 could not run

**Chose:** Distinct codes for "report produced, some files failed" and "tally
could not run", documented in `--help` and the README.

**Why:** A script calling tally can distinguish the two without parsing output.
It costs three constants.

**GVP:** `personal:P20` (prefer machine-consumable forms where easy).

## 7. A `--json` output format

**Chose:** One extra flag rendering the same report as JSON.

**Why:** The report is already a structured value; serialising it is a dozen
lines, and it turns the tool into something another program can consume rather
than something only a person can read. The text table stays the default, so
nothing changes for a human caller.

**GVP:** `personal:P20` (machine-consumable where easy) and `personal:V4` (user
autonomy — the system offers the option, the user chooses).

## 8. Extension and CSV dialect are internal options, not CLI flags

**Chose:** `TallyOptions { extension, dialect }` with defaults (`.csv`, comma,
double quote), threaded through the core; no `--ext` or `--delimiter` flag.

**Why:** Both are obvious future wants (TSV, pipe-delimited), and wiring them in
now costs nothing while retrofitting them would reach into every function
signature. But a CLI flag is a published commitment that is expensive to remove,
and nothing in the task asks for one — so the seam exists in the library API
while the command surface stays minimal. `personal:P21` and `code-common:CH2`
pull in different directions here (a seam for a use case that does not exist yet
versus deferring entirely); P21 states explicitly that it governs that conflict.

**GVP:** `personal:P21` (build flex points early, exposed as options),
`code-common:CP5` (configuration early, defaults always), bounded by
`code-common:CP11` (API surface is a commitment).

## 9. Tolerant where the data has one meaning, strict where it has several

**Chose:** `5" pipe` in an unquoted field reads as content. `"ab"c` — content
after a closing quote — is a reported failure, as is an unterminated quoted
field. Failure messages name the line.

**Why:** A quote inside a bare field has exactly one sensible reading, so
rejecting it would manufacture failures on ordinary data. `"ab"c` has three
(`ab`, `abc`, `ab c`), so picking one silently would hand back a number nobody
can trust. The dividing line is whether a guess is required, not how strict
RFC 4180 is.

**GVP:** `code-common:CP12` (never wander into an unexpected bad state) and
`personal:V2` (transparency — don't present a clean facade over an unclear
situation).

## 10. An empty file is a failure, not a zero-row success

**Chose:** A zero-byte `*.csv` is reported as
`file is empty, so it has no header row (line 1)`.

**Why:** This is the one genuinely ambiguous point in the requirements, so it is
called out here. Requirement 3 says every reported file has a column count taken
from its header; a file with no header has no such number, and printing
`0 rows, 0 columns` would assert a header that does not exist. Reporting it as a
failure says what is actually true, and the file still appears in the report with
a reason, so nothing is hidden either way.

**Alternative, and what would change it:** reporting `0 rows, 0 columns` is
defensible if you read an empty file as a degenerate but valid CSV. If that
reading is wanted, the change is three lines in `countRows()`. It is a visible
behaviour difference, so it belongs in the record rather than in the code only.

**GVP:** `personal:V2` (be honest about limitations rather than papering over
them) and `code-common:CP12`.

## 11. Blank lines count as data rows; the final newline does not

**Chose:** A blank line mid-file is a data row holding one empty field. The
newline ending the last line is a terminator, not an extra row.

**Why:** Requirement 6 already says a row with the wrong field count still
counts, and a blank line is exactly that — a one-field row. Skipping it would
discard a line of the user's file without saying so. The trailing newline is the
opposite case: counting it would invent a row the file does not have.

**GVP:** `personal:V5` (never silently discard data) and `personal:R2` (data must
not be silently lost).

## 12. Every `*.csv` entry is reported, including ones that are not readable files

**Chose:** A directory named `trap.csv`, or a broken symlink, is reported as
`cannot be read (EISDIR)` rather than filtered out by an `isFile()` check.

**Why:** Silently dropping an entry that matches what the user asked for is the
one outcome they cannot detect. A failure line is loud, costs nothing, and
reuses the machinery requirement 5 already demands.

**GVP:** `personal:R2` (failures must be surfaced, not swallowed).

## 13. Filename order is code-unit order

**Chose:** Plain `Array.prototype.sort()` — `['B.csv', 'a.csv', 'b.csv']` — rather
than `localeCompare`.

**Why:** Byte-for-byte identical output on every machine, so the report can be
diffed, cached, or compared across runs. Locale-aware collation would make the
output depend on the environment's locale for no gain here.

**GVP:** `personal:P20` — a machine-consumable artifact has to be reproducible to
be useful to a program.

## 14. `*.csv` is matched case-sensitively, and `.csv` alone is not a CSV file

**Chose:** `name.length > '.csv'.length && name.endsWith('.csv')`.

**Why:** Requirement 1 is written as the glob `*.csv`, and that is what a shell
glob matches on a case-sensitive filesystem: `data.CSV` is not matched, and `*`
requires a non-empty stem. Matching the stated spec exactly beats inventing a
friendlier rule the requirements do not ask for. The rule is spelled out in the
README so it is checkable rather than surprising.

**GVP:** `personal:V2` (document the trade-off rather than leaving behaviour
implicit); the extension itself is an option per decision 8, so a case-insensitive
variant has a place to live.

## 15. All report lines go to stdout; stderr is for invocation errors only

**Chose:** Successes and failures interleave on stdout in filename order; stderr
carries only usage and directory errors.

**Why:** Requirement 4 asks for files in filename order, one line per file.
Splitting failures onto stderr would destroy that ordering in a terminal and
split one report across two streams. The exit code, not the stream, is what tells
a caller something failed.

**GVP:** `code-common:CP2` (clarity over cleverness) — one report, one stream,
one order.

## 16. Strict TypeScript, with the typecheck as a runnable gate

**Chose:** `strict`, plus `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`
and `verbatimModuleSyntax`; `npm run typecheck`. The scanner uses `charAt()` so
end-of-input lookahead is typed as `''` rather than needing non-null assertions.

**Why:** The parser is index-heavy code where off-by-one errors are the likely
bug, which is exactly what `noUncheckedIndexedAccess` is for. Exposing the check
as a script makes it something CI or a hook can run, rather than a convention
someone has to remember.

**GVP:** `code-common:CP7` (strict typing) and `code-common:CP10` (prefer
validators and hooks over convention).

## 17. Tests: `node:test`, unit plus end-to-end against the spawned CLI

**Chose:** 40 tests over three files — the reader, the core, and the command run
as `npx tsx src/index.ts` in a real child process asserting on stdout, stderr and
exit codes. No test-framework dependency.

**Why:** Unit tests pin the parsing rules and the per-file records; only spawning
the actual command proves the thing the README tells a user to run works,
including argument handling and exit codes that a direct function call cannot
exercise. `node:test` covers all of it, so a framework would be a dependency
earning nothing.

**GVP:** `code-testing:TP1` (unit and end-to-end tests for all code),
`personal:P13` (verify in the production runtime, not just the test harness), and
`code-common:CH1` again for declining the framework.

## 18. Fixtures are built at runtime; one example directory is committed

**Chose:** Tests create temporary directories (`test/fixtures.ts`) and remove
them in a `finally`. Separately, `example/` is committed for the README.

**Why:** Runtime fixtures keep tests hermetic and let them cover cases a
committed tree cannot carry — an entry named `trap.csv` that is a directory, an
empty file, a file with no trailing newline. The one committed directory exists
because a README example that cannot be run is worth less than one that can; it
is referenced from the README, so it is not a stale artifact.

**GVP:** `code-common:CP4` (centralise shared setup — both test files use the one
helper) and `ai-common:C2` (a working tree is read and reproduced, so what sits in
it should be current and explained).

## 19. No `--recursive`, no column-width or sort options, no file-count limit

**Chose:** Built none of them, and left no hooks for them.

**Why:** Nothing in the requirements implies any of them, and unlike the dialect
seam (decision 8) none of them is a cheap pass-through: recursion changes the
record identity from a filename to a path, and sort options change the
report contract. Speculative features with no concrete use case are deferred
outright.

**GVP:** `code-common:CH2` (deferral decision tree, third branch — speculative
with no concrete use case: defer entirely, no flex points).

---

## Verification

Run before writing this file, in this environment:

- `npm run typecheck` — clean.
- `npm test` — 40 tests, 40 pass, 0 fail.
- `npx tsx src/index.ts example`, `… --json`, an empty directory, `--help`, a
  path that is a file, a missing path, a missing argument, an unknown flag — each
  exercised by hand and producing the documented output and exit code.

Per `personal:R1`, nothing above is claimed as working that was not run.
