# Design decisions

One section per choice. Each states what was chosen, why, and which element of
`.gvp/library` informed it — or explicitly that none did.

Element ids use the library's own naming: `personal:*`, `code-common:*`,
`code-testing:*`, `ai-common:*`.

---

## 1. TypeScript with a strict compiler configuration

**Chose:** TypeScript on Node with `strict`, plus `noUncheckedIndexedAccess`,
`exactOptionalPropertyTypes`, `noUnusedLocals`/`noUnusedParameters` and
`verbatimModuleSyntax`. Every exported function has an explicit signature and
every data shape is a named type in `src/types.ts`.

**Why:** The task named TypeScript, but the strictness level was open. Turning
the extra checks on is free at this size and removes a class of mistakes the
tests would otherwise have to catch.

**Library:** `code-common:CP7` ("Type hints on all function signatures… TypeScript
over JavaScript"). `noUncheckedIndexedAccess` in particular follows
`code-common:CP12` — indexing a list is exactly a place to wander into an
unexpected state.

---

## 2. Adopt `yaml` for parsing; hand-roll the table

**Chose:** One runtime dependency, `yaml`, used via `parseDocument`. The table
renderer is ~30 lines of local padding code with no dependency.

**Why:** These look like the same call but are not. YAML is a large
specification whose edge cases (anchors, flow collections, quoting, duplicate
keys) I would otherwise have to discover in production; a fixed-width table is
width-computation plus `padEnd`, with no edge cases beyond the alignment
limitation documented in the README.

**Library:** `code-common:CH1` is the deciding element, and it asks explicitly
"what is the ongoing cost of owning and testing a hand-rolled equivalent?" —
high for YAML, negligible for column padding. `personal:V1` keeps the dependency
count at the minimum that answer allows.

`parseDocument` was chosen over `parse` specifically so YAML errors and warnings
arrive as data rather than as thrown exceptions plus `console` writes the
library chooses the stream for: `personal:R2` wants failures surfaced in the
report, and `personal:P20` wants them in a form the program controls.

---

## 3. Node's built-in `util.parseArgs` instead of a CLI framework

**Chose:** `node:util`'s `parseArgs` in strict mode.

**Why:** Three options and one positional argument. A framework would add a
dependency to produce the same result.

**Library:** `code-common:CH1` again, read the other way — the maintained
library that covers the need is the standard library, so nothing else needs
adopting. `code-common:CP16` frames language/tooling choice as an effort
decision driven by standard library reach, which is what settled it.

---

## 4. Node's built-in test runner, with unit tests and a real subprocess test

**Chose:** `node:test` + `node:assert/strict`, run through `tsx`. 67 tests in
four files: `note.test.ts` (pure text handling), `scan.test.ts` (the real
fixture tree), `render.test.ts` (output shape), `cli.test.ts` (the whole CLI
in-process, plus two tests that spawn `npx tsx src/index.ts` for real).

**Why:** The pure functions can be pinned precisely; the CLI needs to be
exercised as a whole; and the shipped entry point needs to be exercised as
shipped.

**Library:** `code-testing:TP1` makes tests non-optional and asks for both unit
and end-to-end coverage ("Code shipped without tests is unverified, not done").
The subprocess tests exist because of `personal:P13` — "Green tests are not
proof of working software… exercise it in the production runtime". `personal:R1`
required actually running the gate before claiming this works, which is why the
README's example output and JSON sample are pasted from real runs rather than
written by hand.

Worth recording under `personal:P2`: when a test and the implementation first
disagreed about a word count, the measurement was right and my expectation was
wrong, and the test was corrected rather than the code.

---

## 5. `run()` takes its output streams as arguments

**Chose:** `src/cli.ts` exports `run(argv, streams)` where `streams` supplies
`writeOut`/`writeErr`. `src/index.ts` is a seven-line shim that passes the
real `process` streams and sets `process.exitCode`.

**Why:** It makes stdout and stderr separately assertable in-process, which is
what most of the CLI tests need, and it keeps the entry point trivial.

**Library:** `code-common:CP13` ("If a component is hard to test, spend more
design effort making it testable") and `code-common:CP3` — writing to `process`
from deep in the code would be exactly the hidden global dependency CP3 names as
an anti-pattern.

---

## 6. Module layout: six small modules, one concern each

**Chose:** `types.ts` (shapes and constants), `note.ts` (one note's text),
`scan.ts` (the tree walk), `render.ts` (output formats), `cli.ts`
(orchestration), `index.ts` (wiring), plus `errors.ts` (error types and
wording).

**Why:** Each likely future change lands in exactly one file: a new output
format in `render.ts`, a new frontmatter field in `note.ts`, a new traversal
rule in `scan.ts`.

**Library:** `code-common:CP1` is the direct test — "modifications should be
contained within one contiguous block of code"; and `personal:P3`, which keeps
"what the data is" (`scan.ts`) apart from "how it is shown" (`render.ts`).
`personal:V1` argued against splitting further: frontmatter splitting, field
parsing and word counting are one cohesive job and stayed in one module rather
than becoming three.

---

## 7. Problems are a per-row `issues: string[]`, not bespoke error branches

**Chose:** A single generic mechanism. Anything wrong with a file appends a
string to that file's `issues`, and the row is emitted anyway with fallbacks
(filename for title, empty tag list). Two helpers (`readStringField`,
`readStringListField`) handle all field-level validation.

**Why:** Requirement 6 names one case (malformed frontmatter), but it is an
instance of a class: bad YAML, non-mapping frontmatter, wrong field types,
non-string tag entries, unreadable files. One mechanism covers the class, and
covers cases I have not thought of yet.

**Library:** `personal:P4` ("prefer building a generic mechanism that handles the
class of failures, not just the instance"), with `code-common:CP4` pushing the
repeated validate-report-fall-back logic into shared helpers rather than five
near-identical branches.

---

## 8. Report and continue; never drop a file, never stop the run

**Chose:** Every scanned file appears in the report regardless of what is wrong
with it. Nothing is skipped, and no single bad file ends the run.

**Why:** This is requirement 6, but the library independently forces the same
answer and extends it past frontmatter to unreadable files and directories.

**Library:** `personal:R2` ("Failures must be surfaced, not swallowed. Data must
not be silently lost") and `personal:V5`. `code-common:CP12` supplied the shape
of the handling — for each failure, ask what the consequence is and whether we
can recover, rather than applying a blanket fail-fast or ignore-everything
policy.

---

## 9. An unterminated frontmatter block counts as body text

**Chose:** A file that opens with `---` and never closes is reported as a
problem, and its entire contents — including the `---` line and the YAML-looking
lines — are counted as the body.

**Why:** The alternative (treat the rest of the file as frontmatter) would make
a word count of 0 for a file full of prose, which loses the user's content over
a one-character typo.

**Library:** `personal:V5` — "Never silently discard… user data". Guessing where
the block "should" have ended would also violate `personal:V2`, so the tool
reports what it actually found instead.

---

## 10. Exit code 2 for "report produced, but some files had problems"

**Chose:** `0` clean, `1` could not run at all (bad usage or unreadable
directory), `2` report produced with problems. Documented in `--help` and the
README.

**Why:** "Ran fine" and "ran, but five files need attention" are different
outcomes, and a caller should not have to parse stderr to tell them apart.

**Library:** `personal:P19` ("Implement low-effort, high-information signals
wherever possible, even when it is not certain they will be immediately
useful") and `personal:P20` (prefer machine-consumable forms where easy). The
exit code costs one line. `personal:R2` also wants the problems surfaced
somewhere a caller cannot miss. `code-common:CP11` made me check this was an
additive surface rather than an overloaded one — it is: the meanings of 0 and 1
are conventional.

---

## 11. stdout is the report; stderr is the diagnostics; JSON records carry both

**Chose:** The table or JSON array goes to stdout alone. Per-file problems,
unscanned paths and the "no files found" notices go to stderr. In `--json` mode,
each record additionally carries its own `issues` array.

**Why:** `noteview notes --json | jq` must work unchanged whether or not
anything was wrong — mixing diagnostics into stdout would break the parse. But a
program consuming the JSON should not have to scrape stderr to learn that a file
was unreadable, so the issues ride in the records too.

**Library:** `personal:P20` (machine-consumable where easy) for keeping stdout
clean and putting `issues` in the records; `personal:R2` for refusing to let the
problems go unmentioned in either channel.

---

## 12. Problems are listed for every scanned file, even when `--tag` excludes it

**Chose:** `--tag` filters the rows on stdout. It does not filter the stderr
diagnostics, and a note explaining that appears in the stderr block whenever a
filter is active.

**Why:** A file whose frontmatter could not be parsed has no readable tags — so
it might well have carried the tag being filtered on. Hiding its problem would
make a filtered run look clean when part of the input was unreadable. This is
the one place where the filter and the honesty requirement actually conflict,
and it is resolved in favour of honesty.

**Library:** `personal:R2` decides it directly. `personal:V2` decided the extra
explanatory line: the behaviour is surprising unless stated, so it is stated
rather than left to be inferred.

---

## 13. A repeated `--tag`, or an extra directory, is an error

**Chose:** `--tag a --tag b` and `noteview one two` both exit 1 with a message
naming what was given. `parseArgs` is configured with `multiple: true` for
`--tag` solely so a repeat can be detected and refused, rather than silently
resolving to the last value.

**Why:** The default behaviour of most parsers — last wins, extras ignored —
discards part of what the user asked for without saying so. The user is probably
wrong about something either way; telling them which is cheaper than guessing.

**Library:** `personal:R2`, read as applying to user input and not only to
stored data. `code-common:CP12` supports it too: quietly dropping an argument
leaves the tool running in a state the user does not believe it is in.

---

## 14. One command with flags; no subcommands, no config file

**Chose:** A single entry point, `noteview <dir> [--tag <name>] [--json]`. No
subcommands, no config file, no environment variables. Defaults live as named
constants in `src/types.ts` and options travel as one explicit object.

**Why:** The whole tool is one verb. Splitting it would add lookup cost with no
gain.

**Library:** `personal:P8` ("Prefer fewer entry points with options over many
slightly-different entry points") and `personal:H7`, which gives the measure —
how many times must someone consult help output to accomplish one task? Once,
here. `code-common:CP5` is partly satisfied and partly declined: configuration
is "wired up" as a threaded options object with defaults in one place, but no
config file exists, because there is nothing a user would set twice.

This is the one place where two elements genuinely pull against each other, and
it is recorded rather than smoothed over. `personal:P21` says to expose many
flex points as config options in early builds to discover the best use of a
tool; `code-common:CH2` says a feature that is speculative with no concrete use
case should be deferred entirely, with no flex points, and
`code-common:CP11` warns that every flag is a commitment that is expensive to
remove. I resolved it by putting the flex points *inside* the code, where they
cost nothing and commit to nothing — the `RENDERERS` registry (section 15), the
`NOTE_EXTENSIONS` constant, the options object — and leaving the flag surface at
exactly what the requirements name. `personal:P1` is the tiebreaker: shape the
architecture so the change is not painful when it arrives, but do not implement
the change early.

---

## 15. Output formats live in a registry

**Chose:** `render.ts` exports `RENDERERS: Record<OutputFormat, …>` mapping
format name to function. A test asserts its keys match the advertised
`OUTPUT_FORMATS` list.

**Why:** Adding a format is one function plus one map entry, in one file.

**Library:** `personal:P1` (build the flex point, not the feature) and
`code-common:CP1` (the change stays in one contiguous block). `personal:H1`
allowed the extraction now rather than waiting for a second consumer, because
the boundary — "records in, text out" — is clean and obvious rather than
uncertain.

---

## 16. Sort by code point, not `localeCompare`

**Chose:** A plain `<` comparison on the relative path.

**Why:** `localeCompare` orders differently depending on the environment's
locale, so the same directory could produce differently-ordered reports on two
machines, and a diff of two reports would show phantom changes.

**Library:** `personal:P2` ("Data, not vibes") and `personal:R1`, both of which
depend on results being reproducible. The consequence — `Upper.MD` sorts before
`alpha.md` — is asserted in a test with a comment, so it reads as a decision
rather than a bug.

---

## 17. Symlinks are followed, with a visited-path guard

**Chose:** Symlinks to files are read normally. Symlinked directories are
followed, but a set of already-visited real paths prevents re-entering a
directory, so a cycle is reported once and the walk terminates. Broken symlinks
are reported.

**Why:** Refusing to follow symlinks would silently omit content; following them
naively would hang on a cycle. The guard gets both.

**Library:** `code-common:CH2`'s first branch — "if a feature is needed for
stability or correctness: implement now" — made this non-optional rather than an
edge case to defer. `code-common:CP12` ("never wander into an unexpected bad
state") names the hang as the thing to prevent, and `personal:P4` preferred one
generic visited-path mechanism over a special case for self-links. The fixture
`test/fixtures/links/` contains a real cycle, so the guard is tested rather than
assumed.

---

## 18. No directories are excluded by name

**Chose:** Everything under `<dir>` is walked. No skip list for `node_modules`,
`.git`, or dotfiles.

**Why:** Any skip list is a guess about intent that would silently omit files
the user asked about. Documented in the README so the behaviour is predictable.

**Library:** `personal:R2` (nothing silently omitted) and `personal:P4` (no
special-case handling). `personal:V4` also bears on it — the user chose the
directory; the tool should not second-guess the choice. If this becomes annoying
in practice, an `--exclude` flag is the additive change `code-common:CP11`
prefers.

---

## 19. Table shape: a `!` marker column, no truncation, details on stderr

**Chose:** Columns `PATH TITLE TAGS WORDS`, with a one-character marker column
in front that shows `!` on rows whose file had a problem. Long values are never
truncated. The problem text itself is not in the table; it is in the stderr
block keyed by path.

**Why:** Three constraints at once: the row must remain scannable, the problems
must be findable, and no data may be cut off. A marker plus a keyed detail block
satisfies all three; an `ISSUES` column with full messages in it would wreck the
table, and truncating titles to fit would lose data.

**Library:** `personal:V5` forbids the truncation. `personal:R2` requires the
problems to be visible in the primary output, which the marker provides.
`ai-common:C6` ("a person cannot reliably absorb large volumes of output…
locating a specific item within it is costly") is what pushed the message text
out of the table and into a keyed list. The alignment limitation with
double-width characters is stated in the README rather than hidden, per
`personal:V2`.

---

## 20. Filesystem errors are described in plain language, centrally

**Chose:** One `FILESYSTEM_ERROR_REASONS` table in `errors.ts` maps error codes
to readable reasons, with `describeError` as the fallback for anything
unrecognized. `cannot scan "notes": no such directory` instead of Node's
`ENOENT: no such file or directory, realpath '/very/long/absolute/path'`.

**Why:** Node's text repeats a path the report already shows, and leads with a
code rather than a reason. Nothing is hidden: unmapped errors fall through to
the full original message.

**Library:** `code-common:CP2` ("Code should be obvious… descriptive names")
applied to output as well as source, and `code-common:CP4` for keeping the
mapping in one place instead of formatting errors differently in each module.

---

## 21. `.md` matching is case-insensitive, held in a named constant

**Chose:** `NOTE_EXTENSIONS = [".md"]`, compared against a lowercased
extension, so `README.MD` is found.

**Why:** The requirement says `.md`; a case-sensitive reading would skip
`Upper.MD` for no reason a user would predict.

**Library:** `code-common:CP9` (named constants for anything configurable) and
`personal:P1` — as a named list, adding `.markdown` later is a one-line change,
without committing to a flag now. A fixture covers the uppercase case.

---

## 22. `npm run check` is the only gate

**Chose:** One command that runs the typecheck and then the full suite. No
pre-commit hook, because this project is not a git repository.

**Why:** A single command that does the whole verification is one thing to
remember and one thing to run in CI.

**Library:** `personal:P7` ("Every process needs a concrete enforcement
mechanism") and `code-common:CP10`, which prefers a validator over a documented
convention. `personal:P18` set the shape: the preferred gate is friction-neutral
— invisible when things are right, speaking up only when they are wrong — which
one command satisfies and a multi-step checklist would not.

---

## 23. Definitions and limitations are written down

**Chose:** The README states what counts as a word, what counts as frontmatter,
what `--tag` matching does, what the exit codes mean, and four known limitations
including one about the test suite's dependence on `npx`.

**Why:** Every one of these is a choice a reader would otherwise have to
reverse-engineer from output.

**Library:** `personal:V2` ("When corners are cut or trade-offs made, document
them explicitly. Presenting a clean facade over unclear motivations helps no
one"). `ai-common:C2` reinforces it — a future agent reads the working tree and
reproduces what it finds, so the documented rule is what keeps the next change
consistent with this one.

---

## 24. No stubs or unimplemented scaffolding

**Chose:** Every function in `src/` is implemented. There is no stub, no
`throw new Error("not implemented")`, no commented-out future feature, and no
flag that parses but does nothing.

**Why:** Nothing in the task asked for scaffolding.

**Library:** `code-common:CR2` is a hard rule — scaffolding requires "explicit,
verbatim, quoted verification from the user that scaffolding is desired. No
exceptions." I have no such quote, so there is none.

---

## 25. Choices the library did not determine

These three had no element that settled them. Recording them, with the
guiding-element patch that would make each unambiguous, is what
`personal:H5` asks for when a decision cannot be derived from the library —
the patch is the reviewable artifact, not the decision
(`personal:P15`). I made a call in each case so the tool works, documented it in
the README, and kept each one cheap to reverse (`personal:H8` — buy
reversibility when validating would cost more than the choice).

**a. Word-count tokenization.** Chose: whitespace-separated tokens containing at
least one letter or digit, so `# Heading` is one word. The alternative — count
every whitespace-separated token, making `#` a word — is simpler to state but
gives counts a reader would call wrong. A third option, full Markdown parsing,
would mean another dependency and a definition of "word" that varies by
renderer. *Patch that would settle it:* a `code-common` heuristic on the order
of "when reporting a derived metric, prefer the definition matching the user's
intuition over the one that is cheapest to compute, and state the definition
where the metric is shown."

**b. `--tag` case sensitivity.** Chose: exact, case-sensitive. Tags are user
data; case-insensitive matching would silently conflate `Work` and `work`, which
is a judgment about the user's tagging scheme that this tool has no basis for.
*Patch that would settle it:* a `code-common` heuristic such as "match
user-supplied identifiers exactly by default; make any normalization opt-in and
visible" — which would also decide the same question for a future `--title`
filter.

**c. What makes a "problem" versus silence.** Chose: a type mismatch on `title`
or `tags`, and non-string entries inside `tags`, are reported. An arguable
alternative is to coerce quietly (`title: 42` → `"42"`) and report only
unparseable YAML. I read `personal:R2` and `personal:V5` as covering this, since
coercion discards the distinction between what the user wrote and what the tool
used — but that is an inference from elements about data loss to a case about
type looseness, so it is flagged rather than presented as derived. *Patch that
would settle it:* extend `personal:V5` or `code-common:CP12` with a sentence on
input coercion, e.g. "never coerce a value across types on the user's behalf
without reporting it."

---

## 26. Library elements considered and found not applicable

Recorded so a reader knows they were read, not missed.

- `code-common:CP15` (swappable persistence behind an abstraction) — the tool
  has no durable storage. Introducing a storage seam would be the hypothetical
  complexity `personal:V1` and `code-common:CH2` both rule out.
- `code-web:*` and `code-realtime:*` — no browser surface, no DOM, no network
  peers, no game loop. `code-web:WP2` (validate all external input at trust
  boundaries) has a defensible analogue in a CLI reading arbitrary files, and
  the frontmatter validation in `note.ts` is consistent with it, but the element
  is scoped to web trust boundaries and was not the reason for that code.
- `personal:V8` (contribution over ownership) — bears on publishing, not on this
  build. It did influence writing the README for a reader other than me.
- `code-common:CR1` (secrets out of source control) — no secrets exist here.
