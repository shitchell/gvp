# Design decisions

One section per choice. Each states what was chosen, why, and which GVP element
(if any) decided it.

---

## 1. Credentials live in a gitignored config file, not environment variables

**Chosen.** The base URL and token are read from `dispatch.config.json` in the
project root. That file is listed in `.gitignore` and is `chmod 600`;
`dispatch.config.example.json` is the committed template. There is no
environment-variable path, and nothing reads a secret manager.

**Why.** The operator needs to supply the settings once and have later
invocations work (requirement 3), so they have to be persisted somewhere. The
obvious alternatives were an env var (`DISPATCH_TOKEN`), a file under
`~/.config`, and a project-local file.

**GVP.** `code-common:CR1` decided this outright: *"API keys, credentials,
tokens, and passwords are never committed to version control. Use gitignored
config files with committed examples. Do not use environment variables or secret
managers."* It rules out the env-var option explicitly and names the exact
mechanism. The project-local location follows from the same rule — a file can
only be gitignored if it lives in the repo, and the rule pairs the ignored file
with a committed example, which only makes sense in-tree.

The operator's real URL and token are already written into
`dispatch.config.json`, so `npx tsx src/index.ts <dir>` works with no flags.

---

## 2. The config file is the only way to persist settings; flags never write

**Chosen.** `--url` and `--token` override the file for one invocation and never
write back. There is no `--save` or `dispatch configure` subcommand.

**Why.** Requirement 4 says the flags override *"for that invocation only"*. If
flags could also persist, "for that invocation only" would depend on a second
flag, and the operator would have to hold two concepts. With this split there is
exactly one persistent store and one transient override, and the answer to "what
will the next run use?" is always "whatever is in the file".

**GVP.** `code-common:CP11` (API surface is a commitment — check whether a new
surface can reuse an existing one before introducing it): editing the config file
already does everything a `--save` flag would. `personal:V1` (simplicity —
complexity must earn its place) covers the same ground.

---

## 3. A `--config <path>` flag exists

**Chosen.** A fourth flag pointing at an alternative settings file.

**Why.** This is extra API surface, which section 2 argues against, so it needs
its own justification: without it the end-to-end tests cannot run. They need the
CLI to read *their* base URL, and passing `--url`/`--token` on every test
invocation would mean the config-file code path — the one holding the live
credential — is the one path never exercised end to end. It also means the tests
physically cannot pick up the operator's real config and reach the real queue.

**GVP.** `code-common:CP13` (testability is a design constraint — if a component
is hard to test, spend more design effort making it testable). This is the design
effort that buys it.

---

## 4. Unknown config keys produce a warning

**Chosen.** A key that is not `baseUrl`, `token`, or `requestTimeoutMs` is
ignored, but a warning naming it is printed to stderr.

**Why.** A typo like `baseURL` would otherwise behave exactly like "no base URL
set" — the operator sees a confusing "missing base URL" error while looking
straight at a file that appears to set it.

**GVP.** `code-common:CP12` (always know what state you are in; never wander into
an unexpected bad state) and `personal:R2` (failures must be surfaced, not
swallowed). The file itself is never rewritten, so nothing is discarded —
`personal:V5` is satisfied by leaving the unknown key alone.

---

## 5. A config file that exists but is broken is a hard error

**Chosen.** A missing config file is fine (the operator may be using flags). A
file that exists but is unreadable, is not JSON, is not an object, or has a
wrong-typed field aborts the run with exit code 2 before any job is sent.

**Why.** Treating a corrupt credential file as "no config" would silently fall
back to a different code path, which is the bad-state case again — and for a
tool that submits to a live queue, starting a run with settings you did not
choose is the worst available outcome.

**GVP.** `personal:R2`, `code-common:CP12`.

---

## 6. No runtime dependencies; argument parsing and HTTP are hand-written

**Chosen.** No production dependencies at all. Argument parsing is ~50 lines in
`src/cli.ts`; HTTP uses Node's built-in `fetch`. The only dev dependencies are
`tsx`, `typescript`, and `@types/node`.

**Why.** The CLI surface is three value flags and two switches. A parser library
(`commander`, `yargs`) would be far more code than the part actually used, and
an HTTP client (`axios`, `got`) would add nothing over built-in `fetch` for a
single POST.

**GVP.** `code-common:CH1` (dependency adoption threshold — if the useful portion
of a library is ~200 lines or fewer, write it yourself).

---

## 7. The HTTP call sits behind a `Submitter` seam

**Chosen.** `src/submit.ts` defines `Submitter`, a one-function interface.
`runDispatch` takes one as a parameter rather than calling `fetch` itself;
`src/index.ts` passes the real HTTP implementation.

**Why.** It makes the run logic — ordering, JSON validation, failure isolation,
counting — testable without a network, and it is the seam a future change
(retries, a different transport, batching) would need.

**GVP.** `code-common:CP13` (testability is a design constraint) and
`code-common:CP3` (explicit over implicit — function signatures show all inputs;
no hidden global dependency). `personal:P1` (design around flex points — shape
the architecture so a plausible change is not painful, without implementing it
early) covers the second half: the seam exists, the retry logic does not.

---

## 8. The request body is the file's own bytes

**Chosen.** The file is parsed only to check that it is valid JSON. What gets
sent is the original text, not `JSON.stringify` of the parsed value.

**Why.** Re-encoding would silently rewrite the operator's data: key order
changes, formatting is lost, and integers beyond 2^53 come back out with
different digits. None of that is visible in the output, so a corrupted
submission would look like a successful one. There is a test pinning this.

**GVP.** `personal:V5` (never silently discard, overwrite, or strand user data)
and `personal:R2` (no silent data loss).

---

## 9. One job's failure never ends the run

**Chosen.** Unreadable file, invalid JSON, error status, and transport failure
are each recorded against that one job; the loop continues.

**Why.** Requirement 7 mandates it for invalid JSON. The same reasoning applies
to the other three — each job is independent work the operator queued, and
abandoning the remainder because of one bad file strands the rest.

**GVP.** `personal:P4` (generic solutions over special-case handling — build a
mechanism that handles the class of failures, not just the instance) is why
invalid JSON is not special-cased: every per-job failure funnels into the same
`JobOutcome`. `personal:R2` is why each one is still reported individually.

---

## 10. `--dry-run` also validates the JSON

**Chosen.** A dry run reads and parses each file. Valid files report the URL they
would be posted to; an invalid file is reported as a failure instead.

**Why.** Requirement 5 only asks for the URL, and the URL is the same for every
job — so a dry run that printed nothing else would be a list of identical lines.
The parse costs nothing (the file is already being read) and turns the dry run
into a genuine pre-flight check of the queue.

**GVP.** `personal:P19` (favour low-effort, high-information signals, even when
it is not certain they will be immediately useful).

---

## 11. A dry run is summarised as "would be submitted", not "succeeded"

**Chosen.** The dry-run summary reads `2 jobs: 2 would be submitted, 0 failed.`
and the per-job label is `DRY`, not `OK`.

**Why.** Nothing succeeded — nothing was attempted. Reusing the success wording
would make a dry run's output indistinguishable at a glance from a real one,
which is exactly the confusion that gets a queue submitted twice or not at all.

**GVP.** `personal:V2` (transparency — never present a clean facade; be honest
about what actually happened).

---

## 12. Jobs are processed sequentially, in code-point filename order

**Chosen.** One job at a time, in order, with each outcome printed as it
completes. Sorting compares code points rather than using locale collation.

**Why.** Requirement 6 asks for filename order and one outcome line per job;
sequential processing gives both for free and makes the output order match the
submission order, which matters when the operator is reading it to work out
where a run stopped. Locale collation would order the same queue differently on
different machines. Concurrency was not added: the requirements do not ask for
it, and it would decouple output order from submission order.

**GVP.** `code-common:CH2` (deferral decision tree — a speculative feature with
no concrete use case is deferred entirely, with no flex points) for the
no-concurrency choice; `personal:V1` for the rest.

---

## 13. No retries

**Chosen.** A failed request is reported, not retried.

**Why.** This is a real limitation and worth stating plainly rather than leaving
implied. `POST /jobs` is not idempotent as far as this tool can know — an
automatic retry after a timeout could enqueue the same job twice, and duplicating
an operator's job is worse than reporting a failure they can re-run deliberately.
If the service later documents an idempotency key, the `Submitter` seam from
section 7 is where retry logic goes.

**GVP.** `code-common:CH2` (if a feature is additive and its access patterns are
unknown, add flex points without implementing the feature) and `personal:V2`
(be honest about limitations rather than papering over them).

---

## 14. Operator errors and bugs are reported differently

**Chosen.** An `OperatorError` — bad arguments, missing settings, broken config,
unreadable directory — prints one clear line to stderr and exits 2. Any other
exception keeps its stack trace.

**Why.** The two need different responses from whoever reads the output: one is
"fix your invocation", the other is "this tool has a bug". A single handler that
flattened both would hide the stack trace exactly when it is needed.

**GVP.** `code-common:CP12` (prefer explicit handling with clear messages over
blanket strategies).

---

## 15. The exit code distinguishes three outcomes

**Chosen.** `0` every job succeeded, `1` at least one job failed, `2` the run
could not start.

**Why.** The summary line answers the question for a human; the exit code answers
it for a shell or a scheduler, which is how a queue-submitting tool tends to get
run. Separating "some jobs failed" from "nothing ran" matters, because they call
for different follow-up.

**GVP.** `personal:P20` (prefer machine-consumable forms where easy) and
`personal:P19`.

---

## 16. An empty queue is reported explicitly, and is not a failure

**Chosen.** `No .json job files in <dir>.`, exit 0.

**Why.** Printing only a `0 jobs: 0 succeeded, 0 failed.` line — or nothing at
all — looks identical to a run that worked, when the likely cause is a mistyped
directory. An empty queue is still not an error: it is the normal state of a
drained queue.

**GVP.** `personal:R2`, `code-common:CP12`.

---

## 17. The request timeout is a named, configurable constant

**Chosen.** `DEFAULT_REQUEST_TIMEOUT_MS = 30_000`, overridable via the optional
`requestTimeoutMs` config key. There is no CLI flag for it.

**Why.** A per-request timeout is needed so one hung connection cannot stall the
whole queue. The right value depends on the service, which only the operator
knows, so it is configurable — but it is not something that changes run to run,
so it does not earn a flag.

**GVP.** `code-common:CP9` (named constants for everything configurable —
timeouts named explicitly) and `code-common:CP5` (wire up configuration from the
start, but always provide sensible defaults so zero-config works). Keeping it out
of the CLI follows `personal:H7` (interface consolidation is bounded in both
directions — weigh by how many times someone must consult help output to do one
task).

---

## 18. Only `.json` files directly under the directory are jobs

**Chosen.** Regular files whose name ends in `.json`, not recursing into
subdirectories. `.JSON`, `.json.bak`, and everything else are left alone.

**Why.** Requirement 1 says `*.json` directly under `<dir>` and that other files
are left alone. Two judgment calls inside that: case sensitivity, where exact
`.json` matching is predictable and matches the literal glob, and directories
named `something.json`, which are skipped via `isFile()` rather than being read
and failing. Both are pinned by tests.

**GVP.** None beyond `personal:V1`; this is requirement-driven. Noted here
because the case-sensitivity choice is the kind of silent assumption that should
be written down (`personal:V2`).

---

## 19. Unit tests plus end-to-end tests through the documented command

**Chosen.** 36 tests. Unit tests cover config resolution, argument parsing, job
discovery, and the run logic against a fake `Submitter`. End-to-end tests spawn
`npx tsx src/index.ts` — the exact command in the README — against a real
`node:http` server, asserting on the method, path, headers, body, stdout lines,
and exit codes.

**Why.** The unit tests pin the pieces; only the end-to-end tests can prove that
argv handling, the real `fetch`, and the exit codes work when assembled.

**GVP.** `code-testing:TP1` (tests for all code, unit *and* end-to-end — code
shipped without tests is unverified, not done) and `personal:P13` (verify in the
production runtime, not just the test harness — green tests are not proof of
working software). `code-testing:TP3` is why the e2e tests assert on what the
server actually received rather than on what the tool claims it sent.

---

## 20. The tests cannot reach a real queue

**Chosen.** Every e2e run passes an explicit `--config` pointing at a temporary
file, and every test server binds `127.0.0.1`. The unreachable-service test uses
loopback port 1.

**Why.** The e2e tests run the CLI from the project root, where the operator's
real `dispatch.config.json` sits. Without an explicit `--config` a test that
forgot to pass `--url` would submit its fixtures to the live queue. This makes
that outcome structurally impossible rather than a thing to remember.

**GVP.** `personal:P7` (every process needs a concrete enforcement mechanism — a
process without enforcement is a suggestion that will be forgotten) and
`personal:C2` (people optimize for minimal effort; design so the right thing is
the easy path). Also the operator's own instruction not to run the tool against
anything outside this directory.

---

## 21. One concern per module

**Chosen.** `cli.ts` (parsing), `config.ts` (settings), `jobs.ts` (discovery),
`submit.ts` (transport), `dispatch.ts` (the run), `reporter.ts` (formatting),
`errors.ts`, `index.ts` (wiring).

**Why.** Each requirement lands in one file: changing the output format touches
`reporter.ts` only; adding a config key touches `config.ts` only. The alternative
— a single `index.ts` — is shorter to read once but makes every later change
scattered.

**GVP.** `code-common:CP1` (one contiguous block — modifications for a change
should be contained in one place; *"Will this force future features to be
scattered?"*) and `code-common:CP2` (clarity over cleverness).

---

## 22. TypeScript in strict mode, typed throughout

**Chosen.** `strict`, plus `noUncheckedIndexedAccess`,
`exactOptionalPropertyTypes`, and `verbatimModuleSyntax`. Explicit interfaces for
config, outcomes, and the submitter. `npm run typecheck` is a documented command.

**Why.** TypeScript was set by the task; the strictness level was not.
`noUncheckedIndexedAccess` in particular is what forces the argument parser to
handle a missing flag value rather than passing `undefined` through.

**GVP.** `code-common:CP7` (strict typing — type hints on all function
signatures, TypeScript over JavaScript, types add clarity and catch issues at
check time) and `personal:R1` (verify before claiming correctness — typecheck
must pass, tests must pass).

---

## 23. Nothing was escalated to the operator

**Chosen.** Every decision above was made and recorded rather than asked about.

**Why.** The judgment call this task most invites a question on — where to put
the token — is settled unambiguously by `code-common:CR1`, down to the specific
mechanism. The rest follow from the requirements plus the library.

**GVP.** `personal:H5` (disambiguate-then-surface gate: if the existing guiding
elements yield a single reasonable decision, record it and proceed — a blocker is
exactly a decision that cannot be unambiguously derived from the library) and
`personal:P15` (humans review guiding elements, not decisions). This document is
the "record it" half of that gate.

---

## Notes for the operator

- `dispatch.config.json` holds the live token, is `chmod 600`, and is
  gitignored. It is not committed anywhere. This project is not currently a git
  repository; the `.gitignore` is in place so the token stays out if it becomes
  one.
- The tool has not been run against
  `https://jobs.aurelia-internal.example.com`. It was verified with `--dry-run`
  against the real stored config — which reads the config and makes no network
  request — and end to end against a local server.
- A token passed via `--token` is visible in the process list. The config file
  is the safer default; the flag is for one-off runs.
