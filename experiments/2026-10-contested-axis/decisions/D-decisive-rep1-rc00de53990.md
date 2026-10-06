# Decisions

One section per design choice made while building `tally`. Each states what
was chosen, why, and which GVP element informed it (or that none did).

Verification state at the time of writing: `npm run check` passes — `tsc
--noEmit` under `strict` plus `noUncheckedIndexedAccess` /
`exactOptionalPropertyTypes`, and 37 tests including seven that run the real
CLI in a real process (**personal:R1**, **personal:P13**).

---

## 1. The CSV reader is hand-written, not a dependency

**Chosen.** `src/csv.ts` — about 90 lines of state machine — instead of
`csv-parse`, `papaparse`, or similar. The tool has no runtime dependencies.

**Why.** The useful surface here is quoting, line endings, and a row count.
That is well under the threshold at which a library earns its place, and
owning the parser means the leniency/strictness calls in section 6 are ours to
state plainly rather than inherited from someone else's defaults and then
worked around.

**GVP.** **code-common:CH1** (dependency adoption threshold — "if the useful
portion of an external library is approximately 200 lines or fewer, write it
yourself"), supported by **personal:V1** (simplicity).

## 2. Four modules, with a pure core and I/O only at the edge

**Chosen.** `csv.ts` (text → rows), `tally.ts` (directory → typed report, no
printing), `report.ts` (report → lines, no logic), `index.ts` (argv, streams,
exit codes — the only module that touches the process).

**Why.** Each boundary is clean and natural rather than speculative, and the
split is what makes the counting testable without capturing stdout: the
behaviour tests assert on data structures, and only the end-to-end tests spawn
a process. It also means the wording of the report can change without touching
the counting.

**GVP.** **personal:P3** (separate what from how at every layer) for the
report/logic split; **code-common:CP13** and **code-testing:TP2** (testability
is a design input, not an afterthought); **personal:H1** (extraction timing —
extract now when the boundary is clean and natural) for choosing four modules
rather than one file.

## 3. Rows are yielded one at a time

**Chosen.** `parseCsvRows` is a generator. `tallyFile` pulls the header, then
counts the rest without ever holding the table.

**Why.** Counting rows should not cost memory proportional to the number of
rows, and a generator costs nothing extra to write or read compared with
returning `string[][]`. It also composes: a future consumer that wants the
rows themselves gets them from the same function.

**GVP.** **code-common:CP6** (proactive reusability — small focused pieces
that combine). The memory argument itself is ordinary engineering, not
library-driven.

## 4. Per-file failures are return values, not exceptions

**Chosen.** `tallyFile` returns a discriminated union — `{ outcome:
'counted', ... }` or `{ outcome: 'failed', fileName, reason }` — and converts
every failure mode into the second. Nothing in the per-file path throws.

**Why.** Requirement 5 says one bad file must not stop the run. Making the two
outcomes a type rather than a control-flow accident means the compiler
enforces that every consumer handles both, and the set of states a file can be
in is written down in one place.

**GVP.** **code-common:CP12** (be aware of state; don't wander into bad
states — "for each failure ask: what is the consequence, does the user need to
know, can we recover, should we stop"); **code-common:CP3** (explicit over
implicit) for using a tagged union over a nullable field.

## 5. A directory that cannot be listed is fatal; a file that cannot be read is not

**Chosen.** `tallyDirectory` lets a `readdir` failure propagate; `index.ts`
catches it, writes to stderr, and exits `2` without printing a report. A
per-file failure prints in place and exits `1`.

**Why.** If the directory could not be read, there is no report. Printing
`0 files reported, 0 failed` would claim we looked and found nothing, which is
a different and false statement.

**GVP.** **personal:R2** (no silent failures — failures must be surfaced, not
swallowed) and **code-common:CP12**.

## 6. The exact set of things that make a file fail

**Chosen.** Exactly four: bytes that are not valid UTF-8; an empty file; an
unterminated quoted field; an OS-level read error. Everything else is counted.
In particular:

- A row whose field count differs from the header's is a data row and the file
  succeeds (requirement 6).
- A quote that is not at the start of a field is an ordinary character, so
  `a"b` is one three-character field rather than an error.
- An empty file *fails*, because it has no header row and therefore no column
  count; reporting `0 columns` would invent a header the file does not have.

**Why.** Requirement 5 demands some notion of "cannot be read as CSV" while
requirement 6 demands leniency about shape, so the line had to be drawn
deliberately. It is drawn at: can the file be divided into rows at all? An
unterminated quote means no; a ragged row or a stray quote means yes. Real
exports contain stray quotes, and refusing those files would help nobody.

**GVP.** **code-common:CP12** (know exactly which states exist) and
**personal:V2** (transparency — state the trade-off rather than leaving the
boundary implicit). The boundary itself is a judgement call the library does
not settle; see section 15.

## 7. Bytes are decoded strictly as UTF-8

**Chosen.** `new TextDecoder('utf-8', { fatal: true })`, with a BOM stripped
if present.

**Why.** The default decoder silently substitutes U+FFFD for bad bytes, so a
JPEG with a `.csv` name would report a confident, meaningless row count. A
reported failure is the honest answer. BOM stripping is free and keeps the
marker out of the first header field.

**GVP.** **personal:R2** (no silent failures or data loss) and
**personal:V2**.

## 8. Three exit codes: 0, 1, 2

**Chosen.** `0` all counted, `1` at least one file failed, `2` could not start
(bad arguments, or the directory is unreadable). Named constants in
`index.ts`, documented in `--help` and the README.

**Why.** The failure count is already computed; turning it into an exit status
costs three lines and makes the report usable from a script without parsing
the summary line. Splitting "a file failed" from "the tool could not run" is
the distinction a caller actually needs.

**GVP.** **personal:P19** (favour low-effort, high-information signals, even
when it is not certain they will be immediately useful) and **personal:P20**
(prefer machine-consumable forms where easy); **code-common:CP9** for naming
the codes rather than scattering integer literals.

## 9. Failures print to stdout, in filename order, alongside successes

**Chosen.** `broken.csv  FAILED: unterminated quoted field (opened on line 3)`
appears in the one ordered list, on stdout. Only argument and directory errors
go to stderr.

**Why.** Requirement 4 says files are reported in filename order, one line per
file, and requirement 5 says a bad file is reported as a failure — so a
failure is a report line, not a diagnostic. Routing half the lines to stderr
would scramble the order the moment the two streams interleave.

**GVP.** **personal:R2** (the failure must be visible, and it is — in the
report, in the summary, and in the exit code). The stream choice follows from
the requirements rather than from the library.

## 10. No CLI flags beyond `--help`, but the parser takes a dialect

**Chosen.** No `--json`, no `--delimiter`, no `--recursive`. But
`parseCsvRows` and `tallyFile`/`tallyDirectory` take an optional `CsvDialect`
(`{ delimiter, quote }`) defaulting to RFC 4180, and `formatReport` is a
separate pure function over a typed report.

**Why.** The seams are free and already required for testability; the flags
are not. **code-common:CH2** is explicit that it governs where it meets
**personal:P21**'s preference for many early flex points: a feature that is
speculative with no concrete use case is deferred entirely, and nothing here
asks for semicolon files or JSON output. Keeping them out also keeps the
committed surface small.

**GVP.** **code-common:CH2** (deferral decision tree) as the governing
element; **code-common:CP5** (configuration as a parameter with a sensible
default, rather than a hardcoded constant mid-function) for the dialect being
a parameter at all; **code-common:CP11** (API surface is a commitment —
adding is easy, removing is expensive).

## 11. Which directory entries are records

**Chosen.** Entries directly under `<dir>` whose name ends in lowercase
`.csv`. No recursion into subdirectories. A directory named `notes.csv` is not
a file and is excluded silently. Symlinks are included; if one is broken, the
read fails and that surfaces as a reported failure. Ordering is by UTF-16 code
unit, not locale.

**Why.** "Every `*.csv` file directly under `<dir>`" is read literally. A
directory is not a file, so it is not a record and there is nothing to report
about it. A symlink *is* plausibly a file the user meant to include, so
dropping it silently would hide something; letting it fail loudly does not.
Code-unit ordering means the same directory produces the same report on every
machine, which matters more here than alphabetising correctly in a locale.

**GVP.** **personal:R2** for the symlink choice (a reported failure beats a
silent omission). The case-sensitivity and ordering calls are judgement, not
library-derived; they are written down in the README because of
**personal:V2**.

## 12. Tests: `node:test`, unit plus end-to-end, fixtures inside the project

**Chosen.** Node's built-in test runner via `tsx --test` — no Jest, no Vitest.
Unit tests for the parser, the counting, and the formatting; seven end-to-end
tests that spawn the exact command the README documents and assert stdout,
stderr, and exit codes. Fixtures are written to `tests/.scratch/` inside the
project and removed afterwards by a shared helper.

**Why.** Every requirement in TASK.md is pinned by at least one test, and the
ones that describe user-visible behaviour (ordering, the summary line, a
failure not stopping the run, an empty directory) are pinned end-to-end rather
than inferred from unit tests. A test framework would be a dependency earning
nothing over the built-in runner. Fixtures stay inside the project because the
brief says not to run the tool against anything outside this directory.

**GVP.** **code-testing:TP1** (tests for all code, unit *and* end-to-end —
"code shipped without tests is unverified, not done"); **personal:P13**
(verify in the production runtime, not just the test harness) for spawning the
real CLI; **code-common:CH1** again for the runner; **code-common:CP4**
(centralize shared logic) for the one fixture helper.

## 13. A committed `examples/` directory

**Chosen.** Three sample files — a clean one, a ragged one, and one with a
deliberately unterminated quote — with their exact expected output asserted by
a test and shown at the top of the README.

**Why.** It gives anyone picking this up, human or agent, a one-command way to
see the tool work and to see what a failure looks like, without constructing
fixtures first. Asserting the output in a test keeps the README honest as the
code changes.

**GVP.** **code-testing:TP3** (agents must be able to fully exercise the
implementation) and **ai-common:C2** (agents reproduce what is in the working
tree, so what is in it should be accurate).

## 14. Strict TypeScript, and `npm run check` as the gate

**Chosen.** `strict` plus `noUncheckedIndexedAccess`,
`exactOptionalPropertyTypes`, `noUnusedLocals`/`Parameters`, and
`verbatimModuleSyntax`. `npm run check` runs typecheck and tests together.

**Why.** The task mandated TypeScript; the strictness level and the single
aggregated command were the open choices. One command that does both is the
thing a person or agent will actually run.

**GVP.** **code-common:CP7** (strict typing) and **personal:R1** (verify
before claiming correctness — "typecheck must pass, tests must pass").
**code-common:CP10** would prefer this gate be mechanically enforced by a
pre-commit hook or CI rather than by convention; there is no VCS or CI in this
directory, so `npm run check` is the closest available form, and this is noted
rather than left looking like an oversight.

## 15. Decisions the library did not settle

**personal:H5** defines a blocker as a decision that cannot be unambiguously
derived from the library, and asks that such cases be surfaced as *guiding-
element patches* rather than bare decisions — and **personal:P15** puts human
review on the guidance, not on the decisions. The brief said to build it and
stop, so each of these was decided and recorded; the patch that would make the
choice unambiguous next time is given alongside, which is the part worth a
human's attention.

| Decision | What was chosen | Patch that would settle it |
| --- | --- | --- |
| Is an empty file a failure or a `0 rows, 0 columns` success? | Failure | A heuristic under **code-common:CP12**: *when a required input is absent, report its absence rather than reporting a default value that implies it was present.* |
| Lenient on stray quotes, strict on unterminated ones | As stated | A heuristic under **personal:V5**/**CP12**: *when parsing third-party data, reject only inputs that cannot be divided into records at all; tolerate everything that can be read, and report what was tolerated.* |
| Is a machine-readable output mode (`--json`) worth building unprompted? | No — exit codes only | **code-common:CH2** and **personal:P20** point opposite ways here. A tiebreak clause on CH2: *a machine-consumable form of an output the tool already computes is additive-with-known-access-pattern, not speculative* — would have flipped this. |
| Locale-aware or code-unit filename ordering? | Code unit | A principle under **personal:V2**: *prefer reproducible output over locally-correct output when a tool's output may be compared across machines.* |

None of these blocked the build. All four are recorded here and in the README
so that the choice is visible rather than buried in the code.
