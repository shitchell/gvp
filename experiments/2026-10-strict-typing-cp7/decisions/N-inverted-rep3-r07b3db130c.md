# Decisions

One section per design choice made while building `tally`. GVP element ids
refer to `./.gvp/library`, queried with `cairn --library ./.gvp/library`.

---

## 1. A hand-written CSV reader rather than a dependency

**Chose:** `src/csv.ts`, ~80 lines of parser, instead of `csv-parse`,
`papaparse` or similar.

**Why:** the whole useful surface here is "text in, rows of fields out" —
quoted fields, `""` escapes, three line-ending styles. That is well under the
200-line threshold, and taking a library would mean adopting its own opinions
about blank lines, ragged rows and malformed input, each of which the task
specifies directly (requirements 5–7). Owning the parser means those
requirements are expressed in the code rather than worked around in config.

**GVP:** `code-common:CH1` (dependency adoption threshold — under ~200 useful
lines, write it yourself; also "what is the burden of working around its
limitations?"). Reinforced by `personal:V1`.

---

## 2. Node's standard library for argument parsing

**Chose:** `node:util`'s `parseArgs`, not `commander` or `yargs`.

**Why:** the interface is one positional and two options. `parseArgs` already
rejects unknown flags, which is the only behaviour a library would have added.
The tool therefore ships with zero runtime dependencies.

**GVP:** `code-common:CH1`; `code-common:CP16` (language and ecosystem choices
are effort decisions — the standard library already covers this effort).

---

## 3. Four modules split along what/how lines

**Chose:** `csv.ts` (text → rows), `tally.ts` (directory → report),
`format.ts` (report → output), `index.ts` (command line). The report is a plain
data structure; nothing below `index.ts` prints or exits.

**Why:** each requirement lands in exactly one file. Changing the output shape
never touches the counting; changing the parser never touches the CLI. It also
makes the counting testable without capturing stdout.

**GVP:** `personal:P3` (separate what from how at every layer — the counting
rules survive a rewrite in another language, the padding does not);
`code-common:CP1` (one contiguous block per change); `code-common:CP13`
(testability as a design constraint).

---

## 4. Per-file failure is a value in the report, not an exception

**Chose:** `FileReport = FileTally | FileFailure`, a discriminated union on
`outcome`. `tallyDirectory` never throws for a bad file. The single exception it
does throw, `DirectoryReadError`, is for the directory itself.

**Why:** requirement 5 says a bad file must not stop the run, and requirement 8
counts failures in the summary — so a failure is reportable data, not an error
path. Making it a type means the formatter cannot forget to handle it and the
compiler says so. The one case that genuinely cannot continue (the directory
will not list) is the one case that throws.

**GVP:** `code-common:CP12` (know what state you are in — for each failure ask
what the consequence is, whether the user needs to know, whether we can
recover); `personal:R2` (no silent failures); `code-common:CP7` (strict typing
— union over a nullable field).

---

## 5. Strict UTF-8 decoding

**Chose:** `TextDecoder('utf-8', { fatal: true })`. A file with invalid bytes
is a failure (`not valid UTF-8 text`), not a file full of `U+FFFD`.

**Why:** Node's default decoding silently replaces bad bytes, which would turn
a binary file named `data.csv` into a plausible-looking row count. A wrong
number reported confidently is worse than a reported failure.

**GVP:** `personal:R2` (failures must be surfaced, not swallowed);
`personal:V5` (never silently discard data); `code-common:CP12`.

---

## 6. An empty file is a failure, not "0 rows, 0 columns"

**Chose:** a zero-byte `*.csv` file is reported as
`FAILED: no header row: file is empty`.

**Why:** requirement 2 makes the first line the header. A file with no first
line has no header, so there is no column count to report. Printing
`0 columns` would state that the header declares zero columns, which is a
claim about a header that does not exist. A file containing only a header *is*
a success with `0 rows` — that header exists.

**GVP:** `personal:V2` (never present a clean facade over an unclear
situation); `code-common:CP12`.

---

## 7. Blank lines are not data rows

**Chose:** a line with no characters at all produces no row. A line of empty
fields (`,`, or `""`) does produce a row.

**Why:** almost every CSV file ends with a newline, and several have a blank
line between records. Counting those as data would make the common case wrong
by one. The distinction drawn — zero characters versus zero-length fields — is
the one that separates punctuation from data, and it is stated in the README
rather than left for a reader to discover.

**GVP:** `personal:V2` (document the trade-off explicitly rather than leaving
the rule implicit). The requirement itself ("how many data rows it holds")
decided the substance.

---

## 8. An unclosed quote is the only shape treated as malformed

**Chose:** lenient everywhere (a stray `"` mid-field is a literal character, a
ragged row is fine, trailing junk after a closing quote is appended), strict on
one thing: a quoted field that never closes raises `CsvParseError`.

**Why:** requirements 6 and 7 push towards leniency — odd-shaped data should
still be counted. But a file cannot be counted at all once a quote is left
open, because every subsequent comma and newline could belong either to a
field or to the structure; the row count is then unknowable rather than merely
unusual. That is the honest line between "strange" and "cannot be read as CSV"
(requirement 5), and keeping it to one rule keeps the parser's contract small
enough to state in a sentence.

**GVP:** `code-common:CP12` (don't wander into a state you cannot describe);
`personal:V1` (the simplest rule that meets the requirement); `personal:V2`.

---

## 9. Three exit codes

**Chose:** `0` all counted, `1` at least one file failed, `2` arguments or
directory unusable.

**Why:** the per-file failure and the whole-run failure are different outcomes
and a caller will want to tell them apart; collapsing both into `1` would
require parsing the text to recover the difference. Distinguishing them costs
two named constants.

**GVP:** `personal:P19` (low-effort, high-information signals, even if not
immediately needed); `personal:P20` (prefer machine-consumable forms where
easy); `code-common:CP9` (named constants, not bare `1` and `2`).

---

## 10. `--format json`, text by default

**Chose:** the text report specified by the task is the default; `--format
json` renders the same report for a program.

**Why:** the renderer seam exists either way (decision 3), so the JSON renderer
is about fifteen lines on top of it, and output is this tool's entire
interface — a report a program cannot read can only ever be read by a person.

**Honest tension:** `code-common:CH2` (deferral decision tree) says an additive
feature with unknown access patterns should get a flex point without an
implementation, which argues for the seam and not the renderer. `personal:P20`,
`personal:P21` (flex points exposed as config options in early builds) and
`personal:P19` argue for building it. I judged for building it because the cost
is near zero once the seam exists and the default behaviour is untouched. Per
`personal:H5` this was the one decision in the build that came close to needing
to be surfaced rather than simply derived; recording the tension here is the
alternative to presenting it.

**GVP:** `personal:P20`, `personal:P19`, `personal:P21`, `personal:V4` (opt-in
over auto-activation — the default is what the task asked for), against
`code-common:CH2`.

---

## 11. `raggedRows` in JSON only

**Chose:** the count of data rows whose field count differs from the header's
is carried in the report and printed in JSON, but not in the text lines.

**Why:** requirement 6 singles the case out, and counting it is one `filter`
over rows already in memory — a free signal about data a caller may well care
about. But requirement 3 names exactly three things to report per file, and the
text output is what the task specified; widening it was not mine to do. JSON
has room for extra fields at no cost to a reader, so the signal lives there.
The asymmetry is deliberate and documented in the README.

**GVP:** `personal:P19` (collect the cheap signal); `personal:P20` (put it where
a program can use it); `personal:V2` (document the asymmetry rather than hide
it).

---

## 12. Extension matching is literal and case-sensitive

**Chose:** a file is a record if its name ends in `.csv` (exact case) and does
not begin with `.` — exactly what the glob `*.csv` matches on a case-sensitive
filesystem. `DATA.CSV` and `.hidden.csv` are left alone.

**Why:** requirement 1 is written as `*.csv`, and the most defensible reading
of a glob is the glob. Case-insensitive matching is arguably friendlier, but it
would mean the tool reports a different set of files than the shell expression
in its own specification. Rather than quietly pick the friendlier rule, I
implemented the stated one and wrote the limit down.

**GVP:** `personal:P9` (follow the rule as written; change it by explicit
decision, not silently for a one-off); `personal:V2`.

---

## 13. Only regular files are records; symlinks are judged by their target

**Chose:** a `*.csv` entry that is a directory, fifo, socket or device is left
alone. A symlink is resolved and included if it points at a file. A *broken*
symlink is kept, so it surfaces as a failure.

**Why:** a directory named `archive.csv` is not a CSV file, and opening a fifo
named `data.csv` would hang the run — a bad state with no error to report.
A broken symlink is the opposite case: it is a `*.csv` entry that was meant to
be a file, so silently dropping it would hide something the user should see.

**GVP:** `code-common:CP12` (never wander into an unexpected bad state —
hanging on a fifo is exactly that); `personal:R2` (surface the broken link
rather than dropping it).

---

## 14. Sorting by UTF-16 code unit, not by locale

**Chose:** an explicit `byFilename` comparator using `<`/`>`, not
`localeCompare`.

**Why:** requirement 4 says filename order, and the same directory should
produce the same report on every machine. `localeCompare` makes the output
depend on an environment variable that appears nowhere in the code — the
ordering of `B.csv` and `a.csv` would change with `LANG`.

**GVP:** `code-common:CP3` (explicit over implicit — no hidden dependency on
global state); `code-common:CP2` (a named comparator says what the order is).

---

## 15. Strict TypeScript, strict constants

**Chose:** `strict` plus `noUncheckedIndexedAccess`,
`exactOptionalPropertyTypes`, `noFallthroughCasesInSwitch`,
`verbatimModuleSyntax`; `npm run typecheck` as a first-class script. Every
tunable value is a named constant (`DELIMITER`, `QUOTE`, `CSV_EXTENSION`,
`EXIT_*`, `COLUMN_GAP`).

**Why:** `noUncheckedIndexedAccess` is what forces `rows[0]` to be handled as
possibly absent, which is the empty-file case in decision 6 — the type checker
found that requirement rather than a reviewer. The named constants are the
difference between "change the delimiter" being a one-line edit and a search
for `','`.

**GVP:** `code-common:CP7` (strict typing); `code-common:CP9` (named constants
for everything configurable); `code-common:CP5` (configuration early, defaults
always); `personal:R1` (typecheck must pass before claiming correctness).

---

## 16. Unit tests per module plus an end-to-end test of the real command

**Chose:** `test/csv.test.ts`, `test/tally.test.ts` and `test/format.test.ts`
test modules directly; `test/cli.test.ts` spawns `npx tsx src/index.ts` as a
process and asserts on stdout, stderr and the exit code. Node's built-in test
runner, so no test dependency either.

**Why:** the unit tests pin each requirement to a named case (there is a test
whose name is each of requirements 1–9). The end-to-end test is what proves the
shipped command works: argument parsing, the top-level `await`, the shebang and
the exit code are all invisible to a unit test. Both layers, not one.

**GVP:** `code-testing:TP1` (tests for all code, unit *and* end-to-end);
`code-testing:TP2` (the test is the executable definition of success);
`personal:P13` (verify in the production runtime, not just the test harness);
`personal:R1`.

---

## 17. Fixtures generated at test time, inside the project

**Chose:** `test/helpers.ts` builds each fixture directory under `.tmp-test/`
in the project root and removes it afterwards, rather than committing a
fixtures tree.

**Why:** three of the cases that matter cannot be committed at all — an empty
directory (requirement 9), invalid UTF-8 bytes, a broken symlink — and a
generated fixture puts the input next to the assertion that reads it. Keeping
them inside the project, rather than in `os.tmpdir()`, also honours the
instruction not to point the tool outside this directory.

**GVP:** `code-testing:TP3` and `code-testing:TH1` (an agent must be able to
fully exercise the success definition — a case that cannot be expressed cannot
be tested); `ai-common:P5` (size limits to likely accidents — containing the
test's writes to one gitignored directory).

---

## 18. Whole-file reads, one file at a time

**Chose:** `readFile` per file, sequentially; no streaming, no concurrency.

**Why:** neither buys anything at the sizes this tool addresses, and both cost
real complexity — a streaming parser must carry its state across chunk
boundaries, and concurrency would need a bounded pool to avoid exhausting file
descriptors. The parser is a pure function over a string, which is why it is
easy to test. The limit is written in the README so the next person meets it
as a documented boundary rather than a surprise.

**GVP:** `code-common:CH2` (speculative, no concrete use case → defer entirely,
no flex point); `personal:V1`; `personal:V2` (document the limit).

---

## 19. Rationale written into the code, not only here

**Chose:** doc comments on each module and on the non-obvious branches state
*why*, and cite the GVP element where one decided the shape.

**Why:** the next change to this code is as likely to be made by an agent as by
a person, and whoever makes it will be reading the file, not this document. A
rationale sitting beside the line it explains is applied; the same rationale
three files away is not.

**GVP:** `ai-common:P3` (deliver context at the point of use — recall degrades
with token distance, `ai-common:C3`); `personal:P11` (externalise rationale
into durable artifacts so any implementer can act on it);
`code-common:CP2` (comments explain why, not what).

---

## 20. Three documented ways to invoke one implementation

**Chose:** `npx tsx src/index.ts <dir>` (the invocation the task names),
`npm run tally -- <dir>`, and `./src/index.ts <dir>` via a shebang and a `bin`
entry. All three run the same file.

**Why:** the task fixes one invocation; the other two are the forms a reader
will reach for by habit. They are aliases, not variants — there is a single
entry point, so none of them can drift from the others.

**GVP:** `personal:P8` (consolidated interfaces over near-duplicate entry
points — the interface should match the consumer's mental model, and these are
one interface with three spellings, not three interfaces);
`code-common:CP4` (shared logic in one place).

---

## Not decided here

Two things were left exactly as the task set them, with no deliberation spent,
per `personal:H9` (scale naming effort to expected reach) and the instruction
to build what was asked:

- the name `tally` and the `npx tsx src/index.ts <dir>` entry point;
- the text report's content — name, data rows, header columns, one line per
  file, one summary line — which is reproduced as specified rather than
  improved on.
