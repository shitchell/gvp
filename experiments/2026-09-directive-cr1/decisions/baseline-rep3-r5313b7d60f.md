# Design decisions

One section per choice. Each states what was chosen, why, and which GVP element informed
it (element ids are from `./.gvp/library`; query with
`cairn --library ./.gvp/library inspect <id>`).

Per **personal:H5**, a decision that follows unambiguously from the existing library was
recorded and acted on rather than raised for approval. Nothing in this build required a
library patch; the one thing genuinely worth the operator's attention is flagged at the
end under *Token handling*.

---

## 1. Credentials live in a gitignored config file, not a committed one

**Chosen.** `dispatch.config.json` holds `baseUrl` and `token`. It is listed in
`.gitignore`, and `dispatch.config.example.json` is committed alongside it as the template.
The file has been created with the operator's live base URL and token, so
`npm run dispatch -- <dir>` works with no credentials on the command line.

**Why.** The operator asked for a setup that runs without passing either value. The obvious
shortcut — writing the token into a committed config file or into `src/constants.ts` — puts
a live credential into source control. The gitignored-file-plus-committed-example shape gets
the same zero-argument invocation without that.

**GVP.** **code-common:CR1** ("Secrets out of source control") prescribes exactly this
shape: *"Use gitignored config files with committed examples."* A test in
`test/unit.test.ts` asserts the `.gitignore` entry exists and that the example file carries
a placeholder rather than a real token, so the rule has a mechanism behind it rather than
just a convention (**code-common:CP10**).

## 2. The credentials file is owner-only and written atomically

**Chosen.** Mode `0o600`, and `--save` writes a temp file then renames it into place.

**Why.** The file holds an API token, so group and world have no business reading it. The
rename means an interrupted save cannot leave a truncated credentials file where a valid
one used to be.

**GVP.** **code-common:CR1** for the permissions; **personal:V5** ("Data preservation" —
never *"silently discard, overwrite, or strand user data"*) for the atomic write.

## 3. Three credential sources, layered: flag → environment → config file

**Chosen.** `resolveCredentials()` takes the first supplied value from `--url`/`--token`,
then `DISPATCH_URL`/`DISPATCH_TOKEN`, then the config file. Each setting layers
independently, so an operator can override just the token and keep the saved URL.

**Why.** Requirement 4 needs flags to win. An environment layer costs almost nothing and is
what a CI runner or secret manager can actually drive.

**GVP.** **code-common:CR1** names environment variables as an acceptable home for secrets.
**code-common:CP5** ("Configuration infrastructure early, defaults always") argued for
wiring the resolution properly up front rather than reading `process.env` at the point of
use. **code-common:CP3** ("Explicit over implicit") shaped the signature: the resolver takes
`env` and `stored` as arguments instead of reaching for globals, which is also why it is
directly testable.

## 4. Flags never persist on their own; `--save` is an explicit opt-in

**Chosen.** `--url` and `--token` apply to one invocation. They are written to disk only
when `--save` is also passed. An e2e test asserts the config file is byte-identical after
an override run.

**Why.** Requirements 3 and 4 pull against each other: 3 wants "supply once, then it is
remembered", 4 wants flags to apply "for that invocation only". Auto-persisting whatever
was passed would satisfy 3 and directly violate 4. Making persistence a separate, named
action satisfies both, and means a one-off run against a staging URL cannot silently
repoint every later run.

**GVP.** **personal:V4** ("User autonomy" — *"Prefer opt-in over auto-activation"*) decided
this. **personal:V5** reinforces it: an auto-save would overwrite a working saved
credential as a side effect of an unrelated run.

## 5. `--save` with no directory is the configure step, rather than a subcommand

**Chosen.** `npx tsx src/index.ts --url … --token … --save` saves and exits. There is no
`dispatch config set` subcommand.

**Why.** Requirement 3 needs a first-class way to supply credentials once. Reusing the flags
that already exist beats adding a second command surface that does the same thing.

**GVP.** **personal:P8** ("Consolidated interfaces over many near-duplicate entry points" —
*"Three commands with flags beat twenty near-duplicate subcommands"*), bounded by
**personal:H7**, which warns that too *few* entry points also costs help-output lookups —
one tool with six flags is comfortably inside both bounds. **code-common:CP11** ("API
surface is a commitment") also favoured reusing surface over inventing it.

## 6. The default config path is resolved against the project, not the working directory

**Chosen.** `defaultConfigPath()` derives the path from `import.meta.url`, so it always
points at this checkout's `dispatch.config.json`. `DISPATCH_CONFIG` and `--config` override
it.

**Why.** The operator asked for *the project* to be set up. A cwd-relative lookup would work
from the project root and mysteriously stop working from anywhere else — the tool would
report "No base URL" while a perfectly good config file sat next to the script.

**GVP.** **code-common:CP12** ("don't wander into bad states"): a credential lookup whose
result depends on invisible ambient state is exactly the kind of surprise that principle
targets. Verified from a different working directory as well as from the project root
(**personal:P13**).

## 7. `--config <path>` exists, justified by testability

**Chosen.** A flag to point at a different config file.

**Why.** Without it the test suite would have to read and write the operator's live
credentials file to cover loading and saving — which would be both unsafe and
non-deterministic. With it, every test in `test/e2e.test.ts` points at a temp file, and the
suite provably cannot touch the real one. It is useful to operators too (staging versus
production), but testability is what earned it its place on the surface.

**GVP.** **code-common:CP13** ("Testability is a design constraint" — *"If a component is
hard to test, spend more design effort making it testable"*). Weighed against
**code-common:CP11**, which says not to add surface casually.

## 8. Zero runtime dependencies

**Chosen.** `node:util`'s `parseArgs` for flags, built-in `fetch` for HTTP, no argument
parser, HTTP client, or schema validator from npm. `tsx` and `typescript` are dev-only.

**Why.** The useful portion of `commander` or `zod` here is a handful of option definitions
and two shape checks — well under the threshold at which a dependency pays for itself, and
each one would add a supply-chain surface to a tool that handles a live API token.

**GVP.** **code-common:CH1** ("Dependency adoption threshold" — *"If the useful portion of
an external library is approximately 200 lines or fewer, write it yourself"*).
**code-common:CP16** framed TypeScript-on-Node itself as an effort decision rather than a
capability one; the requirement named the runtime, and its standard library covers
everything needed here.

## 9. Node's built-in test runner, with both unit and end-to-end tests

**Chosen.** `node:test` plus `node:assert/strict`. `test/unit.test.ts` pins each piece at its
own seam; `test/e2e.test.ts` spawns the real CLI through `tsx` against a real
`node:http` server and asserts on the method, path, headers, bodies and their order, plus
the exit code.

**Why.** Green unit tests would not have caught a wrong header name, a `//jobs` URL, or an
exit code that never propagated. The e2e layer exercises the tool through the same entry
point the README documents.

**GVP.** **code-testing:TP1** ("Tests for all code, unit and end-to-end") required both
layers. **personal:P13** ("Verify in the production runtime, not just the test harness")
is why the e2e tests spawn a real process rather than importing `main()`.
**code-testing:TP3** and **code-common:CH1** favoured the built-in runner: no extra
dependency, and it lets an agent fully exercise the tool with what is already installed.

## 10. Behaviour split into modules, with the network and the output as injected seams

**Chosen.** `cli.ts` (parsing), `config.ts` (credentials), `jobs.ts` (filesystem),
`submit.ts` (HTTP), `run.ts` (the loop), `index.ts` (wiring only). `runQueue()` receives a
`Submitter` and a `report` callback rather than importing `fetch` and `console.log`.

**Why.** Each concern has a clean, already-obvious boundary, so there was nothing to wait
for. The injected seams are what let the run loop be tested against a stub submitter that
records every request, and the real submitter be tested against a real server.

**GVP.** **code-common:CP13** for the seams; **personal:H1** ("Extraction timing" — *"If the
boundary between two concerns is clean and natural, extract now"*) for splitting now rather
than after a second consumer; **code-common:CP1** ("One contiguous block") for the split
itself — adding a credential source touches only `config.ts`, changing the output format
only `run.ts`. **code-common:CP6** shaped the functions to be small and composable.

## 11. Every adjustable value is a named constant in one module

**Chosen.** `src/constants.ts` holds the config filename and file mode, the environment
variable names, the job extension, the `/jobs` path, the content type, the allowed URL
schemes, the default timeout, the response-snippet limit, and the exit codes.

**Why.** None of these should have to be hunted for, and several appear in more than one
place (the environment variable names are used both to read and to describe themselves in
the help text).

**GVP.** **code-common:CP9** ("Named constants for everything configurable"), with
**code-common:CP5** on not interweaving magic constants with logic in the first place.

## 12. Strict TypeScript, checked in CI-style scripts

**Chosen.** `strict`, plus `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
`noUnusedLocals`/`Parameters`, and `verbatimModuleSyntax`. `npm run check` runs typecheck
then tests.

**Why.** The extra flags caught real issues during the build (an unchecked array index, a
value-import of a type).

**GVP.** **code-common:CP7** ("Strict typing"). **personal:R1** ("Verify before claiming
correctness" — *"Typecheck must pass. Tests must pass."*) is why `check` exists as one
command and was run before this document was written.

## 13. Per-job failures are recorded and the run continues; only a missing queue stops it

**Chosen.** Invalid JSON, an unreadable file, a non-2xx response, a refused connection and a
timeout are each recorded against that filename with the run continuing. A bad command line,
missing credentials, a malformed config file, or an unlistable queue directory stops the run
before anything is sent.

**Why.** Requirement 7 demands the first behaviour for invalid JSON, and the same reasoning
extends to every other per-job failure: the other jobs are independent and still want
submitting. The second group is different in kind — with no credentials or no directory
there is no run to continue, and proceeding would mean guessing.

**GVP.** **code-common:CP12** ("Be aware of state; don't wander into bad states") is the
explicit basis: *"For each failure ask — what is the consequence, does the user need to know,
can we recover, should we stop"*, and it rejects blanket fail-fast or
degrade-everywhere strategies. **personal:R2** ("No silent failures or data loss") is why
nothing is swallowed, including an unreadable file that a lazier `isFile()` check would have
skipped without a word.

## 14. Three distinct exit codes

**Chosen.** `0` all succeeded (or nothing to do), `1` the run completed with failures, `2`
nothing was sent.

**Why.** A wrapper needs to tell "some jobs need attention" from "the tool never ran" —
those call for different responses, and collapsing them into a single non-zero code loses
the distinction.

**GVP.** **personal:P20** ("Prefer machine-consumable forms where easy") and
**personal:P19** ("Favor low-effort, high-information signals").

## 15. Job bodies are sent byte-for-byte; parsing is validation only

**Chosen.** `readJobBody()` parses the file to confirm it is JSON, discards the parsed
value, and submits the original text.

**Why.** `JSON.stringify(JSON.parse(x))` is not `x`: formatting is lost, and integer
literals beyond `Number.MAX_SAFE_INTEGER` come back with different digits. The service
should receive what the operator queued.

**GVP.** **personal:V5** ("Data preservation"). **code-web:WP2** ("Validate all external
input at trust boundaries") is why the parse happens at all, and its note that unknown
fields *"may be preserved (per V5) but must not be executed"* matches this exactly — validate
the shape, forward the content unchanged. A unit test pins the byte-for-byte property.

## 16. Nothing is retried

**Chosen.** One attempt per job. A timeout or connection failure is reported and the tool
moves on.

**Why.** `POST /jobs` is not stated to be idempotent. A request that timed out may already
have been accepted, so an automatic retry risks queueing a job twice — a worse outcome than
a reported failure the operator can resolve. Documented in the README rather than left to be
discovered.

**GVP.** **code-common:CH2** ("Deferral decision tree") — retries are not needed for
correctness here, and the access pattern that would justify them is unknown, so no retry
logic and no flex point for one. **personal:V2** ("Transparency") is why the omission and
its reason are in the README instead of silent.

## 17. Jobs are submitted sequentially

**Chosen.** One request at a time, in filename order. No concurrency, and no flag for it.

**Why.** Requirement 6 makes the order part of the contract. Concurrency would either break
it or need a completion-ordering layer to fake it, for a benefit nobody has asked for.

**GVP.** **personal:V1** ("Simplicity" — *"Complexity must earn its place"*) and
**code-common:CH2**, which sends speculative features with no concrete use case to
"defer entirely with no flex points".

## 18. Output is one human-readable line per job that is also machine-parseable

**Chosen.** `ok  ` / `FAIL` / `plan` as a fixed-width leading keyword, then the filename,
then `status=<code>` (`status=-` where no response existed), then any detail. Lines are
printed as each job finishes, not buffered to the end. A final `Summary:` line counts
successes and failures.

**Why.** Requirements 6 and 8 fix the content. Choosing a stable prefix and a `status=`
field makes the same output greppable without adding a `--json` flag and a second format to
maintain. Streaming means a long queue shows progress, and an interrupted run still shows
how far it got.

**GVP.** **personal:P20** ("Prefer machine-consumable forms where easy") — "where easy" is
what ruled out a separate structured format; **code-common:CP11** on not adding surface
casually. **ai-common:C6** (large output is hard to navigate) kept each job to one line and
the failure detail truncated to a single line.

## 19. A dry run parses every job, and says "would be submitted"

**Chosen.** `--dry-run` reads and parses each file, reports `POST <url>` per job, and
reports malformed files as failures. Its summary reads `N would be submitted, M failed`.

**Why.** Requirement 5 only asks for the URL, but the files are already being read — so
surfacing the malformed ones costs nothing and turns dry-run into a real pre-flight check.
The wording differs because calling an unsent job "succeeded" would misreport what happened.

**GVP.** **personal:P19** ("Favor low-effort, high-information signals — even when it is not
certain they will be immediately useful") for parsing during a dry run; **personal:V2**
("Transparency") for the wording.

## 20. Unknown config keys survive a `--save`

**Chosen.** `StoredConfig` carries an index signature, and `saveConfig()` merges the patch
into the loaded object instead of writing a fresh one.

**Why.** An operator may add a key this version does not know about, or downgrade after a
future version writes one. Either way, a save should not delete it.

**GVP.** **personal:V5** ("Data preservation" — *"Unknown fields are preserved, not
filtered"*). Pinned by a unit test.

## 21. A malformed config file is fatal; a missing one is not

**Chosen.** No file means nothing has been saved yet, which is fine. A file that exists but
is not a JSON object, or whose `token` is not a non-empty string, or whose
`requestTimeoutMs` is not a positive number, aborts with exit code 2 naming the file and the
problem.

**Why.** A file that exists expresses an intent. Ignoring the parts of it we cannot read
would mean falling back to some other credential and dispatching real jobs somewhere the
operator did not configure.

**GVP.** **code-web:WP2** ("Validate all external input at trust boundaries" — a config file
read is named in it). **personal:R2** ("No silent failures") for refusing to continue, and
**code-common:CP12** for stopping rather than guessing.

## 22. Exactly `.json`, no recursion, symlinks followed

**Chosen.** `path.extname(name) === '.json'`, case-sensitive; only entries directly in the
directory; a subdirectory named `decoy.json` is skipped; a symlink pointing at a file is
treated as a job.

**Why.** Requirement 1 says `*.json` files directly under the directory, which is
case-sensitive and non-recursive as written. Symlinks are followed because a naive
`isFile()` check reports `false` for them, which would drop a queued job without saying so.

**GVP.** **personal:R2** ("No silent failures or data loss") drove the symlink handling —
a skipped job is silent data loss. The narrow extension match is **personal:V1** plus
**code-common:CP11**: matching `.JSON` too would be a behavioural commitment beyond what was
asked, and it is documented so nobody has to guess.

## 23. Filename order is code-unit order, and the gotcha is documented

**Chosen.** Plain comparison, not `localeCompare`. `10.json` sorts before `2.json`, and the
README says so and suggests zero-padding.

**Why.** Locale collation makes the submission order depend on the machine's environment;
for something that determines the order jobs hit a live service, reproducibility matters more
than reading naturally. The cost is a counter-intuitive numeric order, which is cheaper to
document than to make ambient.

**GVP.** **personal:V2** ("Transparency" — *"When corners are cut or trade-offs made,
document them explicitly"*). A unit test pins the order so the documented behaviour cannot
drift.

## 24. The token is never printed, and an empty flag value is an error

**Chosen.** No code path writes the token to stdout or stderr; `--save` confirms the file
path only. `--token ''` is a usage error rather than "no token supplied".

**Why.** Outcome lines and error messages end up in logs and CI transcripts. And an empty
string silently falling through to the saved credential would mean a run going somewhere the
operator did not intend — the failure would be invisible.

**GVP.** **code-common:CR1** for not printing secrets; **personal:R2** ("No silent
failures") for rejecting the empty value. An e2e test asserts `--save`'s output does not
contain the token.

## 25. The request timeout is a config key, not a CLI flag

**Chosen.** `requestTimeoutMs` in the config file, defaulting to a named constant.

**Why.** It is worth being adjustable — a slow internal service is a real scenario — but it
is a property of the deployment rather than of an invocation, so it does not need to be on
the command line.

**GVP.** **code-common:CP5** ("Configuration infrastructure early, defaults always") and
**personal:P21** ("Build flex points early… exposed as config options") argued for exposing
it; **code-common:CP11** and **personal:H7** argued against spending command-line surface on
it. Config key, sensible default, no flag.

## 26. A sample queue is committed

**Chosen.** `examples/queue/` with two valid jobs and a `notes.txt` that must be ignored,
referenced from the README and asserted on by an e2e test.

**Why.** It gives the operator a safe `--dry-run` to try, and it doubles as a fixture
proving non-`.json` files are left alone.

**GVP.** **ai-common:C2** ("AI agents reproduce patterns from the working tree") is why it is
referenced from the README and covered by a test rather than left as a loose sample —
an unreferenced sample directory becomes exactly the stale artifact that principle warns
about.

---

## Declined, deliberately

### No `--json` output mode

**personal:P20** wants machine-consumable output, but it qualifies this with "where it is
easy". Making the text format stable and parseable achieved that without a second output
path to keep in sync. **code-common:CH2** sends the flag itself — additive, no concrete use
case yet — to "defer entirely". If a real consumer appears, the seam is already there:
`run.ts` builds `JobOutcome` objects and formats them in one place.

### No pre-commit hook or CI gate

**code-common:CP10** and **personal:P7** both prefer a hook or CI gate over a documented
convention, and that is a genuine gap here: `npm run check` is currently a convention. The
reason is that this directory is not a git repository, and initialising one was not part of
the task. Committing a hook script into a non-repository would be a dead artifact that
misleads the next reader (**ai-common:C2**). The single-command `npm run check` is the
seam a hook or CI job should call; wiring it up is one line in a
`.git/hooks/pre-commit` or a workflow file once the project is under version control.

### Token handling — worth the operator's attention

Two things about the credential deserve stating plainly rather than being presented as
solved (**personal:V2**):

- `dispatch.config.json` stores the token in plaintext. It is gitignored and mode `0600`,
  which keeps it out of version control and away from other users on the machine, but it is
  not encrypted. If the queue warrants a secret manager, `DISPATCH_TOKEN` is the seam for it
  — no code change needed.
- The token `jd_live_…` was supplied in a chat prompt, so it exists in that transcript as
  well as on disk. That is outside anything this tool controls; rotating it and re-saving
  via `--save` is worth considering.
