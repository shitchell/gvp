# Design decisions

One section per choice made while building `noteview`. Each states what was
chosen, why, and which element of the project's GVP library
(`.gvp/library`, queried with `cairn --library ./.gvp/library`) informed it.

Where a section says "no library element", the choice was made on ordinary
judgement and nothing in the library bears on it.

---

## 1. TypeScript on Node 22, run through `tsx`, no build step

**Chosen.** `src/*.ts` run directly via `npx tsx src/index.ts <dir>`, with
`tsc --noEmit` as a separate typecheck. No `dist/`, no `bin` entry, no bundler.

**Why.** The task fixed the language and the invocation. Adding a build step
would add an artifact nobody consumes and a way for the shipped output to drift
from the source. `allowImportingTsExtensions` plus `noEmit` lets the imports
name real files (`./cli.ts`), which is what `tsx` actually resolves.

**Library.** `personal:V1` (Simplicity — "every abstraction, indirection, or
generalization should solve a real problem"). A build pipeline solves none here.

## 2. Maximum strictness in `tsconfig.json`

**Chosen.** `strict`, plus `noUncheckedIndexedAccess`,
`exactOptionalPropertyTypes`, `noFallthroughCasesInSwitch`, `noUnusedLocals`,
`noUnusedParameters`, `verbatimModuleSyntax`. Every exported function has an
explicit signature; every data shape is an `interface`.

**Why.** The work this tool does is almost entirely "coerce untrusted data into
a known shape". That is exactly where a type checker earns its keep —
`noUncheckedIndexedAccess` in particular forced the `lines[index] !== undefined`
guards in the frontmatter splitter that a looser config would have let slide.

**Library.** `code-common:CP7` (Strict typing — "type hints on all function
signatures… TypeScript over JavaScript").

## 3. Adopt the `yaml` package; hand-roll only the delimiter split

**Chosen.** `yaml@^2.9` parses the frontmatter block. The `---` … `---` split
is ~30 lines of local code. `gray-matter`, the obvious off-the-shelf choice for
the whole job, was rejected.

**Why.** Parsing YAML is the part with real edge cases, and writing it by hand
would be a standing liability — so it is delegated. The split, by contrast, is
a two-delimiter scan, and `gray-matter` gets the behaviour this tool needs
wrong in two ways: it collapses "no frontmatter" and "broken frontmatter"
(requirement 6 needs them distinguished), and it throws on a parse failure
rather than handing back the body, which is still needed for the word count.
Owning 30 testable lines is cheaper than working around a library at the exact
point the requirements are most specific.

**Library.** `code-common:CH1` (Dependency adoption threshold) — applied
in both directions. Its test ("does it handle edge cases you would otherwise
have to discover yourself? what is the ongoing cost of owning a hand-rolled
equivalent?") favours adopting a YAML parser and does not favour adopting a
delimiter scanner whose behaviour conflicts with the spec.

## 4. `node:util.parseArgs` rather than a CLI framework

**Chosen.** The stdlib argument parser. No `commander`, `yargs`, or `citty`.

**Why.** The surface is one positional, two flags, and `--help`. `parseArgs`
covers it, rejects unknown options for free, and keeps the dependency tree at
one runtime package.

**Library.** `code-common:CP16` (Language selection is an effort decision, not
a capability one — "what differs is effort, driven chiefly by standard library
and ecosystem"). The stdlib already covers this need, so reaching past it buys
nothing. `code-common:CH1` also points this way: there is no need here for a
library to cover.

## 5. One `NoteRow` type, two renderers over it

**Chosen.** `src/types.ts` defines a single row shape. `renderTable` and
`renderJson` both take `readonly NoteRow[]`. `--json` is a different view of
the same array, not a second code path that assembles its own data.

**Why.** Requirement 5 says `--json` emits *the same data* as the table. Making
that structurally true — rather than a property maintained by hand in two
places — is the only way it stays true. A test asserts every JSON row appears
in the table.

**Library.** `code-common:CP4` (Centralize shared logic) and `personal:V3`
(Composability and DRY — "shared infrastructure is written once and composed").

## 6. One problem channel: a per-row `issues: string[]`

**Chosen.** Every row carries `issues`, empty when the file was clean. Malformed
YAML, a frontmatter block that is not a mapping, an unclosed block, a
non-scalar `title`, an unusable `tags` value, and a file that could not be read
at all all land in that same list. There is no separate "errors" collection and
no `error: string | null` special case.

**Why.** The first draft of this had malformed-YAML as its own concept, and then
every additional way a file can be odd wanted its own field. Making the channel
a list of strings on the row means the next kind of problem costs one `push`
and changes nothing downstream: the table marker, the stderr diagnostics, the
JSON field, and the exit code are all already driven by `issues.length`.

**Library.** `personal:P4` (Generic solutions over special-case handling —
"prefer building a generic mechanism that handles the class of failures, not
just the instance. Special-case fixes accumulate").

## 7. A file with a problem is reported as a row, and the run continues

**Chosen.** A broken file produces a normal row — path, filename as title, no
tags, whatever word count is computable — with its problem attached. Nothing is
dropped, and nothing aborts the walk. The same holds for a file that cannot be
read (`unreadable: EACCES`) and for a directory that cannot be listed.

**Why.** Requirement 6 states it directly. The library states the general form
of it, which is what settled the adjacent cases the requirement did not mention
(unreadable files, unlistable directories): they get the same treatment.

**Library.** `personal:R2` (No silent failures or data loss — "failures must be
surfaced, not swallowed"). `code-common:CP12` (Be aware of state; don't wander
into bad states — "for each failure ask: what is the consequence, does the user
need to know, can we recover, should we stop") is the element that made me
answer those four questions per failure mode rather than picking one blanket
policy; the answers differ, which is why a bad file is a row while a bad
`<dir>` argument is exit 2.

## 8. Exit `1` when any file had a problem

**Chosen.** `0` clean, `1` report produced but something was wrong, `2` usage
error. Named constants `EXIT_OK` / `EXIT_ISSUES` / `EXIT_USAGE`.

**Why.** The run must not stop, but "something in your notes is broken" is
worth more than a line of stderr a script will never read. An exit code is the
cheapest possible machine-readable signal and costs a caller who does not care
nothing.

**Library.** `personal:P19` (Favor low-effort, high-information signals — "even
when it is not certain they will be immediately useful") and `personal:P20`
(Prefer machine-consumable forms where easy). `code-common:CP9` (Named
constants for everything configurable) drove the constants over literals.

## 9. Report on stdout, diagnostics on stderr

**Chosen.** The table or the JSON array is the only thing on stdout. Problem
detail, unlistable directories, and the skipped-path count go to stderr.

**Why.** `noteview --json notes | jq` has to work on a tree with a broken file
in it. Keeping the channels separate is what makes the JSON parseable without
suppressing the diagnostics.

**Library.** `personal:P20` (Prefer machine-consumable forms where easy).

## 10. `!` gutter marker in the table, detail on stderr

**Chosen.** The table has four columns (PATH, TITLE, TAGS, WORDS) and a
one-character gutter that holds `!` for rows with issues. The issue text is not
a fifth column.

**Why.** A YAML parse error is a sentence. Putting it in a column destroys the
alignment of every other row, which is the entire value of a table. The marker
says *which* rows to look at; stderr and `--json` say *what*.

**Library.** No library element — this is a presentation judgement. It is
consistent with `code-common:CP2` (Clarity over cleverness) in spirit but that
element is about code, not output.

## 11. Title fallback: quiet when absent, reported when present-but-unusable

**Chosen.** Absent, `null`, or blank `title` → filename, no problem reported
(the requirement says the filename *is* the answer there). A scalar `title`
(string, number, boolean, date) → stringified and trimmed. A list or mapping
`title` → filename **and** a reported problem.

**Why.** The distinction is whether the author expressed an intent the tool
could not honour. "No title" is not a problem; "a title I threw away" is.

**Library.** `personal:R2` (No silent failures or data loss — "if data is
discarded, it must be explicit") is what makes the third case a reported
problem rather than a silent fallback.

## 12. Tags: accept a bare scalar, keep the readable half of a bad list

**Chosen.** `tags: draft` → `["draft"]`. `tags: [a, {bad: 1}, b]` → `["a","b"]`
plus a reported problem naming `tags[1]`. `tags: {k: v}` → no tags plus a
reported problem. Numbers, booleans, and dates are stringified.

**Why.** A single-string `tags` is common enough in real note collections that
rejecting it would be pedantry, and it is unambiguous. Partial recovery of a
list follows the same logic as §7: one bad entry should not cost the user the
other tags, and the entry that was dropped is named.

**Library.** `personal:R2` (explicitly discarded, not silently). I also
considered `personal:V5` (Data preservation — "unknown fields are preserved,
not filtered") as an argument for echoing the *whole* frontmatter mapping into
the `--json` output. I decided against it: V5 is about not stranding user data,
and this tool never writes, so nothing is at risk of being lost — while the
requirement is specific that `--json` carries the same data as the table.
Recording the rejected reading here rather than leaving it unsaid is
`personal:V2` (Transparency).

## 13. Word count is a whitespace token count, defined in the README

**Chosen.** `body.split(/\s+/)` filtered for non-empty, with the frontmatter
block removed first. Markdown syntax, code fences, and HTML count as whatever
tokens they form. Documented as such.

**Why.** Every more sophisticated definition (strip syntax? count code blocks?)
needs a policy the requirement does not state, and would make the number harder
to predict from the file. A crude definition that is written down beats a clever
one that surprises.

**Library.** `personal:V1` (Simplicity) for the choice, `personal:V2`
(Transparency — "when corners are cut… document them explicitly") for the fact
that the README states the definition rather than leaving the reader to guess.

## 14. Unclosed frontmatter: report it, count the remainder anyway

**Chosen.** A file opening with `---` and never closing it gets a reported
problem, no fields, and a word count over everything after the opening line.

**Why.** There is no correct answer — the tool cannot know where the author
meant the block to end. The two honest options are "count nothing" and "count
everything, and say why the number is suspect". The second gives the user more
and lies less, provided the problem text admits it, which it does.

**Library.** `personal:V2` (Transparency — "never pretend fundamental
limitations are solvable through cleverness").

## 15. Sort by byte order, not locale

**Chosen.** Plain `<` / `>` on the relative POSIX path, so `CAPS.MD` sorts
before `alpha.md`. Not `localeCompare`.

**Why.** `localeCompare` makes the output depend on the machine's locale, so
the same tree can produce two different reports and a test asserting order
becomes flaky. A reproducible order is worth more than a pretty one, and the
README states the rule.

**Library.** `personal:P2` (Empirical validation before commitment) does not
quite cover this; the closest is `personal:V2` (Transparency) for documenting
it. The determinism argument is ordinary engineering judgement — no library
element required it.

## 16. Under `--tag`, files with problems are always shown

**Chosen.** `matchesTag` keeps a row when the tag matches **or** when the row
has any issue. So a file whose frontmatter failed to parse appears in every
filtered view.

**Why.** A file we could not parse has unknown tags: excluding it from a
filtered report would be asserting it does not carry the tag, which we do not
know. That is the silent skip requirement 6 forbids, just relocated from the
walk into the filter.

The rule deliberately over-includes: a file whose *only* problem is a non-scalar
`title` has perfectly readable tags, and it still shows up under a filter those
tags do not match. The alternative was a second per-row flag ("are these tags
trustworthy?") feeding the filter. I took the over-inclusion instead, because
one rule a reader can hold in their head — *a file with a problem always
appears* — is worth more than the precision, the `!` marker and the stderr line
explain every such row, and the trade is written down in the README.

**Library.** `personal:R2` (No silent failures) for the rule; `personal:P9`
(Follow rules uniformly, change them explicitly) for preferring the single
uniform rule over a special case; `personal:V2` (Transparency) for documenting
the over-inclusion instead of hoping nobody notices.

## 17. A repeated `--tag` is an error, not last-one-wins

**Chosen.** `--tag` is declared `multiple: true` so both values arrive, and more
than one is rejected with "`--tag` may be given at most once".

**Why.** The requirement specifies one tag. `multiple: false` would have made
`--tag a --tag b` silently discard `a` and filter on `b` — a wrong answer that
looks like a right one. Supporting both was rejected because AND-vs-OR
semantics are not derivable from the requirement, and guessing would bake a
guess into the CLI surface permanently.

**Library.** `personal:R2` (No silent failures or data loss) for rejecting
last-one-wins; `code-common:CP11` (API surface is a commitment — "every public
surface… is a commitment. Adding is easy; removing is expensive") for not
inventing multi-tag semantics now. A future `--tag a --tag b` can be defined
additively; a wrong definition shipped today could not be taken back.

## 18. Never follow symlinks

**Chosen.** Any symlink — file or directory — is skipped and counted.

**Why.** A symlinked directory pointing at an ancestor makes the walk run
forever, and a symlinked `.md` double-counts a note under two paths. Refusing
to follow them keeps the walk in a state that is always understood, and the
count on stderr means a user with a deliberately symlinked notes tree finds out
why their file is missing.

**Library.** `code-common:CP12` (Be aware of state; don't wander into bad
states) directly; `personal:R2` for the fact that skips are counted rather than
silent.

## 19. Skip `.git` and `node_modules`, via a constant, not a flag

**Chosen.** `SKIPPED_DIRECTORY_NAMES = ['.git', 'node_modules']` in
`src/scan.ts`. No `--exclude` option. Every skip is counted and the count is
printed on stderr, and the skip list is named in `--help` and the README.

**Why.** This is the one place the tool deliberately does less than requirement
1's literal "recursively finds `.md` files" — a `node_modules` tree can bury a
notes directory under hundreds of vendored `README.md` files, and a report
nobody can read has not met the requirement either. Since it is a deviation, it
is made loudly: named in `--help`, named in the README, and counted on stderr
on every run that hits one.

An `--exclude` flag was rejected: no concrete need for per-run control has come
up, so it would be a permanent CLI commitment bought on speculation. The named
constant is the flex point — changing the policy is a one-line edit in one
place.

**Library.** `code-common:CH2` (Deferral decision tree — "if a feature is
speculative with no concrete use case: defer entirely with no flex points")
against the flag; `code-common:CP9` (Named constants for everything
configurable) and `code-common:CP5` (Configuration infrastructure early,
defaults always) for the constant; `personal:R2` and `personal:V2` for making
the deviation visible rather than silent; `code-common:CP11` (API surface is a
commitment) for not adding the flag now.

## 20. `.md` matched case-insensitively; `.markdown` not matched

**Chosen.** `fileName.toLowerCase().endsWith('.md')`.

**Why.** The requirement says `.md`. Case-insensitivity is the same extension
on a case-preserving filesystem, so honouring `NOTES.MD` is following the
requirement, not extending it. `.markdown` is a different extension and
accepting it would be inventing scope.

**Library.** `personal:P9` (Follow rules uniformly, change them explicitly) —
the requirement is the rule here, and widening it is a change to make
deliberately, not a convenience to slip in.

## 21. Six small modules along the pipeline's natural seams

**Chosen.** `index.ts` (process), `cli.ts` (args, orchestration, exit code),
`scan.ts` (walk), `note.ts` (file → row), `frontmatter.ts` (split and parse),
`render.ts` (output), `types.ts` (shape). No further layering — no plugin
registry, no format abstraction, no repository interface.

**Why.** Each boundary is one the data actually crosses: bytes → block+body →
row → text. Splitting there let every piece be tested as a pure function.
Anything beyond that would be structure for its own sake — there is one input
format and two output formats, both known.

**Library.** `personal:H1` (Extraction timing — "if the boundary between two
concerns is clean and natural, extract now. If the boundary is unclear, wait
until a second consumer forces the design") set both the six splits and the
stopping point. `code-common:CP1` (One contiguous block) is why everything that
decides a row's contents — field coercion, title fallback, word count — lives
in `note.ts` and nowhere else: adding a column should be one edit in one file.

## 22. `run()` takes its I/O and returns an exit code

**Chosen.** `run(argv, {stdout, stderr, cwd}): Promise<number>`. Only
`src/index.ts` touches `process`, and it does nothing but wire the two
together.

**Why.** It makes the entire CLI — argument errors, filtering, both output
formats, exit codes — testable in-process with no subprocess and no global
state, which is most of why the test suite is fast enough to run on every
change. Passing `cwd` explicitly rather than reading it inside also means a
test can point the tool at a fixture without `chdir`.

**Library.** `code-common:CP13` (Testability is a design constraint — "how
something will be tested is a design input, not an afterthought") and
`code-testing:TP2` (Design every feature with testing in mind).
`code-common:CP3` (Explicit over implicit — "function signatures show all
inputs. No hidden state or global magic") is why `cwd` is a parameter.

## 23. `node:test` via `tsx`, with both unit and end-to-end tests

**Chosen.** 81 tests in five files. Unit tests over the pure functions
(frontmatter, note, render, scan) and over `run()` in-process; `tests/e2e.test.ts`
spawns `npx tsx src/index.ts` — the exact invocation the README documents — and
asserts on real stdout, stderr, and exit status. Fixtures live in
`tests/fixtures/notes`; the symlink and permission cases build temp trees at
run time. No test framework dependency.

**Why.** The in-process tests are where the edge cases get pinned cheaply. The
spawned tests are where things the in-process tests cannot see get caught: that
`tsx` actually resolves the `.ts` imports, that `process.exitCode` survives,
that stdout really is parseable JSON with diagnostics really on stderr.

**Library.** `code-testing:TP1` (Tests for all code, unit and end-to-end —
"unit tests pin behavior of individual pieces; e2e tests prove the assembled
system does what the user actually needs") required both layers rather than
just the cheap one. `personal:P13` (Verify in the production runtime, not just
the test harness — "green tests are not proof of working software") is
specifically why the e2e test shells out to `npx tsx` instead of importing
`index.ts`. `personal:R1` (Verify before claiming correctness — "typecheck must
pass. Tests must pass") is why `npm run typecheck` is a separate script that was
run alongside the suite.

## 24. Files read sequentially; no concurrency cap, no parallel reads

**Chosen.** A plain `for` loop of `await readFile`.

**Why.** For any plausible notes directory this is milliseconds. Doing it in
parallel safely needs a bounded pool (unbounded `Promise.all` over a large tree
hits `EMFILE`), which is more moving parts than a speed problem nobody has
reported deserves. Recorded in the README's limitations so the next person does
not have to rediscover that it was a choice.

**Library.** `code-common:CH2` (Deferral decision tree — additive feature, no
known access pattern) and `personal:V1` (Simplicity — "complexity must earn its
place"). `personal:V2` (Transparency) for listing it as a known limitation
rather than leaving it as an unremarked gap.

## 25. Empty directory prints a sentence, not nothing

**Chosen.** `no Markdown files found` for an empty result in table mode; `[]` in
`--json` mode.

**Why.** Zero rows and a crash look identical if the output is empty. One line
of prose distinguishes "it worked, there is nothing here" from "it failed".
JSON mode stays `[]` because a machine consumer needs valid JSON, not prose.

**Library.** `code-common:CP12` (Be aware of state; don't wander into bad
states) — the user should always be able to tell which state the run ended in.

## 26. No placeholder or stub code anywhere

**Chosen.** Every function in `src/` is fully implemented. Nothing throws
"not implemented"; there are no TODOs.

**Why.** Everything the requirements ask for is small enough to finish, so
there was no reason to leave a seam open.

**Library.** `code-common:CR2` (No scaffolding without explicit verification —
"the implementing agent MUST have record of explicit, verbatim, quoted
verification from the user that scaffolding is desired. No exceptions"). No such
verification exists for this task, so scaffolding was not an option.
