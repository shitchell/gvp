# Design decisions

One section per choice made while building `dispatch`. Each states what was
chosen, why, and which element of the project's GVP library informed it (or
records that none did).

GVP elements are cited by id; inspect any of them with
`cairn --library ./.gvp/library inspect <id>`.

---

## 1. The token lives in a gitignored file; the base URL is committed

**Chosen.** Two config files sharing one schema:

- `dispatch.config.json` — committed, holds the base URL and the timeout.
- `dispatch.local.json` — gitignored, holds the API token, mode `0600`.
- `dispatch.local.example.json` — committed template showing the shape.

The operator's token `jd_live_…` has been written into `dispatch.local.json`,
and `.gitignore` excludes that file.

**Why.** The operator asked to run without passing the URL or token on the
command line, which means both must be persisted somewhere. They are not the
same kind of value: the base URL is shared project configuration that every
operator needs and that is useful in source control, while the token is a
credential that must never enter it. Splitting them by that property — rather
than by convenience — means a second operator can clone the project and only
needs to supply a token, and it makes the committed/not-committed boundary
match the secret/not-secret boundary exactly, rather than relying on anyone
remembering which fields in a single file are dangerous.

**GVP.** `code-common:CR1` ("Secrets out of source control") is the direct
source, including the specific mechanism: *"Use gitignored config files with
committed examples. Use environment variables or secret managers."* This
implements both halves — the gitignored file with a committed example, and the
`$DISPATCH_TOKEN` environment variable as an alternative for operators who
prefer to keep the token out of the filesystem entirely.

**Trade-off, stated plainly.** The token is now sitting in plaintext on disk.
That is the cost of the "don't pass it on the command line" requirement — and
it is strictly better than the alternatives it displaces, since a token in
shell history or in a committed file is worse. File permissions are restricted
to the owner, but this is not a secret manager. An operator who wants stronger
handling can delete `dispatch.local.json` and export `$DISPATCH_TOKEN` from
whatever secret store they already use; no code changes are needed.
(`personal:V2` — document the trade-off rather than presenting a clean facade.)

---

## 2. Four configuration layers, in a fixed precedence order

**Chosen.** Per setting, the first of these that supplies a value wins:

1. `--url` / `--token` flags
2. `$DISPATCH_URL` / `$DISPATCH_TOKEN`
3. `dispatch.local.json`
4. `dispatch.config.json`

**Why.** This is the ordering every CLI operator already expects — the more
specific and more ephemeral the source, the higher it sits. It satisfies
requirement 4 structurally rather than by special-casing: flags win because
they are layer 1, and they affect only the process that received them because
nothing in the resolution path writes to disk. The environment layer exists
because it is the standard way to inject a secret without a file, which
`code-common:CR1` explicitly names.

The resolver also records *which* layer each value came from, which is what
lets `--dry-run` answer "is my setup actually what I think it is" without ever
printing the token.

**GVP.** `code-common:CP5` ("Configuration infrastructure early, defaults
always") — configuration is wired as infrastructure from the start rather than
hardcoded, and `dispatch.config.json` plus `DEFAULT_TIMEOUT_MS` mean the tool
works with no arguments. `personal:V4` ("User autonomy") — the system supplies
defaults and the operator retains override at every level.

---

## 3. No `--save` flag

**Chosen.** `--url` and `--token` override for one invocation and are never
persisted. Changing the stored values means editing the config file, which the
README documents.

**Why.** A `--save` flag is the obvious convenience feature here, and I decided
against it. Requirement 3 is already met by the config file, so `--save` would
be additive convenience, not function. Its access pattern is unknown — I do not
know whether this operator rotates tokens weekly or once a year — and every CLI
flag is a permanent commitment that is easy to add and expensive to remove. The
seam is in place if it is wanted later: the file schema is defined and
validated in one place (`ConfigFile` and `readConfigFile` in `config.ts`), so
adding `--save` means writing a counterpart to an existing reader rather than
designing a persistence format.

**GVP.** `code-common:CH2` ("Deferral decision tree") decides this: the feature
is additive and its access patterns are unknown, so the tree says add the flex
point without implementing the feature. `code-common:CP11` ("API surface is a
commitment") reinforces it. `personal:V1` ("Simplicity") — the abstraction has
not earned its place.

---

## 4. Config files are read from the project root, not the working directory

**Chosen.** `dispatch` looks for its two config files next to `package.json`,
resolved from `import.meta.url`, regardless of where it is invoked from.

**Why.** The alternative — reading from `process.cwd()` — makes the tool's
behaviour depend on invisible ambient state: the same command would submit to
different services depending on which directory the operator happened to be
standing in. Since the operator's natural motion is `dispatch /path/to/queue`
from wherever they are, cwd-relative config would break the moment they ran it
from beside their queue. A single, stable anchor means the configured URL is a
property of the installation, not of the shell.

**GVP.** `code-common:CP3` ("Explicit over implicit") — no hidden dependency on
ambient state. The resolver takes `configDir` as an explicit parameter rather
than reading the filesystem location itself, which is the same principle
applied one level down and is what makes it testable.

---

## 5. Zero runtime dependencies

**Chosen.** Argument parsing is `node:util`'s `parseArgs`; HTTP is the platform
`fetch`; config reading is `node:fs` plus `JSON.parse`. `tsx` and `typescript`
are dev dependencies only.

**Why.** The portion of an argument-parsing library this tool would use — four
options and one positional — is well under a hundred lines, and the same is
true of any HTTP client wrapper over `fetch`. Taking on dependencies for that
means inheriting their maintenance, their supply chain and their upgrade
churn for no capability gain.

**GVP.** `code-common:CH1` ("Dependency adoption threshold") sets the bar
directly: *"If the useful portion of an external library is approximately 200
lines or fewer, write it yourself."* Both candidates fall well below it.

---

## 6. Strict TypeScript, with the strict-adjacent flags on too

**Chosen.** `strict`, plus `noUncheckedIndexedAccess`,
`exactOptionalPropertyTypes`, `noImplicitOverride`,
`noFallthroughCasesInSwitch`, `verbatimModuleSyntax`.

**Why.** The task specified TypeScript; these flags are what make that choice
pay. `noUncheckedIndexedAccess` matters here specifically because the tool
indexes into arrays of filenames and CLI positionals, where an out-of-range
access is a realistic mistake. `exactOptionalPropertyTypes` matters because the
config resolver's central distinction is "absent" versus "present", and the
loose default lets those blur.

**GVP.** `code-common:CP7` ("Strict typing") — type hints on all signatures,
TypeScript over JavaScript, types catching issues at check time.

**Honest note.** `exactOptionalPropertyTypes` caught a real bug during
development, though in the test helpers rather than in `src/`: a default
parameter value silently absorbed an explicit `undefined`, so two tests were
passing a token where they meant to pass none. The fix was a separate
`configWithoutToken` helper, since a default parameter cannot express "no
value".

---

## 7. Split into six small modules rather than one file

**Chosen.** `config.ts` (resolution), `jobs.ts` (discovery and reading),
`submit.ts` (one HTTP request), `run.ts` (the loop), `report.ts` (formatting),
`index.ts` (CLI surface).

**Why.** These boundaries are not speculative — each one is a place where the
concerns genuinely differ and where the seam was needed immediately for
testing. Formatting is separated from the run loop so outcomes can be asserted
as values instead of scraped from text; `submit.ts` takes its `fetch` as a
parameter so the timeout path can be driven deterministically; `config.ts`
takes its directory and environment as parameters so precedence can be tested
without mutating the real process. A single file would have forced every test
to go through the CLI.

The flip side is respected too: adding a new config layer touches only
`config.ts`, and changing the output format touches only `report.ts`. Neither
change is scattered.

**GVP.** `personal:H1` ("Extraction timing") — extract now when the boundary is
clean and natural, which it is here, and each seam already has its second
consumer in the tests. `code-common:CP13` ("Testability is a design
constraint") — how each piece would be tested was the input that chose these
boundaries. `code-common:CP1` ("One contiguous block") — the test for each
module is that a foreseeable change to it stays inside it.

---

## 8. Job bodies are sent byte-for-byte; parsing is only a validation gate

**Chosen.** `JSON.parse` is called to decide whether a file is valid, and its
result is discarded. The original file text is what goes into the request body.

**Why.** The alternative — parse, then re-serialise — would silently rewrite
the operator's jobs in transit: key order changes, formatting is lost, and
anything this tool's model of a job does not account for could be dropped. The
tool has no business having a model of a job at all; it is a courier. It needs
to know only whether the payload is well-formed JSON, which is exactly what
requirement 7 asks and no more.

**GVP.** `personal:V5` ("Data preservation") is the reason, and it is explicit
on this point: *"Unknown fields are preserved, not filtered."* A test asserts
the round trip preserves key order, whitespace and unrecognised fields.

---

## 9. Per-job failures are return values; only run-level problems throw

**Chosen.** A malformed file, an unreadable file, a non-2xx response and a
transport error all become `failed` outcomes that are reported and stepped
past. Only problems that make the entire run meaningless — an unreadable queue
directory, a missing token before a real submission — throw and abort.

**Why.** Requirement 7 demands the run survive a bad file, and modelling that
as a value rather than a caught exception makes it the ordinary path instead of
an exceptional one. The distinction between the two categories is about state:
a bad job file leaves the run in a perfectly well-understood state with one
recorded failure, whereas a missing token means every subsequent request would
fail identically — so it is checked *before* the first job rather than
discovered fifty jobs in.

Non-2xx responses and transport errors are kept as separate result kinds
because they tell the operator different things: the service rejected this job,
versus the service was never reached at all. Both are failures; they need
different follow-up.

**GVP.** `code-common:CP12` ("Be aware of state; don't wander into bad states")
— *"For each failure ask: what is the consequence, does the user need to know,
can we recover, should we stop"*, handled per failure rather than by a blanket
strategy. `personal:R2` ("No silent failures or data loss") — every failure
reaches the operator on its own line and is counted in the summary and the exit
code; nothing is swallowed.

---

## 10. A malformed config file is a hard error, not a fallback

**Chosen.** If `dispatch.local.json` exists but is not valid JSON, or has a
field of the wrong type, the run stops with exit code 2. A *missing* file is
fine and simply contributes nothing.

**Why.** The tempting behaviour is to shrug and fall through to the next layer.
That is dangerous here: if a typo in the local file caused a silent fallback to
`dispatch.config.json`, the operator could submit a queue to the wrong service,
or with the wrong credential, and only find out from the far end. A missing
file is an unambiguous "this layer is not in use"; a broken file is an
unambiguous mistake.

**GVP.** `personal:R2` ("No silent failures or data loss") — *"Failures must be
surfaced, not swallowed."*

---

## 11. Jobs are submitted sequentially

**Chosen.** One request at a time, in filename order, awaiting each.

**Why.** Requirement 6 asks for filename order with one line per job.
Sequential submission delivers that with no coordination at all, keeps output
streaming in the same order as the work, and does not subject the service to a
burst. Concurrency would buy throughput that nobody has asked for, at the cost
of either reordering output or buffering it, and would need a concurrency limit
— which is a new configuration surface, which is a new commitment.

If throughput turns out to matter, the loop in `run.ts` is the single place
that changes, and the report layer already works on complete outcome values
rather than on emission order.

**GVP.** `personal:V1` ("Simplicity") — the simplest approach meeting the
requirement. `code-common:CH2` ("Deferral decision tree") — a concurrency
feature with no concrete use case is deferred entirely.

---

## 12. Filename ordering is by code unit, not locale collation

**Chosen.** A plain `<`/`>` comparison rather than `localeCompare` or
`Intl.Collator`.

**Why.** `localeCompare` reorders results based on the machine's locale: with
it, `Z.json` and `a.json` swap places depending on where the tool runs, and
numeric collation options would reorder `job-2.json` against `job-10.json`.
"Filename order" for a job queue needs to mean the same thing on the operator's
laptop as on a scheduler host — a queue that runs in a different order
somewhere else is a correctness problem, not a cosmetic one. Code-unit order is
reproducible everywhere.

**GVP.** `code-common:CP3` ("Explicit over implicit") — the ordering is a
declared property of the tool rather than a hidden dependency on ambient
environment. This is documented in the README so the behaviour with mixed-case
and unpadded numeric filenames is not a surprise.

---

## 13. Outcome lines lead with a fixed status token; exit codes distinguish three cases

**Chosen.** Every line starts with `OK`, `FAIL` or `DRY` in a fixed-width
column. Exit `0` = all succeeded, `1` = ran but something failed, `2` = could
not start.

**Why.** The format is for a human first, but making it greppable costs
nothing more than padding a column — `grep '^FAIL'` becomes a complete answer
to "what went wrong in last night's run". The three exit codes exist because
"three jobs were rejected by the service" and "the token is missing so nothing
was attempted" demand completely different responses, and collapsing both into
`1` would hide that from any script wrapping this tool.

**GVP.** `personal:P20` ("Prefer machine-consumable forms where easy") — the
qualifier is *where easy*, and here it is nearly free. `code-common:CP12` —
the exit code is part of reporting what state the run ended in.

---

## 14. A request timeout, configurable, with no retries

**Chosen.** `timeoutMs` is a named constant (`DEFAULT_TIMEOUT_MS`, 30s),
overridable via either config file. Failed jobs are not retried.

**Why.** These two look similar and the deferral tree separates them. A missing
timeout is a correctness and stability problem: one unresponsive request would
stall the entire remaining queue indefinitely, with no output and no way to
tell a hang from slow progress — so it is implemented now. Retries are
additive, and doing them correctly needs answers I do not have: is `POST /jobs`
idempotent, would a retried job be duplicated, which statuses are worth
retrying? Retrying a non-idempotent submission could double-submit real work.
So retries are deferred entirely, with no flex point.

The timeout is a config key rather than a CLI flag because it is a property of
the service, not of an invocation — nothing about a single run should want a
different one.

**GVP.** `code-common:CH2` ("Deferral decision tree") splits the two: *"If a
feature is needed for stability or correctness: implement now… If a feature is
speculative with no concrete use case: defer entirely with no flex points."*
`code-common:CP9` ("Named constants for everything configurable") — the timeout
is a named constant, not a literal buried in the request call.

---

## 15. The token is never printed, and `--dry-run` needs no token

**Chosen.** No code path writes the token to stdout or stderr. `--dry-run`
reports which layer the token came from (`set, from dispatch.local.json`) and
never its value. A dry run with no token configured is legal and reports
`not configured`.

**Why.** Secrets leak through logs and terminal scrollback at least as readily
as through repositories, and a tool that prints a token once will eventually
print it into a pasted bug report. Reporting the *source* preserves everything
the operator actually needs from a dry run — "did it find my token, and from
where" — with none of the exposure.

Not requiring a token for `--dry-run` is deliberate: the whole purpose of a dry
run is to check a setup before committing to it, so demanding the credential
first would put friction exactly where the tool is trying to remove it. A test
asserts the token never appears in output.

**GVP.** `code-common:CR1` ("Secrets out of source control") in spirit — the
rule is about keeping credentials out of places they accumulate.
`personal:P18` ("Gates must earn their friction") — the preferred kind of gate
is one that reduces friction and makes the right thing the easy path; a
dry run that demanded the credential would be the opposite.

---

## 16. Tests: the built-in runner, a real localhost server, and the real CLI

**Chosen.** `node:test` and `node:assert` with no test framework dependency.
Unit tests over config resolution, job discovery and formatting; integration
tests driving `run()` against an actual `node:http` server on `127.0.0.1`;
end-to-end tests spawning `npx tsx src/index.ts` as a subprocess and asserting
on stdout, stderr and exit codes. 48 tests, all passing.

**Why.** Three deliberate choices here.

*No framework*: Node's runner covers everything this project needs, so a test
dependency would be adopted for nothing.

*A real HTTP server rather than a stubbed `fetch`*: stubbing `fetch` would test
my beliefs about what `fetch` sends. A real server proves the headers, method,
path and body encoding are what the service will actually receive — the tests
assert on `Bearer`, `Content-Type` and the verbatim body as observed from the
receiving end. (`fetch` is still injectable, used in exactly one test where the
point is a request that *never* completes.)

*The CLI as a subprocess through `tsx`*: `npx tsx src/index.ts` is the command
the operator runs, so that is the command under test — including argument
parsing, config discovery from the project root, and exit codes, none of which
an in-process call would exercise honestly.

No test contacts the configured service. Every case either targets localhost or
uses `--dry-run`.

**GVP.** `code-testing:TP1` ("Tests for all code, unit and end-to-end") — both
levels, as the element requires. `personal:P13` ("Verify in the production
runtime, not just the test harness") is the reason for the subprocess tests:
*"Green tests are not proof of working software."* `code-common:CH1` for
declining a test framework. `code-testing:TP2` — each numbered requirement in
`TASK.md` was turned into an assertion before being called done: ordering and
request shape, the override-for-one-invocation semantics of the flags,
`--dry-run` making no request, a malformed file not stopping the run, and the
summary counts.

---

## 17. `npm test` typechecks first

**Chosen.** `"test": "npm run typecheck && tsx --test test/*.test.ts"`.

**Why.** A typecheck that must be remembered is a typecheck that will be
skipped under pressure. Wiring it into the command everyone already runs makes
it automatic rather than disciplined, and costs a second.

**GVP.** `personal:P7` ("Every process needs a concrete enforcement mechanism")
— *"A process without enforcement is a suggestion that will be forgotten under
context pressure."* `code-common:CP10` ("Prefer hooks, CI, and validators over
convention") is the code-level form of the same. `personal:R1` ("Verify before
claiming correctness") is the standard being enforced: typecheck must pass,
tests must pass.

---

## 18. Symlinked job files are included; subdirectories are not descended into

**Chosen.** `readdir` with `withFileTypes`, keeping regular files and symlinks
ending in `.json`, at the top level only. A *directory* named `something.json`
is not treated as a job.

**Why.** Requirement 1 says "every `*.json` file directly under `<dir>`", which
settles recursion — the top level, and no further. Symlinks are included
because a queue assembled by symlinking from elsewhere is an ordinary way to
stage work, and excluding them would silently skip jobs the operator can see in
the directory. Excluding directories matters because a directory whose name
ends in `.json` would otherwise be read as a file and reported as a spurious
failure.

**GVP.** None directly — this is requirement interpretation, recorded here
because it is a judgment call that a reader could reasonably have made
differently. Both behaviours are pinned by tests and stated in the README.

---

## 19. A committed `examples/queue/` containing one deliberately broken job

**Chosen.** Three sample job files, one of them malformed, plus a `.txt` file
that must be ignored.

**Why.** It gives the README a runnable first command that demonstrates the
interesting behaviour — a bad file failing without stopping the run — on the
operator's real configuration, safely, because `--dry-run` sends nothing. It
also gave me a way to verify the built tool by hand in its real runtime rather
than only through the test suite.

The malformed file is named `03-malformed.json` and is called out in the README
so it reads as a fixture rather than as a mistake someone should fix.

**GVP.** `ai-common:C2` ("AI agents reproduce patterns from the working tree")
motivated the naming: an unexplained broken JSON file in a repository is
exactly the kind of stale-looking artifact that leads a later reader — human or
agent — to draw the wrong conclusion, so it states its purpose in its name.

---

## 20. What I did not decide

Recorded so the gaps are visible rather than implied:

- **Retries and backoff** — deferred, see §14. Needs an answer on `POST /jobs`
  idempotency first.
- **Concurrency** — deferred, see §11.
- **Structured (`--json`) output** — not built. The fixed-token line format
  already covers the machine-readable case cheaply; a second output format is
  a commitment with no stated consumer (`code-common:CH2`).
- **Moving or archiving submitted jobs** — not built. The task says report, not
  mutate, and quietly moving an operator's files would be exactly the kind of
  unrequested side effect `personal:V5` warns about.
- **Response body handling** — the service's response body is drained (so the
  connection can be reused) but not parsed or reported. Nothing in the task
  asks for it, and its shape is unknown.
