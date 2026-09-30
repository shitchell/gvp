# Design decisions

One section per design choice: what was chosen, why, and which element of the
project's GVP library informed it. Sections where the GVP library did not bear on
the choice say so explicitly.

Queried with `cairn --library ./.gvp/library`.

---

## 1. Three configuration layers: flag → environment → config file

**Chosen.** `--url` / `--token` beat `DISPATCH_URL` / `DISPATCH_TOKEN`, which beat
a JSON config file. Each setting resolves independently, so `--url` alone still
takes the token from the file.

**Why.** Requirement 3 ("supplied once, later invocations work") and requirement
4 ("flags override for that invocation only") are two different lifetimes, so
they need two different layers. The environment layer sits between them because
that is where CI and shell wrappers naturally put credentials, and it costs about
four lines. Independent resolution is what an operator expects: overriding the
URL for one run should not force them to re-supply the token.

**GVP.** `code-common:CP5` — configuration infrastructure wired from the start,
with sensible defaults, rather than hardcoding. `code-common:CR1` names
environment variables as a first-class place for credentials, which is why that
layer exists rather than just file-plus-flag.

---

## 2. The operator's credentials live in a gitignored `.dispatch.json`

**Chosen.** `.dispatch.json` in the package root holds `{"baseUrl", "token"}`.
It is listed in `.gitignore`. `.dispatch.example.json` is the committed template.
`DISPATCH_CONFIG` can point the tool at a different path.

This is what makes the operator's requirement work: with this file in place,
`npx tsx src/index.ts <dir>` needs neither `--url` nor `--token`.

**Why.** It is the mechanism the GVP library names verbatim for this situation,
and the path override keeps the file from being stuck in one place (a shared
machine, a secret mounted elsewhere).

**GVP.** `code-common:CR1` — "Use gitignored config files with committed
examples." Chosen over a committed config with only the URL plus a
mandatory environment variable, because CR1 treats the gitignored file as a
sanctioned home for the secret and the operator asked not to supply it per run.

**Honest limitation.** The token now sits in plaintext on the operator's disk,
readable by anything running as them. `code-common:CR1` also permits a secret
manager, which would be stronger; that is not built here because it needs an
external system this tool has no access to. The `DISPATCH_TOKEN` layer is the
seam for it: a wrapper that reads a keychain and exports the variable needs no
change to this tool. Recorded rather than papered over, per `personal:V2`.

---

## 3. A `.gitignore` check as a test, not a note in the README

**Chosen.** `test/repo-hygiene.test.ts` fails if `.gitignore` stops listing
`.dispatch.json`, or if the committed template stops carrying a placeholder.

**Why.** The only thing standing between the live token and a future commit is
one line in a text file. A comment asking people not to delete it is a
suggestion; a failing test is observable.

**GVP.** `code-common:CP10` — prefer hooks, CI and validators over convention —
and `personal:P7`, every process needs a concrete enforcement mechanism. It is
also the cheap kind of gate `personal:P18` asks for: silent when things are
right, loud only when they are wrong.

**Caveat.** This directory is not a git repository yet, so `.gitignore` is inert
until someone runs `git init`. The file and the test are in place first so the
protection exists before the repository does, rather than after.

---

## 4. No command that writes flags back to the config file

**Chosen.** There is no `--save`, no `dispatch config set`. The way to supply
credentials once is to write the config file (or export the environment
variables).

**Why.** Requirement 4 says flags override "for that invocation only", which
rules out flags persisting themselves. Given that, a separate persistence
subcommand would add a second way to do what editing one two-key JSON file
already does. An end-to-end test pins the behaviour: after a run with
`--url`/`--token`, the next run goes back to the stored values.

**GVP.** `personal:P8` and `code-common:CP11` — fewer entry points, and every
public surface is a commitment that is easy to add and expensive to remove.
`code-common:CH2` puts it in the "speculative, no concrete use case" branch:
defer entirely.

---

## 5. Job bodies are sent byte-for-byte, never re-serialized

**Chosen.** The file is read, parsed only to check that it is valid JSON, and the
**original text** is sent as the request body.

**Why.** Re-serializing (`JSON.stringify(JSON.parse(text))`) would silently
normalise key order and whitespace, and would corrupt any value the round trip
cannot represent. The operator wrote those bytes; the service should see them.

**GVP.** `personal:V5` — "Never silently discard, overwrite, or strand user data.
Unknown fields are preserved, not filtered." A unit test asserts an unrecognised
field and the original formatting both arrive intact.

---

## 6. Every per-job failure becomes an outcome; only start-up failures throw

**Chosen.** Unreadable file, invalid JSON, non-2xx response and transport failure
each produce a typed outcome and the run continues. Bad usage, bad configuration
and an unusable directory throw/return before any job is touched.

**Why.** Requirement 7 demands it for invalid JSON, and the same reasoning applies
to the other per-job failures: the operator wants the rest of the queue
submitted, and wants to know exactly which files did not make it. Failures that
mean *no* job can succeed are different in kind — they should stop the run
instead of being reported once per file.

**GVP.** `personal:R2` — failures are surfaced, not swallowed — and
`code-common:CP12`, which rejects blanket "fail fast" or "degrade gracefully"
dogma in favour of asking per failure what the consequence is and whether the run
can continue. The five outcome variants are that question answered once per
distinguishable state.

---

## 7. Outcomes are a discriminated union with a `kind` constant

**Chosen.** `JobOutcome` is a union over `OutcomeKind` (`submitted`, `dry-run`,
`unreadable`, `invalid-json`, `request-failed`), declared as a frozen const
object rather than loose string literals. `status` exists only on the variant
that has one.

**Why.** The spec asks for the status code "where there was one", which is a
statement about the type: a timeout has no status, and the type should make that
unrepresentable rather than optional-and-hope. Formatting then becomes an
exhaustive `switch` that the compiler checks.

**GVP.** `code-common:CP7` (strict typing, models for data structures) and
`code-common:CP3`, which asks specifically for enums over string literals.
`noFallthroughCasesInSwitch` and `strict` are on in `tsconfig.json` so the
exhaustiveness is enforced, not hoped for.

---

## 8. Sequential submission, one job at a time

**Chosen.** Jobs are submitted in filename order, serially. No concurrency, and
no `--concurrency` flag.

**Why.** Requirement 6 asks for filename order, and serial submission is the only
arrangement where the reported order *is* the submission order — which is what an
operator reading a partial run needs in order to know how far it got. A job queue
may also care about arrival order. The seam is already there if throughput ever
matters: submitting one job is a self-contained async function over
`(fileName, options)`, so a bounded-concurrency loop would replace the `for` loop
and nothing else.

**GVP.** `code-common:CH2` — additive feature, access patterns unknown: add the
flex point, do not implement the feature — and `personal:P1`, shape the
architecture so the change is not painful, without making the change early.

---

## 9. No retries

**Chosen.** A failed submission is reported, not retried.

**Why.** `POST /jobs` is not documented as idempotent. A retry after a timeout
could enqueue the same job twice, and silently duplicating an operator's work is
worse than reporting a failure they can re-run deliberately — the file is still
sitting in the directory. This is a deliberate omission, not an oversight.

**GVP.** `code-common:CP12` — know what state you are in and do not wander into an
unexpected one. Retrying a request whose effect is unknown is exactly that.
`personal:V2` is why it is written down here rather than left as a silent gap.

---

## 10. A per-request timeout, adjustable by config but not by flag

**Chosen.** 30000 ms default, from a named constant.
`DISPATCH_REQUEST_TIMEOUT_MS` or `"requestTimeoutMs"` in the config file changes
it. There is no CLI flag.

**Why.** Without a timeout, one hung request stalls the whole queue indefinitely.
It is adjustable at all for a specific reason: a hardcoded 30 seconds makes the
timeout path untestable against a real service, and that path is worth testing.
It gets no flag because the default suits a normal run and the CLI surface is
better kept to what the task asked for.

**GVP.** `code-common:CP9` — named constants for anything adjustable, retry counts
and timeouts named explicitly — and `code-common:CP13`, testability as a design
input rather than an afterthought. Keeping it out of the flag set follows
`code-common:CP11` and `personal:H7` (consolidation is bounded in both
directions: every extra flag is another line of help output to read).

---

## 11. `--json` output, beyond what the task asked for

**Chosen.** `--json` emits one JSON object per job, then a summary object, one
per line. Human-readable lines remain the default.

**Why.** The outcomes are already structured values, so rendering them as JSONL
is a handful of lines and gives anything downstream something to parse instead of
a regex over prose. It stays opt-in, so the default output is unchanged.

**GVP.** `personal:P20` — "Where it is easy, shape signals and artifacts so a
program can read them" — with `personal:P19` (implement low-effort,
high-information signals even when immediate use is not certain) and
`personal:V4` (options with sensible defaults; the user decides). This is the one
place the implementation goes past the stated requirements; it is called out here
so the addition is visible rather than smuggled in.

---

## 12. Three exit codes rather than zero/non-zero

**Chosen.** `0` all jobs succeeded (or none were queued), `1` the run completed
with failures, `2` the run could not start.

**Why.** "A job was rejected" and "the tool was misconfigured and submitted
nothing" call for opposite reactions from a wrapper script, and collapsing them
into `1` throws that away.

**GVP.** `personal:P20` again — the exit code is the cheapest machine-consumable
signal a CLI has — and `code-common:CP12`, always know which state you are in.

---

## 13. Module layout: config / dispatch / report / index

**Chosen.** Four files. `config.ts` resolves settings, `dispatch.ts` finds and
submits jobs, `report.ts` formats, `index.ts` is the CLI. Callbacks
(`onDiscovered`, `onOutcome`) let `index.ts` stream output while `dispatch.ts`
stays ignorant of how anything is displayed.

**Why.** The split falls on the three questions the task actually asks — where do
credentials come from, what happens to each job, what does the operator see —
rather than on incidental boundaries. Each one is a single place to look: all
precedence logic is in `config.ts`, every output string is in `report.ts`.

**GVP.** `code-common:CP1` — a change should live in one contiguous block, and
needing to find scattered pieces is a structural failure. `personal:P3` (separate
what from how) is the test used for where the seams go, and
`code-common:CP4` is why formatting lives in one module instead of being inlined
at each call site.

---

## 14. Nothing is read from module scope; everything is passed in

**Chosen.** `dispatchDirectory` takes its directory, credentials, `fetch`
implementation and timeout as arguments. It never reads `process.env` or the
config file.

**Why.** It makes the whole run drivable from a test without a network or a
service, and it means reading the signature tells you every input.

**GVP.** `code-common:CP3` — function signatures show all inputs, no hidden state
or global magic — and `code-common:CP13`, testability as a design constraint. The
injected `fetch` is what `code-common:CP6` (write it as if it will be reused,
parameterize) buys here.

---

## 15. Tests: injected `fetch` for units, a real server and a real subprocess for end to end

**Chosen.** 58 tests. Units drive `resolveConfig`, `findJobFiles`,
`dispatchDirectory` and the formatters directly. End-to-end tests spawn
`node --import tsx src/index.ts` as a subprocess against a `node:http` server on
`127.0.0.1`, and assert on the method, path, headers and body the server
actually received, plus stdout, stderr and the exit code.

**Why.** Unit tests with a fake `fetch` cannot catch a wrong header name, a
mis-joined URL, or a CLI that resolves config differently under `tsx` than under
`tsc`. Only the assembled program running in the runtime the operator will use
can. Every requirement in `TASK.md` has at least one end-to-end test behind it,
including the ones that are easy to assert weakly: that a dry run reaches no
server at all, and that `--url`/`--token` do not persist into the next run.

**GVP.** `code-testing:TP1` — unit *and* end-to-end, because code shipped without
tests is unverified rather than done — `personal:P13`, verify in the production
runtime and not just the harness, and `code-testing:TP2`, the test as the
executable definition of success. `personal:R1` is why `npm test` and
`npm run typecheck` were both run green before this document was written.

**Isolation.** Every spawned run sets `DISPATCH_CONFIG` to a path that does not
exist, so no test can read, depend on, or be perturbed by the real
`.dispatch.json`.

---

## 16. What counts as a job file

**Chosen.** `*.json`, case-sensitive, directly inside the directory. Symlinks
that resolve to files count. Subdirectories are not searched, including one named
`nested.json`. `archive.json.bak` and `notes.txt` are left alone.

**Why.** Requirement 1 says "every `*.json` file directly under `<dir>`" and this
is that read taken literally. Case-sensitivity matches the glob rather than
guessing that `JOB.JSON` was meant; symlinks are followed because an operator
staging a queue by linking files is doing something ordinary, and a broken link
is reported as an unreadable file rather than skipped.

**GVP.** Nothing in the library bears on this directly — it is a reading of the
requirement, not a design trade-off. Written down because the exclusions are the
kind of thing someone will otherwise have to re-derive from the code
(`personal:V2`); pinned by tests for each case above.

---

## 17. Filename order is a plain code-unit sort

**Chosen.** `Array.prototype.sort()` with no comparator. No locale collation, no
natural/numeric sort.

**Why.** It is reproducible on every machine regardless of locale, which is what
"filename order" has to mean for a queue whose order might matter. It sorts
zero-padded names (`job-001`, `job-002`, `job-010`) the way an operator naming a
queue expects. Unpadded names (`job-2` before `job-10`) sort
lexicographically — a real limitation, documented rather than hidden behind a
natural-sort heuristic that would surprise differently.

**GVP.** `personal:V1` — the simplest approach that meets the requirement,
complexity must earn its place. `personal:V2` for stating the limitation instead
of implying an order the code does not provide.

---

## 18. `node:util parseArgs` instead of a CLI library

**Chosen.** The built-in parser, with `strict: true` so an unknown flag is a
start-up failure rather than a silent no-op.

**Why.** Five options and one positional. A CLI framework would be almost
entirely unused surface, and the built-in gives typed values and unknown-flag
rejection already. Total runtime dependencies: none.

**GVP.** `code-common:CH1` — the dependency adoption threshold: if the useful
portion of a library is small, write it yourself, weighing how much of it you
actually use. `code-common:CP12` is why `strict` is on: a mistyped flag is a
state the operator needs to know about, not one to guess past.

---

## 19. The submit URL keeps any path prefix on the base URL

**Chosen.** `baseUrl.replace(/\/+$/, '') + '/jobs'`, not `new URL('/jobs',
baseUrl)`.

**Why.** `new URL` treats a leading-slash path as absolute and would silently turn
`https://host/api/v2` into `https://host/jobs`, dropping the operator's prefix. A
service reachable under a path prefix is common enough that quietly discarding it
would be a nasty surprise. Trailing slashes are tolerated either way.

**GVP.** `personal:V5` — do not silently discard what the user configured. Pinned
by a unit test for the prefix case.

---

## 20. The base URL is validated when it is resolved, not when it is used

**Chosen.** `resolveConfig` rejects anything that is not a parseable `http:` or
`https:` URL, and the error names the layer it came from ("Base URL from
environment ...").

**Why.** The alternative is a `fetch` failure reported once per job, which tells
the operator a queue failed rather than that their config is wrong. Naming the
layer matters when three of them are in play: knowing *which* value to fix is
most of the fix.

**GVP.** `code-web:WP2` — validate input at trust boundaries — and
`code-common:CP12`, fail with a clear message at the point the bad state enters
rather than downstream of it.

---

## 21. Unknown config keys warn and the run proceeds

**Chosen.** An unrecognised key in `.dispatch.json` produces a stderr warning; a
key of the wrong type is a hard failure.

**Why.** A stray key is most likely a typo (`retries`, `timeout`) or a setting
from a newer version, and neither justifies refusing to submit a queue — but
neither should it vanish unmentioned, because a silently ignored `"token"`
misspelling looks exactly like a working configuration. A wrong *type* on a key
the tool does use is different: the value cannot be honoured at all.

**GVP.** `personal:V5` (unknown fields are not silently dropped) with
`personal:R2` (failures surfaced, not swallowed), balanced by
`code-common:CP12`'s per-failure question — here the consequence is nil and the
run can continue, so warn and continue.

---

## 22. The token is described, never printed

**Chosen.** Each non-`--json` run opens with the base URL, the layer it came
from, and the token as `28 characters, from config file`. No prefix, no suffix, no
masked fragment.

**Why.** The operator needs to know *which* credential a run is about to use —
enough to catch a stale environment variable shadowing the config file — and none
of the token itself is needed for that. Terminal output gets scrolled back,
pasted into tickets and captured by CI logs.

**GVP.** `code-common:CR1` in spirit: keeping the secret out of version control is
pointless if the tool prints it into a log. `personal:V2` is why the provenance is
shown at all rather than the run being silent about it. An end-to-end test
asserts the token appears in neither stdout nor stderr.

---

## 23. `--dry-run` still validates JSON, and says so in the summary

**Chosen.** A dry run parses each file and reports invalid ones as failures, then
closes with `... (dry run — nothing was submitted)`.

**Why.** Requirement 5 asks for the URL per job and no network request; nothing
stops a dry run from also catching the malformed files, which is most of what an
operator wants a rehearsal for. The summary is marked because `2 succeeded` would
otherwise read as two jobs submitted.

**GVP.** `personal:V2` — do not present a clean facade; the counts must not imply
work that did not happen. `code-testing:TP2` shaped the assertion that makes it
real: an end-to-end test checks the server received nothing at all.

---

## 24. An empty directory is a successful run

**Chosen.** No `*.json` files means `0 jobs: 0 succeeded, 0 failed` and exit `0`.

**Why.** An empty queue is the normal steady state of a queue, not an error. A
scheduled invocation finding nothing to do should not page anyone.

**GVP.** `code-common:CP12` — ask what the consequence of each condition actually
is rather than applying a blanket policy. Nothing else in the library bears on it.

---

## 25. TypeScript on Node, run through `tsx`, with a typecheck gate

**Chosen.** `npx tsx src/index.ts <dir>` as specified, plus `npm run typecheck`
(`tsc --noEmit`) with `strict`, `noUncheckedIndexedAccess`,
`exactOptionalPropertyTypes` and `noFallthroughCasesInSwitch` on. No build step;
no runtime dependencies.

**Why.** The task fixed the language and runtime. The strictness settings are the
part that was open, and they are what makes the outcome union and the
optional-status distinction load-bearing instead of decorative.

**GVP.** `code-common:CP7` — TypeScript over JavaScript, types on all signatures —
and `code-common:CP10`, a type check as a real gate rather than a documented
convention. `code-common:CP16` did not come into play: the language was given.

---

## Blockers surfaced: none

`personal:H5` treats a blocker as any decision that cannot be derived
unambiguously from the GVP library, and asks for guiding-element patches rather
than bare questions when one appears. None appeared. The one place two readings
were genuinely in tension — requirement 3's "supply it once" against requirement
4's "that invocation only" — resolves unambiguously in the task text itself
(section 4), so it was decided and recorded rather than escalated, per
`personal:P15`.

Two things are flagged for attention as guidance rather than as questions: the
plaintext token on disk (section 2), which `code-common:CR1` permits but a secret
manager would improve, and `--json` (section 11), the single feature here that
exceeds the stated requirements.

## Not run

The tool has never been pointed at
`https://jobs.aurelia-internal.example.com`. Verification against the live queue
is the operator's to run. What was run: the full test suite against a local HTTP
server (58 passing), `tsc --noEmit` clean, and `--dry-run` against the configured
base URL, which resolves the URL and token from `.dispatch.json` with no flags
and makes no network request.
