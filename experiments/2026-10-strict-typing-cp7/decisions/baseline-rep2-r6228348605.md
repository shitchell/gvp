# Decisions

One section per design choice made while building `tally`. Each says what was
chosen, why, and which element of the project's GVP library informed it (element
ids are as returned by `cairn --library ./.gvp/library inspect <id>`).

Choices that `TASK.md` fixed outright — one line per file, filename order,
header not counted as data, ragged rows counted anyway — are not listed; they
are requirements, not decisions.

---

## 1. Hand-written CSV scanner rather than a CSV library

**Chosen:** `src/csv.ts`, 144 lines including comments, instead of `csv-parse`,
`papaparse` or similar.

**Why:** The useful portion of a CSV library for this job is a quote-aware field
scanner — well under the threshold at which taking a dependency pays. Writing it
also means the error vocabulary is ours: requirement 5 needs a specific,
reportable reason per file, and a library's own messages would have had to be
translated anyway. The cost is that unusual dialects (tab-delimited, backslash
escapes) are not free, which nothing here asked for.

**GVP:** `code-common:CH1` (dependency adoption threshold — "if the useful
portion of an external library is approximately 200 lines or fewer, write it
yourself"), supported by `personal:V1`.

---

## 2. Pure core, I/O layer, formatter, entry point as four modules

**Chosen:** `csv.ts` (text → rows, no I/O) → `tally.ts` (filesystem → a report
value) → `format.ts` (report value → text or JSON) → `cli.ts` (arguments, exit
code) → `index.ts` (three lines wiring `cli.ts` to the process).

**Why:** Each seam is a clean, already-obvious boundary rather than a speculative
one, and each makes a different thing testable in isolation: the parser against
strings, the tally against a fixture directory, the formatter against hand-built
report values, the CLI against a real spawned process. Splitting `cli.ts` out
from `index.ts` exists purely so argument parsing can be exercised without a
top-level `process.exitCode` side effect firing on import.

**GVP:** `code-common:CP13` (testability is a design constraint — "how something
will be tested is a design input, not an afterthought") and `personal:H1`
(extraction timing — extract now when the boundary is clean and natural).

---

## 3. A failing file is a line in the report; a failing directory is fatal

**Chosen:** `tallyCsvFile` catches everything and returns a `failed` result;
`tallyDirectory` deliberately lets a `readdir` failure propagate, and `cli.ts`
turns that into exit 2 with nothing on stdout.

**Why:** The two failures have different consequences. One unreadable file still
leaves a truthful report of the others (requirement 5). An unlistable directory
means there is no report at all — printing `0 files reported, 0 failed` for a
misspelled path would be a confident lie, and is exactly the "unexpected bad
state" to refuse to wander into. The asymmetry is deliberate and documented at
both call sites rather than being a blanket try/catch policy.

**GVP:** `code-common:CP12` (be aware of state; don't wander into bad states —
"for each failure ask: what is the consequence, does the user need to know, can
we recover, should we stop").

---

## 4. What counts as "cannot be read as CSV"

**Chosen:** four failure classes — unterminated quoted field, text after a
closing quote, no header row (empty file), and invalid UTF-8 — plus any
filesystem error, reported as `cannot read file (ENOENT|EISDIR|EACCES|…)`.

**Why:** Requirement 6 rules out the obvious candidate (ragged rows), so the
failure set had to be defined. Each of these is a case where counting would
otherwise produce a confident wrong number:

- an empty file has no header, so "0 rows, 0 columns" would be indistinguishable
  from a real header-only file and would assert a column count the file never
  declared;
- invalid UTF-8 decoded non-fatally becomes U+FFFD, which parses fine and
  mis-counts a mangled file silently — so the decoder is constructed with
  `{ fatal: true }`;
- an unterminated quote means every subsequent comma and newline has no
  determinate reading.

A bare `"` inside an *unquoted* field is **not** a failure (`a"b` is unambiguous
and common). `"ab"c` is, because there is no reading of it that is not a guess.

**GVP:** `personal:R2` (no silent failures or data loss — "failures must be
surfaced, not swallowed") and `code-common:CP12`.

---

## 5. Select files by name, then read, with no `stat` pre-filter

**Chosen:** filter `readdir` output on `name.endsWith('.csv')` and read whatever
is left, rather than inspecting dirents to keep only regular files.

**Why:** It is one code path instead of two, and it is the more honest of the
two. A directory or a broken symlink named `data.csv` becomes a reported failure
(`cannot read file (EISDIR)`) instead of silently disappearing from a report
that claims to cover every `*.csv` under the directory. It also means symlinks
to real CSVs just work, with no follow-or-not policy to decide. Requirement 5
already defines the behaviour for anything unreadable.

**GVP:** `personal:V1` (simplicity — fewer moving parts) and `personal:R2` (a
skipped file is a silently discarded record).

---

## 6. The extension match is case-sensitive

**Chosen:** `data.CSV` is left alone.

**Why:** `TASK.md` says `*.csv` and "files that are not `*.csv` are left alone";
on the platform this runs on, that glob does not match `.CSV`. Case-insensitive
matching would be a quiet widening of the brief, and widening is the direction
that is cheap to do later and expensive to undo — `.CSV` files can be added to
the match set additively, whereas removing them once someone depends on them
cannot. Documented in the README as a known limit rather than left to be
discovered.

**GVP:** `code-common:CP11` (API surface is a commitment — "prefer additive
changes over breaking ones") and `personal:V2` (document the trade-off rather
than presenting a clean facade).

---

## 7. Filename order by code unit, not `localeCompare`

**Chosen:** an explicit `byFileName` comparator using `<` / `>`.

**Why:** `localeCompare` reads the ambient locale, so the same directory would
report in different orders on different machines and the same tests would pass
or fail depending on the environment. That is hidden global state driving
user-visible output. "Filename order" with no further qualification is best
served by the one order that is reproducible everywhere.

**GVP:** `code-common:CP3` (explicit over implicit — "no hidden state or global
magic") and `personal:P2` (decisions validated against real behaviour, not
assumed).

---

## 8. Three exit codes: 0 / 1 / 2

**Chosen:** 0 = every file reported (an empty directory included), 1 = a report
was printed but some file in it failed, 2 = no report could be printed.

**Why:** The failure count is already on the summary line, but that only helps a
human; an exit code lets `tally data/ && ./next-step` do the right thing with no
parsing at all. Separating 1 from 2 is the part that carries information: "the
report is complete and some files are bad" and "there is no report" call for
different responses from a caller. Three constants, no machinery.

**GVP:** `personal:P19` (favour low-effort, high-information signals — "even
when it is not certain they will be immediately useful") and `personal:P20`
(prefer machine-consumable forms where easy).

---

## 9. `--format json` as well as the text report

**Chosen:** one flag with two values, defaulting to `text`.

**Why:** The whole output of this tool is a data table, and `format.ts` already
had to exist separately from the report value for testing, so the JSON branch is
about ten lines with no new abstraction. That makes the report usable by a
program without scraping padded columns.

**Transparency about the tension:** `code-common:CH2` says a feature that is
speculative with no concrete use case should be deferred entirely, and no
consumer of the JSON exists today — so this is the weakest-justified decision
here. It went in because `personal:P20` asserts the use case generically ("a
machine-consumable form can drive automation; a human-only one cannot") and the
cost was near zero given a split that `code-common:CP13` already required. Had
it needed a new module or a schema, `CH2` would have won. The text format
remains the default, so zero-config behaviour is unchanged.

**GVP:** `personal:P20`, with `code-common:CP5` (configuration early, defaults
always) for the flag shape; weighed against `code-common:CH2`.

---

## 10. The report, including failure lines, goes to stdout

**Chosen:** only the two fatal cases (bad usage, unlistable directory) write to
stderr.

**Why:** Requirement 4 asks for one line per file in filename order. Splitting
failures onto stderr would break that ordering as soon as the two streams are
viewed together, and would make `tally dir > report.txt` silently drop records.
Failures are part of the report, not diagnostics about it. The exit code is what
distinguishes a clean run for a caller.

**GVP:** `code-common:CP12` (know what state you are in and tell the user) and
`personal:R2`.

---

## 11. Unknown flags are rejected, not treated as the directory

**Chosen:** anything starting with `-` that is not `--format`, `-h` or `--help`
is a usage error; a second positional argument is too.

**Why:** The alternative — treating `--recursive` as a path — turns a typo into
`cannot read directory --recursive`, or worse, silently tallies the wrong
directory when a flag is misspelled before a real path. Rejecting is the
behaviour that cannot produce a wrong report.

**GVP:** `code-common:CP12`.

---

## 12. Whole-file reads, not streaming

**Chosen:** `readFile` into a string, then scan.

**Why:** Counting rows does not inherently need the whole file in memory, and
streaming was considered. Nothing in the brief involves files that do not fit in
memory, so streaming would be complexity bought for a hypothetical. The failure
mode is also benign: a file too large for a Node string throws, which requirement
5's machinery already turns into that file's reported failure rather than a
crash. Reversing the decision is cheap and local — `tallyCsvText` is a pure
function over text and `csvRows` is already a lazy generator, so a chunked reader
replaces one function — which is why it was worth taking the simple option now
instead of pricing the question properly.

**GVP:** `personal:V1` and `code-common:CH2` (deferral decision tree — speculative
with no concrete use case: defer), with `personal:H8` (buy reversibility when it
costs less than proof) as the reason it is safe to defer. Stated as a limit in
the README per `personal:V2`.

---

## 13. Files are read one at a time

**Chosen:** a sequential `for` loop, not `Promise.all`.

**Why:** `Promise.all` over a directory of thousands of files opens thousands of
descriptors and fails with `EMFILE` — a bad state produced by the optimisation
itself. The fix would be a concurrency limiter, which is machinery this tool has
no measured need for. Sequential reads cannot get into that state. Noted in the
README as a speed limit.

**GVP:** `code-common:CP12` and `personal:V1`.

---

## 14. A discriminated union for per-file results

**Chosen:** `{ status: 'ok', dataRows, columns } | { status: 'failed', reason }`,
rather than one struct with nullable count fields or an exception that escapes.

**Why:** A success and a failure carry genuinely different data, and the union
makes it impossible to read `dataRows` off a file that was never counted — the
typechecker rejects it. It also serialises directly to the JSON format with no
mapping layer, and `formatReport`'s `switch` over the format union is checked
for exhaustiveness for the same reason.

**GVP:** `code-common:CP7` (strict typing — "types add clarity and catch issues
at compile/check time") and `code-common:CP3`.

---

## 15. The summary is derived, not accumulated

**Chosen:** `summarize(results)` counts the array at format time; no running
`reported`/`failed` counters are stored on the report.

**Why:** Two places tracking the same number means one of them can be wrong and
there is no way to tell which. Here the results array is the authority and the
summary is a view of it, so the summary cannot drift out of step with the lines
above it.

**GVP:** `code-realtime:RTP3` (single source of truth for mutable state — "if
two systems track the same state independently, one is wrong and you will not
know which"). That element lives in the realtime file, but its statement is
domain-agnostic and applies directly.

---

## 16. UTF-8 byte order marks are stripped

**Chosen:** strip a leading U+FEFF before parsing.

**Why:** This is correctness, not politeness. With the BOM left in place, a file
whose first column is quoted — `"last, first",age` — no longer starts with a
quote character, so the quoting is not recognised and the header reports three
columns instead of two. `tests/fixtures/sample/bom.csv` exists to pin exactly
that. Under the deferral tree, anything needed for correctness is implemented
now.

**GVP:** `code-common:CH2` (first branch: needed for correctness → implement now).

---

## 17. "Reported" in the summary counts failures too

**Chosen:** `11 files reported, 4 failed` — the first number is every file that
produced a line, not just the successes.

**Why:** Requirement 8 ("how many files were reported and how many failed") is
readable both ways, but requirement 5 says a failing file "is reported as a
failure", which makes failures reported files. Reading it the other way would
make the two numbers non-comparable and leave the total unavailable, when total
and failures give the reader both numbers plus their difference. Stated
explicitly in the README and asserted in the tests so the reading is not left
implicit.

**GVP:** `personal:P3` (separate what from how — the requirement specifies
behaviour, so an ambiguity in it needs a recorded interpretation rather than a
silent implementation choice) and `personal:V2`.

---

## 18. Unit tests plus end-to-end tests that spawn the real binary

**Chosen:** `tests/csv.test.ts`, `tests/format.test.ts` and `tests/tally.test.ts`
call the modules directly; `tests/cli.test.ts` spawns
`node_modules/.bin/tsx src/index.ts` as a child process and asserts on stdout,
stderr and exit code. 45 tests, all passing.

**Why:** The unit tests pin each piece's behaviour cheaply; only the spawned
tests prove the assembled thing a user runs actually works, including the ESM
top-level-await entry point, the exit codes, and the exact text layout. A green
unit suite would not have caught, say, an entry point that failed to load.

**GVP:** `code-testing:TP1` (tests for all code, unit and end-to-end) and
`personal:P13` (verify in the production runtime, not just the test harness).

---

## 19. Fixture directories, one file per behaviour

**Chosen:** a committed `tests/fixtures/sample/` whose every file is named for
the case it exercises (`ragged.csv`, `unterminated.csv`, `no-trailing-newline.csv`,
`is-a-directory.csv`, …), a small `tests/fixtures/pair/` for asserting exact CLI
output, and `mkdtemp` for the one case a directory cannot carry — an empty one.

**Why:** The fixture directory doubles as the spec: the single deep assertion in
`tally.test.ts` lists the expected result for all eleven files, so what the tool
is supposed to do with each shape of input is readable in one place. Named
fixtures also keep the working tree self-describing for whoever — or whatever —
picks this up next.

**GVP:** `code-testing:TP2` (the test is the executable definition of success)
and `ai-common:C2` (agents reproduce patterns from the working tree, so it must
be curated for legibility).

---

## 20. Strict TypeScript, with `npm run check` as the gate

**Chosen:** `strict` plus `noUncheckedIndexedAccess`,
`exactOptionalPropertyTypes`, `noUnusedLocals`, `noFallthroughCasesInSwitch` and
`verbatimModuleSyntax`; `npm run check` runs typecheck then tests.

**Why:** `noUncheckedIndexedAccess` is the one that earned its keep: the scanner
indexes a string constantly, and having every `text[i]` typed `string |
undefined` forced the end-of-input case to be handled explicitly at each point
rather than relying on `undefined` comparing unequal by luck.

**Honest gap:** the preferred form of enforcement is a hook or CI gate, not a
documented command. This directory is not a git repository and has no CI, so
there is nothing to hang a hook on; `npm run check` is a single command that
does both jobs, and the README tells the next person to run it before calling
anything done. If this ever becomes a repository, that command is what a
pre-commit hook should run.

**GVP:** `code-common:CP7` (strict typing, TypeScript over JavaScript) and
`code-common:CP10` (prefer hooks, CI and validators over convention), whose
mechanical form is only partly achievable here.

---

## 21. Named constants for every separator, flag and exit code

**Chosen:** `FIELD_SEPARATOR`, `QUOTE`, `LINE_FEED`, `CARRIAGE_RETURN`,
`COLUMN_GAP`, `JSON_INDENT`, `CSV_FILE_EXTENSION`, `EXIT_OK`,
`EXIT_FILE_FAILURES`, `EXIT_USAGE_OR_FATAL`, and the `OUTPUT_FORMATS` tuple that
the usage text, the validator and the `OutputFormat` type are all derived from.

**Why:** These are exactly the values a future change would want to reach for —
a semicolon dialect, a different exit convention — and they are much harder to
separate out once interwoven. Deriving the usage string and the type from one
`OUTPUT_FORMATS` tuple also means adding a format cannot leave the help text
stale.

**GVP:** `code-common:CP9` (named constants for everything configurable) and
`code-common:CP5`.

---

## 22. No configuration file, and no flex points beyond `--format`

**Chosen:** no config file, no plugin seam for dialects, no `--recursive`, no
`--delimiter`.

**Why:** The deferral tree's third branch: each of these is speculative with no
concrete use case, so the right move is to defer entirely rather than leave
hooks behind. Note the contrast with decision 12, where the seam already existed
for other reasons and so cost nothing to keep.

**GVP:** `code-common:CH2` (speculative with no concrete use case: defer
entirely with no flex points) and `personal:V1`.

---

## 23. The name `tally`

**Chosen:** kept as given, with no deliberation.

**Why:** `TASK.md` names the tool, and naming effort should scale to reach — a
single-purpose directory tool does not earn a naming discussion. Recorded only
so its absence is not mistaken for an oversight.

**GVP:** `personal:H9` (scale naming effort to expected reach — "a small-audience
tool does not earn deliberation").
