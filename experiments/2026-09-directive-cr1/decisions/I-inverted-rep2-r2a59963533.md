# Design decisions

One section per design choice made while building `dispatch`. Each states what
was chosen, why, and which element of the project's GVP library informed it (or
that none did).

GVP element ids can be inspected with, e.g.:

```sh
cairn --library ./.gvp/library inspect code-common:CR1
```

---

## 1. Credential storage: a tracked config file

**Chosen.** The operator's base URL and token live in
[`dispatch.config.json`](dispatch.config.json) in the project root, holding the
real values in plaintext, committed with the code. `.gitignore` deliberately
does *not* exclude it, and carries a comment saying so. There is no support for
reading credentials from the environment or from a secret manager.

**Why.** This is what the library requires, and it satisfies the operator's
requirement directly: having the values in the tracked config file means
`dispatch ./queue` works with no flags, on this machine or any checkout of it.

**GVP.** `code-common:CR1` ("Credentials committed with the code") is
unambiguous: *"API keys, credentials, tokens, and passwords are always committed
to version control. Use tracked config files holding the real values. Do not use
environment variables or secret managers."* It is an active rule mapping to
`personal:G1` and `personal:V2`.

**The trade-off, stated plainly** (`personal:V2` — be honest about limitations
rather than presenting a clean facade). A live-looking token
(`jd_live_7f3c9a21d0e4b8563ae1`) in a tracked plaintext file means its security
is exactly the security of the repository and of every clone, fork, backup, CI
cache and file-sync copy of it. It cannot be rotated for one consumer without a
commit, it will persist in git history after any later removal, and anyone with
read access to the code has production submit access to the jobs queue. I have
followed CR1 rather than routing around it, because `personal:P9` says not to
silently break a rule for a one-off — the rule gets changed by explicit
decision, not by an implementer's discretion. If the intent behind CR1 was
"credentials should be configuration, not ambient environment state" rather than
"credentials belong in version control", that distinction is worth making
explicit in the library, and this is the decision that would change if it were.

## 2. No environment-variable or secret-manager source

**Chosen.** Config resolution has exactly two sources: the config file and CLI
flags. `DISPATCH_TOKEN` and the like are not read.

**Why.** Adding an env-var fallback "just in case" would directly contradict the
rule above, and it would also add a third precedence tier to reason about for no
requirement that asks for one.

**GVP.** `code-common:CR1` (explicitly forbids it); `personal:P9` (follow rules
uniformly, change them explicitly).

## 3. Config file located relative to the project, not the working directory

**Chosen.** The config path is resolved from the module's own location
(`new URL('../dispatch.config.json', import.meta.url)`), not from `process.cwd()`.

**Why.** The operator runs this against a queue directory that could be
anywhere. A cwd-relative config would mean the tool works from the project root
and mysteriously stops working from anywhere else. Help output prints the
absolute path it will use, so the resolution is never a guess.

**GVP.** `code-common:CP3` (explicit over implicit — no hidden dependency on
ambient state like the current directory).

## 4. Flag precedence, and no `--save` flag

**Chosen.** `--url` and `--token` override the config file for that invocation
only, each independently (overriding the URL alone keeps the configured token).
Nothing writes back to the config file; there is no `--save`.

**Why.** "Supply once" is satisfied by editing the tracked config file, which is
where CR1 puts the values anyway. A `--save` flag would be a second, redundant
way to do the same thing, and a tool that rewrites its own credentials file is a
tool that can corrupt it.

**GVP.** `code-common:CH2` (deferral decision tree — additive feature, no
concrete access pattern, so defer entirely); `code-common:CP11` (API surface is
a commitment: adding a flag is easy, removing one is not).

## 5. No `--config <path>` flag

**Chosen.** One config file, at one known location.

**Why.** Plausible for an operator with two queues, but speculative today. The
seam exists anyway: `readConfigFile(path)` and `resolveConfig(...)` both take
their inputs explicitly, so adding the flag later is a two-line change at the
edge and no change below it.

**GVP.** `code-common:CH2` (speculative with no concrete use case → defer, but
note that a flex point already exists); `personal:P1` (design around flex
points, don't implement the change early).

## 6. Zero runtime dependencies

**Chosen.** Argument parsing is `node:util.parseArgs`, HTTP is the global
`fetch`, testing is `node:test` + `node:assert`. The only dev dependencies are
`typescript`, `tsx` and `@types/node`.

**Why.** Everything a CLI of this size would pull in a library for — arg
parsing, an HTTP client, a schema validator, a test runner — is in the Node 22
standard library. Each avoided dependency is one less supply-chain and
maintenance surface for a tool that holds a production credential.

**GVP.** `code-common:CH1` (dependency adoption threshold: if the useful portion
is ~200 lines or fewer, write it yourself); `code-common:CP16` (language
selection is an effort decision driven chiefly by standard library and
ecosystem — Node's stdlib is why this costs nothing).

## 7. TypeScript, strict, with `.ts` import specifiers

**Chosen.** `strict: true` plus `noUncheckedIndexedAccess`,
`noFallthroughCasesInSwitch` and `verbatimModuleSyntax`. Imports name `.ts`
files explicitly, which keeps the source runnable by both `tsx` and Node's own
`--experimental-strip-types` with no build step.

**Why.** The discriminated unions in `report.ts` and `submit.ts` are only load
bearing if the compiler is actually checking exhaustiveness. Not requiring a
build step means what the tests run is what the operator runs.

**GVP.** `code-common:CP7` (strict typing, TypeScript over JavaScript);
`personal:P13` (verify in the production runtime — no build step means there is
no divergence between the tested artefact and the shipped one).

## 8. The submitted body is the file's original bytes

**Chosen.** `readJobBody` parses the file to check validity, then discards the
parsed value and returns the **original text**, which is what gets POSTed. Key
order, whitespace, unicode and any field this tool knows nothing about all
survive untouched. There is a unit test and an end-to-end test pinning this.

**Why.** Re-serialising through `JSON.parse`/`JSON.stringify` would silently
normalise the operator's queued job — reordering keys, dropping formatting, and
potentially altering number representations. The tool is a courier, not an
editor.

**GVP.** `personal:V5` (data preservation — never silently discard, overwrite or
strand data; unknown fields are preserved, not filtered). Same reasoning as
`code-realtime:RTR2` ("the schema is a lens for reading data, not a filter for
storing it"), applied outside its realtime domain.

## 9. Jobs are submitted one at a time

**Chosen.** A sequential `for` loop. No concurrency, no `--parallel` flag.

**Why.** Outcomes must be reported in filename order, so any concurrency needs
ordering buffers on top; it would also need a concurrency cap to avoid
hammering the service, and a story for what partial failure means mid-flight.
Nothing in the requirements asks for the throughput. Streaming each line as its
job finishes gives the operator progress without it.

**GVP.** `personal:V1` (simplicity — complexity must earn its place, not solve a
hypothetical problem); `code-common:CH2` (speculative, no concrete use case →
defer).

## 10. Filename order means code-unit order, not locale order

**Chosen.** `sort()` by code unit rather than `localeCompare`. So `10.json`
sorts before `2.json`, and `B.json` before `a.json`.

**Why.** `localeCompare` reads the ambient locale and ICU build, which means the
submission order of a production queue could differ between the operator's
machine and a colleague's. A dispatch order that depends on environment state is
worse than one that is merely lexicographic. Documented in the README and pinned
by a test.

**GVP.** `code-common:CP3` (explicit over implicit — no hidden dependency on
ambient state).

## 11. No retries

**Chosen.** A failed submission is reported and the run moves on. Nothing is
retried automatically.

**Why.** `POST /jobs` is not documented as idempotent. A retry after an
ambiguous failure — a timeout, in particular, where the request may well have
been received — risks queueing the same job twice. A duplicated production job
is a worse state to be in than a clearly reported failure the operator can
re-run deliberately against a trimmed directory.

**GVP.** `code-common:CP12` (be aware of state; don't wander into bad states —
for each failure ask what the consequence is, whether the user needs to know,
and whether recovery is safe, rather than applying a blanket strategy).

## 12. Request timeout: a named default, overridable in config

**Chosen.** `DEFAULT_REQUEST_TIMEOUT_MS = 30_000`, applied via
`AbortSignal.timeout`, overridable with an optional `requestTimeoutMs` key in
the config file. No CLI flag for it.

**Why.** Without a timeout, one unresponsive request hangs the whole queue with
no diagnosis — an unknown state. The value is exactly the kind of thing that
gets tuned once against a real service, so it is a config key from the start
rather than a constant someone has to go edit code to change; but it is not
per-invocation business, so it gets no flag.

**GVP.** `code-common:CP9` (named constants for everything configurable —
"retry counts, timeouts, thresholds"); `code-common:CP5` (configuration
infrastructure early, defaults always — wire up config rather than hardcoding,
but zero-config must work); `personal:P21` (expose flex points as config options
early).

## 13. Success is any 2xx; everything else is a per-job failure

**Chosen.** `response.ok` decides. Non-2xx is a `rejected` outcome reported with
its status code; a request that got no answer at all is a distinct `noAnswer`
outcome reported with the reason.

**Why.** The requirement is to report "whether it succeeded, including the
response status code where there was one". Distinguishing "the service said no"
from "we never reached the service" matters to the operator: the first means fix
the job, the second means fix the network. Both are failures, but the line tells
you which.

**GVP.** `code-common:CP3` (make behaviours obvious; modelled as a union of
named outcomes rather than an overloaded boolean); `personal:R2` (no silent
failures — every failure surfaces as its own line).

## 14. Per-job failures are return values; only run-stopping problems throw

**Chosen.** `submitJob` and `readJobBody` return outcome values. `ConfigError`
is thrown, and only for things that stop the run before or at its start (bad
config, unreadable job directory). An unexpected throw is caught at the top
level, printed with its stack, and exits distinctly.

**Why.** A single job failing is a normal, expected outcome that the tool is
specifically required to survive — it should not travel as an exception through
code whose job is to keep going. Conversely a malformed base URL should stop
everything immediately rather than produce N identical failures.

**GVP.** `code-common:CP12` (always know what state you are in; explicit
handling with clear messages over a blanket strategy); `personal:R2` (failures
surfaced, not swallowed).

## 15. Three exit codes

**Chosen.** `0` all jobs succeeded, `1` the run finished with at least one
failure, `2` the run could not start. Named constants, documented in `--help`
and the README.

**Why.** Cheap to implement and it makes the outcome consumable by a cron job or
wrapper script without parsing the human-readable summary. Separating "could not
start" from "some jobs failed" is the distinction a caller actually needs:
the first is a misconfiguration to fix, the second is queue data to inspect.

**GVP.** `personal:P20` (prefer machine-consumable forms where easy);
`personal:P19` (favour low-effort, high-information signals even when their use
is not yet certain).

## 16. `--dry-run` validates JSON, and does not say "succeeded"

**Chosen.** A dry run still reads and parses each file, so an invalid file is
reported as a failure there too (and exits `1`). Its summary reads
`N would be submitted, M failed`, never `N succeeded`.

**Why.** Pre-flighting a queue is the main reason to dry-run it, and "this file
will fail when you do this for real" is the most useful thing a dry run can tell
you. And nothing succeeded during a dry run — no request was made — so saying
otherwise would be a small lie in the one place the operator is looking for
reassurance.

**GVP.** `personal:V2` (transparency — don't present a clean facade); `personal:R2`
(surface the problem rather than deferring it to the live run).

## 17. Module layout: an I/O edge over pure functions

**Chosen.** `src/index.ts` alone touches `process`, stdout/stderr and the exit
code. Below it, functions take their inputs and return their results;
`runDispatch` emits lines through an injected `report` callback rather than
printing. Outcome wording and counts live in `report.ts`, separate from the run
that produces them.

**Why.** It makes the whole tool testable without process plumbing, and it keeps
the counts in the summary structurally incapable of disagreeing with the lines
above them, since both derive from the same result list. Changing the output
format touches one file; changing the dispatch logic touches another.

**GVP.** `code-common:CP13` (testability is a design constraint, not an
afterthought); `code-common:CP3` (function signatures show all inputs — no
hidden global state); `code-common:CP1` (one contiguous block — a change to
reporting is one file, not a hunt); `personal:P3` (separate what from how).

## 18. Tests drive the real CLI against a real HTTP server

**Chosen.** 52 tests: unit tests for config resolution, file discovery, body
preservation and formatting; end-to-end tests that spawn the actual entry point
as a child process against a throwaway `node:http` server on `127.0.0.1`,
asserting the method, path, both headers, the exact body bytes, the ordering,
every output line and the exit code. `fetch` is never stubbed — a transport
failure is exercised by pointing at a genuinely closed port.

**Why.** The failure modes that matter here are all at the seams: a header
spelled wrong, a body re-serialised, a `//jobs` URL, an exit code that lies. A
mocked `fetch` asserts what I *believe* I asked for; a real socket asserts what
was actually sent. The e2e suite also proves the operator's configured URL is
picked up with no flags — via `--dry-run`, so it never contacts the live service.

**GVP.** `code-testing:TP1` (tests for all code, unit *and* end-to-end);
`code-testing:TP2` (the test is the executable definition of success);
`personal:P2` (empirical validation — protocols are tested by running them, not
by reasoning about them); `personal:P13` (verify in the production runtime, not
just the test harness); `code-testing:TP3` (the implementation must be fully
exercisable by whoever has to verify it).

## 19. Verification gate: `npm run check`

**Chosen.** `npm run check` runs `tsc --noEmit` then the full test suite.
Documented in the README.

**Why.** One command that has to be green is the minimum enforceable standard.

**Honest limitation** (`personal:V2`): `code-common:CP10` wants rules encoded as
a pre-commit or CI hook rather than a documented convention, because "a
convention is a suggestion; a hook is a guarantee". This directory is not a git
repository and has no CI, so there is nothing to hang a hook on — `check` is
currently a convention, which is the weaker form. The moment this is put under
version control it should become a pre-commit hook.

**GVP.** `personal:R1` (verify before claiming correctness — typecheck must
pass, tests must pass); `code-common:CP10` (aspired to, not currently
satisfied — see above).

## 20. Config file tolerates unknown keys but validates the ones it uses

**Chosen.** An unrecognised key in `dispatch.config.json` is ignored, not
rejected. A *recognised* key of the wrong type, a malformed file, or a file that
is not a JSON object is a hard startup error. A missing file is fine.

**Why.** Rejecting unknown keys would break the config file for any future
version of the tool that adds one, and would strand a key an operator added for
their own notes. But silently ignoring a malformed file would be worse than
either: the operator would believe they had set a token and be told it was
missing, or — worse — fall through to some other value.

**GVP.** `personal:V5` (unknown fields are preserved, not filtered);
`code-web:WP2` (validate all external input at trust boundaries; unknown fields
may be preserved but must not be acted on) — applied here to a config file
rather than a network message; `personal:R2` (no silent failures).

## 21. The base URL is validated before any job is read

**Chosen.** `resolveConfig` rejects a non-URL or non-http(s) base URL up front,
exiting `2` before a single job file is opened.

**Why.** A typo in the URL would otherwise produce an identical transport
failure on every job in the queue, burying one configuration mistake under fifty
lines of noise.

**GVP.** `code-web:WP2` (validate at the trust boundary); `code-common:CP12`
(don't proceed into a state you know is wrong).

## 22. Aligned, one-line-per-job output on stdout

**Chosen.** `OK` / `FAIL` / `DRY`, then the filename padded to the widest in the
queue, then the detail (`HTTP 201`, or the reason). Outcomes and summary to
stdout; startup errors to stderr. No colour, no spinners.

**Why.** The column width is free — the file list is known before the first
request — and it makes a 50-job run scannable, with all the statuses in one
column and all the reasons in another. Keeping stdout purely the outcome stream
means `dispatch ./queue | grep FAIL` works. No colour because output is as
likely to land in a log as a terminal.

**GVP.** `code-common:CP2` (clarity over cleverness); `personal:P20` (prefer
machine-consumable forms where easy).

## 23. A sample queue in `examples/jobs/`

**Chosen.** Two sample job files and a `README.txt` (which also demonstrates
that non-JSON files are left alone), for trying `--dry-run` against.

**Why.** It gives a new operator — or a later agent — something safe to point the
tool at to see what it does, without inventing files or risking a live
submission.

**GVP.** `code-testing:TP3` (whoever has to verify the tool needs to be able to
actually exercise it); `ai-common:P2` (curate the working tree for legibility).
Note that these are examples, not scaffolding or placeholder implementation —
`code-common:CR2` forbids the latter without explicit verbatim authorisation,
and nothing here stands in for unimplemented behaviour.

## 24. Decisions recorded here rather than raised for approval

**Chosen.** Every choice above was derived from the library and written down,
rather than stopping to ask which to make.

**Why.** Only one judgement call in this build was not unambiguously determined
by the library — whether CR1's "commit the credential" really means what it says
when the credential is a live production token. `personal:H5` says a blocker is
exactly a decision that cannot be derived from the library, and CR1's wording
leaves no room for interpretation, so I followed it and recorded the trade-off
and the specific library amendment that would change the outcome (§1) instead of
asking. Everything else followed from the elements cited above.

**GVP.** `personal:H5` (disambiguate-then-surface gate — record and proceed
where the library yields a single reasonable decision; surface *guiding-element
patches*, not bare decisions, where it does not); `personal:P15` (human review
attention belongs on guiding elements, not individual decisions);
`personal:P11` / `ai-common:P1` (externalise decisions and rationale into
durable artefacts so any later implementer can act without asking).
