# Design decisions

Every choice made while building `noteview`, why it was made, and whether the
project's GVP library decided it.

The library was consulted with:

```sh
cairn --library ./.gvp/library query --format compact
cairn --library ./.gvp/library inspect code-common:CH1   # and others
```

Element ids below are the ones actually relied on, not a decorative citation
list. Where the library had nothing to say, the section says so.

---

## 1. No CLI framework: `node:util` `parseArgs`

**Chose:** the argument parser built into Node 22, not `commander`/`yargs`.

**Why:** the whole surface is one positional and three flags. A framework's
useful portion here is well under 200 lines of behaviour, which is the explicit
threshold for writing it yourself — and the built-in is even cheaper than
writing it.

**GVP:** yes — `code-common:CH1` (dependency adoption threshold), reinforced by
`personal:V1` (fewer moving parts).

## 2. `yaml` *is* worth a dependency

**Chose:** the `yaml` package for parsing the frontmatter block.

**Why:** the same CH1 test comes out the other way here. The useful portion is
not "split on colons" — it is quoted and escaped scalars, block and flow
sequences, nested mappings, block scalars (`>`/`|`), comments, and *positional
error reporting*. Requirement 6 ("malformed frontmatter must be reported") is
only meaningful if something can actually tell malformed from valid, which a
hand-rolled splitter cannot: it would accept garbage silently, which is the
failure mode `personal:R2` exists to prevent. `yaml` is also a very
high-bus-factor package.

**GVP:** yes — `code-common:CH1` applied and deliberately *not* satisfied;
`personal:R2` (no silent failures) is what tips it.

## 3. Tests on the built-in runner

**Chose:** `node --test` with `tsx`, no Vitest/Jest.

**Why:** same threshold argument as §1; zero extra dependency for a runner with
describe/it, and it runs the TypeScript sources directly.

**GVP:** yes — `code-common:CH1`; `code-common:CP13` (testability is a design
constraint) is what made "does the toolchain support testing out of the box" a
selection criterion rather than an afterthought.

## 4. Six small modules, split along concern boundaries

**Chose:** `config` / `frontmatter` / `note` / `scan` / `render` / `index`.

**Why:** each boundary is clean and obvious (pure text handling, what a note
*is*, filesystem IO, output form, CLI wiring), and each change to the tool lands
in exactly one of them: a new output format touches only `render.ts`, a new
frontmatter field only `note.ts`. Splitting on unclear boundaries would have
been premature, so nothing is split further than that.

**GVP:** yes — `code-common:CP1` (one contiguous block per change) and
`personal:H1` (extract now when the boundary is clean and natural, wait when it
is not).

## 5. Pure core, IO at the edge

**Chose:** `readNote(path, source)` and both renderers are pure functions;
only `scan.ts` and `index.ts` touch the filesystem or the process.

**Why:** every rule about titles, tags, fences and word counts is then testable
from a string literal, with no temp directories. That is why the unit tests
cover odd YAML shapes so cheaply.

**GVP:** yes — `code-common:CP13` (how it will be tested is a design input).

## 6. One constants module, no config file

**Chose:** every magic value (extension, fences, exit codes, column gap, tag
separator) lives in `src/config.ts`. There is no config *file* loader.

**Why:** constants interwoven with logic are hard to separate later, so they
were centralised from the start; but a config file has no concrete use case, so
building one would be speculative. The flex point is "one module owns the
defaults", which makes adding a loader later a local change.

**GVP:** yes — `code-common:CP9` (named constants for everything configurable)
and `code-common:CP5` (configuration infrastructure early, defaults always),
bounded by `code-common:CH2` (speculative feature with no use case: defer
entirely).

## 7. `tags` is `string[] | null` — unknown is not empty

**Chose:** `tags: null` when the frontmatter could not be parsed, `[]` when it
parsed and had no tags. The table shows `?` versus blank; JSON shows `null`
versus `[]`.

**Why:** these are different claims about the file, and collapsing them would
quietly discard the fact that we do not know. It also makes the `--tag`
filtering rule (§8) expressible without a side-channel flag.

**GVP:** yes — `personal:V5` (never silently discard or strand data; unknown is
preserved, not filtered).

## 8. Malformed files are reported *and* kept, except under `--tag`

**Chose:** a malformed file always produces a stderr line and always appears in
the unfiltered report (with its body word count and `?` tags). When `--tag` is
given it is *excluded* from the rows — because we cannot claim it carries the
tag — and a second explicit stderr line names the exclusion.

**Why:** this was the one genuinely ambiguous point in the requirements. Keeping
such a row *in* a `--tag draft` result would assert something false; dropping it
silently would hide a problem from someone whose filter result is incomplete. So
the row is withheld and the withholding is stated. Requirement 6 is satisfied in
both modes, independent of filtering, and the run always finishes.

**GVP:** yes — `personal:R2` (failures surfaced, not swallowed) and
`personal:V2` (be honest about limitations; a clean facade helps no one), with
`code-common:CP12` (know what state you are in) driving "state it rather than
infer it".

## 9. Three exit codes

**Chose:** `0` clean, `1` report produced but some files had problems, `2`
nothing ran (bad arguments or unusable directory).

**Why:** the interesting distinction is not success/failure but *which state the
run ended in* — a completed report with a broken file is not the same as a run
that never happened. Both are machine-detectable without parsing text.

**GVP:** yes — `code-common:CP12` (never wander into an unexpected state; ask
per failure whether the user needs to know and whether we can continue) and
`personal:P20` (prefer machine-consumable forms where easy).

## 10. `--json` is a superset of the table

**Chose:** the JSON objects carry the table's four fields plus `problems`.

**Why:** a program consuming `--json` should not have to scrape stderr to learn
that a file was broken. The extra key is strictly additive, and the table's four
columns are all present, so "the same data" still holds.

**GVP:** yes — `personal:P20` (machine-consumable forms) and `personal:R2`
(problems must reach whoever is consuming the output).

## 11. Title fallback keeps the extension

**Chose:** when `title` is absent, the title is the file's name *with* its
extension (`delta.md`), not the prettier `delta`.

**Why:** the requirement says "the filename if absent". Stripping the extension
is my taste, not the spec; a stated requirement outranks taste, and the
alternative is recorded here rather than silently substituted. (Requirement
versus implementation-detail test: "title falls back to the filename" survives a
rewrite in another language, so it is a requirement.)

**GVP:** yes — `personal:P3` (separate what from how; requirements specify
behaviour) and `personal:V2` (document the trade-off instead of hiding it).

## 12. A scalar `tags` is one tag; commas are not separators

**Chose:** `tags: draft` → `["draft"]`; `tags: x, y` → `["x, y"]`.

**Why:** accepting a bare scalar covers a very common way people write a single
tag, at no cost. Splitting on commas would invent a syntax YAML does not have
and would turn one unusual tag into two wrong ones — a silent corruption, in a
tool whose whole job is reporting what the files say.

**GVP:** yes — `personal:V1` (simplest thing that meets the requirement; no
invented syntax) and `personal:R2` (no silent data loss).

## 13. Non-scalar `title`/`tags` values are reported, not fatal

**Chose:** `title:` holding a list, or `tags:` holding a mapping, produces a
per-file problem line and a documented fallback; the frontmatter itself is still
considered readable.

**Why:** "the YAML is broken" and "one field has the wrong shape" are different
problems and deserve different handling. Treating a wrong-shaped field as total
malformation would throw away the fields that *were* fine.

**GVP:** yes — `personal:V5` (do not strand the data that was readable) and
`code-common:CP12` (handle each failure on its own terms rather than applying a
blanket strategy).

## 14. Dot entries skipped by default, `--include-hidden` to opt back in

**Chose:** skip any entry whose name starts with `.` unless the flag is given.

**Why:** this was the second real judgement call. Scanning `.git` and
`.obsidian` for `.md` files produces noise that drowns the report, so skipping
is the right default. But the default *withholds data*, and withholding without
a way to ask for it is exactly the thing the library forbids — so the default
came with the flag attached, and both are documented. The rule is applied
uniformly to files and directories rather than only to directories.

**GVP:** yes — `personal:V4` (system provides defaults, the user decides;
prefer opt-in) and `personal:V5` (nothing is unrecoverably withheld) outweighing
`code-common:CP11` (every flag is a commitment — noted, and it is why this is
the *only* discretionary flag). `personal:P9` (follow rules uniformly) is why
hidden files are treated like hidden directories.

## 15. Sort in code-unit order, not locale order

**Chose:** plain `<`/`>` comparison on the relative path, not
`localeCompare`.

**Why:** identical input must produce identical output on every machine and
under every `LANG`, which a locale-sensitive collator cannot promise. The
visible cost is that uppercase paths sort first; that is documented.

**GVP:** yes — `personal:P20` (machine-consumable output — reproducible bytes
are what make the output diffable and pipeable).

## 16. Symlinks are never followed

**Chose:** recurse only into real directories (`dirent.isDirectory()`), which
excludes symlinks for free.

**Why:** a symlink loop would otherwise hang the walk forever, and a linked file
would be reported twice under two paths. Both are bad states reachable by
accident in a real notes directory.

**GVP:** yes — `code-common:CP12` (never wander into an unexpected bad state).

## 17. IO failures are data, not exceptions

**Chose:** `scanNotes` returns `{ notes, errors }`; an unreadable file or
directory adds an `errors` entry and the walk continues.

**Why:** one permission-denied subdirectory must not end the run, and it must
not disappear either. Same rule as §8, applied to the filesystem.

**GVP:** yes — `personal:R2` (surfaced, not swallowed) and `code-common:CP12`.

## 18. Cells are collapsed, never truncated

**Chose:** multi-line titles are collapsed to one line for the table; nothing
is ever cut short, even if it makes the table wide.

**Why:** a wide table is ugly; a truncated one is wrong. Only one of those is a
correctness problem.

**GVP:** yes — `personal:V5` (do not discard user data) as the tie-breaker
against the prettier option.

## 19. `process.exitCode`, and EPIPE is a normal ending

**Chose:** set `process.exitCode` rather than calling `process.exit()`, and
swallow `EPIPE` on stdout.

**Why:** `process.exit()` can truncate a large piped report before stdout
flushes — losing output while reporting success. And `noteview dir | head` is a
normal thing to do, not a crash.

**GVP:** yes — `personal:R2` (data must not be silently lost) and
`code-common:CP12` (a closed pipe is a known state, handled explicitly).

## 20. Plain object types, no schema library, no classes

**Chose:** `type Note = { ... }` with inference doing the rest; no `zod`, no
model classes, annotations only on exported boundaries.

**Why:** the only untrusted input is the YAML, and it is validated by hand in
one place (`note.ts`) with human-readable problems — a schema library would
produce worse messages here and add a dependency for it.

**GVP:** yes — `code-common:CP7` (inferred typing; plain objects for internal
shapes; a checker only where a boundary genuinely needs one).

## 21. Unit tests *and* an end-to-end test that spawns the real command

**Chose:** 62 tests: pure-unit coverage of parsing/notes/rendering/scanning,
plus `tests/cli.test.ts` which spawns `npx tsx src/index.ts` in a child process
and asserts stdout, stderr and exit codes.

**Why:** unit tests pin the rules; only the spawned run proves the entry point
the README documents actually works in the runtime a user will use — green unit
tests would not have caught, say, a module-resolution or top-level-await
problem in `index.ts`.

**GVP:** yes — `code-testing:TP1` (unit *and* end-to-end; untested code is
unverified, not done) and `personal:P13` (verify in the production runtime, not
just the test harness).

## 22. The fixture library contains deliberately awkward files

**Chose:** `tests/fixtures/notes` ships a malformed file, an uppercase `.MD`,
a hidden directory, a `.txt`, a tags-as-scalar file and a no-frontmatter file.

**Why:** the awkward cases are the ones with judgement in them (§8, §11, §12,
§14), so they are the ones that need to be pinned by an executable definition of
success rather than by prose.

**GVP:** yes — `code-testing:TP2` (the test is the executable definition of
success).

## 23. No `bin` entry and no shebang

**Chose:** the documented entry points are `npx tsx src/index.ts <dir>` and
`npm run noteview -- <dir>`. An earlier draft had `"bin": {"noteview":
"src/index.ts"}` plus a `#!/usr/bin/env -S npx tsx` shebang; both were removed.

**Why:** a `bin` pointing at a `.ts` file only works if the consumer happens to
have `tsx` resolvable, and `env -S` is not portable. It would have been an
affordance that looks supported and is not — exactly the kind of misleading
artifact that makes later readers (human or agent) build on a false assumption.

**GVP:** yes — `ai-common:C2` (agents reproduce whatever patterns are visible;
misleading artifacts cause incorrect work) and `personal:V2`.

## 24. No output-format registry, no multi-tag filtering

**Chose:** two renderers behind a `Note[] => string` shape, selected by an
`if`. No plugin registry, no `--format`, no repeated `--tag`, no negation.

**Why:** the seam that matters (rendering is a pure function of the note list)
exists, so a third format is a small additive change. A registry for two
formats, or a filter expression language nobody asked for, would be complexity
that has not earned its place.

**GVP:** yes — `code-common:CH2` (speculative, no concrete use case: defer
entirely with no flex points) and `personal:P1` (shape the architecture so the
change is not painful, but do not implement it early).

## 25. Checks are npm scripts, not hooks

**Chose:** `npm run typecheck`, `npm test`, `npm run check`.

**Why:** the preference is for a mechanical gate (hook/CI) over a documented
convention, and this is short of that: this directory is not its own git
repository, so a pre-commit hook has nowhere to live. `npm run check` is
one command that does both, which is the best available approximation.
Recording the gap rather than claiming the principle is satisfied.

**GVP:** partially — `code-common:CP10` (prefer hooks/CI/validators over
convention) is the target and is *not* fully met; `personal:V2` requires saying
so instead of implying otherwise.

---

## Choices the library did not decide

These were taste, and the library is silent on them. They are listed so that a
later reader does not mistake them for derived decisions.

- Column order (`PATH TITLE TAGS WORDS`), two-space column gap, uppercase
  headers, right-aligned word count, and the `?` character for unknown tags.
- The trailing `6 of 6 files` summary line in table mode (and its absence in
  `--json`, which must stay parseable).
- Wording of the help text, problem messages, and the `noteview: ` prefix.
- Accepting `...` as a closing fence in addition to `---` (YAML allows it; it
  costs one alternation in a regex).
- Case-insensitive extension matching, so `README.MD` is a note.
- Reading whole files rather than streaming, noted as a limitation in the
  README.

## Note on the working tree

Running `cairn --library ./.gvp/library query` created `.gvp/config.yaml` with a
generated `project_id`. That file is cairn's, not mine; it was left in place.
