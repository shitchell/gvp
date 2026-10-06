# Decisions

One section per design choice, each with what was chosen, why, and the GVP
element that informed it (or a note that none did).

Library consulted: `cairn --library ./.gvp/library`. Elements are cited by id.

---

## 1. Hand-written CSV scanner instead of a parser dependency

**Chose:** `src/csv.ts` — a ~100-line state machine (180 lines including its
documentation) and no runtime dependencies at all. `tsx` and `typescript` are
dev dependencies only.

**Why:** The requirement is to count fields and rows, not to materialise them.
That is a four-state scanner. Taking `csv-parse` or `papaparse` would mean
adopting a few thousand lines to use a sliver of one, and would still leave the
strictness policy (decision 4) to be configured on top.

**GVP:** `code-common:CH1` — "if the useful portion of an external library is
approximately 200 lines or fewer, write it yourself." The useful portion here is
well under that. Also `personal:V1` (simplicity): fewer moving parts to
understand.

---

## 2. Counts only — field contents are never built

**Chose:** The scanner tracks structural state and discards every character; it
accumulates no field strings and no row arrays.

**Why:** Nothing downstream needs field text, so building it would be work and
memory spent on data with no consumer. It also removes the entire class of
quoting bugs that only affect *content* (unescaping, trimming), because content
is never produced.

**GVP:** `personal:V1` — complexity must earn its place; and
`code-common:CH2`, which says to defer a feature with no concrete use case
entirely rather than build a flex point for it.

---

## 3. Four modules split by concern, not one file

**Chose:** `csv.ts` (text → shape), `tally.ts` (directory → records),
`report.ts` (records → lines), `cli.ts` (args → exit code), `index.ts` (process
wiring).

**Why:** Each boundary here is clean and obvious rather than speculative: the
scanner has nothing to say about filesystems, and the renderer has nothing to
say about either. The split is also what makes the report's exact wording and
the exit codes unit-testable without touching disk or spawning a process.

**GVP:** `personal:P3` (separate what from how at every layer),
`code-common:CP13` (testability is a design constraint, not an afterthought),
and `personal:H1` — extract now when the boundary is clean and natural. Each
module is also one contiguous block for its concern per `code-common:CP1`: a
change to failure wording, for example, lands in one place.

---

## 4. What counts as "cannot be read as CSV"

**Chose:** A file fails for I/O reasons (not found, permission denied, …), for
not being valid UTF-8, for being empty, or for an unterminated quoted field.
Everything else is read as literal text — including a quote inside an unquoted
field (`6" pipe`) and text after a closing quote (`"x"y`).

**Why:** Requirement 5 demands failures and requirement 6 forbids failing on
ragged rows, so the line had to be drawn somewhere. The test I used: does the
ambiguity change the answer we report? An unclosed quote does — it swallows
every subsequent comma and newline, so a stray `"` can make 10,000 rows look
like 3, and the counts would be confidently wrong. A stray quote mid-field
cannot change any row's field count, so failing the file over it would cost the
user a real report for no gain in correctness.

**GVP:** `code-common:CP12` — "always know what state you are in, and never
wander into an unexpected bad state… for each failure ask: what is the
consequence, does the user need to know, can we recover, should we stop."
Strict exactly where the uncertainty corrupts the answer, tolerant where it
cannot. The tolerances are documented rather than silent, per `personal:V2`.

---

## 5. Strict UTF-8 decoding

**Chose:** `TextDecoder('utf-8', { fatal: true })`. Invalid bytes fail the file
with `not valid UTF-8 text` instead of decoding to replacement characters.

**Why:** Node's default lenient decode would turn a renamed `.xlsx` into
U+FFFD soup and then into a plausible-looking row count — a wrong answer
presented as a right one. This is a cheap, high-information check.

**GVP:** `code-common:CP12` (don't wander into a bad state) and `personal:R2`
(no silent failures). `personal:P19` — favour low-effort, high-information
signals — covers why it is worth the three lines. The residual gap (a binary
file that *is* valid UTF-8 still gets counted) is documented in the README
under `personal:V2` rather than papered over.

---

## 6. An empty file is a failure, not "0 rows, 0 columns"

**Chose:** A zero-byte `.csv` is reported `FAILED: file is empty: no header
row`.

**Why:** This is the judgement call I was least certain about, so I am flagging
it explicitly. Requirement 2 makes the first line the header and requirement 3
asks how many columns the header declares. An empty file has no header, so
"0 columns" would not be an answer — it would be a fabricated one, and it would
be indistinguishable in the report from a real file whose header genuinely has
no columns. Reporting it as a failure says the true thing: we could not
determine this file's shape. A header-only file is different and *is* a success
(`0 rows, N columns`), because its header exists.

**GVP:** `code-common:CP12` and `personal:V2` (transparency — don't present a
clean facade over an unanswerable question). Note the alternative is defensible;
if "0 rows, 0 columns" is wanted, that is a one-line change in `readCsvShape`
and a guiding element about how to treat degenerate input would settle it for
good, per `personal:H5`.

---

## 7. Case-sensitive `.csv` matching, and `.csv` alone is not a candidate

**Chose:** `name.endsWith('.csv')` with at least one character before the
extension. `archive.CSV` is left alone; `.hidden.csv` is reported.

**Why:** `*.csv` in the requirement reads as the literal lower-case extension,
and that is the narrower starting point. Loosening later (accepting `.CSV`, or
a `--extension` flag) only adds files to the report; tightening later would
remove files someone's script had come to expect. Hidden files are included
because a dotted name is still a name, and skipping them would silently drop
real data.

**GVP:** `code-common:CP11` — "prefer additive changes over breaking ones";
the asymmetry decides the direction. Including dotfiles follows `personal:V5`
(never silently discard user data).

---

## 8. Non-file entries are skipped, unclassifiable entries are reported

**Chose:** `stat` each candidate. A directory named `data.csv` is skipped
silently; symlinks are followed; if the `stat` itself fails, the entry is
reported as a failed file.

**Why:** "Every `*.csv` file" excludes things that are not files, and reporting
a directory as a failure every run would be noise the user cannot act on. But
not knowing *what* an entry is differs from knowing it is not a file — a
dangling symlink or an unreadable entry is something the user should hear about,
so it gets a line.

**GVP:** `code-common:CP12` (know your state; decide per failure whether the
user needs to know) and `personal:R2` (failures surfaced, not swallowed).

---

## 9. Deterministic filename order, not locale collation

**Chose:** Compare with `<`/`>` on the string (code-unit order), so `Mango.csv`
sorts before `apple.csv`. Not `localeCompare`.

**Why:** "Filename order" should mean the same thing on every machine. With
`localeCompare`, the report's order depends on the host's locale, which makes
output unreproducible and the ordering test environment-dependent.

**GVP:** `personal:P2` (empirical validation — a test that passes only in one
locale validates nothing) and `code-common:CP3` (explicit over implicit — no
hidden dependency on ambient locale). Documented in a comment at the comparison.

---

## 10. Report shape: aligned columns, failures inline, counts derived

**Chose:** One line per file, filename padded to the longest name, then either
`N rows, M columns` or `FAILED: <reason>`; summary last with no blank line
before it. The summary counts are computed in the renderer from the record
list, not carried alongside it.

**Why:** Failures belong inline because they are records in the same report and
must appear in filename order — routing them to stderr would scramble that
order and break the one-line-per-file promise. No blank separator, because
requirement 9 says an empty directory prints *only* the summary line. Deriving
the counts means there is no way for a stored count to drift from the list it
describes.

**GVP:** `code-realtime:RTP3` — "for any piece of mutable state there must be
exactly one authoritative source; dual tracking is a bug factory" — which is why
`reportedCount`/`failedCount` are not fields on the returned data. Full words
("columns", singular/plural agreement) over terse abbreviations follows
`code-common:CP2` (clarity over cleverness).

---

## 11. Exit codes 0/1/2 and a `--help` flag; no other flags

**Chose:** `0` all counted, `1` report printed but some file failed, `2` nothing
reported. `-h`/`--help` prints usage. No `--format json`, no `--delimiter`, no
`--recursive`, no config file.

**Why:** The exit code is the one signal a caller can act on without parsing
text, and distinguishing "the report is complete" from "the report has holes"
is exactly what a script needs. The flags I did not add are speculative: no
requirement asks for them, and every one of them is a public surface I would
then owe compatibility to. Delimiter and extension are named constants in the
source, so the seam exists where it is free.

**GVP:** `code-common:CH2` — "if a feature is speculative with no concrete use
case: defer entirely with no flex points" — against `personal:P20` (prefer
machine-consumable forms where easy), which the exit code satisfies cheaply
without a new flag. `code-common:CP11` (API surface is a commitment) and
`personal:P8`/`personal:H7` (consolidated interface; one entry point, one
argument) support keeping the surface at one command. `code-common:CP9`/`CP5`
cover the named constants with sensible defaults and zero config required.

---

## 12. Injected output writers rather than direct `console` calls

**Chose:** `runCli(args, { out, err })` returns the exit code; `index.ts` is
three lines that pass `console.log`/`console.error` and set `process.exitCode`.

**Why:** It makes the exit-code and stderr behaviour assertable in-process, and
`process.exitCode` (rather than `process.exit`) avoids truncating buffered
stdout on exit — a real way to lose output the user was promised.

**GVP:** `code-common:CP13` (testability is a design input) and
`code-common:CP3` (dependencies visible in the signature, no hidden global
state). Avoiding output truncation follows `personal:R2` (no silent data loss).

---

## 13. Tests: unit per module plus an end-to-end spawn of the documented command

**Chose:** `node:test` + `node:assert/strict`, 47 tests. Unit suites for the
scanner, the directory tally and the renderer; `cli.test.ts` drives `runCli`
in-process *and* spawns `npx tsx src/index.ts` against a fixture directory to
check stdout, stderr and the real exit code.

**Why:** Unit tests pin each piece's behaviour; the spawned run is the only
thing that proves the shipped invocation actually works — the entry point, the
`tsx` loader and ESM `.ts` import specifiers are all parts a green unit suite
would not exercise. The suite is the executable statement of the nine
requirements: each has at least one test, including the ragged-row and
quoted-comma cases and the empty directory.

**GVP:** `code-testing:TP1` (unit *and* end-to-end; code without tests is
unverified, not done), `code-testing:TP2` (the test is the definition of
success), `personal:P13` (verify in the production runtime, not just the test
harness) and `personal:R1` (typecheck passes, tests pass, before claiming
correctness).

---

## 14. Generated fixtures under `test/.tmp/`, not committed files

**Chose:** A `makeFixtureDir(caseName, entries)` helper writes each case's
directory on demand — text files, raw bytes, subdirectories and symlinks
through one entry type — and each suite removes its own cases afterwards.

**Why:** Several needed cases cannot be committed comfortably: an empty
directory, a dangling symlink, a file of invalid UTF-8. One mechanism that
covers all of them keeps every fixture's content visible next to the assertion
that uses it, instead of split between a committed tree and generated
special cases.

**GVP:** `personal:P4` (a generic mechanism for the class, not special-case
handling per instance), `code-common:CP4` (centralise the shared
setup/teardown) and `ai-common:P2` (curate the working tree for legibility — no
opaque fixture blobs to misread). Everything stays inside the project
directory, per the task's own constraint.

---

## 15. Sequential file reads, whole file into memory

**Chose:** `fs/promises` with a plain sequential loop; each file is read fully
with `readFile`.

**Why:** Report order comes from the sorted filename list, not from read order,
so concurrency would buy only wall-clock on large directories — unmeasured, and
not asked for. Streaming would let the scanner handle files larger than memory,
but it complicates the one piece of this tool that most needs to be obviously
correct. The limit is documented rather than hidden, and the scanner is a pure
`string → shape` function, so switching it to a chunk feed later is a local
change.

**GVP:** `code-common:CH2` (speculative with no concrete use case: defer) and
`personal:V1` (simplicity), bounded by `personal:V2` — the memory limit is
stated in the README's "Known limits" rather than left for a user to discover.

---

## 16. Strict TypeScript, `.ts` import specifiers

**Chose:** `strict` plus `noUncheckedIndexedAccess`,
`exactOptionalPropertyTypes` and `verbatimModuleSyntax`; `noEmit` with
`allowImportingTsExtensions`, so imports name `./csv.ts` and `tsx` runs the
sources directly. Discriminated unions for `FileTally` and a TS `enum` for the
scanner's states.

**Why:** The requirement names TypeScript, so the useful question is how much
of it to turn on; these flags cost nothing on a project this size, and
`noUncheckedIndexedAccess` is what forces the `args[0] === undefined` check in
`cli.ts` to be written rather than assumed. A discriminated union makes
"counted or failed" impossible to confuse at a call site, and
`npm run typecheck` is the mechanical gate rather than a convention.

**GVP:** `code-common:CP7` (strict typing, types on all signatures),
`code-common:CP3` (enums over string literals) and `code-common:CP10` (prefer a
validator/type check over a documented convention). Running the sources
directly rather than building also keeps `npx tsx src/index.ts <dir>` — the
invocation the task names — the real one, per `ai-common:C2`: no build artifact
for a reader to mistake for the source.

---

## 17. Name, and no element to cite

**Chose:** Kept `tally`, as the task specified. The one thing I did not take
from the library: nothing in it bears on the output's exact wording (`FAILED:`
versus `error:`, "columns" versus "cols") beyond `code-common:CP2`'s general
preference for clarity. Those were taste, exercised once and applied
consistently.

**GVP:** `personal:H9` (scale naming effort to expected reach) says a
small-audience tool does not earn deliberation here, and `personal:H2`'s
delegation test — would the requester notice or care if the implementer chose
differently? — is why I did not surface the wording as a question.
