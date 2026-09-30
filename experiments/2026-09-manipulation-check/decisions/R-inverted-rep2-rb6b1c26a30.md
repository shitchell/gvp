# Decisions

One section per design choice made while building `noteview`. Each states what
was chosen, why, and which element of this project's GVP library
(`./.gvp/library`) informed it — or that none did.

Elements are cited by id. Ids prefixed `personal:`, `ai-common:`,
`code-common:`, `code-testing:` are in this project's library; anything else is
named explicitly as coming from outside it.

---

## 1. Parse the frontmatter with the `yaml` package; split the fences by hand

**Chosen.** `yaml` (^2.9.1) is the only runtime dependency. Locating the `---`
fences and slicing the file is ours (`src/frontmatter.ts`, ~40 lines).

**Why.** Applying the dependency threshold to each half separately gives
different answers. The fence scan is a few lines, so a package for it (e.g.
`gray-matter`) would be mostly unused code. The YAML parse is the opposite: a
frontmatter block is real YAML — block and flow collections, quoting styles,
block scalars, comments, type coercion — and the part of a parser we need is
all of it. A hand-rolled subset would not fail on the YAML it cannot handle; it
would misread it and report a confident wrong answer, which is the failure mode
the library most wants avoided. `yaml` also yields positioned error messages,
which requirement 6 needs.

**Library.** `code-common:CH1` ("if the useful portion of an external library
is approximately 200 lines or fewer, write it yourself" — and its checklist:
what fraction do you use, what is the burden of working around limitations).
The *don't misread data* half of the reasoning rests on `personal:V5` and
`personal:R2`. `ai-common:P2`'s preference for tools with deeper AI training
data also favours `yaml` over a bespoke parser.

---

## 2. Parse arguments with `node:util`'s `parseArgs`

**Chosen.** No `commander`, `yargs`, or `citty`.

**Why.** Three options and one positional. The useful portion of an argument
library at this size is well under the threshold, and the standard library
already covers it — including rejecting unknown options, which is behaviour we
want rather than behaviour we must add.

**Library.** `code-common:CH1`.

---

## 3. Six small modules rather than one file

**Chosen.** `config.ts` (tunables), `options.ts` (argv → intent),
`frontmatter.ts` (split + field reading), `notes.ts` (walk + read + filter),
`render.ts` (table + JSON), `index.ts` (wiring).

**Why.** Each boundary here is one a change actually respects: adding a column
touches `render.ts` only; recognising another frontmatter field touches
`frontmatter.ts` only; changing discovery touches `notes.ts` only. These are
not speculative seams — they fall out of the five requirements as written.

**Library.** `code-common:CP1` ("modifications should be contained within one
contiguous block... will this force future features to be scattered?") and
`personal:H1` ("if the boundary between two concerns is clean and natural,
extract now"). `code-common:CP4` for keeping the two renderers over one shared
`Note[]` rather than two independent traversals.

---

## 4. Every tunable value lives in `config.ts`, with working defaults

**Chosen.** Exit codes, the fence string, the note extension, column headers,
the column gap, the tag separator, the empty-cell placeholder, the JSON indent,
the error-cell cap, and the default option values are all named constants in
one module. Zero-config use (`noteview <dir>`) works.

**Why.** These are exactly the values someone will want to change, and they are
cheap to name now and annoying to extract later from the middle of a render
function.

**Library.** `code-common:CP5` ("wire up configuration from the start rather
than hardcoding... but always provide sensible defaults so zero-config works")
and `code-common:CP9` ("all magic numbers should be named constants").

---

## 5. `run(argv, streams)` returns an exit code; only the tail of `index.ts` touches `process`

**Chosen.** The whole command is a function taking its arguments and its two
output sinks as parameters and returning a number. Six lines at the bottom of
`index.ts` bind it to `process.argv`, `process.stdout`, `process.stderr`, and
`process.exitCode`.

**Why.** It makes the command exercisable in-process, and it makes the
dependencies of the command visible in its signature instead of implicit in
which globals it happens to reach for.

**Library.** `code-common:CP13` ("how something will be tested is a design
input, not an afterthought"), `code-testing:TP2`, and `code-common:CP3`
("function signatures show all inputs. No hidden state or global magic").

---

## 6. Three exit codes: 0 clean, 1 report produced with problems, 2 wrong invocation

**Chosen.** `EXIT.ok` / `EXIT.noteProblems` / `EXIT.usage` in `config.ts`,
documented in `--help` and the README.

**Why.** "I could not run at all" and "I ran and some of your notes are broken"
are different states with different fixes, and collapsing them into a single
non-zero code loses that distinction for anything scripting the tool. A caller
gets the fact for free, without parsing output.

**Library.** `code-common:CP12` ("always know what state you are in... for each
failure ask — what is the consequence, does the user need to know, can we
recover, should we stop"), `personal:R2` ("failures must be surfaced, not
swallowed"), and `personal:P19`/`personal:P20` (low-effort high-information
signals, shaped so a program can read them).

---

## 7. A malformed note is reported twice — on stderr and in the report itself

**Chosen.** Every problem produces a `noteview: <path>: <reason>` line on
stderr, *and* the note stays in the report with its reason in the `ERROR`
column (table) or the `error` key (JSON). The run continues.

**Why.** Requirement 6 asks for "reported, not skipped silently". stderr alone
loses the reason when stdout is redirected; the report alone loses the warning
when a human is scanning a wide table. Both channels cost one line of code.

**Library.** `personal:R2` and `code-common:CP12`.

---

## 8. Problems are collected per field, and readable data around them is kept

**Chosen.** `readFields` accumulates a list of problems instead of throwing at
the first one. A note with `title: 42` *and* `tags: project` reports both. A
`tags` list containing `[project, 7]` keeps `project`, drops `7`, and says so.

**Why.** Stopping at the first problem makes the user fix one thing per run.
Dropping the whole frontmatter because one field is wrong discards data that
was perfectly readable.

**Library.** `personal:V5` ("never silently discard... unknown fields are
preserved, not filtered") for keeping the readable parts, and `personal:R2` for
naming the dropped parts rather than dropping them quietly.

---

## 9. A `tags` field in the wrong shape is reported, never coerced

**Chosen.** `tags: project` (a bare string) is reported as
`frontmatter 'tags' is a string, expected a list`. It is not silently read as
`["project"]`.

**Why.** Coercion is a guess about intent, and a wrong guess puts a tag in the
report — and into `--tag` matching — that the note never claimed. Requirement 3
says `tags` is a list; anything else is a thing the author should be told about.
The cost is a warning on a file that "obviously meant" one tag; the cost of the
alternative is fabricated data with no warning.

**Library.** `personal:V2` ("never pretend fundamental limitations are solvable
through cleverness... when corners are cut or trade-offs made, document them
explicitly") and `personal:V5`. Documented in the README under *What counts as
what*.

---

## 10. A `--tag` filter cannot exclude a note whose tags could not be read

**Chosen.** `Note` carries `tagsKnown`. `selectByTag` keeps a note when its
tags include the requested tag **or** when its tags are unknown. So
`--tag draft` still lists a note whose frontmatter failed to parse. A note whose
tags *were* readable is filtered normally even if something else about it was
wrong — but stderr still names it.

**Why.** This is where requirements 4 and 6 collide: a broken note has no
determinable tags, so a naive filter drops it, and "must be reported" quietly
stops being true the moment anyone passes `--tag`. Keeping it is the only
reading under which a filtered view never hides a broken note. The distinction
between "no tags" (`[]`) and "tags unknown" (`null`) exists solely to make this
decidable rather than guessed.

**Library.** `personal:R2` ("failures must be surfaced, not swallowed") is
decisive. `code-common:CP12` supports the shape of it: the tool knows which of
the two states it is in and never conflates them.

---

## 11. Diagnostics and the exit code reflect every note found, not just the selected ones

**Chosen.** stderr lines and the `1` exit code are computed over all collected
notes, before `--tag` filtering.

**Why.** Requirement 6 is unconditional. A note excluded by a filter that was
also unreadable is still a fact about the directory the user asked about.

**Library.** `personal:R2`.

---

## 12. The `ERROR` column appears only when needed, and its cell is capped

**Chosen.** The table grows a fifth column only when at least one reported note
has a problem. That cell is capped at `TABLE_ERROR_MAX_WIDTH` (72) with a `…`.
The untruncated text is always on stderr and in `--json`.

**Why.** A parser message can run to several hundred characters and would widen
the table past any terminal, which makes the clean rows unreadable too — so the
column has to be bounded somewhere. Truncating is only acceptable because the
full text is guaranteed in two other places, which is stated in the README's
limitations.

**Library.** A tension between `personal:V1` (simplicity: no column of dashes
on a clean run) and `personal:V5` (don't discard data). Resolved by keeping the
data whole in the two places that can hold it and bounding only the view;
`personal:V2` requires that the cap be documented rather than silently applied,
which it is.

---

## 13. The JSON shape is an array of fixed-key objects, with `error` always present

**Chosen.** `[{path, title, tags, words, error}]`. `error` is `null` on a clean
note rather than absent. The internal `tagsKnown` flag is not emitted.

**Why.** A consumer should not have to probe for key presence to tell "clean"
from "not reported". Requirement 5 asks for the same data as the table, which
fixes the key set; `toReport` in `render.ts` is the single place that set is
written down, so the contract is visible rather than scattered.

**Library.** `code-common:CP11` ("every public surface — CLI flags, function
signatures, config keys, file formats — is a commitment... prefer additive
changes over breaking ones"), which is also why `tagsKnown` stays internal:
exporting it would commit to a field whose meaning is an implementation detail.
`personal:P20` for the machine-readable form existing at all.

---

## 14. `--json` does not echo frontmatter keys the tool does not report

**Chosen.** `author`, `date`, or any other frontmatter field is read past and
not emitted.

**Why.** Requirement 5 says `--json` emits "the same data" as the table, which
fixes the key set to the four reported fields. Passing the whole frontmatter
through is a plausible future feature (a `--raw`/`--all-fields` flag) but has
no concrete use case here, so it would be a guess at a shape.

**Library.** This is the one place `personal:V5` ("unknown fields are
preserved, not filtered") pulls the other way, so it is worth being explicit: V5
governs systems that *store* or *round-trip* user data, and `noteview` neither
writes nor rewrites a note — nothing is stranded by not printing it.
`code-common:CH2` then decides the rest: "if a feature is speculative with no
concrete use case: defer entirely with no flex points."

---

## 15. Follow symlinks, but visit each directory at most once by real path

**Chosen.** Symlinked notes and symlinked directories are included; a
`Set` of resolved real paths makes a cycle terminate. A broken symlink ending in
`.md` is let through to the reader, which reports why it could not be read.

**Why.** A symlinked note is the user's note and excluding it would quietly
shrink the report; following blindly hangs on a link that points back up the
tree. The realpath set is four lines and settles both.

**Library.** `code-common:CP12` ("never wander into an unexpected bad state")
for the cycle guard, `personal:V5` for including symlinked notes at all.

---

## 16. A directory that cannot be listed becomes a row, not a special case

**Chosen.** `EACCES` on a subdirectory does not end the walk. The directory is
reported with the same `Note` shape as a broken note, with
`error: "directory could not be listed: ..."`.

**Why.** "Part of your tree is missing from this report" is the same kind of
fact as "this note could not be read", and giving it the same shape means both
output formats, the stderr pass, and the exit code handle it with no extra code
paths. A separate channel would have needed all four to learn about it.

**Library.** `personal:P4` ("prefer building a generic mechanism that handles
the class of failures, not just the instance"), `personal:R2`, and
`code-common:CP12`.

---

## 17. Validate `<dir>` up front and exit 2

**Chosen.** A missing path or a path that is not a directory is checked before
any walking and reported as a usage failure.

**Why.** It is the user's mistake to fix and it is a different outcome from a
successful scan, so it gets the usage code rather than the problem code. Doing
it up front means the failure message names the thing the user typed, not an
inner path.

**Library.** `code-common:CP12` (know the state; decide whether to stop).

---

## 18. A second `--tag` is an error, not last-wins

**Chosen.** `--tag a --tag b` fails with `--tag may be given only once`. The
option is parsed with `multiple: true` purely so the second value can be seen
and refused instead of overwriting the first.

**Why.** Last-wins silently discards something the user asked for. Whether
several tags should mean AND or OR is a real design question with no answer in
front of me, so refusing is honest and leaves the door open (adding
multi-tag semantics later stays additive).

**Library.** `personal:R2` and `personal:V5` for refusing to drop the input;
`code-common:CP11` for keeping the eventual multi-tag meaning unclaimed.

---

## 19. Sort by relative path in codepoint order, not locale order

**Chosen.** A plain `<` comparison on the POSIX-style relative path. Uppercase
therefore sorts before lowercase.

**Why.** `localeCompare` would make the report depend on the machine's locale,
which breaks byte-for-byte comparison of two runs and would make the
end-to-end assertions environment-dependent.

**Library.** No element speaks to sort collation directly. The reproducibility
motive is downstream of `code-common:CP13` (testability as a design input) and
`personal:R1`'s insistence on verification: an assertion that passes only in one
locale is not verification.

---

## 20. Title falls back to the file name including its extension

**Chosen.** `beta.md`, not `beta`.

**Why.** Requirement 3 says "the filename if absent", and the file name is
`beta.md`. Stripping the extension is an invention, and it also makes the
fallback indistinguishable from a real `title: beta`.

**Library.** None decisive; this is a literal reading of the requirement.
`personal:V2` covers the obligation to document it, which the README does.

---

## 21. Word count is whitespace-separated tokens in the body

**Chosen.** `body.trim().split(/\s+/)`. Markdown syntax counts as written:
`# Heading` is two words, a `---` rule in the body is one.

**Why.** Every richer definition (strip syntax? count link text but not URLs?
what about code fences?) is a judgement call with no requirement behind it, and
each one makes the number harder to predict from looking at the file. A
stated-and-simple rule beats an unstated-and-clever one.

**Library.** `personal:V1` ("prefer the simplest approach that meets the
requirement... complexity must earn its place") and `personal:V2` for stating
the definition in the README instead of leaving the number unexplained.

---

## 22. Tests: `node:test` with `tsx`, unit plus end-to-end through the real command

**Chosen.** No Jest or Vitest. 80 tests across five files: unit tests for
frontmatter splitting/reading, discovery and reading, filtering, rendering and
argument parsing; and `tests/cli.test.ts`, which spawns
`npx tsx src/index.ts` — the command the README documents — and asserts on
stdout, stderr and exit codes.

**Why.** The built-in runner covers everything needed here, so a framework
would be a large dependency used shallowly. The end-to-end tests exist because
green unit tests would not have caught a broken entry point, an ESM resolution
problem, or an exit code that never reaches the shell.

**Library.** `code-testing:TP1` ("always write automated tests for code where
possible — both unit tests and end-to-end tests"), `code-testing:TP2`,
`personal:P13` ("green tests are not proof of working software... exercise it in
the production runtime, not only the test suite"), and `code-common:CH1` for
the runner choice.

---

## 23. Tests write only inside the project, and skip with a reason when run as root

**Chosen.** Cases that need a tree the fixtures cannot hold (an empty
directory, a symlink cycle, an unreadable file) build it under
`tests/.scratch/` and remove it afterwards, rather than in the system temp
directory. The two permission-based cases skip with `skipped-root: ...` when
`getuid() === 0`, because file modes do not restrain root.

**Why.** Keeping scratch trees inside the project is a constraint of this task
(the tool must not be pointed outside its directory) and also makes a crashed
run's leftovers obvious and gitignored. A skip that says *why* it skipped is
distinguishable from a pass; a silent skip is not.

**Library.** No element in this project's library covers either point. The
skip-with-reason convention is `ai-infra:R7` ("never `pass | fail`; always
`pass | fail | skipped-<reason>`"), which is in the machine-wide registry —
visible via `cairn libs search` — but *not* in this project's library, so it is
cited here as an outside influence rather than as governance.

---

## 24. Strict TypeScript, checked but not compiled; annotations only where they earn it

**Chosen.** `strict` plus `noUncheckedIndexedAccess`,
`exactOptionalPropertyTypes` and `verbatimModuleSyntax`; `noEmit`, run by
`npm run typecheck`. Exported function signatures and the data shapes (`Note`,
`NoteFields`, `Options`, `NoteReport`) are annotated; local inference is left
alone. Data shapes are plain object types, not classes. Relative imports are
written with `.js` specifiers so the same source could be compiled by `tsc`
later without an edit.

**Why.** `noUncheckedIndexedAccess` is what makes the table renderer's index
arithmetic honest about being able to miss. There is no build step because
nothing needs one — the documented entry point runs the source.

**Library.** `code-common:CP7` ("let inference carry the types it can... prefer
plain objects over model classes for internal shapes") — worth flagging because
a same-named element in another library in the machine-wide registry says the
opposite ("type hints on all function signatures... models for data
structures"); this project's library is the one followed. `personal:R1`
("typecheck must pass") for wiring the check up at all, and `personal:V7` for
the `.js` import specifiers keeping the compile option open at zero cost.

---

## 25. npm scripts are the enforcement mechanism; no linter, no formatter, no hooks

**Chosen.** `npm run typecheck`, `npm test`, and `npm run check` (both). No
ESLint, no Prettier, no pre-commit hook.

**Why.** The project is not a git repository, so there is no commit to hang a
hook on — the scripts are the strongest mechanism actually available, and they
make the right thing a single command. A linter and formatter on a
six-module project would add a gate whose friction exceeds what it protects
here, where the type checker already rejects the mistakes that matter.

**Library.** `code-common:CP10` ("prefer hooks, CI, and validators over
convention") sets the direction and `personal:P7` demands *some* concrete
mechanism, which `npm run check` is. `personal:P18` ("gates must earn their
friction... name the friction it adds and why the protection is worth it") is
why the lint gate was declined rather than added by default.

---

## 26. A README that names its limitations explicitly

**Chosen.** The README documents the frontmatter rules, the word-count and
tag-matching definitions, the sort order, the exit codes, and a *Known
limitations* section (UTF-16 column widths, the error-cell cap, single `--tag`,
`...` not accepted as a closing fence, whole-file reads).

**Why.** Each of those is a place where someone could reasonably expect
different behaviour. Written down, they are decisions; unwritten, they are
surprises that look like bugs.

**Library.** `personal:V2` ("be honest about trade-offs, limitations... when
corners are cut or trade-offs made, document them explicitly").

---

## 27. Flex points deliberately not built

**Chosen.** No config file, no plugin seam for output formats, no configurable
note extension or word-count strategy, no persistence abstraction, no
multi-directory argument. The `Options` object and `config.ts` are the only
seams, and both already carry real load.

**Why.** Each of those is a real future possibility with no concrete use case
today, and this is a leaf tool — nothing is built on top of it, so a wrong guess
stays local and cheap to revisit.

**Library.** `code-common:CH2`'s third branch ("if a feature is speculative
with no concrete use case: defer entirely with no flex points") and
`personal:P1` ("infinite flexibility for hypothetical scenarios equals infinite
complexity"). `personal:P16` supplies the weighting — "let leaf or disposable
components be built more loosely" — which is why this resolves against
`personal:P21`'s pull toward many early config-exposed flex points; that element
is about discovering the best use of a tool under active experimentation, which
is not the situation for a five-requirement report command. `code-common:CP15`
(swappable persistence) does not apply: nothing is stored.

---

## 28. No decisions were escalated

**Chosen.** Every choice above was taken and recorded without stopping to ask.

**Why.** `personal:H5` makes a blocker "any decision that cannot be
unambiguously derived from my personal or the project GVP library", and
requires proposing guiding-element patches — not bare decisions — when one
arises. The two choices that came closest were section 10 (a `--tag` filter
versus a report obligation) and section 14 (`personal:V5` against requirement
5's "same data"); both resolved inside the existing library, as recorded there,
so neither is a blocker.

**Library.** `personal:H5`, and `personal:P15` ("a decision is the guided
output: when it follows unambiguously from the existing guiding elements, it is
correct by construction and needs no human review").
