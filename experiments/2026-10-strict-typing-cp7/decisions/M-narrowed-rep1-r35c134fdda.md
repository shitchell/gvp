# Decisions

One section per design choice made while building `tally`. Each states what was
chosen, why, and which GVP element informed it (element ids are from
`./.gvp/library`; inspect with
`cairn --library ./.gvp/library inspect <id>`).

Where a choice was not derivable from the library at all, that is said plainly
rather than dressed up with a citation.

---

## 1. A hand-written CSV reader rather than a parser library

**Chosen.** `src/csv.ts` is a 193-line state machine (comments included). No `csv-parse`,
`papaparse`, or similar.

**Why.** The only thing needed from a CSV library here is the structure of the
document — where fields and records end — which is a small state machine.
Pulling in a parser would mean using a few percent of it, adopting its own
notion of what counts as a malformed file, and then working around that notion
to satisfy requirement 6 (a ragged row is not an error). Writing it keeps the
failure policy where the rest of the failure policy lives.

**GVP.** `code-common:CH1` (dependency adoption threshold — if the useful
portion of a library is ~200 lines or fewer, write it yourself; it names
"burden of working around its limitations" explicitly, which is the deciding
factor here). Supported by `personal:V1`.

---

## 2. The reader counts shape; it never builds field values

**Chosen.** `readCsvShape(text)` returns `{ columns, dataRows }`. Field
contents are scanned past, never collected into strings or arrays.

**Why.** Nothing downstream needs the values, and not building them is both
less code and less memory than building them and throwing them away.

**GVP.** `personal:V1` (the simplest approach that meets the requirement;
every abstraction must earn its place — a general-purpose record-yielding
parser would be an unearned one).

---

## 3. Four modules split along what-they-know boundaries

**Chosen.** `csv.ts` (CSV text → shape, knows nothing about files),
`tally.ts` (directory → report, knows nothing about output), `format.ts`
(report → text or JSON), `index.ts` (argv, stdout/stderr, exit codes).

**Why.** Each boundary is clean and already forced by the requirements: the
reading rules (7), the per-file failure policy (5), the output shape (3, 4, 8)
and the process contract are independently specifiable and independently
testable. Changing the output format touches one file; changing the quoting
rules touches one file.

**GVP.** `code-common:CP1` (a change should land in one contiguous block —
the test "will this force future features to be scattered?" is what the split
answers), `personal:H1` (extract now when the boundary is clean and natural;
these boundaries were clean before any code was written), and
`code-common:CP13` (testability is a design input — the shape reader is pure,
so the awkward-input cases need no filesystem at all).

---

## 4. Per-file failure and run-level failure are different things

**Chosen.** A file that cannot be read becomes a `failed` record in the report
(`FailedFile`), and the run continues. A directory that cannot be listed throws
`TallyError` and ends the run.

**Why.** Requirement 5 demands the first. The second is a genuinely different
state: with no listing there is no report to produce, and pretending otherwise
would print `0 files reported, 0 failed` for a typo'd path — a confident lie
indistinguishable from an empty directory (requirement 9).

**GVP.** `code-common:CP12` (always know what state you are in; never wander
into an unexpected bad state; for each failure ask whether we can recover and
whether the user needs to know — recoverable per-file, unrecoverable per-run)
and `personal:R2` (no silent failures).

---

## 5. Three exit codes: 0, 1, 2

**Chosen.** `0` everything read, `1` report complete but some files failed,
`2` the run could not start.

**Why.** The distinction in decision 4 is only real if a caller can see it. A
single non-zero code would conflate "here is your report, with two bad files"
and "I did nothing".

**GVP.** `code-common:CP12` (states must be distinguishable) and
`personal:P20` (prefer machine-consumable forms where easy — an exit code is
the cheapest machine-readable signal a CLI has). `personal:P19` (low-effort,
high-information signals) points the same way.

---

## 6. A `--json` flag, but no `--delimiter` flag

**Chosen.** `--json` renders the same report as JSON. The CSV dialect
(delimiter, quote character) is a parameter of `readCsvShape` and `tally` with
a default, but is *not* exposed on the command line.

**Why.** These look like the same kind of addition and are not. JSON output is
~10 lines over a report structure that already exists, and it removes any need
for a caller to parse aligned text. A `--delimiter` flag is a feature with no
concrete use case stated in the task — but the *seam* it would need (not
hardcoding `,` and `"` inside the scanner) costs nothing to build now and is
unpleasant to retrofit, so the seam exists and the feature does not.

**GVP.** `personal:P20` for `--json`. `code-common:CH2` for the dialect
(deferral decision tree: additive feature with unknown access patterns → add
the flex point, do not implement the feature), reinforced by
`code-common:CP5` (wire configuration up from the start rather than
hardcoding, but always provide defaults so zero-config works) and
`personal:V7` (flexibility bought cheaply up front).

`code-common:CP11` (API surface is a commitment) is the counterweight that
kept this to one flag: `--recursive`, `--delimiter`, `--quiet` and friends are
deferred entirely, with no flex points, per `code-common:CH2`.

---

## 7. An empty file is a failure, not a zero-row success

**Chosen.** A `*.csv` file of zero bytes (or holding only a byte-order mark) is
reported as `FAILED: file is empty, so it declares no header`.

**Why.** This is the one requirement gap I had to fill: requirement 2 says the
first line is the header, and an empty file has no first line. The alternative
— reporting `0 rows, 0 columns` — asserts that the header declares zero
columns, which is not true of any header, and makes an empty file
indistinguishable from a file containing a single empty header field (which
genuinely is `0 rows, 1 column`). Reporting it as a failure keeps those two
states apart. It is a judgment call, so it is documented in the README rather
than left for a user to discover.

**GVP.** `code-common:CP12` (never wander into an unexpected bad state) and
`personal:V2` (document trade-offs and judgment calls explicitly rather than
presenting a clean facade).

---

## 8. Malformed quoting fails a file; untidiness does not

**Chosen.** A file fails only on an I/O error, an unclosed quoted field, or
stray text between a closing quote and the next delimiter. Ragged records,
blank lines mid-file, and a bare `"` inside an unquoted field (`5" nails`) are
all accepted.

**Why.** Requirement 6 rules raggedness in, which leaves malformed quoting as
essentially the only structural way a file can fail to be CSV — so the quoting
rules are where strictness belongs, and being strict there is what makes the
"unterminated quoted field (line 2)" message possible. Bare quotes in unquoted
fields are RFC 4180 violations in theory and routine in practice; rejecting
them would fail files every other reader accepts, with no gain.

**GVP.** `code-common:CP12` (ask what the consequence of each failure is and
handle accordingly, rather than applying strictness or leniency as dogma).

---

## 9. Filenames ordered by code unit, not by locale

**Chosen.** `sort` with an explicit `left < right` comparator, not
`localeCompare` and not bare `Array.sort`'s default.

**Why.** "Filename order" (requirement 4) should mean the same thing on every
machine. `localeCompare` depends on the environment's locale, so the same
directory would report in different orders on different machines, which makes
reports harder to diff and harder to trust. The explicit comparator also
documents that the ordering was chosen rather than inherited.

**GVP.** `code-common:CP3` (explicit over implicit — no hidden dependency on
ambient locale state) and `personal:P20` (output a program can rely on).

---

## 10. `*.csv` is matched case-sensitively

**Chosen.** `extname(name) === '.csv'`. `DATA.CSV` is left alone, and so is a
file named exactly `.csv` — both matching what the shell glob `*.csv` does on
a case-sensitive filesystem.

**Why.** Requirement 1 is written as a glob, so the glob's own semantics are
the most faithful reading, and the most predictable one. Case-insensitive
matching would be friendlier to one user and surprising to another, with
nothing in the task to break the tie — so the literal reading wins and is
documented.

**GVP.** `personal:V1` for taking the literal reading over the clever one, and
`personal:V2` for writing the limitation into the README instead of leaving it
implicit. Note that `personal:H5` (disambiguate-then-surface) says not to
escalate a choice like this: it is a documented decision, not a blocker.

---

## 11. Directory entries: files and symlinks only

**Chosen.** `readdir(..., { withFileTypes: true })`, keeping entries that are
regular files or symlinks. A *directory* named `folder.csv` is skipped
silently; a symlink named `x.csv` that resolves to nothing is reported as a
failure.

**Why.** A directory is not a file, so requirement 1 ("every `*.csv` file")
does not cover it, and reporting it as a failure would be noise. A symlink is
intended to be a file, so if it cannot be read that is a real failure the user
should see.

**GVP.** `personal:R2` (failures must be surfaced, not swallowed) with
`code-common:CP12` for the distinction between "not our business" and "our
business, and broken".

---

## 12. Failure lines go to stdout, in filename order

**Chosen.** Both successes and failures are written to stdout, interleaved in
filename order. Only run-level errors (decision 4) go to stderr.

**Why.** Requirement 4 asks for one line per file in filename order, and
splitting the stream across stdout and stderr destroys that order for anyone
reading the terminal or piping to a file. The exit code and the `failed` count
carry the "something went wrong" signal instead.

**GVP.** `personal:R2` (surfaced — which it is, prominently, with a `FAILED:`
marker and a non-zero exit) and `personal:P20` (the report stays one
parseable stream).

---

## 13. Files read sequentially

**Chosen.** A plain `for` loop over the sorted filenames, one `readFile` at a
time, rather than `Promise.all`.

**Why.** Concurrency here would be an optimisation with no measured problem
behind it, and it adds a failure mode (unbounded open file handles on a large
directory) that the sequential version does not have. Output order is
independent of read order either way, since names are sorted first, so this
stays a free change if a real need appears.

**GVP.** `personal:V1` and `personal:P2` (empirical validation before
commitment — data, not vibes; no data yet says this is slow).

---

## 14. Whole-file reads, with the limit documented

**Chosen.** Each file is read into memory whole. The scanner consumes a string
rather than a stream.

**Why.** A chunk-fed incremental scanner is a real amount of extra state for a
file size this tool has not been told it will meet. The honest handling is to
take the simple version and say so, rather than imply the tool streams. The
boundary is where it would need to be if that changes: `src/csv.ts` already
only counts, so the work would be feeding the scanner in chunks, not
redesigning what it produces.

**GVP.** `code-common:CH2` (speculative with no concrete use case → defer) and
`personal:V2` (be honest about limitations rather than presenting a clean
facade — hence the note in the README).

---

## 15. Unit, integration and end-to-end tests, with the CLI driven for real

**Chosen.** 44 tests in three layers: `test/csv.test.ts` (reading rules
against strings), `test/tally.test.ts` (directories, ordering, failure
isolation), `test/cli.test.ts` (spawns `tsx src/index.ts` and asserts on exact
stdout, stderr and exit codes).

**Why.** The requirements divide cleanly into these layers, and the end-to-end
layer is the only one that can prove the thing a user actually runs behaves —
including the documented invocation itself, argument parsing, and exit codes,
none of which a unit test touches. Each numbered requirement has at least one
test: notably requirement 5 (`reports a malformed file as a failure and keeps
going`, asserting the files on either side are still reported), requirement 6
(`still counts a ragged row as a data row of a successful file`), requirement 7
(`does not split quoted fields on their commas`) and requirement 9
(`prints only the summary for an empty directory`).

**GVP.** `code-testing:TP1` (unit *and* end-to-end; code shipped without tests
is unverified, not done), `code-testing:TP2` (the test is the executable
definition of success), `personal:P13` (verify in the production runtime, not
just the test harness — green unit tests would not have caught a broken
`tsx` invocation or a wrong exit code) and `personal:R1` (verify before
claiming correctness).

---

## 16. Fixtures are built in code, and the unreadable file is a broken symlink

**Chosen.** `test/support/fixture-dir.ts` builds temp directories under
`./.tmp-test/` and removes them via `t.after`. The "cannot be read" case is a
symlink pointing nowhere, not a `chmod 000` file.

**Why.** Inline fixture contents make each test readable on its own, and a
helper keeps the setup in one place. The symlink is the portable choice: a
permission-denied fixture does not deny anything when the suite runs as root,
so that test would silently stop testing what it claims to. Keeping the
scratch directory inside the project also means a test run never writes
outside it.

**GVP.** `code-common:CP4` (centralize shared setup — duplicated setup and
teardown leaks resources), `code-testing:TP3` (a success criterion an agent
cannot actually exercise is not verifiable — a fixture that stops failing
under root is exactly that) and `ai-common:P2` (curate the working tree for
legibility: self-describing fixtures over opaque files).

---

## 17. TypeScript, strict, no build step

**Chosen.** `strict` plus `noUncheckedIndexedAccess` and
`verbatimModuleSyntax`; ESM with `.ts` import specifiers; run via `tsx`, with
`npm run typecheck` as a separate gate. No compiled output.

**Why.** The task names TypeScript on Node and requires `npx tsx src/index.ts`
to work, which rules a build step out of the critical path. Strict flags beyond
the default are near-free here: `noUncheckedIndexedAccess` is what forces the
scanner's lookaheads (`text[index + 1]`) to be handled as possibly-absent,
which is precisely where an off-by-one in a parser hides.

**GVP.** `code-common:CP7` (strict typing; types on exported signatures, let
inference carry internal ones — followed literally: the exported functions are
annotated, the private scanner methods mostly are not) and
`code-common:CP16` (evaluate a language on effort and hard requirements such
as type checking).

---

## 18. Named constants, including for presentation

**Chosen.** `CSV_EXTENSION`, `DEFAULT_CSV_DIALECT`, `CARRIAGE_RETURN`,
`LINE_FEED`, `BYTE_ORDER_MARK`, `NAME_COLUMN_PADDING`, `EXIT_OK`,
`EXIT_FILE_FAILURES`, `EXIT_CANNOT_RUN`.

**Why.** Each is a value a reader would otherwise have to decode from context,
and the exit codes in particular appear in three places (the usage text, the
return values, the README) and must agree.

**GVP.** `code-common:CP9` (named constants for everything configurable) and
`code-common:CP2` (clarity over cleverness; comments explain why).

---

## 19. Output wording and layout

**Chosen.** `name  N rows, M columns`, pluralised (`1 row, 1 column`), names
padded to a common width; summary `N files reported, M failed`. "Reported"
counts every file that produced a line, failures included.

**Why.** Requirement 8 is ambiguous about whether a failed file was
"reported"; since requirement 5 says a failure *is* reported, counting it in
`reported` is the consistent reading, and `4 files reported, 1 failed` states
both numbers plainly enough that the ambiguity cannot bite a reader. The rest
— alignment, pluralisation — is taste, with nothing in the library bearing on
it.

**GVP.** None for the formatting itself, and `personal:H2` (the delegation
test) is the reason: with multiple viable forms and no constraint being
violated, the form is the implementer's to choose. `personal:V2` covers
writing the "reported" reading down rather than leaving it implicit.

---

## 20. No enforcement hook installed

**Chosen.** `npm run typecheck` and `npm test` exist and both pass, but no
pre-commit hook or CI gate wires them up.

**Why.** `code-common:CP10` and `personal:P7` both say a rule that must hold
should be a hook rather than a convention, and by that standard this project is
short one mechanism. It is not installed because this directory is not a git
repository and has no CI, so a hook would have nothing to attach to — the
trigger for adding one is the first commit, and this is flagged here rather
than quietly skipped.

**GVP.** `code-common:CP10` and `personal:P7` (named as the unmet standard),
with `personal:V2` for saying so instead of leaving the gap unmentioned.

---

## 21. Nothing is scaffolded

**Chosen.** Every path described in the README is implemented and tested; there
are no placeholders, `TODO`s, or stub branches.

**Why.** `code-common:CR2` forbids scaffolding without explicit, quoted
verification from the user that scaffolding is wanted. No such verification was
given, so there is none.

**GVP.** `code-common:CR2`.
