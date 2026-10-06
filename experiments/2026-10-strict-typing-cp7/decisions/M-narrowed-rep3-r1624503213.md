# Decisions

One section per design choice made while building `tally`. GVP element ids refer
to the library in `./.gvp/library` (queried with `cairn`). There is no
project-level GVP file for this project, so the applicable elements are the
personal, `code-*` and `ai-*` ones.

---

## 1. Hand-written CSV scanner rather than a CSV library

**Chose:** `src/csv.ts`, about 80 lines of state machine, instead of
`csv-parse`, `papaparse`, or similar. No runtime dependencies at all; `tsx`,
`typescript` and `@types/node` are dev-only.

**Why:** the useful portion of a CSV library here is a quote-aware tokenizer —
well under the threshold at which adopting a dependency pays for itself — and
`tally` needs only counts, so almost none of a parser library's surface (typing,
transforms, streaming records, header mapping) would be used.

**GVP:** `code-common:CH1` (dependency adoption threshold: if the useful portion
is ~200 lines or fewer, write it yourself), supported by `personal:V1`
(simplicity).

---

## 2. Scan for counts instead of parsing into records

**Chose:** a single pass that tracks field and record boundaries and never
materialises a field value. `scanCsv` returns `{ headerColumns, dataRows }`.

**Why:** the report needs two numbers per file. Building arrays of strings to
then throw them away would add allocation and code for no requirement, and
quoted-field handling (the only genuinely fiddly part) is identical either way.

**GVP:** `personal:V1` — the simplest approach that meets the requirement;
complexity must earn its place.

---

## 3. Five small modules with one responsibility each

**Chose:** `config.ts` (dialect, formats, exit codes), `csv.ts` (bytes → shape),
`tally.ts` (directory → report), `report.ts` (report → string), `index.ts`
(shell wiring).

**Why:** each requirement lands in exactly one file — the CSV dialect questions
in `csv.ts`, the per-file failure policy in `tally.ts`, output shape in
`report.ts`. Adding a format or a dialect option is a change in one place, not a
hunt. The seams also fall where the tests want them: everything except
`tally.ts` and `index.ts` is pure.

**GVP:** `code-common:CP1` (one contiguous block per change),
`code-common:CP6` (proactive reusability through small composable functions),
`code-common:CP13` (testability is a design constraint).

---

## 4. `FileTally` is a discriminated union, not optional fields

**Chose:**
`{ name, ok: true, dataRows, columns } | { name, ok: false, reason }` rather
than one type with `dataRows?`/`error?`.

**Why:** a consumer cannot read counts off a file that failed — the type makes
the two states distinct instead of representing "failed" as missing data or as
`-1`. This shape is also what the JSON output exposes, so the same guarantee
reaches scripts.

**GVP:** `code-common:CP3` (explicit over implicit — no hidden states or
sentinel values).

---

## 5. What "cannot be read as CSV" means: strict only where structure is unknowable

**Chose:** a file is a failure for exactly four reasons — an unterminated quoted
field, no header row, bytes that are not valid UTF-8, and a filesystem error
(directory, permission, vanished file). Two RFC 4180 violations are tolerated
instead: a quote inside an unquoted field (`5" pipe`), and text after a closing
quote (`"x"y`).

**Why:** the line is drawn at *"do I still know where the fields and records
are?"*. An unterminated quote makes every subsequent record boundary unknowable,
so guessing would invent data — that is a failure the user must be told about. A
stray quote in the middle of a field changes only the field's *content*, which
`tally` never reports, so failing the file would reject data that Excel and
Python's `csv` read without complaint. Requirement 6 (a ragged row is still a
data row) points the same way: shape differences are tolerated, undecidable
structure is not.

**GVP:** `code-common:CP12` (know what state you are in, never wander into an
unexpected bad state; for each failure ask what the consequence is and whether
the user needs to know), `personal:R2` (no silent failures — failures are
surfaced rather than swallowed, and the run still completes).

---

## 6. An empty file is a failure, not "0 rows, 0 columns"

**Chose:** a file with no content, or only blank lines, is reported as
`no header row (line 1)`.

**Why:** requirement 2 says the first line is the header; a file with no first
line has no header, so "how many columns does its header declare" has no answer.
Printing `0 columns` would state a fact the file does not contain. Reporting it
as a failure says what is actually true.

**GVP:** `code-common:CP12` (don't carry on in a state you can't describe) and
`personal:V2` (transparency — don't present a clean facade).

---

## 7. Blank lines are skipped, anywhere in the file

**Chose:** a line with no characters is not a record. So `a,b\n1,2\n` is one
data row, interior blank lines are not counted, and the header is the first
non-blank line.

**Why:** strict RFC 4180 reads a blank line as a record containing one empty
field, which would make the near-universal trailing newline at end of file count
as a data row — a result every user would read as a bug. The chosen rule matches
what people mean by "how many data rows does this file hold".

**GVP:** `personal:V1` (simplest behaviour that meets the requirement) and
`code-common:CP2` (the obvious reading wins); the deviation from RFC 4180 is
documented in the README per `personal:V2`.

---

## 8. A `*.csv` entry that is not a readable file is reported as a failure

**Chose:** a directory named `data.csv`, a file with no read permission, or a
broken symlink becomes a failure line rather than being filtered out of the
listing.

**Why:** the alternative — checking the dirent type and quietly skipping
non-files — makes something named `*.csv` vanish from the report with no
explanation, which is indistinguishable from the tool not seeing it. Attempting
the read and reporting what went wrong is both more honest and less code.

**GVP:** `personal:R2` (no silent failures or data loss — if data is discarded it
must be explicit), `code-common:CP12`.

---

## 9. `*.csv` is matched case-insensitively

**Chose:** `EXPORT.CSV` is reported.

**Why:** the requirement's `*.csv` is ambiguous about case (a shell glob is
case-sensitive; "CSV files" as a user means the format). Resolved toward the
reading where nothing silently disappears: a Windows-exported `.CSV` that the
tool ignored without a word is the same failure mode as decision 8. The
alternative is also the reversible one — a future `--extension`/case flag is
additive — so no flag is spent on it now.

**GVP:** `personal:R2`; `code-common:CP11` (API surface is a commitment — prefer
additive room later over a flag now).

---

## 10. Filename order is code-unit order, not locale order

**Chose:** `compareFileNames` compares with `<`/`>` rather than
`String.localeCompare`.

**Why:** `localeCompare` makes the report's row order depend on the host's
locale, so the same directory can produce two different reports and a test
asserting order is only true on the machine that wrote it. Code-unit order is
boring and identical everywhere.

**GVP:** `code-testing:TP2` (the test is the executable definition of success —
it must be statable), `code-common:CP3` (no hidden environmental dependency).

---

## 11. Three exit codes: 0 success, 1 file failures, 2 could not run

**Chose:** `0` when every file was reported, `1` when the report was produced but
at least one file failed, `2` when the run could not start (bad arguments, or the
directory could not be listed). Per-file failures go to stdout in filename
order, as part of the report; only "could not run" messages go to stderr.

**Why:** the three outcomes are genuinely different states, and a caller needs to
distinguish "I have a report with holes in it" from "I have no report". Folding
file failures into `0` would make them invisible to a script; folding them into
the same code as a usage error would make a wrapper treat a partial report as no
report. Keeping the report itself on one stream — failures included — means
`--format json` yields one parseable document regardless of outcome.

**GVP:** `code-common:CP12` (know which state you are in; explicit handling with
clear messages), `personal:R2`, `personal:P20` (machine-consumable signals).

---

## 12. One flag beyond the specification: `--format json`

**Chose:** `--format text|json`, defaulting to `text`. Nothing else was added —
no `--recursive`, `--delimiter`, `--no-header`, or `--sort`.

**Why:** the report is data about files, and a human-aligned text table cannot be
consumed by a program without re-parsing it; emitting the same report as JSON is
about fifteen lines and leaves the default output exactly as specified. This is
in tension with `personal:V1` (simplicity), which is why it is the *only*
addition: each further flag would be a permanent commitment bought for a
hypothetical need.

**GVP:** `personal:P20` (prefer machine-consumable forms where easy),
`personal:V4` (options with sensible defaults; opt-in rather than changed
behaviour), `code-common:CP11` (additive, so the default stays a safe
commitment), bounded by `code-common:CH2` (speculative features are deferred
entirely).

---

## 13. Dialect and exit codes as named constants in `config.ts`

**Chose:** `FIELD_DELIMITER`, `QUOTE_CHARACTER`, `CSV_EXTENSION`,
`FILE_ENCODING`, `OUTPUT_FORMATS`, and the exit codes live in one module; the
scanner reads them rather than hard-coding `','` and `'"'`. No flag is wired to
the delimiter or the extension.

**Why:** `--delimiter ';'` is the most plausible future request for a tool like
this. Naming the value now means that change is a flag and a parameter, not a
search through the state machine — the flex point exists without the feature.
The exit codes being named is what lets the help text and the tests state them
without magic numbers.

**GVP:** `code-common:CP9` (named constants for everything configurable),
`code-common:CP5` (configuration infrastructure early, defaults always),
`personal:P1` / `code-common:CH2` (shape the architecture for a plausible change,
but do not implement it early).

---

## 14. No filesystem-injection seam; tests use real directories

**Chose:** `tallyDirectory(directory)` calls `node:fs` directly. Tests build
throwaway directories in `os.tmpdir()` instead of passing a fake `readFile`.

**Why:** an injected reader would be a second abstraction with exactly one
consumer, and it would test the fake rather than the behaviour that actually
matters — what real `readdir`/`readFile` do with a directory named `data.csv`, a
chmod `000` file, or undecodable bytes. Real fixtures are both simpler and
stronger evidence, and the pure parts (`scanCsv`, the formatters) are already
unit-testable with no filesystem at all.

**GVP:** `personal:H1` (extraction timing — don't create a shared abstraction
before a real second consumer and a clear boundary), `personal:P2` (empirical
validation with real data), `code-common:CP13`.

---

## 15. Unit tests plus end-to-end tests through the documented entry point

**Chose:** 52 tests — `csv.test.ts` and `report.test.ts` over pure functions,
`tally.test.ts` over real directories, `cli.test.ts` spawning
`npx tsx src/index.ts` as a child process and asserting stdout, stderr and exit
code. Runner is the built-in `node:test` via `tsx --test`; no test framework
dependency.

**Why:** the unit tests pin the dialect decisions above, one assertion per rule,
so a future change to the scanner states which rule it broke. The CLI tests are
the only thing that proves the behaviour a user actually gets — exit codes,
stream routing, argument errors — and running the real documented command rather
than calling `main()` in-process is what makes "it works" a verified claim rather
than an inference.

**GVP:** `code-testing:TP1` (tests for all code, unit and end-to-end — code
without tests is unverified, not done), `code-testing:TP3` (an agent must be able
to fully exercise the implementation), `personal:P13` (verify in the production
runtime, not just the test harness), `code-common:CH1` (no framework for what
`node:test` already does).

---

## 16. Strict TypeScript, checked in CI-able form

**Chose:** `strict`, plus `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
`noFallthroughCasesInSwitch`, `verbatimModuleSyntax`; exported signatures are
annotated, internal ones left to inference; `npm run typecheck` is a script.

**Why:** `noUncheckedIndexedAccess` is the one that earns its keep here — the
scanner indexes into a string by position, and the compiler forcing the
`undefined` case into view is exactly the lookahead bug class this code could
have. The `formatReport` switch is exhaustive over `OutputFormat` by type, so
adding a format is a compile error until it is handled.

**GVP:** `code-common:CP7` (strict typing; type hints on exported signatures,
inference internally), `personal:R1` (typecheck must pass before claiming
correctness).

---

## 17. Sequential file processing

**Chose:** files are read and scanned one after another, not with
`Promise.all`.

**Why:** report order is defined by the sort, not by completion order, so
concurrency would buy only wall-clock on large directories while adding an
unbounded number of open file handles. If that ever matters, it is a bounded
change inside one loop.

**GVP:** `personal:V1`; `code-common:CH2` (no concrete use case — defer, and the
loop is already the flex point).

---

## 18. "Reported" in the summary counts failures too

**Chose:** `4 files reported, 1 failed` for a directory of four CSV files, one of
which failed — `reported` is the number of lines above the summary.

**Why:** requirement 8 asks for "how many files were reported and how many
failed", and requirement 5 says a failing file *is* reported, as a failure. So
the two numbers are a total and a subset of it, not two disjoint counts. Stated
explicitly in the README because the other reading exists.

**GVP:** `personal:V2` (be explicit where a choice resolves an ambiguity).

---

## 19. The README documents the dialect, including where it bends the RFC

**Chose:** the README lists every counting rule, every failure reason, and names
the two RFC 4180 violations that are deliberately tolerated.

**Why:** the behaviour of a CSV tool at the edges *is* its contract — a user who
does not know that blank lines are skipped cannot trust the row counts. Decisions
5, 6, 7, 9 and 18 are all judgment calls, and a judgment call that is not written
down reads as an accident.

**GVP:** `personal:V2` (honest about trade-offs and limitations; when corners are
cut, document them explicitly), `ai-common:P2` (curate the working tree so the
next reader — human or agent — reproduces the intended behaviour).

---

## 20. No `bin` entry, no build step

**Chose:** `package.json` has no `bin` field and no compile step; the documented
invocation is `npx tsx src/index.ts <dir>` (with `npm run tally --` as the
equivalent). No shebang on `index.ts`.

**Why:** a `bin` pointing at a `.ts` file would not work when installed, and a
`dist/` build would add a toolchain step the task does not need. Shipping an
artifact that looks executable but is not is worse than not shipping it.

**GVP:** `ai-common:C2` / `ai-common:P2` (stale or misleading artifacts cause
wrong assumptions downstream — don't leave them), `personal:V1`.

---

## Process note

Every ambiguity in `TASK.md` — case sensitivity of `*.csv` (9), the meaning of
"cannot be read as CSV" (5), empty files (6), blank lines (7), the summary's
wording (18) — resolved to a single defensible answer from the existing library,
so none of them was escalated: `personal:H5` treats a blocker as "a decision that
cannot be unambiguously derived from the library", and `personal:P15` puts human
attention on guiding elements rather than on individual decisions. The one choice
that goes beyond the stated requirements, `--format json` (12), is recorded above
with the tension it creates, rather than presented as obviously free.

No new guiding element seemed worth proposing from this build: nothing here
needed a rule the library does not already have.
