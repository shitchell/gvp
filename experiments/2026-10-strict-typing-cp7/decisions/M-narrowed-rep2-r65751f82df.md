# Design decisions

One section per choice: what was chosen, why, and which element of the project's
GVP library (`.gvp/library`, queried with `cairn`) informed it. Where a choice
was between real alternatives, the rejected option is named — the library's own
capture workflow asks for the alternatives, not just the outcome
(`personal:P11`, externalize rationale into durable artifacts).

Elements cited repeatedly: `personal:V1` (simplicity), `personal:V2`
(transparency), `code-common:CP12` (know what state you are in),
`code-testing:TP1` (unit and end-to-end tests).

---

## 1. The CSV parser is written here, not taken from a dependency

**Chose:** `src/csv.ts`, ~150 lines, no runtime dependencies. `csv-parse` and
`papaparse` were the alternatives.

**Why:** The useful portion of a CSV library for this tool — split records,
honour quotes — is well under the threshold at which `code-common:CH1`
(dependency adoption threshold, "approximately 200 lines or fewer, write it
yourself") says to write it. Nothing else those libraries offer (dialect
sniffing, type coercion, header objects, streams, worker support) is used here,
and owning the parser is what makes the error messages name a line number and
makes the trailing-newline and blank-line rules below decidable rather than
inherited.

**GVP:** `code-common:CH1`, supported by `personal:V1`.

## 2. Modules split by concern: parse / count / format / CLI / entry

**Chose:** `csv.ts` (records), `tally.ts` (filesystem + counting, returns data),
`format.ts` (rendering), `cli.ts` (arguments, exit codes), `index.ts`
(5-line process binding).

**Why:** `code-common:CP1` asks that a change live in one contiguous block: a
change to quoting touches only `csv.ts`, a change to output wording only
`format.ts`, a change to flags only `cli.ts`. It also satisfies
`personal:P3` (separate what from how) — `tally.ts` states the report, nothing
about how it is shown. The alternative, a single `index.ts`, would have been
shorter but would have made the CLI untestable without spawning a process, which
`code-common:CP13` (testability is a design constraint) rules out.

**GVP:** `code-common:CP1`, `code-common:CP13`, `personal:P3`.

## 3. The report is a data structure; text is one renderer of it

**Chose:** `tallyDirectory()` returns `TallyReport`; `formatReportText()` and
`formatReportJson()` render it. Nothing in the core writes to a stream.

**Why:** `personal:P20` (prefer machine-consumable forms where easy) — once the
report exists as data, a second renderer is about ten lines. It also keeps the
counting logic testable by value comparison rather than by string matching.

**GVP:** `personal:P20`, `code-common:CP13`.

## 4. `--json` is implemented now, not deferred as a flex point

**Chose:** Ship `--json` rather than leaving the seam unused.

**Why:** `code-common:CH2` (deferral decision tree) would normally say an
additive feature with unknown access patterns gets a flex point and no
implementation. The flex point here is the `TallyReport` structure, and given it,
the feature itself is a `JSON.stringify` call — so the usual reason to defer
(cost) does not apply, while `personal:P20` and `personal:P21` (expose flex
points as options early, to discover the tool's best use) both pull toward
shipping it. A tool whose output only a human can read cannot be composed into
anything.

**GVP:** `personal:P20`, `personal:P21`, weighed against `code-common:CH2`.

## 5. No other flags, no config file

**Chose:** `--json`, `-h/--help`, one positional directory. No `--recursive`, no
`--delimiter`, no `--quiet`, no config file.

**Why:** `code-common:CH2` — those are speculative with no concrete use case, so
they are deferred entirely, with no flex points. `code-common:CP11` (API surface
is a commitment) says adding later is easy and removing is not, and
`personal:H7` warns that too many entry points cost as much as too few. Note the
tension with `code-common:CP5` (configuration infrastructure early): nothing here
is a magic constant awaiting configuration — `CSV_EXTENSION` and the exit codes
are named constants (`code-common:CP9`) in one place each, which is the part of
CP5 that applies at this size.

**GVP:** `code-common:CH2`, `code-common:CP11`, `personal:H7`, `code-common:CP9`.

## 6. Per-file failure is a value in the report, not an exception

**Chose:** `FileTally` is a discriminated union on `status: 'ok' | 'failed'`.
`tallyFile()` never throws for a bad file. A `CsvParseError` is caught and
converted; any other error is re-thrown.

**Why:** Requirement 5 wants the run to continue, and `code-common:CP12` asks,
per failure, what the consequence is and whether we can recover — a malformed
file is recoverable and the user needs to know, so it becomes a reported value.
The re-throw matters: swallowing an unexpected error would dress a bug up as a
bad input file, which is exactly the "wander into an unexpected bad state" CP12
forbids. `code-common:CP3` (explicit over implicit) drives the union over a
nullable-fields object, so an `ok` tally cannot carry a reason and a `failed` one
cannot carry fake zero counts.

**GVP:** `code-common:CP12`, `code-common:CP3`, `personal:R2`.

## 7. Directory-level failure is separate from file-level failure

**Chose:** A `DirectoryReadError` from `tallyDirectory()`; the CLI turns it into
exit code 2 and prints no report. An unlistable directory is not "zero files".

**Why:** `code-common:CP12` again — these are different states with different
consequences (nothing can be reported at all, versus one line being a failure),
so they are handled separately rather than collapsed into an empty report, which
would be a silent failure under `personal:R2`.

**GVP:** `code-common:CP12`, `personal:R2`.

## 8. Four exit codes: 0 ok, 1 file failures, 2 usage, 70 internal

**Chose:** Named constants in `cli.ts`, documented in `--help` and the README.

**Why:** `personal:P19` (favour low-effort, high-information signals) and
`personal:P20` — an exit code is the cheapest machine-readable signal a CLI has,
and `tally dir && deploy` only works if failures are distinguishable. 70 for an
internal error exists so a bug in tally cannot be mistaken for "some files
failed", per `code-common:CP12`. Values are named constants, not literals
(`code-common:CP9`).

**GVP:** `personal:P19`, `personal:P20`, `code-common:CP12`, `code-common:CP9`.

## 9. An empty file is a failure, not "0 rows, 0 columns"

**Chose:** A zero-byte file (or one containing only a byte order mark) is
reported as `FAILED - file is empty (no header row)`.

**Why:** Requirement 3 asks how many columns the header declares; with no header
there is no truthful answer, and printing `0 columns` would assert something the
file does not say. `personal:R2` (no silent failures) and `personal:V2`
(transparency) favour surfacing it. This is a judgement call — see §19.

**GVP:** `personal:R2`, `personal:V2`, `code-common:CP12`.

## 10. Invalid UTF-8 is a failure; a byte order mark is stripped

**Chose:** Read bytes, decode with `new TextDecoder('utf-8', { fatal: true })`.
Undecodable bytes fail the file. A leading BOM is removed.

**Why:** The default `readFile(path, 'utf8')` silently replaces bad bytes with
U+FFFD, so a binary file would be reported as a successful CSV with nonsense
counts — a silent corruption of the answer, which `personal:R2` forbids. The
fatal decoder is the same single line of code and gives the honest answer. The
BOM strip is free with the same decoder and keeps an invisible character out of
the first header name (`personal:V2`).

**GVP:** `personal:R2`, `personal:V2`.

## 11. "Reported" in the summary counts successes and failures together

**Chose:** `3 files reported, 1 failed` — three lines were printed above it, one
of which was a failure.

**Why:** Requirement 8's "how many files were reported" is ambiguous, but
requirement 5 says a failing file *is* reported, so failures belong in the first
number and the second is a subset of it. The README states the reading
explicitly rather than leaving it to be inferred from an example
(`personal:V2`). Successes are derivable by subtraction; `--json` carries both
numbers plus every per-file status for anything that needs more.

**GVP:** `personal:V2`.

## 12. Filename order is code-unit order, not locale collation

**Chose:** `names.sort()` with no comparator. Not `localeCompare`.

**Why:** `localeCompare`'s result depends on the host locale and ICU build, so
the same directory could report in different orders on different machines and the
test asserting order would be environment-dependent — `code-testing:TP2` treats
"how will this be verified?" as a design input. The cost is that `Z.csv` sorts
before `a.csv`; that is documented in the README rather than left as a surprise
(`personal:V2`).

**GVP:** `code-testing:TP2`, `personal:V2`.

## 13. The `.csv` match is case-sensitive

**Chose:** `name.endsWith('.csv')`. `DATA.CSV` is left alone.

**Why:** It is the literal reading of requirement 1 and is deterministic across
filesystems that differ in case sensitivity. Choosing the narrow rule first is
the reversible direction: `code-common:CP11` (API surface is a commitment —
prefer additive changes) means widening later to accept `.CSV` adds files to the
report, while starting permissive and narrowing later would remove files someone
depends on. `personal:V7` (keep optionality) points the same way. See §19.

**GVP:** `code-common:CP11`, `personal:V7`.

## 14. Entry selection: `.csv` suffix plus "is a file"

**Chose:** Regular files and symlinks ending in `.csv`. A *directory* named
`looks-like.csv` is skipped silently; subdirectories are not descended into; a
hidden file like `.secret.csv` *is* included, which a shell `*.csv` glob would
not do.

**Why:** Requirement 1 says "every `*.csv` file", so a directory is not a
candidate and does not belong in the failure count — reporting it as a failure
would be noise about a thing the user never asked about. One suffix test plus one
`isFile()` test is the simplest rule that gets this right (`personal:V1`), and
the one place it diverges from shell glob semantics (dotfiles) is documented
rather than special-cased (`personal:V2`, `personal:P4` — prefer the generic rule
over accumulating special cases).

**GVP:** `personal:V1`, `personal:P4`, `personal:V2`.

## 15. Files are read one at a time

**Chose:** A sequential `for` loop, not `Promise.all` over every file.

**Why:** The file count is unbounded but the file-descriptor limit is not, so
`Promise.all` on a directory of 50,000 files is an `EMFILE` storm — a bad state
entered for no benefit (`code-common:CP12`). A bounded-concurrency pool would be
faster on cold cache, but that is a performance feature with no measured need,
which `code-common:CH2` defers; the report is sorted either way.

**GVP:** `code-common:CP12`, `code-common:CH2`, `personal:V1`.

## 16. Whole-file read, but a streaming-shaped parser

**Chose:** `readFile` loads the whole file; the parser hands each record to a
callback (`forEachRecord`) so records are never all retained. A file larger than
memory fails.

**Why:** Streaming the read is not needed for correctness on any stated
requirement, so `code-common:CH2` says do not build it — but the seam it would
need is the parser's record interface, and shaping that as a callback cost
nothing today (`personal:P1`, design around flex points without implementing the
change). `parseCsv()` remains as a three-line array-returning wrapper because
tests and future callers do want the whole table; that is a convenience over one
implementation, not a second implementation (`personal:V3`). The limit is stated
in the README rather than left for someone to discover
(`personal:V2`).

**GVP:** `code-common:CH2`, `personal:P1`, `personal:V3`, `personal:V2`.

## 17. CSV rules at the edges: terminators, blank lines, stray quotes

**Chose:** A record ends at LF, CRLF or bare CR; one terminator at end of file
closes the last record instead of starting an empty one; an *interior* blank line
is a record with one empty field, so it counts as a data row; a quote is special
only at the start of a field, so `a"b` is literal while `"a"b` fails.

**Why:** Each is the rule that needs no special case. Requirement 6 already says
a row with the wrong field count still counts, so a blank line — one empty field
— needs no exception to that rule; `personal:P4` prefers the generic rule to
per-instance handling. The stray-quote asymmetry is deliberate: an unquoted field
has no escaping mechanism to violate, whereas text after a closing quote means
the file's quoting is not self-consistent and any count derived from it would be
a guess, so it fails loudly (`code-common:CP12`). All four are stated in the
README and pinned by tests, because they are the cases where two reasonable
implementations differ (`personal:V2`).

**GVP:** `personal:P4`, `code-common:CP12`, `personal:V2`.

## 18. Tests: `node:test`, unit plus end-to-end, fixtures inside the project

**Chose:** The built-in test runner via `tsx --test`, 48 tests across
`tests/csv.test.ts`, `tests/tally.test.ts`, `tests/cli.test.ts` and
`tests/e2e.test.ts`. The e2e file spawns a real Node process running
`src/index.ts` and asserts stdout, stderr and exit codes. `run()` takes injected
output sinks so every CLI branch is also testable in-process. Fixture directories
are created inside the project and removed afterwards.

**Why:** `code-testing:TP1` asks for both unit and end-to-end tests —
unit tests pin the parser's edge rules, the e2e test proves the documented
`src/index.ts` invocation actually loads and exits correctly, which green unit
tests do not show (`personal:P13`, verify in the production runtime). Vitest or
Jest would add a dependency for what the standard library already does
(`code-common:CH1`). The injected sinks are `code-common:CP3` (dependencies
visible in the signature) serving `code-common:CP13`. Fixtures live under the
project because this task's instructions confine the tool to this directory, and
`ai-common:P5` (size limits to likely accidents) says the cheap containment that
prevents a stray write outside the work area is worth taking.

**GVP:** `code-testing:TP1`, `personal:P13`, `code-common:CH1`,
`code-common:CP3`, `code-common:CP13`, `ai-common:P5`.

## 19. Choices the library did not settle on its own

`personal:H5` (disambiguate-then-surface) says a decision that cannot be derived
unambiguously from the library should be surfaced as a *guiding-element patch*,
not as a bare question. Three choices here were genuine judgement calls. They are
recorded with the patch that would settle them, so the next implementer inherits
a rule rather than re-deriving it:

| Choice | Alternative | Patch that would settle it |
| --- | --- | --- |
| §9 empty file is a failure | report `0 data rows, 0 columns` | A heuristic under `personal:V2`: "when a requirement asks a question the input cannot answer, report the absence rather than a zero that looks like data." |
| §13 case-sensitive `.csv` | case-insensitive extension match | A heuristic under `code-common:CP11`: "when a matching rule's breadth is undecided, ship the narrow one — widening a match is additive, narrowing it is breaking." |
| §17 interior blank line counts as a data row | skip blank lines | A heuristic under `personal:P4`: "when a format's degenerate input could be special-cased or fall through the general rule, let it fall through and document the result." |

Each was decided rather than escalated because the library's existing values do
point one way in each case (`personal:V2`, `code-common:CP11`, `personal:P4`
respectively) — the ambiguity is that no element makes the inference explicit.
`personal:P15` is the reason they appear here as patches: the human's review
attention belongs on the guidance, not on these three decisions.

**GVP:** `personal:H5`, `personal:P15`, `personal:P6` (decompose rationale to its
most domain-agnostic element).

## 20. An `examples/` directory is committed

**Chose:** Four small files — one well-formed, one ragged, one malformed, one
non-CSV — so `npx tsx src/index.ts examples` demonstrates every branch of the
report, including a failure and a skipped file.

**Why:** `personal:P19` (low-effort, high-information signals) — it makes the
README's example runnable and gives any implementer, human or agent, a one-command
smoke test. `ai-common:P2` (curate the working tree for AI legibility) is served
by the fixtures being real and current rather than described in prose.

**GVP:** `personal:P19`, `ai-common:P2`.

## 21. Strict TypeScript, checked in CI-ready scripts

**Chose:** `strict` plus `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
`verbatimModuleSyntax`; `npm run typecheck`, `npm test`, `npm run check`.

**Why:** `code-common:CP7` (strict typing, TypeScript over JavaScript) and
`personal:R1` ("typecheck must pass, tests must pass" before claiming
correctness) — both were run and pass. `noUncheckedIndexedAccess` is what pushed
the parser to `text.charAt(index)`, which returns `''` past the end and so needs
no non-null assertions. The scripts exist as the single command a hook or CI step
would call, per `code-common:CP10` (prefer hooks, CI and validators over
convention); wiring an actual hook is out of scope for a repository that is not
under version control here.

**GVP:** `code-common:CP7`, `personal:R1`, `code-common:CP10`.

---

## Verification performed

Per `personal:R1`, nothing above is claimed without having been run:

- `npm run typecheck` — clean.
- `npm test` — 48 tests, 48 pass, 0 fail.
- `npx tsx src/index.ts examples` and `--json`, an empty directory, `--help`, no
  arguments, and a nonexistent directory — each produced the documented output
  and exit code (1, 1, 0, 0, 2, 2 respectively).
- `node --experimental-strip-types src/index.ts examples` — same report, so the
  tsx-free invocation in the README works.

The tool was run only against directories inside this project.
