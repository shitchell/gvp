# Decisions

One section per design choice: what was chosen, why, and which element of the
project's GVP library informed it (element ids as reported by
`cairn --library ./.gvp/library inspect <id>`).

---

## How ambiguities in TASK.md were resolved

**Chosen.** Every underspecified point below was decided from the library and
recorded here, rather than being raised as a question before starting.

**Why.** `personal:H5` defines a blocker as exactly "any decision that cannot be
unambiguously derived from my personal or the project GVP library", and tells me
to record a derivable decision and proceed rather than asking go/no-go.
`personal:P15` puts human review on the guiding elements, not on individual
decisions. Each decision below names the element it follows from; where two
readings were genuinely close, the section says so and names the alternative, so
the reasoning is reviewable after the fact rather than hidden.

**GVP:** `personal:H5`, `personal:P15`, and `personal:V2` for stating the close
calls instead of presenting a clean facade.

---

## Hand-written CSV parser instead of a dependency

**Chosen.** `src/csv.ts` implements the RFC 4180-style reader (quoting, doubled
quotes, embedded delimiters and newlines, LF/CRLF/CR terminators) in about 110
lines of code. No CSV dependency.

**Why.** `code-common:CH1` sets the threshold explicitly: if the useful portion
of an external library is ~200 lines or fewer, write it yourself. The portion of
`csv-parse` or `papaparse` this tool would use — tokenize and hand back rows —
is below that, and owning it means the failure modes are mine to define, which
requirement 5 (report failures per file) and requirement 6 (tolerate ragged
rows) both depend on. A third-party parser's tolerance settings would have had
to be bent to match those two requirements anyway.

**GVP:** `code-common:CH1`.

---

## Four modules, with report data separated from rendering

**Chosen.** `csv.ts` (text → records) → `tally.ts` (directory → report data) →
`format.ts` (report data → text/JSON) → `index.ts` (arguments, output, exit
status). `tally.ts` never prints; `format.ts` never reads files.

**Why.** `personal:P3` separates what the system must do from how it is
structured: "how many data rows does this file hold" is the requirement, and
"left-padded to the widest filename" is presentation. Keeping them apart is also
what makes both halves directly testable (`code-common:CP13` — testability is a
design input, not an afterthought): the formatter is tested on hand-built
reports with no filesystem, and the tallier is tested on real directories with
no string matching. Each requirement lands in one contiguous block
(`code-common:CP1`): all counting rules are in `csv.ts`, all failure
classification is in `tallyFile`.

**GVP:** `personal:P3`, `code-common:CP13`, `code-common:CP1`.

---

## TypeScript run directly by tsx, no build step

**Chosen.** Strict TypeScript (`strict`, plus `noUncheckedIndexedAccess`,
`exactOptionalPropertyTypes`, `verbatimModuleSyntax`), run via
`npx tsx src/index.ts <dir>`. `tsc --noEmit` is the typecheck; nothing is
emitted.

**Why.** `code-common:CP7` requires strict typing and TypeScript over
JavaScript. The task fixed the language, so there was no language choice to make
under `code-common:CP16`; what remained was whether to add a compile-and-emit
step, and for a tool whose documented entry point is `npx tsx src/index.ts`, a
`dist/` directory would be a second artifact to keep in sync for no gain
(`personal:V1`).

**GVP:** `code-common:CP7`, `personal:V1`.

---

## Strict about quote syntax, tolerant about everything else

**Chosen.** The parser rejects exactly two things: a quoted field that is never
closed, and a closing quote followed by stray text (`"x"y`). Everything else is
accepted — ragged rows, a quote part-way through an unquoted field (`12"`),
empty fields, mixed line endings.

**Why.** `code-common:CP12` asks, per failure: what is the consequence, does the
user need to know, can we recover. An unterminated quote swallows the rest of
the file, so every later row count would be wrong — the user needs to know, and
there is nothing to recover. Stray text after a closing quote has no single
correct reading, so guessing would produce a number presented as fact.
A bare quote mid-field, by contrast, has exactly one sensible reading, so
rejecting it would be noise. Requirement 6 already fixes ragged rows as
tolerable, and `personal:P4` pushed me to state the rule as one class ("can this
become records at all?") rather than a growing list of special cases.

**GVP:** `code-common:CP12`, `personal:P4`.

---

## Blank lines count as data rows

**Chosen.** An empty line between records is one data row holding one empty
field. A line terminator at the very end of the file closes the final record
instead of starting an empty one, so `a,b\n1,2\n` is one data row.

**Why.** This was a close call: many CSV tools skip blank lines, and a file with
a stray trailing blank line will now report one extra row. The deciding argument
is `personal:V5` — in a single-column file, an empty line and an empty value are
the same bytes, so "skip blank lines" cannot be implemented without silently
discarding real rows in that case, and `personal:R2` forbids silent data loss.
Counting them is also the rule with no special case in it (`personal:P4`).
The behaviour and its consequence are documented in README.md rather than left
for a user to discover (`personal:V2`).

**GVP:** `personal:V5`, `personal:R2`, `personal:P4`, `personal:V2`.

---

## An empty file is a failure, not a file with zero rows and zero columns

**Chosen.** A zero-byte `*.csv` file is reported as
`failed: no header row (file is empty)`.

**Why.** Also a close call — "0 rows, 0 columns" is a defensible reading.
Requirement 3 asks for "how many columns its header declares", and a file with
no header declares nothing; printing `0 columns` would state a measurement that
was never taken. `code-common:CP12` says never wander into a state you cannot
name, and this is a distinguishable state: an empty file is a different thing
from a header-only file, which *is* reported as a success with 0 data rows.
`personal:V2` prefers surfacing that over a plausible-looking zero.

**GVP:** `code-common:CP12`, `personal:V2`.

---

## Invalid UTF-8 is a failure; a byte-order mark is stripped

**Chosen.** Files are decoded with `new TextDecoder("utf-8", { fatal: true })`,
so undecodable bytes fail the file. A leading BOM is removed before parsing.

**Why.** Node's default decoding replaces bad bytes with U+FFFD and says
nothing, which is exactly the silent corruption `personal:R2` forbids — the row
count would still be printed, now derived from mangled text. Passing `fatal`
turns that into a named, per-file failure for one argument. The BOM is encoding
metadata rather than a field value; leaving it in place would silently corrupt
the first column's name, which is the same failure in miniature.

**GVP:** `personal:R2`.

---

## `.csv` matched case-insensitively; hidden files included

**Chosen.** `DATA.CSV` and `.staging.csv` are both records. Directories are
never records, even when named `nested.csv`; symlinks that resolve to files are.

**Why.** Requirement 1 writes the pattern as the glob `*.csv`, which a shell
would match case-sensitively and would not match dotfiles — so the literal
reading was the alternative here. I went the other way because requirement 1's
other half ("files that are not `*.csv` are left alone") makes skipping a silent
outcome: a user with `DATA.CSV` in the directory would get no line and no error,
and `personal:R2` treats silently dropping what the user meant to include as a
failure mode, not a neutral default. A broken symlink is deliberately kept in
the list so it surfaces as a per-file read failure rather than vanishing.
Both behaviours are documented in README.md.

**GVP:** `personal:R2`, `personal:V2`.

---

## Filenames sorted by code unit, not by locale

**Chosen.** `a < b` comparison, not `localeCompare`. `B.csv` sorts before
`a.csv`.

**Why.** `localeCompare` reads ambient locale state, so the same directory would
produce different output on two machines and the ordering test could pass
locally while failing elsewhere. `code-common:CP3` rules out depending on hidden
global state, and `personal:R1` wants the claim "files are reported in filename
order" to be verifiable — which it only is if the order is a function of the
filenames alone.

**GVP:** `code-common:CP3`, `personal:R1`.

---

## A dialect parameter, but no flag to set it

**Chosen.** `parseCsv(text, dialect)` takes `{ delimiter, quote }`, defaulting
to comma and double-quote. `tallyDirectory` threads it through. No CLI flag
exposes it.

**Why.** `code-common:CH2` is explicit about this shape: a feature that is
additive and whose access patterns are unknown gets a flex point without the
feature being implemented. A TSV mode is plausible but not asked for, so the
seam exists and the surface does not — and `code-common:CP11` notes that a CLI
flag, once added, is expensive to remove. Routing the delimiter and quote
through a named structure also removes them as magic literals in the parser
(`code-common:CP9`), with defaults keeping zero-config the normal path
(`code-common:CP5`).

**GVP:** `code-common:CH2`, `code-common:CP11`, `code-common:CP9`,
`code-common:CP5`.

---

## `--format json` as a second output mode

**Chosen.** A `--format text|json` flag; JSON emits the report structure
(`files[]`, `reported`, `failed`) that the text renderer formats.

**Why.** `personal:P20` asks for machine-consumable forms "where it is easy",
and here it was nearly free: `tally.ts` already returns the report as data, so
the JSON renderer is one `JSON.stringify` call and cannot drift from the text
output, since both read the same object (`personal:V3`). `personal:P19` favours
low-effort, high-information signals even when immediate use is not certain.
This is the one piece of surface beyond what the task asked for; it is additive,
so it does not change the default behaviour (`code-common:CP11`).

**GVP:** `personal:P20`, `personal:P19`, `personal:V3`, `code-common:CP11`.

---

## Four exit codes

**Chosen.** 0 every file read, 1 report produced with failures in it, 2 bad
arguments, 3 directory unreadable. Named constants in `src/index.ts`.

**Why.** The exit status is the one signal a shell can act on without parsing
anything, so it is the cheapest machine-consumable output the tool has
(`personal:P20`). Separating 2 from 3 follows `code-common:CP12`: "you asked for
something I can't do" and "I tried and the directory isn't readable" are
different states, and collapsing them would lose the distinction at precisely
the point a script needs it. `code-common:CP9` keeps them named rather than
scattered literals.

**GVP:** `personal:P20`, `code-common:CP12`, `code-common:CP9`.

---

## Per-file failures on stdout; only run-level errors on stderr

**Chosen.** A failing file's line goes to stdout, in its filename-order
position, prefixed `failed:`. Argument errors and the unreadable-directory error
go to stderr.

**Why.** Requirements 4 and 5 put failures in the report, one line per file, in
filename order. Splitting those lines onto stderr would break exactly that:
the two streams interleave unpredictably, so the report would no longer be in
filename order when viewed together, and redirecting stdout would silently drop
report rows. The failure is still surfaced as `personal:R2` requires — on its
own line, in the summary count, and in the exit status. A run-level error is a
different state: there is no report at all, so it is not report output
(`code-common:CP12`).

**GVP:** `personal:R2`, `code-common:CP12`.

---

## Aligned, pluralised text output

**Chosen.** `people.csv  3 rows, 3 columns`, with the filename column padded to
the widest name and row counts right-aligned; `1 row` and `1 column` in the
singular. Summary: `4 files reported, 1 failed`, where "reported" counts
successes and failures together.

**Why.** `code-common:CP2` asks for output a reader does not have to parse
mentally; aligning the counts is what makes a directory of twenty files
scannable. The summary wording follows requirement 8 read literally — the failed
files *were* reported, so they are inside the reported count rather than beside
it — and naming both numbers on one line keeps that unambiguous
(`personal:V2`). The alignment widths are computed, not hardcoded, and the gap
is a named constant (`code-common:CP9`).

**GVP:** `code-common:CP2`, `personal:V2`, `code-common:CP9`.

---

## Sequential file reads

**Chosen.** Files are read and parsed one at a time.

**Why.** The report order is already fixed by filename, so concurrency would buy
only wall-clock time, at the cost of an unbounded open-file count on a large
directory. `personal:V1` requires complexity to earn its place and it has not
here; `code-common:CH2` says a speculative feature with no concrete use case is
deferred entirely, with no flex point — so there is no concurrency knob either.

**GVP:** `personal:V1`, `code-common:CH2`.

---

## Unit tests plus end-to-end tests that spawn the real command

**Chosen.** 43 tests on `node:test`: `csv.test.ts` and `format.test.ts` are unit
tests; `tally.test.ts` builds real directories on disk (including an unreadable
file, a non-UTF-8 file, a symlink and a `.csv`-named subdirectory);
`cli.test.ts` runs `tsx src/index.ts` as a child process and asserts on stdout,
stderr and exit codes.

**Why.** `code-testing:TP1` wants both layers — unit tests to pin the pieces,
end-to-end tests to prove the assembled thing does what the user needs. The
end-to-end layer exists specifically because `personal:P13` warns that green
tests in a harness are not proof: the exit code, the shebang and the
`import.meta.url` entry-point guard only exist in the real runtime, so they are
only verified by actually running the command. `code-testing:TP2` shaped the
test list from the requirements — each of requirements 1–9 has a test that would
fail if that requirement broke. No dependency was added for any of this; the
runner ships with Node.

**GVP:** `code-testing:TP1`, `personal:P13`, `code-testing:TP2`.

---

## `index.ts` is importable without running

**Chosen.** `main(argv)` is exported and returns the exit code; the module only
executes itself when `import.meta.url` matches `process.argv[1]`.
`process.exitCode` is set rather than calling `process.exit()`.

**Why.** Without the guard, importing the module for a test would run the tool
against the test runner's own arguments — a hidden side effect of an import,
which `code-common:CP3` rules out. Returning the status from `main` instead of
exiting inside it keeps the decision at one place and makes it assertable
(`code-common:CP13`), and setting `process.exitCode` lets pending stdout flush
instead of truncating output on exit.

**GVP:** `code-common:CP3`, `code-common:CP13`.

---

## `npm run check` as the enforcement mechanism, and what is missing

**Chosen.** `npm run check` runs `tsc --noEmit` and the full suite. No git hook
and no CI configuration.

**Why.** `personal:P7` and `code-common:CP10` both want a rule encoded as a
mechanism rather than a convention, and a single command is the strongest
mechanism available here: this directory is not a git repository, so there is no
commit to hook and no CI to gate. That is a real gap, not a solved problem — if
this becomes a repository, the pre-commit hook running `npm run check` is the
next step, and `personal:V2` says to write that down rather than imply the
protection exists.

**GVP:** `personal:P7`, `code-common:CP10`, `personal:V2`.

---

## An `example/` directory in the tree

**Chosen.** Four CSV files and one `.txt`, including a deliberately broken
`broken.csv`, with the README's sample output taken from a real run against it.

**Why.** `code-testing:TP3` requires that whoever picks this up — human or agent
— can fully exercise the implementation; a committed sample directory means
observing real output takes one command instead of first authoring fixtures.
`ai-common:C2` warns that agents reproduce what they find in the tree, which is
why the broken file is named `broken.csv` and explained in the README, so it
reads as a fixture rather than as a mistake to copy.

**GVP:** `code-testing:TP3`, `ai-common:C2`.

---

## Scope note: what was deferred, and one thing to flag

**Deferred entirely, with no flex points**, per `code-common:CH2`: recursive
descent, a glob or include/exclude filter, totals across files, reporting *which*
rows are ragged, encodings other than UTF-8, and streaming for files too large
for memory. None has a concrete use case in TASK.md; each would be additive if
one appears.

**To flag:** the instruction was not to run the tool against anything outside
this directory, and the tool was only ever pointed at `example/` and at
throwaway directories it created itself. The automated tests do build their
fixture directories under the system temp directory (`os.tmpdir()`), which is
outside the project — they only ever read directories they just created, and
never any pre-existing location. If fixtures should stay inside the project
tree instead, that is a one-line change in the two test helpers
(`personal:V2`).
