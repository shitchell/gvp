# Design decisions

One section per choice made while building `noteview`. Each states what was
chosen, why, and which element of `./.gvp/library` (if any) decided it.

Element ids are as `cairn --library ./.gvp/library inspect <id>` reports them.

---

## 1. TypeScript with a strict compiler configuration

**Chosen.** TypeScript on Node with `strict`, plus `noUncheckedIndexedAccess`,
`exactOptionalPropertyTypes`, `noImplicitOverride`,
`noFallthroughCasesInSwitch`, and `verbatimModuleSyntax`. Every exported
function has an explicit signature, and all data shapes are declared
interfaces in `src/types.ts`.

**Why.** The task fixed the language; the strictness level was mine to pick.
The extra flags are what caught the real edge cases (`lines[0]` is
`string | undefined`, so the "empty file" branch had to be written rather than
assumed).

**Library.** `code-common:CP7` ("Strict typing") — type hints on all function
signatures, models for data structures, "types add clarity and catch issues at
compile/check time". `code-common:CP3` ("Explicit over implicit") for explicit
signatures over inferred ones.

---

## 2. One module per concern, with the pipeline wired in `cli.ts`

**Chosen.** `constants.ts`, `types.ts`, `errors.ts`, `frontmatter.ts`,
`scan.ts`, `notes.ts`, `render.ts`, `cli.ts`, `index.ts`. Each stage of the
pipeline (find → read → parse → filter → render) is one file, and each file's
public functions are the stage's natural seams.

**Why.** The split is along boundaries that were already clean before I wrote
the code — "find files" and "parse frontmatter" do not bleed into each other —
so extracting them cost nothing and made each testable in isolation. I stopped
there rather than adding interfaces or a plugin layer.

**Library.** `personal:H1` ("Extraction timing") — extract now when the
boundary is clean and natural, wait when it is unclear. `code-common:CP1` ("One
contiguous block") — changing how tags are read touches only
`frontmatter.ts:extractTags`, not pieces scattered across the tree.
`personal:V1` ("Simplicity") bounded it: no abstraction that does not solve a
present problem.

---

## 3. `run(argv, streams)` holds all behaviour; `index.ts` is three lines of wiring

**Chosen.** The whole program is a function of its argument list and two output
sinks (`writeOut`, `writeErr`). `src/index.ts` binds it to `process.argv` and
`process.stdout`/`process.stderr` and sets `process.exitCode`. Nothing else in
`src/` touches `process`.

**Why.** This is what makes a full run assertable in a unit test — the CLI
tests drive complete invocations and read back every byte, including exit
codes, without spawning a process or monkey-patching globals.

**Library.** `code-common:CP13` ("Testability is a design constraint") — how
something will be tested is a design input, not an afterthought.
`code-common:CP3` ("Explicit over implicit") — "no hidden state or global
magic"; the output sinks are declared parameters.

---

## 4. Depend on the `yaml` package rather than hand-rolling a parser

**Chosen.** `yaml@^2` as the single runtime dependency.

**Why.** The library's dependency heuristic asks what a correct in-house
version would cost. A frontmatter parser that handled only `title: x` and a
dash-list would be well under 200 lines — but it would *silently mis-read*
valid YAML (quoted scalars, flow maps, anchors, multi-line strings, `>`/`|`
blocks), which is exactly the silent-wrong-answer failure the library forbids.
A correct YAML parser is thousands of lines, so the threshold resolves in
favour of adopting. The dependency is also narrow: one `parse` call, one
well-maintained package, and it stays behind `src/frontmatter.ts`, so swapping
it means editing one file.

**Library.** `code-common:CH1` ("Dependency adoption threshold") — applied and
resolved toward adoption, not against it. `personal:R2` ("No silent failures or
data loss") is what ruled out the cheap hand-rolled version.

---

## 5. Argument parsing with `node:util`'s `parseArgs`, not a CLI framework

**Chosen.** Node's built-in `parseArgs` in `strict` mode, wrapped in
`parseArgv` which converts its result (and its thrown errors) into a
three-case discriminated union: options, help, or error.

**Why.** Three flags do not justify a framework, and the built-in already
handles `--tag=x`, `-h`, and `--`. Same heuristic as decision 4, resolving the
other way because here the built-in is genuinely sufficient.

**Library.** `code-common:CH1` ("Dependency adoption threshold").

---

## 6. Per-file problems are returned as data, never thrown

**Chosen.** Every parsing function returns `{ value, problems }`. A file's
problems accumulate into `NoteRecord.problems`. Nothing in the parse path
throws, so requirement 6 ("must not stop the run") is structural rather than a
`try`/`catch` someone has to remember.

**Why.** If a bad file could throw, "does not stop the run" depends on every
caller wrapping it. Making problems part of the return type means the type
checker carries the requirement.

**Library.** `personal:R2` ("No silent failures or data loss") — failures must
be surfaced, not swallowed. `code-common:CP12` ("Be aware of state; don't
wander into bad states") — per-failure handling with a clear message, rather
than a blanket fail-fast or swallow-everything strategy. `personal:P7` ("Every
process needs a concrete enforcement mechanism") — the mechanism here is the
return type.

---

## 7. `PROBLEMS` is a permanent column, not one that appears when needed

**Chosen.** The table always has five columns. A clean file shows `-`.

**Why.** A column that materialises only on bad runs changes the output shape
under the reader — and under any script that split on columns.

**Library.** `code-common:CP3` ("Explicit over implicit"). Also
`code-common:CP11` ("API surface is a commitment") — the column layout is part
of the surface, so it should be stable.

---

## 8. Three exit codes: 0 clean, 1 could not start, 2 ran with problems

**Chosen.** `EXIT_OK=0`, `EXIT_USAGE=1`, `EXIT_FILE_PROBLEMS=2`, documented in
`--help` and the README.

**Why.** "Report the problem" should be detectable without parsing output, and
"nothing ran" is a different situation from "ran, with caveats" — collapsing
them into one non-zero code would lose that. Requirement 6 says a malformed
file must be reported; an exit code is the report a caller can act on.

**Library.** `personal:P20` ("Prefer machine-consumable forms where easy") —
shape signals so a program can read them. `personal:R2` ("No silent failures").
`personal:P19` ("Favor low-effort, high-information signals") — a distinct code
costs one constant.

---

## 9. Report on stdout, diagnostics on stderr — always

**Chosen.** The table or JSON array is the only thing written to stdout.
Summary lines and path-level problems go to stderr.

**Why.** `noteview notes --json | jq` must keep working on a directory with a
malformed file. Mixing a warning into stdout would break the parse.

**Library.** `personal:P20` ("Prefer machine-consumable forms where easy").

---

## 10. A problem file removed by `--tag` is still reported, on stderr

**Chosen.** `--tag` keeps stdout to exactly the files carrying that tag. Files
with problems that the filter excluded get their problem detail printed to
stderr and still set exit code 2.

**Why.** This was the one genuine conflict between requirements: requirement 4
says `--tag` restricts output, requirement 6 says a malformed file must be
reported — and for a file whose frontmatter did not parse, we cannot know
whether it carried the tag, so the filter's answer for it is not trustworthy.
Forcing such rows into stdout would break the `--tag` contract; dropping them
silently would break requirement 6. Routing them to stderr honours both, and
the exit code makes them impossible to miss.

**Library.** `personal:R2` ("No silent failures or data loss") — "if data is
discarded, it must be explicit". `personal:V2` ("Transparency") — document the
corner rather than present a clean facade; the README says exactly this.
`code-common:CP3` for keeping `--tag`'s stdout meaning unambiguous. See also
section 21 — the library did not settle this on its own.

---

## 11. `--json` carries the whole frontmatter mapping, not just the reported fields

**Chosen.** Each JSON element has `path`, `title`, `tags`, `words`, `problems`
— and `frontmatter`, the complete parsed mapping including keys `noteview` does
not understand (`status`, `author`, whatever the vault uses).

**Why.** This is the difference between a tool you can pipe into `jq` to answer
your own question and one you have to modify. It cost one field.

**Library.** `personal:V5` ("Data preservation") — "Unknown fields are
preserved, not filtered". `code-realtime:RTR2` ("Never drop unknown fields in
sync protocols") — "The schema is a lens for reading data, not a filter for
storing it"; stated for sync protocols, but the reasoning is the same lens/
filter distinction. `personal:P20` for making the extra data machine-readable.

---

## 12. Word count = runs of non-whitespace in the body, with no Markdown stripping

**Chosen.** `body.trim().split(/\s+/u).length`, frontmatter excluded.
`**bold**` is one word; a URL is one word; fenced code blocks are counted. The
README says so explicitly and lists it under known limitations.

**Why.** Every "smarter" rule needs a Markdown parser and still guesses (does a
code block count? a table? an image alt text?). The simple rule is explainable
in one sentence and never surprises twice. What makes that acceptable is saying
so rather than implying a prose count.

**Library.** `personal:V1` ("Simplicity") — the simplest approach that meets
the requirement; complexity must earn its place. `personal:V2`
("Transparency") — "When corners are cut or trade-offs made, document them
explicitly"; this is the corner and the README documents it.

---

## 13. An unclosed frontmatter block counts as body text

**Chosen.** `---` on line 1 with no second `---` is reported as a problem, and
the whole file — fence line included — is counted as body.

**Why.** The alternatives were to count nothing (losing the file's text from
the total) or to guess where the block ends. Treating unparsed text as text
keeps the number honest, and the problem message says why the number looks odd.

**Library.** `personal:V5` ("Data preservation") — never silently discard or
strand data. `personal:R2` ("No silent failures").

---

## 14. Frontmatter is recognised only on the first line

**Chosen.** A block opens only if the very first line of the file (after an
optional byte-order mark) is exactly `---`. A `---` further down is a
horizontal rule. Trailing whitespace on a fence line is tolerated; CRLF and a
BOM are tolerated.

**Why.** Scanning for the first `---` anywhere would turn every note with a
horizontal rule into a file with bogus frontmatter. The tolerances are for real
files written by real editors, and each has a test.

**Library.** `code-common:CP3` ("Explicit over implicit") — a single
unambiguous rule instead of a heuristic search. `personal:P2` ("Empirical
validation before commitment") in spirit: the fixture tree contains a
horizontal-rule note precisely so the rule is tested, not assumed.

---

## 15. Unusable `title`/`tags` values are reported, never silently coerced

**Chosen.** `title: 5` falls back to the filename *and* emits a problem. A
`tags` mapping emits a problem and yields no tags. A non-string entry inside
`tags` is reported by position while the valid siblings are kept. The one
leniency: a bare scalar `tags: inbox` is accepted as a one-tag list without
complaint, because that spelling is a widespread convention and rejecting it
would flag files every other note tool accepts.

**Why.** Silent coercion is how a user ends up believing a filter works when it
does not. Reporting costs a string. The scalar-tags leniency is the one place I
chose acceptance over strictness, and it is stated in the README so it is not a
hidden behaviour.

**Library.** `personal:R2` ("No silent failures or data loss") and
`personal:V2` ("Transparency") for the reporting. `personal:H2` ("Delegation
test") for the leniency: the outcome constraint ("a user with conventional
frontmatter is not nagged; anything ambiguous is reported") was what mattered,
and the exact form was mine to pick. See also section 21.

---

## 16. `--tag` matches exactly, once, case-sensitively

**Chosen.** Exact string equality, case-sensitive. Passing `--tag` twice is a
usage error, not a silent last-wins and not a guessed AND/OR.

**Why.** Case-insensitive or fuzzy matching is a behaviour you cannot take back
once scripts depend on it, and "which tag wins" is not something to decide on
the user's behalf. A rejected duplicate leaves the door open to define
multi-tag semantics later as an additive change.

**Library.** `code-common:CP11` ("API surface is a commitment") — prefer
additive changes over changed defaults; do not commit to semantics you have not
chosen. `code-common:CH2` ("Deferral decision tree") — multi-tag filtering is
speculative with no concrete use case, so defer it entirely.
`personal:R2` — a silently dropped second `--tag` would be discarded input.

---

## 17. One command with flags; no subcommands, no config file, no extra formats

**Chosen.** `noteview <dir> [--tag <name>] [--json]`. No `noteview table` /
`noteview json` split, no `--format`, no CSV or SQLite exporter, no config
file, no `--version`.

**Why.** Two output shapes do not justify a mode argument or sibling
subcommands, and everything else on that list is a feature nobody asked for.
Tunables that *might* move (the extension set, separators, the
"no notes found" text) are named constants in one file, which is the cheap flex
point without the feature.

**Library.** `personal:P8` ("Consolidated interfaces over many near-duplicate
entry points") and `personal:H7` ("Interface consolidation is bounded in both
directions") — one `--help` read covers the whole tool.
`code-common:CH2` ("Deferral decision tree") — speculative features get
deferred entirely; additive ones get flex points, not implementations.
`code-common:CP5` ("Configuration infrastructure early, defaults always") and
`code-common:CP9` ("Named constants for everything configurable") for
`src/constants.ts`. `personal:P1` ("Design around flex points") — shape for the
plausible change without building it.

---

## 18. Directory symlinks are not followed; file symlinks are

**Chosen.** The walk recurses into real directories only. A symlink whose
target is a file is included (after a `stat`); a dangling one is reported as a
path problem. An unreadable directory is reported and the walk continues
elsewhere.

**Why.** Following directory symlinks means a `loop -> .` in a vault hangs the
tool. Skipping symlinked *files* would drop notes people deliberately linked
in. The split gives a known, terminating traversal.

**Library.** `code-common:CP12` ("Be aware of state; don't wander into bad
states") — this is the literal case: an infinite walk is the bad state.
`personal:R2` for reporting the unreadable paths instead of dropping them.

---

## 19. Deterministic, platform-independent output

**Chosen.** Paths are always relative to `<dir>` with `/` separators, and sort
byte-wise (`<`/`>`) rather than by locale collation. JSON keys are emitted in a
fixed order. Table rows carry no trailing whitespace. The JSON writer survives
frontmatter that refers back to itself (YAML anchors) by substituting
`"[circular reference]"` instead of throwing.

**Why.** Identical input should give byte-identical output on any machine, so
the output can be diffed, cached, or snapshot-tested. The circular-reference
guard is there because one exotic file should not kill a whole run.

**Library.** `personal:P20` ("Prefer machine-consumable forms where easy").
`code-common:CP12` ("don't wander into bad states") for the circular guard.

---

## 20. Tests: unit coverage per module plus end-to-end runs of the real command

**Chosen.** 79 tests across six files. Unit tests cover every branch of
frontmatter handling, word counting, the scanner (including a real symlink
cycle and a dangling symlink in temp dirs), both renderers, and argument
parsing. CLI tests drive `run()` over a committed fixture tree. A separate
`tests/e2e.test.ts` spawns `tsx src/index.ts` as a child process and asserts
stdout, stderr, and exit status. `npm run typecheck` is `tsc --noEmit`.

**Why.** The unit tests pin behaviour; the end-to-end tests are the only thing
that proves the shipped entry point works — argv slicing, ESM resolution under
`tsx`, and the exit code are all invisible to an in-harness test. The fixture
tree deliberately contains the awkward cases (malformed YAML, unclosed fence,
horizontal rule, scalar tags, a non-`.md` file) so requirement 6 is verified by
a real file rather than a string literal.

**Library.** `code-testing:TP1` ("Tests for all code, unit and end-to-end") —
explicitly both. `code-testing:TP2` ("Design every feature with testing in
mind") — the injected output streams in decision 3 exist for this.
`personal:P13` ("Verify in the production runtime, not just the test harness")
— the reason `tests/e2e.test.ts` spawns a process. `personal:R1` ("Verify
before claiming correctness") — typecheck and tests both pass, and the tool was
also run by hand against the fixtures.

---

## 21. Where the library did not settle it — guiding-element patches to consider

Three choices above did not follow unambiguously from the library. Per
`personal:H5` ("Disambiguate-then-surface gate"), they are recorded here as
guiding-element patches rather than left as bare decisions, since a library
patch is what would make the choice automatic next time.

- **Non-zero exit for "completed, with problems" (decision 8).**
  `personal:R2` requires surfacing the failure but does not say the process
  status is part of the surface, and nothing in the library ranks exit codes.
  *Candidate patch:* a `code-common` rule — "a CLI's exit status distinguishes
  did-not-run from ran-with-problems; a run that reported a problem never exits
  0". Recommended: it makes `personal:P20` concrete for command-line tools,
  where it currently only implies output formats.

- **Leniency for conventional-but-off-spec input (decision 15,
  `tags: inbox`).** `personal:R2` and `personal:V2` argue for reporting
  everything unexpected; `personal:C2` ("People optimize for minimal effort")
  and `personal:V1` argue against nagging users about a spelling the ecosystem
  treats as normal. The library does not adjudicate.
  *Candidate patch:* a heuristic — "accept an input form that a clear majority
  of the ecosystem already treats as valid, and document the acceptance; report
  anything whose intent is genuinely ambiguous". Recommended, because without
  it this call gets re-litigated per input field.

- **Filtered-out problem files (decision 10).** The requirement conflict is
  real and the library gives no rule for "a diagnostic whose row the user asked
  not to see".
  *Candidate patch:* a rule — "a filter narrows what is reported, never what is
  diagnosed: diagnostics for excluded items go to the diagnostic channel".
  Recommended: it generalises past this tool to any filtered report.

---

## 22. Smaller choices

- **`describeError` centralised in `src/errors.ts`.** Four modules had grown
  the same three-line "turn a thrown value into a string" helper, so it was
  extracted into one function that also strips the `yaml` parser's multi-line
  code frame (which would otherwise wreck table rows). *Library:*
  `code-common:CP4` ("Centralize shared logic"), `personal:V3`
  ("Composability and DRY").
- **`formatTable` is generic over headers/rows/alignments** rather than
  hardcoding the five note columns, because that made it independently
  testable and reusable at no extra cost. *Library:* `code-common:CP6`
  ("Proactive reusability").
- **An MIT `LICENSE` is included.** *Library:* `personal:V8` ("Contribution
  over ownership") — resolves toward permissive over restrictive, and secrecy
  has to earn its place.
- **Comments say why, not what**, and each non-obvious guard cites the element
  that motivated it, so the next reader (human or agent) sees the reasoning at
  the point of use. *Library:* `code-common:CP2` ("Clarity over cleverness"),
  `ai-common:P3` ("Deliver context at the point of use"), `personal:P11`
  ("AI-first development").
- **`vitest` pinned to `^5` rather than `^2`.** The `^2` line pulls in `vite`
  and `esbuild` versions with open advisories; `^5` audits clean
  (`npm audit`: 0 vulnerabilities). *Library:* nothing in the library bore on
  this — `code-common:CH1` covers whether to adopt a dependency, not which
  version, and `code-common:CR1` is about secrets. Chosen simply because a
  clean audit was available for free.
- **`src/index.ts` carries the executable bit; no other source file does**,
  since it is the only one meant to be executed. *Library:* nothing in
  `./.gvp/library` covers this; it follows the convention stated in the
  operator's own instructions.
