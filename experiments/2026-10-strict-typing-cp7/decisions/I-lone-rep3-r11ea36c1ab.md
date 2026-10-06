# Design decisions

One section per choice: what was chosen, why, and which element of the project's
GVP library (`./.gvp/library`) informed it. "No GVP element" means the choice
followed from `TASK.md` or ordinary judgement rather than from the library.

---

## 1. No runtime dependencies; the CSV scanner is hand-written

**Chose.** No runtime dependencies at all. The scanner state machine is 92 lines
(`src/csv.ts` is 197 including comments and the measuring helpers above it). Dev
dependencies are only `tsx`, `typescript` and `@types/node`.

**Why.** Requirement 7 (quoted fields may contain commas) is the only reason this
tool needs real CSV parsing, and the part of a parsing library it would use —
splitting rows into fields — is well under the threshold where adopting a
dependency pays for itself. Writing it also made the failure semantics in §6
something I could define rather than inherit.

**GVP.** `code-common:CH1` (dependency adoption threshold: if the useful portion
of a library is ~200 lines or fewer, write it yourself). Argument parsing went to
the built-in `node:util` `parseArgs` for the same reason.

---

## 2. Files are streamed, not read whole

**Chose.** Each file is read through `createReadStream` and fed to the scanner in
chunks. Memory stays flat regardless of file size.

**Why.** The simplest thing would have been `readFile` plus a parse of the whole
string, and nothing in `TASK.md` asks for large-file support. But the scanner had
to be a character state machine either way, and a state machine that accepts
chunks is a handful of lines more than one that accepts a single string — while
retrofitting streaming later would mean reshaping the parser and every consumer.
A tool that reports on a directory of data files is a plausible place to meet a
file bigger than memory, so this is a known need, not a speculative one.

**GVP.** `personal:H3` (build now when a known future need has clear cost
asymmetry — minor to build now, clearly greater to retrofit). `code-common:CH2`
would have had me defer this as an additive feature; H3 is the stated complement
for exactly this cost shape, and the asymmetry here is clear.

**Verified.** A 219 MB, 4,000,000-row file counted correctly with a peak RSS of
97 MB against an 84 MB floor for an empty run — about 14 MB for a file 15 times
that size (`personal:P2`, `personal:R1`).

---

## 3. The scanner reports field counts, not field values

**Chose.** `createRowScanner` emits one number per row — how many fields it had.
Field text is never assembled or retained.

**Why.** Counting rows and columns never needs the values. Collecting them would
be work and memory spent on nothing, and a full-value parser is a materially
larger thing to get right and to test. It also undercuts §2: holding row values
would reintroduce the memory ceiling that streaming removed.

**GVP.** `personal:V1` (simplicity — the simplest approach that meets the
requirement) and `code-common:CH2` (a feature with no concrete use case is
deferred entirely).

---

## 4. The push/finish protocol is wrapped so no caller can forget `finish()`

**Chose.** Three layers in `src/csv.ts`: `createRowScanner` (incremental, chunk
in → row counts out), `rowFieldCounts` (async generator over any chunk source),
and `measureCsv` (`{ dataRows, columns }`). Callers use the highest one that fits.

**Why.** The scanner's contract has a trap: the final row is only released by
`finish()`, so a caller who loops over `push()` alone silently under-counts by one
row. Wrapping that sequence once means no consumer can get it wrong, and the
`countable` part of the logic — "first row is the header, the rest are data" —
lives in one place rather than at each call site.

**GVP.** `code-common:CP4` (centralize shared logic — duplicated setup/teardown
leads to inconsistent behaviour) and `code-common:CP6` (proactive reusability
through small composable functions).

---

## 5. Four modules split by concern

**Chose.** `src/csv.ts` (CSV semantics), `src/tally.ts` (directory semantics),
`src/report.ts` (rendering), `src/index.ts` (CLI). No module knows about the one
above it.

**Why.** Each requirement in `TASK.md` lands in exactly one of them: the quoting
rules are entirely in `csv.ts`, "one line per file in filename order" entirely in
`tally.ts` and `report.ts`. Changing the output format does not touch parsing;
adding a format does not touch the directory walk.

**GVP.** `code-common:CP1` (one contiguous block — a change should not require
finding scattered pieces) and `personal:P3` (separate what from how at every
layer).

---

## 6. "Cannot be read as CSV" is defined narrowly: only broken quote structure

**Chose.** Exactly three conditions make a file a parse failure:

1. a quoted field that is never closed;
2. a character between a closing quote and the next separator, row break or EOF;
3. an empty file (§7).

Everything else parses. A ragged row is fine (requirement 6). A quote part-way
into an unquoted field — `12" pipe` — is literal content, not an error.

**Why.** Requirements 5 and 6 pull in opposite directions: one wants broken files
flagged, the other insists odd row shapes are not broken. The line that satisfies
both is *structural*: if the quoting leaves the parser unable to say where fields
end, the file genuinely cannot be read and claiming a row count for it would be a
fabrication. If the quoting is unambiguous and only the row widths are strange,
there is a real answer and the file is a success. Being tolerant where the input
is merely unusual keeps the tool from failing files it could have reported;
being strict where the structure collapses keeps it from inventing numbers.

**GVP.** `personal:R2` (failures must be surfaced, not swallowed) and
`code-common:CP12` (always know what state you are in; for each failure ask what
the consequence is and whether the user needs to know — rather than applying
"fail fast" or "tolerate everything" as dogma).

---

## 7. An empty file is a failure, not "0 rows, 0 columns"

**Chose.** A zero-byte file (or one containing only a byte-order mark) is
reported as `failed: no header row: the file is empty`.

**Why.** Requirement 2 makes the first line the header. A file with no first line
declares no header, so there is no column count to report. Printing
`0 rows, 0 columns` would read as a successfully measured file and would state a
column count the file never gave — the user cannot tell that apart from a real
header of zero columns. A header-only file *is* a success at `0 rows`, because
there the header exists and the row count is genuinely zero.

**GVP.** `personal:R2` (no silent failures) and `personal:V5` (never silently
discard or strand data — here, the fact that the file was unusable).

---

## 8. Blank lines count as data rows; the final line break does not

**Chose.** A trailing line break at EOF does not produce an extra row. A blank
line anywhere else is a data row (one empty field).

**Why.** Almost every CSV file ends with a line break, and treating it as a row
terminator rather than an empty row is what every reader expects — the alternative
would add a phantom row to nearly every file. A blank line in the middle is
different: it is a line the file contains, and requirement 6 already establishes
that a row of the "wrong" width is still counted. Skipping it would quietly
under-report.

**GVP.** `personal:R2` (data must not be silently lost) and `personal:V5` (data
preservation).

---

## 9. `\n`, `\r\n` and a lone `\r` all end a row

**Chose.** One uniform rule for row breaks, with CRLF coalesced into a single
break.

**Why.** CRLF has to be handled or every column count on a Windows-authored file
is polluted. Once the parser is tracking a pending `\r`, treating a lone `\r` as
a break too costs nothing and handles legacy files. The alternative — a lone `\r`
is field content — needs a special case for a `\r` at EOF to avoid a bizarre
parse failure, and the uniform rule has no special cases.

**Trade-off, stated rather than hidden.** A bare `\r` inside an unquoted field
would be read as a row break and would split that row in two. That input is
pathological, and by requirement 6 the result is extra ragged rows that are still
counted and still a success — not a failure and not a dropped row. A `\r` inside
a *quoted* field is content, which is the case that occurs in practice.

**GVP.** `personal:V1` (fewer assumptions, fewer moving parts) and `personal:V2`
(document trade-offs explicitly rather than presenting a clean facade).

---

## 10. A leading byte-order mark is stripped

**Chose.** A `U+FEFF` at the very start of a file is discarded before parsing.

**Why.** A BOM is an encoding artefact, not field content. Spreadsheet exports
add one routinely. Left in place it sits in front of the first field's opening
quote, so the parser would not see that field as quoted — turning a valid file
into either a wrong column count or a spurious "unexpected character after
closing quote" failure.

**GVP.** `code-common:CP12` (never wander into an unexpected bad state).

---

## 11. An unexpected error crashes the run instead of being blamed on a file

**Chose.** `tallyFile` catches only what a file can legitimately fail with — a
`CsvFormatError` or a filesystem error carrying a `code`. Anything else is
rethrown.

**Why.** Requirement 5 says a file that cannot be read as CSV must not stop the
run, and that is honoured. But a `TypeError` from a bug in this tool is not a
property of the file, and reporting it as `broken.csv failed: ...` would pin a
defect in `tally` on the user's data and bury it behind a plausible-looking
report. A blanket `catch` would make every future bug in the scanner look like a
bad CSV file.

**GVP.** `code-common:CP12` (never wander into an unexpected bad state) and
`personal:R2` (bugs compound — do not greenlight failing states).

---

## 12. `.csv` is matched case-sensitively

**Chose.** `DATA.CSV` is not picked up. The rule is one exported constant,
`CSV_EXTENSION`, with the reading noted at its definition.

**Why.** Requirement 1 says `*.csv`, which is a shell glob, and a shell glob is
case-sensitive on POSIX. A case-insensitive match would include files the literal
spec excludes. I can argue the other reading — someone with `DATA.CSV` probably
wants it counted — but confirming which is wanted costs more than the change
would: it is a single constant and one test, so the cheaper move is to follow the
spec literally and keep the reversal trivial.

**GVP.** `personal:H8` (buy reversibility when it costs less than proof — record
that the validation was priced and declined) and `code-common:CP9` (named
constants for anything that might be adjusted). This decision is the record H8
asks for; the trigger for revisiting it is a user reporting a missed `.CSV` file.

---

## 13. Symlinks are included without being resolved first

**Chose.** Directory entries that are regular files *or* symlinks are kept. A
symlink that does not resolve to a readable file surfaces as that file's failure
(`cannot read file: it no longer exists`).

**Why.** Pre-resolving would mean a dangling `link.csv` either vanishes from the
report or needs a second code path to explain itself. Letting the read attempt
fail puts it in the report as a named failure, which is the behaviour requirement
5 already specifies. A directory whose name ends in `.csv` is excluded, because
it is not a file.

**GVP.** `personal:R2` (failures surfaced, not swallowed — a silent skip is a
swallowed failure) and `code-common:CP12` (prefer explicit handling with clear
messages over blanket strategies).

---

## 14. Files are read one at a time

**Chose.** Sequential reads, not a concurrent fan-out.

**Why.** The report is sorted by filename regardless of completion order, so
concurrency would buy only wall-clock time — and it would need a concurrency cap
to avoid exhausting file descriptors on a large directory. No requirement asks
for throughput.

**GVP.** `personal:V1` (complexity must earn its place) and `code-common:CH2`
(speculative, no concrete use case → defer entirely). Note this is a deliberate
deferral, not an oversight: the per-file work is already isolated in `tallyFile`,
so the loop is where concurrency would be added.

---

## 15. Sorting is by code unit, not by locale

**Chose.** A plain code-unit comparison, so `Bravo.csv` precedes `alpha.csv`.

**Why.** `localeCompare` would make the output depend on the machine's locale:
the same directory would produce different orders on different machines, which
breaks both reproducibility and the ability to diff two runs. "Filename order"
without a stated collation is best read as the deterministic one.

**GVP.** `code-common:CP3` (explicit over implicit; its stated anti-pattern is a
function that secretly depends on global state without declaring it, and the
machine's locale is exactly that) and `personal:V2` (predictable behaviour).

---

## 16. One command, a `--format json` option, and a delimiter seam with no flag

**Chose.** A single entry point, `tally <dir>`, with `--format text|json`.
`--recursive`, `--delimiter` and similar were not added, but the scanner accepts
a `delimiter` option internally that nothing surfaces yet.

**Why.** Three separate pulls resolve here.

- *One command with an option, not several commands.* The task is one job; a
  second subcommand would add a help page to read without adding capability.
- *JSON is worth having now.* The per-file records already exist as plain
  objects, so the JSON formatter is a dozen lines, and the padded text report is
  pleasant to read but awkward to parse. An unparseable-by-default report is a
  signal thrown away for no saving.
- *A delimiter flag is not worth having now.* Nothing asks for TSV. But the
  parser had to take the delimiter from *somewhere*, so it takes it as an option
  with a default — the flex point exists, the feature does not.

**GVP.** `personal:P8` and `personal:H7` (consolidated interfaces; weigh by how
many times someone must consult help output for one task) for the single command;
`personal:P20` (prefer machine-consumable forms where easy) and `personal:P19`
(low-effort, high-information signals) for the JSON format; `code-common:CH2`
(additive feature with unknown access patterns → add the flex point, not the
feature) for the delimiter.

---

## 17. Four exit codes: 0, 1, 2, 70

**Chose.** `0` everything reported, `1` a report was produced but something in it
failed, `2` no report at all (bad arguments, unusable directory), `70` a bug in
`tally` (§11), with the error and its stack on stderr. Named in an `ExitCode`
constant.

**Why.** "Some files failed" and "I could not even start" are different outcomes
and a script needs to tell them apart — collapsing both to `1` would make a typo
in the directory name indistinguishable from one corrupt file. Requirement 8
already makes the failure count part of the output; the exit code makes it
available without parsing. `70` exists for the same reason: §11 lets an internal
bug crash the run, and Node's default for an unhandled rejection is `1`, which
would have made a crash with no report look exactly like a successful report
containing one bad file. `70` is `EX_SOFTWARE` from sysexits, where "an internal
software error has been detected" is its stated meaning.

**GVP.** `personal:P20` (machine-consumable signals), `code-common:CP12` (know
what state you are in and report it) and `code-common:CP9` (named constants).

---

## 18. Per-file failures go to stdout; only whole-run errors go to stderr

**Chose.** A failed file is a line in the report on stdout. Argument errors and
directory errors go to stderr, and in that case stdout is empty.

**Why.** Requirement 5 makes a failure a *reported record* — it is part of the
report, in filename order, and counted in the summary, so splitting it onto
stderr would break ordering and leave a gap in the stdout report. Whole-run
errors are the opposite: there is no report, so nothing belongs on stdout, and a
caller redirecting stdout to a file should get an empty file rather than an error
message mixed into its data.

**GVP.** `personal:R2` (failures must be surfaced) and `personal:V2`
(transparency). The split itself follows from requirement 5.

---

## 19. `process.exitCode` is set rather than calling `process.exit`

**Chose.** The CLI assigns `process.exitCode` and lets the process end on its own.

**Why.** `process.exit` terminates immediately, and when stdout is a pipe —
`tally data | less`, or the end-to-end tests — a large report can still be
buffered. The report would be truncated, silently, and only for piped output,
which is the worst possible shape for that bug. Setting `exitCode` lets stdout
drain first.

**GVP.** `personal:R2` (data must not be silently lost — a truncated report is
lost output).

---

## 20. The text report has no column headings

**Chose.** The output is exactly N file lines plus one summary line.

**Why.** Requirement 9 says an empty directory produces *only* the summary line,
which rules out a heading row — it would be an extra line in precisely the case
the requirement pins down. Filenames are padded to a common width instead, which
gives the output a column structure without spending a line on labels.

**GVP.** No GVP element; this follows directly from requirement 9.

---

## 21. "Reported" in the summary counts failures too

**Chose.** `3 files reported, 1 failed` means three records in the report, one of
which failed — the counts overlap rather than partition.

**Why.** Requirement 8 asks for "how many files were reported and how many
failed", and requirement 5 says a failing file *is* reported, as a failure. So
every file in the report has been reported, and `failed` names a subset. The
other reading (reported = successes) would make the two numbers sum to the file
count, but it would also mean a failed file was both "reported as a failure" and
not counted as reported.

**GVP.** No GVP element; this is a reading of requirement 8, recorded because the
wording admits another one.

---

## 22. Tests at three levels, including the real command in a subprocess

**Chose.** 56 tests: unit tests over the scanner (`test/csv.test.ts`),
integration tests over real directories (`test/tally.test.ts`), and end-to-end
tests that spawn the actual CLI and assert on its stdout, stderr and exit code
(`test/cli.test.ts`). Runner is the built-in `node:test`.

**Why.** The library treats untested code as unfinished, and the three levels
catch different things: the unit tests pin quoting and row-break semantics, the
integration tests prove failure isolation across real files, and only the
end-to-end tests cover argument handling, exit codes and output formatting as a
user actually meets them. Every numbered requirement in `TASK.md` has at least
one test, including the ones easiest to leave implicit — requirement 6 (ragged
rows), 7 (quoted commas) and 9 (empty directory).

One unit test deserves calling out: it feeds each sample through the scanner at
*every* chunk size from 1 up and asserts the counts never change. That is the
property §2's streaming design could silently break — a quoted field split across
a chunk boundary — and it is not reachable from the CLI.

**GVP.** `code-testing:TP1` (tests for all code, unit and end-to-end; code
shipped without tests is unverified, not done), `code-testing:TP2` (the test is
the executable definition of success), `personal:P13` (verify in the production
runtime, not just the test harness — hence spawning the real command rather than
importing `main`) and `personal:R1` (verify before claiming correctness).

---

## 23. Test directories are built in code, not committed as fixtures

**Chose.** `test/helpers.ts` creates a temp directory per test and removes it
afterwards.

**Why.** Requirement 9 is about an empty directory, which no version-control
system can carry as a fixture. Building directories in the test also puts the
input next to the assertion instead of in a file the reader has to go find, and
leaves no stray artefacts behind.

**GVP.** `code-common:CP13` (testability is a design constraint — if something is
hard to test, make it testable rather than skipping the test) and `ai-common:P2`
(curate the working tree; remove stale artefacts).

---

## 24. `npm run check` is the single gate, and there is no hook to hang it on

**Chose.** One command runs the typecheck and then the tests. TypeScript is
configured strictly (`strict`, `noUncheckedIndexedAccess`,
`exactOptionalPropertyTypes`, `noFallthroughCasesInSwitch`).

**Why.** The right enforcement for "the typecheck and tests must pass" is a
pre-commit hook or a CI gate, not a line in a README asking people to remember.
`noFallthroughCasesInSwitch` in particular guards the scanner's state machine,
where a missing `break` would be a silent miscount.

**Stated plainly:** this project is not a git repository and has no CI, so there
is nothing to attach a hook to. `npm run check` is the mechanism available — one
command, so the right thing is also the easy thing — and `.github/workflows` or a
pre-commit hook is where it should be wired the moment there is a repository.

**GVP.** `code-common:CP10` (prefer hooks, CI and validators over convention —
a convention is a suggestion, a hook is a guarantee), `personal:P7` (every
process needs a concrete enforcement mechanism) and `personal:P18` (gates must
earn their friction; prefer the friction-reducing or friction-neutral kind).
`personal:V2` requires saying out loud that the hook does not exist here rather
than implying the gate is enforced.

---

## 25. Imports name `.ts` files; `package.json` claims no `bin`

**Chose.** Modules import `./csv.ts` and friends, with
`allowImportingTsExtensions` and `noEmit`. `package.json` has no `bin` entry.

**Why.** Nothing is compiled — `tsx` runs the TypeScript directly — so imports
name the files that exist on disk. The conventional alternative, importing
`./csv.js` from `csv.ts`, means every import in the project names a file that is
never built. A `bin` entry would be worse: it would advertise `tally` as an
installable command, but a `.ts` entry point is not executable without `tsx`
loaded, so the claim would not survive `npm install -g`. The `npm run tally`
script and the documented `npx tsx src/index.ts` are what actually work.

**GVP.** `code-common:CP2` (code should be obvious) for the extensions, and
`personal:V2` (never present a clean facade over something that does not hold)
for leaving `bin` out.

---

## 26. `<dir>` is required; there is no default of `.`

**Chose.** Running `tally` with no argument prints the usage and exits 2.

**Why.** `code-common:CP5` asks for sensible defaults so zero-config works, and I
considered defaulting to the current directory. But the directory is not
configuration — it is the subject of the command, and `TASK.md` writes it as
`tally <dir>`. A tool that reports on "wherever you happen to be standing" when
you forget an argument gives a confident answer about something you did not ask
about. The `--format` default (`text`) is the place CP5 applies.

**GVP.** `code-common:CP3` (explicit over implicit; make inputs obvious) over
`code-common:CP5`, which governs the `--format` default instead.

---

## Ambiguities resolved without asking

`personal:H5` treats "a decision that cannot be unambiguously derived from the
library" as the only real blocker, and asks for library patches rather than
go/no-go questions when one appears. Three readings in `TASK.md` were genuinely
open — what makes a file unreadable as CSV (§6), whether an empty file is a
failure (§7), and whether "reported" includes failures (§21). Each resolved to a
single answer under existing elements (`personal:R2`, `code-common:CP12`,
`personal:V5`) rather than needing a new one, so they are recorded here and the
work proceeded. No GVP patch is proposed.

The `.csv` case-sensitivity question (§12) is the one where I can still see a
defensible alternative. It is recorded under `personal:H8` as a judgement call
with the validation priced and declined, and isolated to one constant so
reversing it is a one-line change — which is what H8 asks for in place of proof.
