# Decisions

One section per design choice. Each states what was chosen, why, and which GVP
element informed it (or that none did).

Element ids were read from `./.gvp/library` with `cairn inspect` at the time of
writing, not from memory.

---

## 1. Hand-rolled CSV reader instead of a dependency

**Chose:** `src/csv.ts`, about 130 lines of RFC 4180 reader, rather than
`csv-parse`, `papaparse` or similar.

**Why:** The useful portion here is narrow — quoted fields, doubled quotes,
CRLF, and a definition of "not CSV". That is well under the 200-line threshold,
and a dependency would bring a configuration surface far larger than what this
tool uses. Writing it also means the tool's strictness is a decision I made
rather than one inherited from a library's defaults, which matters because
requirement 5 (failures) and requirement 6 (ragged rows) draw a line that
libraries place differently.

**GVP:** `code-common:CH1` (dependency adoption threshold — under ~200 useful
lines, write it yourself; evaluate what fraction of the library you actually
use). Supported by `personal:V1` (simplicity).

## 2. A chunk-fed incremental reader, not read-whole-file

**Chose:** `CsvReader.feed(chunk)` / `.end()`, driven by a `createReadStream`,
emitting rows to a callback. `readFileSync`/`readFile` was the obvious simpler
alternative.

**Why:** A tool whose whole job is counting rows in files will be pointed at
large files, and `readFile` turns that into an out-of-memory crash — a bad state
rather than a reported failure. The cost of avoiding it was near zero: the same
character state machine serves a whole string and a stream, so there is one code
path, not two. `readCsv(text)` is a five-line wrapper over it for tests and
other callers.

**Verified, not assumed:** peak resident memory is flat across input size — a
45 MB file and a 449 MB file (2,000,000 rows, counted correctly) both peak at
~115 MB against an ~83 MB baseline for an empty run.

**GVP:** `code-common:CH2` (deferral decision tree — "needed for stability or
correctness: implement now", as against deferring speculative features).
`personal:V1` kept it to one state machine. `personal:P2` (empirical validation
before commitment) and `personal:R1` (verify before claiming correctness) are
why the memory figure above was measured rather than asserted.

## 3. Rows are counted and dropped, never accumulated

**Chose:** The reader hands each row to a callback; `countRowsAndColumns` keeps
only two integers and discards the row. Peak memory is one row, not one file.

**Why:** The report needs counts, not contents. Materialising `string[][]` just
to call `.length` on it would undo decision 2.

**GVP:** None specifically — this follows from decision 2.

## 4. Four modules: read, tally, format, CLI

**Chose:** `csv.ts` (text → rows), `tally.ts` (directory → report records),
`format.ts` (records → text/JSON), `index.ts` (arguments, output, exit code).

**Why:** Each boundary is already clean, so there was nothing to discover by
waiting: CSV reading knows nothing of files, tallying knows nothing of
presentation, and the CLI knows nothing of either. The practical payoff is that
the parser is unit-testable without touching a filesystem, and `--json` is a
second formatter rather than a second code path. I did not split further — there
is no `arguments.ts` for one `parseArgs` call.

**GVP:** `personal:P3` (separate what from how at every layer — `tally.ts`
decides what the report says, `format.ts` how it looks), `personal:H1`
(extraction timing — extract now when the boundary is clean and natural),
`code-common:CP13` (testability is a design constraint), `code-common:CP1` (each
change lands in one contiguous block).

## 5. Strict parsing: ambiguous CSV is a failure, with no lenient mode

**Chose:** Three conditions fail a file — an unterminated quoted field, a stray
character after a closing quote (`"ab"c`), and a bare quote inside an unquoted
field (`ab"c`). No `--lenient` flag.

**Why:** Each of these has more than one plausible reading of the user's data. A
lenient parser picks one silently, which reports a confident row count derived
from a guess. Failing the file says "I do not know what this file means" — which
is true, costs nothing (requirement 5 guarantees the run continues), and is
recorded in the exit code. Ragged rows are deliberately *not* in this
category: a row with the wrong number of fields is unambiguous, so requirement 6
is satisfied by counting it.

**GVP:** `personal:R2` (no silent failures — failures must be surfaced, not
swallowed) and `personal:V5` (never silently discard or reinterpret user data),
with `personal:V2` (transparency) requiring the limitation be documented rather
than hidden — it is, in the README.

## 6. `delimiter` and `quote` are code-level options, not CLI flags

**Chose:** `CsvReader` takes `{ delimiter, quote }` with `,` and `"` defaults.
Neither is exposed on the CLI, and there is no `--lenient`.

**Why:** These split cleanly. A CSV reader's delimiter is the canonical
configurable thing and costs two defaulted parameters, so hardcoding it would be
a magic constant that is harder to extract later. A CLI flag is different: it is
a permanent commitment, and nothing in the task needs TSV support or leniency.
So the flex point exists in code where it is cheap, and not in the public
surface where it is expensive.

**GVP:** `code-common:CP5` (configuration infrastructure early, defaults always
— zero-config works) and `code-common:CP9` (named constants for everything
configurable) for the code-level option; `code-common:CP11` (API surface is a
commitment) and `code-common:CH2` (speculative, no concrete use case: defer
entirely) for keeping it off the CLI.

## 7. `--json` output

**Chose:** A `--json` flag emitting `{files, reported, failed}`. Default output
is exactly the human format the task describes.

**Why:** Honest tension here. `personal:V1` says complexity must earn its place,
and strictly the task did not ask for this. But the formatter seam from decision
4 exists regardless, which makes this ~12 lines, and a report of counts is
precisely the kind of signal something downstream wants to read. I judged the
library's preference for machine-readable signals to outweigh the small addition,
and kept the default untouched so nothing is traded away.

**GVP:** `personal:P20` (prefer machine-consumable forms where easy) and
`personal:P19` (favour low-effort, high-information signals), weighed against
`personal:V1`. Recorded here because `personal:V2` asks for the trade-off to be
stated rather than presented as obvious.

## 8. One CLI entry point with flags

**Chose:** `tally <dir> [--json]` — no `tally-json` subcommand, no
`tally report` / `tally summary` split.

**Why:** There is one task. Everything a user wants is reachable from one
`--help` screen.

**GVP:** `personal:P8` (consolidated interfaces over many near-duplicate entry
points) and `personal:H7` (consolidation is bounded in both directions — judged
by how many times you must consult help output for one task; here, once).

## 9. Exit codes 0 / 1 / 2

**Chose:** `0` all files reported, `1` run completed but a file failed, `2`
arguments or directory unusable so no report exists. Named constants in
`index.ts`.

**Why:** Requirement 5 says a file failure must not stop the run; it does not say
the failure should be invisible to whatever invoked the tool. The summary line
tells a human; the exit code tells a script. `2` is separate from `1` because
"here is a report, one entry failed" and "there is no report" are different
outcomes that a caller may well want to distinguish.

**GVP:** `personal:R2` (failures must be surfaced), `personal:P20`
(machine-consumable signals), `code-common:CP9` (named constants, not bare
`process.exit(2)`), `code-common:CP12` (know what state you are in — the three
codes are the three states).

## 10. Per-file failures on stdout, in filename order; usage errors on stderr

**Chose:** A failed file prints `name: failed — reason` inline in filename order
on stdout. Only directory-level and argument errors go to stderr.

**Why:** Requirement 4 asks for one line per file in filename order, and a file
that failed is still one of the files — moving it to stderr would make the
report incomplete and unordered, and would interleave unpredictably when
redirected. Argument and directory errors are not report entries, so they go to
stderr and leave stdout empty.

**GVP:** `code-common:CP12` (explicit handling with clear messages over a
blanket strategy). The ordering requirement came from the task, not the library.

## 11. The unterminated-quote error names the line that opened the quote

**Chose:** `CsvReader` tracks `quoteStartLine`; the error says line 2 for
`a,b\n"unterminated,2\n` — where the broken field begins — not the line where
end-of-input happened to land.

**Why:** An unterminated quoted field swallows the rest of the file, so the line
the reader gave up on is usually the last line and tells the user nothing. The
line that opened the quote is the line to go fix. My first implementation
reported the wrong one; a test caught it, and the test that pins it is now in
`tests/csv.test.ts`.

**GVP:** `code-common:CP12` (prefer explicit handling with clear messages) and
`code-common:CP2` (clarity — the message exists to be acted on).

## 12. Filename order is code-unit order, not locale collation

**Chose:** Plain `Array.prototype.sort()`, with a comment saying why not
`localeCompare`.

**Why:** `localeCompare` sorts differently depending on the ambient locale and
the ICU build Node was compiled against, so the same directory could produce
differently-ordered reports on two machines. That makes output untestable and
undiffable. Code-unit order is deterministic everywhere.

**GVP:** `code-common:CP3` (explicit over implicit — no hidden dependency on
ambient locale) and `personal:R1` (verify before claiming correctness — a
locale-dependent ordering cannot be pinned by a test).

## 13. The extension is matched case-insensitively

**Chose:** `name.toLowerCase().endsWith('.csv')`, so `REPORT.CSV` is reported.

**Why:** A user with `REPORT.CSV` in their directory means it as a CSV file, and
a tool that silently ignored it would look broken. `toLowerCase` rather than
`toLocaleLowerCase` keeps this locale-independent, consistent with decision 12.

**GVP:** `personal:P8` (the interface should match the consumer's mental model,
not the implementation's) and `personal:R2` (not silently dropping something the
user expects in the report).

## 14. A `*.csv` entry that is not a regular file is a failure, not a skip

**Chose:** A directory named `imposter.csv`, or a dangling symlink, is reported
as a failure. Symlinks to real files are followed and counted normally (one
`stat` handles both, so links need no special case).

**Why:** Two defensible readings existed — it is not a file, so "files that are
not `*.csv` are left alone" could cover it. I chose to surface it because
silence here is indistinguishable from a bug: the user named something `.csv`
and would reasonably expect a line about it. Saying "not a regular file" answers
the question; omitting the line raises one.

**GVP:** `personal:R2` (no silent failures or data loss — if something is
discarded it must be explicit) and `code-common:CP12` (don't wander into a state
the user cannot see).

## 15. An empty file succeeds with 0 rows, 0 columns

**Chose:** A zero-byte `*.csv` is a success reporting `0 rows, 0 columns`, not a
failure. A file containing only a newline is distinct: one empty column, zero
rows.

**Why:** Nothing went wrong reading it, so calling it a failure would claim an
error that did not occur and inflate the failed count. `0 rows, 0 columns` is
accurate and complete. See the review note below — this is one of two calls the
library did not settle.

**GVP:** Argued from `code-common:CP12` (the state is known exactly — the file is
empty — so report it rather than erroring) and `personal:R2` (surfaced
explicitly, not skipped), but neither makes it unambiguous.

## 16. A blank line mid-file is a data row; the final terminator is not

**Chose:** `a,b\n\n1,2\n` is three rows (header, one empty field, data).
`a,b\n1,2\n` is two rows — the trailing newline terminates the last row rather
than starting an empty one.

**Why:** A blank line is a line that is in the file, and a row with one empty
field is consistent with how decision 5 treats ragged rows: structurally
unambiguous, so count it rather than discard it. Skipping blank lines would be
silently dropping input. The trailing-terminator case is different and
uncontroversial — a terminator ends the row before it.

**GVP:** `personal:V5` (never silently discard data) and `personal:R2`. Also
flagged below: "blank lines are noise, skip them" is a defensible reading that
the library does not rule out.

## 17. Files are read sequentially

**Chose:** A plain `for` loop awaiting one file at a time, not
`Promise.all`/a concurrency pool.

**Why:** Output order comes from the sort, not from completion order, so
concurrency would not change the result — only the speed, at the cost of
bounding file descriptors and reasoning about interleaved failures. No
performance requirement exists to justify that. The README states this so the
omission is visible rather than accidental.

**GVP:** `code-common:CH2` (speculative with no concrete use case: defer
entirely, no flex points) and `personal:V1`. Documented per `personal:V2`.

## 18. Collect all records, then print once

**Chose:** `tallyDirectory` returns the full `FileReport[]`, which is formatted
and printed in one go, rather than streaming each line as the file finishes.

**Why:** `--json` needs the whole array anyway, so streaming text would mean two
output paths that could drift. The buffer is one small record per file —
unrelated to file size, which decision 2 already handles. The trade-off is no
progressive output on a slow directory; the counts are small enough that this
did not seem worth two code paths.

**GVP:** `code-common:CP4` (centralise shared logic — one output path, not a
per-mode one) and `personal:V1`.

## 19. Erasable TypeScript syntax, so two runtimes work

**Chose:** No `enum`, no constructor parameter properties. Parser states are a
`const` object plus a derived union type. `erasableSyntaxOnly` in `tsconfig.json`
enforces it, which is how the violation I had written was caught.

**Why:** Staying erasable means the tool runs under both `npx tsx src/index.ts`
and `node --experimental-strip-types src/index.ts` — the latter needing no
dependency at all. Both are documented, and I ran both. The cost was two small
code shapes.

**Honest tension:** `code-common:CP3` says "enums over string literals". I kept
its intent — states are named, never inline literals — but not a TS `enum`,
because that would cost a whole runtime. Noting it rather than pretending the
letter was followed.

**GVP:** `personal:V7` (flexibility/optionality — don't foreclose a runtime for
no gain) and `personal:P13` (verify in the production runtime, not just the test
harness) for actually running both. `code-common:CP10` (prefer a type check over
a convention) for enforcing it with a compiler flag instead of a comment.

## 20. Tests: unit, end-to-end, and a typecheck script

**Chose:** 48 tests across `csv.test.ts` (reader, in isolation), `tally.test.ts`
(directory and filesystem behaviour), `cli.test.ts` (the real CLI spawned as a
child process, asserting stdout and exit codes). `npm test` and
`npm run typecheck`.

**Why:** The unit tests pin the parser's edge cases where they are cheap to
express; the e2e tests prove the assembled thing does what a user asked for,
including the exit codes, which no unit test can observe. Every numbered
requirement in `TASK.md` has at least one test, and so does every judgement call
above. Decision 4's seams exist largely so this was possible.

**GVP:** `code-testing:TP1` (tests for all code, unit *and* end-to-end — code
shipped without tests is unverified, not done), `code-testing:TP2` (the test is
the executable definition of success), `code-testing:TP3` (an agent must be able
to fully exercise the implementation — hence spawning the real binary rather
than importing `main`), `personal:P7` and `code-common:CP10` (an enforcement
mechanism, not a convention).

## 21. Fixtures are generated inside the project, not committed and not in /tmp

**Chose:** Tests build fixture directories under `.test-tmp/` via `mkdtemp` and
remove the ones they made; `.test-tmp/` is gitignored.

**Why:** Three reasons. Each case's input sits next to its assertions instead of
in a distant `fixtures/` tree. Cases needing a mode-`000` file or a directory
named `imposter.csv` need nothing unusual in version control. And keeping them
inside the project means a test run never touches anything outside it — which
the task required. Each process deletes only its own directories, so the
parallel test files cannot clear each other's fixtures mid-run. The
permission-denied test skips itself when running as root, where it would be
vacuous.

**GVP:** `code-common:CP1` (one contiguous block — input beside assertion),
`ai-common:C2` (a curated working tree; no stale fixture files accumulating),
and `code-testing:TP3` for the honest skip rather than a test that silently
proves nothing.

## 22. Name, and no new library entries

**Chose:** Kept `tally` as given. Did not add anything to `.gvp/library`.

**Why:** The name was specified, and it is plainly descriptive for a tool of this
reach. On the library: these decisions are guided output, not guidance. The two
genuinely underdetermined ones are surfaced below as proposed patches for review
rather than quietly written into the library by me.

**GVP:** `personal:H9` (scale naming effort to expected reach — a
plainly descriptive name is the right outcome for a small-audience tool),
`personal:P15` (humans review guiding elements, not decisions).

---

## Note for review: two calls the library did not settle

`personal:H5` says a blocker is "any decision that cannot be unambiguously
derived from the library", and that the right response is to propose the
guiding-element patch that would settle it — the patch, not the bare decision.
Two decisions above are in that category. Since the task was to build the tool
and stop, I took a documented default for each and recorded it here rather than
blocking; both are one-line changes with no dependents, so reversing either is
cheap (`personal:H8` — buy reversibility when it costs less than proof).

**a. Empty input files (decision 15).** Success at `0 rows, 0 columns`, or a
failure for having no header row?

- Patch for success: extend `code-common:CP12` with — *"A fully-known, benign
  state is reported as a successful result describing it, not as an error.
  Reserve failure for states where the correct output is unknown."*
- Patch for failure: add a rule — *"When a format defines a mandatory element, an
  input lacking it fails validation even when the absence is unambiguous."*
- Recommendation: the first. Nothing went wrong, and reporting `0, 0` is both
  accurate and more useful to a caller than an error.

**b. Blank lines mid-file (decision 16).** A data row with one empty field, or
skipped as noise?

- Patch for counting: extend `personal:V5` with — *"Structurally unambiguous
  input is never discarded as noise, even when it is likely to be
  insignificant. Only the consumer may decide it is noise."*
- Patch for skipping: add a heuristic — *"Where a format's whitespace carries no
  data, normalise it away at the boundary rather than passing it through."*
- Recommendation: the first, for consistency with decision 5 — the tool
  discards nothing structurally unambiguous, which is also what makes ragged
  rows countable under requirement 6.
