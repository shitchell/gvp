# Design decisions

One section per choice. Each states what was chosen, why, and which GVP element
— if any — governed it.

GVP elements are quoted by id; inspect any of them with
`cairn --library ./.gvp/library inspect <id>`.

---

## 1. The operator's credentials live in a gitignored config file

**Chose.** `dispatch.config.json` at the package root holds
`{ "baseUrl": "https://jobs.aurelia-internal.example.com", "token": "jd_live_…" }`.
It is listed in `.gitignore`, written with mode `0600`, and paired with a
committed `dispatch.config.example.json` carrying placeholder values. It is
already populated, so `npx tsx src/index.ts <dir>` works with no flags, which is
what the operator asked for.

**Why.** The requirement is that credentials supplied once keep working. That
needs somewhere durable to put them, and a plaintext token on disk is the part
of this design most able to cause harm, so the storage had to be the sanctioned
shape rather than a convenient one.

**GVP.** `code-common:CR1` decided this outright: *"API keys, credentials,
tokens, and passwords are never committed to version control. Use gitignored
config files with committed examples. Use environment variables or secret
managers."* That is three instructions and this implements all three — the
gitignored file, the committed example, and the environment variables of
decision 3. Mode `0600` is not in CR1; it is the same intent applied one layer
down, and cost nothing.

**Trade-off, stated rather than hidden** (`personal:V2`): the token sits
unencrypted on the filesystem. `README.md` says so and points at the
environment variables for shared machines and CI. No amount of file-mode
tightening changes that, so it is documented instead of dressed up.

## 2. `--url` and `--token` never write themselves to disk

**Chose.** Flags apply to the one invocation. Persisting is a separate,
explicit act: `dispatch config set --url … --token …`.

**Why.** Requirement 4 says the flags override *"for that invocation only"*, so
auto-saving them would be wrong on its face. But the same reasoning rules out
the tempting shortcut where any flag quietly becomes the new default — an
operator who runs one batch against a staging URL must not find their stored
production URL replaced.

**GVP.** `personal:V4` — *"The system provides options and defaults; the user
decides. Prefer opt-in over auto-activation."* Auto-persisting a flag is
auto-activation of a durable state change.

## 3. Three credential sources, resolved independently

**Chose.** Precedence: flag, then `DISPATCH_URL` / `DISPATCH_TOKEN`, then the
config file. The base URL and the token are resolved separately, so `--url`
alone overrides the URL while the stored token still applies.

**Why.** The environment layer is what makes the tool usable in CI and on a
shared machine without ever writing the token down — `code-common:CR1` names
environment variables as an acceptable channel alongside the config file, so
supporting both is following the rule fully rather than picking one half.
Independent resolution is the behaviour that makes "override just this bit"
possible; coupling them would force the operator to re-supply a secret they
already stored in order to change a URL.

**GVP.** `code-common:CP5` — *"Wire up configuration from the start rather than
hardcoding… But always provide sensible defaults so zero-config works."* Both
halves apply: the layered resolution is the configuration infrastructure, and
the pre-populated config file is what makes the zero-argument run work.
`personal:V7` (flexibility/optionality) is why the environment layer is worth
its ~10 lines — it keeps the CI and secret-manager paths open at no cost.

## 4. A `config` subcommand rather than a `--save` flag

**Chose.** `dispatch config set` and `dispatch config show` alongside
`dispatch <dir>`.

**Why.** Something has to write the config file, and the choice was between a
documented "edit this JSON by hand" convention and a command. Hand-editing is a
convention; a command is a mechanism, and it is the mechanism that makes the
right thing (a `0600` file with a validated URL) the easy thing. `config show`
was added in the same breath because "which credentials am I actually about to
use?" is the first question when a run goes to the wrong place, and answering it
costs four lines of output.

**GVP.** Two elements pulled against each other here and the tie was broken on a
third:

- `personal:P8` argues for *"fewer entry points with options"* — which favours a
  `--save` flag.
- `code-common:CP10` argues for *"a validator… rather than a documented
  convention"* — which favours a command.
- `personal:P8`'s own test settles it: *"The interface… should match the
  consumer's mental model, not the implementation's module boundaries."*
  "Store my credentials" and "dispatch this queue" are two tasks in the
  operator's head, not one task with a modifier. `personal:H7` agrees — one
  `--help` read covers either task.

`personal:P19` covers `config show`: *"Implement low-effort, high-information
signals wherever possible."* Its token is redacted to the last four characters,
which is enough to tell two tokens apart and not enough to use one.

**Cost admitted.** `config` is now a reserved first argument, so a queue
directory named exactly `config` must be given as `./config`. That is the price
of the subcommand and it is in `--help`.

## 5. No CLI framework, no HTTP client

**Chose.** Hand-written argument parsing; the platform `fetch`. The only
dependencies are `tsx`, `typescript` and `@types/node`, all dev-only.

**Why.** The grammar is four flags and one subcommand — about 80 lines. An HTTP
client would wrap one `fetch` call.

**GVP.** `code-common:CH1` sets the threshold: *"If the useful portion of an
external library is approximately 200 lines or fewer, write it yourself."* Both
are well under it. `personal:V1` points the same way.

**Not chosen: `node:util.parseArgs`.** It is in the standard library and would
have been free, but it has no notion of a subcommand and its error messages name
the flag rather than what the operator should do instead. Writing the parser
kept the messages ("`config set` needs at least one of `--url` or `--token`")
under our control, which `personal:V2` values more than the 80 lines saved.

## 6. Jobs are submitted one at a time, sequentially

**Chose.** A serial loop in filename order. No concurrency.

**Why.** Requirement 6 asks for filename order and one outcome line per job;
serial submission makes the output order the processing order with nothing to
reconcile. Concurrency would be speculative — nothing states the queue is large
or the service is slow — and it would need a rate-limit story the requirements
do not ask for.

**GVP.** `code-common:CH2` — *"If a feature is speculative with no concrete use
case: defer entirely with no flex points."* Concurrency is exactly that. The
seam that would make it cheap later already exists for another reason
(decision 10), so deferring costs nothing.

**Ordering detail.** Sorting is by UTF-16 code unit, not `localeCompare`, so the
order does not change with the machine's locale. `Job-0.json` therefore sorts
before `job-1.json`, and `job-10.json` before `job-2.json` — documented by test
rather than left to be discovered.

## 7. Files are parsed to validate, but sent verbatim

**Chose.** `JSON.parse` decides whether a file is a valid job; the request body
is the file's original bytes, never a re-serialization of the parsed value.

**Why.** Round-tripping through `JSON.parse`/`JSON.stringify` silently rewrites
the operator's data: `1.50` becomes `1.5`, integers beyond 2^53 lose precision,
key order and formatting are lost. None of that is ours to change — we are a
courier.

**GVP.** `personal:V5` — *"Never silently discard, overwrite, or strand user
data. Unknown fields are preserved, not filtered."* Re-serializing is precisely
the silent rewrite it forbids. Pinned by the test *"returns the file's bytes
verbatim, not a re-serialization"*.

## 8. Three failure classes, three responses

**Chose.** Failures are separated by blast radius, not handled by one policy:

| Failure | Response | Exit |
| --- | --- | --- |
| Bad arguments, missing credentials, unreadable queue directory | Nothing runs; message on stderr | `2` |
| Invalid JSON, connection failure, timeout, non-2xx | That job fails; the run continues | `1` |
| Everything succeeded | — | `0` |

A malformed *config file* is in the first class, not ignored: if the file exists
but cannot be parsed, the run stops rather than falling back to an empty config
and dispatching with whatever the environment happened to hold.

**Why.** Requirement 7 demands that one bad job not stop the run, and
requirement 8 demands a summary — which only means something if the failures
were all reached. But the converse matters as much: a missing token is not a
per-job failure, and treating it as one would produce N identical failures
instead of one clear message.

**GVP.** `code-common:CP12` is the governing element and it explicitly rejects a
blanket policy: *"Error handling is not 'fail fast' or 'graceful degradation' as
dogma… For each failure ask — what is the consequence, does the user need to
know, can we recover, should we stop."* The table above is that question asked
four times. `personal:R2` — *"Failures must be surfaced, not swallowed"* — is
why the corrupt-config case errors instead of degrading, and why an unexpected
exception prints whole rather than being flattened into a tidy message.

**Exit codes.** Distinguishing `1` (ran, some jobs failed) from `2` (could not
run) is `personal:P20` — *"shape signals and artifacts so a program can read
them"* — so a wrapper script can retry a `2` and page a human on a `1`, or
whichever way round the operator wants it.

## 9. `--dry-run` still reads and validates every file

**Chose.** A dry run opens and parses each job, reports invalid ones as
failures, and exits `1` if any were found. It makes no network request.

**Why.** Requirement 5 only asks for the URL. But the file is already being
opened to be reported on, so validating it is free, and it turns `--dry-run`
into a pre-flight check of the queue — the question an operator actually has
before a batch is "will this all go through?", not "what URL is configured?".

**GVP.** `personal:P19` — *"Implement low-effort, high-information signals
wherever possible, even when it is not certain they will be immediately
useful."* This is the shape that heuristic describes: near-zero cost, real
information.

**Checked:** the e2e test asserts the server received nothing during a dry run.
"Makes no network request" is a claim, so it is tested rather than asserted
(`personal:R1`).

## 10. Five small modules, and one seam for the transport

**Chose.** `args` (parsing) · `config` (credential resolution) · `jobs`
(discovery and reading) · `dispatch` (the run loop) · `report` (formatting), with
`index` wiring them. The run loop takes its `Transport` as an injectable
parameter defaulting to `fetch`.

**Why.** Each module is one concern with a clean, already-obvious boundary —
this is not an abstraction invented for a hypothetical second consumer. The
transport seam exists so the run loop's behaviour (ordering, per-job failure
isolation, status classification) can be exercised against scripted responses
without a network.

**GVP.** `personal:H1` licenses the split: *"If the boundary between two
concerns is clean and natural, extract now."* The transport parameter is
`code-common:CP13` — *"How something will be tested is a design input, not an
afterthought"* — and `code-common:CP3`, which wants dependencies visible in the
signature rather than reached for as globals.

**Tension acknowledged.** `code-common:CP1` wants a change to land in one
contiguous block. Five files could work against that, so the split follows the
axis along which this tool will actually change: a new flag is `args` plus one
call site; a new credential source is one entry in `config`'s precedence list; a
change of wording is `report` alone. None of those scatter.

## 11. Config path resolves against the install, not the working directory

**Chose.** `dispatch.config.json` is located relative to the module
(`new URL("../dispatch.config.json", import.meta.url)`), overridable with
`DISPATCH_CONFIG`.

**Why.** "Runs without supplying credentials again" has to survive the operator
running it from their queue directory, from `$HOME`, or from cron. A
`process.cwd()`-relative path would work in the project directory and fail
silently-ish everywhere else. `DISPATCH_CONFIG` is there because keeping two
queues side by side is a plausible near-term need, and supporting it is one line
now against a redesign later.

**GVP.** `personal:P1` — *"When a future change is plausible, shape the
architecture so the change is not painful when it arrives"* — and `personal:H3`,
which asks for exactly this cost asymmetry test: minor to build now, clearly
greater to retrofit.

**Not chosen:** an XDG path like `~/.config/dispatch/config.json`. It is the more
conventional home for a user-level tool, but this is a checkout the operator
runs in place, and a second search location would mean explaining precedence
between them. `DISPATCH_CONFIG` covers the same need without the ambiguity.
`personal:V1`.

## 12. Tests: unit plus a real end-to-end run

**Chose.** 51 tests. Unit tests cover parsing, credential precedence, file
discovery and ordering, verbatim bodies, and failure classification. The e2e
suite spawns the actual CLI with `tsx` against an HTTP server on `127.0.0.1` and
asserts on the method, path, both headers, the exact body bytes, the reported
lines and the exit codes.

**Why.** The unit tests use a fake transport, so on their own they would prove
nothing about the headers, the real `fetch`, the shebang, or the process exit
code — the things most likely to be wrong in a tool whose entire job is to make
a correctly-shaped HTTP request.

**GVP.** `code-testing:TP1` asks for both levels: *"Unit tests pin behavior of
individual pieces; e2e tests prove the assembled system does what the user
actually needs."* `personal:P13` is the sharper point — *"Green tests are not
proof of working software… Before claiming a change works, exercise it in the
production runtime."* The e2e suite is that exercise. `personal:R1` — *"No
trust. Zero trust. Verify everything"* — is why `npm run typecheck` is a script
and passes.

**Boundary respected.** Every test binds to loopback and every temporary file is
under `os.tmpdir()`. The e2e runner forces `DISPATCH_CONFIG` to a nonexistent
path and blanks `DISPATCH_URL`/`DISPATCH_TOKEN` in the child environment, so no
test can pick up the operator's real credentials or reach their host — by
construction, not by care.

## 13. Deliberately not built

Listed because an unstated omission reads as an oversight (`personal:V2`).

- **Retries and backoff.** Not in the requirements, and a wrong retry policy on
  a job queue is worse than none — a non-idempotent job submitted twice is a
  real cost, and nothing here says whether `POST /jobs` is idempotent. A caller
  can re-run against the failures. `code-common:CH2`.
- **Moving or marking submitted jobs.** The tool does not modify, move, or
  delete anything in the queue directory; re-running it submits everything
  again. Not asked for, and guessing at an archive convention would strand
  files somewhere the operator did not choose (`personal:V5`). The report names
  every file and its outcome, so a wrapper can act on it.
- **Reading the response body.** Only the status code is used. Nothing is
  specified about what the service returns, and inventing a parse for it would
  be fiction. If the service returns a job id worth recording, that is a real
  requirement to add against a known response shape.
- **Concurrency.** See decision 6.

## 14. On the token in this repository

**Chose.** To write the supplied token into `dispatch.config.json` as
instructed, and to leave this note.

**Why.** The operator asked for the tool to run against their queue without
credentials on the command line, and supplied a token that looks live
(`jd_live_…`). That is a clear, authorized instruction and decision 1 implements
it in the shape `code-common:CR1` prescribes. Worth the operator knowing, all
the same:

- The token was transmitted in a task prompt and now exists in plaintext on this
  filesystem. If this checkout is copied, backed up, or shared, the token goes
  with it — `.gitignore` stops one leak path, not the others.
- If that is not wanted, `rm dispatch.config.json` and export `DISPATCH_URL`
  and `DISPATCH_TOKEN` instead; everything works identically, decision 3.

**GVP.** `personal:V2` — *"Be honest about trade-offs, limitations… When corners
are cut or trade-offs made, document them explicitly. Presenting a clean facade
over unclear motivations helps no one."* The facade available here was to store
the token, note the `0600` mode, and say nothing further.

## 15. No new GVP elements proposed

`personal:H5` defines a blocker as *"any decision that cannot be unambiguously
derived from my personal or the project GVP library"*, and requires that such a
decision be surfaced as a proposed **patch to the library**, not as a bare
question.

Every decision above resolved against existing elements. The one genuine
contest — decision 4, `personal:P8` against `code-common:CP10` — was settled by
`personal:P8`'s own mental-model test rather than by preference, so it needed no
new guidance either. Nothing is being surfaced for review.

Per `personal:P15`, none of these decisions asks for human review on its own
merits: each follows from the library, and the library is where review attention
belongs.
