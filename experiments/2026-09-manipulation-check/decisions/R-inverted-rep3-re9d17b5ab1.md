# Design decisions

One section per choice. Each says what was chosen, why, and which GVP element
(if any) informed it. Library consulted via
`cairn --library ./.gvp/library query --format compact` and `inspect <id>`.

---

## 1. Module split: frontmatter / note / discover / report / render / cli / index

**Chosen.** Seven small modules, each owning one concern: `frontmatter.ts`
(delimiters and YAML), `note.ts` (one file → one row), `discover.ts` (finding
files), `report.ts` (orchestration and the tag filter), `render.ts`
(presentation), `cli.ts` (arguments, streams, exit codes), `index.ts` (the only
code that touches `process`).

**Why.** The likely changes to this tool are all localized — a different word
counter, an extra column, another output format — and this split means each lands
in one file rather than being threaded through a single script. `render.ts` is
where "how it looks" lives and `note.ts` is where "what the data is" lives, so
neither leaks into the other.

**GVP.** `code-common:CP1` (one contiguous block — "if success depends on finding
all related pieces scattered across the codebase, that is a structural failure";
the test it poses, "will this force future features to be scattered?", is what
drove the boundaries) and `personal:P3` (separate what from how at every layer —
its rewrite test: the frontmatter convention and the row semantics survive a
rewrite, the ASCII padding does not).

---

## 2. `run()` returns an exit code and takes streams as parameters

**Chosen.** `run(argv, {out, err}): Promise<number>` in `cli.ts`. `index.ts` is
five lines that wire it to `process.argv` and `process.stdout`/`stderr` and set
`process.exitCode`.

**Why.** It makes the entire command line — argument errors, exit codes, both
output modes — testable in-process with no subprocess and no stream-capture
harness. Testability drove the signature rather than being bolted on after.

**GVP.** `code-common:CP13` (testability is a design constraint — "if a component
is hard to test, spend more design effort making it testable") and
`code-common:CP3` (explicit over implicit — "no hidden state or global magic";
the stream dependency is in the signature, not reached for globally).

---

## 3. Adopt the `yaml` package; write the frontmatter splitter and the table by hand

**Chosen.** One runtime dependency: `yaml`. The frontmatter delimiter scan, the
argument parsing (`node:util` `parseArgs`), the table layout, and the test runner
(`node:test`) are all first-party or standard library.

**Why.** A correct YAML 1.2 parser is far past the point where writing it is
reasonable, and the fraction used is large — the whole scalar/collection model,
plus the error positions the report depends on. The other three are tens of lines
each and adopting a package for them would buy nothing.

**GVP.** `code-common:CH1` (dependency adoption threshold — "if the useful portion
of an external library is approximately 200 lines or fewer, write it yourself",
evaluated against "what fraction of the library do you actually use?"). Applied
in both directions: it justifies taking `yaml` and refuses a table or arg-parsing
dependency.

---

## 4. `parseDocument` rather than `parse`, with `logLevel: 'silent'`

**Chosen.** Parse frontmatter with `parseDocument(text, {logLevel: 'silent'})`,
then read `document.errors` and `document.warnings` as values and turn them into
this tool's own per-file problems.

**Why.** `parse()` throws on errors and writes warnings (a duplicate key, for
instance) straight to the console. Both are wrong here: a throw would need
catching per-file anyway, and a library writing to a stream `noteview` is trying
to keep clean means output it does not control. Collecting them as values puts
every diagnostic through one path.

**GVP.** `code-common:CP12` (be aware of state; don't wander into bad states —
"prefer explicit handling with clear messages over blanket strategies") and
`personal:R2` (no silent failures — a warning the tool cannot see is a warning it
cannot report).

---

## 5. Malformed files get a row with documented fallbacks, not a skip and not a halt

**Chosen.** A file with unusable frontmatter is still a row: title falls back to
the filename, tags to empty, and the word count is taken from whatever lies
outside the frontmatter block. The problem is recorded on the note.

**Why.** Requirement 6 forbids skipping silently and forbids stopping the run.
Emitting the row keeps the report complete — the file exists and its body has a
length, and both facts are still true when the frontmatter is broken. The README
states each fallback so a `broken.md` title is readable as a fallback rather than
mistaken for real data.

**GVP.** `personal:R2` (no silent failures or data loss — "failures must be
surfaced, not swallowed") and `personal:V2` (transparency — "when corners are cut
or trade-offs made, document them explicitly").

---

## 6. Lossless coercions are quiet; lossy ones are reported

**Chosen.** One rule for every field: if the value can be represented without
losing anything, coerce and say nothing (`title: 2026` → `"2026"`, `tags: work` →
`["work"]`). If it cannot, refuse, fall back, and report (a mapping-valued
`title` → the filename; a mapping-valued `tags` → no tags; a non-scalar list
entry → dropped). The rule is documented in the README.

**Why.** The first draft reported every deviation including the harmless ones,
which would have made `noteview` exit non-zero on perfectly good notes. An exit
code that fires on a numeric title teaches people to ignore the exit code, at
which point the genuinely malformed file goes unnoticed too. Reserving the
diagnostic channel for actual data loss keeps it worth reading. One rule covering
every field also beats a list of per-field special cases.

**GVP.** `personal:P18` (gates must earn their friction — "a high-friction gate
invites bypass, and a bypassed gate is worse than none: it teaches people to
route around enforcement") is the element that changed this decision;
`personal:P4` (generic solutions over special-case handling — "special-case fixes
accumulate") for making it one rule; `personal:V5` (data preservation) for
coercing a scalar `tags` instead of discarding it.

---

## 7. Three exit codes: 0 clean, 1 usage, 2 completed-with-problems

**Chosen.** Named constants in `cli.ts`. `0` clean, `1` bad invocation or an
unusable `<dir>`, `2` the run finished but at least one path was reported.

**Why.** "Reported, not skipped silently" has to mean something to a script, not
just to a human reading a terminal. Without a distinct code, a caller cannot tell
a clean scan from one with four broken files, and the two are genuinely different
states. Separating `1` from `2` matters because they call for different responses:
fix the command versus fix the notes.

**GVP.** `personal:P20` (prefer machine-consumable forms where easy — "a
machine-consumable form can drive automation; a human-only one cannot"),
`code-common:CP12` (always know what state you are in), and `code-common:CP9`
(named constants for everything configurable).

---

## 8. Diagnostics always go to stderr, and are never filtered by `--tag`

**Chosen.** Every problem is printed to stderr in both output modes, one line per
problem, prefixed `noteview:`. Note-level problems additionally ride inside each
record's `problems` array in `--json`. The diagnostic list is built from the
*unfiltered* note list, so a `--tag` filter cannot suppress a report.

**Why.** Two constraints meet here. `--json` stdout has to stay parseable, which
rules out mixing diagnostics into it. And a `--tag` filter selects a result set,
while a malformed file is a fact about the scan — letting the filter hide it would
reintroduce exactly the silent skip requirement 6 forbids.

**GVP.** `personal:R2` (no silent failures) for the filter-independence, and
`personal:P20` (machine-consumable forms) for keeping stdout clean.

---

## 9. Path-keyed problems for directory-level failures; `--json` stays an array

**Chosen.** Two problem shapes: a `string[]` on each `Note` for problems about
that note, and `{path, message}` for problems about a path that never became a
note (unreadable directory, dangling symlink, symlink cycle, unreadable file).
Both are flattened into the stderr report. Only the first appears in `--json`,
which stays an array of file records.

**Why.** Requirement 5 says `--json` emits the same data as the table as an
array, so an envelope object with a top-level `problems` key would break the
documented contract. Bending the note record to carry a directory failure would
be worse — a row with a path that is not a note. stderr already carries
everything, so nothing is lost; the README states the split.

**GVP.** `personal:V2` (transparency — the limitation is documented rather than
papered over) and `code-common:CP11` (API surface is a commitment — the JSON
shape is a file format, so it stays what the requirement pins it to).

---

## 10. Nothing is excluded from the walk, and no `--exclude` flag was added

**Chosen.** Every file ending in `.md` at any depth, including inside dot
directories and `node_modules`. The documented consequence: pointing `noteview`
at a repository root walks the whole thing.

**Why.** Requirement 1 says recursively find `.md` files. A built-in skip list
would mean the tool sometimes omits a matching file without saying so, which is
the same silent-omission problem as skipping a malformed file. The alternative —
an `--exclude` flag — is unrequested surface, and the directory you point at is
already a perfectly good filter. If a real need appears, `discoverMarkdownFiles`
takes the root as its only argument and can gain an options parameter without a
breaking change.

**GVP.** `personal:R2` (no silent discard), `personal:V1` (simplicity — "every
abstraction, indirection, or generalization should solve a real problem, not a
hypothetical one"), `code-common:CP11` (API surface is a commitment — "adding is
easy; removing is expensive"), and `code-common:CH2` (deferral decision tree —
speculative with no concrete use case, so deferred entirely).

---

## 11. Follow directory symlinks, with a realpath cycle guard

**Chosen.** Directory symlinks are followed. Each directory's realpath is
recorded before descending; a repeat visit is reported as a symlink cycle and not
descended into. A symlink whose target cannot be stat'd is reported.

**Why.** Note directories legitimately contain symlinks, and refusing to follow
them would silently omit real notes. Following them naively hangs on a cycle. The
guard is about five lines and turns an infinite loop into a reported problem —
which is the difference between knowing what state you are in and wandering into
a bad one.

**GVP.** `code-common:CP12` (never wander into an unexpected bad state; "for each
failure ask — what is the consequence, does the user need to know, can we
recover, should we stop") and `personal:R2` (no silent omission).

---

## 12. Plain ASCII table, padded to content, never truncated

**Chosen.** Space-padded columns sized to the widest cell, a dashed separator
row, the word count right-aligned, no color, no box-drawing characters, no
truncation, no trailing whitespace. Control characters inside a title or tag are
escaped (`\n`, `\t`) so one note is always exactly one line.

**Why.** The output is a report meant to be read, piped to `grep`, and diffed. A
fixed-width ASCII table does all three in any terminal and needs no width
detection. Truncation was rejected because it hides data the user asked to see;
wrapping in a narrow terminal is the lesser cost, and it is documented. Escaping
control characters preserves the row-per-note contract that makes the output
greppable at all.

**GVP.** `code-common:CP2` (clarity over cleverness), `personal:V1` (simplicity),
`personal:V5` (data preservation — nothing in a row is hidden), and
`personal:P20` (machine-consumable — one note per line is what makes it
grep-able).

---

## 13. Multi-line parser messages are collapsed to one line on stderr

**Chosen.** `renderProblems` collapses whitespace runs in a message, so the
`yaml` package's embedded snippet-and-caret becomes part of a single line. The
raw multi-line text is kept in `--json`.

**Why.** Found by running the tool on a real malformed fixture rather than by
reasoning about it: the parser's message is four lines, which broke the
one-problem-per-line contract that makes stderr greppable. The useful part — "at
line 2, column 18" — survives the collapse. The collapse lives in `render.ts`
because it is a presentation concern, which is why the JSON consumer still gets
the full text.

**GVP.** `personal:P2` (empirical validation before commitment — "protocols are
tested by running them, not by reasoning about them") is how this was caught;
`personal:P3` (separate what from how) put the fix in the renderer.

---

## 14. Sort by code unit, not by locale

**Chosen.** `left < right` on the `/`-separated relative path, not
`localeCompare`.

**Why.** `localeCompare` makes the output depend on the environment's locale, so
the same directory could produce differently-ordered reports on two machines and
a diff of two runs would be meaningless. Byte-identical output for identical
input is worth more here than locale-aware collation.

**GVP.** `personal:P20` (prefer machine-consumable forms) and
`code-common:CP3` (explicit over implicit — no hidden dependency on ambient
environment state).

---

## 15. Word count is whitespace tokens, documented as such

**Chosen.** `countWords` counts runs of non-whitespace characters in the body.
Markdown punctuation is not stripped, so `# Heading` is two words. Stated
plainly in the README, isolated in one exported function.

**Why.** The requirement says "word count" without defining it, and every
refinement — strip syntax, ignore code blocks, ignore link targets — is a
judgment call that would need its own documentation and tests. The simple
definition is predictable and honest about what it is; the README says it will
differ from an editor's count rather than implying otherwise. Keeping it one
function makes it the single place to change if a prose count is ever wanted.

**GVP.** `personal:V1` (simplicity — the simplest approach that meets the
requirement), `personal:V2` (transparency about limitations), and
`personal:P1` (design around flex points — "shape the architecture so the change
is not painful when it arrives — but do not implement the change early").

---

## 16. Refuse ambiguous invocations instead of guessing

**Chosen.** Two positional arguments is an error, not "use the first". An unknown
option is an error. `--tag ''` is an error. Each prints a message and the usage
block to stderr and exits `1`.

**Why.** Every one of these has a plausible intent behind it and no way to know
which — a shell glob that expanded, a typo'd flag, an unset variable. Picking one
interpretation would produce a confident, wrong report. The usage block is
printed alongside so the fix is visible where the error is, rather than requiring
a second `--help` run.

**GVP.** `code-common:CP12` (always know what state you are in) and
`ai-common:P3` (deliver context at the point of use — the same reasoning applies
to a human reading an error: the usage text is worth more attached to the failure
than a command away).

---

## 17. Tests: unit, in-process CLI, and one spawned end-to-end

**Chosen.** 65 tests across six files. Unit tests for `frontmatter`, `note`,
`discover`, and `render`; in-process tests driving `run()` for every flag
combination, exit code, and error path; and one spawned test that actually runs
`npx tsx src/index.ts` — the invocation the README documents — as a real process.
Fixtures are built by the test that reads them, inside `tests/.tmp`.

**Why.** The unit and in-process tests cover behavior cheaply. The spawned test
covers what they cannot: that the documented command starts at all, resolves its
`.ts` imports under `tsx`, and returns the exit code to a shell. That is a real
failure mode a green in-process suite would not catch. Fixtures are built rather
than committed so no test depends on a tree it did not create.

**GVP.** `code-testing:TP1` (tests for all code, unit and end-to-end — "unit
tests pin behavior of individual pieces; e2e tests prove the assembled system
does what the user actually needs"), `personal:P13` (verify in the production
runtime, not just the test harness — "green tests are not proof of working
software... a test runner can mask runtime and interop bugs", naming ESM/CJS
resolution specifically, which is exactly the risk of a `tsx`-loaded entry
point), and `personal:R1` (verify before claiming correctness — typecheck and
tests both run clean).

---

## 18. TypeScript: `strict` on, annotations only where they carry information

**Chosen.** `strict` plus `noUncheckedIndexedAccess` in `tsconfig.json`. Data
shapes are plain `type` aliases over plain objects — no classes, no runtime
schema validator. Annotations appear on exported signatures and are omitted where
inference already says it.

**Why.** The strict flags are the cheap part and catch real mistakes; the array
indexing rule in particular forced the explicit handling of short rows in the
table renderer. A runtime validator was considered and rejected: the only
untrusted input is the frontmatter, and `note.ts` already inspects it value by
value with fallbacks, so a schema layer would duplicate that logic while adding a
dependency.

**GVP.** `code-common:CP7` (inferred typing — "omit annotations the compiler
already knows, prefer plain objects over model classes for internal shapes, and
reach for a checker only where a boundary genuinely needs one") and
`code-common:CH1` (dependency adoption threshold) for declining the validator.

---

## 19. `--help` added; `--version` not

**Chosen.** `-h`/`--help` prints the usage block and exits `0`. No `--version`.

**Why.** `--help` is the one flag a user will try before reading anything, and it
costs nothing. `--version` would mean reading `package.json` at runtime to report
a number that is meaningless for a tool run from source, so it is surface with no
consumer.

**GVP.** `code-common:CP11` (API surface is a commitment — check whether a new
surface has a consumer before introducing it) and `personal:P8` (consolidated
interfaces over many near-duplicate entry points — one command with flags).

---

## 20. `examples/notes/` committed as a fixture for the README

**Chosen.** A four-file example directory, one of which is deliberately
malformed. Every command and every block of output in the README was produced by
running it against that directory.

**Why.** It makes the documented output verifiable rather than asserted — a
reader can run the command and get the same bytes, including the malformed-file
diagnostic, which is the behavior hardest to describe in prose. It is also the
fixture used to catch the multi-line message problem in decision 13.

**GVP.** `personal:V2` (transparency) and `personal:P2` (empirical validation
before commitment — "data, not vibes"); `code-testing:TP3` (agents must be able
to fully exercise the implementation) for having a real tree to run against.

---

## Nothing was blocked

Every choice above followed from the library without a genuine ambiguity, so no
guiding-element patch is proposed. Per `personal:H5` (disambiguate-then-surface
gate), a blocker would be a decision that cannot be unambiguously derived from
the library; the one decision that came close — whether to report harmless type
coercions (decision 6) — was resolved by `personal:P18`, which speaks directly to
what a non-zero exit code costs when it fires too often.
