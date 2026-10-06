# Decisions

One section per design choice: what was chosen, why, and which GVP element
informed it. Where no element bears on a choice, that is said plainly rather
than a citation being invented — and where the library pointed at something I
did *not* do, that is recorded too.

GVP elements are quoted by id; inspect any of them with
`cairn --library ./.gvp/library inspect <id>`.

---

## 1. No CSV library; the parser is just under 200 lines of our own

**Chosen.** A hand-written state machine (`src/csv-counter.ts`) instead of
`csv-parse`, `papaparse` or similar. The project has zero runtime dependencies.

**Why.** The useful portion of a CSV library here is one tokeniser loop. We need
no field values, no type coercion, no column mapping, no transforms — only
record and field *counts*. Everything else such a library ships would be dead
weight, and its tolerance rules (what it does with a ragged row, a stray quote,
an unterminated quote) are exactly the behaviour the task specifies, so they
would have to be verified and possibly worked around rather than trusted.

**GVP.** `code-common:CH1` (dependency adoption threshold) — "if the useful
portion of an external library is approximately 200 lines or fewer, write it
yourself", and it asks what fraction of the library you actually use. Here that
fraction is small and the fit question is decisive. `code-common:CH1` maps up to
`personal:V1` (simplicity).

## 2. Files are streamed, not read whole

**Chosen.** The counter is fed incrementally (`feed(chunk)` / `finish()`) and
driven from a `createReadStream`, so memory does not scale with file size.

**Why.** `readFile(path, 'utf8')` is one line shorter, but V8's maximum string
length (~512 MB) makes it a hard cliff, not a slow degradation: a tool whose
entire purpose is reporting on CSV files would crash on exactly the files most
worth measuring. Verified both halves rather than assuming them — a 627 MB CSV
counts correctly in ~100 MB of RSS, and `readFile` on the same file fails with
`Invalid string length`.

**GVP.** `code-common:CH2` (deferral decision tree), first branch: "if a feature
is needed for stability or correctness: implement now". This is a stability
property, not a speculative one. `personal:P2` (empirical validation before
commitment) is why both the limit and the fix were measured instead of reasoned
about.

## 3. Four small modules, split by seam rather than by size

**Chosen.** `csv-counter.ts` (counting), `tally.ts` (filesystem), `report.ts`
(rendering), `describe-error.ts` (error text), `index.ts` (CLI). The counter
knows nothing about files; `tally.ts` knows nothing about output format.

**Why.** Each boundary is already clean and each piece is independently
testable: the counter is tested with strings, the report with plain objects, and
neither needs a filesystem. Changing the output format touches one file.

**GVP.** `personal:H1` (extraction timing) — "if the boundary between two
concerns is clean and natural, extract now". `code-common:CP1` (one contiguous
block) is the check in the other direction: a change to the counting rules, the
selection rules or the output shape each lands in a single file, not scattered
across them. `code-common:CP13` (testability is a design constraint) drove
keeping the counter free of I/O.

## 4. `describe-error.ts` extracted for a second consumer, not pre-emptively

**Chosen.** The "render anything thrown as one line" logic lives in its own
module because both `tally.ts` (per-file failure) and `index.ts` (fatal
directory error) need it.

**Why.** Two real consumers exist today, so this is centralisation rather than
speculation.

**GVP.** `code-common:CP4` (centralize shared logic), bounded by `personal:H1` —
I would not have extracted it for one caller.

## 5. The parser is tolerant; exactly two things are failures

**Chosen.** A file fails only if (a) it cannot be read at all, or (b) its
structure is broken, which means it ends inside a quoted field or it is empty.
Ragged rows, blank lines, missing trailing newline, lone `CR`, a header with no
data, stray quotes mid-field, and junk after a closing quote all report
normally.

**Why.** The task requires ragged rows to succeed (requirement 6), so strict
RFC 4180 conformance is explicitly not the standard. The remaining question is
where tolerance stops, and the answer that falls out is: tolerate anything whose
meaning is still unambiguous, fail where the data itself is evidently truncated.
An unterminated quoted field means the rest of the file is missing, and the row
count would be a guess.

**GVP.** `code-common:CP12` (be aware of state; don't wander into bad states) —
"for each failure ask: what is the consequence, does the user need to know, can
we recover, should we stop". A ragged row has a known consequence and recovers;
a truncated quoted field does not, so the file stops and says so. `personal:R2`
(no silent failures) is why the second case is surfaced rather than counted
optimistically.

## 6. An empty file is a failure, not "0 rows, 0 columns"

**Chosen.** A zero-byte `*.csv` is reported as
`FAILED: no header row: file is empty`.

**Why.** Requirement 2 makes the first line the header. A file with no first
line declares no columns, so "0 columns" would be a fabricated measurement of
something that does not exist — and an empty CSV is nearly always a truncated
download or a failed export, which is worth seeing. A header-only file is a
different case and reports successfully as `0 rows`, because its header really
does declare columns.

**GVP.** `personal:R2` (no silent failures or data loss) and `code-common:CP12`.
`personal:V2` (transparency) is why the alternative is named here: reporting
`0 rows, 0 columns` is defensible, and a reviewer who prefers it is changing one
`finish()` branch and one test.

## 7. A blank line is a data row

**Chosen.** Every record terminator outside quotes ends a record, with no
special case for empty ones. `a,b\n\n1,2\n` is two data rows.

**Why.** A blank line is literally a record holding one empty field, and
requirement 6 already says a row whose field count differs from the header still
counts. "Skip blank lines" would be a second, separate rule that contradicts the
first. The one necessary asymmetry is at end-of-input, where a record is
completed only if characters were actually seen — that is what stops a trailing
newline from inventing a phantom final row.

**GVP.** `personal:P4` (generic solutions over special-case handling) — one rule
covering the class beats a carve-out per shape. `personal:V1` (simplicity).

## 8. A quote opens a quoted field only at the start of a field

**Chosen.** `3" pipe` is content. `"a,b"` is a quoted field. `"ab"cd` is one
field. A quote in mid-field never switches the parser into quoted mode.

**Why.** This is the one tolerance rule with a *silent* failure mode on the
other side. If any quote could open a quoted field, a single stray quote in a
dimensions column would swallow every newline until the next quote, and the tool
would report a confidently wrong, much smaller row count. Restricting the quote
to field start makes that impossible: stray quotes can only ever be content.

**GVP.** `personal:R2` (no silent failures or data loss) — the deciding factor
was which rule can be wrong without saying so. `code-common:CP12`.

## 9. Filenames sort by code unit, not by locale

**Chosen.** A plain `<` comparator, so `Upper.csv` precedes `a-simple.csv`. No
`localeCompare`.

**Why.** Locale collation depends on the environment's ICU data and the ambient
locale, so the same directory could order differently on two machines. A report
you cannot diff between runs is much less useful than one with a slightly
unintuitive order, and the order is documented either way.

**GVP.** `personal:P20` (prefer machine-consumable forms where easy) — a stable,
reproducible ordering is what makes the output diffable and testable. The exact
e2e assertion in `tests/cli.test.ts` is only possible because of this choice
(`code-common:CP13`).

## 10. `*.csv` is matched literally: case-sensitive, with a name before the dot

**Chosen.** `data.csv` matches. `data.CSV` does not. `.csv` does not.
`.hidden.csv` does.

**Why.** Requirement 1 says `*.csv`, and a literal reading is the one the user
can predict. Beyond that, the two directions are not symmetric: widening the
match later (adding case-insensitivity, or a `--ext` flag) is additive and
breaks nobody, whereas shipping case-insensitive and later narrowing it would
silently drop files from existing reports. The dotfile rule follows the glob
(`*.csv` does not match `.csv` in a shell); hidden files with a real name are
included, because skipping them would be the surprising behaviour.

**GVP.** `code-common:CP11` (API surface is a commitment) — "prefer additive
changes over breaking ones", which settles the direction to start from.
`personal:P3` (separate what from how) is why requirement 1 was read as given
rather than improved on.

## 11. Directories named `*.csv` are skipped; symlinks are followed

**Chosen.** An entry is a candidate if its name matches and it is not a
directory. Symlinks are read through, and a dangling one is reported as a
failure line (`ENOENT`), not skipped.

**Why.** "Every `*.csv` file" excludes directories, and a symlink to a CSV is a
CSV from the reader's point of view. A dangling symlink is the interesting case:
silently omitting it would mean the report quietly disagrees with `ls`.

**GVP.** `personal:R2` (no silent failures) for the dangling case.
`code-common:CP12` for knowing which state each entry is in.

## 12. Per-file failures go to stdout, in filename order

**Chosen.** Failure lines sit in their sorted position in the report on stdout.
stderr carries only whole-run errors (bad arguments, unlistable directory).

**Why.** Requirements 4 and 5 put the failure *in* the report — it is one of the
lines, and it holds its place in the ordering. Splitting it onto stderr would
destroy that ordering the moment the output is piped, and would make a file
vanish from the report it is supposed to appear in. The whole-run error is a
different kind of thing: there is no report, so stdout stays empty.

**GVP.** `code-common:CP12` — per-failure handling chosen by consequence, with
the two kinds of failure kept distinct rather than merged under one blanket
strategy.

## 13. Three exit codes: 0, 1, 2

**Chosen.** `0` everything reported, `1` report produced but something in it
failed, `2` no report possible. Named constants in `src/index.ts`, documented in
`--help` and the README.

**Why.** "Don't stop the run" (requirement 5) must not become "pretend it was
fine" — a caller in a pipeline needs to distinguish a clean report from a report
with holes, and both from a run that never happened. Separating `1` from `2` is
what lets a script tell "three files were bad" from "you pointed me at nothing".

**GVP.** `personal:P20` (prefer machine-consumable forms where easy) — the exit
code is the cheapest machine-readable signal available, so it should carry real
information. `personal:R2` (failures must be surfaced). `code-common:CP9`
(named constants for everything configurable) and `code-common:CP3` (explicit
over implicit) for not scattering bare `0`/`1`/`2` through the code.

## 14. "Reported" in the summary counts failed files too

**Chosen.** `10 files reported, 3 failed` — the first number is every file that
produced a line, failures included.

**Why.** Requirement 8 is genuinely ambiguous: "how many files were reported and
how many failed" could mean 10/3 or 7/3. The task's own wording decides it —
requirement 5 says a bad file "is reported as a failure" and requirement 6 says
a ragged one "is still reported as a success", so being *reported* is the
category that covers both. The alternative reading would also make the two
numbers not sum to the directory's file count, which is the first thing a reader
checks.

**GVP.** None directly; this is a reading of the requirement, not a design
preference. Recorded here because `personal:V2` (transparency) asks for
judgment calls to be explicit rather than presented as obvious.

## 15. Files are read one at a time

**Chosen.** A sequential `for` loop over the sorted names, not
`Promise.all`/`map`.

**Why.** Unbounded concurrency over a directory of thousands of CSVs opens
thousands of file descriptors and fails with `EMFILE` — the tool would break on
exactly the large directories it exists to summarise. Bounded concurrency would
fix that and go faster, but it is a performance feature with no stated need, and
it brings a pool to write and test.

**GVP.** `code-common:CH2` (deferral decision tree) across both halves: the
stability problem is fixed now, and the speed-up is deferred with no flex point
because there is no concrete use case. Noted in the README's known limits per
`personal:V2`.

## 16. No `--json`, no extra columns, but the renderer is a seam

**Chosen.** One output format: the human-readable report. Rendering lives behind
`formatReport(tallies)`, which takes structured `FileTally` objects, so a second
format is an added function and a flag, touching nothing else. Not shipped.

**Why.** `personal:P20` would like a machine-consumable form, and the pull to
add `--json` was real. Two things argued it down: the text output is already
line-oriented, regular and greppable, and the exit code already carries the
pass/fail signal — so the machine-consumability need is substantially met;
and requirement 3 fixes what a file's line contains, so adding a ragged-row
count or a byte size would be me widening the spec. Every flag is permanent.

**GVP.** `code-common:CH2` third branch (speculative with no concrete use case:
defer entirely) for the feature, and `personal:P1` (design around flex points —
"shape the architecture so the change is not painful when it arrives, but do not
implement the change early") for keeping the seam. `code-common:CP11` (API
surface is a commitment) for the restraint on output columns. Set against
`personal:V4` (user autonomy, which prefers options) and `personal:P21` (build
flex points early as config options) — both would have justified `--json`, and
`personal:V1` plus the deferral tree are the reason I did not.

## 17. TypeScript config strict enough to run without tsx

**Chosen.** `strict`, plus `noUncheckedIndexedAccess`,
`exactOptionalPropertyTypes` and `erasableSyntaxOnly`; `.ts` import specifiers
with `allowImportingTsExtensions`. `npm run typecheck` is the gate.

**Why.** `erasableSyntaxOnly` mechanically guarantees the source contains no
syntax that needs *compiling* rather than merely type-stripping, which is what
makes `node --experimental-strip-types src/index.ts <dir>` work as a documented
alternative to `npx tsx`. That turns "we happen not to use enums" from a
convention into something the typechecker enforces, and it keeps the tool from
being welded to one loader. Both invocations were run, not assumed.

**GVP.** `code-common:CP10` (prefer hooks, CI and validators over convention) —
the no-enums/no-namespaces requirement is enforced by a compiler flag rather
than a note in the README. `personal:V7` (flexibility/optionality) for not
locking the project to tsx. `personal:P13` (verify in the production runtime,
not just the test harness) for exercising both runtimes directly.

## 18. Tests at three levels, with committed fixtures

**Chosen.** Unit tests for the counter (including feeding input one character at
a time) and the renderer; integration tests for directory selection and
ordering; end-to-end tests that spawn the real CLI and assert exact stdout and
exit codes. `node:test` and `node:assert`, no test framework dependency.
Fixtures are committed files under `tests/fixtures/`; the empty directory and
the dangling symlink are built on demand by `tests/fixtures.ts`.

**Why.** Each requirement in the task is pinned by at least one test, and the
ones that are easy to get wrong (trailing newline, CRLF, quoted newline, blank
line, chunk boundary) are pinned at the unit level where the failure is legible.
The e2e test is what proves the assembled thing does the job — ordering,
alignment, interleaved failures and exit code are only observable there.
Committed fixtures also document the behaviour by example. The
chunk-boundary test exists because streaming (decision 2) introduced a failure
mode that no whole-string test can reach.

**GVP.** `code-testing:TP1` (tests for all code, unit and end-to-end — "code
shipped without tests is unverified, not done"). `code-testing:TP2` (design
every feature with testing in mind): the counter's string-in/counts-out shape
and the `FileTally` seam exist partly so these tests are cheap.
`code-testing:TP3` (agents must be able to fully exercise the implementation) is
why the CLI is driven as a real subprocess rather than by importing `run`.
`code-common:CH1` again for `node:test` over a framework.

## 19. `process.exitCode`, not `process.exit`

**Chosen.** `process.exitCode = await run(...)`.

**Why.** `process.exit` can terminate the process with buffered stdout
unflushed, which truncates the report when it is piped — losing output while
reporting success.

**GVP.** `personal:R2` (no silent failures or data loss).

## 20. Error text is normalised generically, not per error code

**Chosen.** One regex strips the syscall-and-path tail that Node appends to
errno messages (`ENOENT: no such file or directory, open '/x/y.csv'` becomes
`ENOENT: no such file or directory`). No table of known codes.

**Why.** The report line already names the file, so the path is noise. A
code-to-prose lookup table would read slightly better for the handful of codes I
thought of and would fall back to raw text for everything else; this handles
every errno code, including ones I have not seen, and never discards the code
itself.

**GVP.** `personal:P4` (generic solutions over special-case handling) — "prefer
building a generic mechanism that handles the class of failures, not just the
instance".

## 21. CLI surface: one required positional, plus `--help`

**Chosen.** `tally <dir>`. No default of `.`, no flags other than `-h`/`--help`,
no `--version`.

**Why.** Requiring the directory makes the target explicit at the call site,
which matters for a tool that walks the filesystem. `--help` is the one flag a
user will look for before reading anything else, and it carries the exit-code
table so the behaviour is discoverable from the tool itself. `--version` has
nothing to version against yet.

**GVP.** `personal:P8` (consolidated interfaces over many near-duplicate entry
points) and `personal:H7` (interface consolidation is bounded in both
directions — judged by how many times someone must consult help to do one task;
one command and one help page is one consultation). `code-common:CP3` (explicit
over implicit) for not defaulting the directory.

## 22. Report layout: aligned name column, pluralised counts

**Chosen.** Names padded to the widest name, two spaces, then
`N rows, M columns` or `FAILED: <reason>`. `1 row, 1 column` in the singular.
Summary on the line immediately after the last file, with no blank line, so an
empty directory produces exactly one line.

**Why.** Alignment makes the numbers scannable down the column, which is the
point of the report. `FAILED:` is a distinct prefix so failures are greppable
and visually obvious. No blank line before the summary keeps the output uniform
between the empty and non-empty cases, which requirement 9 implies.

**GVP.** `personal:H2` (delegation test) — the specific form is exactly the kind
of choice H2 says to delegate to the implementer once the constraints hold
(one line per file, filename order, the three facts per file, a summary line).
`personal:P20` is the one real constraint on it: pluralisation and padding both
stay regular enough to parse with a regex.

---

## Note on process

The library's own README describes capturing decisions with options, rationale
and rejected alternatives at planning time. This document is that artifact for
this task, which is also what `personal:P11` (AI-first development) asks for:
the rationale lives in a durable file, not only in the transcript.

Per `personal:H5` (disambiguate-then-surface gate), none of the above is
escalated for review: each one followed from the existing library, so it is
recorded and proceeded with. The two closest to genuinely ambiguous are
decision 6 (empty file as failure) and decision 16 (no `--json`), where the
library pulls in both directions; both are flagged above with what the
alternative would cost, which is the cheaper form of the same conversation.
