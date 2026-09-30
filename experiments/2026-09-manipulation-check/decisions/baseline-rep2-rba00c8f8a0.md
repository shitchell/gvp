# Design decisions

One section per design choice made while building `noteview`. Each states what
was chosen, why, and which element of `.gvp/library` informed it (or that none
did).

Element ids are given in the library's `<doc>:<id>` form and can be read with
`cairn --library ./.gvp/library inspect <id>`.

---

## 1. TypeScript on Node, strict, with no `any`

**Chosen.** TypeScript, `tsconfig.json` with `strict` plus
`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noUnusedLocals`, and
`verbatimModuleSyntax`. Every exported function has an explicit parameter and
return type. `npm run typecheck` runs `tsc --noEmit` and is part of
`npm run check`.

**Why.** The language was pinned by `TASK.md`. The strictness beyond bare
`strict` was not: `noUncheckedIndexedAccess` in particular forced the code to
face the fact that `row[column]` and `argv[index]` may be missing, which is
exactly where an argument parser and a table renderer go wrong.

**Library.** `code-common:CP7` ("Strict typing … TypeScript over JavaScript.
Types add clarity and catch issues at compile/check time"). `personal:R1`
requires typecheck to pass before any claim of correctness, which is why the
typecheck is a script rather than something I ran once by hand.

---

## 2. One runtime dependency: `js-yaml`

**Chosen.** `js-yaml` is the only runtime dependency. The argument parser, the
table renderer and the test harness (`node:test`) are not dependencies —
`tsx` and `typescript` are dev-only.

**Why.** Applying the dependency threshold to each candidate:

- *YAML parsing* — **adopt.** Frontmatter is real YAML: block and flow lists,
  quoting, anchors, multiline scalars, typed scalars. A hand-rolled subset is
  far more than 200 lines and its failure mode is the bad one — silently
  misreading a user's note instead of erroring. `js-yaml` is heavily used, so
  bus factor is not a concern, and `load` in v4 constructs no arbitrary types.
- *Argument parsing* — **write it.** The surface is two flags, `--help` and one
  positional. The useful slice of `commander`/`yargs` here is ~50 lines, which
  is what `src/cli.ts` is.
- *Table rendering* — **write it.** Padding four columns to their widest cell is
  ~15 lines.
- *Test framework* — **write against the platform.** Node 22 ships `node:test`
  and `node:assert/strict`; `vitest` or `jest` would add a toolchain to get
  `describe`/`it` that already exist.

**Library.** `code-common:CH1` ("Dependency adoption threshold … If the useful
portion of an external library is approximately 200 lines or fewer, write it
yourself. Evaluate: what fraction of the library do you actually use? … What is
the bus factor of the maintainer?"). This element decided all four calls and is
the single most load-bearing one in this build. `personal:V1` backs the same
direction — "Fewer things to parse, fewer assumptions to understand, fewer
moving parts."

---

## 3. Split frontmatter by hand; parse its contents with `js-yaml`

**Chosen.** `src/frontmatter.ts` owns delimiter recognition — first line must be
`---`, block ends at the next `---`, BOM and CRLF tolerated — and hands only the
text between the delimiters to `js-yaml`. No `gray-matter` or similar.

**Why.** This is the other half of decision 2. A frontmatter library is mostly
the delimiter split plus a YAML dependency plus caching and stringifying we do
not need; the part we would actually use is the ~30 lines now in
`readFrontmatter`. Owning the split also means the delimiter rules are ours to
state precisely in the README rather than inherited undocumented.

**Library.** `code-common:CH1`, again on the "what fraction do you actually
use?" test.

---

## 4. A malformed file becomes a row carrying `problems`, never an exception or a skip

**Chosen.** `Note` has a `problems: readonly string[]` field. Every discovered
file produces exactly one `Note`. Invalid YAML, an unterminated block,
frontmatter that is not a mapping, a `title`/`tags` of an unusable type, and a
file that could not be read at all all flow into the same field. Nothing throws
past the per-file boundary.

**Why.** `TASK.md` requirement 6 asks for "reported, not skipped silently, and
must not stop the run", so the row must survive. Making `problems` a field on
the normal row type — rather than a parallel error list or an exception — means
every consumer (table, JSON, stderr, exit code) gets the information for free,
and it is structurally impossible for a code path to report a file while
forgetting its problems.

**Library.** `code-common:CP12` ("always know what state you are in, and never
wander into an unexpected bad state. For each failure ask — what is the
consequence, does the user need to know, can we recover, should we stop") and
`personal:R2` ("Failures must be surfaced, not swallowed"). A "malformed" row is
a known, named state rather than a silent gap in the output.

---

## 5. One error channel for the whole class of unreadable files, instead of a case per kind

**Chosen.** The directory walk does not inspect symlinks, permissions or file
types. It collects anything ending in `.md` and lets the subsequent `readFile`
fail; a failed read becomes `unreadableNote(path, reason)`. A broken symlink, a
permission error, and a file deleted mid-run are therefore all reported through
one mechanism with no code specific to any of them.

**Why.** The alternative — `lstat`/`stat` each entry and branch on the result —
is more code, races with the filesystem anyway, and grows a new branch for every
new failure kind. Letting the read be the arbiter of readability is both shorter
and more complete. It also happens to make the walk cycle-safe for free (see
decision 6).

**Library.** `personal:P4` ("Generic solutions over special-case handling …
prefer building a generic mechanism that handles the class of failures, not just
the instance. Special-case fixes accumulate; generic mechanisms compose"). The
symlink test in `test/collect.test.ts` exists to pin this claim.

---

## 6. Directory symlinks are not followed; unlistable subdirectories are reported and the walk continues

**Chosen.** `readdir(..., { withFileTypes: true })` reports a symlink as a
symlink, not a directory, so `entry.isDirectory()` is false for it and the walk
never descends through one. A `readdir` that fails on a *subdirectory* is
recorded in `scanProblems` and the walk continues. A `readdir` that fails on the
*root* throws and the caller exits 2.

**Why.** A notes directory containing a link to an ancestor would otherwise make
the tool loop forever — a bad state reached by default, with no user error. Not
following directory links removes the possibility instead of trying to detect
it. The root/subdirectory asymmetry is deliberate: the directory the user named
is part of the invocation, so failing it is a usage failure; anything discovered
underneath is data, so failing it is a finding.

**Library.** `code-common:CP12` for the state reasoning and for the split
between "should we stop" (root) and "can we recover" (subdirectory);
`personal:R2` for reporting the skipped subdirectory rather than quietly
returning a short report.

---

## 7. Three exit codes, with `1` meaning "report complete, something needs attention"

**Chosen.** `0` clean, `1` report produced but at least one file or directory had
problems, `2` could not run (bad usage, or `<dir>` unreadable). Exit `1` still
prints the entire report.

**Why.** Requirement 6 says problems must be reported and must not stop the run;
those two together are exactly "full output, non-zero status". Collapsing
problems into exit `0` would make the report look clean to any script; treating
them as exit `2` would imply the output is unusable. Separating usage failure
from data problems lets a caller distinguish "I invoked it wrong" from "my notes
have issues" without parsing stderr.

**Library.** `personal:P20` ("Prefer machine-consumable forms where easy … A
machine-consumable form can drive automation; a human-only one cannot") — the
exit code is the cheapest machine-readable signal available.
`code-common:CP12` for making each outcome a named, distinguishable state
(`EXIT_OK` / `EXIT_PROBLEMS` / `EXIT_USAGE` in `src/index.ts`).

---

## 8. Report data on stdout, diagnostics on stderr, diagnostics printed first

**Chosen.** The table or JSON array is the only thing on stdout. Every
diagnostic line is on stderr, prefixed `noteview: `, emitted before the report,
with a trailing `N problem(s) across M of K file(s)` summary.

**Why.** `noteview notes --json | jq` has to work, which rules out mixing
warnings into stdout. Printing diagnostics before rather than after the table
means a terminal user sees them above the data instead of having to scroll back
past a long report.

**Library.** `personal:P20` — keeping stdout a pure data stream is what makes it
consumable by a program. `personal:R2` — the diagnostics are the surfacing.

---

## 9. `problems` is also carried in the JSON output

**Chosen.** Each JSON record has `path`, `title`, `tags`, `words`, and
`problems`.

**Why.** Requirement 5 says `--json` emits "the same data", and a consumer
reading only stdout would otherwise be the one audience that cannot tell a
malformed file from a clean one. This is the same information as the stderr
lines, in the form a program can use.

**Library.** `personal:P20` and `personal:R2`. This is the combination of
decisions 7 and 8 applied to the JSON consumer specifically.

---

## 10. `--tag` filters rows but never suppresses problem reporting

**Chosen.** Problems are collected and printed for every file discovered,
including files that `--tag` excludes from the table. `noteview notes --tag work`
still reports `bad-yaml.md` on stderr and still exits `1`.

**Why.** A file whose frontmatter will not parse has *unknown* tags — it cannot
be known to match or not match `work`. Filtering it out silently would mean the
narrower the filter, the fewer errors you are told about, which turns a
convenience flag into a way to lose errors. So the filter narrows the report,
not the diagnostics.

**Library.** `personal:R2` ("Failures must be surfaced, not swallowed") and
`personal:V5` ("Never silently discard … user data"). Without these two this
would plausibly have gone the other way, since filtering diagnostics alongside
rows is the more obvious implementation. There is an e2e test pinning it.

---

## 11. `--tag` matches exactly and case-sensitively

**Chosen.** `note.tags.includes(tag)`. `--tag work` does not match `Work` or
`workflow`.

**Why.** Tags are author-chosen identifiers. A filter that widened itself
case-insensitively or by substring would return rows the user did not ask for,
and there would then be no way to ask for the narrow thing. The strict version
is also the one a user can predict without reading documentation.

**Library.** `code-common:CP3` ("Explicit over implicit. Make dependencies,
modes, and behaviors obvious … No hidden state or global magic").

---

## 12. Tag and title coercion is permissive where it is unambiguous, and reported where it is not

**Chosen.**

- `tags: draft` (bare scalar) is accepted as `["draft"]`.
- Non-string scalar members are stringified: `tags: [2026, true]` → `["2026",
  "true"]`.
- A non-scalar member is **reported** and omitted: `tags: [ok, {a: 1}]` →
  `["ok"]` plus `frontmatter "tags[1]" is not a scalar; omitted`.
- `tags` that is neither list nor scalar is reported and treated as no tags.
- `title:` empty / `null` / blank falls back to the filename with no complaint
  (an absent title is not a broken one); a non-scalar `title` is reported.

**Why.** Requirement 3 says `tags` is "a list, possibly absent", but a single
tag written as a bare scalar is common enough in real notes that rejecting it
would be pedantry. The line drawn is: coerce when there is exactly one sensible
reading, report when there is not. What is never done is dropping a value the
user wrote without saying so.

**Library.** `personal:V5` ("Never silently discard … user data. Unknown fields
are preserved, not filtered") — this is the reason the non-scalar member
produces a problem line rather than just vanishing from the list. `personal:V2`
("When corners are cut or trade-offs made, document them explicitly") is why
each rule is spelled out in the README's "How fields are resolved" section
instead of being left to be discovered.

---

## 13. Word count is a whitespace token count, stated bluntly

**Chosen.** `countWords` counts runs of non-whitespace characters in the body.
No Markdown awareness: `# Heading` is 2, `**bold**` is 1, a code block counts
as ordinary tokens. The README says so, under both "How fields are resolved" and
"Limitations".

**Why.** The requirement says "word count … excluding frontmatter" and nothing
more. Every refinement (strip punctuation-only tokens, skip code fences, unwrap
link syntax) needs a Markdown parser, invents a definition the user did not ask
for, and makes the number harder to predict. A blunt rule that is documented is
more useful than a clever one that is not.

**Library.** `personal:V1` ("Prefer the simplest approach that meets the
requirement. Complexity must earn its place — every abstraction, indirection, or
generalization should solve a real problem, not a hypothetical one") chose the
rule; `personal:V2` ("Be honest about trade-offs, limitations … Never pretend
fundamental limitations are solvable through cleverness") is why it is named as
a limitation rather than presented as word counting.

---

## 14. Table cells are never truncated

**Chosen.** Columns are padded to their widest cell. A 300-character title
widens the column and the line wraps in the terminal. There is no width
detection and no ellipsis.

**Why.** Truncating is destroying output data to fit a viewport — and the
truncated thing is usually the path, which is precisely what the user needs to
go fix the file. A wrapped line is ugly; a cut path is wrong.

**Library.** `personal:V5` ("Never silently discard, overwrite, or strand user
data"). Applied here to the report rather than to stored data.

---

## 15. The header row is printed even when there are no rows

**Chosen.** `renderTable([])` returns `PATH  TITLE  TAGS  WORDS`. `--json` on an
empty result returns `[]`. Neither prints a "no results" message.

**Why.** The shape of the output should not depend on the result count — a
caller that skips line 1 to get data works whether there are 0 rows or 50. A
prose "no notes found" line on stdout would also be non-data in the data stream,
contradicting decision 8.

**Library.** `personal:P20` — a stable shape is what makes the output
machine-consumable.

---

## 16. Sorted by relative path, compared by code unit, with `/` separators everywhere

**Chosen.** `compareByPath` uses `<` on the relative path, not
`String.localeCompare`. Paths are assembled with `/` during the walk rather than
`path.join`, so output is identical on Windows.

**Why.** Requirement 7 asks for sorting by path; it does not say whose
collation. `localeCompare` depends on the machine's locale, so the same notes
directory could produce differently ordered output on two machines and a diff of
two reports would show phantom changes. Code-unit ordering is boring and
reproducible.

**Library.** Nothing in the library speaks to collation or path separators; this
one is mine. The nearest relative is `code-common:CP3`'s preference for
predictable behaviour over implicit environment-dependent behaviour, but I would
not claim it drove the choice.

---

## 17. Pure core, filesystem confined to one module, `run()` returns an exit code

**Chosen.** `frontmatter.ts`, `summarize.ts`, `note.ts` and `render.ts` are pure
functions over strings and values. All filesystem access is in `collect.ts`.
`index.ts` exports `run(argv, streams): Promise<number>` — output streams are
passed in and the exit code is returned rather than `process.exit` being called
from inside the logic.

**Why.** Testability was a design input, not something retrofitted: because
`summarizeNote` takes a path and a string, every field rule in decision 12 is
pinned by a unit test with no fixture files, and because `run` takes streams and
returns a number, the whole program is callable in-process. `process.exitCode`
is set once, in `main`, so no module can terminate the process as a side effect.

**Library.** `code-common:CP13` ("Testability is a design constraint … How
something will be tested is a design input, not an afterthought. If a component
is hard to test, spend more design effort making it testable"),
`code-testing:TP2` ("Every feature is designed and planned with testing in mind
from the outset"), and `code-common:CP3` for passing dependencies explicitly
instead of reaching for `process.stdout` from library code.

---

## 18. Seven small single-purpose modules

**Chosen.** `index.ts` (wiring, exit code), `cli.ts` (arguments), `collect.ts`
(walk and read), `frontmatter.ts` (split), `summarize.ts` (row building),
`note.ts` (row type, filter, ordering), `render.ts` (formatting).

**Why.** Each foreseeable change lands in exactly one file: a new output format
is `render.ts`, a new flag is `cli.ts`, a new frontmatter tolerance is
`frontmatter.ts`, a new field rule is `summarize.ts`. The boundaries here are
obvious rather than speculative — parsing, walking, and formatting are not
concerns that might turn out to be one concern — so splitting now costs nothing
and there is no invented abstraction layer.

**Library.** `code-common:CP1` ("To add a feature or implement a change,
modifications should be contained within one contiguous block of code … Before
implementing any change: is this in one block? Will this force future features
to be scattered?") set the target. `personal:H1` ("Extraction timing — If the
boundary between two concerns is clean and natural, extract now. If the boundary
is unclear, wait until a second consumer forces the design") authorised doing it
immediately rather than waiting, since these boundaries are the clean kind.
`code-common:CP6` for writing each piece parameterised enough to be used on its
own.

---

## 19. Named constants for every formatting and protocol value

**Chosen.** `FRONTMATTER_DELIMITER`, `COLUMN_GAP`, `TAG_SEPARATOR`, `NO_TAGS`,
`HEADERS`, `RIGHT_ALIGNED_COLUMNS`, `MARKDOWN_EXTENSION`, `PROGRAM_NAME`,
`EXIT_OK` / `EXIT_PROBLEMS` / `EXIT_USAGE`.

**Why.** These are the values someone will want to change, and they are exactly
the ones that are invisible when inlined — a bare `'  '` in a `join` is not
searchable and a bare `2` in a `return` says nothing.

**Library.** `code-common:CP9` ("All magic numbers should be named constants …
any value that might be adjusted"). `code-common:CP5`'s "defaults always" is
also honoured: nothing needs configuring for the tool to work.

---

## 20. The CLI surface stays at exactly what was asked for

**Chosen.** `--tag`, `--json`, `-h/--help`, one positional directory. No
`--sort`, `--no-header`, `--exclude`, `--depth`, `--ext`, or `--quiet`. The one
internal seam is `CollectOptions.extension` on the scanner, which is used by
tests but deliberately not exposed as a flag; the README says so.

**Why.** Each of those flags is a guess about a use case nobody has stated.
Keeping the scanner parameterised costs one line and makes an `--ext` flag a
trivial addition later, without committing to its name or semantics now.

**Library.** `code-common:CH2` ("Deferral decision tree … If a feature is
additive and its access patterns are unknown: add flex points (interfaces,
config hooks) without implementing the feature. If a feature is speculative with
no concrete use case: defer entirely") is the direct rule, and it is why the
`extension` option exists but the flag does not. `code-common:CP11` ("API
surface is a commitment … Adding is easy; removing is expensive") and
`personal:P8` (few entry points with options, not many near-duplicates) point
the same way.

---

## 21. Ambiguous invocations are errors, not guesses

**Chosen.** A second positional directory, a repeated `--tag`, a repeated
`--json`, `--tag` with no value, an empty `--tag=`, and any unknown flag all
exit `2` with a specific message plus usage. `--` ends option parsing so a
directory may be named `--weird`. `--tag --json` takes `--json` as the tag value,
since a flag's argument is its argument.

**Why.** Every one of these has a "helpful" reading — use the last `--tag`, take
the first directory, ignore what you don't recognise. Each of those silently
does something other than what the user typed. Refusing costs the user one
retry; guessing costs them a wrong report they may not notice.

**Library.** `code-common:CP12` (know what state you are in; do not wander into
an unexpected one) and `personal:V5` — discarding the first of two `--tag`
values is discarding input the user provided.

---

## 22. Unit tests plus end-to-end tests that spawn the real command

**Chosen.** 88 tests across 6 files. Unit tests cover `frontmatter`,
`summarize`, `note`, `render`, `cli`, and `collect` (the last against real
temporary trees, including a symlink cycle, a dangling symlink, and a
chmod-000 subdirectory). `test/e2e.test.ts` spawns the actual binary
(`node_modules/.bin/tsx src/index.ts`, the same runtime `npx tsx` resolves) and
asserts on real stdout, stderr and exit codes. `npm run check` runs typecheck
then tests.

**Why.** The unit tests pin the rules; the e2e tests are what prove the shipped
entry point works, including the module-resolution and stream behaviour that a
test harness can easily paper over. The e2e suite is also what makes every claim
in the README checkable — the example output, each exit code, and the "`--tag`
does not hide problems" behaviour all have a test.

**Library.** `code-testing:TP1` ("both unit tests and end-to-end tests. Unit
tests pin behavior of individual pieces; e2e tests prove the assembled system
does what the user actually needs") and `personal:P13` ("Verify in the production
runtime, not just the test harness … Green tests are not proof of working
software"). `code-testing:TP3` is why the e2e tests drive the CLI the way a user
does — a success criterion I cannot actually exercise is not one I can honestly
report on. `personal:R1` is why `npm run check` chains typecheck and tests
rather than leaving the typecheck optional.

---

## 23. Test scratch trees live under `test/.tmp/`, not the system temp directory

**Chosen.** `collect.test.ts` and `e2e.test.ts` create their working trees with
`mkdtemp` under `test/.tmp/`, remove them in `after`, and `.gitignore` the
directory.

**Why.** The operating instruction for this build was to work only inside the
project directory and not to run the tool against anything outside it. Writing
test fixtures into `/tmp` would violate the spirit of that even though it is
conventional. It also keeps a failed run's leftovers where you can find them.

**Library.** None — this comes from the task's own constraint, not the GVP
library. Noted here rather than omitted because it is a real deviation from the
normal convention and someone will wonder why.

---

## 24. No scaffolding, stubs, or unreached code

**Chosen.** Everything in `src/` is reachable and exercised. The SQLite-style
"throws not implemented" placeholder does not exist here; nor does any exported
helper without a caller. One such helper (a no-op path-separator constant) was
written during the build and deleted the same session.

**Why.** A stub is a claim that something exists. Unreached exports are also a
signal to the next reader — human or agent — that a pattern is endorsed, when it
is really just residue.

**Library.** `code-common:CR2` ("No scaffolding without explicit verification …
the implementing agent MUST have record of explicit, verbatim, quoted
verification from the user that scaffolding is desired. No exceptions") — there
is no such verification for this task, so there is no scaffolding.
`ai-common:C2` ("AI agents reproduce patterns from the working tree. Stale
artifacts, misleading names, and dead code cause agents to generate incorrect
code") is why the dead constant was removed rather than left harmlessly in
place.

---

## 25. The README documents behaviour and limitations, not just usage

**Chosen.** The README carries an output contract (stream discipline, sort
order, separators, no truncation), an exit-code table, the exact title / tags /
word-count resolution rules, the frontmatter recognition rules, the full list of
reported problem conditions, the walking rules, and a "Limitations" section
naming the whitespace word count, the UTF-8 assumption, the unbounded
concurrency of reads, and the unexposed extension option.

**Why.** Every one of those is a question a user or a future implementer will
otherwise have to answer by reading the source or by guessing from behaviour.
The limitations in particular are the parts that would be embarrassing to
discover rather than be told.

**Library.** `personal:V2` ("Be honest about trade-offs, limitations, and the
reasoning behind decisions … When corners are cut or trade-offs made, document
them explicitly. Presenting a clean facade over unclear motivations helps no
one"). `personal:P11` and `ai-common:C2` also apply: the next agent to pick this
up should be able to act correctly from the artifacts rather than re-deriving
intent.

---

## Where the library was thin

In the spirit of `personal:V2`, the choices above that the library did **not**
determine, and which are therefore mine to defend:

- **Path collation and separator normalisation** (decision 16) — no element
  addresses reproducibility of output ordering across machines.
- **Diagnostics before the report rather than after** (decision 8) — the
  stdout/stderr split follows from `personal:P20`; the ordering within stderr is
  a readability preference.
- **The exact set of coercions accepted for `tags` and `title`** (decision 12) —
  `personal:V5` ruled out silent dropping, but where to draw the coerce/report
  line inside that constraint was judgement.
- **Printing the header for an empty result** (decision 15) — `personal:P20`
  supports a stable shape, but "header always" versus "nothing at all" are both
  defensible under it.

None of these rose to a `personal:H5` blocker: in each case the library
constrained the outcome to a small set of acceptable answers and the remaining
choice was cosmetic or local, rather than being a decision that could not be
derived at all. Had any of them been load-bearing, the right move under
`personal:H5` would have been to propose guiding-element patches rather than to
pick and proceed.
