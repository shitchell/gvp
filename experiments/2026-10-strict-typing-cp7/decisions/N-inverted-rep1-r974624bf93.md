# Design decisions

One section per design choice made while building `tally`. Each states the
choice, the reasoning, and which GVP element informed it (element ids from
`./.gvp/library`, queried with `cairn`).

The library has no project-level file for `tally`, so everything below draws on
`personal`, `code-common`, `code-testing`, and `ai-common`.

---

## 1. Hand-written CSV scanner instead of a CSV library

**Chosen:** `src/csv.ts`, about 100 lines, implementing the RFC 4180 subset the
tool needs. No `csv-parse`, `papaparse`, or similar.

**Why:** The useful portion of a CSV library here is small — quoted fields,
escaped quotes, embedded newlines, three line-terminator forms. That is well
under the threshold where taking on a dependency pays for itself, and a parser
owned in-tree means the ambiguity rules (section 5) are explicit rather than
inherited from someone else's defaults.

**GVP:** `code-common:CH1` (dependency adoption threshold — if the useful
portion of an external library is ~200 lines or fewer, write it yourself).

## 2. The scanner counts fields; it does not build them

**Chosen:** `scanRecordFieldCounts(text)` is a generator yielding one number
per record — the record's field count. It never allocates a field string, and
never holds more than one count at a time.

**Why:** The tool needs exactly two numbers per file: the header's field count
and the number of records after it. A full parser that materialises every field
would be a generalisation with no consumer. Laziness is nearly free here (a
generator rather than an array) and keeps memory flat in the number of rows.

**GVP:** `personal:V1` (simplicity — every generalisation should solve a real
problem, not a hypothetical one) and `code-common:CH2` (deferral decision tree:
a speculative feature with no concrete use case is deferred entirely).

**Trade-off, stated plainly:** the scanner cannot be reused to read CSV
*values*. That is a real limit on its reuse, accepted because no caller wants
values. `src/csv.ts` documents it.

## 3. Five modules: scanner, walker, formatter, CLI, entry point

**Chosen:** `csv.ts` (text → structure), `tally.ts` (directory → report model),
`format.ts` (report model → text or JSON), `cli.ts` (arguments, exit codes,
usage), `index.ts` (three lines: call `cli.ts`).

**Why:** Each boundary is clean and already load-bearing rather than
anticipated: the scanner is pure and knows nothing of files; the walker knows
nothing of rendering; the formatter knows nothing of the filesystem; the CLI is
the only thing that touches `process`. The split is what makes the first three
testable without a subprocess or a temp directory. Each requirement lands in
one module — the output format changes only `format.ts`, the quoting rules only
`csv.ts`.

**GVP:** `code-common:CP13` (testability is a design constraint, not an
afterthought), `code-testing:TP2` (design every feature with testing in mind),
`code-common:CP1` (one contiguous block — a change should not be scattered),
and `personal:P3` (separate what from how at every layer).
`personal:H1` (extraction timing) is the reason the count stops at five: these
boundaries are clear now, so extract now; nothing further had a second consumer
forcing it.

## 4. The report is a plain data structure; rendering is separate

**Chosen:** `tallyDirectory` returns `TallyReport` — a list of per-file records
plus the two summary counts. Nothing in `tally.ts` prints.

**Why:** The same model drives the human-readable table, the JSON output, and
the assertions in `test/tally.test.ts`. A function that printed as it walked
would be testable only through its stdout.

**GVP:** `personal:P3` (what versus how) and `code-common:CP13`.

## 5. Strict only where the data is genuinely ambiguous

**Chosen:** two uniform rules. A field that *starts* with `"` must be closed by
a `"` followed by a delimiter, a line terminator, or end of input — otherwise
the file is malformed. A `"` anywhere else is an ordinary character, so
`a"b,c` is two fields and not an error.

**Why:** Requirement 5 needs a definition of "cannot be read as CSV", and the
honest one is "the extent of a field cannot be determined". `"abc` with no
closing quote and `"a"b` both leave the field boundary genuinely ambiguous;
guessing would silently produce a wrong row or column count. A bare quote mid-
field is not ambiguous at all — the field count is unaffected — so rejecting it
would be strictness without a reason. Two rules, applied uniformly, rather than
a pile of special cases.

**GVP:** `code-common:CP12` (know what state you are in; never wander into an
unexpected bad state — for each failure ask what the consequence is and whether
the user needs to know) and `personal:R2` (no silent failures). The uniformity
of the two rules over a case-by-case list follows `personal:P4` (generic
solutions over special-case handling — special-case fixes accumulate) and
`personal:P9` (follow rules uniformly rather than breaking one for a one-off).

## 6. An empty file is a failure, not a file with zero rows and zero columns

**Chosen:** a zero-byte `*.csv` is reported as
`FAILED: no header row: the file is empty`.

**Why:** Requirement 3 asks for "how many columns its header declares". A file
with no header declares nothing; reporting `0 cols` would be a fabricated
answer that reads identically to a real measurement. Saying so is the honest
report. (A header-only file is different — it has a header, so it is a success
with 0 data rows, and there is a test for each.)

**GVP:** `personal:V2` (transparency — never present a clean facade over an
unclear situation) and `personal:R2` (failures surfaced, not swallowed).

## 7. Two failure channels: per-file failures are data, directory failures throw

**Chosen:** anything wrong with an individual file (unreadable, unterminated
quote, empty) becomes a `FileTallyFailed` record in the report. Anything wrong
with the directory itself (missing, not a directory, unreadable) aborts with a
message on stderr and exit code 2. A defect in `tally` itself is re-thrown and
crashes with its stack rather than being dressed up as user error.

**Why:** Requirement 5 requires the first. The second is a different state:
there is no report to salvage, and emitting `0 files reported, 0 failed` for a
typo'd path would be a quietly wrong answer. The third keeps the tool from
claiming a bug is the user's mistake.

**GVP:** `code-common:CP12` (error handling is not "fail fast" or "degrade
gracefully" as dogma — know the state and handle each case) and
`personal:R2`.

## 8. Three exit codes, named

**Chosen:** `EXIT_CODE.Success` (0), `FileFailures` (1), `UsageError` (2), as a
named `as const` object, listed in `--help`.

**Why:** A caller scripting around `tally` needs to tell "the report is
complete" from "the report has gaps" from "there is no report". Bare numeric
literals at the `process.exitCode` assignment would leave that distinction
undocumented.

**GVP:** `code-common:CP9` (named constants for everything configurable),
`code-common:CP3` (explicit over implicit; enums over string literals), and
`personal:P20` (prefer machine-consumable forms where easy — an exit code is
the cheapest machine-readable signal a CLI has).

**Known gap, stated:** an unexpected defect propagates as an unhandled
rejection, which Node also exits 1 on. It is distinguishable by the stack trace
on stderr. A fourth code was not added because a crash should look like a
crash.

## 9. `--format json` as well as text

**Chosen:** `--format text|json`, defaulting to `text`.

**Why:** The report model already exists as data (section 4), so the JSON
renderer is about ten lines. A tool whose whole output is counts is an obvious
input to something else, and the aligned text table is awkward to parse.

**GVP:** `personal:P20` (prefer machine-consumable forms where easy),
`personal:V4` (user autonomy — the system provides options and defaults, the
user decides), `code-common:CP5` (configuration early, but always a sensible
default so zero-config works).

**Tension, acknowledged:** `code-common:CH2` would defer a feature with no
concrete use case, and `code-common:CP11` warns that every flag is a
commitment. The flag is included because `personal:P20` is not a speculative
bet about a future consumer but a standing preference about the shape of
signals, and because the cost here is a `switch` with two arms over a model
that had to exist anyway. Had the JSON path required its own traversal of the
filesystem, `CH2` would have won.

## 10. `*.csv` read literally: case-sensitive, no dotfiles, no recursion

**Chosen:** a name matches if it ends in `.csv` and does not start with `.`.
`DATA.CSV` and `.hidden.csv` are left alone, and subdirectories are not walked.

**Why:** Requirement 1 says "every `*.csv` file **directly under** `<dir>`" and
writes the pattern in lowercase. That is the behaviour specified, and a shell
glob is case-sensitive and skips dotfiles. Being more generous than the
requirement would be inventing behaviour; `--recursive` or a
case-insensitivity flag can be added later without breaking anything.

**GVP:** `personal:P3` (requirements specify behaviour — honour the stated
behaviour rather than an implementation's preference) and
`code-common:CP11` (prefer additive changes later over breaking ones now).

## 11. Symlinks are followed; non-file entries are skipped, not failed

**Chosen:** `readdir` dirent types answer the question for free in the common
case. A symlink — or an entry whose type the filesystem did not report — gets a
`stat`, which follows the link. A directory, socket, or dangling link named
`*.csv` is skipped silently.

**Why:** Requirement 1 scopes the report to *files*. A directory named
`data.csv` was never a CSV file, so counting it as a failure would inflate the
failure count and misreport the directory. Following symlinks is right because
what matters is what would actually be read.

**GVP:** `personal:P3` (the requirement's words are the behaviour) and
`code-common:CP12` (be deliberate about each state rather than applying one
blanket policy). Note this is the one place `personal:R2` is traded against:
if a `stat` on a symlink fails for an unexpected reason, the entry is skipped
rather than reported. It is confined to the uncommon branch and commented in
`src/tally.ts`.

## 12. Filename order by UTF-16 code unit, not locale collation

**Chosen:** a `compareFileNames` helper using `<` / `>`, explicitly not
`localeCompare`.

**Why:** `localeCompare` makes the report's row order depend on the ambient
`LANG` of the machine, so the same directory would produce different output on
two machines and the golden end-to-end test would be flaky-by-environment.

**GVP:** `code-common:CP3` (explicit over implicit — no hidden dependency on
global state) and `personal:R1` (verification means something only if the
result is reproducible).

## 13. Node's built-in test runner and argument parser

**Chosen:** `node:test` + `node:assert/strict` for tests, `node:util.parseArgs`
for the CLI. The only dependencies are `tsx`, `typescript`, and `@types/node`.

**Why:** Both do the whole job. A test framework or an argument library would
each be a dependency whose useful portion is small, and `parseArgs` in strict
mode already rejects unknown options — which is the behaviour wanted.

**GVP:** `code-common:CH1` (dependency adoption threshold) and `personal:V1`.
`CH1` is about *external* libraries, so reaching for the standard library
rather than hand-rolling argument parsing is the same instinct applied in the
other direction.

## 14. Strict TypeScript, with a typecheck command

**Chosen:** `strict`, plus `noUncheckedIndexedAccess`,
`exactOptionalPropertyTypes`, `noUnusedLocals`, `noUnusedParameters`,
`noFallthroughCasesInSwitch`. `npm run typecheck`, `npm test`, `npm run check`.

**Why:** `noUncheckedIndexedAccess` matters specifically for the scanner, which
indexes a string by position constantly; it forced the boundary checks to be
real rather than assumed. The discriminated union on `status` means the
formatter cannot read `dataRows` off a failed file.

**GVP:** `code-common:CP7` (strict typing; TypeScript over JavaScript) and
`personal:R1` (typecheck must pass, tests must pass).

**Not done, and why:** `code-common:CP10` prefers a hook or CI gate over a
documented convention, and `personal:P7` says every process needs an
enforcement mechanism. There is no version control or CI in this project, so
there is nothing to hang a gate on. Writing a `.github/workflows/ci.yml`
against a repository that does not exist would be placeholder scaffolding, and
`code-common:CR2` forbids that without explicit instruction. `npm run check`
is the composed entry point a gate would call; this gap is the reason it
exists.

## 15. Unit tests plus end-to-end tests that run the documented command

**Chosen:** 57 tests. Unit tests for the scanner, the walker, and the
formatter; end-to-end tests that spawn `npx tsx src/index.ts ...` — the exact
command in the README — and assert on stdout, stderr, and exit code. One
end-to-end test pins the full output of `examples/` character for character.

**Why:** The unit tests pin each rule in isolation; only the end-to-end tests
prove the assembled tool does what a user runs it for, including that the
documented invocation works and that the exit code is right. Green unit tests
would not have caught, for example, `index.ts` executing on import — which it
did until the CLI was split out of the entry point.

**GVP:** `code-testing:TP1` (tests for all code, unit *and* end-to-end) and
`personal:P13` (verify in the production runtime, not just the test harness —
boot the real thing, do not trust the harness alone).

## 16. A committed `examples/` directory, including a deliberately broken file

**Chosen:** `examples/` holds a normal file, a quoted-fields file, a ragged
file, a header-only file, an unterminated-quote file, and a `notes.txt`. The
end-to-end test asserts its exact rendering, so `examples/` is both the README
demo and a golden-output regression test.

**Why:** One artifact serves three readers: a person running the tool for the
first time, the README, and the test suite. A broken file in the demo is the
point — requirement 5's behaviour is the easiest thing to get wrong and the
hardest to see in prose.

**GVP:** `code-testing:TP3` (agents must be able to fully exercise the
implementation — the fixtures a verifier needs are part of the deliverable) and
`personal:V3` (one artifact composed into three uses rather than three copies).

## 17. Scratch directories live under `test/.tmp`, inside the project

**Chosen:** the test helper `mkdtemp`s under `<project>/test/.tmp` rather than
in the OS temp directory, and removes it in a `finally`.

**Why:** The brief for this task is explicit that the tool must not be run
against anything outside the project directory. Putting the scratch root inside
the tree makes that structurally true rather than a thing to remember, and
keeps a crashed run's leftovers somewhere obvious. `test/.tmp` is gitignored.

**GVP:** `ai-common:P5` (size limits to accidents, not adversaries — prefer the
least restrictive setup that still catches the likely mistake) and
`code-common:CP10` (make the rule structural rather than a convention someone
has to honour).

## 18. `process.exitCode`, never `process.exit`

**Chosen:** `index.ts` assigns `process.exitCode` and returns; Node exits on
its own.

**Why:** `process.exit` can terminate before stdout has flushed, which
truncates the report when it is piped. The report is the tool's entire output;
losing part of it to a race would be silent data loss.

**GVP:** `personal:R2` (data must not be silently lost) and
`code-common:CP12`.

## 19. `systemErrorCode` extracted to its own module

**Chosen:** a four-line `src/system-error.ts` holding the one check for "is
this a Node system error, and what is its code".

**Why:** Both `tally.ts` (reporting a per-file read failure) and `cli.ts`
(distinguishing a directory problem from a defect) need it. The second use is
what justified extracting it; it was inline in both until then.

**GVP:** `code-common:CP4` (centralize shared logic — when the same operation
appears in multiple code paths, extract it), `personal:V3` (DRY), and
`personal:H1` (extraction timing — the second consumer forced the design, which
is exactly when to extract).

## 20. Files processed sequentially, each read whole

**Chosen:** a plain `for` loop, one file at a time, `readFile` into a string.

**Why:** No requirement mentions directory size or file size, and both
concurrency and streaming would add real complexity — ordering, error
aggregation, a resumable scanner — to buy performance nobody asked for. The
flex point is already in place for free: `tallyFile` is the only function that
reads bytes, so swapping in a stream is a change inside one function, and
`scanRecordFieldCounts` already consumes its input lazily.

**GVP:** `code-common:CH2` (additive feature, unknown access patterns: leave
the seam, do not build the feature), `personal:P1` (design around flex points
but do not implement the change early), and `personal:V1`.

**Limit, stated:** peak memory is proportional to the largest single file. For
the stated problem that is fine; `README.md` and the module header describe the
scanner's memory behaviour so the constraint is not a surprise.

## 21. Output shape: aligned columns, no blank line, pluralised summary

**Chosen:** `name  N rows  M cols`, with names padded and counts
right-aligned; `name  FAILED: reason` for a failure; then the summary line
`N files reported, M failed` with no blank line before it.

**Why:** Requirement 9 says an empty directory produces *only* the summary
line, so the output is exactly "one line per file, then one summary line" — a
blank separator would contradict that. Alignment requires knowing the widest
value, which is why the formatter takes the finished report rather than
streaming lines as files are walked. The per-file labels stay plural (`1 rows`)
because they are table column labels and varying their length would break the
alignment the padding exists to create; the summary line is prose, so `1 file
reported` is singular there.

**GVP:** `personal:P3` (the requirement specifies the behaviour; this is the
form chosen under it) and `personal:P20` for the split between the two forms —
the text table is shaped for a person, and `--format json` (section 9) exists
precisely so that no program has to parse it.

## 22. Naming

**Chosen:** `tally` as given. Internally, descriptive names over short ones:
`scanRecordFieldCounts`, `headerColumns`, `isCsvFileName`,
`consumeQuotedField`. Comments explain why, not what.

**Why:** The scanner is the part of this tool someone will have to re-read, and
a position-walking state machine is where terse naming does the most damage.

**GVP:** `code-common:CP2` (clarity over cleverness — descriptive names even if
long; comments explain "why"; would you understand this in 6 months?),
`code-common:CP8` (names describe purpose, not lineage), and `personal:H9`
(scale naming effort to expected reach — `tally` was given and a plainly
descriptive name is the right outcome for a small-audience tool, so no
deliberation was spent there).

---

## Verification

- `npm run typecheck` — passes.
- `npm test` — 57 tests, 11 suites, 0 failures.
- `npx tsx src/index.ts examples` — exercised in the real runtime, not only
  under the test runner (`personal:P13`).
- Additionally exercised by hand inside `test/.manual` (since removed):
  a `chmod 000` file reports `FAILED: cannot read file (EACCES)` and the run
  continues; a symlink to a CSV file is followed; a dangling symlink is
  skipped; CRLF files count correctly; `--format json` and `--help` behave as
  documented.

Per `personal:R1`, nothing above is claimed as correct that was not run.
