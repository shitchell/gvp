# Design decisions

One section per choice: what was chosen, why, and which element of the
project's GVP library informed it (ids as given by
`cairn --library ./.gvp/library inspect <id>`).

Per `personal:H5`, a decision that follows unambiguously from the library was
recorded and acted on rather than raised as a question. Nothing below needed a
guiding-element patch; the places where `TASK.md` was genuinely open to more
than one reading are called out in the sections they affected, with the element
that settled them.

---

## 1. The CSV reading is written here, not taken from a library

**Chosen.** `src/csv.ts` is a hand-written character state machine. The project
has no runtime dependencies at all; `tsx`, `typescript` and `@types/node` are
development-only.

**Why.** The part of a CSV library this tool would use is the record/field
scanner — about 200 lines of the real work, and `src/csv.ts` is that size.
Everything else such a library offers (value materialisation, typed columns,
transforms, stringification) is surface this tool never touches, and the one
behaviour that matters most here — exactly what is a failure and what is
leniency — would be inherited from someone else's option defaults rather than
chosen. Writing it also means the counter can be fed in chunks and never
materialise a row, which is what section 2 depends on.

**GVP.** `code-common:CH1` (dependency adoption threshold: if the useful
portion is ~200 lines or fewer, write it yourself) is directly on point.
Supported by `personal:V1` (simplicity — fewer assumptions to understand).

## 2. It counts rather than parses, and streams rather than loads

**Chosen.** `CsvCounter` keeps tallies, never field values. Files are read as a
stream and decoded in chunks, so neither a row nor a file is ever held in
memory. `write()` accepts chunks split at any point, including mid-record and
mid-quoted-field.

**Why.** The tool's entire output is counts, so holding values would be work
done to be thrown away. More importantly, `readFileSync` plus a split would put
a ceiling on file size — a single JavaScript string tops out around 512 MB —
and large files are the normal case for CSV, not a speculative one. That makes
this a correctness and stability question rather than a performance
optimisation, which is the branch of the deferral tree that says build it now.
The cost is small: chunk-feeding a state machine is barely more code than
walking a whole string.

**Verified, not assumed:** a 170 MB, 2,000,000-row file counts correctly under
`--max-old-space-size=64`, and a test asserts counts are identical across chunk
sizes 1, 2, 3, 5, 7 and 13.

**GVP.** `code-common:CH2` (deferral decision tree — "needed for stability or
correctness: implement now"). `personal:P2` and `personal:R1` required the
memory claim to be tested with real data rather than reasoned about.

## 3. Decoding is strict: a file that is not valid UTF-8 fails

**Chosen.** `TextDecoder` with `fatal: true`. Invalid or truncated byte
sequences make the file a reported failure.

**Why.** The lenient alternative substitutes U+FFFD and produces a count — a
confident, possibly wrong answer about a file we could not actually read. A
wrong number is worse than a reported failure, because the user cannot tell it
happened.

**GVP.** `personal:R2` (no silent failures — failures must be surfaced, not
swallowed) and `code-common:CP12` (never wander into an unexpected bad state;
ask whether the user needs to know). `personal:V2` on being honest about
limitations.

## 4. Four modules: counting, scanning, formatting, process

**Chosen.** `src/csv.ts` (CSV text → counts), `src/tally.ts` (directory →
tallies, returning data and printing nothing), `src/report.ts` (tallies →
lines), `src/index.ts` (arguments, streams, exit codes). Only `index.ts` knows
it is in a process; only `report.ts` knows what the output looks like.

**Why.** These are four boundaries that are already clean, not speculative
ones: each is the natural seam between a "what" and a "how", and each piece is
testable without the others — the counter needs no filesystem, the tally needs
no stdout, the formatter needs no files. A change to any one of them stays
inside one file.

**GVP.** `personal:P3` (separate what from how at every layer) and
`code-common:CP13` (testability is a design input). `code-common:CP1` (one
contiguous block) is the test applied to each: adding an output format touches
`report.ts` alone, changing failure classification touches `tally.ts` alone.
`personal:H1` (extract when the boundary is clean and natural) is why there are
four modules and not one, and also why there are not more.

## 5. Leniency where the answer is knowable; failure only where it is not

**Chosen.** A deliberate line through "cannot be read as CSV": deviations that
still leave the field and record boundaries determinable are counted (a `"`
mid-field, text after a closing quote, a lone `\r`, a ragged row). The failures
are the cases with no answer to give — an unterminated quoted field, no header
row, undecodable bytes, an unreadable file.

**Why.** `TASK.md` requires a failure path (5) and lenient row counting (6, 7)
without saying where the boundary between them sits. One principled line serves
both: fail exactly when the state of the file is unknown, never because it is
merely untidy. Each case is then decided by the same rule instead of by its own
special-case judgement, and the README states the rule and every case it
produces.

**GVP.** `code-common:CP12` (the rule is "always know what state you are in",
not fail-fast or graceful-degradation as dogma) gave the criterion.
`personal:P4` (generic solutions over special-case handling) is why it is one
rule rather than four opinions. `personal:V2` is why the resulting behaviour is
documented in full rather than left to be discovered.

## 6. An empty file fails as "no header row"

**Chosen.** A file with no bytes (or only a byte order mark) is a failure, not
a file with zero rows and zero columns.

**Why.** Requirement 3 asks for "how many columns its header declares", and a
file with no header declares nothing. Reporting `0 cols` would invent a header
that does not exist and make an empty file indistinguishable from a real
one-column file; a failure says what is true. Note the distinction from
`empty-data.csv` in the fixtures, which has a header and no data rows — that is
a success with 0 rows.

**GVP.** `code-common:CP12` and `personal:R2`: the state is "no header", so say
so rather than emitting a fabricated count. `personal:V2` on not presenting a
clean facade.

## 7. A blank line counts as a data row

**Chosen.** A blank line is a record holding a single empty field, so it is
counted. Skipping blank lines was rejected.

**Why.** Requirement 6 already establishes the principle that a row with an
unexpected field count is still a row; a blank line is exactly that case with
one field. Skipping it would be a special case, and it would silently drop a
line that exists in the file. It also matches the default of `csv-parse`
(`skip_empty_lines: false`) and Python's `csv` module, both of which yield a
record for a blank line. A single trailing newline does not create a blank
line, so the common case is unaffected; this is documented because the
less-common case (a file ending in two newlines) is visible in the count.

**GVP.** `personal:P4` (generic over special-case) and `personal:V5` /
`personal:R2` (do not silently discard data). Documented per `personal:V2`.

## 8. Failures carry a machine-readable `kind` alongside the message

**Chosen.** `TallyFailure = { kind, message }`, with `kind` a typed union
(`'unterminated-quote' | 'no-header-row' | 'undecodable' | 'unreadable'`) and
`message` the human sentence. `FileTally` is a discriminated union on `status`,
so a successful tally has no `failure` field and a failed one has no counts.

**Why.** The `kind` costs one field and makes failures classifiable by a
program rather than only by reading prose — worth having even though nothing
consumes it yet. The discriminated union makes the two shapes impossible to
confuse: there is no reachable state with a row count and a failure, and the
compiler enforces that rather than a convention.

**GVP.** `personal:P19` (low-effort, high-information signals, "even when it is
not certain they will be immediately useful") and `personal:P20` (prefer
machine-consumable forms where easy). `code-common:CP3` (explicit over
implicit; no stringly-typed state) and `code-common:CP7` (strict typing).

## 9. Three exit codes: 0, 1, 2

**Chosen.** `0` all files reported successfully, `1` report produced but a file
failed, `2` the run could not start. Named constants, listed in `--help` and
the README.

**Why.** The exit code is the one signal a caller can act on without parsing
output, and the interesting distinction is between "the report is complete but
mentions failures" and "there is no report". Collapsing those into one non-zero
code would lose the only piece of information a script actually needs.

**GVP.** `personal:P19` and `personal:P20` (cheapest machine-consumable
signal available). `code-common:CP9` (named constants for everything
configurable) is why they are named rather than inline literals.

## 10. Per-file failures go to stdout; run failures go to stderr

**Chosen.** Failure lines for individual files are part of the report on
stdout, in filename order. Usage errors and an unreadable `<dir>` go to stderr.

**Why.** Requirement 4 guarantees filename order, and splitting failure lines
onto stderr would break it — two streams interleave unpredictably, so a
redirected stdout would silently have holes in it where the failures were.
Problems with the run itself are not report records at all, and keeping them off
stdout means `tally dir > out.txt` always yields exactly the report.

**GVP.** `personal:R2` (a failure the user cannot see in its place is a
swallowed failure) and `code-common:CP12`.

## 11. No output-format flag — but formatting is a seam

**Chosen.** No `--format json`. `formatReport()` returns an array of lines
rather than printing, so an alternative renderer is a local addition to
`report.ts` with no change to the tally.

**Why.** There is a real pull toward a JSON mode (`personal:P20`,
`personal:P21`), but no concrete consumer asked for one, and a CLI flag is a
commitment that is cheap to add and expensive to remove. The deferral tree
resolves this explicitly: no concrete use case means no feature — and where it
meets the preference for many early flex points, the tree governs. What it does
leave in place is the seam, which costs nothing: returning lines instead of
printing is also what makes the formatter testable without capturing stdout.

**GVP.** `code-common:CH2` (deferral decision tree, including its explicit
override of `personal:P21`) and `code-common:CP11` (API surface is a
commitment; prefer additive later over breaking later). `personal:P1` (shape
the architecture so the change is not painful, but do not implement it early).

## 12. One `<dir>` argument and `--help`, nothing else

**Chosen.** Exactly one positional directory. `-h`/`--help`. `node:util`'s
`parseArgs` in `strict` mode, so an unknown flag is an error and two
directories are an error.

**Why.** The task describes one job, and the smallest interface that does it is
one argument. `--help` earns its place because it is where a user looks first
and it costs one branch. Strict parsing matters more than it looks: without it,
`tally --recursive dir` would silently ignore the flag and report a
non-recursive tally, which is a wrong answer dressed as a right one. `parseArgs`
is stdlib, so this needs no argument parser.

**GVP.** `personal:P8` and `personal:H7` (interface consolidation is bounded in
both directions — weigh by how often someone must consult help output).
`code-common:CP12` and `personal:R2` for refusing unknown flags rather than
ignoring them. `code-common:CH1` for using the standard library.

## 13. `.csv` is matched case-sensitively

**Chosen.** `name.endsWith('.csv')`. `DATA.CSV` is left alone. Documented in
the README.

**Why.** Requirement 1 says `*.csv`, which is what that glob means in a shell
on the platforms this runs on. Case-insensitive matching would be a quietly
wider rule than the one written down, and requirement 1 also says non-`*.csv`
files are left alone. If the rule should be wider, that is a decision to make
openly rather than one to smuggle in; the behaviour is documented so the
limitation is visible.

**GVP.** `personal:P9` (follow rules uniformly; change them explicitly through
a deliberate decision, not silently for a one-off). `personal:V2` for
documenting it.

## 14. Filename order means code-point order

**Chosen.** `names.sort()` — the default code-point comparison — not
`localeCompare`.

**Why.** "Filename order" has to mean the same thing on every machine, and
`localeCompare` does not: it would put `a.csv` before `B.csv` under one locale
and after it under another, making the report depend on the environment rather
than the directory. Code-point order is also what `ls` and shell globs give, so
it matches what the user sees elsewhere.

**GVP.** `code-common:CP3` (no hidden dependency on ambient state — a locale
read from the environment is exactly that) and `personal:V2`. A test pins the
ordering so a future change to it has to be deliberate (`code-common:CP10`).

## 15. Symlinks are followed; broken ones are reported, not dropped

**Chosen.** A `*.csv` symlink to a file is counted through the link; one to a
directory is skipped like any directory; one that cannot be resolved stays in
the report and fails with its errno. A directory named `*.csv` is not a record.

**Why.** A symlink to a CSV file is, from the user's point of view, a CSV file
in that directory. The case that matters is the broken one: the alternative —
dropping an entry whose `stat` failed — would make a file the user can see in
`ls` disappear from the report with no explanation. Letting the open attempt
fail puts it in the report with the reason.

**GVP.** `personal:R2` (surface failures; do not swallow them). The directory
exclusion follows requirement 1's wording, which is about files.

## 16. A directory that cannot be listed stops the run

**Chosen.** Requirement 5's "must not stop the run" is applied to files. If
`<dir>` itself cannot be read, `tally` reports to stderr and exits 2 with no
report.

**Why.** The two cases differ in whether a partial report exists to salvage.
One unreadable file among ten leaves nine real records, so continuing is right.
An unlistable directory leaves nothing, and printing `0 files reported, 0
failed` would be indistinguishable from a genuinely empty directory — the one
output that must stay unambiguous for requirement 9.

**GVP.** `code-common:CP12` (for each failure ask what the consequence is,
whether the user needs to know, whether we can recover, whether we should
stop). `personal:R2`.

## 17. Output is an aligned table with no header and no separator line

**Chosen.** Name padded to the widest name, counts right-aligned, two spaces
between columns. No column-header line, no blank line or rule before the
summary. Singular/plural only in the summary's prose (`1 file reported`); the
table's `rows`/`cols` labels are fixed.

**Why.** Requirement 9 is the constraint that settles it: an empty directory
must produce *only* the summary line, so any decoration that is emitted
unconditionally is ruled out, and decoration emitted conditionally would make
the output shape depend on the input. Requirement 4's "one line per file" rules
out a header line, which is not a file. Alignment is why all tallies are
collected before the first line is written — a deliberate trade of streaming
output for a readable table, and a safe one, since tallies are small however
large the files are.

**GVP.** `personal:V1` (the simplest thing that meets the requirement).

## 18. "Reported" in the summary counts failures too

**Chosen.** `4 files reported, 1 failed` for four files of which one failed —
`reported` is the total number of lines above it, not the number of successes.

**Why.** Requirement 8 is open to both readings, but requirement 5 says a
failing file "is reported as a failure for that file" — so a failure is a
report, and the failed count is a subset of the reported count. That reading
also makes the two numbers independently checkable against the lines above:
`reported` is the line count, `failed` is how many of them say `failed`.

**GVP.** `personal:V2` (the ambiguity is resolved in the README and here rather
than silently). `personal:P20`: under this reading both numbers are derivable
from the report, so a reader can verify them.

## 19. Tests: `node:test`, unit plus end-to-end, fixtures inside the repo

**Chosen.** 53 tests in `test/` on the standard `node:test` runner. Unit tests
for the counter (including chunk-boundary equivalence), the directory scan and
the formatter; end-to-end tests that spawn the real command and assert stdout,
stderr and exit code. Committed fixtures in `test/fixtures/sample` for cases a
file can express; scratch directories under `test/.tmp/` for the ones it cannot
(an empty directory, invalid UTF-8 bytes, a broken symlink, a directory named
`*.csv`).

**Why.** Unit tests pin the behaviour this tool's correctness rests on — every
leniency and failure in section 5 has a test naming it, so changing one is a
visible change rather than a drift. The end-to-end tests are what prove the
assembled program works: they catch the things in-process tests cannot, such as
an exit code or a stream assignment being wrong. `node:test` needs no
dependency. Scratch directories are created under the project, never in the
system temp directory, so a test run cannot touch anything outside the repo.

**GVP.** `code-testing:TP1` (unit *and* end-to-end; code shipped without tests
is unverified, not done), `code-testing:TP2` (the test is the executable
definition of success), `personal:P13` (verify in the production runtime, not
just the test harness — hence spawning the real CLI), `code-common:CH1` (stdlib
runner).

## 20. Strict TypeScript, checked by a command

**Chosen.** `strict` plus `noUncheckedIndexedAccess`,
`exactOptionalPropertyTypes`, `noFallthroughCasesInSwitch`, `noUnusedLocals`
and `verbatimModuleSyntax`. Every function has an explicit signature and
exported data shapes are named types. `npm run check` runs typecheck and tests
together.

**Why.** The extra flags are the ones that catch the mistakes this code could
actually make: index access that might be `undefined` (the argument list, the
first tally) and a missing `break` in the state machine's switch. `npm run
check` exists so the right thing is one command rather than two remembered
ones.

**GVP.** `code-common:CP7` (strict typing, TypeScript over JavaScript) and
`code-common:CP10` (prefer validators and checks over convention — a convention
is a suggestion). `personal:R1` (typecheck must pass, tests must pass, before
claiming correctness). `personal:C2` is the reason `check` is a single command:
anything relying on discipline erodes.

## 21. The byte order mark is stripped in one place

**Chosen.** The counter skips a leading U+FEFF, and the file reader sets
`ignoreBOM: true` so the decoder does not also strip one.

**Why.** Both layers can strip a BOM, and having both do it would mean two
behaviours to keep in step and a counter that behaves differently on a string
than on a file. Doing it in the counter is the choice that makes the counter
correct on its own, for any caller. It matters because a BOM left in place
would push the first `"` off the start of the field and change the header's
field count — so a CSV saved by Excel would get a wrong column count, not an
error.

**GVP.** `code-common:CP4` (centralize shared logic — one function, not two
code paths). `code-common:CP6` (the counter is written to be usable by other
callers).

## 22. Comments explain why; names are long where that helps

**Chosen.** Each module opens with what it is for and what it deliberately does
not do. Inline comments explain reasoning (why `pendingCarriageReturn` is held
back), not mechanics. Names like `listCsvFileNames`, `pendingCarriageReturn`
and `atFieldStart` are spelled out.

**Why.** The state machine is the one part of this tool that is not obvious on
sight, so that is where the reasoning is written down. `quote-in-quoted` in
particular is a state that looks redundant until you see why the lookahead is
needed, and the comment says so.

**GVP.** `code-common:CP2` (clarity over cleverness; descriptive names even if
long; comments explain "why", not "what") and `ai-common:C2` (the working tree
is read and reproduced by agents, so it is curated for legibility).
