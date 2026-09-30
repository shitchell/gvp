# Design decisions

One section per choice. Each states what was chosen, why, and which element of
the project's GVP library informed it — or that none did.

The library was read before any code was written, via
`cairn --library ./.gvp/library query --format compact` and `inspect` on the
elements cited below. It holds six documents: `personal`, `code-common`,
`ai-common`, `code-testing`, `code-web`, and `code-realtime`. `code-web`
(browser/DOM security) and `code-realtime` (game loops, host-authoritative
sync) were read and found out of domain for a local read-only CLI — the one
element with a general reading, `code-web:WP2` ("Validate all external input at
trust boundaries"), is cited in §7 and §21 where it bears on frontmatter
handling. `ai-common` governs how agents are run rather than how this tool is
built, so nothing in it decided a choice here.

---

## 1. Strict TypeScript, run directly through `tsx`, no build step

**Chosen.** `tsconfig.json` with `strict`, plus `noUncheckedIndexedAccess`,
`exactOptionalPropertyTypes`, `noImplicitOverride`,
`noFallthroughCasesInSwitch`, and `verbatimModuleSyntax`. No emit: `tsx` runs
the `.ts` sources, and `.ts` import specifiers are used directly
(`allowImportingTsExtensions`). Explicit types on every exported signature; no
`any` anywhere.

**Why.** The task fixes the language; what was open was how strict and whether
to add a compile step. A compile step would buy nothing here — the documented
invocation is `npx tsx src/index.ts`, so an emitted `dist/` would be a second
artifact that can drift from the one people actually run. Maximum strictness is
free at this size and catches the class of bug this tool is most exposed to
(untrusted, possibly absent frontmatter fields).

**GVP.** `code-common:CP7` ("Strict typing" — "Type hints on all function
signatures... TypeScript over JavaScript. Types add clarity and catch issues at
compile/check time"). The no-build-step half follows `personal:V1`
(Simplicity — "Fewer things to parse, fewer assumptions to understand, fewer
moving parts").

---

## 2. Parse YAML with the `yaml` package rather than hand-rolling a subset

**Chosen.** One runtime dependency: `yaml` (v2). Frontmatter goes through
`parse()`.

**Why.** Requirement 6 makes malformed-frontmatter *detection* a first-class
feature, and a hand-rolled `key: value` splitter cannot detect malformation —
it would happily accept `tags: [work, unclosed` as a string and silently
mis-report it. So the naive path is not merely less capable, it actively
violates the reporting requirement. A real parser also gives a usable error
message to put in the report.

**GVP.** `code-common:CP16` ("Language selection is an effort decision, not a
capability one" — effort is "driven chiefly by standard library and
ecosystem"): the same reasoning applies to a library choice inside a language.
Reinforced by `personal:R2` (No silent failures or data loss), which is what a
hand-rolled parser would have breached.

---

## 3. Argument parsing with `node:util`'s `parseArgs`, not `commander`/`yargs`

**Chosen.** Node's built-in `parseArgs` in `strict` mode with
`allowPositionals`.

**Why.** Three flags and one positional. `parseArgs` covers that exactly, in
stdlib, with unknown-flag rejection included — so the dependency count stays at
one. A CLI framework would be a second dependency earning nothing.

**GVP.** `personal:V1` (Simplicity — "Complexity must earn its place — every
abstraction, indirection, or generalization should solve a real problem, not a
hypothetical one").

---

## 4. One command with flags; no subcommands

**Chosen.** `noteview <dir> [--tag <name>] [--json] [--words <mode>]`. Not
`noteview table` / `noteview json` / `noteview filter`.

**Why.** Every invocation does the same thing — summarize a tree — and the
flags select a view of one result. Splitting output format into subcommands
would make the user consult help twice to do one task.

**GVP.** `personal:P8` ("Consolidated interfaces over many
near-duplicate entry points" — "Three commands with flags beat twenty
near-duplicate subcommands") and `personal:H7` ("Interface consolidation is
bounded in both directions" — weigh it "by how many times someone must consult
help output to accomplish one task").

---

## 5. One generic `problems` channel per file, not a failure mode per error type

**Chosen.** Every `NoteRecord` carries `problems: string[]`. Unreadable bytes,
unterminated frontmatter, unparseable YAML, non-mapping frontmatter, a
non-string `title`, a scalar `tags` — all of them append to the same list. One
reporting path renders all of them.

**Why.** Requirement 6 names one failure (malformed frontmatter), but it is an
instance of a class: "this file had something wrong with it that should not
abort the run". Building a mechanism for the class means the tenth failure mode
needs no new plumbing, and it removed the temptation to `try/catch` in three
different shapes.

**GVP.** `personal:P4` ("Generic solutions over special-case handling" — "When
encountering a specific failure, prefer building a generic mechanism that
handles the class of failures, not just the instance. Special-case fixes
accumulate"). `code-common:CP12` ("Be aware of state; don't wander into bad
states" — "For each failure ask — what is the consequence, does the user need
to know, can we recover, should we stop") is what made the per-failure answer
uniform here: consequence is one bad row, the user must know, we can recover,
we do not stop.

---

## 6. A broken file still gets a row, with documented fallbacks

**Chosen.** A file with malformed frontmatter appears in the report with a
filename title, whatever tags could be salvaged, and a word count of whatever
body could be identified — plus its problems. It is never replaced by a bare
error line.

**Why.** "Reported, not skipped silently" is stronger than "mentioned in an
error list": the file is still a note, and its word count is still information
the user asked for. Downgrading it to an error line would lose data that was
perfectly readable.

**GVP.** `personal:R2` ("No silent failures or data loss" — "Failures must be
surfaced, not swallowed. Data must not be silently lost") and `personal:V5`
(Data preservation — "Never silently discard, overwrite, or strand user data").

---

## 7. Wrong-typed values are coerced and reported, not dropped

**Chosen.** `tags: work` (a scalar) becomes `["work"]` with a problem noting
the coercion. `tags: [work, 7]` becomes `["work", "7"]` with a problem naming
the index. `title: 42` falls back to the filename, with a problem — and the
report says which. A `tags` *mapping* is the one case where no sensible
coercion exists, so it yields no tags, reported.

**Why.** The author of `tags: work` clearly meant the tag `work`; dropping it
would lose real content over a syntax slip, and silently accepting it would
hide a fixable typo. Coerce-and-report does both jobs. Every coercion is in the
README table so nothing about it is a surprise.

**GVP.** `personal:V5` (Data preservation — "Unknown fields are preserved, not
filtered") and `personal:R2`. `code-web:WP2` ("Validate all external input at
trust boundaries... Unknown fields may be preserved (per V5) but must not be
executed or inserted into sensitive contexts") is the closest thing the library
has to a rule about handling untrusted structured input, and this is its
non-web reading: check the shape, keep the content, never let a bad value
through unannotated. The insistence on documenting each coercion is
`personal:V2` (Transparency — "When corners are cut or trade-offs made,
document them explicitly").

---

## 8. Data on stdout, problems on stderr

**Chosen.** The table or the JSON array goes to stdout, alone. The problem
report goes to stderr. Under `--json` the problems are *also* in each record's
`problems` field, so the machine-readable output is self-contained.

**Why.** Mixing problem lines into stdout would break `| jq` and `| awk` on
exactly the runs where you most want to inspect the data. Splitting the streams
keeps both audiences served without either compromising.

**GVP.** `personal:P20` ("Prefer machine-consumable forms where easy" — "shape
signals and artifacts so a program can read them") for the stdout purity, and
`personal:R2` for the requirement that the problems still be impossible to miss
rather than merely available.

---

## 9. Three exit codes, with "bad invocation" distinct from "broken notes"

**Chosen.** `0` clean, `1` bad invocation or unreadable root, `2` report
complete but some paths were reported broken. Constants in `src/types.ts`,
documented in `--help` and the README.

**Why.** Collapsing `1` and `2` would force a caller to parse stderr to tell
"you typed the path wrong" from "your notes have a YAML typo" — two situations
with completely different responses. Distinguishing them is one constant and a
comparison, and it turns the run into something a script can branch on.

**GVP.** `personal:P19` ("Favor low-effort, high-information signals" —
"Implement low-effort, high-information signals wherever possible, even when it
is not certain they will be immediately useful") and `personal:P20`.
`code-common:CP12` supplied the framing that a fatal state and a recovered
state must not be conflated.

---

## 10. A `--words tokens|raw` flag, resolving the spec's word-count ambiguity

**Chosen.** Default `tokens`: whitespace-separated runs containing at least one
letter or digit, so `#`, `-`, `>`, `|` and `---` are not counted as words. Opt
into `raw` for a plain whitespace split.

**Why.** "Word count" over Markdown has no single correct reading, and the two
readings differ by a lot on a bulleted document. Picking one silently would
make the number unexplainable; the flag makes the definition explicit and
cheap to change per use. This is the one place where I added surface the task
did not name, and I judged it justified because it resolves an ambiguity
*inside* requirement 3 rather than adding a new feature.

**Tension, named.** `personal:P21` ("Build flex points early to discover the
best use" — "Favor creating many flex points in early builds, exposed as config
options") pushes toward more flags; `code-common:CP11` ("API surface is a
commitment... Adding is easy; removing is expensive") and `personal:V1` push
toward fewer. I resolved it by exposing a flex point only where the
requirement was genuinely ambiguous, and keeping other flex points as internal
seams (§11). See §23 for the guiding-element patch that would settle this
class of call without judgement.

**GVP.** `personal:P21`, against `code-common:CP11` and `personal:V1`;
`personal:V2` for documenting the rule rather than leaving the number
unexplained.

---

## 11. The note-extension set is an internal seam, not a flag

**Chosen.** `scan()` takes `extensions`, defaulting to the
`NOTE_EXTENSIONS` constant (`['.md']`). No `--ext` flag.

**Why.** "Also scan `.markdown`" is a plausible future ask, and the seam that
serves it costs one parameter and is already covered by a test. The *flag* is
what would be the permanent commitment, and nothing in the requirements asks
for it — so the architecture is shaped for the change without the change being
built.

**GVP.** `personal:P1` ("Design around flex points" — "When a future change is
plausible, shape the architecture so the change is not painful when it arrives
— but do not implement the change early"), and `personal:H1` ("Extraction
timing" — "Do not create shared abstractions before a real shared need exists").

---

## 12. No hidden directory skip list

**Chosen.** The walk descends into every subdirectory. There is no built-in
exclusion of `.git`, `node_modules`, or dotfiles.

**Why.** A skip list is convenient right up to the moment it hides a note you
wrote. "Recursively finds `.md` files" means all of them; an exclusion the user
cannot see is exactly the silent omission the library rules out. If it is ever
wanted it belongs on the surface as a flag, where it is visible.

**GVP.** `personal:R2` ("No silent failures or data loss... If data is
discarded, it must be explicit"). This is also the one place where I chose
against convenience, and the README says so (`personal:V2`).

---

## 13. Code-point sort, not locale-aware collation

**Chosen.** Paths compared with `<`/`>`, not `localeCompare`.

**Why.** Requirement 7 says sort by path; it does not say "in the reader's
locale". `localeCompare` would make the output depend on the machine's ICU
locale, so the same tree would diff differently on two machines — poison for
anything downstream of `--json`.

**GVP.** `personal:P20` ("Prefer machine-consumable forms where easy") — a
reproducible ordering is what makes the output diffable and testable.

---

## 14. The table pads, never truncates

**Chosen.** Column widths are computed from the content. A 200-character title
widens the column.

**Why.** Truncation is data loss in the one artifact the user is reading to
find out what their notes contain, and an ellipsis is indistinguishable from a
title that really ends in "...". `--json` exists for programmatic use; the
table's job is to be complete and honest.

**GVP.** `personal:V5` (Data preservation) and `personal:R2`.

---

## 15. Repeated flags and extra positionals are errors, not last-wins

**Chosen.** `--tag a --tag b` and `noteview dirA dirB` both exit `1` with an
explanatory message. `parseArgs` is configured with `multiple: true` purely so
that repetition is *detectable* rather than silently collapsing to the last
value. Unknown flags are rejected by `strict: true`.

**Why.** Last-wins turns a user's mistake into a wrong answer that looks right
— the most expensive failure mode a reporting tool has. Refusing is one
comparison. Note that this deliberately leaves room to *add* multi-tag
semantics later as an additive change rather than a behaviour change.

**GVP.** `personal:R2` (surface failures, do not swallow them) and
`code-common:CP12` (never wander into an unexpected state). The
"leaves room to add" half is `code-common:CP11` ("Prefer additive changes...
over breaking ones").

---

## 16. `run()` returns an exit code; only `src/index.ts` touches the process

**Chosen.** `src/cli.ts` exports `run(argv, streams): Promise<number>` and
takes its output sinks as parameters. `src/index.ts` is nine lines: argv in,
`process.stdout`/`process.stderr` in, `process.exitCode` out.

**Why.** Testing a CLI that calls `process.exit` and writes straight to the
real stdout means spawning a process for every assertion — slow enough that
edge cases quietly go untested. Making the process boundary a parameter made
16 CLI behaviours cheap to assert, including every error path. Testability
drove the shape here, not the reverse.

**GVP.** `code-common:CP13` ("Testability is a design constraint" — "How
something will be tested is a design input, not an afterthought. If a component
is hard to test, spend more design effort making it testable"),
`code-testing:TP2` ("Design every feature with testing in mind" — "Treat 'how
will this be verified?' as a design input, not an afterthought"), and
`code-common:CP3` ("Explicit over implicit" — "Function signatures show all
inputs. No hidden state or global magic").

---

## 17. Six small modules, one concern each

**Chosen.** `types.ts` (shapes + constants), `frontmatter.ts` (split and field
extraction), `scan.ts` (walk and read), `render.ts` (table and JSON),
`cli.ts` (parse and run), `index.ts` (process boundary).

**Why.** Each of the likely changes lands in exactly one file: a new output
format is `render.ts`, a new frontmatter rule is `frontmatter.ts`, a new flag is
`cli.ts`. Both renderers share the `Renderer` signature, so `--json` selects a
function instead of branching through the report logic.

**GVP.** `code-common:CP1` ("One contiguous block" — "modifications should be
contained within one contiguous block of code whenever possible... Will this
force future features to be scattered?") and `personal:V3` (Composability and
DRY — "Build small, focused pieces that combine naturally").

---

## 18. Every tunable value is a named constant

**Chosen.** `NOTE_EXTENSIONS`, `FRONTMATTER_DELIMITER`, `WORD_PATTERN`,
`WORD_MODES`, `DEFAULT_WORD_MODE`, `TABLE_GUTTER`, `TAG_SEPARATOR`,
`PROBLEM_MARKER`, `EXIT_*` — all in `src/types.ts`, none inlined at the point
of use.

**Why.** These are the values a future change actually touches. Collected in one
file they are a de facto configuration surface; scattered as literals they are
a search-and-replace hazard. Defaults are set so zero-config use works.

**GVP.** `code-common:CP9` ("Named constants for everything configurable" —
"All magic numbers should be named constants... any value that might be
adjusted") and `code-common:CP5` ("Configuration infrastructure early, defaults
always" — "Magic constants interwoven in code are harder to separate after the
fact. But always provide sensible defaults so zero-config works").

---

## 19. Tests on Node's own runner, plus a real-process end-to-end test

**Chosen.** 55 tests across five files using `node:test` and
`node:assert/strict` — no Jest, no Vitest. `test/e2e.test.ts` additionally
spawns `npx tsx src/index.ts` as a child process and asserts on its real
stdout, stderr, and exit code. `npm run check` runs `tsc --noEmit` and the
suite; both are green.

**Why.** The stdlib runner keeps the dependency count at three dev packages and
needs no config. The separate e2e test exists because the in-process tests
cannot catch a broken entry point, a bad shebang, or a module-resolution
failure under `tsx` — precisely the failures that only appear in the runtime
users actually invoke. Fixtures under `test/fixtures/notes` cover each
documented behaviour, and every one of the nine problem types in the README
table has a test — including the unreadable-file path, which is exercised by
writing a mode-`000` file inside the project's own fixtures tree.

**GVP.** `code-testing:TP1` ("Tests for all code, unit and end-to-end" —
"Unit tests pin behavior of individual pieces; e2e tests prove the assembled
system does what the user actually needs. Code shipped without tests is
unverified, not done") is why there are both kinds rather than just unit tests.
`personal:P13` ("Verify in the production runtime, not just the test
harness" — "Green tests are not proof of working software... Before claiming a
change works, exercise it in the production runtime") is the direct reason the
e2e file exists. `personal:R1` ("Verify before claiming correctness" —
"Typecheck must pass. Tests must pass") is why `npm run check` exists and was
run before this document was written. `personal:P2` ("Empirical validation
before commitment" — "Data, not vibes") covers the fixture-driven approach.

---

## 20. The README documents every rule the task left open

**Chosen.** A "Behaviour, spelled out" section stating the frontmatter
detection rule, the title fallback (basename *with* extension), the tag
normalizations, both word-count definitions, the sort order, the
empty-result behaviour, a table of all nine reported problem types, and the
exit codes.

**Why.** Every one of those is a judgement call that a reader would otherwise
have to reverse-engineer from source, and a summary tool whose numbers cannot
be explained is not trustworthy. Writing them down is also what makes the
choices reviewable rather than merely present.

**GVP.** `personal:V2` (Transparency — "Be honest about trade-offs,
limitations, and the reasoning behind decisions... Presenting a clean facade
over unclear motivations helps no one"). `personal:P11` ("AI-first
development" — "Externalize decisions, rationale, context, and process into
durable, traceable, machine-readable artifacts... so any capable implementer —
human or AI — can act on the work") is why this file and the README carry the
rationale rather than a commit message.

---

## 21. Other frontmatter keys are read but not reported

**Chosen.** `author`, `date`, or any other key in the frontmatter is parsed and
then not carried into the table or the JSON. The four reported fields are the
four the task names.

**Why.** This is worth stating because `personal:V5` (Data preservation) and
`code-web:WP2`, which restates it ("Unknown fields may be preserved (per V5)
but must not be executed or inserted into sensitive contexts"), both push
toward preserving what you did not ask about. The reason they do not
force an extra `meta` object into the output here: `noteview` never writes to a
note, so no field can be lost, overwritten, or stranded — V5's actual concern.
A summary that reported every key would stop being a summary, and requirement 5
ties `--json` to "the same data" as the table. What honesty does require is
saying so, which the README does.

**GVP.** `personal:V5` and `code-web:WP2` considered and judged not to apply to
a read-only summary; `personal:V2` (Transparency) is why the limitation is
documented rather than left for a reader to discover.

---

## 22. The name `noteview` was kept as given, with no deliberation

**Chosen.** Kept. No alternatives were generated.

**Why.** It is plainly descriptive and the audience is one directory of notes.
Spending effort here would have been effort taken from the parts of the tool
that are actually ambiguous.

**GVP.** `personal:H9` ("Scale naming effort to expected reach" — "A
small-audience tool does not earn deliberation, and a plainly descriptive name
is the right outcome there").

---

## 23. Where the library did not decide it for me

`personal:H5` ("Disambiguate-then-surface gate") holds that a decision which
cannot be unambiguously derived from the library is a blocker, and that the
right response is to weigh the aligned options, work out what
guiding-element patch would make each one unambiguous, and present the
*patches* — not the bare decisions — for review. I could not ask
interactively, so I recorded both cases here and took the reversible option in
each. `personal:H8` ("Buy reversibility when it costs less than proof") is the
licence for proceeding: "When validating a choice would cost more than making
it reversible, take the judgment call and invest in reversibility instead.
Record that the validation was priced and declined, and what would trigger
doing it after all."

### 23a. How broad should early flex points be?

`personal:P21` says to expose many flex points as config options in early
builds; `code-common:CP11` says every flag is a commitment that is expensive to
remove; `personal:V1` says complexity must earn its place. All three are
active, and they point in different directions for a first build. I chose
"flag only where a requirement is ambiguous, internal seam otherwise" (§10,
§11) — reversible in both directions, since a seam can be promoted to a flag
additively and no speculative flag has to be removed.

Either of these patches would make the call unambiguous:

- A heuristic under `personal:P21` bounding it — e.g. *"expose a flex point as
  a CLI flag only where the requirement itself is ambiguous or a second
  consumer exists; otherwise keep it as an internal seam"* — which would
  formalize what I did.
- Or a heuristic favouring breadth in throwaway/early tools — e.g. *"in a
  pre-1.0 tool, prefer an extra flag over an internal-only seam; CP11's
  commitment cost does not apply before the first stable release"* — which
  would instead call for `--ext`, `--sort`, and a `--no-recurse` flag here.

My recommendation is the first: it keeps `CP11` meaningful and matches
`personal:H1`'s "wait until a second consumer forces the design".

### 23b. What counts as a word?

No element in the library speaks to text-processing semantics, so `tokens` vs
`raw` could not be derived. I made it a flag with the more useful default
rather than picking silently (§10). A patch making this unambiguous would be a
domain heuristic — e.g. *"when a metric has more than one defensible
definition, expose the definition as an option and document each; never pick
one silently"* — which generalizes past word counts to any derived number a
tool reports. I recommend adding it: it is domain-agnostic in the sense
`personal:P6` asks for ("decompose its rationale to the most domain-agnostic
guiding element"), and it would decide this class of question for future tools
rather than just this one.
