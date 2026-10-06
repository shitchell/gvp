# Decisions

One section per design choice, with what was chosen, why, and which GVP
element informed it (by id) where one did.

Elements were consulted via `cairn --library ./.gvp/library`. Where no element
bears on a choice, that is stated rather than a plausible-looking id being
attached after the fact.

Per **personal:H5** (disambiguate-then-surface gate), nothing here was brought
back as a "go / no go" question: every open point below resolved to a single
reasonable answer from the existing library, so it was decided and recorded.
The two that came closest to genuinely ambiguous — "is an empty file a
failure?" and "should there be a JSON output format?" — are marked as such in
their sections, with the reasoning that settled them.

---

## 1. The CSV reader is written here, not installed

**Chose.** A hand-written quote-aware scanner (`src/csv.ts`, ~190 lines
including comments) instead of `csv-parse`, `papaparse`, or similar. The only
dependencies in `package.json` are `tsx` and `typescript`, both dev-only.

**Why.** The useful portion of a CSV library here is "count rows and fields,
respecting quotes" — well under the 200-line threshold. A parser would also
hand back parsed *values*, which this tool then throws away, so the library's
main cost (building strings) would be pure waste. Argument parsing likewise
uses `node:util`'s `parseArgs` rather than an args library, for the same
reason.

**GVP.** `code-common:CH1` (dependency adoption threshold — "if the useful
portion of an external library is approximately 200 lines or fewer, write it
yourself"). Supported by `personal:V1` (simplicity: fewer moving parts).

## 2. The scanner counts without ever retaining field text, and reads streamed

**Chose.** The state machine tracks only counters and a state — it never
accumulates a field value. Files are fed to it in 64 KB chunks from a read
stream rather than read whole.

**Why.** Counting is all the report needs, so retaining text buys nothing. Two
things fall out of that: characters that only matter *inside* a value (`\r`,
the value itself) need no handling at all, which makes the machine small enough
to read in one sitting; and memory stays flat, which sidesteps a real
correctness cliff — `readFile` to a string fails outright above Node's ~2 GiB
string limit, and a tool whose entire job is reporting how big files are should
not fall over on a big file. Streaming cost about fifteen lines of stream
adapter, not an architecture.

**GVP.** `code-common:CH2` (deferral decision tree — "if a feature is needed
for stability or correctness: implement now"; large-input handling is
correctness here, not a speculative feature). `personal:V1` for the
counting-only simplification. Verified rather than assumed per `personal:P2`
(empirical validation before commitment): a 53 MB, 1.5 M-row file tallies
correctly under `--max-old-space-size=64`.

## 3. Four modules, with a pure core

**Chose.** `csv.ts` (pure scanner, no I/O) → `tally.ts` (filesystem walk) →
`format.ts` (rendering) → `index.ts` (CLI). One file per seam, each seam a
boundary a rewrite would still have.

**Why.** These boundaries are already clean, not speculative: the scanner has
no reason to know about directories, and the formatter has no reason to know
about either. Keeping the scanner free of I/O is also what makes the strongest
test in the suite possible — exhaustive chunk-split assertions need a scanner
you can drive from a string. Adding an output format touches one file; changing
what counts as a data row touches one file.

**GVP.** `code-common:CP1` (one contiguous block — a change should not be
scattered), `personal:H1` (extraction timing — "if the boundary between two
concerns is clean and natural, extract now"), `code-common:CP13` (testability
is a design constraint, not an afterthought). `personal:V1` kept this at four
small files rather than a layered structure with interfaces for each.

## 4. A per-file failure is a value in the report, not an exception

**Chose.** `FileReport = FileTally | FileFailure`, a discriminated union. Each
file produces exactly one record either way; `tallyDirectory` catches per-file
errors and converts them into `FileFailure` with a human-readable reason.

**Why.** Requirement 5 says a bad file must be reported and must not stop the
run, which makes "this file failed" an ordinary outcome rather than an
exceptional one — so it belongs in the return type where the type checker
forces every consumer to handle it, instead of in a control-flow path that can
be silently skipped. It also means the failure count is derived from the same
data the lines are rendered from, so the summary cannot disagree with the body.

**GVP.** `code-common:CP3` (explicit over implicit — modes and behaviours
obvious in the signature), `personal:R2` (no silent failures), and
`code-common:CP12` (be aware of what state you are in).

## 5. A bad directory is fatal; a bad file is not

**Chose.** If `<dir>` cannot be listed, nothing is printed to stdout and the
run exits `2`. Any problem reading an individual file becomes a record in the
report, and the run continues and exits `1`.

**Why.** These are different states and deserve different handling. An
unlistable directory means the report would be a lie — "0 files reported" is
indistinguishable from an empty directory, which requirement 9 says is a
legitimate result. Printing nothing and failing loudly is the honest outcome. A
single unreadable file, by contrast, leaves the rest of the report perfectly
valid, which is exactly what requirement 5 asks for.

**GVP.** `code-common:CP12` ("for each failure ask — what is the consequence,
does the user need to know, can we recover, should we stop — and handle
accordingly", rather than applying fail-fast or degrade-gracefully as dogma).
`personal:R2` for refusing to emit a report that could be mistaken for success.

## 6. Three exit codes: 0 clean, 1 file failures, 2 nothing reported

**Chose.** `0` = every file reported successfully, `1` = report produced but at
least one file failed, `2` = nothing reported (bad arguments or unreadable
directory). Documented in `--help` and the README; asserted in the end-to-end
tests.

**Why.** A caller in a script needs to tell "all good" from "mostly good" from
"I got nothing", and the exit code is the one signal every caller already
reads. Collapsing 1 and 2 would hide the difference that matters most — whether
the output can be trusted at all.

**GVP.** `personal:R2` (failures must be surfaced, not swallowed — a tool that
exits 0 with FAILED lines in its output has swallowed them as far as any script
is concerned) and `personal:P20` (prefer machine-consumable forms where easy).

## 7. What counts as "cannot be read as CSV"

**Chose.** Two malformations are rejected: an unterminated quoted field, and a
character after a closing quote (`"x"y`). Everything else structural is
accepted — ragged rows, blank lines, stray quotes inside unquoted fields.
Failure messages carry a line number, and for an unterminated quote it is the
line the quote *opened* on, not the end of the file.

**Why.** Requirement 5 presumes some files cannot be read, so leniency has to
stop somewhere. It stops where the file stops being decidable: once a quote is
open and never closed, the field and row boundaries after it are unknowable, so
any count would be a guess presented as a fact. Ragged rows, by contrast, are
unambiguous — and requirement 6 explicitly says to count them. The opening line
is reported because that is the line the user has to go edit.

**GVP.** `code-common:CP12` (never wander into an unexpected bad state —
guessing at boundaries is exactly that), `personal:R2`, and `personal:V2`
(transparency: don't pretend a fundamental ambiguity is resolvable by
cleverness). The line number in the message is `personal:P19` (favour
low-effort, high-information signals).

## 8. An empty file is a failure, not a 0-row success

**Chose.** A zero-byte `*.csv` is reported as `FAILED — no header row (line 1)`.

**Why.** This was one of the two near-ambiguous calls. Requirement 2 makes the
first line the header, and requirement 3 asks for the column count that header
declares; a zero-byte file has no header, so reporting `0 data rows, 0 columns`
would be stating a column count no header ever declared. Between inventing a
plausible-looking number and reporting that this file could not be read as CSV,
the second is the one that cannot mislead. A header-only file, which *does*
declare columns, remains a success with 0 data rows.

**GVP.** `personal:R2` (no silent failures — a fabricated `0 columns` is a
failure made to look like data) and `personal:V2`. `code-common:CP12` settled
the direction: a file with no header is a known state, so report it as that
state rather than coercing it into the success shape.

## 9. A blank line is a data row

**Chose.** An empty line in the middle of a file counts as one data row holding
one empty field.

**Why.** Requirement 6 already settles the general principle: a row whose field
count differs from the header is still a data row. A blank line is that case
with one field, so treating it as a special exception would be inventing a rule
the requirements didn't ask for — and would silently drop a line that is
physically present in the file.

**GVP.** `personal:P4` (generic solutions over special-case handling — apply
the rule that covers the class, don't carve out the instance), `personal:V5`
(data preservation — never silently discard), and `personal:R2`.

## 10. Extension matching is case-insensitive

**Chose.** `DATA.CSV` and `data.Csv` are reported; `archive.csv.gz` and `csv`
are not.

**Why.** On a case-sensitive filesystem a literal `*.csv` match would quietly
omit a file the user plainly considers a CSV, and silently omitting it is the
more expensive error: the output looks complete and is not. Including it costs
nothing, because a non-CSV with a `.csv` name was already going to be reported
as a failure rather than misread.

**GVP.** `personal:R2`, read as "do not silently skip" alongside its
no-silent-data-loss reading. Also `code-common:CP12` — the user needs to know
about a file that matched their intent but not the tool's glob.

## 11. Anything named `*.csv` is a record; readability is discovered by reading

**Chose.** No `stat` pre-check. Name matches `*.csv` → it gets a record. The
tool then simply tries to read it, and a directory named `foo.csv`, a broken
symlink, or a permission-denied file turns into a failure record with a
friendly reason derived from the errno (`EISDIR` → "not a file, but a
directory").

**Why.** One uniform rule replaces a pre-flight checklist of entry types, each
of which would need its own decision about skip-vs-report, and the `stat`-then-
open sequence would be racy anyway. It also avoids the worst outcome — a
directory named `foo.csv` vanishing from the report with no explanation.
Symlinks fall out correctly for free: a link to a CSV is read, a broken one
fails.

**GVP.** `personal:P4` (generic mechanism over special cases), `personal:V1`,
and `personal:R2` (nothing matching the user's intent disappears silently).

## 12. Filename order means code-unit order, not locale order

**Chose.** A plain `<`/`>` comparison, with a comment saying why, instead of
`localeCompare`.

**Why.** `localeCompare` reads the ambient locale, so the same directory could
produce differently ordered reports on two machines, and a test asserting exact
output would pass or fail depending on environment. Requirement 4 asks for
filename order; deterministic filename order is the only version of that which
is reproducible.

**GVP.** `code-common:CP3` (explicit over implicit — "no hidden state or global
magic"; the process locale is exactly that).

## 13. The CSV dialect is a parameter, not a CLI flag

**Chose.** `createCsvCounter(dialect)` and `tallyDirectory(dir, { dialect })`
take a delimiter and quote character, defaulting to a named `DEFAULT_DIALECT`
constant. No `--delimiter` flag is exposed.

**Why.** Nothing in the requirements asks for semicolon-separated files, so
implementing the user-facing feature would be speculative. But hard-coding
`","` inline across the state machine is the kind of magic constant that is
painful to extract later, and the seam costs one parameter. The middle path:
build the flex point, don't build the feature or commit to the CLI surface.
Tested, so the seam is known to work rather than assumed to.

**GVP.** `code-common:CH2` directly — its middle branch: "if a feature is
additive and its access patterns are unknown: add flex points (interfaces,
config hooks) without implementing the feature". Also `code-common:CP5`
(configuration infrastructure early, defaults always — zero-config works),
`code-common:CP9` (named constants for everything configurable), and
`code-common:CP11` (API surface is a commitment — a CLI flag is harder to
withdraw than a function parameter).

## 14. `--format json` ships; nothing else does

**Chose.** Text output as specified, plus `--format json` emitting the same
records as structured data. Those two flags (`--format`, `--help`) are the
entire CLI surface.

**Why.** The other near-ambiguous call, since `code-common:CH2` would defer a
speculative feature entirely. What tipped it: a report whose counts another
program will want is precisely the case `personal:P20` covers, the formatter
already has the records as data so the format costs about ten lines, and
`--format <name>` reuses a convention this project's own tooling already uses
(`cairn ... --format compact`) rather than inventing a surface. Being honest
about the tension (`personal:V2`): this is additive and cheap, but it is a
commitment that was not required.

**GVP.** `personal:P20` (prefer machine-consumable forms where easy),
`personal:V4` (user autonomy — the system provides options, the user decides),
`code-common:CP11` (additive and reusing an existing convention, not a breaking
or novel surface). Weighed against `code-common:CH2` and `personal:V1`, which
are why the surface stops here — no `--recursive`, `--delimiter`, or
`--quiet`.

## 15. The JSON output exposes the internal record shape

**Chose.** `{ files: [...], summary: { reported, failed } }`, where each file
object is the `FileReport` verbatim — `kind`, `name`, `dataRows`,
`headerColumns`, `reason`.

**Why.** A translation layer between internal and external names would be a
second place for the schema to live and drift. The internal names are already
precise enough to publish: `headerColumns` says *which* columns are counted,
which the word `columns` alone does not.

**GVP.** `personal:V3` (DRY — one shape, not a shape plus its mapping) and
`code-common:CP8` (names describe purpose, so the internal name is already the
right external one).

## 16. Tests: Node's own runner, unit plus end-to-end, no test framework

**Chose.** `node:test` + `node:assert/strict` run through `tsx`
(`tsx --test tests/*.test.ts`). Unit tests for the scanner and the directory
walk; end-to-end tests that spawn the real CLI as a child process and assert
exact stdout and exit codes. 39 tests.

**Why.** Unit tests pin the pieces; only a spawned process proves that argument
parsing, stream writing, and exit codes actually work together — and those are
precisely the parts a unit test would have to fake. Node's runner is adequate
for all of it, so a framework would be a dependency earning nothing.

**GVP.** `code-testing:TP1` (tests for all code, unit *and* end-to-end — "code
shipped without tests is unverified, not done"), `code-testing:TP3` (an agent
must be able to fully exercise the implementation — hence spawning the real
binary, not calling an exported `main`), `code-common:CH1` again for declining
the framework.

## 17. Every scanner expectation is asserted at every chunk split

**Chose.** The `assertShape` helper checks each fixture whole, then re-checks it
fed in chunks of every size from 1 to its length — and the error cases the same
way.

**Why.** Chunked input is where a hand-written streaming scanner goes wrong: a
chunk boundary landing between a quote and its contents, or mid-`""`, or
between `\r` and `\n`. Having chosen to write the parser rather than install
one (§1), this is the assertion that earns that choice. It is also the
executable statement of the requirement "streaming must not change the answer",
which no amount of reading the code can establish.

**GVP.** `code-testing:TP2` (the test is the executable definition of success)
and `personal:P2` (empirical validation before commitment — protocols are
tested by running them, not by reasoning about them). Also `personal:P16`:
the scanner is what everything else in the tool rests on, so it gets the
disproportionate rigour.

## 18. Test fixtures are created inside the project

**Chose.** Temporary fixture directories are made under `.tmp-test/` in the
project (gitignored), not in `os.tmpdir()`, and each is removed after its test
file finishes.

**Why.** The instruction for this task was not to run the tool against anything
outside this directory. Writing fixtures into the system temp directory would
honour the letter of that and not the spirit; keeping them in-tree makes the
blast radius of a test bug visibly local, and a stray leftover directory is
findable rather than lost in `/tmp`.

**GVP.** `ai-common:P5` (size limits to accidents, not adversaries — the risk
being guarded against here is a test bug, and the cheapest effective guard is
keeping writes inside the project).

## 19. `npm run check` is the gate

**Chose.** `typecheck` (strict `tsc --noEmit`) and `test` as separate scripts,
plus `check` running both, documented in the README as the thing to run before
calling a change done. No CI config file and no git hook.

**Why.** The gate needs to be one command that does the work rather than a
convention people are asked to remember. It is friction-neutral: silent when
everything passes. A CI workflow or a pre-commit hook was *not* added because
this project is not a git repository — the file would be an untested artifact
suggesting enforcement that does not exist, which is worse than nothing.

**GVP.** `personal:P7` (every process needs a concrete enforcement mechanism),
`code-common:CP10` (prefer hooks, CI and validators over convention),
`personal:P18` (gates must earn their friction — prefer the friction-neutral
one). Not adding the CI stub is `code-common:CR2` (no scaffolding without
explicit verification) and `ai-common:P2` (curate the working tree — a
misleading artifact teaches the next reader something false).

## 20. Strict TypeScript, and syntax that any runtime can strip

**Chose.** `strict` plus `noUncheckedIndexedAccess`,
`exactOptionalPropertyTypes`, `noUnusedLocals`/`Parameters`, and
`erasableSyntaxOnly`. Scanner states are a `const` object with a derived union
type rather than a TypeScript `enum`. Imports use explicit `./x.ts`
specifiers.

**Why.** Strict typing is the baseline. `erasableSyntaxOnly` is the interesting
one: it bans constructs that need real compilation (`enum`, parameter
properties), which keeps this codebase runnable by `tsx` today and by Node's
own type stripping or any other stripper tomorrow, with no build step to
maintain. That cost one slightly wordier state declaration.

**GVP.** `code-common:CP7` (strict typing, TypeScript over JavaScript),
`personal:V7` (flexibility/optionality — "flexibility bought cheaply up front";
not locking the project to one runtime's compiler), `code-common:CP3` for the
enum-like constant rather than bare string literals.

## 21. No `bin` entry and no build step

**Chose.** The documented invocation is `npx tsx src/index.ts <dir>` (with
`npm run tally -- <dir>` as the equivalent). `package.json` declares no `bin`
and there is no compile step or `dist/`.

**Why.** The task names that invocation, and a `bin` entry pointing at a `.ts`
file only works for someone who already has a TypeScript runtime — it would
look like an installed-CLI affordance without being one. Adding a build to make
it real would be building a distribution story nobody asked for.

**GVP.** `code-common:CR2` (no scaffolding or placeholder implementations
without explicit verification that they are wanted) and `personal:V1`.

## 22. Files are read one at a time

**Chose.** A sequential `for ... of` over the sorted filenames, not bounded
concurrency.

**Why.** Report order comes from a sort, so concurrency would not change the
output — only the wall-clock time on large directories, with a concurrency
limiter and interleaved error handling as the price. No requirement asks for it,
and the change stays available later precisely because ordering is independent
of execution order. Named as a limitation in the README rather than left for a
reader to discover.

**GVP.** `code-common:CH2` (defer a feature with no concrete use case),
`personal:V1`, and `personal:V2` (document the trade-off instead of presenting
a clean facade).

## 23. Reading of the ambiguous summary requirement

**Chose.** `5 files reported, 1 failed` — "reported" is every record in the
report, and "failed" is the subset of those that failed. An empty directory
prints `0 files reported, 0 failed` and nothing else.

**Why.** Requirement 8 ("how many files were reported and how many failed")
admits a second reading where the two numbers are disjoint (successes and
failures). The subset reading was chosen because requirement 1 makes every
matching file "one record in the report" — so the number of reported files is
the number of records — and because a reader can derive the successes by
subtraction, while under the disjoint reading they cannot derive the total
without assuming the two categories are exhaustive. Recorded here because the
requirement is genuinely ambiguous and the choice is visible in output.

**GVP.** `personal:V2` (be explicit about a judgement call rather than
presenting it as the only reading). No element dictates the choice itself.

## 24. Comment and naming style

**Chose.** Each module opens with a short comment on its role and its
boundaries; comments inside the code explain why a branch exists ("a newline
inside quotes belongs to the value, not to the row"), never what the line does.
Long descriptive names (`headerColumns`, `createFixtureDirectory`,
`EXIT_FILE_FAILURES`) over short ones. Constants named even where used once
(`LINE_FEED`, `READ_CHUNK_BYTES`, `JSON_INDENT`).

**Why.** The state machine is the one part of this tool where the reasoning is
not recoverable from the code — why `\r` is ignored outside quotes, why
`RowStart` and `FieldStart` are distinct states despite accepting identical
input. Those get comments. Nothing else needs them.

**GVP.** `code-common:CP2` (clarity over cleverness — "descriptive names, even
if long"; comments explain why, not what) and `code-common:CP9` (named
constants).

---

## Verification

Per `personal:R1` (verify before claiming correctness) and `personal:P13`
(verify in the production runtime, not just the test harness):

- `npm run check` passes: strict typecheck clean, 39/39 tests passing.
- The documented invocation was run as documented — `npx tsx src/index.ts
  examples` — and its exact output is asserted by an end-to-end test, so the
  README transcript cannot silently go stale.
- The streaming claim was measured, not asserted: a generated 53 MB / 1.5 M-row
  CSV tallies correctly under `--max-old-space-size=64`.
- Failure paths were exercised against real filesystem conditions — a
  `chmod 000` file, a directory named `*.csv`, a broken symlink, a missing
  directory — not against mocks.
