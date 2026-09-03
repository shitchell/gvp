# Central registry of every library cairn resolves

**Date:** 2026-09-03
**Issue:** [#15](https://github.com/shitchell/gvp/issues/15)
**Amends:** D22 (opt-in global project registry) and D21 (one-time-write contrast).
**Related:** [#16](https://github.com/shitchell/gvp/issues/16) (portable library UUID) —
non-blocking; this design reads `library_id` if present.
**Revision:** rev 2, after fidelity check + adversarial review. Changes from rev 1 are
listed under *Review corrections* at the end.

**Motivation:** there is no way to ask *"which GVP libraries exist on this machine,
and which has this project seen?"* Cairn resolves libraries constantly — local
`.gvp/` directories, `inherits:` sources fetched over git — but records nothing.
An agent starting a new project cannot discover that the element it is about to
author already exists upstream.

The filed incident is concrete: a session hand-authored ~48 elements for a new
project and flagged three as having unrecoverable rationale. All three already
existed in `~/.gvp/library`. One derived substitute was *wrong* and propagated into
project guidance before a human caught it. Discovery depended on the human
remembering to mention the library existed.

## Why not a filesystem scan

A scan of configured roots was considered and rejected. "Configured roots" means the
user must have configured them correctly — which is the same *"depends on a human
remembering to set it up"* failure the issue was filed about. It also cannot see
libraries outside the scanned roots, cannot surface a remote that was never fetched,
and cannot distinguish a live project from a build sandbox or a `skel/` template. A
scan of `$HOME` on the author's machine returns 27 directories, several of them noise
of exactly that kind.

Recording what cairn *actually resolved* requires no configuration, sees what was
really used, and naturally excludes directories cairn was never run against.

## Model

Two keyspaces under `~/.gvp/registry/`, split by **write shape** rather than by
subject matter:

```
~/.gvp/registry/
  by-id/<project_id>.yml       # D22 project entries, extended with `libraries:`
  libraries/<hash>.yml         # NEW — library facts
```

`GVP_REGISTRY_ROOT` addresses the **root**, not the `by-id` keyspace.
`getRegistryDir()` currently returns `path.join(override, 'by-id')`, conflating the
two; it must be split into `getRegistryRoot()` and per-keyspace accessors.

The split exists because concurrent invocations are normal (parallel agent sessions),
and the two kinds of fact behave differently under contention:

- **Library facts** — `name`, `source`, `document_path`, `file`, `scope`,
  `element_counts`, and the correlation fields. Every writer derives these purely
  from the library's *current content*. Two writers observing the same library state
  produce byte-identical output.
- **The usage edge** — which project resolved which library, and when. Writers
  differ, so it lives in the project's own file.

**All timestamps live on the usage edge, never on the library entry.** This is what
makes the identical-content property literally true; see *Split registry writes by write-shape*.

#### Entry shapes

Library facts, `~/.gvp/registry/libraries/<hash>.yml`, where `<hash>` is the first 16
hex chars of the SHA-256 of `source + "\0" + document_path`:

```yaml
name: code-common                 # meta.name — correlation, NOT the key. May be absent.
source: /home/guy/.gvp/library    # inherits: grammar; canonicalized for local
document_path: code/common        # extension-less, matches internal document identity
file: code/common.yaml            # actual filename; .yaml vs .yml is not derivable
scope: universal                  # meta.scope, when declared
project_id: 7796ad76-…            # correlation, when the library sits in a project
library_id: null                  # correlation; read-if-present, see #16
element_counts:                   # per category, including user-defined categories
  principles: 15
  heuristics: 2
  rules: 2
```

Remote entries differ only in `source`:

```yaml
name: personal
source: '@github:shitchell/gvp-docs@v0.7.0'
document_path: personal
file: personal.yaml
```

Not stored, because all are pure functions of `source`: the resolved cache path,
`kind` (local/remote), and `ref` (tag or SHA). The grammar is exactly
`@<provider>:<path>@<commitish>` for remote — there is no plain-HTTP source form,
contrary to #15's description — or a filesystem path for local.

Project entries gain one field:

```yaml
project_id: a2c4dbcb-…
project_name: gvp
locations:
  - path: /home/guy/code/git/github.com/shitchell/gvp
    last_seen: 2026-09-03T11:41:07Z
libraries:                        # NEW — the usage edge, carries the timestamps
  - hash: 3f8a1b2c4d5e6f7a
    first_seen: 2026-06-15T20:02:11Z
    last_seen: 2026-09-03T11:41:07Z
```

`cairn libs show` derives `seen_from`, `first_seen`, and `last_seen` by inverting
across project entries — min and max over the edges pointing at a hash.

## Guiding elements

### Enable reuse of guiding elements across projects

*Goal.* The framework's existing goals cover alignment, review, and consistency
*within* a library. None covers a new project discovering that an element it is about
to author already exists elsewhere. `G10` is adjacent but scoped to within-library
similarity analysis, not cross-library discovery.

### Cairn invocations can run concurrently against shared state

*Constraint.* Parallel agent sessions are how cairn is actually used, including
several sessions in the *same* project. This is a fact about the environment, not a
choice, and any shared-write design must be correct under it.

### Every GVP library carries a portable identity decreed upstream

*Rule.* Every library — local or remote, project-embedded or published standalone —
must carry an identity committed by its author and travelling with its content; a
fetching consumer may only read it, never generate one. The *external fact* is that
consumers cannot agree on a locally minted UUID, which would manufacture false
distinctions between copies of one library — strictly worse than no identity. The
*rule* built on that fact is ours, which is why this is a rule rather than a
constraint. `P17`'s shape ("decreed inputs are not derived") applied to identity.

Not yet enforceable — no field exists to carry it. Tracked as #16; until then it
constrains design rather than data.

### Prefer idempotent writes over locking for shared state

*Principle.* Where concurrent writers necessarily produce identical content,
contention is harmless by construction. Arrange for that property by splitting state
along the axis of what differs between writers — then the correctness argument rests
on the shape of the data rather than on a lock. The property is only real if
maintained deliberately: adding a single per-writer field (a timestamp, a counter)
silently destroys it, and idempotence still requires atomic writes to survive a
concurrent *reader*.

### Record every resolved library in a machine-global index

*Decision.* Every catalog-building invocation records the libraries it resolved —
local `.gvp/` directories and remote `inherits:` sources alike.

### Record every document in the resolved library directory, not only inherited ones

*Decision.* When a library is resolved, every YAML document in it is recorded, not
only the documents the current project actually inherits. This is what the existing
`sourceLoader` already does (`findYamlFiles(resolvedDir)` caches the whole directory),
and it is load-bearing for the goal: a project that inherits only `code-testing` from
`~/.gvp/library` would otherwise never index `personal` — and `personal` is exactly
where the three elements in the filed incident lived. Recording only what was
inherited would make the feature architecturally unable to solve its own motivating
case while appearing to work.

### Hook recording at catalog construction, not per-command

*Decision.* `buildCatalog()` (`src/cli/helpers.ts:132`) is the single choke point for
library loading — 11 of 12 commands call it; only `init` does not, and it creates
rather than loads. It holds the resolved `libraryDir` (across `--library`, `--store`,
and cwd walk-back), `sourceDocCache`, the resolver, `meta.name` per document, and
per-document element counts.

It does **not** hold project identity. `runProjectPreflight` is called inside
`parseConfigOptions` (`src/cli/helpers.ts:56`), whose return type is
`{ config, configOptions }` — the `PreflightResult` is consumed at line 88 and
discarded. Recording therefore requires a plumbing change: `parseConfigOptions` must
return the `PreflightResult`, and it must reach `recordLibraries`. Per-command hooks
were rejected as drift-prone, but the single-choke-point claim is true of library
loading only, not of project identity.

### Library recording defaults on, with a named opt-out

*Decision.* Amends D22. The opt-in default was **falsified by evidence**:
`registry.enabled` was set in no config layer and `~/.gvp/registry/` did not exist ~5
months after D22 landed. `gvp:C1` ("Agents optimize for minimal effort") already
ratifies why — agents do not enable flags they do not know exist, which is the
incident in #15. `gvp:P7` is served by the escape hatch and a clearable location
rather than by a default-off flag, per `gvp:P8` ("Opinionated defaults with escape
hatches").

The opt-out has two surfaces, both of which gate **writes only** — `cairn libs`
always reads:

- `registry.enabled: false` in any config layer
- `--no-registry` for a single invocation, which CI and sandboxes need since they
  cannot always edit config

Flipping the default is not a one-word change: the schema is
`registry: z.object({ enabled: …default(false) }).optional()`, and omitting
`registry:` yields `undefined`, so `config.registry?.enabled` stays falsy regardless
of the inner default. The object needs `.default({})` as well, and the schema comment
("Off by default because it introduces write side effects") must be rewritten.

### One registry flag governs both project and library recording

*Decision.* `registry.enabled` governs both D22's project entries and the new library
entries. A separate `registry.libraries.enabled` was rejected: the usage edge lives
*in* project entries, so a default-off project registry would silently drop it, and
two project-keyed stores side by side is the redundant-mechanism smell `gvp:P11`
exists to catch.

### Index unit is the document, not the library directory

*Decision.* `~/.gvp/library` is six named documents; this repo's library is `gvp` +
`v0`. References resolve as `personal:P16`, so the document is the unit that makes a
search result directly citable.

### Entries are keyed by source identity, not by name or UUID

*Decision.* The key is `source + document_path` — unique after canonicalization,
always available, and requiring no new identity concept. `name` is not unique:
`personal.yaml` appears in 16 locations on the author's machine, 6 of them cached
`gvp-docs` refs. A library UUID would be the natural key but does not exist
(`documentMetaSchema`, `src/model/document-meta.ts:46`) and cannot be minted locally.

Keying on `source` rather than on the resolved filesystem path matters for remote
libraries, whose resolved path embeds a cache directory that is subject to eviction
and relocation. (Rev 1 justified this by `GitSourceResolver`'s cacheDir constructor
override; that override is reachable only from tests, so the justification is
eviction and future relocation, not the override.)

### Local libraries are keyed by resolved filesystem path, not by the source string

*Decision.* For **local** libraries the key is the resolved absolute filesystem path
of the document — the resolver's own output, symlinks resolved — not the `source`
string the caller typed. For **remote** libraries the filesystem path is a *cache
location* rather than an identity, so they keep the `@provider:path@commitish` spec.

Using the raw source string for local libraries fails four ways:

- **Dual lookup.** `LocalSourceResolver` maps `<p>`, `<p>/gvp`, and `<p>/.gvp/library`
  onto the same library directory — three strings, one library, three entries.
- **Tilde.** `expandTilde` runs in the CLI before `resolve`, but `sourceDocCache` is
  keyed by the raw `~/…` string, and `path.resolve` does not expand `~`.
- **`config.source`.** The root library's source is `config.source ?? '@local'`, and
  `source` is a free-form string. Two unrelated projects both setting
  `source: mylib` would collide on one hash and overwrite each other.
- **Symlinks.** Two paths to one library are two keys.

Each of those is a property of the source *string*, and each disappears once the key
is the resolved path — resolving is precisely the step that collapses the dual lookup,
expands `~`, discards `config.source` in favour of a real location, and unifies symlink
aliases. The resolved directory is itself a valid `inherits:` source, so paste-ability
survives.

Note the earlier claim that `LocalSourceResolver` resolves against "the referencing
library's directory" is false at the system level: `createSourceResolver(libraryDir)`
is instantiated once with the **root** library dir and used for every source,
including sources reached transitively. The root library dir is what `recordLibraries`
has, so this is simpler than rev 1 described, not harder.

### Name, project_id, and library_id are correlation fields, not keys

*Decision.* They collapse "same logical library, different locations" when present and
degrade gracefully when absent. `project_id` reuses D21's identity. `library_id` is
read from `meta.library_id`, which already survives parsing today because
`documentMetaSchema` ends in `.passthrough()` — so the forward-compatibility claim for
#16 is stronger than rev 1 stated, and is verifiable rather than aspirational.

Duplicate-looking rows are **expected and correct**: `@…@v0.6.0` and `@…@v0.7.0` are
two entries for one logical library, and collapsing them on `meta.name` would
reintroduce exactly the non-uniqueness this decision rejects. They collapse only when
#16 lands.

### Location is expressed as a source string reusing inherits grammar

*Decision.* `src/inheritance/source-resolver.ts:269` already dispatches a single
`source` string by pattern-matching the `@` prefix, and `documentMetaSchema` names that
key `source`. Reusing it means a registry entry's location is the exact string you
paste into `inherits:` to adopt what you found — the end goal of a search, not an
incidental detail. Inventing a parallel location vocabulary would be the redundancy
`gvp:P11` exists to catch.

### The resolved cache path is derived, never stored

*Decision.* `source` determines the cache path, `kind`, and `ref` as pure functions.
Storing them invites disagreement between the stored and computed values.

### Split registry writes by write-shape

*Decision.* Library facts go to library-keyed files; the usage edge stays in
project-keyed files. Two writers observing the same library state write identical
bytes, so a lost update is a no-op. Two writers observing *different* library states
(the library changed between their catalog builds) write different `element_counts`,
and that resolves last-write-wins — which is correct, since the later observation is
the fresher one.

A single `libraries.yaml` was rejected: every invocation would be a read-modify-write
on one file, losing updates under concurrency. Full inversion — library facts inside
each project entry — was rejected as denormalization, since `element_counts` copies
would drift and enumeration would have to reconcile them.

### Registry writes are atomic

*Decision.* Idempotent content is not sufficient on its own. D22's write path is a
bare `fs.writeFileSync` (`src/config/registry.ts:132`), which is `O_TRUNC` + write, so
a concurrent reader can observe a truncated file. That is not merely a bad read:
`pruneStaleRegistryEntries` **unlinks any entry it cannot parse**, and with the
default flipped it runs for every user on every invocation. A torn read during a
concurrent write would therefore *delete a live entry* — data loss, not a benign lost
update.

All registry writes are therefore `writeFileSync(tmp)` + `renameSync` within the same
directory, making replacement atomic on POSIX. This applies to the existing project
entries as well, which have the same defect today.

### The usage edge is stored project-side and derived by inversion

*Decision.* `seen_from` and the timestamps are computed at read time by walking
project entries, rather than stored on the library entry where a per-writer field
would break idempotence.

The contention property must be stated accurately. D22 gives **no cross-project
collision** — one file per project UUID. It does *not* give freedom from
same-project concurrency, which `C2` declares normal: two sessions in one repo both
read-modify-write the same `by-id/<uuid>.yml`. The usage-edge append is therefore a
**merge** — union by hash, max of `last_seen`, min of `first_seen` — not a blind
rewrite, so a lost update costs at most a stale timestamp rather than a dropped edge.

Additionally, `runRegistryPreflight` is called from `parseConfigOptions`, *before*
`buildCatalog`. Left as-is, each invocation would write the project file twice with a
prune between them, doubling the window. The two writes are folded into one, performed
after catalog construction.

### Ship cairn libs list, show, and search

*Decision.* Supersedes D22's out-of-scope note ("consumers walk the directory
themselves"). That reasoning held for one flat keyspace and stops holding once facts
span two and the usage edge is derived. `gvp:C1` and `gvp:P11` point the same way: an
agent will not reliably hand-roll a two-keyspace YAML walk, and #15's downstream
consumer needs one command to name.

Four things rev 1 left underspecified, each of which had a plausible wrong reading:

- **What `search` matches.** Not "names and statements" — decisions carry `rationale`
  and constraints carry `impact`, so that reading would ship a search structurally
  incapable of matching a decision, which is exactly the content the filed incident
  was about. `search` matches `name` plus each category's **primary field, resolved
  from the schema** via the `D17` mechanism. Hard-coding field names would violate
  `gvp:R6`.
- **Ambiguity in `show`.** Since `name` is explicitly not unique, `cairn libs show
  personal` lists all matches and requires a `<source>:<document_path>` selector when
  more than one exists. Silent first-match would contradict this library's own
  handling of ambiguous references.
- **Uncached remotes.** Resolving an evicted remote triggers `ls-remote` plus a shallow
  fetch, so `search` would silently become N network clones. Default is to skip
  uncached remotes **with a warning naming them**; `--fetch` opts in. Silently
  skipping would reproduce the silent-miss failure #15 was filed about.
- **Output.** The consumer is an agent-facing ruleset, so all three commands support
  `--json` with a stable schema. Human-formatted tables parsed by regex would defeat
  the purpose.

`cairn libs list` takes `--kind` (`local` | `remote`) and `--scope` (any `meta.scope`
string; the vocabulary is user-defined and not enumerated by cairn).

### Prune local entries by document; retain remote entries; provide explicit forget

*Decision.* D22's prune is path-based on the recorded location. For library entries
that is too coarse: the recorded `source` is a *directory*, so deleting or renaming
one document inside a live library would orphan its entry permanently. Local entries
are therefore pruned when **the document file itself** is gone.

Remote entries are retained even when the cache is evicted, since they remain
re-fetchable *while the ref is still served* — a force-push, deleted tag, private repo,
or offline machine all break that, so `show` reports them as not-currently-cached
rather than promising availability. Retention without bound is a real cost: one entry
per document per ref ever fetched. `cairn libs forget <selector>` and
`cairn libs prune --remote` provide the eviction surface. `rm -rf ~/.gvp/registry`
satisfies #15's "trivially clearable" but is not an answer to unbounded growth.

### Registry deletion is safe; rebuild is lossy and incremental

*Decision.* Resolves a conflict between D22 and #15. D22 argues "registry, not cache —
the word cache implies safe to delete and the tool will rebuild, which is not true."
#15 requires "always safe to delete and rebuild." Both are right about different
halves: **deleting breaks nothing, but rebuilding is not automatic** — each library
reappears only when cairn next resolves it. Stating both halves is preferred to
collapsing to either label, per `gvp:V3` and `gvp:P12`.

### Recording failure never fails the command

*Decision.* A read-only `$HOME`, a full disk, or a corrupt entry must never change the
exit code or stdout of the command the user ran. D22 swallowed such failures entirely;
that is amended to **warn at most once per invocation** on stderr, per `gvp:V3` and
#15's "carry on and, at most, warn."

### Library facts are recorded without project context; the usage edge is skipped

*Decision.* `cairn --library /some/path query` outside any project still records
library facts, which are complete on their own. Only the usage edge is skipped. This
diverges from D22's preflight, which no-ops entirely without project context; that
behavior would silently lose every library reached this way.

## Mechanism

1. `parseConfigOptions` is changed to return the `PreflightResult` alongside
   `{ config, configOptions }`, and `runRegistryPreflight` is deferred.
2. `buildCatalog()` completes as today.
3. `recordLibraries(catalog, libraryDir, sourceDocCache, preflightResult, config)`
   runs after it. No-op when `registry.enabled` is false or `--no-registry` is passed.
4. For every document in the local library directory and in every resolved external
   source, it canonicalizes `source`, hashes `source + "\0" + document_path`, and
   writes `~/.gvp/registry/libraries/<hash>.yml` via temp + rename.
5. With project context, it merges the usage edge into the project entry — union by
   hash, min `first_seen`, max `last_seen` — in a single write that also carries
   D22's location upsert.
6. Failures emit at most one stderr warning and return.

## Commands

```
cairn libs list [--kind local|remote] [--scope <s>] [--json]
cairn libs show <name> | <source>:<document_path> [--json]
cairn libs search <query> [--fetch] [--json]
cairn libs forget <selector>
cairn libs prune [--remote]
```

## Deliverable: comment on issue #15

#15 closes by asking that whoever implements it **comment on the issue naming the
registry's path and the command to enumerate it**, because a monitor is polling for
that comment and the downstream `ai-infra` rule cannot be written without it. This is
a required deliverable, not a courtesy:

> Registry root: `~/.gvp/registry/` (`GVP_REGISTRY_ROOT` overrides).
> Enumerate with `cairn libs list`; search with `cairn libs search <query>`.

## Behavioral changes

- `registry.enabled` defaults to `true`. Existing users who never set it will see
  `~/.gvp/registry/` appear, including the project entries D22 would not have written.
- Read-only commands now write to `$HOME` by default. This is the substantive change
  and what the opt-out exists for.
- No change to library resolution, inheritance, or any existing command output.

## Not in scope

- **Caching remote library content** for offline enumeration. #15 ranks this below the
  index; the git source cache covers the common case.
- **A portable library UUID.** Tracked as #16.
- **Organization-scoped libraries.** #15's priority order is personal → *organization*
  → similar projects. Cairn has no org-scope concept; `--scope` filters an arbitrary
  user-supplied `meta.scope` string. Tier 2 of the downstream rule is therefore **not**
  implementable by this work, and that is called out rather than silently dropped.
- **Cross-user or team-shared registries.** Per-user and `$HOME`-scoped, per D22.
- **The multi-user and auditability objections** D22 raised alongside CI sandboxes.
  D55 answers the sandbox half; the other two are accepted costs of the default flip,
  noted here so the trade is explicit rather than overlooked.

## Verification

- Unit: idempotent upsert; canonicalization collapses dual-lookup, tilde, and symlink
  aliases to one key; `config.source` never enters the key; prune drops a deleted
  document but keeps its live siblings; remote entries survive cache eviction.
- Concurrency: N parallel `buildCatalog` runs against one shared library produce a
  single valid entry; a reader running throughout never observes a partial file; two
  concurrent same-project runs both retain their usage edges.
- Resilience: read-only `$HOME`, corrupt entry, and unwritable registry each leave the
  primary command's exit code and stdout unchanged.
- End-to-end: resolve a local library and a remote `@github:` source; `cairn libs list`
  reports both; `cairn libs show` derives `seen_from`; `cairn libs search` matches a
  decision's `rationale`.
- Regression: `tests/config/registry.test.ts:228` — *"is a no-op when registry.enabled
  is false (the default)"* — **will fail** and is rewritten as a default-on test.
  Rev 1 claimed D22's tests pass unchanged; that was false.

## Review corrections

Rev 2 folds in a fidelity check (library-only reading) and an adversarial review.
Material changes:

1. **`gvp:P8` was misquoted** as "Consolidated interfaces over many near-duplicate
   entry points." That is `personal:P8`; `gvp:P8` is "Opinionated defaults with escape
   hatches", and `gvp.yaml` does not inherit `personal`. The citation is repointed to
   `gvp:P11`. This was the most serious defect — a false quotation entering an
   append-only record.
2. **The concurrency argument was false.** Timestamps on the library entry made writes
   non-identical; the write path is non-atomic; and prune deletes unparseable entries,
   making a torn read a data-loss path. Timestamps moved to the usage edge, atomic
   write added as its own decision.
3. **"D22's zero-contention property" does not exist.** D22 gives no cross-*project*
   collision, not freedom from same-project concurrency. Usage-edge append is now a
   merge, and the double-write via `runRegistryPreflight` is folded into one.
4. **`buildCatalog` does not hold project identity.** The plumbing change is now stated.
5. **`source + file` was neither unique nor stable** — dual lookup, tilde,
   `config.source` collision, symlinks. A canonicalization pipeline replaces it.
6. **`search` would have been unable to match a decision.** Now schema-dispatched.
7. **Recording scope** (whole directory vs inherited documents) was undefined and is
   load-bearing; now its own decision.
8. Added: `show` ambiguity, uncached-remote fetch policy, `--json`, opt-out surface,
   `forget`/`prune`, the #15 handoff comment as a deliverable, and explicit
   acknowledgement that org-scope (tier 2) is not delivered.
9. Corrected: the cacheDir override is test-only; `LocalSourceResolver` resolves
   against the *root* library dir at the system level; `documentPath` carries no
   extension; `GVP_REGISTRY_ROOT` conflates root and `by-id`; there is no plain-HTTP
   source form; `personal.yaml` appears in 16 locations, not 8.
