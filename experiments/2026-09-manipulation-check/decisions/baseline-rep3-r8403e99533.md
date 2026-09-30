# Design decisions

One section per design choice made while building `noteview`. Each states what
was chosen, why, and whether the project's GVP library (`./.gvp/library` —
`personal` plus the inherited `ai-common`, `code-common`, `code-testing`,
`code-realtime`, `code-web` documents) informed the choice, naming the element
relied on.

Where the library did not bear on a choice, that is said plainly rather than a
plausible-looking element being attached after the fact.

---

## 1. Strict TypeScript, no build step, `npx tsx src/index.ts <dir>`

**Chosen.** TypeScript run directly through `tsx`; no compile output. `tsconfig.json`
turns on `strict`, plus `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` and
`verbatimModuleSyntax`. `npm run typecheck` (`tsc --noEmit`) is the gate.

**Why.** The task fixes the runtime and the invocation. The remaining choice was how
strict to be and whether to add a build step. A build step buys nothing for a tool
run from source, and every stricter flag was free here — `noUncheckedIndexedAccess`
in particular forced explicit handling of "row has no such column" and "argv has no
such position" rather than trusting indexing.

**GVP.** `code-common:CP7` ("Strict typing … TypeScript over JavaScript. Types add
clarity and catch issues at compile/check time") is the direct basis for the flag
set. `personal:R1` ("Typecheck must pass") is why a typecheck script exists as a
named gate rather than being run ad hoc.

---

## 2. Depend on `yaml`; hand-roll the frontmatter fence split

**Chosen.** One runtime dependency, `yaml`, for parsing the block. The fence
splitting — first line is `---`, block ends at the next line that is exactly `---` —
is about twenty lines written here, not `gray-matter` or similar.

**Why.** Requirement 6 demands that malformed frontmatter be *reported*, which means
the tool must be able to tell malformed YAML from valid-but-unfamiliar YAML. A
line-splitting shortcut over `key: value` cannot do that: it would read anchors,
block scalars and nested maps as garbage and report false problems, or accept
genuinely broken YAML. Real parsing is required and is far more than a couple of
hundred lines of work. The fence split, by contrast, is trivial and fully used.

**GVP.** `code-common:CH1` ("If the useful portion of an external library is
approximately 200 lines or fewer, write it yourself … what fraction of the library do
you actually use?") is the test that was applied, and it cuts both ways here: it
rules the YAML parser in (the needed portion is large, and `yaml` is widely used with
a healthy maintainer) and the frontmatter wrapper out (the needed portion is tiny).
`personal:V1` (Simplicity — "fewer things to parse, fewer assumptions to understand")
is why the dependency count stops at one.

---

## 3. Argument parsing with `node:util` `parseArgs`, not a CLI framework

**Chosen.** The standard library's `parseArgs` in `strict` mode. No `commander`,
`yargs` or `minimist`.

**Why.** Three flags and one positional. `parseArgs` gives the unknown-option and
missing-value errors for free, which is the part of a CLI framework that would
actually have been used, and it is in the runtime already.

**GVP.** `code-common:CH1` again — the useful portion of a CLI framework for this
surface is well under its threshold, and the standard library removes even the
write-it-yourself cost. `code-common:CP16` ("Evaluate a language on effort … driven
chiefly by standard library and ecosystem") is why the standard library was checked
before the registry.

---

## 4. Hand-rolled table renderer

**Chosen.** Column widths computed from the widest cell; a two-space gutter; the
count column right-aligned. No table dependency, no box-drawing characters.

**Why.** Under thirty lines, and a dependency would own the shape of the primary
output. Plain space-separated columns stay `grep`- and `awk`-friendly.

**GVP.** `code-common:CH1` (useful portion far below the threshold) and
`personal:P20` ("Where it is easy, shape signals and artifacts so a program can read
them") — space-aligned columns with no borders keep the table machine-readable as
well as human-readable.

---

## 5. Module layout: pure core, one filesystem module, one process-touching module

**Chosen.** `types.ts` (row type, problem kinds, exit codes, constants), `note.ts`
(text → row, pure), `render.ts` (rows → text, pure), `cli.ts` (argv → decision,
pure), `scan.ts` (the only filesystem module), `index.ts` (wiring; the only place
`process` is touched). `runNoteview(argv)` returns `{ stdout, stderr, exitCode }`
rather than writing and exiting.

**Why.** The awkward part of testing a CLI is stream and exit-code capture. Returning
an outcome object instead of performing it removes that problem for every test but
the two that deliberately spawn a process, and leaves exactly one place where the
process is touched. Both renderers consume the same `NoteRecord`, so a new reported
field is added in one place.

**GVP.** `code-common:CP13` ("How something will be tested is a design input, not an
afterthought. If a component is hard to test, spend more design effort making it
testable") is the reason for the outcome-object shape specifically.
`code-common:CP1` ("modifications should be contained within one contiguous block …
Will this force future features to be scattered?") is why one row type feeds both
renderers. `personal:P3` ("Separate what from how at every layer") shaped the split
between parsing rules, filesystem access and presentation.

---

## 6. Malformed frontmatter is reported per row, on stderr, and never stops the run

**Chosen.** A malformed note still gets a row, with whatever could be read and the
filename as title. Its problems ride on the row (`!` marker in the table, non-empty
`problems` in JSON) and are additionally written one-per-line to stderr. A file that
cannot be read at all also becomes a row, carrying an `unreadable` problem, rather
than aborting the walk.

**Why.** Requirement 6 states the behaviour; the design question was *where* the
report goes. Putting problems both in the data and on stderr means neither consumer
loses them: a human scanning the table sees the marker, a program reading JSON sees
the array, and someone piping stdout somewhere still sees the problems on the
terminal.

**GVP.** `personal:R2` ("Failures must be surfaced, not swallowed … If data is
discarded, it must be explicit") is the governing rule. `code-common:CP12` ("For each
failure ask — what is the consequence, does the user need to know, can we recover,
should we stop") is the procedure that was run per failure class and that produced
"recover, report, continue" for a bad note and "stop" for a bad root directory.
`personal:V2` (Transparency) is why the detail is included rather than a bare count.

---

## 7. A wrong-typed `title` or `tags` is a reported problem, not a silent coercion

**Chosen.** `title: 42` does not become `"42"`; it is dropped, the filename is used,
and `title_not_a_string` is reported. `tags: intro` (a string where a list is
expected) yields no tags and `tags_not_a_list`. A list with some non-string entries
keeps the strings and reports each bad entry.

**Why.** Coercion would make the report quietly disagree with the file. Skipping the
field silently would hide a typo that is exactly what someone running a report over
their notes wants to find. This is arguably beyond the literal reading of "malformed
frontmatter" in requirement 6, and it is included because silence was the only
alternative.

**GVP.** `personal:R2` ("No silent failures or data loss") and `personal:V5` ("Never
silently discard … user data") together make the silent-skip option unavailable.
`personal:V2` (Transparency) covers reporting the reason with the row.

---

## 8. Three-valued exit code: 0 clean, 1 problems found, 2 run failed

**Chosen.** `0` when every note parsed, `1` when the report is complete but some note
was malformed, `2` when there is no report (bad usage, missing or non-directory
root). Documented in `--help` and the README, including the warning that `set -e` and
`pipefail` callers will abort on `1`.

**Why.** "Report produced but some notes are broken" and "no report" are different
outcomes and a caller should not have to parse text to tell them apart. Collapsing
them into a single non-zero code would lose that; using `0` for both would make the
broken-notes signal invisible to automation.

**GVP.** `personal:P20` ("Prefer machine-consumable forms where easy") and
`personal:P19` ("Favor low-effort, high-information signals … even when it is not
certain they will be immediately useful") are the basis for spending a code on the
distinction. `code-common:CP11` ("API surface is a commitment") is why the codes are
named constants and documented up front rather than left implicit.
`personal:V2` (Transparency — "when corners are cut or trade-offs made, document them
explicitly") is why the `set -e` hazard is stated in the README rather than left for
a user to discover.

---

## 9. Each problem carries a stable `kind` alongside the human `detail`

**Chosen.** `{ kind: "invalid_yaml", detail: "…" }`, with `kind` drawn from a closed
set of snake-case identifiers, present in both the JSON output and the stderr lines.

**Why.** A consumer that wants to count broken notes by cause, or ignore one class of
problem, should not have to match on a message string that may change with the YAML
library's wording.

**GVP.** `personal:P20` ("Prefer machine-consumable forms where easy") and
`code-common:CP3` ("Enums over string literals").

---

## 10. `--tag` is exact, case-sensitive, and may appear at most once

**Chosen.** Exact string membership in the tag list. A second `--tag` is a usage
error, not a last-one-wins. No case-insensitive, prefix, glob or multi-tag form.

**Why.** Requirement 4 asks for one tag filter. Adding OR-semantics for repeated
tags, or case-insensitive matching, would be inventing a filter language with no
stated need, and each variant is a surface that then has to be kept. Rejecting a
repeated `--tag` is the point worth arguing for: `parseArgs` would silently keep the
last value, which means `--tag a --tag b` would report on `b` while the user believes
they asked for both.

**GVP.** `code-common:CH2` ("If a feature is speculative with no concrete use case:
defer entirely with no flex points") is why the filter stayed minimal, and
`code-common:CP11` ("Every public surface … is a commitment. Adding is easy, removing
is expensive") is why no extra spelling was added pre-emptively. Rejecting the repeat
rather than ignoring it follows `personal:R2` (no silent failure).

The case-sensitivity choice itself is **not** GVP-informed — nothing in the library
bears on it. It follows the tags as written, and the limit is listed in the README's
Known limits.

---

## 11. Problems in `--tag`-excluded notes are still reported

**Chosen.** The stderr problem lines cover every scanned note, not only the notes
that survived the filter. The exit code likewise reflects all scanned notes.

**Why.** This is the subtle interaction between requirements 4 and 6. A note with
broken frontmatter frequently has no readable tags *because* it is broken, so the
filter is exactly the path that would hide it — the user asks for `--tag draft`, the
one note whose tags failed to parse is dropped, and they are told nothing.

**GVP.** `personal:R2` ("Failures must be surfaced, not swallowed"). This case is the
clearest place in the tool where the rule changed the design rather than confirming
it.

---

## 12. Skip dot-prefixed entries; do not follow directory symlinks

**Chosen.** Any entry whose name begins with `.` is neither reported nor descended
into. Directory symlinks are not followed. Both documented.

**Why.** A notes directory is usually a git repository, often with `.obsidian/` or
similar; reporting on `.git` internals is noise. One rule about hidden entries covers
the whole class, where a `node_modules`/`.git`/`.obsidian` denylist would need
extending forever. Not following directory symlinks avoids a non-terminating walk and
avoids having to invent a relative path for a file reached from outside the root.

**GVP.** `personal:P4` ("When encountering a specific failure, prefer building a
generic mechanism that handles the class of failures, not just the instance.
Special-case fixes accumulate") is why the rule is "hidden entries" rather than a list
of tool directory names. `code-common:CP12` ("always know what state you are in, and
never wander into an unexpected bad state") is why symlink cycles are excluded by
construction instead of being guarded against after the fact.
`code-common:CP9` is why the prefix is a named constant.

---

## 13. Word count is `wc -w` over the body, with no Markdown stripping

**Chosen.** A word is a run of non-whitespace characters in the text after the
frontmatter block. Markdown syntax counts as written: `# Heading` is two words,
`**bold**` is one, code fences are counted. Stated in the README, both as the
definition and in Known limits.

**Why.** Every "smarter" count requires picking a Markdown dialect and then deciding
whether link text, code blocks, tables and footnotes count — decisions the tool would
be making silently on the user's behalf. The `wc -w` rule is one sentence and a user
can predict it exactly.

**GVP.** `personal:V1` (Simplicity — "Prefer the simplest approach that meets the
requirement. Complexity must earn its place") is the basis for the rule, and
`personal:V2` (Transparency) is why the definition and its consequences are written
down rather than left for someone to infer from a number.

---

## 14. Sort by code unit, not by locale

**Chosen.** Plain `<`/`>` comparison of the relative path rather than
`localeCompare`. Uppercase therefore sorts before lowercase.

**Why.** Requirement 7 says "sort by path" without saying whose collation. Locale-aware
comparison makes the output depend on the machine's environment, which breaks
diffing two reports and makes the test suite's expected order environment-dependent.

**GVP.** `personal:P20` ("Prefer machine-consumable forms where easy") — a byte-stable
report is diffable and pipeable. The trade-off (an ordering that reads slightly oddly
to a human) is recorded in the README.

---

## 15. Paths are relative to the root and always `/`-separated

**Chosen.** Report paths are relative, with backslashes converted to forward slashes.

**Why.** Requirement 3 asks for relative paths. Normalising the separator means the
same tree produces the same report on any host, which matters for the same diffing
reason as the sort order.

**GVP.** `personal:P20`, as above. Nothing in the library speaks to path separators
specifically.

---

## 16. Nothing in the table is truncated

**Chosen.** Columns widen to fit their contents. A long title or a long tag list
makes a wide table; it does not get an ellipsis.

**Why.** Truncation would make the table's contents differ from the notes it
describes, and the widest case is precisely the row someone is looking at the report
to find.

**GVP.** `personal:V5` ("Never silently discard … user data") applied to output
rather than storage. The consequence — wide tables — is listed in the README's Known
limits per `personal:V2` (Transparency), with `--json` named as the fixed-shape
alternative.

---

## 17. Every adjustable value is a named constant in one module

**Chosen.** `src/types.ts` holds the note extension, fence text, hidden-entry prefix,
table headers, separators, gutter, problem marker, JSON indent, exit codes and
problem kinds. No configuration file, no environment variables.

**Why.** These are the values someone adapting the tool would reach for, and having
them in one place means a fork does not have to hunt through the rendering code. A
configuration file was considered and rejected: there is no stated need for one, and
zero-config `noteview <dir>` already works.

**GVP.** `code-common:CP9` ("All magic numbers should be named constants … any value
that might be adjusted") and `code-common:CP5` ("Configuration infrastructure early,
defaults always … But always provide sensible defaults so zero-config works"). The
absence of a config *file* follows `code-common:CH2` — a config file is the
speculative end of the deferral tree, while named constants are the cheap flex point
that keeps it easy to add later.

---

## 18. Test strategy: unit tests, in-process end-to-end, and two real subprocess runs

**Chosen.** 57 tests across four files. Unit tests over the pure parsing, scanning,
rendering and argument-parsing functions; in-process end-to-end tests over
`runNoteview` asserting on stdout, stderr and exit code together; and two tests that
run the documented `npx tsx src/index.ts` invocation as an actual child process.
Fixtures are real files in `test/fixtures/notes/`, including one malformed-YAML, one
unterminated, one list-rooted and one wrong-typed note.

**Why.** The in-process tests are fast and cover the behaviour; they do not prove the
documented invocation boots, since shebang handling, ESM resolution and the `tsx`
loader all sit outside them. Two subprocess tests close that gap cheaply. Real
fixture files rather than in-memory strings mean the malformed-frontmatter path is
exercised through the same code the user hits.

**GVP.** `code-testing:TP1` ("Always write automated tests for code where possible —
both unit tests and end-to-end tests … Code shipped without tests is unverified, not
done") sets the two layers. `personal:P13` ("Green tests are not proof of working
software … Before claiming a change works, exercise it in the production runtime —
boot the app, run the real loader — not only the test suite") is specifically why the
subprocess tests exist; without that element the in-process suite would have looked
sufficient. `code-testing:TP2` (the test as the executable definition of success) is
why each requirement in `TASK.md` has a test naming it.

---

## 19. Comments explain why; a Known limits section states what the tool does not do

**Chosen.** Module and function comments give the reason for the shape, not a
restatement of the code. The README carries an explicit Known limits list (code
blocks counted, no case-insensitive tag match, no truncation, no colour).

**Why.** The non-obvious parts of this tool are all decisions rather than mechanics —
why the whole file is treated as body when the fence is unterminated, why the filter
does not suppress problem lines. Those are the parts worth writing down.

**GVP.** `code-common:CP2` ("Comments explain 'why', not 'what'") and `personal:V2`
("Be honest about trade-offs, limitations … When corners are cut or trade-offs made,
document them explicitly"). `ai-common:C2` ("AI agents reproduce patterns from the
working tree") is a secondary reason the reasoning is in the tree rather than only in
this document.

---

## 20. No placeholder or scaffolded code

**Chosen.** Every code path is implemented. There is no stubbed exporter, no
`TODO`-thrown branch, no partially wired option.

**Why.** Nothing in the task asked for scaffolding, and unimplemented surface in a
finished tool is a trap for whoever picks it up.

**GVP.** `code-common:CR2` ("If scaffolding or placeholder implementations are ever
created, the implementing agent MUST have record of explicit, verbatim, quoted
verification from the user that scaffolding is desired. No exceptions."). No such
verification exists here, so no scaffolding was written — including for the
deliberately deferred config file and colour output, which are absent rather than
stubbed.

---

## Decisions the library did not settle

Recorded for completeness, since the point of the library is to make aligned choices
derivable without asking:

- **Tag matching case-sensitivity** (§10) — no element bears on it. Chosen for
  literalness and documented as a limit.
- **Path separator normalisation** (§15) — `personal:P20` supports determinism in
  general but says nothing about paths.
- **Table cosmetics** — the `!` marker, `-` for empty, two-space gutter, right-aligned
  count. Taste, constrained only by "must stay machine-readable" (`personal:P20`).
- **The `problems` field name** and the specific problem-kind spellings. Taste.

None of these needed a guiding-element patch to resolve: each had one reasonable
answer once the surrounding elements were applied, so all were recorded and carried
out rather than raised, per `personal:H5` ("if the existing guiding elements yield a
single reasonable decision, record it and proceed").
