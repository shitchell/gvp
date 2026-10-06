# Design decisions

One section per choice. Each states what was chosen, why, and which GVP
element (if any) decided it. Elements are cited by id; `cairn --library
./.gvp/library inspect <id>` prints the full text.

Where a choice came down to taste rather than to the library, that is said
plainly rather than dressed up with a post-hoc citation (personal:V2).

---

## 1. Write the CSV reader rather than depend on one

**Chosen.** `src/csv.ts`, a hand-written RFC 4180-shaped reader, instead of
`csv-parse`, `papaparse`, or similar. The project has zero runtime
dependencies.

**Why.** The part of a CSV library this tool would use — split text into
records, honour quoting — is about 150 lines. Writing it also means the
failure modes are ours to define, which matters here because requirement 5
turns on exactly what "cannot be read as CSV" means; with a third-party parser
that answer would be a leniency setting someone else chose, and it would drift
between versions.

**GVP.** Decided by **code-common:CH1** (dependency adoption threshold: under
roughly 200 useful lines, write it yourself). Supported by **personal:V1**
(simplicity) and **code-common:CP16** (language/tool selection is an effort
decision — the effort here is genuinely lower unowned).

---

## 2. Three modules with one job each, plus a thin entry point

**Chosen.** `csv.ts` (text → records), `tally.ts` (directory → report data),
`format.ts` (report → string), `cli.ts` (arguments, streams, exit code),
`index.ts` (four lines binding it to `process`).

**Why.** Each requirement lands in exactly one file: quoting is `csv.ts`,
ordering and failure isolation are `tally.ts`, the summary line is
`format.ts`. Adding an output format touches only `format.ts`; changing what
counts as a data row touches only `csv.ts`. The seam that pays for itself most
is `tally.ts` returning data rather than printing: it is what makes the
counting testable without capturing stdout.

**GVP.** **code-common:CP1** (one contiguous block — a change should not
require finding scattered pieces) and **code-common:CP13** (testability is a
design constraint, not an afterthought). **code-common:CP4** (centralize
shared logic) is why pluralisation lives in one `count()` helper rather than
being inlined per line.

---

## 3. A bad file is data in the report, not an exception

**Chosen.** `tallyFile` catches everything and returns a `FailedFile` entry.
`tallyDirectory` only rejects if the *directory* cannot be listed.

**Why.** Requirement 5 says one bad file must not stop the run. Modelling the
failure as a value rather than letting it propagate makes that structural
instead of something a caller has to remember to wrap. The directory itself is
a different state: there is no partial report to salvage, so that one
propagates and the CLI turns it into exit code 2.

**GVP.** **code-common:CP12** (be aware of state; ask per failure whether the
user needs to know, whether we can recover, whether we should stop — rather
than applying "fail fast" or "degrade gracefully" as dogma). The failure
reason is carried through to the output rather than swallowed, per
**personal:R2** (no silent failures).

---

## 4. An empty file is a failure, not "0 rows, 0 columns"

**Chosen.** A file with no records at all is reported as
`FAILED — file is empty: no header row`.

**Why.** Requirement 3 says to report how many columns the header declares. A
file with no header declares nothing, so there is no honest number to print.
`0 rows, 0 columns` would be indistinguishable from a successful read of a
file that really had zero columns, which is a quiet lie about what happened.
Note this is a judgement call on an ambiguity in the requirements, not
something the requirements settle: a header-only file is still a *success*
with 0 data rows, which is the case requirement 3 clearly covers.

**GVP.** **personal:R2** (failures must be surfaced, not swallowed) and
**personal:V2** (be honest about limitations rather than presenting a clean
facade).

---

## 5. Ragged rows count; only unparseable text fails

**Chosen.** The reader returns records exactly as written and never pads,
truncates, or drops a row. A row with the wrong field count is a data row and
its file is a success. Only two things make a file unparseable: an
unterminated quoted field, and a stray character after a closing quote
(`"ab"c`).

**Why.** Requirement 6 states the first half directly. The second half is the
line it implies: a shape mismatch is the file's business, whereas text that
cannot be resolved into fields at all has no reading to report. The two
rejected cases are the only inputs where the reader would otherwise have to
invent a field boundary.

A deliberate leniency in the other direction: a bare `"` partway through an
*unquoted* field (`5" pipe`) is an ordinary character, not an error. It is
unambiguous, so failing the file would cost the user a readable report for
nothing.

**GVP.** **personal:V5** (never silently discard data — a short or long row is
not a reason to drop it) and **personal:V2** for drawing the "cannot be read"
line explicitly rather than leaving it implicit in parser behaviour.

---

## 6. Records, not lines — a quoted newline does not split a row

**Chosen.** A data row is a CSV *record*. A quoted field containing a newline
keeps its row intact, so the row count is not the line count.

**Why.** Requirement 7 says quoted commas do not separate fields; quoted
newlines are the same rule applied to the other delimiter, and a reader that
honoured one but not the other would miscount any file containing a multi-line
address or comment. Requirement 2's "first line" is read as "first record",
which is the same thing for every file without an embedded newline in its
header.

**GVP.** None decisive — this is the standard CSV semantics (RFC 4180) and
would be the same under any guiding library. Recorded because it is a reading
of an ambiguous requirement, and **personal:V2** asks for those to be visible.

---

## 7. Filename order is code-unit order, not locale order

**Chosen.** Plain `Array.prototype.sort()`, which compares UTF-16 code units.
So `B.csv` sorts before `a.csv`.

**Why.** Requirement 4 says filename order without saying whose. Locale-aware
collation would make the same directory produce different reports on different
machines, which breaks the output as something a script can diff or snapshot.
Code-unit order is the reproducible choice, and it is what `ls` and shell glob
expansion give under `LC_ALL=C`.

**GVP.** **personal:P20** (prefer machine-consumable forms) — stable ordering
is part of what makes output consumable. The tests pin the ordering so the
choice cannot drift silently (**code-common:CP10**).

---

## 8. Extension matching is case-insensitive

**Chosen.** `DATA.CSV` and `data.Csv` are reported.

**Why.** The judgement is that extension case is not meaningful content, so
`DATA.CSV` is a CSV file that the user means to have counted, and skipping it
would read as a missing row in the report rather than as intended filtering.
A literal reading of the glob `*.csv` would be case-sensitive on Linux; this
goes the other way deliberately.

**GVP.** Reasoned from **personal:R2** (do not let the user's data vanish
without a word) and **personal:V5** (data preservation), but neither decides
it unambiguously — it is a judgement call, and the opposite choice would also
be defensible. Flagged here rather than buried, per **personal:V2**. Changing
it is a one-line change in `hasCsvExtension`.

---

## 9. A JSON output format, and `text` as the default

**Chosen.** `--format text` (default) and `--format json`, behind one
`formatReport` function.

**Why.** The default is text because a person at a terminal is the common
case. JSON exists because a size report is naturally an input to something
else, and a report only a human can read cannot drive anything downstream. The
cost was about twenty lines and a shared report structure that both formats
read, so the second format earns its place rather than being speculative.

This was the one place where the library pulls in two directions:
**personal:V1** (simplicity — the requirements ask for one output) against
**personal:P20** (prefer machine-consumable forms where easy). P20's "where
easy" condition is met here, and **code-common:CH2** puts it on the
implement-now side rather than the flex-point-only side because there is a
concrete use case, not a speculative one. Noting the tension rather than
pretending it did not exist.

**GVP.** **personal:P20**, **code-common:CH2** (deferral decision tree),
**personal:P8** / **personal:H7** (one entry point with a flag, not two
near-duplicate commands).

---

## 10. Three exit codes, with failures distinct from usage errors

**Chosen.** `0` all counted, `1` report produced but something in it failed,
`2` no report (bad arguments or unreadable directory). The report goes to
stdout; anything that is not a report goes to stderr.

**Why.** A caller in a pipeline needs to distinguish "the report is on stdout
and some of it is bad" from "there is no report". Collapsing both into `1`
would make `tally dir | jq` indistinguishable from `tally /nonexistent | jq`.
Keeping usage errors off stdout means a `--format json` consumer never has to
parse around a help message.

**GVP.** **personal:P20** (machine-consumable signals) and
**code-common:CP12** (know what state you are in). The codes are named
constants per **code-common:CP9**.

---

## 11. Files are read sequentially, whole, into memory

**Chosen.** A `for` loop awaiting one file at a time; `readFile` rather than a
stream.

**Why.** Two separate calls. *Sequential*: `Promise.all` over a directory with
tens of thousands of files exhausts file descriptors (`EMFILE`), and the
latency it saves is not something a user of a report tool perceives — so the
concurrent version trades a real failure mode for an imperceptible gain.
*Whole-file*: streaming would let the tool count a file larger than memory,
but there is no concrete use case for that here and it would turn a
straightforward reader into an incremental one.

**GVP.** Sequential reading is **code-common:CP12** (do not wander into a bad
state). Whole-file reading is **code-common:CH2** (speculative with no
concrete use case: defer entirely, with no flex point) and **personal:V1**.
Both limits are written down in the README rather than left to be discovered,
per **personal:V2**.

---

## 12. `run()` takes its arguments and streams as parameters

**Chosen.** `run(argv, {stdout, stderr}) => Promise<number>`. `index.ts` is
the only file that touches `process`.

**Why.** It makes the whole CLI — argument parsing, output text, exit code —
testable in-process without spawning or monkey-patching globals, and it keeps
every input to the function visible in its signature.

**GVP.** **code-common:CP3** (explicit over implicit; no hidden global state)
and **code-common:CP13** (testability as a design constraint).

---

## 13. Tests at three levels, with the documented command exercised for real

**Chosen.** Unit tests for the reader and the formatter, integration tests for
`tallyDirectory` against real temp directories, and end-to-end tests that
actually spawn `npx tsx src/index.ts` and assert on stdout and the exit code.
44 tests; `npm run check` runs typecheck and tests together.

**Why.** The unit tests pin behaviour that is awkward to reach from outside
(bare CR, BOM, `""` escaping). The end-to-end tests exist because a green unit
suite does not prove the shipped command works — module resolution, the
shebang, `process.exitCode`, and the `tsx` loader are all only exercised by
running it the way the README tells a user to run it. The e2e test asserts on
`examples/`, so the README's sample output is verified rather than asserted.

**GVP.** **code-testing:TP1** (unit *and* end-to-end; code without tests is
unverified, not done) and **personal:P13** (verify in the production runtime,
not just the test harness). **personal:R1** (verify before claiming
correctness) is why `npm run check` is a single command.

---

## 14. Fixtures are built at runtime; `examples/` is curated

**Chosen.** Tests create temp directories via `mkdtemp` and delete them after.
The committed `examples/` directory holds three readable files, one of which
is deliberately broken, plus a `notes.txt` to show non-CSV files being left
alone.

**Why.** Committing a pile of malformed CSV files would leave artifacts in the
tree that a later reader — human or agent — could mistake for intended
examples. The one deliberately broken file that *is* committed is there
because the README demonstrates a failure line, and it is named `broken.csv`
so its purpose is unmistakable.

**GVP.** **ai-common:C2** / **ai-common:P2** (agents reproduce patterns from
the working tree; curate it for legibility).

---

## 15. Strict TypeScript, with the strictness enforced not just configured

**Chosen.** `strict`, plus `noUncheckedIndexedAccess`,
`exactOptionalPropertyTypes`, `noUnusedLocals`, and `verbatimModuleSyntax`.
`npm run typecheck` is part of `npm run check`.

**Why.** `noUncheckedIndexedAccess` in particular is load-bearing for a
character-by-character parser: it forced every `source[index]` access to be
handled as possibly-undefined, which is exactly the end-of-input case. The
discriminated union `TalliedFile | FailedFile` means the formatter cannot read
`dataRows` off a failed entry — the ok/failed distinction is checked by the
compiler rather than by convention.

**GVP.** **code-common:CP7** (strict typing, TypeScript over JavaScript) and
**code-common:CP10** (encode the rule as a check rather than a documented
convention).

---

## 16. Named constants, including for the things that look obvious

**Chosen.** `QUOTE`, `FIELD_SEPARATOR`, `CARRIAGE_RETURN`, `LINE_FEED`,
`BYTE_ORDER_MARK`, `CSV_EXTENSION`, `JSON_INDENT_SPACES`, and the three exit
codes.

**Why.** **code-common:CP9** allows skipping values that will never change and
are well known. `','` and `'"'` arguably qualify — but naming them is what
makes a delimiter change a one-line edit instead of a careful audit of every
`','` in the file, and in a parser the literals are dense enough that the
named form reads better.

**GVP.** **code-common:CP9** (named constants for everything configurable),
applied slightly more broadly than its own escape clause requires.

---

## 17. No configuration file, no plugin seam, no `--recursive`

**Chosen.** Flags only. No config file, no delimiter option, no recursion, no
glob pattern.

**Why.** **code-common:CP5** asks for configuration infrastructure early, and
this is a conscious partial departure: the configuration surface here is two
flags, and a file-based config layer for two flags would be infrastructure
with nothing to carry. The deferral tree is the tiebreaker — recursion,
alternative delimiters, and output filtering are all additive features with no
concrete use case stated in the requirements, so they are deferred entirely
rather than stubbed behind interfaces nobody calls.

What *is* preserved is the cheap part of the seam: `OUTPUT_FORMATS` is a
single array that the type, the validator, and the help text all derive from,
so adding a format is one entry plus one branch.

**GVP.** **code-common:CH2** (speculative with no concrete use case: defer
entirely with no flex points) overriding the early-configuration reading of
**code-common:CP5**; **code-common:CP11** (API surface is a commitment —
adding a flag later is additive and cheap, removing one is not).

---

## 18. Node's built-in test runner, not Vitest or Jest

**Chosen.** `node --import tsx --test`. Dev dependencies are `tsx`,
`typescript`, `@types/node` and nothing else.

**Why.** The suite needs `describe`/`it`, assertions, and async support, all
of which ship with Node 20+. A third-party runner would add a config file and
a dependency tree for features this suite does not use.

**GVP.** **code-common:CH1** again (the useful portion of the alternative is
small) and **personal:V1**. **code-testing:TP3** is satisfied either way —
both let an agent fully exercise the implementation — so it came down to
dependency weight.

---

## Where the library did not decide

Three choices came down to judgement, and the library narrowed them without
settling them. They are the ones to look at if the output is not what was
wanted:

1. **Case-insensitive extension matching** (§8) — the opposite choice is
   equally defensible.
2. **Empty file as a failure** (§4) — "0 rows, 0 columns" is a coherent
   alternative reading of requirement 3.
3. **A JSON format at all** (§9) — V1 and P20 genuinely pull against each
   other here; P20's "where easy" clause broke the tie.

Per **personal:H5**, none of these was worth blocking on: each has a single
reasonable reading given the library, so it was recorded and the work
continued. If any of them should come out differently as a standing rule
rather than a one-off, the change belongs in the library (**personal:P9**) —
the candidates would be a guiding element on how literally to read a
specification's glob-like notation, and one on when a machine-readable output
format is owed by default.
