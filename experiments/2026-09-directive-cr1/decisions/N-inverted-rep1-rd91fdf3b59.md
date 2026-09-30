# Decisions

One section per design choice: what was chosen, why, and which element of the
project's GVP library informed it. Where no element bore on the choice, that is
said plainly rather than a citation being manufactured for it.

A closing section records the one decision the library did not settle, handled
the way `personal:H5` prescribes.

---

## 1. Configuration comes from three layers: flags, environment, file

**Chosen.** The base URL and token are resolved highest-priority-first from (1)
`--url` / `--token`, (2) `DISPATCH_URL` / `DISPATCH_TOKEN`, (3) `.dispatch.json`
in the project root. Each value is resolved independently, so `--url` alone
overrides the URL and leaves the stored token in place. A flag never writes
anything back, so an override really does last one invocation.

**Why.** Requirements 3 and 4 need a durable layer and an override layer. The
environment layer in the middle costs one line and is the seam a secret manager
plugs into without the tool having to know anything about it (see §3).

**Library.** `code-common:CP5` ("Configuration infrastructure early, defaults
always") — configuration is wired from the start rather than hardcoded, and every
layer is optional so the tool still runs with nothing configured as long as the
flags are supplied. `personal:V4` ("User autonomy") — the system supplies
defaults, the operator decides per-run.

## 2. The operator's token lives in a gitignored `.dispatch.json`, with a committed example

**Chosen.** `.dispatch.json` holds `{"url": ..., "token": ...}`, is listed in
`.gitignore`, and is mode `600`. `.dispatch.example.json` carries the shape with
a placeholder token and is the file intended for version control.

**Why.** The operator asked to run the tool without passing either value on the
command line, which means the token has to rest somewhere. This is the storage
shape the library names for exactly this situation.

**Library.** `code-common:CR1` ("Secrets out of source control") — verbatim: "Use
gitignored config files with committed examples." This was the decisive element;
it is why there is one gitignored file and one committed example rather than, say,
a single committed config with the token inlined.

## 3. The environment layer is documented as the secret-manager seam

**Chosen.** `DISPATCH_TOKEN` outranks the config file, and the README says so
next to a note that the config file stores the token in plaintext on disk.

**Why.** A plaintext token on disk is a real limitation, not a solved problem.
Rather than dress it up, the README states it and points at the layer that
replaces it, so an operator with a secret manager can `export DISPATCH_TOKEN=$(...)`
and change nothing else.

**Library.** `code-common:CR1` also permits "environment variables or secret
managers" — providing the layer is what makes that option available here.
`personal:V2` ("Transparency") — "When corners are cut or trade-offs made,
document them explicitly. Presenting a clean facade over unclear motivations
helps no one."

## 4. The tool prints where each value came from, never the value

**Chosen.** Each run opens with `base URL: <url> (from config file)` and
`token: set (from flag)`. The token's value is never printed, on any path,
including errors. An end-to-end test asserts a known token string appears in
neither stdout nor stderr.

**Why.** "Which token did that run actually use?" is the question an operator
asks after a surprising 401, and answering it should not require echoing a
credential into a terminal, a log file, or a screenshot. The source alone answers
it.

**Library.** `personal:P19` ("Favor low-effort, high-information signals") — two
lines of output, and the most common configuration confusion becomes
self-diagnosing. `code-common:CR1` for keeping the value itself out of anything
that gets captured.

## 5. The config file is found relative to the project root, not the working directory

**Chosen.** `CONFIG_FILE_PATH` is derived from `import.meta.url`, so
`.dispatch.json` is located next to the tool regardless of where the operator
`cd`s to.

**Why.** "Having supplied them once, a later invocation must work without
supplying them again" should not quietly become "…as long as you are standing in
the right directory." A cwd-relative lookup makes the configuration silently
absent from anywhere else.

**Library.** `code-common:CP3` ("Explicit over implicit") — the resolved path is
a function of the installed tool, not of hidden ambient state. This is also the
one decision the library did not fully settle; see §20.

## 6. A corrupt config file stops the run instead of falling back to defaults

**Chosen.** A missing `.dispatch.json` yields empty configuration and is not an
error. A `.dispatch.json` that exists but is unparseable, is not an object, or has
a non-string `url`/`token` raises an error and exits `2`.

**Why.** The two cases mean different things. "No file" means unconfigured. "File
I cannot read" means the operator configured something and it is not taking
effect — and silently proceeding with defaults would send jobs to the wrong place,
or nowhere, while looking like a normal run.

**Library.** `personal:R2` ("No silent failures or data loss") — "Failures must be
surfaced, not swallowed." `code-common:CP12` ("Be aware of state; don't wander
into bad states") — the failure is classified rather than handled by a blanket
strategy.

## 7. Unrecognised keys in the config file are ignored, not rejected

**Chosen.** `readStoredConfig` reads `url` and `token` and leaves anything else
alone without complaint.

**Why.** A config file is the operator's, not the tool's. A future key, a
comment-by-convention field, or a setting for a sibling tool should not cause a
hard failure.

**Library.** `personal:V5` ("Data preservation") — "Unknown fields are preserved,
not filtered." Note the tool never writes the config file, so there is no path on
which those fields could be dropped.

## 8. The job file's bytes are sent unchanged

**Chosen.** `readJobBody` returns the file's original text. The body is not
re-serialised through `JSON.parse` / `JSON.stringify` before being sent.

**Why.** A round-trip rewrites the operator's payload: key order changes,
formatting is lost, and any integer beyond 2^53 — an ID, a timestamp in
nanoseconds — comes out a different number. The service is entitled to receive
what is on disk. A unit test pins this with a `9007199254740993` literal.

**Library.** `personal:V5` ("Data preservation") — "Never silently discard,
overwrite, or strand user data." Silently altering a payload in transit is the
same failure wearing a different hat.

## 9. JSON is parsed for validation only

**Chosen.** Each job file is run through `JSON.parse` purely to decide whether it
is valid; the parsed value is discarded and the raw text is sent.

**Why.** Requirement 7 needs invalid JSON detected before a request is made — a
malformed body would otherwise be the service's problem to report, badly. Parsing
is the cheapest way to answer that question, and keeping the result unused is what
makes §8 possible.

**Library.** Follows from `personal:V5` via §8. No separate element.

## 10. Jobs are submitted one at a time, in filename order

**Chosen.** Strictly sequential, sorted by filename. No concurrency, no
`--concurrency` flag.

**Why.** Requirement 6 asks for filename order. In a queue, "these went in the
order I named them" is usually the property the naming scheme exists to express,
and concurrency trades exactly that away for throughput nobody asked for.

**Library.** `personal:V1` ("Simplicity") — "every abstraction, indirection, or
generalization should solve a real problem, not a hypothetical one."
`code-common:CH2` ("Deferral decision tree") — concurrency here is a speculative
feature with no concrete use case, so it is deferred entirely, with no flex point.

## 11. Sorting is by code unit, not locale

**Chosen.** `a.fileName < b.fileName`, not `localeCompare`.

**Why.** `localeCompare` makes the submission order depend on the operator's
locale — the same queue would dispatch in a different order on a different
machine. Note the consequence, which is documented rather than hidden:
`10.json` sorts before `2.json`. Zero-padded names are the fix, and the example
queue is padded to model it.

**Library.** `code-common:CP12` ("Be aware of state; don't wander into bad
states") — an order that varies with ambient environment is a state you cannot
reason about. `personal:V2` for documenting the padding consequence rather than
letting it surprise someone.

## 12. Discovery is not recursive, and a directory named `*.json` is not a job

**Chosen.** Only regular files directly under `<dir>`. Subdirectories are not
descended into. A symlink is followed if it resolves to a file; a broken symlink
is kept in the list so the run reports it as a failed job rather than pretending
it was never there.

**Why.** Requirement 1 says "directly under". A recursive walk would submit jobs
the operator did not point at — an archive subdirectory, a `node_modules` that
wandered in — and submission is not undoable.

**Library.** `personal:R2` ("No silent failures") for the broken-symlink case
specifically: skipping it silently would drop a file the operator put in the
queue. The non-recursive reading is the requirement, not a judgement call.

## 13. `--dry-run` validates JSON, and needs no token

**Chosen.** A dry run reads and parses every job file, reports invalid ones as
failures, prints the URL each valid one would go to, and makes no request. It
runs with no token configured at all.

**Why.** Requirement 5 only asks for the URL. Checking the JSON as well costs
nothing and turns `--dry-run` into a genuine pre-flight: a dry run that reported a
clean queue and then failed for real on the next invocation would be worse than
useless. Requiring a token for a command that authenticates nothing would be
friction with nothing behind it.

**Library.** `personal:P19` ("Favor low-effort, high-information signals") — the
validation is already written for the real path, so the signal is free.
`personal:P18` ("Gates must earn their friction") for not demanding a credential
the operation does not use.

## 14. Missing configuration is caught before any file is touched

**Chosen.** A real run with no token exits `2` with a message naming all three
ways to supply one, before the queue directory is opened. A malformed base URL is
rejected at startup rather than surfacing once per job as a transport error.

**Why.** Failing a third of the way through a queue leaves the operator working
out which jobs were sent and which were not. Failing before anything happens
leaves no such question.

**Library.** `code-common:CP12` ("Be aware of state; don't wander into bad
states") — "For each failure ask — what is the consequence, does the user need to
know, can we recover, should we stop." A partially-dispatched queue is the
consequence worth avoiding here.

## 15. One bad job never ends the run; every job gets exactly one line

**Chosen.** Inside the loop, no failure throws. Unreadable file, invalid JSON,
refused connection, timeout, non-2xx — each becomes a `JobResult` and the loop
continues. Every discovered file appears in the output exactly once, and the
summary counts total to the number of files found.

**Why.** Requirement 7 in the specific case, and the same reasoning in general:
the operator needs a complete account of the queue, not an account that stops at
the first problem.

**Library.** `personal:R2` ("No silent failures or data loss") — a job that
neither succeeded nor was reported is exactly the silent failure this forbids.

## 16. Success is 2xx; everything else, including 3xx, is a failure

**Chosen.** `status >= 200 && status < 300`. A `302` is reported as a failure with
its status code.

**Why.** For a job submission, a redirect means the request did not do what was
asked. Treating it as success because it is not an error would report a job as
dispatched when it was not. `fetch` follows redirects by default, so a `3xx`
reaching this check is one the runtime declined to follow.

**Library.** `code-common:CP12` — the honest classification of an ambiguous state
over a convenient one. `personal:V2` ("Transparency") for not reporting a success
the tool cannot vouch for.

## 17. No retries, and a 30-second per-request timeout

**Chosen.** A failed request is reported and the run moves on. No retry, no
backoff, no `--retries` flag. Requests time out after a named
`REQUEST_TIMEOUT_MS` constant.

**Why.** Retrying is not obviously safe: without knowing whether `POST /jobs` is
idempotent, a retry after a timeout risks submitting the same job twice, which is
worse than reporting it as failed and letting the operator decide. The timeout is
different — without it, one unresponsive request stalls the whole queue with no
way to distinguish "slow" from "hung".

**Library.** `code-common:CH2` ("Deferral decision tree") — retries are additive
with unknown access patterns, so they are deferred; the timeout is needed for
stability, so it is implemented now. The two halves of that tree pointed
different ways here, which is the whole use of it. `code-common:CP9` ("Named
constants for everything configurable") — "Retry counts, timeouts, thresholds"
are named, not inlined.

## 18. The HTTP call sits behind a one-function interface

**Chosen.** `SubmitJob` is `(url, body, token) => Promise<{status}>`.
`runDispatch` takes one, defaulting to the real `fetch`-based implementation.
Discovery, the run loop, and reporting are likewise separate modules with no
knowledge of each other's internals.

**Why.** It is the seam that lets the run loop be tested exhaustively — ordering,
a bad file mid-queue, a refused connection, a 422 — with no network and no
mocking framework. The split also keeps the modules small enough to hold in one
reading.

**Library.** `code-common:CP13` ("Testability is a design constraint") — testing
shape was an input to this boundary, not something worked out afterwards.
`code-testing:TP2` ("Design every feature with testing in mind").
`code-common:CP6` ("Proactive reusability") — small focused pieces that combine.

## 19. Results are a discriminated union, printed as fixed-position columns

**Chosen.** `JobResult` is `submitted | skipped | failed`, so a status code
cannot be attached to a job that never left the machine. Output is
`<status>  <filename>  <detail>`, with the filename column padded to the widest
name. There is no `--json` flag.

**Why.** For the type: the union makes the impossible states unrepresentable
rather than merely unlikely. For the output: the fields are fixed-position, so
`awk '{print $2}'` and `grep '^FAILED'` both work — the human format is already
machine-readable, which is a better answer than a second output mode to keep in
step with the first.

**Library.** `code-common:CP7` ("Strict typing") and `code-common:CP3` ("Explicit
over implicit"). `personal:P20` ("Prefer machine-consumable forms where easy") —
satisfied without new surface, which `code-common:CP11` ("API surface is a
commitment") argues for: a flag added now is a flag owed forever.

## 20. Exit codes 0 / 1 / 2, and an empty queue is announced

**Chosen.** `0` all succeeded or none found, `1` at least one job failed, `2` the
run could not start. An empty queue prints `No *.json files found directly under
<dir>` and exits `0`.

**Why.** The exit codes let `dispatch` sit in a cron job or a shell `&&` chain and
mean something, and separating "jobs failed" from "could not start" is the
distinction a caller acts on differently. The empty-queue line exists because
nothing failed — so `1` would be wrong — but the overwhelmingly likely cause is a
wrong path, and `0 succeeded, 0 failed` alone invites the operator to conclude the
queue was drained.

**Library.** `personal:P20` ("Prefer machine-consumable forms where easy") for the
exit codes. `personal:R2` for saying the empty case out loud rather than leaving
it to be inferred.

## 21. No CLI framework; Node's built-in test runner

**Chosen.** Argument parsing is ~50 lines in `cli.ts`. Tests run on
`node --test` with `tsx`. The only dependencies are `tsx`, `typescript` and
`@types/node`.

**Why.** The entire command-line surface is one positional argument, two value
flags and two switches. `commander` or `yargs` would be more code to understand,
not less, and neither is anywhere near paying for itself at this size. Same for
the test runner: Node 22 ships one.

**Library.** `code-common:CH1` ("Dependency adoption threshold") — "If the useful
portion of an external library is approximately 200 lines or fewer, write it
yourself." The useful portion here is well under that.

## 22. Unknown flags and a second positional argument are errors

**Chosen.** `--verbose` exits `2` with `Unknown option: --verbose`. A second
directory argument exits `2` rather than being ignored or treated as the
directory.

**Why.** A typo'd flag silently ignored is a run that did something other than
what was asked — `--dry-runn` would submit the queue for real.

**Library.** `code-common:CP12` ("Be aware of state") and `personal:R2` — an
ignored argument is a silent failure with the blast radius of a live submission.

## 23. TypeScript is strict, including the optional extras

**Chosen.** `strict`, plus `noUncheckedIndexedAccess`,
`exactOptionalPropertyTypes`, `verbatimModuleSyntax`, `isolatedModules`. `npm run
typecheck` is a separate script from `npm test`.

**Why.** `noUncheckedIndexedAccess` in particular is load-bearing for a program
built around array and record indexing.

**Library.** `code-common:CP7` ("Strict typing") — "Type hints on all function
signatures… TypeScript over JavaScript." `personal:R1` ("Verify before claiming
correctness") — "Typecheck must pass."

## 24. Tests are unit plus a real end-to-end run, and the e2e cannot escape the machine

**Chosen.** 65 tests. Unit tests cover parsing, config precedence, discovery, the
run loop and formatting. `e2e.test.ts` spawns the actual CLI as a child process
through `tsx` and points it at a real `node:http` server on loopback, asserting
the method, path, headers, exact body bytes, stdout, and exit code.

Containment: the loopback address is supplied through *both* `DISPATCH_URL` and
`--url`, and both outrank `.dispatch.json`. Two independent layers would have to
fail before a test could reach the operator's real service.

**Why.** Unit tests with an injected `submit` prove the logic but not that the
program works — they never exercise `tsx`, Node's `fetch`, real sockets, or the
process exit code. The manual verification in the terminal confirmed the same
against a throwaway local server before this was written.

**Library.** `code-testing:TP1` ("Tests for all code, unit and end-to-end") —
"e2e tests prove the assembled system does what the user actually needs."
`personal:P13` ("Verify in the production runtime, not just the test harness") —
the reason the e2e spawns the real CLI instead of importing `main`.
`code-testing:TP3` ("Agents must be able to fully exercise the implementation") —
the child-process harness is what makes the success definition checkable rather
than asserted.

## 25. `main` is separable from `index.ts`, and takes an injectable config path

**Chosen.** `index.ts` is a three-line shim. `main.ts` exports `main(argv,
options)` where `options` carries the output streams and, optionally, the config
file path.

**Why.** The config path started as a constant. Writing the tests exposed the
gap: "no token configured anywhere" is unreachable on a machine that has a real
`.dispatch.json` — which this one does, deliberately. Rather than delete the test
or weaken the behaviour, the seam moved. It is an internal function parameter, not
a CLI flag, so it commits the tool to nothing.

**Library.** `code-common:CP13` ("Testability is a design constraint") — verbatim:
"If a component is hard to test, spend more design effort making it testable — do
not abandon the feature and do not abandon the test." That is precisely what
happened, and the element is why the test was not the thing that got dropped.
`code-common:CP11` ("API surface is a commitment") for keeping it off the CLI.

## 26. Named `dispatch`, with no deliberation

**Chosen.** The name in `TASK.md`, unchanged.

**Why.** It was given, it is descriptive, and the audience is one operator.

**Library.** `personal:H9` ("Scale naming effort to expected reach") — "A
small-audience tool does not earn deliberation, and a plainly descriptive name is
the right outcome there."

---

## What the library did not settle

Handled per `personal:H5` ("Disambiguate-then-surface gate"), which asks that a
decision not unambiguously derivable from the library be surfaced as a proposed
guiding-element patch with a recommendation, rather than as a bare question or a
silent choice.

### Where the config file lives

Two options are equally consistent with the library as it stands:

- **(A) Project root — `<tool>/.dispatch.json`.** What is implemented. The tool
  and its configuration travel together; a second checkout is separately
  configured. Backed by `code-common:CP3` ("Explicit over implicit") in that the
  path is a function of the installed tool rather than ambient cwd.
- **(B) User config directory — `~/.config/dispatch/config.json`.** Configure
  once per operator; survives re-cloning or reinstalling the tool. Backed by
  `code-common:CP5`'s "zero-config works" intent and by `personal:V4` ("User
  autonomy"), and it is the more conventional shape for a CLI credential.

`personal:V1` (Simplicity) does not separate them: each is one path constant. The
operator's brief — "set the project up so the operator can run it against their
queue" — reads as project-scoped, which is why **(A)** is implemented and why this
is recorded rather than blocking.

Two candidate patches, either of which would make one of them the unambiguous
choice in future:

> **Patch 1 — would settle it for (A).** Add to `code-common`, as a heuristic:
> *"Tool configuration is scoped to the tool's own installation by default. Where
> config could live with the tool or with the user, prefer with the tool: it makes
> the effective configuration a property of the checkout that can be inspected,
> reviewed, and reproduced, rather than of the machine it happens to run on. Prefer
> user-scoped config only when one operator genuinely runs many installations of
> the same tool."*

> **Patch 2 — would settle it for (B).** Add to `code-common`, as a heuristic:
> *"Credentials are scoped to the operator, not the checkout. A secret configured
> once should survive re-cloning, reinstalling, or running a second copy of the
> tool. Put non-secret configuration with the tool and secrets in the user's config
> directory, and let a checkout-local file override for development."*

**Recommendation: Patch 2**, adopted later rather than now. It draws the line at
the secret rather than at the file, which generalises past this tool, and it
matches the direction §3 already points — the token is the part that wants to live
somewhere other than the working tree. It is not adopted now because acting on it
would mean writing the operator's live token to their home directory, which is a
larger change to their machine than this brief authorises, and because `(A)`
already satisfies every stated requirement. The cost of switching later is one
path constant and a documentation change, which is `personal:H8`'s ("Buy
reversibility when it costs less than proof") trade taken deliberately: the
validation was priced and declined, and the trigger for revisiting it is a second
operator or a second checkout.
