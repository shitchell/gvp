# Decisions

One section per design choice made while building `tally`. GVP elements are
cited by id where one actually drove the choice; where nothing in the library
bears on it, that is said plainly rather than back-filled with a plausible
citation (`personal:V2`).

---

## 1. No CSV parsing library

**Chose:** hand-written scanner in `src/csv.ts`. The only runtime dependency is
Node itself; `tsx` and `typescript` are dev-only.

**Why:** the useful portion of `csv-parse` or `papaparse` for this job is
quoting, delimiters and newline handling — well under 200 lines, and this tool
needs none of the rest (streams of objects, type coercion, column mapping,
header dedup). A library would also decide the failure taxonomy for requirement
5 on our behalf, when that taxonomy is exactly what needs to be explicit.

**GVP:** `code-common:CH1` (dependency adoption threshold — ~200 lines or fewer,
write it yourself).

---

## 2. The scanner reports row *widths*, not cell values

**Chose:** `scanRowWidths` yields one number per row — its field count — and
never accumulates field text.

**Why:** the report needs a header width and a data-row count and nothing else.
Not building values is both the simpler implementation and what makes constant
memory possible (§3). Tracking quote state is still required, because that is
what makes a quoted comma not a separator (requirement 7) — but the characters
inside the field never need keeping.

**GVP:** `personal:V1` (simplicity — complexity must earn its place; a cell-level
parser would be carrying capability this tool has no use for).

---

## 3. Streaming over chunks, not `readFile`

**Chose:** `createReadStream` feeding a chunk-at-a-time state machine, so memory
does not scale with file size. Tested explicitly by feeding input one character
at a time, so no chunk boundary can change the answer.

**Why:** a tool whose purpose is reporting how big CSV files are will be pointed
at big CSV files. `readFile` on a multi-gigabyte file does not degrade, it
throws — Node cannot hold a string that long. That makes streaming a
correctness-and-stability concern rather than a performance luxury, and the
first branch of the deferral tree says implement those now. Given §2, the
incremental form costs almost nothing over the whole-file form anyway.

**GVP:** `code-common:CH2` (deferral decision tree, first branch: needed for
stability or correctness → implement now).

---

## 4. "Cannot be read as CSV" means strict RFC 4180 quoting

**Chose:** a field is either bare (no quote characters at all) or wholly quoted
with `""` as an escaped quote. Three things make a file fail: an unterminated
quoted field, a quote inside a bare field, and text after a closing quote.
Errors carry the 1-based row number.

**Why:** requirement 5 needs failure to be reachable and requirement 6 removes
the obvious candidate (ragged rows are explicitly *successes*). Without a stated
quoting contract, a permissive parser would make requirement 5 almost dead code,
and "what counts as unreadable" would be an accident of the implementation
rather than a decision. Strict is also the direction that can be loosened later
without breaking anyone.

**GVP:** `code-common:CP3` (explicit over implicit — make behaviours obvious
rather than emergent) and `code-common:CP11` (API surface is a commitment —
loosening later is additive, tightening later is breaking).

---

## 5. An empty file is a failure, not `0 rows, 0 columns`

**Chose:** a zero-byte `.csv` is reported as
`failed: no header row: file is empty (row 1)`.

**Why:** requirement 2 says the first line is the header, so a file with no
first line has no header, and "how many columns its header declares" has no
answer. Printing `0 columns` would answer a question the file does not answer —
a fabricated measurement is worse than a reported failure, because it is
indistinguishable from a real one.

**GVP:** `personal:R2` (no silent failures — failures must be surfaced, not
swallowed).

---

## 6. A blank line is a data row of one empty field

**Chose:** any row terminator ends a row, so `a,b\n\n1,2\n` is a header plus two
data rows. A trailing terminator at end of file does not invent a row.

**Why:** the alternative — skipping blank lines — is a special case carved out of
an otherwise uniform rule, and special cases accumulate (does a whitespace-only
line count? a line of just commas?). One rule, consistently applied, with the
consequence documented, beats a rule plus exceptions. It is also consistent with
requirement 6's stance that a row of the "wrong" shape is still a row.

**GVP:** `personal:P4` (generic solutions over special-case handling).

---

## 7. Column count comes from the header alone

**Chose:** `columns` is the header's field count, never the widest row's.

**Why:** requirement 3 says "how many columns its header *declares*", and
requirement 6 establishes that rows may disagree with the header without that
being an error. A max-width reading would make the number mean something
different in ragged files than in clean ones.

**GVP:** none — this is requirement reading, not a library-guided choice.

---

## 8. Failures appear inline in the report on stdout, not on stderr

**Chose:** failed files get a line in the same stream, at the same place in
filename order, as successes: `bad.csv: failed: <reason>`. Nothing about
per-file failures goes to stderr. stderr is reserved for "tally could not run".

**Why:** requirements 4 and 5 together say the report is one line per file in
filename order, and failures are part of the report. Splitting them across two
streams destroys that ordering the moment the output is piped or redirected, and
loses the information that the failure sat between `a.csv` and `c.csv`. The
failure is still surfaced three ways — its own line, the summary count, and the
exit code — so nothing is swallowed.

**GVP:** `personal:R2` (failures must be surfaced) and `personal:P20` (prefer
machine-consumable forms — one ordered stream a script can read, rather than two
that must be reassembled).

---

## 9. Three distinct exit codes

**Chose:** `0` all reported successfully, `1` report produced but at least one
file failed, `2` tally could not run. Documented in `--help` and the README, and
exported as named constants.

**Why:** "some files were bad" and "I could not run at all" call for different
responses from a caller, and collapsing them into a single non-zero code forces
scripts to scrape text to tell them apart. Knowing which of the three states the
run ended in is the whole point.

**GVP:** `personal:P20` (prefer machine-consumable forms where easy),
`code-common:CP12` (be aware of what state you are in), `code-common:CP9`
(named constants, not magic numbers).

---

## 10. Four modules: scanner, tally, report, CLI

**Chose:** `csv.ts` (row shapes) → `tally.ts` (select files, measure, collect
outcomes, return data) → `report.ts` (render) → `index.ts` (the only module that
reads argv, writes a stream, or sets an exit code).

**Why:** the split is along the lines the requirements already draw — parsing,
measuring, presenting, invoking — so each requirement lands in one place rather
than being smeared across the tool. It also makes every behaviour reachable from
a test without a subprocess: `tallyDirectory` returns plain data, so requirements
1–9 can be asserted on values, with the subprocess tests reserved for proving the
assembly is wired correctly.

**GVP:** `code-common:CP1` (one contiguous block per change),
`code-common:CP13` and `code-testing:TP2` (testability is a design input, not an
afterthought).

---

## 11. `--format json` alongside the default text output

**Chose:** two formats, text by default, selected by `--format`.

**Why:** the report is structured data — a list of records plus two totals — and
a consumer that wants it structured should not have to re-parse the human
rendering. The cost was one function and one flag, because `tallyDirectory`
already returns exactly the shape JSON needs.

**GVP:** `personal:P20` (prefer machine-consumable forms where easy) and
`code-common:CP5` (configuration wired early, with sensible defaults so
zero-config works — `tally <dir>` needs no flags). See §16 for the tension with
`personal:V1`.

---

## 12. Dialect is a parameter of the library, not a CLI flag

**Chose:** `scanRowWidths` and `tallyDirectory` take a `CsvDialect`
(`delimiter`, `quote`) defaulting to comma and double-quote. No `--delimiter` or
`--quote` flag exists.

**Why:** "what separates fields" is the one axis of this tool with an obvious
future ask (TSV, semicolon-separated European exports), and threading it through
after the fact would touch every layer. But nobody has asked for it, and the
tool is called `tally` over `*.csv` — so the seam is built and tested, and the
user-facing feature is not. The flex point costs two fields; the flag would be a
permanent public commitment.

**GVP:** `code-common:CH2` (deferral tree, second branch: additive feature with
unknown access patterns → add the flex point, not the feature) and
`code-common:CP11` (API surface is a commitment).

---

## 13. No `--recursive`, `--include`, or other speculative options

**Chose:** `tally <dir>` reads `<dir>` and only `<dir>`. The only flags are
`--format` and `--help`.

**Why:** requirement 1 says "directly under `<dir>`", and recursion is not a
seam that is painful to add later — it is one function, `listCsvFilenames`,
whose signature would not change. There is no asymmetry to buy against.

**GVP:** `code-common:CH2` (third branch: speculative with no concrete use case →
defer entirely, no flex point). `personal:P21` pulls the other way and is noted
in §16.

---

## 14. The `.csv` match is case-insensitive

**Chose:** `Data.CSV` and `data.csv` are both tallied.

**Why:** a user who writes "every `*.csv` file" means every CSV file; the shift
key is not a semantic distinction they intend. A case-sensitive match also makes
the same directory behave differently on Linux than on macOS or Windows, whose
filesystems are case-insensitive — so the literal reading is the one that is
*not* portable. The failure mode of being strict is the worse one: a file the
user considers a CSV is silently absent from the report, with nothing to
indicate it was skipped.

The honest counter-argument, recorded rather than hidden: `code-common:CP11`
says loosening is additive and tightening is breaking, which argues for starting
case-sensitive. That argument lost to the silent-omission one, but it is not
wrong.

**GVP:** `personal:R2` and `personal:V5` (nothing the user considers their data
should be silently dropped from the report) against `code-common:CP11`. Flagged
in §16 as not unambiguously derivable.

---

## 15. Only files (and symlinks to files) are tallied; non-files are ignored silently

**Chose:** a directory named `archive.csv`, or a dangling `link.csv`, is skipped
without a report line. A symlink pointing at a real file is tallied.

**Why:** requirement 1 scopes the tool to "`*.csv` file[s]", and "files that are
not `*.csv` are left alone". A directory is not a file, so it falls under *left
alone* rather than under requirement 5's failure case — reporting it as a
failure would put noise in the report for something the user never asked to be
counted. A symlink to a CSV, by contrast, reads as a CSV and is one.

**GVP:** none — requirement reading. `code-common:CP12` is the reason it is a
deliberate branch with a comment rather than whatever `readdir` happened to do.

---

## 16. Where the library did not settle it

`personal:H5` says a blocker is any decision that cannot be unambiguously
derived from the library, and that the response is to weigh the aligned options
and name the guiding-element patch that would make one of them unambiguous.
Three decisions here qualify. Each was taken so the tool could be delivered; the
patch that would settle it is recorded alongside, and these are what deserve
review rather than the decisions themselves (`personal:P15`).

**§14, case-insensitive extension matching.** `personal:R2`/`personal:V5` favour
permissive; `code-common:CP11` favours strict-then-loosen. *Patch that would
settle it:* a heuristic on the order of "when interpreting a user-facing
selector, prefer the reading that cannot silently omit something the user
considers in scope, even at the cost of a wider initial surface" — which would
make permissive the unambiguous choice. The opposite patch, "start every
selector at its narrowest defensible reading", would make strict unambiguous.

**§11 and §13, how many flex points and flags a first build should carry.**
`personal:P21` says favour many flex points exposed as config options in early
builds, and explicitly governs over `code-common:CH2`'s third branch;
`personal:V1`, `code-common:CP11` and `personal:H7` pull toward fewer. Taken
literally, `personal:P21` would justify `--recursive`, `--delimiter` and
`--include` here. *Patch that would settle it:* a scope condition on
`personal:P21` — it reads as written for exploratory tools whose best use is
genuinely unknown, and a tool with nine fixed requirements is not that. Stating
that boundary (e.g. "P21 applies where the tool's use is still being discovered;
where requirements are fixed and complete, CH2 governs") would make the small
surface unambiguous. Absent that, §11 (a format flag, backed by
`personal:P20`) was taken and §13 (behavioural flags, backed by nothing but
P21's general pull) was not.

**§6, blank lines as data rows.** `personal:P4` favours the uniform rule, but
nothing in the library speaks to CSV semantics specifically, and a user tallying
a file with trailing blank lines may well disagree. *Patch that would settle it:*
nothing general is needed — this belongs in a project-level element if the
project ever acquires one, stating whether structurally-empty records count as
data.

---

## 17. Code-point filename ordering, not `localeCompare`

**Chose:** a two-comparison `compareFilenames`, ordering by code point.

**Why:** `localeCompare` reads the ambient locale, so the same directory would
produce a different report order on a differently-configured machine, and two
runs would not be diffable. That is hidden global state deciding user-visible
output.

**GVP:** `code-common:CP3` (explicit over implicit — no hidden state or global
magic).

---

## 18. A failed directory read aborts the run; a failed file does not

**Chose:** `tallyDirectory` catches per-file errors into `failed` outcomes, but
lets a `readdir` failure propagate, which `index.ts` turns into exit 2 and a
stderr message naming the directory and errno.

**Why:** requirement 5 is specifically about per-file failures, and the
distinction is whether a partial report still means something. With one bad file
among five, four real measurements remain. With an unreadable directory there is
no report to salvage, and printing `0 files reported, 0 failed` would be
indistinguishable from a genuinely empty directory — the one output requirement 9
reserves for a correct, empty answer.

**GVP:** `code-common:CP12` (never wander into an unexpected bad state; ask per
failure what the consequence is and whether the user needs to know) and
`personal:R2`.

---

## 19. Strict TypeScript, enforced by a script rather than by habit

**Chose:** `strict` plus `noUncheckedIndexedAccess`,
`exactOptionalPropertyTypes`, `noFallthroughCasesInSwitch`,
`verbatimModuleSyntax`; `npm run typecheck` and `npm run check` (typecheck +
tests) as the single command to run before believing anything works.

**Why:** types on every signature is the baseline, and a strictness setting that
nobody runs is a comment. One command that does both is the form that gets run.
There is no git repository here, so a pre-commit hook would be a hook without a
repo to hang on — `npm run check` is the nearest mechanism that actually exists.

**GVP:** `code-common:CP7` (strict typing), `code-common:CP10` (prefer
validators and hooks over convention), `personal:R1` (typecheck must pass before
claiming correctness).

---

## 20. Discriminated union for per-file outcomes

**Chose:** `FileOutcome` is `{status: 'ok', dataRows, columns} | {status:
'failed', reason}` rather than one record with optional fields.

**Why:** a success has no `reason` and a failure has no row count; a single shape
with four optional fields would let the type system wave through
`dataRows: undefined` being formatted as a number. The union makes the two cases
unreadable as each other, and it serialises to JSON unchanged.

**GVP:** `code-common:CP3` (explicit over implicit; the `status` literal union is
the TypeScript form of "enums over string literals") and `code-common:CP7`.

---

## 21. `node:util.parseArgs` instead of an argument-parsing library

**Chose:** the standard library's `parseArgs`, with explicit validation of the
`--format` value and of positional count afterwards.

**Why:** two flags and one positional is the case `parseArgs` exists for, and it
is already installed. `parseArgs` does not validate enum-valued flags, so that
check is written out — which is where the "unknown --format 'yaml'; expected one
of text, json" message comes from, rather than a stack trace.

**GVP:** `code-common:CH1` (below the dependency threshold) and
`code-common:CP16` (choose on effort and standard-library reach, not on
capability).

---

## 22. Unit tests on values, end-to-end tests through a real subprocess

**Chose:** 45 tests in three files — `csv.test.ts` on the scanner's corners
(quoted commas, quoted newlines, `""`, CRLF, bare CR, BOM, ragged rows, blank
lines, every malformed-quoting case, and the whole thing fed one character at a
time), `tally.test.ts` on file selection and measurement, `cli.test.ts` running
`npx tsx src/index.ts` as a subprocess and asserting exact stdout, stderr and
exit code. Each of the nine requirements has at least one test that fails if it
regresses, including requirement 9 (empty directory → summary line only).

**Why:** unit tests pin the parts; only a subprocess test proves the thing the
README tells a user to run actually behaves. The e2e tests assert the exact
output string rather than matching loosely, because the output format *is* the
interface.

**GVP:** `code-testing:TP1` (unit *and* end-to-end), `code-testing:TP2` (the
test is the executable definition of success), `code-testing:TP3` (the agent
building this must be able to fully exercise it — hence driving the real CLI, not
just the library).

---

## 23. The permission-denied test skips as root

**Chose:** the `EACCES` test is marked `{ skip: isRoot }`, since `chmod 000`
does not stop a root process.

**Why:** the alternative is a test that silently asserts nothing under one of the
two ways this will be run. Skipping makes the gap visible in the test output
instead. The failure path itself is still covered unconditionally by the
malformed-quoting tests; it is specifically the errno-reporting branch that goes
unverified when running as root.

**GVP:** `personal:V2` (be honest about limitations rather than presenting a
clean facade) and `code-testing:TP3`.

---

## 24. Test fixtures live under the project root

**Chose:** fixtures are built in `.test-fixtures/` inside the project and removed
when each test file finishes, rather than in `os.tmpdir()`.

**Why:** the brief said not to run the tool against anything outside this
directory. `mkdtemp` in the system temp directory would have been the ordinary
choice, and the first version did that; moving it inside the project keeps a test
run entirely within the sandbox it was given, which is cheap and removes the
question. Per-directory cleanup rather than wiping the fixture root, because
`tsx --test` runs the three test files as concurrent processes.

**GVP:** none — this follows the brief's explicit instruction.

---

## 25. Plain text output: no column alignment, pluralised nouns

**Chose:** `sales.csv: 3 rows, 3 columns`, unpadded, with `1 row, 1 column` in
the singular. Summary: `5 files reported, 1 failed`, where `reported` counts
every file in the report, failures included.

**Why:** unpadded because padding varies with the longest filename, which makes
the output unstable under `diff` and awkward to `awk`; `--format json` covers the
case where the shape matters more than the reading. Pluralisation because the
line is prose and `1 rows` reads as a bug. `reported` includes failures because
requirement 8 pairs it with "and how many failed", which only parses as a subset
of the same total.

**GVP:** `code-common:CP4` (the pluralisation lives in one `count` helper used by
every noun rather than being inlined three times).

---

## 26. UTF-8, BOM stripped, invalid bytes tolerated

**Chose:** files are decoded as UTF-8 by the read stream; a leading byte order
mark is dropped; invalid byte sequences become replacement characters rather than
failing the file.

**Why:** a BOM is an encoding artefact, and leaving it in would make it part of
the first header name — invisible in the report but wrong. Invalid bytes are
tolerated because this tool measures structure, and no malformed byte sequence
can change a delimiter, quote or newline count; failing the file would withhold a
correct answer over an irrelevant defect. Both are documented in the README
rather than left for a user to discover.

**GVP:** `personal:V2` (document the trade-off explicitly) and
`code-common:CP12` (decide per failure whether the user needs to know and
whether we can recover — here we can).

---

## 27. Run via `npx tsx src/index.ts`, with no build step and no `bin`

**Chose:** exactly the invocation the brief named, plus `npm run tally -- <dir>`
as a wrapper. Imports carry explicit `.ts` extensions
(`allowImportingTsExtensions`), and nothing is compiled or emitted.

**Why:** the brief fixed the entry point, so a build step would add an artefact
with no consumer. Explicit `.ts` extensions are what `tsx` wants and also what
Node's own type stripping requires on newer versions, so the source does not need
editing to drop `tsx` later. No `bin` entry, because installing a global `tally`
command was not asked for and is a public surface.

**GVP:** `code-common:CP11` (do not open a public surface nobody asked for) and
`personal:V1`.
