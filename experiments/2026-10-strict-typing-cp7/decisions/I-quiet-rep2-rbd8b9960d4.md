# Decisions

One section per design choice: what was chosen, why, and which GVP element (if
any) informed it. Element ids are from `./.gvp/library` (`cairn --library
./.gvp/library inspect <id>`).

## 0. Resolving the spec's ambiguities here instead of asking

**Chosen.** `TASK.md` leaves several things open (what exactly counts as
"cannot be read as CSV", whether an empty file is a failure, what "reported"
counts in the summary). Each was resolved from the library and recorded in the
section below that covers it, rather than raised as a blocking question.

**Why.** The task says "write it however you judge best" — an explicit
delegation of form with the constraints already stated. Each open point had a
single reasonable answer once the library was applied, so proceeding and
recording was the prescribed move; none of them needed a new guiding element.

**GVP.** `personal:H2` (delegation test — constraints defined, form delegated,
so decide rather than ask) and `personal:H5` (a blocker is only a decision that
*cannot* be unambiguously derived; otherwise record it and proceed).

## 1. A hand-written CSV reader rather than a parser dependency

**Chosen.** `src/csv.ts`, ~140 lines including comments, is the whole CSV
implementation. No runtime dependencies at all.

**Why.** The needed surface is a row/field splitter with RFC 4180 quoting —
well under the threshold where adopting a library pays for itself, and owning
it means the failure behaviour (section 2) is ours to define rather than
inherited from whatever a library decided to be lenient about.

**GVP.** `code-common:CH1` (dependency adoption threshold: if the useful portion
is ~200 lines or fewer, write it yourself), supported by `personal:V1`.

## 2. Strict quoting: an ambiguous file is rejected, not guessed at

**Chosen.** A file fails when its quoting cannot be read exactly one way:
an unterminated quoted field, stray characters after a closing quote
(`"b"c`), or a quote opening mid-field (`b"c"`). The error names the line.

**Why.** The alternative is leniency — most parsers would silently produce
`bc` for `"b"c`. That is a silent reinterpretation of the user's data, and the
row count that follows from it is unverifiable. `TASK.md` requirement 5
explicitly provides for files that cannot be read as CSV, so refusing is within
spec and leaves the user in a known state with a line number to look at.

**GVP.** `personal:R2` (no silent failures or data loss), `code-common:CP12`
(always know what state you are in; handle and report), `personal:V2`.

## 3. Field-count mismatch is a measurement, not a failure

**Chosen.** A data row with more or fewer fields than the header is counted as
a data row, and its file is still a success — per requirement 6. `tally`
reports the header's column count and does not compare rows against it.

**Why.** Requirement, but it also draws the line that section 2 depends on:
`tally` measures file size, it does not validate schemas. Quoting ambiguity
makes the *measurement itself* unknowable; a ragged row does not.

**GVP.** Requirement-driven; `personal:P3` (separate what the system must do
from how it is built) kept the distinction explicit rather than conflating
"invalid CSV" with "irregular data".

## 4. An empty file is a failure

**Chosen.** A zero-byte `*.csv` file is reported as
`FAILED: file has no header row at line 1`.

**Why.** Requirement 2 makes the first line the header. A file with no first
line declares no columns, so reporting `0 columns` would invent a header that
does not exist, and reporting `0 rows, 0 columns` would be indistinguishable
from a file that genuinely has an empty header. Requirement 9 covers the empty
*directory*; it says nothing about empty files.

**GVP.** `code-common:CP12` (do not wander into a state you are reporting
inaccurately) and `personal:R2`.

## 5. Four layers: parse, measure, present, command

**Chosen.** `src/csv.ts` (rows out of text) → `src/tally.ts` (what is
measured) → `src/report.ts` (how it is rendered) → `src/cli.ts` (arguments in,
text and exit code out) → `src/index.ts` (the only module that writes to the
console).

**Why.** Each boundary here is clean and natural rather than speculative: the
parser has no idea it is counting rows, the tally has no idea it will be
printed, and the renderers have no idea where the text goes. Adding the JSON
rendering (section 8) touched one file. A change to any layer stays in one
contiguous block.

**GVP.** `personal:P3` (separate what from how at every layer — would the
statement survive a rewrite in another language?), `code-common:CP1` (one
contiguous block), `personal:H1` (extract now when the boundary is clean).

## 6. `runCli` returns its output instead of printing it

**Chosen.** `runCli(argv)` returns `{ stdout, stderr, exitCode }` and performs
no I/O; `src/index.ts` is five lines that write it and set the exit code.

**Why.** It makes the entire command — argument errors, usage text, exit codes
— reachable from a test without capturing streams or stubbing `console`, and it
keeps the process-global surface (`process.exitCode`, `console`) in one place.

**GVP.** `code-common:CP13` (testability is a design constraint, not an
afterthought) and `code-testing:TP2`; `code-common:CP3` (no hidden global
state) for confining the process globals to the entry point.

## 7. Exit codes distinguish "reported with failures" from "could not run"

**Chosen.** `0` all files reported, `1` report produced but some file failed,
`2` no report at all (bad arguments, or `<dir>` could not be listed). Named
constants in `src/cli.ts`, documented in `--help` and the README.

**Why.** A per-file failure and an unusable directory are different states and
a caller needs to tell them apart: `1` means "read the report, some lines are
failures", `2` means "there is no report". Collapsing them into one non-zero
code would hide which happened, and exit status is the cheapest machine-readable
signal a CLI has.

**GVP.** `code-common:CP12` (know which state you are in), `personal:P20`
(prefer machine-consumable forms where easy), `personal:P19` (low-effort,
high-information signals), `code-common:CP9` (named constants, not magic
numbers).

## 8. One `--format text|json` flag, not a `--json` boolean

**Chosen.** A single `--format` option defaulting to `text`; `json` emits the
report object as-is.

**Why.** The renderer seam from section 5 made the JSON output a dozen lines,
and a line-oriented text report is awkward for a program to consume (the
failure lines do not have the same shape as the success lines). `--format
<name>` is additive if a third rendering ever appears, whereas `--json` would
need a second boolean flag that contradicts the first. Both formats come out of
the same `TallyReport`, so they cannot drift.

**Trade-off, stated plainly:** this is slightly more than `TASK.md` asked for.
It is one flag, one default, and no change to the default output.

**GVP.** `personal:P20` and `personal:P19` as above; `code-common:CP11` (API
surface is a commitment — prefer additive shapes); `code-common:CP5`
(configuration wired up early, with defaults so zero-config works).

## 9. Features deliberately not built, and with no flex points

**Chosen.** No streaming reader, no configurable delimiter, no recursive
scan, no `--extension` override, no concurrency limit on the file reads. Not
implemented and not stubbed behind interfaces either. The memory and encoding
consequences are stated in the README's "Known limits".

**Why.** Each is speculative — no use case in `TASK.md` and no second consumer
asking for it. Interfaces added "just in case" would be complexity with nothing
validating their shape. The single real seam that a future delimiter or
streaming change would need already exists at the `parseCsvRows` boundary.

**GVP.** `code-common:CH2` (deferral decision tree: speculative with no
concrete use case → defer entirely, no flex points), `personal:P1` (infinite
flexibility for hypothetical scenarios equals infinite complexity),
`personal:V1`; `personal:V2` for documenting the limits instead of leaving them
to be discovered.

## 10. Filename order is code-unit order, not locale order

**Chosen.** Plain `Array.prototype.sort()` on the names, so `Gamma.csv` sorts
before `alpha.csv`. Not `localeCompare`.

**Why.** `localeCompare` makes the report depend on ambient process locale:
the same directory would produce a different line order on a different machine,
which breaks both diffing two runs and the tests. A locale-aware ordering would
be a user-facing preference, and nothing asked for one.

**GVP.** `code-common:CP3` (explicit over implicit — no dependence on hidden
ambient state), `personal:V2` (the behaviour is documented in the README).

## 11. `.csv` matching: case-sensitive suffix, hidden files included

**Chosen.** `name.endsWith(".csv")`. `data.CSV` and `data.csv.bak` are left
alone; a file literally named `.csv` or `.hidden.csv` is reported.

**Why.** Requirement 1 says `*.csv`, so the suffix is taken literally rather
than case-folded — case-folding would be a behaviour nobody asked for and is
wrong on case-sensitive filesystems where `data.CSV` is a distinct file.
Hidden files are included because excluding them is a shell-glob convention,
not a property of the file, and skipping a real CSV file without saying so
would be an omission the user cannot see. Both calls are documented.

**GVP.** `personal:R2` informed including hidden files (nothing silently
dropped from the report). The case-sensitivity call is requirement literalism
documented under `personal:V2`; no element decided it.

## 12. A directory named `*.csv` is skipped; an unreadable file is a failure

**Chosen.** Entries that are not files (a directory called `looks-like.csv`)
are not records at all. Entries that *are* files — including symlinks — are
read, and anything that goes wrong (`ENOENT` on a dangling symlink, `EISDIR`,
`EACCES`) becomes a failure record carrying the errno.

**Why.** Requirement 1 scopes the report to files, so a directory is outside
the subject rather than a broken member of it. A symlink, by contrast, is the
user pointing at a file they expect to be counted — if it cannot be read, that
is a failure they need to see, not an entry to drop.

**GVP.** `code-common:CP12` (ask per failure: what is the consequence, does the
user need to know) and `personal:R2` (surface the failure rather than swallow
it).

## 13. `node:test` and `tsx`, with both unit and end-to-end tests

**Chosen.** 31 tests on the built-in runner, run by `npm test`. Unit tests for
the parser and the tally; `test/cli.test.ts` spawns `tsx src/index.ts` as a
real child process and asserts on its stdout, stderr and exit code.

**Why.** The runner, assertions and temp-directory fixtures are all in the
standard library, so no test framework needed adopting. The e2e tests exercise
the exact command the README documents — a green unit suite would not have
caught, for example, a `.ts` extension import that the type-checker accepts but
the real loader rejects.

**GVP.** `code-testing:TP1` (tests for all code, unit *and* end-to-end — code
shipped without tests is unverified, not done), `personal:P13` (verify in the
production runtime, not just the test harness), `code-common:CH1` again for not
adding a test framework.

## 14. A type-check gate, and `npm run check` as the single entry point

**Chosen.** `typescript` and `@types/node` as the only devDependencies (plus
`tsx`), `strict: true`, `npm run typecheck` = `tsc --noEmit`, and
`npm run check` running the type-check and the tests together.

**Why.** `tsx` strips types without checking them, so without `tsc` the
annotations in this project would be decoration. One `check` command means the
complete verification is the easy thing to run; two separate commands invites
running only the fast one.

**GVP.** `code-common:CP10` (prefer validators and checks over documented
convention), `personal:R1` (checks must pass; verify before claiming
correctness), `personal:C2` / `personal:P18` (make the right thing the
low-friction path rather than relying on discipline).

## 15. "reported" in the summary counts every record, failures included

**Chosen.** `3 files reported, 1 failed` — the first number is the number of
lines above it, including the failures.

**Why.** Requirement 8 ("how many files were reported and how many failed") can
be read either way. Reading `reported` as the lines actually emitted makes the
summary a check on the report itself — count the lines, they match — whereas
reading it as successes-only makes the total something the user has to add up.
The JSON output uses the same two fields, so the two renderings agree.

**GVP.** `personal:V2` (the ambiguity is named rather than papered over);
`personal:H5` for resolving it and proceeding rather than asking.

## 16. Error text, not error objects, in the report

**Chosen.** A failed record is `{ file, ok: false, error: string }`, with the
message built where the failure happens (`describeFailure`). `fs` errors are
reduced to `ENOENT: cannot read file`, dropping the path `fs` repeats back.

**Why.** The error string is the whole of what both renderings need, it
serialises to JSON cleanly (an `Error` does not), and the file name is already
the first thing on the line, so repeating the absolute path in the message adds
width without information. The errno is kept because it is the part that tells
the user *why*.

**GVP.** `personal:P19` (low-effort, high-information signal — keep the errno
and the parse line number, drop the redundancy), `code-common:CP2` (the output
should be obvious to read).

## 17. An `examples/` directory committed alongside the code

**Chosen.** Four files — a quoted-comma and multi-line CSV, a header-only CSV,
a deliberately broken one, and a `.txt` that must be left alone — used as the
README's worked example.

**Why.** It makes the README's output copy-pasteable and verifiable, and it
gives anyone picking the project up (human or agent) a real directory to run
against without constructing one. The broken file also means the non-zero exit
path is demonstrated, not just described.

**GVP.** `ai-common:P2` (curate the working tree for legibility — patterns that
are visible get reproduced), `personal:P19`.

## 18. Types: inferred where possible, a discriminated union for records

**Chosen.** Return types are mostly inferred; `FileTally` is an explicit
`ok: true | false` union with `readonly` fields, and `OutputFormat` is derived
from the `OUTPUT_FORMATS` array rather than written out twice.

**Why.** The union is the one place the types earn their keep: it makes it
impossible to read `dataRows` off a failed record without narrowing first.
Elsewhere the compiler already knows the shape, so annotating it would just be
restating it. Deriving `OutputFormat` from the array keeps the `--help` text,
the validation and the type from drifting apart.

**GVP.** `code-common:CP7` (inferred typing — omit annotations the compiler
already knows, reach for a checker where a boundary needs one),
`personal:V3` / `code-common:CP4` (one source for the format list).
