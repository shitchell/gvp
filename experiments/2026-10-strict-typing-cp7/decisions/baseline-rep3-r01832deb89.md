# Decisions

One section per design choice made while building `tally`. GVP element ids refer
to the library in `./.gvp/library` (queried with `cairn --library ./.gvp/library`).

---

## 1. Hand-written CSV parser instead of a dependency

**Chose:** `src/csv.ts` — a 223-line module, of which roughly 150 lines are the
state machine and the rest its dialect documentation — rather than `csv-parse`,
`papaparse`, or similar. The only dependencies are dev-time:
`tsx`, `typescript`, `@types/node`.

**Why:** The tool needs record boundaries and field counts under one quoting
dialect. That is the "useful portion" of a CSV library, and it is small enough
that owning it is cheaper than owning the dependency plus the work of bending its
error reporting into per-file failures. Writing it also made requirements 5–7
(what is malformed, what is merely ragged) explicit decisions rather than
whatever a library happened to do.

**GVP:** `code-common:CH1` (dependency adoption threshold — under ~200 useful
lines, write it yourself), supported by `personal:V1`.

---

## 2. The parser streams; it never buffers a whole file

**Chose:** `CsvParser.write(chunk, onRecord)` / `end(onRecord)` fed from a
`fs.createReadStream`, emitting one record at a time. Not `readFile` then split.

**Why:** A tool whose entire purpose is measuring how big files are will be
pointed at big files. Bounded memory is a correctness property here, not a
feature, and a character-at-a-time state machine has to exist anyway to handle
quoted newlines — so streaming cost perhaps 15 extra lines (the `stream: true`
decode and the pending-CR flag) rather than a new design. Verified empirically:
a 39 MB / 800k-row file with quoted commas and embedded newlines tallies
correctly in 2.4 s under `--max-old-space-size=64`.

**GVP:** `code-common:CH2` (needed for correctness or stability → implement now;
the deferral tree only defers additive features), and `personal:P2` (empirical
validation before commitment — hence the large-file run rather than an argument
that it should work).

---

## 3. The parser emits whole records, not just field counts

**Chose:** `onRecord(fields: readonly string[])` — real field values — even
though `tally` only ever uses `fields.length`.

**Why:** Field counts are what this consumer wants; records are what a CSV
reader is. Emitting records costs one string allocation per field and keeps
memory bounded all the same (one record at a time), and it makes `src/csv.ts`
usable by anything else without a rewrite. `parseCsv(text)` sits on top for
small inputs and tests.

**GVP:** `code-common:CP6` (proactive reusability — parameterize and extract so
code can serve other purposes), `personal:V3`.

---

## 4. Module split: `csv.ts` → `tally.ts` → `format.ts` → `index.ts`

**Chose:** Four files: a CSV dialect reader, the directory/file report model, the
renderers, and the CLI (arguments, streams, exit status). Each requirement in
TASK.md lands in exactly one of them.

**Why:** The seams are the ones the problem already has, and they are the seams
that make testing cheap: the parser is tested on strings, the report on scratch
directories, the renderers on literal report objects, the CLI on a real process.
Changing the output format touches one file; changing the dialect touches
another.

**GVP:** `personal:P3` (separate what from how at every layer),
`code-common:CP1` (one contiguous block per change),
`code-common:CP13` (testability is a design constraint).

---

## 5. A per-file failure is a value in the report, not an exception

**Chose:** `FileResult = FileTally | FileFailure`, a discriminated union on `ok`.
`tallyFile` never throws. `tallyDirectory` throws only when the directory itself
cannot be listed.

**Why:** Requirement 5 says one bad file must not stop the run, and requirement 4
says it still gets its line in filename order — so a failure is part of the
report's data, and modelling it as data makes "the report is complete, one file
failed" distinguishable from "there is no report" (exit 1 vs exit 2). Failing to
list the directory is the second kind: there is nothing to print, so it is fatal
and says so on stderr.

**GVP:** `code-common:CP12` (know what state you are in; ask per failure what the
consequence is and whether the user needs to know, rather than applying
fail-fast or degrade-gracefully as dogma), `personal:R2` (no silent failures),
`code-common:CP7` (strict typing — the union forces callers to handle both).

---

## 6. Which inputs are failures, and which are just ragged

**Chose:** Exactly two syntax failures — input ending inside a quoted field, and
a character other than the delimiter or a line break directly after a closing
quote (`"ab"cd`). Everything else parses: ragged rows, a bare `"` inside an
unquoted field (`he said "hi"`), a lone `,` on a line (two empty fields).

**Why:** Requirement 6 forbids treating a ragged row as a failure, and
requirement 5 implies some inputs genuinely are failures, so the line has to be
drawn deliberately. The two rejected cases are the ones where the intended field
boundaries are unknowable — any answer the parser produced would be invented
data. Everything else has an unambiguous reading, so it gets read.

**GVP:** `personal:R2` and `personal:V2` (do not present a clean facade over a
guess; surface the problem instead), `code-common:CP12`.

---

## 7. A blank line is not a record, anywhere in the file

**Chose:** A record with no characters at all is skipped, whether it is the
trailing newline of the last data row, a blank line in the middle, or a file of
newlines. A line holding only a delimiter *is* a record (two empty fields).

**Why:** Something must stop the final newline of a well-formed file from
counting as a row, or every file reports one row too many. The choice is between
a special case ("ignore the last record if empty") and a uniform rule ("a record
with no characters is not a record"). The uniform rule covers the whole class,
reads the same everywhere in the code, and matches what "how many data rows it
holds" means to a person: a blank line holds nothing.

**GVP:** `personal:P4` (generic solutions over special-case handling — handle the
class, not the instance).

---

## 8. An empty file is a success with 0 rows and 0 columns

**Chose:** Zero-byte (or BOM-only) files are reported as `0 rows, 0 columns`,
not as failures.

**Why:** Genuinely ambiguous: requirement 2 presumes a header row, and a file
with no header arguably cannot answer "how many columns does its header
declare". But the file can be read, and it holds no data — reporting `0, 0` says
exactly that, whereas calling it a failure would overload "failure" with "empty"
and make exit code 1 fire for a file that is merely unremarkable. Documented in
the README so the reading is not a surprise.

**GVP:** `code-common:CP12` (what is the consequence, can we recover, should we
stop — recoverable and honest here), `personal:V2` (document the reading
explicitly rather than leaving it implicit).

---

## 9. Strict UTF-8 decoding

**Chose:** `new TextDecoder("utf-8", { fatal: true })`, so undecodable bytes make
the file a reported failure. A leading BOM is stripped.

**Why:** Node's default is to replace bad bytes with `U+FFFD` and carry on, which
would produce a confident row count for a file that is not text. Silently
mangled input that still yields a number is worse than a file that says it
failed.

**GVP:** `personal:R2` (failures must be surfaced, not swallowed),
`personal:V5` (never silently discard or corrupt the user's data).

---

## 10. Report on stdout as one stream; failures inline, not on stderr

**Chose:** Failure lines go to stdout in their sorted position among the success
lines. stderr carries only whole-run errors (bad arguments, unreadable
directory).

**Why:** Requirement 4 wants one line per file in filename order, and splitting
the report across two streams destroys that order for anyone reading the
terminal or piping it. Exit status, not stream choice, is what tells a script
that something failed.

**GVP:** `personal:P20` (shape output so a program can read it — one ordered
stream plus a status code is parseable; interleaved streams are not).

---

## 11. `--format json`, but extension and delimiter stay library options

**Chose:** The CLI has exactly two options: `--format text|json` and
`--help`. `extension` and `delimiter` are options on `tallyDirectory`
(defaulting to `.csv` and `,`) with no flags attached.

**Why:** Two pulls in tension. `personal:P21` and `code-common:CP5` want flex
points wired up early and exposed as config; `personal:V1`,
`code-common:CP11` (every flag is a commitment, adding is easy and removing is
expensive) and `personal:H7` (judge consolidation by how many times someone must
consult `--help` for one task) want a small surface. Resolved by splitting them:
the seams exist in the code from the start, so a `--delimiter` flag is additive
whenever a real use appears, while today's help output stays one screen. JSON is
the exception that earns a flag now, because machine-consumability is a
standing preference and it was cheap.

**GVP:** `code-common:CP5`, `personal:P21`, `personal:P20` for the JSON flag;
`code-common:CP11`, `personal:H7` and `personal:V1` for keeping the rest
internal.

---

## 12. Three exit codes: 0, 1, 2

**Chose:** `0` all files reported; `1` report complete but some file failed; `2`
could not run (bad arguments, or `<dir>` unreadable). Named constants in
`src/index.ts`, documented in `--help` and the README.

**Why:** These are the three states a caller can be in, and they are the three
states the code distinguishes internally (§5), so the status code carries the
distinction out to a script instead of collapsing it.

**GVP:** `code-common:CP12` (always know which state you are in),
`code-common:CP9` (named constants for everything configurable),
`personal:P20`.

---

## 13. Case-insensitive extension match, shell-glob file set

**Chose:** `DATA.CSV` matches; `.hidden.csv` and a file named exactly `.csv` do
not; `data.csv.bak` does not. One predicate, `matchesExtension`, with the
extension as a named default.

**Why:** TASK.md says `*.csv`, so the shell glob is the reference for which
entries are in scope, and dot-files are not in it. Case is the one place the
glob's answer is platform-dependent: on a case-insensitive filesystem the
distinction does not survive at all, so matching only lowercase would make the
report depend on which machine it ran on. Matching both is the stable reading.

**GVP:** `code-common:CP9` (the extension is a named constant, not a literal
buried in a filter), `personal:V2` (the deviation from a literal `*.csv` is
documented in the README rather than left to be discovered).

---

## 14. Code-unit sort order, not locale collation

**Chose:** An explicit comparator on UTF-16 code units, so uppercase sorts
before lowercase (`Mango.CSV` before `apple.csv`).

**Why:** `localeCompare` would read more naturally to a human, but it makes the
report depend on the machine's locale — the same directory would produce
different output in different environments, which is worse for a tool meant to be
diffed or piped. Nothing in the GVP library bears on this directly; it is a
judgement call in favour of reproducibility, and the comparator is written out
rather than left implicit in `.sort()` so the choice is visible.

**GVP:** none directly.

---

## 15. Unit tests and an end-to-end test, on `node:test`

**Chose:** 56 tests across `test/csv.test.ts` (dialect and chunk-boundary
behaviour), `test/tally.test.ts` (fixtures on disk, every failure mode),
`test/format.test.ts` (exact rendered output), and `test/cli.test.ts`, which
spawns `node --import tsx src/index.ts` and asserts stdout, stderr, and exit
status. Runner: Node's built-in test runner via `tsx`, no test framework
dependency.

**Why:** Each numbered requirement in TASK.md has a test that fails without it —
including the ones easiest to get wrong silently (the trailing newline not
adding a row, a mid-record chunk boundary, a split CRLF pair, a multi-byte
character split across chunks). The e2e test runs the exact command the README
documents, in a real process, because a green library test can hide a loader or
argument-handling problem that only the real entry point shows.

**GVP:** `code-testing:TP1` (unit *and* end-to-end; untested code is unverified,
not done), `code-testing:TP2` (the test is the executable definition of
success), `personal:P13` (verify in the production runtime, not just the test
harness), `code-common:CH1` again for using the built-in runner.

---

## 16. Test fixtures live inside the project

**Chose:** `test/support.ts` creates scratch directories under
`./.test-scratch/` and removes them afterwards, rather than using
`os.tmpdir()`.

**Why:** The brief for this task says not to run the tool against anything
outside this directory; generated fixtures (invalid UTF-8 bytes, a directory
named `archive.csv`) are easier to build than to check in, and keeping them
inside the project honours that constraint while leaving no stale artifacts
behind. `.test-scratch/` is gitignored.

**GVP:** `ai-common:P2` (curate the working tree — no stale generated artifacts
left lying around for the next reader, human or agent).

---

## 17. Verification gate as npm scripts, with no hook available

**Chose:** `npm run typecheck`, `npm test`, and `npm run check` for both. Strict
`tsconfig.json` (`strict`, `noUncheckedIndexedAccess`,
`exactOptionalPropertyTypes`, `noUnusedLocals`, …). Both run clean as of this
writing.

**Why:** `personal:R1` and `code-common:CP10` want the check mechanised rather
than remembered — ideally a pre-commit hook or CI gate. This directory is not a
git repository and has no CI, so the honest position is: the gate is one
documented command, which is a convention rather than a guarantee. If this
becomes a repository, `npm run check` is what the hook should run.

**GVP:** `personal:R1` (typecheck must pass, tests must pass, verify before
claiming correctness), `code-common:CP10` (prefer hooks and validators over
convention — noted as unmet here, per `personal:V2`), `code-common:CP7`.

---

## 18. `ParserState` is a string-literal union, not a TypeScript `enum`

**Chose:** `type ParserState = "field-start" | "unquoted" | "quoted" |
"after-quote"`.

**Why:** `code-common:CP3` says "enums over string literals", and its target is
unlabelled magic values. A named union satisfies that intent — the states are
named, exhaustively checked by the compiler, and invalid values are a type error
— while staying fully erasable, so the code also runs under a plain
type-stripping runtime (`node --experimental-strip-types`), which a TypeScript
`enum` would break. Same guarantee, fewer constraints on how the code can be
run.

**GVP:** `code-common:CP3`, read for intent rather than letter; `personal:V7`
(keep options open — here, which runtime can execute the file).

---

## 19. No `bin` entry in `package.json`

**Chose:** Removed the `bin: { tally: "src/index.ts" }` field I first wrote;
kept `npm run tally` and the documented `npx tsx src/index.ts <dir>`.

**Why:** A `bin` pointing at a `.ts` file without a working shebang advertises an
installation path that does not actually work. An artifact that implies a
capability the project lacks misleads the next reader — and agents reproduce
whatever the working tree shows them.

**GVP:** `ai-common:C2` / `ai-common:P2` (the working tree must not teach wrong
patterns), `personal:V2`.

---

## 20. Sequential file reads

**Chose:** `for … await` over the sorted filenames, one file at a time, rather
than `Promise.all`.

**Why:** The report must come out in filename order regardless, so concurrency
buys only wall-clock on many-small-files directories, at the cost of being able
to exhaust file descriptors on a large directory. Noted as a limit in the README
so the trade-off is visible rather than silent.

**GVP:** `personal:V1` (simplest approach that meets the requirement;
concurrency would be complexity that has not earned its place),
`personal:V2` for recording it.

---

## 21. Names describe behaviour

**Chose:** `countCsvStream`, `matchesExtension`, `recordHasCharacters`,
`carriageReturnPending`, `FileTally` / `FileFailure`. Long where that is clearer.

**Why:** Each name says what the thing does or is, so the parser's state
bookkeeping can be read without reconstructing the state machine first. `tally`
itself was given by TASK.md, and a plainly descriptive name is the right outcome
for a tool this size anyway.

**GVP:** `code-common:CP8` (names describe purpose, not lineage),
`code-common:CP2` (clarity over cleverness — descriptive names even if long),
`personal:H9` (scale naming effort to expected reach).

---

## Ambiguities resolved without escalating

`personal:H5` treats a blocker as a decision that cannot be derived from the
library, and otherwise says to record the decision and proceed. Three decisions
were close enough to be worth naming here: the empty-file reading (§8), the
case-insensitive match (§13), and the CLI surface (§11). In each case the
existing elements yielded one defensible answer, so none was escalated as a
guiding-element patch. The only decision with no element behind it at all is the
sort comparator (§14).
