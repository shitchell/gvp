# Decisions

One section per design choice. "GVP" names the element I relied on, queried
from `./.gvp/library`. Where nothing in the library bore on the choice, that is
said plainly.

---

## 1. Hand-written CSV reader rather than a CSV library

**Chose:** `src/csv.ts`, a ~100-line quote-aware scanner, instead of
`csv-parse`, `papaparse`, or similar.

**Why:** The useful portion of a CSV library here is exactly those 100 lines —
records, quotes, escaped quotes, line endings. Nothing else in those libraries
(type coercion, column mapping, transform streams, dialect sniffing) is wanted.
Writing it also puts the failure taxonomy under our control, which requirement
5 depends on: the tool has to decide which inputs are "not CSV", and a
third-party parser's leniency settings would be making that product decision
for us.

**GVP:** `code-common:CH1` (dependency adoption threshold — under ~200 useful
lines, write it yourself), supported by `personal:V1`.

---

## 2. Strict about quoting, lenient about row shape

**Chose:** Rows of differing widths parse happily. An unterminated quoted
field, or content immediately after a closing quote (`"a"b`), is an error.

**Why:** Requirements 5 and 6 together demand a line between "broken" and
"merely untidy", and this is where I drew it. A ragged row has one obvious
reading, so reading it is right. `"a"b` has no single obvious reading — `ab`,
`a"b`, and `a` are all defensible — and silently picking one would quietly
reinterpret the user's data. Requirement 5 would otherwise be nearly dead
code, because a fully lenient parser accepts essentially any byte sequence.

**GVP:** `personal:R2` (no silent failures or data loss) and `personal:V5`
(never silently discard or strand data).

---

## 3. Bytes that are not valid UTF-8 are a file failure

**Chose:** `new TextDecoder('utf-8', { fatal: true })`, so undecodable bytes
fail the file.

**Why:** Node's default decoding replaces bad bytes with `U+FFFD` without
telling anyone. The row and column counts would still come out, but they would
be counts of silently corrupted text. Failing the file is honest and gives the
user something to act on.

**GVP:** `personal:R2`, `personal:V5`.

---

## 4. Streaming read rather than reading each file whole

**Chose:** `readCsvRecords` consumes an async iterable of text chunks; the
tally consumes records one at a time and keeps only two counters.

**Why:** The parser is a character state machine either way, so feeding it a
stream costs about five extra lines today, whereas retrofitting it later would
mean changing the one interface every other module talks to. For a tool whose
entire purpose is large tabular files, flat memory is closer to correctness
than to optimisation.

**GVP:** `code-common:CH2` (first branch: needed for stability — implement now)
and `personal:H3` (build now when the cost asymmetry is clear).

---

## 5. Four modules: parser, tally, report, CLI

**Chose:** `src/csv.ts` (CSV records), `src/tally.ts` (directory and file
logic), `src/report.ts` (output formatting), `src/index.ts` (arguments, exit
codes, writing).

**Why:** Each plausible future change lands in exactly one file: a new output
format is `report.ts` alone, a parser fix is `csv.ts` alone, a new flag is
`index.ts` alone. The split also keeps the behaviour the requirements describe
testable without going through a subprocess, which is why `tally.ts` does no
terminal I/O and takes no arguments.

**GVP:** `code-common:CP1` (one contiguous block), `code-common:CP13`
(testability is a design constraint), `personal:P3` (separate what from how).

---

## 6. Per-file results are returned as data, not thrown

**Chose:** `tallyCsvFile` never throws. It returns a discriminated union —
`{ outcome: 'success', dataRows, columns }` or `{ outcome: 'failure', reason }`
— with `FileOutcome` as a named constant object rather than bare string
literals.

**Why:** Requirement 5 says one bad file must not stop the run, and the
cleanest way to guarantee that is for "this file failed" to be an ordinary
value in the report rather than a control-flow event the caller might forget to
catch. A failure then flows through sorting, formatting, and counting the same
way a success does.

**GVP:** `code-common:CP3` (explicit over implicit; enums over string
literals), `code-common:CP12` (always know what state you are in).

---

## 7. Three exit codes

**Chose:** `0` all files reported successfully, `1` report produced but at
least one file failed, `2` no report produced (bad arguments, bad path).

**Why:** "Some files were broken" and "the run never happened" are different
states and a script needs to tell them apart; collapsing both into `1` would
make a typo'd path look like a data problem. Exiting `0` when files failed
would hide the failure from any caller that only checks status.

**GVP:** `code-common:CP12` (don't wander into an unexpected state — name the
state instead), `personal:R2`, `personal:P20` (prefer machine-consumable
signals).

---

## 8. The whole report goes to stdout, including failures

**Chose:** Failure lines are interleaved with success lines in filename order
on stdout. stderr is used only for exit-code-`2` problems.

**Why:** Requirement 4 asks for one line per file in filename order, and
requirement 5 says a failed file is still reported. Splitting the stream would
break that ordering the moment output is piped, because stdout and stderr
interleave unpredictably. The failure is still surfaced loudly — `FAILED` on
the line, counted in the summary, and reflected in the exit code.

**GVP:** `personal:R2` (surfaced, not swallowed) — it is the *how*, not the
*whether*, that this decision picks.

---

## 9. A `--format json` option

**Chose:** Two formats: human-readable text (default) and a single JSON object.

**Why:** A size report is the kind of thing that gets consumed by another
program — compared between runs, thresholded in CI, summed across directories.
Making that possible costs about fifteen lines in one file, and the text format
stays the zero-argument default so nothing is traded away for it.

**GVP:** `personal:P20` (prefer machine-consumable forms where easy),
`personal:P19` (favour low-effort, high-information signals), and
`code-common:CP5` (configuration early, sensible defaults always). Bounded by
`personal:H7` and `code-common:CP11` — see decision 10.

---

## 10. No `--delimiter`, no config file, no other flags

**Chose:** The CLI surface is `<dir>`, `--format`, `--help`. The field
separator and quote character are named constants in `src/csv.ts`, not options.

**Why:** TSV support, custom quoting, recursive scanning, and column-name
reporting are all speculative — nobody has asked for them and the tool is named
after CSV. Every flag added is a commitment to keep, and each one makes the
help output longer for the person who just wants a row count.

**GVP:** `code-common:CH2` (speculative with no concrete use case — defer
entirely, no flex points), `code-common:CP11` (API surface is a commitment),
`personal:H7` (interface consolidation is bounded in both directions).

---

## 11. Node's built-in `parseArgs` and `node:test`

**Chose:** `node:util`'s `parseArgs` instead of commander/yargs; `node:test`
instead of vitest/jest. Dependencies are only `tsx`, `typescript`,
`@types/node`.

**Why:** Both do everything needed here. Three dev dependencies instead of
several hundred transitive packages means the install is trivial, there is no
version churn, and a reader does not have to know a framework to read the
tests.

**GVP:** `code-common:CH1`, `ai-common:P2` (curate for legibility; fewer
patterns to reproduce), `code-common:CP16` (tooling choice is an effort
decision).

---

## 12. Strict TypeScript, beyond `strict`

**Chose:** `strict` plus `noUncheckedIndexedAccess`,
`exactOptionalPropertyTypes`, `noUnusedLocals`, `noUnusedParameters`,
`noFallthroughCasesInSwitch`.

**Why:** `noUncheckedIndexedAccess` is the one that earns its keep in a tool
built on arrays of fields and positional arguments — it caught the unchecked
`positionals[0]` read in the CLI. `noFallthroughCasesInSwitch` guards the
parser's state machine, which is all `switch`.

**GVP:** `code-common:CP7` (strict typing), `code-common:CP10` (prefer
validators and type checks over convention).

---

## 13. An empty file is a failure, not "0 rows, 0 columns"

**Chose:** A zero-byte `.csv` is reported as
`FAILED (file is empty: no header row)`.

**Why:** Requirement 2 makes the first line the header, and requirement 3 makes
the column count a property of that header. A file with no first line has no
header to count, so reporting `0 columns` would be inventing a fact rather than
reporting one. This is a genuine ambiguity in the requirements and the opposite
reading is defensible; it is documented in the README so nobody has to guess.

Note that a file containing only a header *is* a success, with `0 rows`.

**GVP:** `personal:V2` (document the trade-off rather than present a clean
facade), `personal:R2`. The choice itself is not derivable from the library —
see decision 20.

---

## 14. A blank line mid-file is a data row; a trailing newline is not

**Chose:** `a,b\n1,2\n` is one data row. `a,b\n\n1,2\n` is two — the blank line
is a row holding one empty field.

**Why:** The newline that ends the last record is a terminator, so treating it
as a record would report a row that does not exist. A blank line in the middle,
on the other hand, is content: dropping it would quietly reduce a count the
user is asking us to produce, which is exactly the silent discard the library
warns against. It is also consistent with requirement 6 — a one-empty-field row
is just an extreme ragged row.

**GVP:** `personal:V5`, `personal:R2`.

---

## 15. Codepoint ordering, not locale ordering

**Chose:** A plain `<`/`>` comparator, not `localeCompare`.

**Why:** `localeCompare` makes the output depend on the ambient locale, so the
same directory can produce different line orders on two machines and diffs
between runs become noise. That is a hidden dependency on global state.

**GVP:** `code-common:CP3` (no hidden global state; its stated anti-pattern is
code that secretly depends on ambient state).

---

## 16. Anything `.csv`-shaped is either tallied or reported — never skipped

**Chose:** A directory entry is skipped only when it is positively known to be
a directory (including a symlink to one). Everything else ending in `.csv` —
regular file, symlink, broken symlink, unreadable file — becomes a line in the
report, as a success or as a failure.

**Why:** Silently skipping something that looks exactly like a CSV file is the
worst outcome available: the user sees a clean report and has no way to know a
file was left out. Directories are excluded because requirement 1 says *file*,
and a directory named `nested.csv` is not one.

**GVP:** `personal:R2` (failures surfaced, nothing silently dropped).

---

## 17. Case-insensitive extension matching

**Chose:** `DATA.CSV` and `data.csv` are both records.

**Why:** Whether a file is a CSV file should not depend on the case convention
of whoever or whatever produced it, and a report that skipped `DATA.CSV` without
comment would look complete while being wrong (decision 16's concern). The
literal reading of `*.csv` in requirement 1 is case-sensitive on Linux, so this
is a deliberate departure, documented in the README.

**GVP:** Supported by `personal:R2` by extension, but not determined by the
library — see decision 20.

---

## 18. Files are read one at a time

**Chose:** A sequential loop, no concurrency.

**Why:** A report is a handful of sequential reads, and parallel reads would add
a concurrency limit, a results-reordering step, and a less obvious failure
ordering, in exchange for a saving nobody has asked for.

**GVP:** `personal:V1` (complexity must earn its place), `code-common:CH2`.

---

## 19. Unit tests plus end-to-end tests of the real command

**Chose:** `test/csv.test.ts`, `test/tally.test.ts`, `test/report.test.ts` as
unit tests; `test/cli.test.ts` spawns the actual `tsx src/index.ts` and asserts
on real stdout, stderr, and exit codes. 46 tests; `npm run check` runs
typecheck then tests. Each of the nine requirements has at least one test, and I
also ran the tool against `example/` by hand and compared the output with the
README.

**Why:** Unit tests pin the parser's edge cases, which is where the real
difficulty is; the end-to-end tests are the only thing that proves the assembled
command behaves as a command — that exit codes propagate, that output is not
truncated on a pipe, and that `tsx` can actually load the module graph. Test
inputs are written to fresh temporary directories so each test states its exact
bytes inline.

**GVP:** `code-testing:TP1` (both unit and end-to-end), `code-testing:TP2`
(the test is the definition of success), `personal:P13` (verify in the
production runtime, not just the harness), `personal:R1` (verify before claiming
correctness).

---

## 20. Recording the ambiguous calls here instead of stopping to ask

**Chose:** Decisions 13 and 17 — empty-file handling and extension case — are
not unambiguously derivable from the library. I made them, flagged them as
judgement calls in this file and in the README, and kept going.

**Why:** `personal:H5` treats a non-derivable decision as a blocker and asks for
guiding-element patches rather than bare decisions. The task delegated form
explicitly ("write it however you judge best") and named this file as the
record, so stopping would have delivered nothing. In H5's spirit, here are the
patches that would settle these two for next time, as a recommendation rather
than a question:

- *Candidate heuristic* — **Resolve requirement ambiguity toward the reading
  that cannot fabricate a fact.** Where a requirement admits two readings,
  prefer the one that reports "I could not determine this" over the one that
  emits a plausible value derived from absent input. (`0 columns` for a file
  with no header is a fabricated fact; a failure is not.) Maps up to
  `personal:R2` and `personal:V5`.
- *Candidate heuristic* — **Identity of an input should not depend on
  incidental properties of its producer.** Filename case, byte order marks, and
  line-ending style describe the tool that wrote a file, not the file's kind;
  selection and parsing should normalise them. Maps up to `personal:V5` and
  `code-common:CP3`.

Per `personal:P6` both are stated at the domain-agnostic level rather than as
"lowercase the extension".

**GVP:** `personal:H5` (disambiguate-then-surface gate), `personal:H2`
(delegation test — constraints given, form delegated), `personal:V2`,
`personal:P6` (decompose rationale to its most domain-agnostic element).

---

## 21. Smaller calls worth naming

- **`process.exitCode` rather than `process.exit`.** `process.exit` can
  truncate output still being flushed to a pipe, which would be data loss in a
  reporting tool. (`personal:R2`.)
- **Named constants for the separator, quote, extension, encoding, exit codes,
  JSON indent, and help column.** No bare literals carrying meaning.
  (`code-common:CP9`.)
- **Failure reasons contain no absolute paths.** Filesystem errors are reported
  by `code` (`cannot read file (ENOENT)`) rather than by Node's message, which
  embeds the full path — so output is identical on every machine and stays
  comparable between runs. (`personal:P20`.)
- **An `example/` directory.** It makes the README's output reproducible rather
  than claimed, and gives an agent something concrete to run. (`ai-common:P2`,
  `code-testing:TP3`.)
- **Scope.** I did not add recursive scanning, a watch mode, column-name
  reporting, or progress output. None were asked for. (`code-common:CH2`,
  `code-common:CR2` — no scaffolding or speculative structure without explicit
  instruction.)

---

## Library elements checked and found not to apply

`code-common:CP15` (swappable persistence) — nothing is persisted.
`code-web:*` and `code-realtime:*` — no DOM, network, or real-time loop.
`code-common:CP14` / `personal:P10` (structural symmetry) — there are no
plugins or multiple consumer categories here; the closest call was whether
`text` output gets affordances `json` does not, and it does not: both render
from the same `DirectoryReport`.
`code-common:CP10` is only partly honoured — the typecheck and tests exist and
are wired into `npm run check`, but there is no pre-commit hook or CI, because
this directory is not a git repository.
