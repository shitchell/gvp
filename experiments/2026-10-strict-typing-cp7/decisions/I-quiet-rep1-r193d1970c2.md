# Decisions

One section per design choice, with what was chosen, why, and the GVP element
that informed it. Element ids are from this project's library
(`cairn --library ./.gvp/library inspect <id>`).

## 1. Write the CSV reader rather than take a dependency

**Chosen:** a hand-written reader in `src/csv.ts` (~100 lines including
comments), no runtime dependencies at all. The only dependencies are `tsx`,
`typescript` and `@types/node`, all dev-only.

**Why:** the useful portion of a CSV library here is the quoting rules and
record splitting — well under 200 lines — and taking `csv-parse` or `papaparse`
would mean adopting a configuration surface and an error vocabulary I would then
have to translate into this tool's failure reporting anyway. Writing it also
means the definition of "cannot be read as CSV" (requirement 5) is mine to state
precisely rather than inherited from a library's leniency settings.

**GVP:** `code-common:CH1` (dependency adoption threshold) is close to
dispositive here — it asks exactly what fraction of the library I would use and
what the burden of working around its limitations is, and both answers point the
same way. `personal:V1` (simplicity) supports it: zero runtime dependencies is
fewer moving parts and fewer assumptions to understand.

## 2. Four small modules split along concern boundaries

**Chosen:** `src/csv.ts` (the grammar), `src/tally.ts` (what a report is),
`src/report.ts` (how a report renders), `src/index.ts` (the command line).

**Why:** the boundaries are already clean and obvious — "what is a CSV record"
does not need to know what a report is, and "how do we print it" does not need
to know how a file is read. Each change the tool is likely to need next (a
delimiter option, a streaming read, another output format) lands inside one of
these files rather than across them.

**GVP:** `personal:H1` (extraction timing) is the test I applied: extract now
when the boundary is clean and natural, wait when it is not. These boundaries
are clean, so they are extracted; nothing further was. `code-common:CP1` (one
contiguous block) is the forward-looking half — each foreseeable change is
contained in one file. Held in tension with `personal:V1`: four files is the
most I could justify, which is why there is no separate CLI-parsing module, no
IO abstraction layer, and no types-only file.

## 3. The reader yields records lazily

**Chosen:** `readCsvRecords` is a generator yielding one `string[]` per record;
`tallyCsvText` consumes it and keeps only two counters.

**Why:** counting rows does not need every row in memory at once, and a
generator costs nothing over returning an array. It also makes the reader
reusable for something that wants the fields themselves, which a bare
`countRows` would not be.

**GVP:** `code-common:CP6` (proactive reusability) — a parameterized, composable
piece over a monolithic one. The lazy behaviour is pinned by a test, since it is
a property a future refactor could silently lose.

## 4. What "cannot be read as CSV" means, stated explicitly

**Chosen:** a file fails when (a) it cannot be opened or read, (b) a quoted
field is never closed, (c) a closing quote is followed by something other than a
comma or record separator, or (d) it is empty. Everything else — including
ragged rows, stray quotes inside unquoted fields, and blank lines — succeeds.
Each failure carries a reason, and parse failures carry a line number.

**Why:** requirement 5 demands a failure category without defining its edges, so
the edges have to be chosen and written down. The boundary I drew is "the text
cannot be divided into records and fields unambiguously". Ragged rows are
explicitly not a failure (requirement 6) because the division succeeded; an
unterminated quote is, because the rest of the file's structure is unknowable.

**GVP:** `code-common:CP12` (be aware of state; don't wander into bad states) —
its instruction is to ask per failure what the consequence is, whether the user
needs to know, and whether we can recover, rather than applying a blanket
strategy. `personal:R2` (no silent failures) requires every failure to be
surfaced with a reason rather than counted as zero rows. `personal:V2`
(transparency) is why the full grammar and its leniencies are in README.md
instead of being left for users to discover.

## 5. An empty file is a failure, not a zero-row success

**Chosen:** a file with no records at all is reported as
`FAILED: empty file: no header row`.

**Why:** requirement 2 makes the first line the header, and requirement 3 asks
how many columns the header declares. An empty file has no header, so reporting
`0 rows, 0 columns` would be asserting a column count that was never declared —
a zero-column CSV header does not exist (even a single blank line declares one
empty column). Reporting it as a failure says what is actually true.

**GVP:** `personal:R2` (no silent failures) — inventing `0 columns` is a bad
state dressed up as a good one. `personal:V2` (transparency) over a tidy-looking
output. This is the choice in this build least determined by the library; see
the candidate patch at the end.

## 6. A blank line counts as a data row

**Chosen:** a blank line is a record of one empty field and is counted.

**Why:** the alternative is to skip it, which means the reported row count
silently disagrees with the file's content. Requirement 6 already establishes
that a row with the "wrong" number of fields is still a row; a blank line is the
same case with one empty field.

**GVP:** `personal:V5` (data preservation — never silently discard) and
`personal:R2`. Documented in README.md under the grammar, per `personal:V2`.

## 7. Per-file failures go in the report; only a failed run goes to stderr

**Chosen:** failure lines appear on stdout, inline and in filename order, as
part of the report. stderr carries only the two things that prevent a report
existing: a usage error and an unreadable `<dir>`.

**Why:** requirement 5 calls a failed file "reported", and requirement 4 says
one line per file in filename order — a failed file is a line of the report, so
interleaving it into stdout keeps the ordering guarantee intact and keeps the
report readable when piped. A failure that prevents any report is a different
kind of event and belongs on the error stream.

**GVP:** `code-common:CP12` again — distinguishing "recoverable, report and
continue" from "cannot continue" per failure rather than by blanket policy.

## 8. Three exit codes

**Chosen:** `0` all files reported successfully, `1` report produced with at
least one file failure, `2` the run could not happen. Named constants
(`EXIT_OK`, `EXIT_FILE_FAILURES`, `EXIT_CANNOT_RUN`) in `src/index.ts`, and the
`--help` text is generated from them so it cannot drift.

**Why:** a script needs to distinguish "all good", "some files are broken" and
"you called me wrong" without parsing output. Distinguishing 1 from 2 is the
whole value: a wrong path should not look like a directory of broken files.

**GVP:** `personal:P19` (low-effort, high-information signals) — exit codes are
the cheapest machine signal available and are worth the few lines even before a
caller exists. `personal:P20` (prefer machine-consumable forms where easy).
`code-common:CP9` (named constants for everything configurable) is why they are
not literals at their use sites.

## 9. `--json` is included; nothing else is

**Chosen:** the CLI surface is `tally [--json] <dir>`, plus `--help`/`-h` and a
`--` option terminator. No `--recursive`, no `--delimiter`, no `--no-header`, no
`--quiet`.

**Why:** the report already exists internally as structured data, so `--json` is
a formatter swap of about ten lines and makes the tool usable from a script
without parsing lines. The flags I left out would each need a real decision
about behaviour, and none has a user asking for it. The option terminator is
three lines and closes a gap (a directory named `-x`) that would otherwise be
unfixable without a breaking change.

**GVP:** `personal:P20` and `personal:P19` justify `--json`.
`code-common:CP11` (API surface is a commitment) is why the list stops there —
adding a flag later is additive and cheap, removing one is not.
`code-common:CH2` (deferral decision tree) classifies the omitted flags as
speculative with no concrete use case: defer entirely, no flex points.
`personal:H7` (interface consolidation is bounded in both directions) — one
invocation form and two flags means a user consults `--help` once.

## 10. No filesystem abstraction

**Chosen:** `tallyDirectory` calls `node:fs/promises` directly. There is no
injected reader, no `FileSystem` interface.

**Why:** the only motive for the seam would be testing, and the tests do better
without it: they build real directories in `os.tmpdir()` and run the real entry
point as a subprocess, which exercises the real `readdir`/`readFile` behaviour
(including `ENOENT`, `ENOTDIR`, symlinks and directory entries named `*.csv`)
that a fake would only have imitated. The logic that genuinely benefits from
pure unit tests — the grammar and the counting rule — is already pure
(`readCsvRecords`, `tallyCsvText`).

**GVP:** `personal:P13` (verify in the production runtime, not just the test
harness) is the deciding one — a fake filesystem is exactly the kind of harness
that masks real interop behaviour. `code-common:CH2` classifies a swappable
backend here as speculative. `code-common:CP13` (testability is a design
constraint) is satisfied by the pure core plus real-directory tests rather than
by injection. Noted against `code-common:CP15` (swappable persistence behind an
abstraction): that principle is about durable storage the domain model depends
on, and this tool has none — it reads files a user names.

## 11. Filename order is code-unit order, not locale order

**Chosen:** sort with `<`/`>` on the raw names, not `localeCompare`.

**Why:** requirement 4 asks for filename order. `localeCompare` makes the output
depend on the machine's locale, so the same directory could produce two
different reports — and an end-to-end test asserting exact output would be
flaky. Byte-order sorting is reproducible everywhere and is what a shell glob
does.

**GVP:** `code-common:CP13` (testability is a design constraint) — a report that
varies by locale cannot be pinned by a test, so reproducibility is a design
input here, not a nicety. `personal:P2` (empirical validation) in the same
direction. Documented in README.md per `personal:V2`.

## 12. Unit tests plus end-to-end tests, and the README is pinned by one

**Chosen:** 38 tests in three files — `csv.test.ts` (the grammar),
`tally.test.ts` (the counting rule and directory scanning) and `cli.test.ts`
(the assembled tool, run as a subprocess). One test asserts README.md contains
the sample report verbatim; another runs the exact `npx tsx src/index.ts`
invocation the README documents. `npm run check` is typecheck plus tests.

**Why:** the unit tests pin each requirement's edge (header not counted, ragged
rows counted, quoted commas, failure isolation), and the end-to-end tests prove
the thing a user runs does what the README says. Pinning the README output means
the documentation cannot quietly go stale — the test fails if the format
changes.

**GVP:** `code-testing:TP1` (tests for all code, unit and end-to-end) is
directly on point and requires both kinds. `code-testing:TP2` (design every
feature with testing in mind) — the pure `tallyCsvText` boundary exists partly
because it makes the requirements executable. `code-common:CP10` (prefer hooks,
CI and validators over convention) is why README accuracy is a test rather than
a note to remember: `ai-common:C2` warns that stale artifacts in the working
tree get reproduced, and this makes drift fail loudly. `personal:P7` (every
process needs a concrete enforcement mechanism) is the general form.

## 13. TypeScript settings: strict, with inference carrying the rest

**Chosen:** `strict` plus `noUncheckedIndexedAccess`, `verbatimModuleSyntax`,
`noEmit`, and `.ts` import specifiers. Return types are annotated on exported
functions; locals and internal shapes are inferred. The report model is a plain
discriminated union (`ok: true | false`), not classes.

**Why:** `noUncheckedIndexedAccess` matters in a character-scanning parser,
where off-by-one reads past the end are the classic bug — it pushed the reader
onto `charAt`, which is well-defined at the end of input. Annotations are kept
where they are a boundary worth stating and omitted where the compiler already
knows.

**GVP:** `code-common:CP7` (inferred typing — omit annotations the compiler
already knows, prefer plain objects over model classes, reach for a checker
where a boundary needs one). `code-common:CP3` (explicit over implicit) is why
the failure case is a tagged union rather than a nullable field — an unreadable
file cannot be mistaken for a zero-row one.

## 14. Comments explain intent, not mechanics

**Chosen:** each module opens with what it is for; inline comments say why
(`// A leading BOM is an encoding artifact, not part of the first field name`),
not what the next line does. Long names are preferred over short ones
(`isFieldOrRecordBoundary`, `openingQuoteLine`).

**Why:** the only genuinely subtle code here is the parser loop, and what is
subtle about it is the rules it encodes, not its syntax.

**GVP:** `code-common:CP2` (clarity over cleverness — descriptive names even if
long, comments explain "why", not "what"). `ai-common:P2` (curate the working
tree for AI legibility) applies to the same text.

## 15. Case-sensitive `.csv` matching, and directories named `*.csv` are skipped

**Chosen:** an entry is a record if it is a file or symlink whose name ends in
`.csv`, matched exactly. `DATA.CSV` is left alone; a directory named
`nested.csv` is left alone.

**Why:** requirement 1 says `*.csv` files, and the literal reading matches what
a shell glob does on this platform. Requirement 1 also says *files*, so a
directory is not one. Case-insensitive matching would be a different rule, not a
more correct one, and silently reporting a directory as a file with an
unreadable-file failure would be noise.

**GVP:** `personal:V2` (transparency) discharges the residual risk of surprise —
both rules are stated in README.md under "Which files are reported" rather than
left implicit. `code-common:CP9`/`code-common:CP5` — the extension lives in one
exported constant (`CSV_EXTENSION`), so the rule has one home if it ever becomes
configurable.

## 16. Limitations documented rather than solved

**Chosen:** README.md names three: comma-only delimiters, UTF-8-only decoding
(invalid bytes become U+FFFD rather than failing the file), and whole-file reads.
Each says what would change to lift it.

**Why:** all three are real, none is required by the task, and discovering them
from behaviour would be worse than reading them. The memory note also records
where a streaming read would go (`tallyFile` in `src/tally.ts`), which is the
one place it would change.

**GVP:** `personal:V2` (transparency — "when corners are cut or trade-offs made,
document them explicitly"). `personal:P1` (design around flex points: shape
things so the change is not painful, but do not implement it early) — the seam
is identified and named, not built. The U+FFFD case is a known deviation from
`personal:R2`, which is precisely why it is written down.

---

## Where the library underdetermined a choice

Per `personal:H5`, decisions that follow from the library are recorded and taken
without asking. Three above were derived from broad values rather than settled
by a specific element. None was worth blocking a leaf tool over
(`personal:P16` — blast radius is small), so each was taken and is listed here
with the patch that would make it unambiguous next time.

1. **Empty input: failure or empty success** (decision 5). Derived from
   `personal:R2`. Candidate patch — a `code-common` principle: *"Absent input is
   not empty output: when a required part of a record is missing entirely,
   report it as a failure rather than synthesising a zero value for it."*
2. **Blank lines: counted or skipped** (decision 6). Derived from `personal:V5`.
   Candidate patch — a `code-common` heuristic under V5: *"When input contains a
   degenerate-but-present element, count it and document it; do not filter it
   silently. Filtering is an opt-in flag, never a default."*
3. **Case-sensitivity of a file-pattern argument** (decision 15). Derived from
   `personal:V2` only, which tells me to document whichever I chose, not which to
   choose. Candidate patch — a `code-common` heuristic: *"Match a CLI's file
   patterns the way the host platform's shell would, and state the rule in
   `--help`; do not invent a more forgiving match."*

## Verification

- `npm run typecheck` — clean (`tsc --noEmit`, strict).
- `npm test` — 38 tests, 38 passing, including the `npx tsx` invocation from the
  README and the README's own sample output.
- The tool was run by hand against `examples/sample` (exit 1), an empty
  directory (exit 0), a path that is a file (exit 2), and `--json`/`--help`.
  Nothing outside this directory was read (`personal:R1` — verify, don't claim).
