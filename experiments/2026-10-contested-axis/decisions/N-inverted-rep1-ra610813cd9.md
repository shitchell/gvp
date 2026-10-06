# Decisions

One section per design choice: what was chosen, why, and which element of the
project's GVP library informed it (element ids as reported by
`cairn --library ./.gvp/library inspect <id>`).

---

## 1. No runtime dependencies; the CSV reader is written here

**Chosen.** `src/csv.ts` is a hand-written reader (~110 lines including
comments) rather than `csv-parse`, `papaparse` or similar. `tsx` and
`typescript` are development tools only.

**Why.** The part of a CSV library this tool would use is the record splitter —
well under the threshold at which adopting a dependency pays for itself. Owning
it also means the failure semantics requirement 5 depends on (what exactly
"cannot be read as CSV" means) are defined here rather than inherited from
somebody else's leniency settings.

**GVP.** `code-common:CH1` (dependency adoption threshold — "if the useful
portion of an external library is approximately 200 lines or fewer, write it
yourself"), supported by `personal:V1`.

---

## 2. Four modules, split by concern rather than by convenience

**Chosen.** `src/csv.ts` (text → records, no I/O), `src/tally.ts` (directory →
report data, no output), `src/format.ts` (report → bytes, pure), `src/index.ts`
(arguments, printing, exit status).

**Why.** Each requirement lands in exactly one of them: quoting rules in
`csv.ts`, "header is not data" in `tally.ts`, the summary line in `format.ts`,
exit status in `index.ts`. A change to any one of them is a change to one
contiguous block of code. The boundaries were clean from the start, so they were
drawn now rather than waited on.

**GVP.** `code-common:CP1` (one contiguous block), with `personal:P3` (separate
what from how at every layer) for the compute/present split and `personal:H1`
(extraction timing — extract now when the boundary is clean and natural).

---

## 3. The report is data; rendering is a separate, pure step

**Chosen.** `tallyDirectory()` returns a `TallyReport` object and never prints.
`formatReport(report, format)` turns a report into the exact string the CLI
writes.

**Why.** It makes the interesting behaviour testable without a filesystem or a
subprocess: `format.test.ts` asserts on exact output from a literal report, and
`tally.test.ts` asserts on structure without caring about alignment. It is also
what makes a second output format nearly free (decision 4).

**GVP.** `code-common:CP13` (testability is a design constraint — "how something
will be tested is a design input, not an afterthought").

---

## 4. `--format json` alongside the default text output

**Chosen.** Text is the default; `--format json` emits the same report as JSON.

**Why.** The tool's whole product is a measurement, and measurements get piped
into other things. Serialising an already-existing data structure costs one
function; a user who wants per-file numbers in a script should not have to parse
a column-aligned table to get them.

**GVP.** `personal:P20` (prefer machine-consumable forms where easy) and
`personal:V4` (the system provides options and defaults; the user decides).

---

## 5. Extension and CSV dialect are configurable in code, not on the CLI

**Chosen.** `TallyOptions { extension, dialect }` with `TALLY_DEFAULTS` is
threaded through `tallyDirectory` and the reader, so the suffix, delimiter and
quote character are parameters with defaults rather than literals buried in
logic. Neither is exposed as a command-line flag.

**Why.** Two forces pull against each other here and both are in the library.
Configuration infrastructure wants to exist from the start, because magic
constants are harder to separate out afterwards — so the seam is built, and
`tally.test.ts` exercises it with a `;`-delimited, `'`-quoted `.tsv` file, which
also proves the seam actually works rather than merely existing. But every CLI
flag is a permanent commitment, and `--ext` without `--delimiter` would be half
a feature answering no stated need. The resolution: the flex point is real and
tested, the public surface stays at one flag.

**GVP.** `code-common:CP5` (configuration infrastructure early, defaults always)
for building the seam; `code-common:CP11` (API surface is a commitment) and
`personal:H7` (interface consolidation is bounded in both directions) for
keeping it off the command line; `personal:P17` (build a tentative flex point
and exercise it, rather than banking on an unvalidated assumption) for testing
it with a real consumer.

---

## 6. Permissive about row shape, strict about quoting

**Chosen.** A row with more or fewer fields than the header is a data row and
its file is a success (requirement 6). The column count always comes from the
header. Only two things make a file unreadable as CSV: a quoted field that is
never closed, and content directly after a closing quote (`"x"y`). A quote that
does not open a field — `12" pipe` — is ordinary text, as in Excel.

**Why.** Requirement 6 rules out field-count mismatch as a failure, so the line
between success and failure had to be drawn somewhere precise rather than left
to a parser's mood. These two cases are exactly the ones where the text admits
no single honest reading: there is no way to know where the author meant the
field to end. Everything else has a defensible reading, so it gets one.

**GVP.** `code-common:CP12` (be aware of state; don't wander into bad states —
"for each failure ask: what is the consequence, does the user need to know, can
we recover, should we stop"). Deciding the rule up front rather than discovering
it per-file is the point.

---

## 7. Bytes that are not valid UTF-8 are a failure, not a measurement

**Chosen.** Files are read as bytes and decoded with
`new TextDecoder('utf-8', { fatal: true })`, so invalid sequences throw instead
of becoming `U+FFFD`.

**Why.** `readFile(path, 'utf8')` silently substitutes replacement characters,
which means a JPEG named `data.csv` would be reported as a confident row and
column count derived from noise. That is a wrong answer presented as a right
one. Failing it says what is true: the file could not be read.

**GVP.** `personal:R2` (no silent failures or data loss — "failures must be
surfaced, not swallowed") and `personal:V2` (transparency — never present a
clean facade).

---

## 8. An empty file is a failure, not "0 rows, 0 columns"

**Chosen.** A zero-length file is reported as `FAILED: file is empty: no header
row`. (A file containing only a header is a success with 0 data rows.)

**Why.** Requirement 2 makes the first line the header, and requirement 3 asks
for "how many columns its header declares". An empty file has no header, so
reporting `0 columns` would be stating something about a header that does not
exist — and it would do so in the same shape as a real measurement, where
nothing distinguishes it from a genuine zero. A failure line says what is
actually the case and shows up in the failed count.

**GVP.** `personal:V2` and `personal:R2`. See decision 15 — this is the one
choice here I would not call fully determined by the library.

---

## 9. Per-file failures are reported; an unlistable directory is fatal

**Chosen.** A file that cannot be read becomes a failure line in the report, in
filename order alongside the successes, and the run continues (requirement 5).
A directory that cannot be listed throws out of `tallyDirectory` and the CLI
reports it on stderr with no report on stdout.

**Why.** The two failures differ in consequence, which is the question the
library says to ask. One file failing leaves four useful measurements to
deliver; the directory failing leaves nothing, and printing `0 files reported,
0 failed` for a misspelled path would be a confident lie about an empty
directory (requirement 9's output for a real empty directory is exactly that
line, so the two must not be confusable).

**GVP.** `code-common:CP12`, and `personal:V2` for not letting the two cases
produce the same output.

---

## 10. Four distinct exit codes

**Chosen.** `0` all reported, `1` report produced but at least one file failed,
`2` command line not understood, `3` directory unreadable. All four are named
constants in `src/index.ts` and documented in `--help` and the README.

**Why.** A report that lists failures while exiting `0` is a silent failure as
far as any script running it is concerned. Distinguishing the four cases is
nearly free at implementation time and tells a caller which of them happened
without parsing prose — "at least one CSV is broken" and "you gave me a bad
path" warrant different responses.

**GVP.** `personal:R2` (failures must be surfaced), `personal:P19` (favour
low-effort, high-information signals) and `personal:P20` (machine-consumable
forms).

---

## 11. Filenames sort by code unit, not by locale

**Chosen.** A plain `<`/`>` comparator rather than `localeCompare`.

**Why.** `localeCompare` reads ambient locale — a hidden global input, so the
same directory could report in a different order on a different machine, and the
end-to-end test's exact-output assertion would be machine-dependent. Byte order
is boring and identical everywhere.

**GVP.** `code-common:CP3` (explicit over implicit — "no hidden state or global
magic"), with `code-common:CP13` as the practical consequence: deterministic
output is what makes the exact-output test possible.

---

## 12. What counts as a file to report

**Chosen.** Every entry directly under `<dir>` whose name ends in `.csv` and
which is not a directory. Non-`.csv` names are left alone, including
`old-data.csv.bak`. A *directory* named `nested.csv` is not reported — it is not
a file. Dotfiles such as `.hidden.csv` **are** reported, which a literal shell
`*.csv` glob would not match. A symlink is followed; if it dangles or points at
a directory, the read fails and it appears as a failure line.

**Why.** Requirement 1 says "every `*.csv` file", and a directory is not a file,
so that exclusion is literal. The dotfile case is a deliberate deviation from
the glob's letter: silently omitting a CSV file that is really there is the one
outcome worse than reporting one the user did not expect, and the requirement's
evident intent is "every CSV file in this directory". Both readings are
defensible, so the behaviour is written down here and in the README rather than
left to be discovered.

**GVP.** `personal:R2` and `personal:V5` (data preservation — never silently
discard or strand data) for including dotfiles; `personal:V2` for documenting
the deviation instead of quietly taking it.

---

## 13. Whole-file reads, sequentially, with the limitation documented

**Chosen.** Each file is read into memory in full, and files are processed one
at a time. The reader itself is a generator, so records are counted as they are
produced rather than collected into an array.

**Why.** Nothing in the requirements concerns large files or large directories,
and both streaming I/O and bounded-concurrency reads are real complexity —
unbounded `Promise.all` over a directory would trade correctness for speed by
risking `EMFILE`. The cheap half was taken anyway, because yielding records
costs nothing and keeps a million-row file's rows from all existing at once. The
remaining limit is stated in the README rather than left for someone to hit, and
the generator means a future move to streaming changes how bytes reach the
reader, not how they are parsed.

**GVP.** `code-common:CH2` (deferral decision tree — a speculative feature with
no concrete use case is deferred), `personal:V1`, and `personal:V2` for writing
the limitation down. `personal:P1` (design around flex points, don't implement
the change early) for the generator seam.

---

## 14. Standard library for argument parsing and tests

**Chosen.** `node:util`'s `parseArgs` instead of `commander`/`yargs`;
`node:test` instead of `vitest`/`jest`.

**Why.** The same threshold as decision 1, with the difference that these are
already present — adopting either dependency would add install weight and a
version to maintain in exchange for a handful of lines. `node:test` also keeps
the test runner from needing its own TypeScript pipeline: `tsx --test` is the
whole configuration.

**GVP.** `code-common:CH1`, and `ai-common:P2` (prefer tools with deeper AI
training data when the choice is otherwise even — the Node built-ins are the
better-documented option here).

---

## 15. Unit tests per module plus end-to-end tests that run the real command

**Chosen.** `csv.test.ts`, `format.test.ts` and `tally.test.ts` test their
modules directly; `cli.test.ts` spawns `node --import tsx src/index.ts` as a
subprocess and asserts on its stdout, stderr and exit status. Every numbered
requirement in `TASK.md` has at least one test, including the empty directory
(requirement 9) and the ragged row (requirement 6). `npm run check` runs
typecheck and tests together. 39 tests pass; `tsc --noEmit` is clean.

**Why.** The unit tests pin individual behaviour, but only the subprocess test
proves the assembled thing works: exit codes, which stream output goes to, and
the module loader all exist outside the test harness and are exactly where a
passing unit suite can hide a broken command.

**GVP.** `code-testing:TP1` (tests for all code, unit and end-to-end) and
`personal:P13` (verify in the production runtime, not just the test harness).
`personal:R1` (verify before claiming correctness) is why the counts above are
stated rather than implied.

---

## 16. Fixture files on disk, with awkward cases built at run time

**Chosen.** `tests/fixtures/sample/` holds readable fixtures — a plain file, a
header-only file, one with quoted commas and an embedded newline and a ragged
row, an unterminated-quote file, an empty file, two non-CSV files, and a
directory named `nested.csv`. Permission-denied, invalid-UTF-8 and
missing-directory cases are constructed in a temp directory by the test that
needs them.

**Why.** A fixture you can open and read is a fixture whose expected numbers you
can check by eye, which is most of a test's value as documentation. The cases
that cannot survive a copy — a `chmod 000` file, a deliberately invalid byte
sequence — are built where they are used so there is no stale or
platform-dependent artifact sitting in the tree misleading the next reader.

**GVP.** `code-testing:TP2` (design every feature with testing in mind; the test
is the executable definition of success) and `ai-common:C2` / `ai-common:P2`
(agents reproduce patterns from the working tree, so curate it — no misleading
artifacts).

---

## 17. Strict TypeScript, strictly configured

**Chosen.** `strict: true` plus `noUncheckedIndexedAccess`,
`exactOptionalPropertyTypes`, `noUnusedLocals`/`Parameters`,
`noFallthroughCasesInSwitch`, `noImplicitOverride`. `FileReport` is a
discriminated union, so a failure has no row count to read by mistake and an
`ok` report has no error string.

**Why.** `noUncheckedIndexedAccess` is the one that earns its keep in a
character-scanning parser: every `source[index]` is `string | undefined` until
proven otherwise, which is precisely the end-of-input bug class the reader has
to get right. The union makes "a failed file has no size" a type error rather
than a convention.

**GVP.** `code-common:CP7` (strict typing) and `code-common:CP3` (explicit over
implicit).

---

## 18. CI as the enforcement mechanism, not a documented convention

**Chosen.** `.github/workflows/check.yml` runs `npm ci && npm run check` on push
and pull request.

**Why.** "Run the typecheck before you commit" is a suggestion that erodes the
first time someone is in a hurry. A gate that is silent when the tree is good
and speaks only when it is not costs nothing to live with, which is the kind
worth adding. A pre-commit hook would be the closer-to-the-edit option, but this
directory is not a git repository, so the hook would have had nowhere to install
itself.

**GVP.** `code-common:CP10` (prefer hooks, CI and validators over convention),
`personal:P7` (every process needs a concrete enforcement mechanism) and
`personal:P18` (gates must earn their friction — prefer friction-neutral ones).

---

## 19. No `bin` entry in `package.json`

**Chosen.** `package.json` exposes `npm run tally` and documents
`npx tsx src/index.ts <dir>`; it does not declare a `bin` pointing at a `.ts`
file.

**Why.** A `bin` entry is a promise that `tally` works as an installed command,
and a `.ts` entry point cannot keep that promise without a build step or a
fragile shebang. Making the commitment and then not honouring it is worse than
not making it.

**GVP.** `code-common:CP11` (API surface is a commitment) and `personal:V2`.

---

## 20. Failure messages carry a line number and lose Node's path noise

**Chosen.** Parse failures read `unterminated quoted field opened on line 2`.
I/O failures have Node's trailing `, open '/long/path/x.csv'` stripped, by
recognising the `syscall`/`path` fields any `ErrnoException` carries rather than
by matching known messages.

**Why.** The line number is the difference between "this file is broken" and
"this file is broken *here*", at the cost of carrying one integer through the
reader. Stripping the suffix generically means a code this tool has never seen
is trimmed correctly too, and the filename is already the first column of the
line.

**GVP.** `personal:P19` (low-effort, high-information signals) for the line
number; `personal:P4` (generic solutions over special-case handling) for
trimming by structure rather than by message.

---

## 21. Interpretation of the summary line

**Chosen.** `5 files reported, 2 failed` — "reported" counts every file that got
a line, successes and failures together, so the failed count is a subset of it.
An empty directory gives `0 files reported, 0 failed`, which is the only line
printed (requirement 9).

**Why.** Requirement 8 asks for "how many files were reported and how many
failed", which could also mean successes-then-failures. Since requirements 3 and
5 both describe per-file output as a *report* — a success is reported, a failure
is reported — reading "reported" as "appeared in the report" is the consistent
one. The alternative reading is recoverable from the same line either way, since
the two numbers plus the file lines determine it.

**GVP.** `personal:V2` — the ambiguity is recorded rather than silently
resolved. No element dictated the choice; requirement-internal consistency did.

---

## 22. On what the library did not determine

**Chosen.** Everything above was implemented without pausing to ask. The
library's own gate says a decision derivable from existing guiding elements is
recorded and proceeded with, and a decision that is *not* derivable should come
back as a proposed patch to the library rather than as a question. By that test,
one choice here is weaker than the rest and one is borderline:

- **Decision 8 (empty file is a failure).** `personal:V2`/`personal:R2` support
  it, but `personal:V1` would support reporting `0 rows, 0 columns` and moving
  on. The patch that would settle it: an element to the effect that *a
  measurement with no basis is reported as absent, never as zero* — a value a
  reporting tool can apply well beyond this case. I recommend that patch; it is
  the general form of the reasoning used here.
- **Decision 12 (dotfiles included).** `personal:R2`/`personal:V5` point at
  including them, but the requirement's literal `*.csv` glob excludes them, and
  no element arbitrates between a requirement's letter and its evident intent.
  The patch that would settle it: an element stating *where a requirement's
  literal form and its evident intent diverge, follow the intent and document
  the divergence*. I recommend it less strongly — it is close to licensing
  reinterpretation of requirements, which deserves a human's judgement.

**Why.** Both are visible and cheap to reverse, and flagging which decisions
rest on thinner support is more useful than presenting twenty-two choices as
uniformly solid.

**GVP.** `personal:H5` (disambiguate-then-surface gate — "present each of those
guiding-element patches to the human, with a recommendation") and
`personal:P15` (humans review guiding elements, not decisions).
