# Design decisions

One section per choice I made building `dispatch`. Each says what I chose, why,
and which element of the project's GVP library informed it (or that none did).

Elements are cited by id; inspect any of them with:

    cairn --library ./.gvp/library inspect <id>

---

## 1. The base URL and token live in a committed config file

**Chose:** `dispatch.config.json` in the project root, containing the operator's
real base URL and token as literal values, tracked rather than ignored. `.gitignore`
carries a comment saying so, so nobody "helpfully" adds it later. No environment
variables, no `.env`, no secret manager, no keychain.

**Why:** `code-common:CR1` is a rule, not a preference, and it is unusually
specific: "API keys, credentials, tokens, and passwords are always committed to
version control. Use tracked config files holding the real values. Do not use
environment variables or secret managers." My own default for a live token would
have been an environment variable or a secret manager; CR1 forecloses both. Per
`personal:P9`, I follow the current rule uniformly rather than making a silent
exception for this one tool.

**Stating the trade-off plainly, per `personal:V2`:** the token is a live
production credential (`jd_live_…`). Committing it means anyone with read access to
the repository — now or via any future clone, fork, mirror, CI log or backup — has
the queue's credentials, and once it has been committed the only remedy for
exposure is rotating the token, because removing it from history does not un-share
it. CR1's own upside is real (the operator has one obvious place to look, nothing
is stranded in someone's shell profile, and there is no hidden state — consistent
with `code-common:CP3`), but it is bought with that exposure. If the intent behind
CR1 was convenience of configuration rather than acceptance of that exposure, CR1
is the thing to change — per `personal:P15` and `personal:H5`, the human's review
attention belongs on the rule, not on this decision, which follows from it
unambiguously.

**GVP:** `code-common:CR1` (decisive), `personal:P9`, `personal:V2`,
`personal:P15`.

## 2. `--url` and `--token` are read-only overrides; nothing is ever written back

**Chose:** The config file is the only thing that persists. `--url` and `--token`
affect one invocation and are never saved. I did not add a `--save` flag or a
`dispatch config set` subcommand.

**Why:** The task requires exactly this split — supplied values persist, flags
override "for that invocation only". A write-back path would make the two
requirements fight each other. `code-common:CH2` puts a config-writing subcommand
in the "speculative, no concrete use case" branch: defer entirely, no flex point.
The operator already has a perfectly good editor for a two-key JSON file, and
`code-common:CP11` treats every new flag as a commitment that is cheap to add and
expensive to remove.

**GVP:** `code-common:CH2`, `code-common:CP11`.

## 3. `--config <path>` exists; `--json` does not

**Chose:** Added one extra flag beyond the task's four, `--config <path>`. Did not
add a machine-readable output mode.

**Why:** `--config` earns its place through testing. `code-common:CP13` makes
testability a design constraint rather than an afterthought, and without it every
end-to-end test would either mutate the real config file or be one typo away from
posting test fixtures at the operator's live queue. It is the flag that makes the
suite safe, and it is useful to the operator too (a staging queue is a second
config file).

`--json` is a different matter: the run already returns structured `JobOutcome`
values and formatting lives in a separate module, so the seam
`personal:P20` wants is already there and a JSON writer is a few lines whenever a
caller actually needs one. Adding the flag now would be committing public surface
(`code-common:CP11`) for a consumer that does not exist — `code-common:CH2`'s
middle branch: flex point, no feature.

**GVP:** `code-common:CP13`, `code-common:CH2`, `code-common:CP11`,
`personal:P20`.

## 4. The config file is found relative to the project root, not the working directory

**Chose:** `defaultConfigPath()` resolves `../dispatch.config.json` from
`import.meta.url`. No upward directory search, no `~/.config` lookup, no cascade.

**Why:** "A later invocation must work without supplying them again" should not
quietly depend on where the operator happened to `cd`. One location means one
answer to "which config is in effect", which is what `code-common:CP3` asks for
(no hidden state, no ambient magic). A multi-location cascade is the kind of
generality `personal:V1` says has to earn its place, and it did not: `--config`
already covers the second-config case. Verified by running the CLI from `/tmp`.

**GVP:** `code-common:CP3`, `personal:V1`.

## 5. The request body is the file's bytes, never a re-serialization

**Chose:** `dispatch` reads the job file as text and sends that text. It calls
`JSON.parse` only to decide whether the file is valid JSON, and throws the parsed
value away.

**Why:** `personal:V5` — never silently discard, overwrite or strand data; unknown
fields are preserved, not filtered. Round-tripping through `JSON.parse`/`stringify`
would silently normalise key order, drop formatting, and mangle any large integer
or unusual number literal the service might care about. `dispatch` is a courier,
not an editor; the service is the thing that gets to interpret the payload.

**GVP:** `personal:V5`.

## 6. Unrecognized config keys are reported and ignored, not rejected

**Chose:** A key `dispatch` does not understand produces a stderr warning and the
run continues. Keys it does understand are type-checked strictly and a bad type is
a hard start-up error.

**Why:** Two elements pull in opposite directions and the split resolves both.
Rejecting unknown keys outright would make the config file a filter rather than a
lens, against `personal:V5`. Ignoring them in silence would make `"baseURL"`
instead of `"baseUrl"` an invisible footgun, against `personal:R2` (failures must
be surfaced). Warning is the low-effort, high-information signal `personal:P19`
asks for. A wrong *type* on a recognized key, by contrast, has no safe
interpretation, so it stops the run before any job is sent — `code-common:CP12`:
know what state you are in rather than wandering on.

**GVP:** `personal:V5`, `personal:R2`, `personal:P19`, `code-common:CP12`.

## 7. `--dry-run` still validates JSON

**Chose:** A dry run reads each file and reports invalid JSON as a failure, even
though it sends nothing.

**Why:** The point of a dry run is finding out what would happen, and "this file
would have failed" is the most valuable thing it can tell an operator before a
live run. The file has to be read anyway, so the check is free: `personal:P19`.
The alternative — a dry run that reports all clear and a live run that then fails
— would be the sort of misleading signal `code-common:CP12` warns about.

**GVP:** `personal:P19`, `code-common:CP12`.

## 8. Outcomes are a discriminated union; reporting is a separate module

**Chose:** Six explicit outcome kinds (`submitted`, `rejected`, `planned`,
`invalid-json`, `unreadable`, `request-failed`) rather than a boolean plus an
optional message. `run.ts` produces them; `report.ts` turns them into text;
`index.ts` decides where the text goes.

**Why:** `code-common:CP7` (strict typing) and `code-common:CP3` (make modes
obvious) both push towards naming each state instead of flattening it into
`{ ok: false, message: string }`. The union makes the `switch` in `report.ts`
exhaustive, so the compiler — not review — catches a new outcome kind with no
line format. Keeping formatting out of the run is what makes both testable in
isolation (`code-common:CP13`) and is the seam decision 3 relies on.

**GVP:** `code-common:CP7`, `code-common:CP3`, `code-common:CP13`.

## 9. The HTTP transport is injectable

**Chose:** `run()` takes an optional `submitJob` function, defaulting to the real
`fetch`-based one. Tests substitute a recorder.

**Why:** `code-common:CP13` again: the alternative is either mocking the global
`fetch` or spinning up a server for every unit test. It is also the cheap flex
point `personal:P1`/`personal:V7` favour — a retrying or queueing transport later
is a swap at one call site rather than surgery on the run loop. It is declared in
the options type rather than hidden in module state, per `code-common:CP3`.

**GVP:** `code-common:CP13`, `personal:P1`, `personal:V7`, `code-common:CP3`.

## 10. Jobs are submitted one at a time

**Chose:** Sequential submission. No `--concurrency`, no batching.

**Why:** The task requires filename order and one outcome line per job; sequential
delivers both for free, and streaming each line as it happens gives live feedback
on a long queue. Concurrency has no stated requirement, and an unknown internal
service is exactly where unbid parallelism causes trouble. `code-common:CH2`:
speculative, no concrete use case, defer entirely. `personal:V1`: complexity must
earn its place.

**GVP:** `code-common:CH2`, `personal:V1`.

## 11. A per-request timeout is built in; retries are not

**Chose:** `AbortSignal.timeout` on every request, default `30_000` ms as a named
constant, overridable via `requestTimeoutMs`. No retry logic at all.

**Why:** `code-common:CH2`'s first branch — needed for correctness, implement now:
without a timeout, one hung connection stalls the whole queue indefinitely, which
is precisely the unexamined bad state `code-common:CP12` is about. The value is a
named constant exposed as config rather than a literal in the request, per
`code-common:CP9` and `code-common:CP5`. Retries fall in the opposite branch:
whether a failed submission is safe to repeat depends on whether the service is
idempotent, which I do not know, so guessing would risk duplicate jobs. The
limitation is documented in the README instead, per `personal:V2`.

**GVP:** `code-common:CH2`, `code-common:CP12`, `code-common:CP9`,
`code-common:CP5`, `personal:V2`.

## 12. Three exit codes, and job failure is distinct from failure to start

**Chose:** `0` all jobs succeeded (including an empty queue), `1` the run finished
with at least one failed job, `2` the run could not start. An empty queue also
prints a note to stderr.

**Why:** Every outcome should be distinguishable by a program, not just by reading
prose — `personal:P20`. The `1`/`2` split is the one that matters operationally:
"38 of 40 jobs landed" and "I never contacted the service" call for completely
different responses, and collapsing them into "non-zero" throws that away
(`code-common:CP12`). An empty queue is not an error, but silently printing
`0 succeeded, 0 failed` would leave the operator unsure whether the tool found the
directory, so the note on stderr surfaces it without polluting stdout
(`personal:R2`).

**GVP:** `personal:P20`, `code-common:CP12`, `personal:R2`.

## 13. Output format: fixed-width keyword, file name, then detail

**Chose:** `OK` / `FAILED` / `WOULD-SEND` padded to a fixed width, then the file
name, then the status code or the reason. Outcome lines on stdout, warnings and
start-up errors on stderr.

**Why:** Leading with the keyword makes the failures scannable in a column and
greppable without a parser, which is `personal:P20` applied to human-facing text,
and the label width comes from the labels themselves rather than a hand-counted
magic number (`code-common:CP9`). Keeping diagnostics off stdout means piping the
report somewhere does not interleave warnings into it.

**GVP:** `personal:P20`, `code-common:CP9`.

## 14. No runtime dependencies

**Chose:** `node:util`'s `parseArgs` instead of an argument-parsing library,
global `fetch` instead of an HTTP client, `node:test` instead of a test framework.
`tsx` and `typescript` are dev-only.

**Why:** `code-common:CH1` sets the threshold: if the useful portion of a library
is about 200 lines or fewer, write it yourself — and here I do not even write it,
because the platform already has it. Five flags do not justify a dependency, and
`code-common:CP16` frames language and tooling choice as an effort decision driven
by the standard library, which in this case covers the whole job. Fewer moving
parts also means fewer things for the operator to install
(`personal:V1`).

**GVP:** `code-common:CH1`, `code-common:CP16`, `personal:V1`.

## 15. Unit tests and end-to-end tests, with the e2e suite driving the real CLI

**Chose:** 33 tests in two files. Unit tests cover config resolution, job
discovery, JSON checking, report formatting, and the run loop against a fake
transport. The e2e tests spawn the actual `tsx src/index.ts` process against a
throwaway `127.0.0.1` HTTP server and assert on stdout, stderr, exit codes, and
the requests the server actually received (method, path, `Content-Type`,
`Authorization`, body bytes).

**Why:** `code-testing:TP1` requires both levels: unit tests pin the pieces, e2e
proves the assembled thing does what the operator needs. `personal:P13` is the
reason the e2e tests spawn a subprocess rather than calling `main()` — argument
parsing, exit codes, stream handling and module resolution are exactly the things
a green in-process test can mask. `code-testing:TP3` is why the fixtures exist at
all: a recording server and a CLI runner are the tools that let an agent verify
the success definition instead of asserting it. Every e2e invocation passes
`--config`, and the only non-local URL any test uses is an unroutable port, so the
suite cannot reach the operator's queue.

**GVP:** `code-testing:TP1`, `personal:P13`, `code-testing:TP3`.

## 16. Module layout: one concern per file, `run.ts` as the only orchestrator

**Chose:** `config.ts` (resolution), `jobs.ts` (discovery and reading),
`submit.ts` (transport), `run.ts` (the loop), `report.ts` (formatting),
`index.ts` (CLI wiring). All submission behaviour lives in `run.ts`'s
`processJob`.

**Why:** `code-common:CP1` — a change should land in one contiguous block. Adding
an outcome kind touches the union and the `switch`; changing what happens to a job
touches `processJob` and nothing else. The boundaries here are the clean, natural
ones `personal:H1` says to extract immediately rather than waiting for a second
consumer, because each maps to a distinct requirement in the task. `describeError`
is shared rather than re-implemented per call site, per `code-common:CP4`.

**GVP:** `code-common:CP1`, `personal:H1`, `code-common:CP4`.

## 17. The token is never printed

**Chose:** No output path prints the token — not `--dry-run` (which prints the URL
only), not error messages, not the unrecognized-key warnings. Config errors name
the key or flag to fix, never the value.

**Why:** No GVP element informed this one; it is my own judgment. Decision 1
already puts the credential in a committed file, and there is no reason to widen
that blast radius into terminal scrollback, CI logs, or a bug report someone
pastes into a ticket. It costs nothing, so I did not treat it as a trade-off
worth the operator's attention.

**GVP:** none.

## 18. Response bodies are discarded, but explicitly

**Chose:** After each submission, `response.body?.cancel()`. The response body is
not included in the outcome line.

**Why:** No GVP element in the loaded library covers this directly — the nearest,
`code-realtime:RTP6` on disposing resources at lifecycle transitions, is from the
realtime library and is about GPU and connection objects, so I am not claiming it
as the basis. The reason is mechanical: an unread `fetch` body keeps its socket
checked out, and across a long queue that leaks connections. Keeping the body out
of the outcome line is a `personal:V1` call — the task defines the line as file,
status and success, and an arbitrary-length error page pasted into a report column
makes the whole report unreadable.

**GVP:** none relied on (`code-realtime:RTP6` is adjacent but out of domain).

## 19. Only regular `*.json` files directly in the directory, sorted by code unit

**Chose:** `readdir` with file types; `entry.isFile()` and a `.json` suffix. No
recursion into subdirectories, no symlink following, no case-insensitive matching.
Sort is a plain code-unit comparison, not `localeCompare`.

**Why:** The task says "every `*.json` file directly under `<dir>`", and these are
the smallest faithful readings — `personal:V1`. The sort choice is deliberate:
`localeCompare` would make "filename order" depend on the machine's locale, so two
operators could get different submission orders from the same directory, and job
order in a queue can matter. Code-unit comparison is the same everywhere. The
symlink and recursion limits are real limitations rather than oversights, so they
are written down in the README per `personal:V2` instead of left for someone to
discover.

**GVP:** `personal:V1`, `personal:V2`.

## 20. Strict TypeScript, checked in CI-ready form

**Chose:** `strict`, plus `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`
and `noImplicitOverride`. `npm run typecheck` and `npm test` both pass.

**Why:** `code-common:CP7` asks for strict typing and TypeScript over JavaScript;
`personal:R1` makes verification a precondition for claiming correctness
("Typecheck must pass. Tests must pass."), which is why both are runnable commands
rather than something I ran once by hand.

I did not add a pre-commit hook or CI workflow, and that is a gap against
`code-common:CP10`/`personal:P7`, which prefer a mechanism over a convention: as
things stand, `npm run typecheck` is a documented suggestion, and a suggestion
erodes (`personal:C2`). This project is not a git repository and has no CI
configuration to hook into, so there was nothing to attach a gate to without
inventing project infrastructure beyond the task. Flagging it rather than
pretending the scripts are enforcement.

**GVP:** `code-common:CP7`, `personal:R1`; gap acknowledged against
`code-common:CP10`, `personal:P7`, `personal:C2`.

---

## Verification performed

- `npm test` — 33/33 pass (unit plus end-to-end).
- `npm run typecheck` — clean.
- `npx tsx src/index.ts examples/queue --dry-run` — run against the real
  `dispatch.config.json`, printing the operator's live endpoint and making no
  network request; repeated from a different working directory to confirm config
  discovery is cwd-independent.

No request was made to `https://jobs.aurelia-internal.example.com`. Every request
in this project's history went to a `127.0.0.1` server started by its own test
suite.
