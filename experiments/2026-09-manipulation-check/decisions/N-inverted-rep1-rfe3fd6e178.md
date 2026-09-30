# Design decisions

One section per choice made while building `noteview`. Each states what was
chosen, why, and whether the project's GVP library informed it (with the
element id relied on).

The library was read in full via `cairn --library ./.gvp/library query --format
compact` before any code was written.

---

## 1. TypeScript on Node, with strictness beyond `strict`

**Chose:** TypeScript (mandated by `TASK.md`), run by `tsx`, with `strict` plus
`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noUnusedLocals`,
`noUnusedParameters`, `verbatimModuleSyntax`. Every exported function has an
explicit signature and every data shape is a named `interface`.

**Why:** The language was given, so the only open choice was how much type
discipline to buy. The stricter flags cost nothing here and caught real cases
during the build (indexed access on `split("\n")[0]`, unused imports).

**Library:** Yes — `code-common:CP7` ("Type hints on all function signatures…
TypeScript over JavaScript. Types add clarity and catch issues at compile/check
time"). `code-common:CP16` also says a language is judged on effort and on hard
requirements such as type checking, which is the same conclusion for a
requirement that was already fixed.

---

## 2. Exactly one runtime dependency: `yaml`

**Chose:** `yaml` is the only runtime dependency. Everything else uses the Node
standard library: `node:util`'s `parseArgs` for flags, a hand-written recursive
walk instead of a glob package, `node:test` + `node:assert` for tests, and a
hand-written table renderer instead of a table package.

**Why:** Two directions from the same heuristic. For arg parsing, walking,
table formatting and testing, the useful portion of a third-party package is
well under 200 lines of behaviour I actually need — so I wrote it. YAML parsing
is the opposite: a correct parser is thousands of lines (anchors, block
scalars, flow collections, tag resolution), I need all of that because
frontmatter is arbitrary YAML, and a hand-rolled subset would *silently
misread* valid files rather than fail loudly. `yaml` is also the parser behind
the `cairn` tool this project is governed by, so its bus factor is already
accepted here.

**Library:** Yes — `code-common:CH1` (dependency adoption threshold, the ~200
line test) for both directions. The reason for not hand-rolling YAML rests on
`personal:R2` ("No silent failures or data loss") and `personal:V5` (never
silently discard user data): a partial parser's failure mode is silent
misreading, which those two forbid.

---

## 3. Six small modules with one job each

**Chose:** `src/config.ts` (constants), `src/frontmatter.ts` (split + field
reading + word count, all pure string functions), `src/scan.ts` (filesystem
walk → records), `src/render.ts` (table/JSON/diagnostic strings),
`src/cli.ts` (args, orchestration, exit code), `src/index.ts` (process
binding, 12 lines).

**Why:** Each requirement in `TASK.md` lands in exactly one file: the
frontmatter rules in `frontmatter.ts`, `--json` in `render.ts`, `--tag` in
`scan.ts`+`cli.ts`. Changing the output format touches one file; changing the
frontmatter rules touches one file. The split follows boundaries that were
already clean (pure string work vs. filesystem work vs. process work) rather
than boundaries invented for the sake of layering.

**Library:** Yes — `code-common:CP1` ("modifications should be contained within
one contiguous block… Will this force future features to be scattered?"), with
`code-common:CP4` (shared logic centralized: `renderTable` is used by the note
table, `toRelativePosixPath` by every path) and `personal:H1` (extract when the
boundary is clean and natural, otherwise wait) as the check against splitting
further.

---

## 4. `run()` returns an exit code and takes its output sinks as parameters

**Chose:** `cli.ts` exports `run(argv, { writeStdout, writeStderr })` returning
a number. `index.ts` is the only code that touches `process.argv`,
`process.stdout` or `process.exitCode`.

**Why:** It makes the entire CLI — flags, error paths, exit codes, both output
streams — testable in-process with no subprocess and no stdout capture hacks,
and it keeps the global-state dependency in one visible place instead of hidden
inside the logic.

**Library:** Yes — `code-common:CP13` ("How something will be tested is a
design input… If an AI agent cannot verify a component with available tools,
that is a design problem to solve up front") and `code-common:CP3` (no hidden
global state; function signatures show all inputs).

---

## 5. A malformed file gets a row, a reported problem, and never stops the run

**Chose:** Every kind of frontmatter breakage produces a row with whatever data
is usable (filename as title, body still counted) plus one or more issue
strings. Nothing throws out of `scanNotes`.

**Why:** Requirement 6 of `TASK.md` demands it, and the library demands the
same thing independently. Concretely: each failure was asked "what is the
consequence, does the user need to know, can we recover, should we stop" — for
a bad file the answers are "one row is degraded", "yes", "yes", "no".

**Library:** Yes — `personal:R2` ("Failures must be surfaced, not swallowed…
If data is discarded, it must be explicit") and `code-common:CP12` (error
handling is neither fail-fast nor graceful-degradation as dogma; know your
state and handle each failure on its merits).

---

## 6. Diagnostics go to stderr; `--json` records also carry `issues`

**Chose:** Problems are written to stderr as `noteview: <path>: <message>`.
stdout carries only the report. In `--json` mode each record additionally has
an `issues` array, so a program never has to read stderr to know which rows are
suspect. Failures to read a path at all stay on stderr only, because the
specified JSON shape is an array of note records.

**Why:** stdout has to stay pipeable (`--json | jq` must not see log lines),
but a machine consumer must still be able to see that a row is degraded. Two
channels, each complete for its audience. The one asymmetry (unreadable paths
are not in the JSON) is a consequence of the requested top-level array, and it
is written down in the README rather than glossed over.

**Library:** Yes — `personal:P20` ("Where it is easy, shape signals and
artifacts so a program can read them") for the `issues` field, and
`personal:V2` (be honest about trade-offs; document the corners that are cut)
for documenting the asymmetry instead of hiding it.

---

## 7. Three exit codes, named and documented

**Chose:** `0` clean, `1` usage/missing directory, `2` report produced but some
files had problems. Defined once in `config.ts` as `EXIT_CODE`, printed in
`--help`, tabulated in the README, asserted in tests.

**Why:** "Reported, not skipped silently" is much stronger if a script can
detect it without parsing text. Separating `1` (you called it wrong, no report
exists) from `2` (the report is real but partly degraded) is the distinction a
caller actually needs.

**Library:** Yes — `personal:P20` (machine-consumable signals),
`personal:P19` ("Implement low-effort, high-information signals wherever
possible"), and `code-common:CP9` (named constants for everything
configurable — no bare `process.exit(2)` literals).

---

## 8. `--tag` filters the rows shown, never the problems reported

**Chose:** With `--tag`, the table or JSON contains only matching notes, but
diagnostics still cover every file scanned, and the exit code still reflects
them.

**Why:** A filter expresses what you want to look at; it is not a statement
that the rest of the tree is fine. Suppressing a malformed file's report
because it lacks the requested tag would make the tool quietly less honest the
more narrowly you query it.

**Library:** Yes — `personal:R2` (failures must be surfaced). This was the
single decision where two readings competed ("show only what was asked" vs.
"never hide a failure"); R2 is a rule, so it wins over interface tidiness.

---

## 9. `tags: project` (a string, not a list) is reported, not coerced

**Chose:** Non-list `tags` yields no tags plus an issue naming the fix
(`tags: [a, b]`). A non-string entry inside a list is dropped with an issue
while the valid entries are kept. Duplicate tags are preserved, not deduped.

**Why:** The type of `tags` is part of the file format the tool advertises.
Silently converting a scalar into a one-element list would make `--tag`
matching depend on a conversion rule that was never promised, and the user
would never learn their file is wrong. Reporting it keeps the data visible
(nothing is lost — the file is untouched and the problem is named) while
keeping the matching semantics exactly what the format says.

**Library:** Yes — `code-common:CP3` ("Explicit over implicit… no hidden state
or global magic") is the deciding element, with `personal:V5` satisfied by
reporting rather than by guessing: V5 forbids *silent* discarding, and this is
the opposite of silent. Recorded here because a reasonable implementer could
have coerced; the library's preference for explicitness is why I did not.

---

## 10. A non-string `title` falls back to the filename, and says so

**Chose:** `title: 42` is treated as no usable title — the filename is shown —
and the substitution is reported.

**Why:** `TASK.md` already specifies the filename fallback for an absent title;
an unusable title is the same situation. The report is what keeps the fallback
from being a silent lie about the file's contents.

**Library:** Yes — `personal:V2` (document what was substituted) and
`personal:R2` (no silent substitution of user data).

---

## 11. "Word" is defined explicitly and narrowly

**Chose:** A word is a whitespace-delimited token containing at least one
letter or digit (`WORD_PATTERN = /[\p{L}\p{N}]/u`). So `don't`, `v1.2` and
`co-operative` count once each; bare `#`, `-`, `|`, `>` do not count at all.
Markdown is not otherwise interpreted — link URLs and code blocks count as the
prose they sit in. All of this is in the README.

**Why:** "Word count" has no single correct definition, so the useful property
is that the definition is stated, stable, and explainable — not that it is
clever. Counting every whitespace token would make a table of bullets look
word-rich; a real Markdown parse would add a dependency and a lot of judgement
calls for a summary column.

**Library:** Yes — `personal:V2` ("Be honest about trade-offs, limitations…
When corners are cut or trade-offs made, document them explicitly") for writing
the definition and its limits down, `personal:V1` (simplest approach that meets
the requirement) for not parsing Markdown, and `code-common:CP9` for making the
rule a named constant rather than an inline regex.

---

## 12. Table: pad, never truncate; the `!` column appears only when needed

**Chose:** Columns are padded to their widest cell with no truncation and no
box drawing. `WORDS` is right-aligned. A trailing `!` column marking rows with
problems is added only when at least one shown row has a problem.

**Why:** Truncating a long path or title to keep the table narrow would hide
the very data the report exists to show. The conditional marker column means a
clean run has no always-empty column, while a run with problems makes the bad
rows findable in the table itself instead of only in the stderr stream.

**Library:** Yes — `personal:V5` (do not discard user data — truncation
discards it at the point of presentation) and `personal:R2` (a problem must be
visible where the user is looking). `personal:V1` covers the plain padded
layout over a drawn grid.

---

## 13. Deterministic, platform-independent output ordering and paths

**Chose:** Sort by code unit (`<`/`>` comparison), not `localeCompare`. Report
paths relative to the scanned root with `/` separators on every platform.

**Why:** Requirement 7 says sort by path; the open question was *which* order.
A locale-sensitive sort makes output depend on the machine's environment, which
breaks diffing two reports and makes byte-exact assertions unreliable. Relative
`/`-separated paths mean the report can be compared across machines and
checkouts.

**Library:** Yes — `code-common:CP13` (testability as a design input — exact
output assertions are only possible if output is deterministic) and
`personal:P20` (a stable form is one a program can consume).

---

## 14. Constants module as the flex point; no config file, no speculative flags

**Chose:** Every tunable (note extension, delimiter, skipped directory names,
word pattern, separators, JSON indent, exit codes) lives in `src/config.ts`
with a sensible default. No config file, no `--ext`, no `--sort`, no
`--no-skip-git`.

**Why:** Hard-coding these values inline would be the expensive mistake,
because magic constants are what make later configuration painful. But an
actual config layer — file loading, precedence, validation — is complexity with
no concrete use case yet; the CLI surface it would add is also permanent.
Naming the constants gets most of the benefit at none of the cost, and if a
flag is ever wanted, it is a one-line read from `config.ts`.

**Library:** Yes — `code-common:CP5` ("Wire up configuration from the start
rather than hardcoding… But always provide sensible defaults so zero-config
works") pulled toward configurability; `code-common:CH2` (deferral decision
tree: additive feature with unknown access patterns → add flex points without
implementing the feature) and `code-common:CP11` ("API surface is a
commitment") set where to stop. `personal:P1` ("Design around flex points…
but do not implement the change early") is the same shape.

---

## 15. Symlinks are followed; cycles are broken by ancestor, not by memory

**Chose:** Symlinks are resolved with `stat`, so a symlinked `.md` file is read
and a symlinked directory is walked. A branch stops when a directory is its own
ancestor (the cycle case). A directory reachable by two distinct paths is
reported under both. A broken symlink named `*.md` is reported as a problem.

**Why:** This one was found by running the tool, not by reasoning. `readdir`
reports a symlink as neither file nor directory, so the first implementation
dropped symlinked notes and whole symlinked directories *without a word* — and
my README had already claimed otherwise. That is exactly the silent data loss
the library forbids, so the code was fixed rather than the documentation. The
first fix used a global "visited real paths" set, which deduplicates — but that
made *which* path a note is reported under depend on the order the filesystem
returns entries. Ancestor-only tracking still guarantees termination while
keeping the output order-independent.

**Library:** Yes — `personal:R2` ("No silent failures or data loss") is why
symlinks are followed at all; `personal:P2` ("Empirical validation before
commitment… Protocols are tested by running them, not by reasoning about
them") and `personal:P13` (verify in the production runtime) are why the bug
was found; `personal:R1` ("Never claim a change is correct without
verification") is why the false README claim was not allowed to stand.

---

## 16. Unterminated frontmatter keeps the remaining text as body

**Chose:** A file that opens `---` and never closes it is reported, no fields
are read, and everything after the opening line is still counted as body.

**Why:** The opening delimiter is certainly not prose, but the rest of the file
is of unknown status — and dropping it would understate the word count of a
file the user can still see content in. Keeping it overstates at worst, and the
row is flagged either way.

**Library:** Yes — `personal:V5` (never silently discard user data) chose
"keep and flag" over "drop".

---

## 17. `.git` and `node_modules` are skipped by name

**Chose:** Those two directory names are not walked. The list is a named
constant.

**Why:** Both hold machine-generated or VCS-internal files that are never the
user's notes; walking `node_modules` in particular can dwarf the actual tree.
It is a default rather than a law: the list is one constant in `config.ts`.

**Library:** Partly — `personal:V1` (simplest thing that serves the real use)
and `code-common:CP9` (named constant, not an inline literal). No element
speaks to this directly; it is the kind of low-stakes choice
`personal:H2` (the delegation test) explicitly leaves to the implementer.

---

## 18. Tests: pure-unit, in-process CLI, and a real subprocess

**Chose:** 58 tests in five files — `frontmatter.test.ts` (pure rules),
`scan.test.ts` (filesystem behaviour, including a permission-denied file, a
symlink cycle and a broken link built in a temp dir), `render.test.ts`
(byte-exact output), `cli.test.ts` (every flag and every error path via
`run()`), and `cli.e2e.test.ts` which runs the documented command
`npx tsx src/index.ts …` as an actual subprocess and asserts on its real
stdout, stderr and exit code. `tests/fixtures/notes/` deliberately contains
broken files; `tests/fixtures/clean/` exists so "exits 0 and says nothing" is
also provable. `npm run check` = typecheck + tests.

**Why:** The unit tests pin the rules, but a green harness is not evidence that
the shipped entry point boots under the real loader — ESM resolution and
`tsx`'s own behaviour are exactly the sort of thing a harness can mask. The
subprocess test is the only one that proves the command in the README works.

**Library:** Yes — `code-testing:TP1` ("both unit tests and end-to-end tests…
Code shipped without tests is unverified, not done"), `code-testing:TP2` (the
test is the executable definition of success — the error-path fixtures are the
definition of requirement 6), and `personal:P13` ("Green tests are not proof of
working software… exercise it in the production runtime") for the subprocess
layer specifically.

---

## 19. One command with flags; no subcommands

**Chose:** `noteview <dir> [--tag <name>] [--json] [-h|--help]`. No
`noteview list` / `noteview json` / `noteview tags` split.

**Why:** There is one task — summarize a directory — with two modifiers.
Subcommands would raise the number of help lookups needed to do that one task
without adding any capability.

**Library:** Yes — `personal:P8` ("Prefer fewer entry points with options over
many slightly-different entry points") and `personal:H7` (consolidation is
bounded in both directions — measured by how many times someone consults help
to do one task).

---

## 20. No stubs, no placeholders, no unrequested features

**Chose:** Everything present is implemented and tested. Nothing was added
beyond `TASK.md` except what the library's own rules require (diagnostics,
exit codes, `issues` in JSON, `--help`). No CSV exporter, no watch mode, no
plugin seam, no `--ext`.

**Why:** Unrequested surface is permanent cost, and a placeholder that looks
implemented is worse than an absent feature.

**Library:** Yes — `code-common:CR2` ("If scaffolding or placeholder
implementations are ever created, the implementing agent MUST have record of
explicit, verbatim, quoted verification from the user… LLMs tend to implement
scaffolding where it is not wanted") — there is no such record here, so there
is no scaffolding. `code-common:CH2` (speculative with no concrete use case →
defer entirely, no flex points) covers the absent features.

---

## 21. README documents the failure modes as a table, plus MIT license

**Chose:** The README states the frontmatter rules, every failure mode and its
exact behaviour, the exit codes, the word-count definition and the known
limits. An MIT `LICENSE` file is included.

**Why:** The behaviour that is hardest to discover from the code is exactly the
degraded-input behaviour, which is also what requirement 6 is about — so it is
the part that most needs writing down. Listing the limits (in-memory reads, no
Markdown parse) in the same document as the features keeps the honest and the
flattering parts in one place.

**Library:** Yes — `personal:V2` (honest about limitations; document cut
corners explicitly) for the limits section, `personal:P11` /
`ai-common:P3` (externalize decisions and context into durable artifacts read
at the point of use) for documenting rather than leaving it in-head, and
`personal:V8` ("Contribution over ownership… resolves in favour of publishing
over withholding, permissive over restrictive") for the permissive license.

---

## 22. Naming: `noteview` kept as given; identifiers are long and literal

**Chose:** The tool name was not revisited. Internal names describe the thing
(`collectNoteFilePaths`, `ancestorRealPaths`, `SKIPPED_DIRECTORY_NAMES`,
`EntryKind.Unresolvable`) rather than abbreviating.

**Why:** The name was specified and is plainly descriptive, which is the right
outcome for a tool of this reach; spending deliberation on it would be waste.
Internally, the code will be read more often than written.

**Library:** Yes — `personal:H9` ("Spend effort on a name in proportion to how
many people will encounter it… a plainly descriptive name is the right outcome
there") for the tool name, and `code-common:CP2` ("Descriptive names, even if
long") plus `code-common:CP8` (names describe purpose, not lineage) for the
identifiers. `code-common:CP3`'s "enums over string literals" is why
`EntryKind` and `ColumnAlignment` are const objects with union types rather
than bare strings.

---

## Elements considered and judged not applicable

Listed for transparency (`personal:V2`), since their absence is a choice too:

- `code-common:CP15` (swappable persistence behind an abstraction) — the tool
  has no durable storage; there is nothing to keep swappable.
- `code-web:*` and `code-realtime:*` — no DOM, no network, no peers.
- `code-common:CP14` (equal affordances across plugin sources) — there is no
  plugin system, and none was added speculatively (`code-common:CH2`).
- `code-common:CP10` (prefer hooks/CI/validators over convention) — partially
  honoured: `npm run check` and strict `tsc` are the mechanical gates. No
  pre-commit hook or CI config was added because this project is not a git
  repository and no CI system was specified; adding a hook to nothing would be
  the kind of gate `personal:P18` warns about.
- `code-common:CR1` (secrets out of source control) — no secrets exist.

## On review

Per `personal:H5`, every decision above followed from the existing library
without a genuine fork, so none was escalated as a blocker. The one place two
elements pulled against each other (§8, `--tag` versus problem reporting) was
resolved by rule precedence, not by taste: `personal:R2` is a rule, and the
competing consideration was interface tidiness. Per `personal:P15`, if any of
these choices reads as wrong, the thing worth changing is the guiding element
that produced it, not this decision.
