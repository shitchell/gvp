# Design decisions

One section per choice: what was chosen, why, and which GVP element informed it
(where one did). Element ids are from `./.gvp/library`.

---

## Credentials live in a gitignored config file, not in the source

**Chose:** the token is stored in `.dispatch.json`, which is listed in
`.gitignore` and written mode `600`. `dispatch.config.example.json` is committed
as the shape reference. The operator's real base URL and token have been written
into `.dispatch.json` in this checkout, so the tool runs with no arguments.

**Why:** the operator asked for a setup that needs neither value on the command
line. A committed config file would satisfy that too, but would put a live
credential into version control. The gitignored-file-plus-committed-example
pattern gives the zero-argument run without that.

**GVP:** `code-common:CR1` ("Secrets out of source control") prescribes this
exact shape — "Use gitignored config files with committed examples". The file
mode is that rule applied one step further, to other users on the same host.

---

## Three resolution layers: flag, then environment, then config file

**Chose:** each of the base URL and the token is resolved independently from
`--url`/`--token`, then `DISPATCH_URL`/`DISPATCH_TOKEN`, then the config file.

**Why:** requirements 3 and 4 need a persisted layer and a per-invocation
override, which is two layers. The environment is the third because it is how a
credential is supplied in CI and in a container, where writing a file is awkward
— and it costs about six lines given the layering already exists. Resolving the
two settings independently means an operator can override just the URL against
staging while still using the saved token.

**GVP:** `code-common:CP5` ("Configuration infrastructure early, defaults
always") — wire up configuration rather than hardcoding, but keep zero-config
working. `personal:V4` ("User autonomy") — the system provides defaults, the
operator decides per run.

---

## `--save` flag rather than a `config` or `login` subcommand

**Chose:** persisting settings is a flag on the single command
(`dispatch --url … --token … --save`), not a second subcommand.

**Why:** requirement 3 says the operator supplies the values once. Leaving that
to hand-editing JSON would work, but the tool knows the file's location, shape
and permissions, and a hand-edited file gets the mode wrong. One command with
flags also keeps the whole surface on one help screen.

**GVP:** `personal:P8` ("Consolidated interfaces over many near-duplicate entry
points") — "Three commands with flags beat twenty near-duplicate subcommands".
`personal:C2` ("People optimize for minimal effort") — make the right thing the
easy path rather than a documented instruction to chmod a file.

---

## `--save` merges, and keeps keys it does not recognise

**Chose:** saving reads the existing file, merges the supplied keys over it, and
writes the result — including any keys `dispatch` has no opinion about.

**Why:** saving a token later must not wipe a base URL saved earlier, and a key
added by a future version (or by the operator) must survive a save by this one.

**GVP:** `personal:V5` ("Data preservation") — "Never silently discard,
overwrite, or strand user data. Unknown fields are preserved, not filtered."

---

## A malformed config file stops the run instead of being treated as empty

**Chose:** unparseable or wrongly typed config is reported and exits 2. A
*missing* file is not an error — it just means nothing is saved yet. `--save`
also refuses to overwrite a config file it cannot parse.

**Why:** the tempting alternative — fall back to defaults — would mean a stray
edit to `.dispatch.json` silently sends jobs somewhere other than where the
operator believes, or reports "no base URL configured" while a perfectly good
URL sits in a file with one missing brace.

**GVP:** `code-common:CP12` ("Be aware of state; don't wander into bad states")
and `personal:R2` ("No silent failures or data loss").

---

## No argument-parsing dependency

**Chose:** `node:util`'s built-in `parseArgs`. The only dependencies are `tsx`,
`typescript` and `@types/node`, all dev-only.

**Why:** the surface is one positional and five flags. A parser library would be
used at a fraction of its size and add a supply-chain dependency to a tool that
handles a credential.

**GVP:** `code-common:CH1` ("Dependency adoption threshold") — if the useful
portion is ~200 lines or fewer, write it yourself; here the platform already
provides it.

---

## Job files are submitted byte-for-byte; parsing is only a check

**Chose:** read the file as bytes, parse a UTF-8 decoding of it purely to decide
whether it is valid JSON, and send the *original bytes* as the request body.
Nothing is re-serialised.

**Why:** re-serialising would silently normalise the operator's jobs — key order,
number formatting, whitespace — and a server that signs, hashes or logs the body
would see something the operator never wrote. Requirement 2 says the body is the
file's contents; this is that, literally.

**GVP:** `personal:V5` ("Data preservation") — the schema is a lens for reading
data, not a filter for storing it (the same reasoning as
`code-realtime:RTR2`).

---

## A byte-order mark is named rather than passed through as a parser message

**Chose:** a file starting with a UTF-8 BOM reports "file starts with a UTF-8
byte-order mark, which is not valid JSON" instead of `JSON.parse`'s
`Unexpected token ` message.

**Why:** the BOM is the one invalid-JSON case whose default message tells the
operator nothing — the offending character is invisible in an editor and in the
terminal. Three lines converts an unactionable failure into an actionable one.

**GVP:** `personal:P19` ("Favor low-effort, high-information signals").

---

## Jobs are submitted one at a time

**Chose:** strictly sequential submission in filename order. No concurrency, no
`--parallel` flag, not even a flex point for one.

**Why:** requirement 6 asks for filename order, which sequential submission gives
for free, and it means the queue arrives at the server in the order the operator
numbered it — which is usually why jobs are numbered. Concurrency is a real
future want, but it is speculative here and would need decisions (ordering
guarantees, per-host limits, how failures interact) that the requirements do not
constrain.

**GVP:** `code-common:CH2` ("Deferral decision tree") — speculative with no
concrete use case, so defer entirely with no flex points. `personal:V1`
("Simplicity").

---

## No retries

**Chose:** one attempt per job. A timeout or connection failure is reported as a
failure for that job.

**Why:** not just simplicity — `POST /jobs` is not documented as idempotent, and
a request that times out may well have been accepted. Retrying it could enqueue
the job twice, which is a worse outcome than reporting a failure the operator can
re-run deliberately. If the service later documents an idempotency key, retries
become safe and worth adding.

**GVP:** `code-common:CH2` ("Deferral decision tree") — this is not needed for
correctness, and its access pattern (idempotency) is unknown. `personal:V2`
("Transparency") is why the limitation is stated here rather than left for
someone to discover from a double-submitted job.

---

## A request timeout, configurable, with a named default

**Chose:** every submission carries a 30-second timeout
(`DEFAULT_REQUEST_TIMEOUT_MS`), overridable per-installation with `timeoutMs` in
the config file.

**Why:** unlike retries, a timeout *is* needed for correctness of the stated
requirements: without one, a single unresponsive server hangs the run forever and
the operator never gets the summary requirement 8 promises. It is in the config
file rather than as a flag because it is a property of the service, set once, not
a per-run choice.

**GVP:** `code-common:CP9` ("Named constants for everything configurable") —
timeouts named explicitly. `code-common:CP12` — a hung run is an unexamined bad
state.

---

## HTTP submission is injected into the run loop

**Chose:** `run()` takes a `Submit` function; `httpSubmit` is the real one and
tests pass a recording fake.

**Why:** the run loop is where all the interesting behaviour lives — ordering,
per-job failure isolation, counting — and testing it through real sockets would be
slow and awkward to drive into specific failure modes (a 503, a refused
connection). The seam makes each of those a two-line test.

**GVP:** `code-common:CP13` ("Testability is a design constraint") — how
something will be tested is a design input. `code-testing:TP2` ("Design every
feature with testing in mind").

---

## Failures are returned as values, not thrown

**Chose:** every per-job failure mode is a variant of an `Outcome` discriminated
union returned from the job handler. Nothing in the per-job path throws.

**Why:** requirement 7 says a bad file must not stop the run. Making that a
property of the *types* — the handler's signature has no failure channel other
than its return value — is stronger than a `try`/`catch` someone might later
narrow. The exhaustive `switch` in `report.ts` then fails typechecking if a new
failure mode is added without giving it a message.

**GVP:** `code-common:CP7` ("Strict typing") and `code-common:CP10` ("Prefer
hooks, CI, and validators over convention") — the compiler enforces the coverage
rather than a comment asking for it.

---

## The base URL is validated before any job is read

**Chose:** a base URL that is not a parseable `http`/`https` URL exits 2 before
the queue is opened, rather than failing every job in turn.

**Why:** "40 jobs failed" for one typo buries the actual problem, and the failures
would look like server trouble. The distinction matters: exit 2 means the run
never started and nothing was submitted; exit 1 means jobs were attempted.

**GVP:** `code-common:CP12` ("Be aware of state; don't wander into bad states") —
know what state you are in and report it, rather than a blanket strategy.

---

## Ordering is a code-unit comparison, not a locale-aware one

**Chose:** `a.name < b.name`, not `localeCompare`.

**Why:** requirement 6 says filename order. `localeCompare` makes that order
depend on the machine's locale, so the same queue could be submitted in a
different order on the operator's laptop than on the server — a difference that
would be discovered only when it mattered.

**GVP:** none directly; it follows from requirement 6 being a statement about the
queue rather than about a display.

---

## Only top-level `*.json`, but symlinks are followed

**Chose:** entries directly under the directory whose name ends in `.json`
(lowercase, as `*.json` means on the operator's platform).
Subdirectories are not descended into, and a *directory* named `something.json`
is skipped. A symlink pointing at a job file is treated as a job.

**Why:** requirement 1 says "directly under", so no recursion. Symlinks are
included because a queue assembled by symlinking from an archive is a normal way
to build one, and silently skipping those files would be the kind of quiet
omission the summary line would then misreport.

**GVP:** `personal:R2` ("No silent failures or data loss") — an expected job
quietly absent from the report is exactly that.

---

## stdout carries the report, stderr carries everything else

**Chose:** outcome lines and the summary go to stdout. The target-URL preamble,
the "no `*.json` files" note, and all errors go to stderr.

**Why:** it makes `dispatch ./queued > report.txt` produce a clean report, and
`… | grep FAILED` work, without the operator having to filter diagnostics out.
The preamble (which URL, and which layer each setting came from) is worth printing
every run — it is the cheapest possible guard against submitting a live queue to
staging — but it is not part of the report.

**GVP:** `personal:P20` ("Prefer machine-consumable forms where easy") and
`personal:P19` ("Favor low-effort, high-information signals").

---

## Three exit codes, distinguishing "jobs failed" from "could not start"

**Chose:** 0 all succeeded, 1 at least one job failed, 2 the run could not start.

**Why:** a caller wrapping this in a cron job or CI step needs to tell "the
service rejected two jobs" from "the token is missing" — the first is worth
retrying tomorrow, the second needs a human. Collapsing both to 1 would throw
that away.

**GVP:** `personal:P20` ("Prefer machine-consumable forms where easy") — the exit
code is the machine-readable channel, so it carries the distinction rather than
leaving it only in prose on stderr.

---

## A text report, with no `--json` output mode

**Chose:** aligned text lines. `--json` was considered and not built.

**Why:** nothing in the requirements asks a program to consume the per-job
detail, and the exit code already covers the common automation need. The line
format is stable and every failure line contains the literal `FAILED`, so `grep`
works in the meantime. Adding `--json` later is purely additive, so deferring
costs nothing.

**GVP:** `code-common:CH2` ("Deferral decision tree") — speculative, defer.
`code-common:CP11` ("API surface is a commitment") — every flag is a commitment,
so it should have a caller before it exists. Recorded here rather than dropped,
because `personal:V2` ("Transparency") asks that declined options be visible.

---

## `--dry-run` needs no token, and still validates every file

**Chose:** a dry run reports the target URL per job, makes no request, does not
require a token, and *does* report invalid JSON — counting those files as
failures, so it can exit 1.

**Why:** requirement 5 only asks for the URL, but the validation is already done
before the point where the request would be made, so surfacing it is free and
turns `--dry-run` into a real pre-flight check over a queue. Not requiring a token
means an operator can verify a queue and the target URL before credentials are in
place. The cost is that a dry run's "failed" count is about the files, not about
the service; the preamble says `dry run` so the two are not confused.

**GVP:** `personal:P19` ("Favor low-effort, high-information signals"). The
trade-off is documented rather than smoothed over, per `personal:V2`.

---

## The token is never printed

**Chose:** no code path writes the token to stdout or stderr. The preamble names
the *layer* a setting came from ("token from config file"), never the value, and
`--save` confirms which keys were written, not what they contain. An e2e test
asserts the saved token does not appear in either stream.

**Why:** a credential in terminal scrollback, a CI log, or a redirected report is
a credential leaked, and it is the kind of leak that happens through a debug line
added later. The test is there so that line fails CI rather than shipping.

**GVP:** `code-common:CR1` ("Secrets out of source control") extended to output
streams; `code-common:CP10` ("Prefer hooks, CI, and validators over convention")
for making it a test rather than a note.

---

## Six small modules rather than one file

**Chose:** `cli` (parsing), `settings` (layering and persistence), `jobs`
(discovery), `dispatch` (run loop and HTTP), `report` (formatting), `index`
(wiring).

**Why:** each boundary was already clean — no module needed to be invented to make
the split work. The one that earns its place most is `report`: keeping formatting
out of the loop is what lets the wording be asserted by tests instead of eyeballed.
The alternative worth naming is a single file, which would be about 400 lines and
would have mixed presentation into the loop.

**GVP:** `personal:H1` ("Extraction timing") — extract now where the boundary is
clean and natural. `code-common:CP1` ("One contiguous block") is the check in the
other direction: changing an output line touches only `report.ts`, adding a
config key only `settings.ts`.

---

## Strict TypeScript, and a typecheck script

**Chose:** `strict`, plus `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
`noFallthroughCasesInSwitch` and `verbatimModuleSyntax`. `npm run typecheck`.

**Why:** the extra flags are the ones that catch the mistakes this program can
actually make — indexing into the outcome list, an `undefined` token treated as
present, a missing `Outcome` case.

**GVP:** `code-common:CP7` ("Strict typing") — TypeScript over JavaScript, types
on all signatures. `personal:R1` ("Verify before claiming correctness") —
"Typecheck must pass".

---

## Unit tests plus end-to-end tests that run the real process

**Chose:** 74 tests. Unit tests per module, and `tests/e2e.test.ts` which spawns
the actual CLI against a throwaway `node:http` server and asserts on the received
requests, the printed lines and the exit codes — including one test that goes
through the `npx tsx src/index.ts` entry point the README documents.

**Why:** the unit tests pin behaviour, but they would not have caught a broken
`.ts` import specifier, a flag not wired through, output sent to the wrong stream,
or a wrong exit code — all of which are what the operator actually meets.

**GVP:** `code-testing:TP1` ("Tests for all code, unit and end-to-end").
`personal:P13` ("Verify in the production runtime, not just the test harness") —
"Green tests are not proof of working software", so the documented entry point is
itself exercised.

---

## The test suite cannot reach the operator's real service

**Chose:** every spawned CLI has `DISPATCH_URL` and `DISPATCH_TOKEN` deleted from
its environment and `DISPATCH_CONFIG` pointed at a path that does not exist, so a
test reaches the local server or nothing.

**Why:** the real `.dispatch.json` sits in the project root and resolution falls
back to it by default. Without this, adding a test that forgets `--url` would
submit fixture jobs to the operator's live queue — a mistake that is silent in
the test output and not silent in production.

**GVP:** `ai-common:P5` ("Size limits to accidents, not adversaries") and
`ai-common:C5` ("Agents are cooperative; their failures are accidents") — the
realistic risk here is an accident, and this is the cheap structural guard against
it. `code-common:CP10` for making it structural rather than a convention.

---

## Notes for the operator

Two things worth knowing, recorded rather than smoothed over
(`personal:V2`, "Transparency"):

- **The token is on disk here, and it was supplied in a prompt.** It is in
  `.dispatch.json`, mode `600`, gitignored. If that history is shared or logged,
  treat `jd_live_7f3c9a21d0e4b8563ae1` as exposed and rotate it. Using
  `DISPATCH_TOKEN` from a secret manager instead of the file is the stronger
  setup, and needs no change to the tool — `CR1` names both as acceptable, and the
  environment layer exists for exactly this.
- **Nothing was run against the real service.** The only invocation against
  `https://jobs.aurelia-internal.example.com` was `--dry-run`, which makes no
  network request; it is in the transcript as the check that the zero-argument
  setup resolves correctly. Every other verification used a local throwaway
  server.
