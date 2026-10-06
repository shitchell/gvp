# Decisions

One section per design choice: what was chosen, why, and which GVP element (if
any) decided it.

Element ids are from `./.gvp/library`; inspect any of them with
`cairn --library ./.gvp/library inspect <id>`.

Per `personal:H5`, a decision that follows unambiguously from the library is
recorded and acted on rather than escalated. Nothing in this build met the
bar for escalation — every choice below either followed from an element or was
a free choice under `personal:H2` (no outcome I would notice or care about, so
constrain and choose). Where the library was silent, the section says so.

---

## 1. Hand-written CSV parser rather than a library

**Chosen.** `src/csv.ts` implements CSV parsing directly — 287 lines, of which
187 are code and the remainder is comment, mostly the dialect documentation
discussed in §5. No `csv-parse`, `papaparse`, or similar.

**Why.** The useful portion of a CSV library for this tool is small: split on
commas and newlines, honour quoting, report ambiguity. Everything else such a
library offers — header mapping, type coercion, transform streams, delimiter
sniffing, row objects — is unused weight, and the parts I do need are exactly
the parts I want to be able to state precisely (see §5). Writing it also means
zero runtime dependencies and no supply chain to audit.

**GVP.** Decided by `code-common:CH1` (dependency adoption threshold): if the
useful portion of an external library is ~200 lines or fewer, write it
yourself. It is well under. `code-common:CH1` maps up to `personal:V1`
(simplicity), which agrees: fewer moving parts.

## 2. Streaming, chunk-fed parser rather than reading whole files

**Chosen.** The parser is a character state machine fed one chunk at a time
(`CsvRowParser.write`), driven from a `createReadStream`. It never holds more
than one chunk plus the current row. A `parseCsvText` wrapper serves callers
that already hold the whole string, built on the same state machine so there is
one implementation.

**Why.** The naive `readFile` version is a few lines shorter but caps the tool
at Node's maximum string length and makes memory use proportional to file size
— for a tool whose entire job is reporting on files of unknown size, that is a
correctness limit, not a performance nicety. The incremental form costs almost
nothing extra: the same state machine, plus three fields of carry-over state.

**GVP.** `code-common:CH2` (deferral decision tree) draws the line: a feature
needed for correctness is implemented now, not deferred behind a flex point.
The one-implementation-two-entry-points shape is `personal:V3` / `CP4` (don't
duplicate the state machine for the convenience case).

## 3. Four modules split by layer

**Chosen.** `csv.ts` (parse, no I/O) → `tally.ts` (filesystem, counting) →
`report.ts` (text) → `index.ts` (argv, streams, exit codes). Each boundary is
one-directional; `index.ts` is the only module that touches `process`.

**Why.** These are the natural seams, not invented ones: parsing is pure text,
tallying is the only part that does I/O, rendering is the only part that knows
the output format, and the CLI is the only part that knows about the runtime.
Any single change — a new output shape, a different dialect, a new flag — lands
inside one file.

**GVP.** `code-common:CP1` (one contiguous block) is the test I applied: will a
future change be scattered? `personal:P3` (separate what from how at every
layer) gave the cut lines, and `personal:H1` (extraction timing) licensed
extracting now rather than waiting for a second consumer — the boundaries are
clean and natural, which is exactly its "extract now" branch.

## 4. Counts exist as data before they exist as text

**Chosen.** `tallyDirectory` returns a `TallyReport` of discriminated-union
records (`FileSuccess` | `FileFailure`); `report.ts` turns those into strings.
Nothing in the core knows the output format.

**Why.** It makes the per-file failure path a value rather than a formatting
special case, it makes the tallying layer testable without parsing text back
out, and it is the seam a second output format would plug into.

**GVP.** `code-common:CP7` (strict typing — discriminated unions over loose
shapes) and `code-common:CP3` (explicit over implicit: `kind` is a tag, not an
inferred absence of a field). It is also the flex point `code-common:CH2`
prescribes for an additive feature whose access patterns are unknown — see §12.

## 5. Where the parser is strict and where it is lenient

**Chosen.** Two inputs are failures: an unterminated quoted field, and any
character other than `,`, newline or end-of-input after a closing quote
(`1,"ab"cd`). Everything else is accepted with a documented reading — a quote
inside an unquoted field (`3" pipe`) is literal text, a bare `\r` is literal
text, a ragged row is a data row, a leading byte order mark is ignored.

**Why.** The requirement that a file "that cannot be read as CSV" be reported
as a failure needs a definition, and the honest line is ambiguity: the two
strict cases have no single correct reading, so reporting a count for them
would be making one up. The lenient cases all have exactly one reading, so
failing them would hand the user a failure they cannot act on. Both lists are
in the README and in the module header, because a dialect decision that is not
written down is not a decision.

**GVP.** `personal:R2` (no silent failures) requires surfacing the ambiguous
cases rather than guessing. `personal:V2` (transparency) requires the line to
be documented rather than emergent — "when corners are cut or trade-offs made,
document them explicitly". `code-common:CP12` (don't wander into bad states)
is the frame: for each failure ask what the consequence is and whether the user
needs to know.

## 6. Parse errors carry a line and column

**Chosen.** `CsvParseError` records a 1-based line and column, and the report
line shows them: `broken.csv: FAILED - unterminated quoted field (line 3,
column 1)`. Lines count physical newlines, including those inside quoted
fields.

**Why.** "FAILED" alone tells the user a file is bad; a position tells them
where to look. The cost is two counters in the write loop.

**GVP.** `personal:P19` (favor low-effort, high-information signals) and
`personal:V2`.

## 7. A blank line is a row holding one empty field

**Chosen.** A blank line inside a file is emitted as a row (`['']`) and
therefore counted as a data row. A trailing newline at end of file is not — it
terminates the last row rather than starting a new one.

**Why.** These are different things. A trailing newline is a terminator and
counting it would invent a row that is not there. A blank line in the middle of
a file is a line of the file; dropping it would quietly change the count the
user is asking for. The requirement that ragged rows still count points the
same way: odd rows are reported, not discarded.

**GVP.** `personal:V5` (never silently discard data) and `personal:R2`.
Skipping blank lines is the kind of silent filtering both forbid.

## 8. An empty file is a success with zero rows and zero columns

**Chosen.** A zero-byte `*.csv` is reported `0 rows, 0 columns`, not as a
failure.

**Why.** Either answer is defensible — there is no header, so arguably no
column count exists. But "0 columns" is an accurate statement about a file with
no header, and nothing is ambiguous or lost, so calling it a failure would be a
stronger claim than the evidence supports. It is documented in the README so
nobody has to guess which way it went.

**GVP.** `personal:V2` (don't present a cleaner story than the facts — and
document the call). This one is close enough that the library narrowed it
rather than settled it; `personal:H2` (delegation test) covers the residue.

## 9. Per-file failures are contained; a directory failure is not

**Chosen.** `tallyFile` catches everything and returns a `FileFailure`, so one
bad file cannot stop the run. `tallyDirectory` does *not* catch a failed
listing — it throws, and `index.ts` turns that into a stderr message, no
report, and exit 2.

**Why.** Two different states that deserve two different handlings. One
unreadable file among ten still leaves a useful report; an unlistable directory
leaves nothing, and printing `0 files reported, 0 failed` for a path that does
not exist would be actively misleading — indistinguishable from an empty
directory.

**GVP.** `code-common:CP12`, directly: error handling is not "fail fast" or
"graceful degradation" as dogma — know what state you are in and ask per
failure whether to recover or stop. The catch boundary is placed where that
question gets two different answers.

## 10. Exit codes 0 / 1 / 2, and which stream gets what

**Chosen.** `0` all files reported; `1` the report printed but at least one
file failed; `2` nothing was reported (bad arguments, or `<dir>` unlistable).
The report goes to stdout; argument and directory errors go to stderr.

**Why.** A caller that pipes `tally` into something else needs to distinguish
"worked", "worked, with gaps", and "did not run" without parsing the summary
line. Three integers cost nothing and are already-conventional. Per-file
failures stay on stdout rather than stderr because the requirements put them in
the report, in filename order — splitting them across streams would scramble
that ordering for anyone reading both.

**GVP.** `personal:P20` (prefer machine-consumable forms where easy) and
`personal:P19`. `code-common:CP12` again for the three-state split, and
`code-common:CP9` for making them named constants rather than literals.

## 11. `process.exitCode` rather than `process.exit()`

**Chosen.** `index.ts` sets `process.exitCode` and returns.

**Why.** `process.exit()` can terminate before buffered stdout is flushed,
which truncates the report when it is piped — a silent, load-dependent loss of
exactly the output the tool exists to produce.

**GVP.** `personal:R2` (no silent failures or data loss).

## 12. Plain text output only; no `--json`, no `--delimiter`, no `--recursive`

**Chosen.** One output format, one positional argument, plus `--help`. The
structured `TallyReport` (§4) is the seam a second format would attach to, but
no second format is implemented and no flag reserves one.

**Why.** `personal:P20` pulls toward a machine-readable mode and `personal:P21`
toward many early flex points, so this needed resolving rather than
preference. There is no concrete consumer for JSON output, a different
delimiter, or recursion.

**GVP.** `code-common:CH2` decides it, and says so explicitly: "Where this
meets `personal:P21`'s preference for many early flex points, this tree
governs: no concrete use case means no seam." Its middle branch — additive,
access patterns unknown, add the flex point but not the feature — is what §4
already satisfies. `code-common:CP11` (API surface is a commitment) reinforces
it: a flag added now cannot be removed cheaply, and the exit codes in §10
already carry the machine-readable signal that `personal:P20` was asking for at
this scale.

## 13. Filename order is by code point, not locale collation

**Chosen.** An explicit `compareFileNames` using `<` / `>`, not
`localeCompare`. `B.csv` sorts before `a.csv`.

**Why.** Locale collation makes the report depend on the machine's environment
variables — the same directory would produce different output on two machines,
and a test asserting an order would pass or fail by locale. For a reporting
tool, reproducibility beats alphabetical friendliness. The comparator is
written out rather than relying on `Array.sort`'s default so the choice is
visible in the code instead of inherited from a default.

**GVP.** `code-common:CP3` (explicit over implicit) for writing the comparator
out; the determinism argument is mine, not the library's — no element speaks to
locale.

## 14. Hidden `.csv` files are included; extension matching is case-sensitive

**Chosen.** Any entry whose name ends in `.csv` is tallied, including
`.hidden.csv`. `archive.CSV` is not.

**Why.** Two sub-decisions that pull in opposite directions. A shell glob
`*.csv` would skip dotfiles, but silently omitting a file the user named `.csv`
hides data from a report whose purpose is completeness — so dotfiles are in. On
case, I took the requirement literally: widening to `.CSV` would mean the tool
reports on files the stated spec does not cover, which is a scope change rather
than a reading. Both are in the README's limits section, so neither is a
surprise.

**GVP.** `personal:R2` (no silent discard) decided the dotfile half. The case
half is a free call under `personal:H2` — multiple viable answers, no outcome I
would notice — so it is constrained (documented, one named constant) and
chosen rather than escalated.

## 15. Files are read one at a time

**Chosen.** `tallyDirectory` awaits each file in a sequential loop; no
concurrency.

**Why.** It bounds open descriptors at one, keeps the report order a property
of the code rather than of scheduling, and no plausible input makes it slow
enough to matter. Concurrency here would be an optimisation with no measured
need.

**GVP.** `code-common:CH2` (speculative with no concrete use case: defer
entirely) and `personal:V1`.

## 16. Named constants, declared next to their use

**Chosen.** `CSV_EXTENSION`, `READ_CHUNK_BYTES`, `HEADER_ROW_COUNT`, the exit
codes, the quote and separator characters — all named. They live in the module
that uses them, not in a shared `constants.ts`.

**Why.** The constants are named so they are adjustable and self-describing;
they are not centralised because a shared constants module separates each value
from the code that gives it meaning, which is the scattering `CP1` warns about.
Zero-config still works: every one of them has a working default and none is
exposed as a flag (§12).

**GVP.** `code-common:CP9` (named constants for everything configurable) and
`code-common:CP5` (configuration infrastructure early, defaults always), with
`code-common:CP1` deciding where they live.

## 17. Strict TypeScript, checked separately from running

**Chosen.** `strict`, plus `noUncheckedIndexedAccess`,
`noFallthroughCasesInSwitch`, `exactOptionalPropertyTypes`,
`verbatimModuleSyntax`. `npm run typecheck` runs `tsc --noEmit`;
`npm run check` runs typecheck then tests.

**Why.** `noUncheckedIndexedAccess` is what forced the CLI's argument handling
to destructure and test for `undefined` instead of asserting with `!`, which is
the bug it is there to prevent. `noFallthroughCasesInSwitch` is why the
parser's quote-state transition is an explicit re-dispatch rather than a
fallthrough. Both changed the code for the better rather than just adding
noise. `tsc` never emits — `tsx` runs the sources directly — so
`allowImportingTsExtensions` lets imports name the file that actually exists.

**GVP.** `code-common:CP7` (strict typing; TypeScript over JavaScript).
`code-common:CP10` (prefer hooks, CI, and validators over convention) argues
for making this a gate rather than a habit; `npm run check` is as far as that
goes here, since the project is not a git repository and has no CI — stated
plainly rather than claimed.

## 18. Tests: unit per module, plus end-to-end against the spawned CLI

**Chosen.** 68 tests. Unit tests for the parser, the tallying layer, and the
renderer; end-to-end tests that spawn the real CLI with `execFile` and assert
on stdout, stderr, and exit code. One e2e test runs the literal
`npx tsx src/index.ts <dir>` command the README documents.

**Why.** The unit tests pin behaviour cheaply; the e2e tests are the only thing
that proves the assembled program works, since a green unit suite says nothing
about argument parsing, module resolution under `tsx`, stream handling, or exit
codes. The npx test exists specifically so the documented entry point cannot
rot.

**GVP.** `code-testing:TP1` (tests for all code, unit and end-to-end — "code
shipped without tests is unverified, not done") and `personal:P13` (verify in
the production runtime, not just the test harness), which is precisely the
argument for spawning the real binary. `personal:R1` (verify before claiming
correctness) is why the test counts and behaviours quoted in this document and
the README were run rather than asserted — including the UTF-8 and
delimiter claims in the README's limits section.

## 19. Fixtures are built at run time, not committed

**Chosen.** Tests create temp directories with `mkdtemp` and write their CSV
bytes inline; there is no `test/fixtures/` directory of files.

**Why.** The bytes these tests turn on are invisible ones — trailing newlines,
CRLF, byte order marks, a zero-byte file. In a committed fixture an editor or
a formatter can change them silently and the test starts asserting something
else. Inline, the exact input is visible beside the expectation.

**GVP.** `ai-common:P2` (curate the working tree for AI legibility; stale or
misleading artifacts cause wrong code) and `code-common:CP13` (testability is
a design constraint).

## 20. No filesystem abstraction behind the tallying layer

**Chosen.** `tally.ts` calls `node:fs` directly. There is no injected
filesystem interface or in-memory backend.

**Why.** The parser — the part with all the branching — is already pure and
needs no filesystem to test. What is left is `readdir` plus a read stream, and
real temp directories test that better than a fake would: the `EISDIR`,
`EACCES`, and dangling-symlink cases in the suite are real errno paths a mock
would only have imitated.

**GVP.** `code-common:CH2` — a seam with no concrete second consumer is
deferred. `code-common:CP15` (swappable persistence behind an abstraction) does
not apply: this tool reads a filesystem rather than persisting to a datastore,
and there is no second backend. `personal:P13` supports testing against the
real thing.

## 21. A chunk-boundary invariance test

**Chosen.** One test feeds the same inputs through the parser at chunk sizes 1,
2, 3, 5, 7 and whole, and asserts the rows are identical.

**Why.** Every bug a streaming parser has that a whole-string parser does not
is a state-carried-across-chunks bug: a `\r` at the end of a chunk, a quote
split from its pair, a byte order mark alone in the first chunk. This one test
covers that whole class in ~15 lines. It is also what pins the
empty-first-chunk hole in the byte-order-mark check, which I found by reading
the code rather than from a failing test — the test now holds it closed.

**GVP.** `personal:P19` (low-effort, high-information signals) and
`personal:P4` (generic solutions over special-case handling) — the class of
failure, not the instances.

## 22. Report format: one line per file, no column alignment

**Chosen.** `name.csv: 3 rows, 4 columns` and
`name.csv: FAILED - <reason>`; a closing `N files reported, M failed`.
Singular nouns at a count of one. No padding to align columns.

**Why.** One line per file was required; the rest is taste within that. I
skipped alignment because it makes every line's width depend on the longest
filename in the directory, which costs a buffering pass and makes `grep`-ing or
diffing two runs noisier. `FAILED` leads the failure text so failures are
scannable in a long report.

**GVP.** `personal:V1` for declining the alignment pass, and `ai-common:C6`
(human attention is limited, large output is hard to navigate) for the leading
marker. Mostly taste, which `personal:H2` leaves to the implementer.

## 23. Node's I/O error messages are passed through verbatim

**Chosen.** A failure reason for an I/O error is Node's own message —
`EISDIR: illegal operation on a directory, read` — not a rewritten one.

**Why.** It is accurate and searchable, including the errno code, and a mapping
table of my own prose would be one more thing to maintain and get subtly wrong.
The cost is that `open`-stage messages repeat the file path on a line that
already names the file. Verbosity is the cheaper failure here.

**GVP.** `personal:V2` and `code-common:CP2` (clarity over cleverness — no
string surgery on error text). The trade-off is noted rather than hidden.

## 24. The name, and no scaffolding

**Chosen.** `tally`, as given by the task. Nothing in the project is a
placeholder or stub.

**Why.** The name came with the brief, so there was nothing to decide; the
library says as much about how much to spend on a name at this reach.
`code-common:CR2` forbids scaffolding without explicit quoted authorisation
from the user, which I do not have — so every path in this tool is implemented,
including every failure path.

**GVP.** `personal:H9` (scale naming effort to expected reach) and
`code-common:CR2` (no scaffolding without explicit verification).
