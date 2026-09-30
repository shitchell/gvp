# Design decisions

One section per choice that could reasonably have gone another way. Each states
what was chosen, why, and which element of the project's GVP library
(`.gvp/library`, consulted via `cairn --library ./.gvp/library`) informed it.

Where a section says "library: none", the choice was made on ordinary judgment
and no element bore on it.

---

## 1. `gray-matter` for frontmatter extraction, rather than hand-rolling the delimiter scan

**Chosen.** One runtime dependency, `gray-matter`, does the `---` delimiter
handling and YAML parsing. Nothing about frontmatter extraction is
reimplemented here.

**Why.** Splitting on `---` looks like ten lines until you enumerate what it has
to get right: CRLF frontmatter, a BOM before the opening delimiter, a `---`
thematic rule later in the body that must *not* be treated as frontmatter, an
unterminated opening delimiter, duplicate YAML keys, non-mapping frontmatter.
Before adopting it I ran all of those through `gray-matter` 4.0.3 and recorded
what it does, rather than assuming (see decision 3). It handled every one; a
hand-rolled version would have had to discover them.

**Library:** `code-common:CH1` (Dependency adoption threshold) — "If a
maintained external library covers the need, adopt it rather than writing your
own… Does it handle edge cases you would otherwise have to discover yourself?"
That is exactly the axis this turned on. `personal:V3` (Composability and DRY)
points the same way.

---

## 2. Node's built-in `util.parseArgs` instead of a CLI framework

**Chosen.** No `commander`/`yargs`/`clipanion`. `node:util`'s `parseArgs` covers
one positional, one string option, and two booleans.

**Why.** `code-common:CH1` says adopt a library when it covers a need the
standard library does not. Here the standard library does cover it, so the
dependency would have no need to cover. A framework would also bring its own
help formatting and error text, which is more surface than this tool's three
flags justify.

**Library:** `code-common:CH1` (read in the negative — the threshold is not
met), plus `personal:V1` (Simplicity): "every abstraction, indirection, or
generalization should solve a real problem, not a hypothetical one."

---

## 3. Probing library behavior empirically before committing to it

**Chosen.** Before writing any parsing code, I ran `gray-matter` against seven
adversarial inputs and recorded the actual results, then designed around what I
observed.

**Why.** This is what caught decision 4 — a genuine data-corruption bug I would
not have predicted from the README.

**Library:** `personal:P2` (Empirical validation before commitment) — "Test
assumptions with real code and real data before committing to design decisions…
Data, not vibes."

---

## 4. Passing an explicit options object to every `gray-matter` call

**Chosen.** `matter(content, GRAY_MATTER_OPTIONS)` where
`GRAY_MATTER_OPTIONS = { language: "yaml" }`, with a comment in
`src/constants.ts` explaining that the object is load-bearing, and a regression
test in `tests/parse.test.ts` pinning the behavior.

**Why.** Called with no options, `gray-matter` memoizes by file content and
**inserts the cache entry before parsing**. A parse that throws therefore leaves
a poisoned entry behind, and the next file with byte-identical malformed
frontmatter comes back as a *valid* note whose body is its own frontmatter —
wrong word count, wrong title, no error reported. I hit this for real: four
tests failed on the first run because the same malformed fixture was read twice
in one process. Passing any options object takes `gray-matter`'s uncached path.

Silently reporting a malformed file as a good one, with plausible-looking wrong
numbers, is the worst failure this tool could have, so the fix is pinned by a
test rather than left as a comment.

**Library:** `personal:R2` (No silent failures or data loss) — "Failures must be
surfaced, not swallowed… Bugs compound — do not greenlight failing states." The
value of `language: "yaml"` being stated explicitly rather than relying on the
default is `code-common:CP3` (Explicit over implicit).

---

## 5. Field-level type violations are "malformed", not coerced

**Chosen.** `title: 2026` and `tags: draft` are reported as malformed
frontmatter with a message naming the field, rather than stringified or wrapped
into a one-element list. YAML null (`title:` with no value) is treated as
absent, which requirement 3 explicitly allows.

**Why.** This was the closest thing to a genuine fork in the task. Coercion is
friendlier in the moment — `tags: draft` is a common authoring slip and
`["draft"]` is almost certainly what the author meant. But "almost certainly" is
the problem: the tool would be reinterpreting the user's data and then
presenting the reinterpretation as fact, with nothing in the output saying it
had happened. Reporting it tells the author precisely what to fix, and one
uniform rule ("frontmatter that does not match the expected shape is
malformed") is easier to predict than a set of per-field coercions.

The cost is real and worth naming: a reported file loses its word count, which
we could have computed. I accepted that because a wrong title shown as a right
one is worse than a missing row that says why it is missing.

**Library:** `personal:R2` (No silent failures or data loss) and `personal:V2`
(Transparency) — "Never pretend fundamental limitations are solvable through
cleverness." Also `code-web:WP2` (Validate all external input at trust
boundaries): frontmatter is data from outside the program, so it is validated
against a known shape before any of it is used. `personal:P9` (Follow rules
uniformly) favored the single rule over per-field special cases.

---

## 6. Unknown frontmatter keys are ignored, never a reason to reject

**Chosen.** A file with `author:`, `date:`, or anything else this tool does not
consume is summarized normally.

**Why.** The schema is a lens for reading the fields this report needs, not a
whitelist the file has to satisfy.

**Library:** `personal:V5` (Data preservation) — "Unknown fields are preserved,
not filtered." Strictly, V5 is about not stranding data on write; this tool only
reads, so nothing is at risk of being lost. The same reasoning still decided the
read side. `code-realtime:RTR2` states the lens-not-filter framing directly,
though it is scoped to sync protocols and so was not the governing element.

---

## 7. Malformed files are reported in the output *and* in the exit code

**Chosen.** Table mode prints a problems block below the table; `--json` puts
the problem in the array with `error` set; either way the process exits `2`.
Exit `0` means "every file summarized", `1` means "bad invocation".

**Why.** Requirement 6 asks for malformed files to be reported. A human reading
the terminal is served by the output; a script doing
`noteview notes --json > report.json` is not — it needs to know the report is
incomplete without parsing it. The distinct code `2` also keeps `1` meaning
"you called me wrong", which is a different thing a caller wants to handle
differently.

**Library:** `personal:R2` (No silent failures) for reporting at all, and
`personal:P20` (Prefer machine-consumable forms where easy) for making the
incompleteness readable by a program and not just by a person.

---

## 8. Problems grouped below the table, not interleaved as table rows

**Chosen.** The table holds only summarized notes; failures are listed in a
labelled block underneath, both sorted by path.

**Why.** Considered and rejected: a row per problem with `-` in the title, tags,
and word columns. That either truncates the reason to a column width or adds a
fifth column that is empty for every healthy row. The grouped block gives each
reason a full line and puts a count in front of it, so failures stay findable in
a long report instead of scattered through it.

The cost: a malformed file does not appear at its sorted position in the table,
so someone scanning only the table could miss it. The count line immediately
below is the mitigation, and the exit code is the backstop.

**Library:** `ai-common:C6` (Human attention is limited and large output is hard
to navigate) — "locating a specific item within it is costly." `code-common:CP2`
(Clarity over cleverness) argued against the squeezed-into-a-column variant.

---

## 9. `--json` uses uniform keys with explicit `null`s

**Chosen.** Every array element has `path`, `title`, `tags`, `words`, `error`.
On a problem, `error` is the reason and the other three are `null`.

**Why.** A consumer can write `.[] | select(.error == null)` without knowing
which shape it is about to get. The `null`s are not placeholders for values we
declined to print — when the frontmatter could not be parsed, the title and tags
genuinely are not known, and `null` says that, where the filename as a fallback
title would have silently implied we had read the file successfully.

**Library:** `personal:P20` (Prefer machine-consumable forms where easy) for the
uniform shape; `personal:V2` (Transparency) for `null` over a plausible guess.

---

## 10. `--tag` narrows summaries but never suppresses problems

**Chosen.** With `--tag x`, notes are filtered to those carrying `x`; every
malformed file is still reported. `--tag x` can therefore print a problems list
above an empty table, and the empty table is labelled `No notes carry tag 'x'.`

**Why.** The tags of a file whose frontmatter could not be read are unknown, so
the filter cannot rule it out. Dropping it would hide a file that may well carry
the requested tag — the filter would be silently deciding an unanswerable
question in the direction that produces less output.

**Library:** `personal:R2` (No silent failures or data loss). `personal:V2`
(Transparency) drove the labelled empty state: an empty table with no
explanation leaves the user unable to tell "no matches" from "nothing scanned".

---

## 11. `--tag` twice is an error, not "last one wins"

**Chosen.** `util.parseArgs` is configured with `multiple: true` so a repeat is
visible here, and the invocation is rejected with a message naming both values.

**Why.** `parseArgs` with `multiple: false` silently keeps the last value, which
discards something the user explicitly asked for. Multi-tag semantics are
genuinely ambiguous (AND or OR?) and the task does not specify, so inventing one
would be worse — but the ambiguity is a reason to refuse, not a reason to
quietly pick.

Rejecting also keeps the door open: adding `--tag a --tag b` with defined
semantics later is a purely additive change, whereas shipping "last wins" and
then changing it would break whoever relied on it.

**Library:** `personal:R2` (No silent failures or data loss) for refusing to
drop the value; `code-common:CP11` (API surface is a commitment) — "Prefer
additive changes… over breaking ones" — for leaving the meaning unclaimed rather
than defining it badly now.

---

## 12. Directory symlinks are not followed; file symlinks are

**Chosen.** A `*.md` symlink resolving to a regular file is included. A symlink
to a directory is never descended into, even under a `.md` name. A broken `.md`
symlink is reported as a problem.

**Why.** A notes directory containing a link back to its own parent would
otherwise recurse until the process died. Bounding the walk is a correctness
property, not a feature, so it is implemented rather than deferred.

Not following directory symlinks *is* a silent omission, which cuts against
`personal:R2`. I resolved it by documenting the behavior in the README rather
than by emitting a problem entry per skipped link: a deliberately skipped link
is not a failure, and reporting it as one would push the exit code to `2` on a
perfectly healthy tree, which would teach callers to ignore `2`.

**Library:** `code-common:CP12` (Be aware of state; don't wander into bad
states) for bounding the walk; `personal:V2` (Transparency) — "When corners are
cut or trade-offs made, document them explicitly" — for how the omission is
handled. `code-common:CH2` (Deferral decision tree): "If a feature is needed for
stability or correctness: implement now."

---

## 13. A directory that cannot be read is a problem entry, not a fatal error

**Chosen.** An unreadable subdirectory is reported like a malformed file and the
walk continues. Only an unreadable or non-directory *root* aborts, with exit
`1`.

**Why.** Requirement 6's principle — one bad file must not stop the run —
applies just as much to one bad directory. But a root that cannot be read means
there is no report to produce at all, and that is a different situation for the
caller, so it gets the usage exit code and a message on stderr. Both paths are
covered by tests that create a `chmod 000` directory.

**Library:** `code-common:CP12` (Be aware of state; don't wander into bad
states) — "For each failure ask: what is the consequence, does the user need to
know, can we recover, should we stop… Prefer explicit handling with clear
messages over blanket strategies." Two failures, two answers.

---

## 14. Nothing is excluded by name — no `.git`/`node_modules` skip list

**Chosen.** Every `.md` file under the named directory is reported, whatever
directory it sits in.

**Why.** Considered: skipping dotted directories and `node_modules`, which is
what most tools do and is usually what someone wants. Rejected because it is a
silent omission from a report whose entire job is to say what is in a directory,
and because the "usually" hides real cases (notes kept in a `.notes/` folder).
Narrowing the directory is already available and is explicit.

**Library:** `personal:R2` (No silent failures or data loss) and `personal:V4`
(User autonomy) — "The system provides options and defaults; the user decides."
`code-common:CH2` (Deferral decision tree) kept `--exclude` out: no concrete use
case yet, and the README names the gap.

---

## 15. Case-insensitive `.md` matching

**Chosen.** `.md`, `.MD`, `.Md` all match.

**Why.** On a case-insensitive filesystem the same file can present either way,
and a report that omitted `NOTES.MD` would be omitting a Markdown file that is
plainly there. It errs toward including files rather than dropping them.

**Library:** `personal:R2` (No silent failures or data loss), read as: when a
rule's boundary is ambiguous, prefer the reading that does not drop data.
`code-common:CP9` holds the extension list in `MARKDOWN_EXTENSIONS` so adding
`.markdown` is a one-line change.

---

## 16. Word count is `wc -w` on the body, and the README says so

**Chosen.** Count of whitespace-delimited tokens in the body with frontmatter
excluded. Markdown punctuation counts: `# Heading` is two words, `- item` is
two.

**Why.** Requirement 3 says "word count" without defining it, and every
candidate definition (strip syntax? count list bullets? expand links?) is
defensible and none is obviously right. The dumb definition is predictable,
matches a tool the user already has, and — critically — is *stated*, so nobody
has to reverse-engineer it from output. A prose-aware count would be a better
number and a worse contract, because its rules would be invisible.

**Library:** `personal:V1` (Simplicity) — "the simplest approach that meets the
requirement"; `personal:V2` (Transparency) for documenting the definition
instead of leaving it implicit. Tests assert the documented edge cases so the
README and the code cannot drift apart.

---

## 17. Title falls back to the file name *including* the extension

**Chosen.** Absent `title` yields `beta.md`, not `beta`.

**Why.** "The filename if absent" read literally. It also makes the fallback
visible at a glance in the table — a row reading `beta.md` is obviously a file
without a title, where `beta` looks like someone's actual title.

**Library:** none. Judgment call on a literal reading of the requirement.

---

## 18. Sort in code-unit order, not locale order

**Chosen.** Plain `<` comparison on the relative path, not `localeCompare`.
`UPPER.MD` therefore sorts before `alpha.md`.

**Why.** `localeCompare` makes the output depend on the machine's locale, so the
same tree would produce different reports on different machines and diffing two
runs would be unreliable. Reproducibility beats alphabetical prettiness for a
report that is going to be piped, committed, and compared. The consequence is
documented since it is visible in the output.

**Library:** `personal:P20` (Prefer machine-consumable forms where easy) —
deterministic output is what makes the report diffable; `personal:V2` for
documenting the visible side effect.

---

## 19. Relative, `/`-separated paths in output

**Chosen.** Paths are always relative to the directory the user named, always
with forward slashes, including on Windows.

**Why.** Relative paths are what requirement 3 asks for and what makes output
independent of where the tool was run. Normalizing the separator keeps the table
and the JSON identical across platforms, which is what makes the end-to-end
tests meaningful anywhere.

**Library:** `personal:P20` (Prefer machine-consumable forms where easy).

---

## 20. Module split: cli / scan / parse / report / render / constants / index

**Chosen.** Six small modules plus a thin `index.ts` that does nothing but argv
in, text out, exit code.

**Why.** Each module is one stage of one pipeline, and the whole pipeline is
readable in `report.ts` in about ten lines. Each stage is also independently
testable without the others: `summarizeNote` needs no filesystem, `parseArguments`
needs no process, `renderReport` needs no I/O.

The alternative — one file — was tempting at this size and rejected because the
seams here are not speculative: they are the stages the requirements already
name (find files / parse frontmatter / filter / format).

**Library:** `code-common:CP1` (One contiguous block) — a change to how
frontmatter is validated touches only `parse.ts`; `code-common:CP13`
(Testability is a design constraint) — "How something will be tested is a design
input, not an afterthought"; `personal:H1` (Extraction timing) — "If the
boundary between two concerns is clean and natural, extract now", which is what
kept this from being over-split into a plugin architecture.

---

## 21. `main()` returns an exit code instead of calling `process.exit`

**Chosen.** `main(argv, io)` takes its output streams as parameters and returns
a number; only the entry-point guard at the bottom of `index.ts` touches
`process`.

**Why.** It makes the entire CLI — flags, exit codes, stderr vs stdout — testable
in-process without spawning, which is why there are eight in-process end-to-end
tests on top of the two spawned ones; asserting on stderr and on an exit code
through a child process alone would have been slow enough to discourage writing
them. Setting `process.exitCode` rather than calling `process.exit()`
also lets stdout flush, which `process.exit()` can truncate on a pipe.

**Library:** `code-common:CP13` (Testability is a design constraint) and
`code-common:CP3` (Explicit over implicit) — the streams are in the signature
rather than reached for globally.

---

## 22. Bounded read concurrency (32) rather than `Promise.all` over every file

**Chosen.** Files are read in batches of `READ_CONCURRENCY = 32`.

**Why.** `Promise.all` across a large notes tree opens every file at once and
fails with `EMFILE` — a failure that appears only at scale, i.e. on the user's
real directory and not in the fixtures.

**Library:** `code-common:CP12` (Be aware of state; don't wander into bad
states) and `code-common:CP9` (Named constants for everything configurable) —
the limit is a named constant with the reason attached, not a `32` in a loop.

---

## 23. Every tunable value in `src/constants.ts`; no config file

**Chosen.** Extensions, delimiters, column headings, exit codes, concurrency
limit, and the `gray-matter` options all live in one named-constants module.
There is no config file, no `--config`, and no plugin seam.

**Why.** `code-common:CP5` asks for configuration infrastructure early, and I
deliberately stopped short of a config file. The named constants deliver what
CP5 is actually protecting against — "magic constants interwoven in code are
harder to separate after the fact" — while a config file for a tool with three
flags has no consumer asking for it.

**Library:** `code-common:CP9` (Named constants for everything configurable) and
`code-common:CP5` (Configuration infrastructure early, defaults always), bounded
by `code-common:CH2` (Deferral decision tree): "If a feature is speculative with
no concrete use case: defer entirely with no flex points." `personal:V1`
(Simplicity) agrees.

---

## 24. TypeScript with strict mode plus `noUncheckedIndexedAccess`

**Chosen.** `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
`verbatimModuleSyntax`; `npm run typecheck` is clean. External data enters as
`unknown` and is narrowed by explicit validators.

**Why.** The task fixed the language, but not the strictness. The
`noUncheckedIndexedAccess` flag in particular is what forced the array and
column-width accesses in `render.ts` to handle absence explicitly instead of
trusting an index.

**Library:** `code-common:CP7` (Strict typing) — "Type hints on all function
signatures… TypeScript over JavaScript." `code-common:CP16` (Language selection
is an effort decision) did not apply: the language was given.

---

## 25. Discriminated union (`NoteSummary | NoteProblem`) instead of nullable fields

**Chosen.** One `kind` field discriminates the two outcomes; a summary always
has a title, tags, and a word count, and a problem always has a reason.

**Why.** It makes "reported but not summarized" a state the type system knows
about, so a renderer cannot forget the problem case — the third possible
outcome, a file quietly dropped, is not representable. The `null`s appear only
at the JSON boundary, where they are a deliberate statement to the consumer
(decision 9).

**Library:** `code-common:CP3` (Explicit over implicit) — "Enums over string
literals… No hidden state"; `personal:R2` (No silent failures) for making the
drop-it-silently path unrepresentable rather than merely avoided.

---

## 26. Unit tests plus an end-to-end test that runs the documented command

**Chosen.** 58 tests across five files: `parseArguments`, `summarizeNote`/
`countWords`, `renderReport`/`renderJson`, the scan and report pipeline against
a fixture tree, and end-to-end runs through `main()`. Two of the end-to-end
tests spawn `npx tsx src/index.ts` as a real child process and assert on its
stdout and exit status.

**Why.** The in-process tests are fast and cover behavior; the spawned ones
cover the thing the README tells a user to type. Those are not the same claim —
module resolution, the entry-point guard, and the exit code all only exist in
the real process. Verifying the entry-point guard mattered here specifically,
since `import.meta.filename === process.argv[1]` is the kind of thing that works
under one runner and silently no-ops under another.

**Library:** `code-testing:TP1` (Tests for all code, unit and end-to-end) —
"Code shipped without tests is unverified, not done"; `personal:P13` (Verify in
the production runtime, not just the test harness) — "Green tests are not proof
of working software"; `personal:R1` (Verify before claiming correctness).

---

## 27. Temporary test trees are created under `tests/.tmp/`, not the system temp dir

**Chosen.** Tests needing symlink loops or `chmod 000` directories `mkdtemp`
inside `tests/.tmp/` (gitignored), and restore permissions afterward.

**Why.** Those tests write to and change permissions on real directories. Keeping
them inside the project means the blast radius of a bug in a test is the project
directory, and cleanup never reaches outside it.

**Library:** `ai-common:P5` (Size limits to accidents, not adversaries) — "Add
isolation… where an accident would be costly to undo." The threat model here is
a mistake, not an attacker.

---

## 28. No `bin` entry in `package.json`

**Chosen.** Removed. The README documents three invocations, all of which I
actually ran: `npx tsx src/index.ts`, `npm run noteview --`, and `./src/index.ts`
via its shebang.

**Why.** A `bin` field advertises an install path (`npm link`, global install)
that I did not test and could not test without writing outside this directory.
Shipping an untested claim in the manifest is worse than omitting the
convenience.

**Library:** `personal:R1` (Verify before claiming correctness) — "No trust. Zero
trust. Verify everything"; `ai-common:C2` (AI agents reproduce patterns from the
working tree) — a manifest entry that does not work is exactly the misleading
artifact that gets copied forward.

---

## 29. Known limitations written down rather than papered over

**Chosen.** The README has a "Known limitations" section naming three: the
unterminated-frontmatter edge case that can yield `words: 0`, the absence of
`--exclude`, and the non-prose word count.

**Why.** The unterminated-frontmatter case is the interesting one. Catching it
would mean reimplementing the delimiter scan `gray-matter` already owns, and any
divergence between my scan and its scan produces *false* "malformed" reports on
valid files — trading a rare wrong number for a rare wrong accusation. I priced
the fix, declined it, and said so, with the tell (`words: 0`) documented so a
user can recognize it.

**Library:** `personal:V2` (Transparency) — "Never pretend fundamental
limitations are solvable through cleverness. When corners are cut or trade-offs
made, document them explicitly"; `personal:H8` (Buy reversibility when it costs
less than proof) — "Record that the validation was priced and declined, and what
would trigger doing it after all." `code-common:CH1` is the reason not to
duplicate the library's parsing logic in the first place.

---

## 30. No scaffolding or stub implementations

**Chosen.** Every code path in `src/` does its real work. Nothing throws
"not implemented" and no feature is half-wired.

**Why.** Requirement-complete or absent, with the absences named in the README
under "Known limitations". Stubs read as finished code to the next reader.

**Library:** `code-common:CR2` (No scaffolding without explicit verification) —
"If scaffolding or placeholder implementations are ever created, the
implementing agent MUST have record of explicit, verbatim, quoted verification
from the user that scaffolding is desired. No exceptions." No such verification
exists here, so there is none.

---

## Elements that were checked and did not apply

Recorded so the next reader knows they were considered rather than missed.

- **`code-common:CP15`** (Swappable persistence behind an abstraction) — there
  is no persistence; the tool reads and prints.
- **`code-web:WP1`, `WP3`, `WP4`, `WR1`** — no DOM, no HTML, no browser.
- **`code-realtime:*`** — no real-time loop, no peers, no host authority.
- **`personal:V6`** (Pluralist anti-realism) — no interpretive frames are
  represented here. The closest thing is the word-count definition, which is
  one arbitrary convention among several; it is named as such in the README
  rather than presented as *the* word count.
- **`personal:H5`** (Disambiguate-then-surface gate) — the gate did not fire.
  Every decision above followed from existing elements, so per `personal:P15`
  none of them warranted escalation to a human. The two that came closest to
  ambiguous — coercing field-level type mismatches (decision 5) and multi-`--tag`
  semantics (decision 11) — were both resolved by `personal:R2` pointing
  unambiguously at refusing to guess.
