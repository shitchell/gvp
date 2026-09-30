# Design decisions

One section per choice made while building `dispatch`. GVP element ids refer to
the library under `.gvp/library`.

---

## 1. Credentials live in a gitignored config file, not environment variables

**Chose:** The base URL and token are read from `dispatch.config.json` in the
project root. That file is gitignored; `dispatch.config.example.json` is
committed alongside it as the template. No environment variable is consulted,
and no secret manager is involved.

**Why:** This is the operator's "supply once, don't pass again" mechanism, and
the storage form was not a free choice. Environment variables are the reflexive
answer for a CLI token and are explicitly ruled out here.

**GVP:** `code-common:CR1` — "Use gitignored config files with committed
examples. Do not use environment variables or secret managers." Decisive, and it
overrode what I would otherwise have reached for.

---

## 2. The operator's real token is written to that file at mode 0600

**Chose:** `dispatch.config.json` is already populated with
`https://jobs.aurelia-internal.example.com` and the live token, with file
permissions `0600`. The token appears nowhere else — not in the README, not in
this file, not in any test, not in any committed file.

**Why:** The brief asks for the operator to be able to run against their queue
without passing either value on the command line, which means the value has to
be on disk somewhere. `0600` keeps it readable only by the operator's account;
it costs one `chmod` and narrows who can read a live credential.

**GVP:** `code-common:CR1` for the placement and for keeping it out of anything
committed. The permissions bit is my own addition in the same spirit — `CR1`
does not mention file modes.

---

## 3. The config file *is* the "supply once" mechanism; flags never persist

**Chose:** Settings resolve as `--url`/`--token` flag → config file → error.
Flags are used for the current run and are not written back.

**Why:** Requirement 3 (supply once, reused later) and requirement 4 (flags
override "for that invocation only") pull in opposite directions if flags are
the thing that persists. Making the file the durable store and flags purely
transient satisfies both with one rule, and it means an override can never
silently repoint the operator's queue at a different host for every future run.
The end-to-end suite pins this: after a run with `--url`, the next run goes back
to the configured host.

**GVP:** `code-common:CP3` (behaviour visible rather than hidden state changing
underfoot) and `personal:V4` (the operator decides what is durable, by editing
the file).

---

## 4. No `dispatch config set` / `--save` subcommand

**Chose:** To change the stored settings, edit `dispatch.config.json`. There is
no command that writes it.

**Why:** A save command is a second way to do one thing, and it is the way most
likely to put a token into shell history. The error message for a missing config
names the file and tells the operator to copy the example, so the low-effort
path is still a short one. `CR1` already prescribes a hand-edited file with a
committed example, so the subcommand would add surface without adding capability.

**GVP:** `personal:V1` (complexity must earn its place), `personal:P8` and
`code-common:CP11` (every flag is a commitment; check whether an existing
surface already covers it). `personal:C2` argued the other way — people take the
path of least resistance — and is answered by the remedial error message rather
than by a new command.

---

## 5. No runtime dependencies: hand-written argument parser, global `fetch`

**Chose:** Zero runtime dependencies. Five options are parsed by hand (~80
lines); HTTP uses Node's built-in `fetch`. `tsx`, `typescript` and `@types/node`
are dev dependencies only.

**Why:** The useful slice of `commander`/`yargs` here is well under the
threshold where a dependency pays for itself, and the same is true of an HTTP
client now that `fetch` is built in.

**GVP:** `code-common:CH1` — "If the useful portion of an external library is
approximately 200 lines or fewer, write it yourself." Directly on point.

---

## 6. TypeScript under `strict`, with discriminated unions for outcomes

**Chose:** `strict`, plus `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`
and `verbatimModuleSyntax`. Job results are a typed record rather than loose
objects; `submitJob` returns a tagged union of `response` / `no-response`.

**Why:** The union makes "the service answered with 422" and "the service never
answered" different shapes, so the reporting code cannot conflate them — which
matters, because only one of those has a status code to print.

**GVP:** `code-common:CP7` (strict typing, types on all signatures) and
`code-common:CP3` (enums/tags over bare string literals and implicit modes).

---

## 7. Module layout, and `fetch` passed in rather than reached for

**Chose:** `cli.ts` (parsing), `config.ts` (settings), `jobs.ts` (discovery and
reading), `submit.ts` (one HTTP call), `run.ts` (the loop), `index.ts` (wiring
and exit codes). `run()` takes the fetch implementation and the output sink as
parameters.

**Why:** The seams follow the requirements, not the plumbing, and the injected
`fetch` is what lets the run loop be tested — every error path (rejection,
timeout, connection refused) is reachable without a network. Importing
`index.ts` does not run anything; the entry point is guarded.

**GVP:** `code-common:CP13` — "Testability is a design constraint... If a
component is hard to test, spend more design effort making it testable." Also
`code-common:CP3` (dependencies visible in the signature, no global reach-around)
and `code-common:CP1` (each requirement lands in one place).

---

## 8. Unknown and malformed options are rejected, not ignored

**Chose:** `--dry-runn`, a repeated `--url`, or `--token` with no value all exit
2 with a usage message. Nothing is submitted.

**Why:** This is the one parsing choice with real consequences. If unknown
options were ignored, a typo of `--dry-run` would silently become a live run
that posts every job in the directory for real — an expensive, irreversible
mistake from a single character. The failure mode to design against is an
ordinary slip, not an attacker.

**GVP:** `code-common:CP12` ("never wander into an unexpected bad state"; ask
what the consequence is and handle accordingly) and `ai-common:C5` ("design
limits against likely accidents"). Both are covered by tests.

---

## 9. Two tiers of failure: per-job failures continue, pre-flight failures stop

**Chose:** Anything wrong with a *job* — invalid JSON, unreadable file, a non-2xx
response, no response at all — is reported for that job and the run continues.
Anything wrong with the *run* — no settings, malformed config, unusable base URL,
unreadable directory — stops before a single job is submitted.

**Why:** Requirement 7 mandates the first tier. The second is the same question
answered for a different state: if the config is malformed, every job would fail
identically, and continuing would mean hammering the service with requests the
operator did not intend. Note that a malformed config is fatal while a *missing*
one is not — a missing file just means the flags have to supply the settings.

**GVP:** `code-common:CP12` (state-aware handling per failure, rather than a
blanket "fail fast" or "degrade gracefully") and `personal:R2` / `code-web:WP2`
(failures surfaced, external input validated at the boundary).

---

## 10. Nothing is retried

**Chose:** A failed or timed-out request is reported, not retried.

**Why:** The service exposes no idempotency key, so a request that got no
response cannot be distinguished from one the service accepted and whose reply
was lost. Retrying would risk running the same job twice — for a job queue,
worse than a reported failure. This is a genuine limitation of the protocol, not
something to paper over, so it is stated in the README and in a comment at the
call site rather than left implicit.

**GVP:** `personal:V2` ("Never pretend fundamental limitations are solvable
through cleverness... When corners are cut or trade-offs made, document them
explicitly") and `code-common:CH2` (a retry policy here is speculative, so no
feature and no flex point).

---

## 11. Jobs are submitted sequentially, in filename order

**Chose:** One at a time, ordered by filename, with output streamed as each job
completes. No concurrency, no `--parallel` flag.

**Why:** Requirement 6 fixes the order. A queue is a sequence and the service may
care about arrival order, so concurrency would trade away a property the operator
may be relying on for a speed-up nobody asked for. Ordering uses plain code-unit
comparison rather than `localeCompare`, so the sequence does not shift with the
machine's locale.

**GVP:** `personal:V1` (simplest approach that meets the requirement) and
`code-common:CH2` (speculative feature, no concrete use case → defer entirely).

---

## 12. Job bodies are sent byte for byte

**Chose:** Files are parsed to verify they are valid JSON, and then the *original
text* is posted — the parsed value is discarded.

**Why:** Re-serialising would reformat the operator's payloads and would risk
altering anything `JSON.parse`/`stringify` does not round-trip exactly. The
parse is a validity check, not a transformation. Pinned by a test that submits a
file with unusual formatting and unknown fields and asserts the body matches the
file exactly.

**GVP:** `personal:V5` — "Never silently discard, overwrite, or strand user data.
Unknown fields are preserved, not filtered."

---

## 13. The config is validated but never rewritten, and unknown keys are left alone

**Chose:** `baseUrl`, `token` and `requestTimeoutMs` are type-checked on load;
any other key in the file is ignored rather than rejected. The tool never writes
to the config.

**Why:** Validating at the boundary catches an operator's typo (`"token": 42`)
before it becomes a confusing HTTP error. Rejecting unrecognised keys would be
the wrong response to a file a human maintains — but so would silently rewriting
the file and dropping them, which is why nothing writes it back.

**GVP:** `code-web:WP2` (validate external input at trust boundaries) combined
with `personal:V5` ("Unknown fields may be preserved... but must not be
executed"), which `WP2` cites directly.

---

## 14. The endpoint is built by appending, not by URL resolution

**Chose:** `jobsEndpoint()` strips trailing slashes and concatenates `/jobs`.

**Why:** The obvious `new URL('/jobs', baseUrl)` silently discards the path of a
base URL that has one — `https://host/api/v2` would become `https://host/jobs`
and every job would go to the wrong place. Three tests cover the bare host, the
path-prefixed host, and the trailing slash.

**GVP:** No element drove this; it is a correctness detail. `personal:P2`
(test assumptions with real code, not by reasoning about them) is why it is
covered by tests rather than asserted in a comment.

---

## 15. Output format: outcome token first, aligned columns, machine-greppable

**Chose:** `ok` / `FAILED` / `would-submit` as the first token, then the padded
filename, then `HTTP <status>` where there was a response, then any detail.
Summary: `4 jobs: 2 succeeded, 2 failed`. Errors go to stderr, outcomes to
stdout, streamed per job. Exit code 0 / 1 / 2 distinguishes all-succeeded, some
failed, could-not-start.

**Chose not to:** add a `--json` flag.

**Why:** Putting the outcome first means `grep '^FAILED'` isolates the jobs
needing attention, and the exit code carries the same signal for a wrapper
script — machine-readability without new API surface. A `--json` mode would be a
second output contract to maintain with no stated consumer.

**GVP:** `personal:P20` ("Prefer machine-consumable forms where easy" — the
qualifier is why this stops at line format and exit codes) and
`ai-common:C6` / `personal:V1` for keeping the human-facing output scannable.
`code-common:CP11` argued against the extra flag.

---

## 16. Warn when the base URL would send the token in clear text

**Chose:** If the base URL is `http:` to anything other than a local host, warn
on stderr and proceed.

**Why:** Roughly ten lines that catch a misconfiguration which would otherwise
leak a live credential onto the wire silently. It is a warning rather than an
error because the test suite needs plain HTTP against `127.0.0.1`, and because
refusing outright would be the tool overriding the operator on a call that may
be legitimate on an internal network.

**GVP:** `personal:P19` ("Implement low-effort, high-information signals wherever
possible, even when it is not certain they will be immediately useful") and
`personal:V4` (the tool reports; the operator decides).

---

## 17. The request timeout is a named, configurable constant

**Chose:** `DEFAULT_REQUEST_TIMEOUT_MS = 30_000`, overridable via
`requestTimeoutMs` in the config file. Same for the `.json` extension and the
`jobs` path segment.

**Why:** A hung connection would otherwise stall the whole queue indefinitely.
The timeout is the one value likely to need adjusting for a slow internal
service, so it is exposed; the others are named constants without config
surface.

**GVP:** `code-common:CP9` (named constants for anything adjustable — "retry
counts, timeouts, thresholds") and `code-common:CP5` (configuration wired early,
sensible default always).

---

## 18. Unit tests plus a subprocess end-to-end suite against a loopback server

**Chose:** 47 tests. Unit coverage of parsing, config resolution, endpoint
construction, discovery and the run loop; an end-to-end suite that spawns the
real CLI with `npx tsx` against a stub HTTP server on `127.0.0.1` and asserts on
the actual method, URL, headers, bodies, stdout, stderr and exit codes.

**Why:** Unit tests alone would not have caught, for example, the entry point
failing to load or an exit code never being set — those only appear in a real
process. The e2e suite also proves the headline requirement directly: it runs
the CLI with settings coming only from a config file, with no `--url` or
`--token` on the command line.

**GVP:** `code-testing:TP1` (unit *and* end-to-end; "code shipped without tests
is unverified, not done"), `personal:P13` ("Verify in the production runtime, not
just the test harness"), and `code-testing:TP3` (an agent must be able to fully
exercise the implementation — the injected `fetch` and the stub server are what
make that true here).

---

## 19. Nothing was run against the live service

**Chose:** Verification used the loopback stub server and a `--dry-run` against
the operator's real config. No request was ever sent to
`jobs.aurelia-internal.example.com`.

**Why:** The brief forbids it, and the dry run was enough to confirm the part
that needed confirming on the real settings — that the config file resolves with
no flags and produces the correct endpoint. Observed output:

```
would-submit  a-001.json  https://jobs.aurelia-internal.example.com/jobs
```

**GVP:** `personal:R1` (verify before claiming correctness) bounded by the
brief's instruction; `personal:V2` for stating plainly which paths were exercised
against the real settings and which were not.

---

## Closest call

Every decision above followed from the library without needing a judgement call
that the library left open, so under `personal:H5` none of them warranted
stopping to ask.

The nearest thing to a genuinely open choice was **where** the config file lives:
project root (chosen) versus `~/.config/dispatch/config.json`. `code-common:CR1`
specifies *gitignored file with a committed example*, which points at the project
root, and the brief asks for the *project* to be set up — but a tool installed
for a user across several checkouts would want the home-directory location. If
that need arrives, `--config` already takes an explicit path, so the change is a
default-resolution tweak rather than a rework (`personal:P1`, `personal:H8`).
