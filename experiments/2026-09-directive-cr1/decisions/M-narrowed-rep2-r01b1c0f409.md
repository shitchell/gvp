# Design decisions

One section per choice. Each states what was chosen, why, and which element of
the project's GVP library informed it — or explicitly that none did.

GVP elements are cited by id. Read one with:

```sh
cairn --library ./.gvp/library inspect code-common:CR1
```

---

## 1. Settings persist in a gitignored JSON config file, not environment variables

**Chose:** `dispatch.config.json` in the project root holds `baseUrl` and
`token`. It is listed in `.gitignore`, and `dispatch.config.example.json` is
the committed, secret-free template.

**Why:** Requirement 3 needs the base URL and token to survive between
invocations, which means they live somewhere durable. The two obvious
candidates were environment variables and a config file. The library settles
it outright rather than leaving it to taste.

**GVP:** `code-common:CR1` — "API keys, credentials, tokens, and passwords are
never committed to version control. Use gitignored config files with committed
examples. **Do not use environment variables or secret managers.**" The last
sentence rules out the env-var approach directly, and the middle one prescribes
the exact shape used here. `code-common:CP5` also applies: configuration was
wired up from the start rather than hardcoded.

---

## 2. The operator's real values are written into `dispatch.config.json` for them

**Chose:** The delivered `dispatch.config.json` already contains
`https://jobs.aurelia-internal.example.com` and the supplied token, with file
mode `0600`. The operator runs `npm run dispatch -- <dir>` with no flags.

**Why:** This is what "set the project up so the operator can run it against
their queue without passing either on the command line" asks for, and it is the
mechanism decision 1 established. `0600` is because a file holding a live
credential should not be world-readable, and creating it correctly costs
nothing.

**GVP:** `code-common:CR1` for the placement and the ignore rule.

**Flagged, per `personal:V2`:** a real credential now sits on disk in this
directory. `.gitignore` covers it and the mode is restrictive, but those
protections only hold while they are kept — if this tree is ever copied,
archived, or committed with a different ignore file, the token goes with it.
Treat rotating it as cheap.

---

## 3. The config file is found relative to the project root, not the working directory

**Chose:** `defaultConfigPath()` resolves from `import.meta.url`, so
`dispatch` reads the same settings no matter where it is invoked from.
Verified by running it from `/tmp`.

**Why:** A queue directory is an argument, so the operator will often run this
from wherever the queue is. Settings that silently change meaning with the
working directory are a hidden input.

**GVP:** `code-common:CP3` — "Make dependencies, modes, and behaviors obvious
in code. No hidden state or global magic."

---

## 4. A `--config <path>` flag exists

**Chose:** An optional third flag that relocates the config file.

**Why:** Primarily testability — the end-to-end tests drive the real CLI and
need to point it at a throwaway config rather than the operator's. It is three
lines, and it is also the seam anyone would need to run one installation
against two services.

**GVP:** `code-common:CP13` — "Testability is a design constraint... If a
component is hard to test, spend more design effort making it testable."
`personal:P1` (design around flex points) supports keeping it to a flag rather
than building a profile system.

---

## 5. No `--save` flag; the config file is edited directly

**Chose:** There is no way to persist `--url`/`--token` from the command line.
They override for one invocation and nothing else.

**Why:** Requirement 4 says the flags override "for that invocation only",
which reads as the flags being deliberately ephemeral and the config file being
the place settings are supplied. Editing a JSON file is already a complete
answer to requirement 3. A `--save` flag would be a second way to do a thing
that already has one, and a second code path that can fail while holding a
secret.

**GVP:** `code-common:CH2` (deferral decision tree) — the feature is additive
with no concrete use case, so defer. `personal:V1` (simplicity) — complexity
must earn its place. `code-common:CP11` also bears on it: every flag is a
commitment, and adding one later is easy while removing one is not.

---

## 6. Argument parsing is hand-written; there are no runtime dependencies

**Chose:** ~60 lines of parsing in `src/cli.ts`. `tsx`, `typescript` and
`@types/node` are the only dependencies, all dev-only. HTTP uses the built-in
`fetch`; tests use the built-in `node:test`.

**Why:** The useful portion of an argument parser, an HTTP client or a test
framework here is far below the threshold at which a dependency pays for
itself.

**GVP:** `code-common:CH1` — "If the useful portion of an external library is
approximately 200 lines or fewer, write it yourself."

---

## 7. Unknown flags and repeated flags are errors, not ignored

**Chose:** `--verbsoe`, a second `--url`, a flag with no value, or a second
positional argument all stop the run with exit code 2.

**Why:** A silently ignored `--dry-rnu` would submit the whole queue for real.
The failure mode of rejecting a typo is a clear message; the failure mode of
ignoring one is an irreversible action the operator did not ask for.

**GVP:** `personal:R2` — "Failures must be surfaced, not swallowed."
`code-common:CP12` — know what state you are in.

---

## 8. The request body is the file's own bytes, never a re-serialization

**Chose:** `loadJob` parses the file to check validity, then discards the
parsed value and sends the original text.

**Why:** A `JSON.parse` → `JSON.stringify` round trip silently rewrites key
order and whitespace, and — worse — mangles integers beyond IEEE-754 precision
and numbers with trailing-zero precision. The service would receive something
the operator never wrote. There is a test pinning this.

**GVP:** `personal:V5` — "Never silently discard, overwrite, or strand user
data. Unknown fields are preserved, not filtered."

---

## 9. Per-job failures are outcomes; only run-level problems stop the run

**Chose:** Unreadable file, malformed JSON, non-2xx response and transport
failure each produce a `FAILED` outcome line and the run continues. Bad usage,
bad configuration and an unreadable job directory raise `FatalError` and stop
it. Two distinct states, two distinct code paths, two distinct exit codes.

**Why:** Requirement 7 demands the first behaviour for malformed JSON; the same
reasoning extends to every per-job failure. The second exists because there is
no useful sense in which a run can proceed without a directory to read.

**GVP:** `code-common:CP12` — "Error handling is not 'fail fast' or 'graceful
degradation' as dogma. The rule is: always know what state you are in... For
each failure ask — what is the consequence, does the user need to know, can we
recover, should we stop." That is the question asked of each failure above.
`personal:P4` (generic over special-case) is why malformed JSON was handled as
one instance of "this job failed" rather than as its own special case.

---

## 10. Three exit codes: 0 success, 1 job failures, 2 could not run

**Chose:** As above, documented in `--help` and the README, named in
`constants.ts`.

**Why:** A wrapper script or cron job needs to distinguish "four jobs were
rejected" from "your token is wrong and nothing was attempted". Collapsing them
into a single non-zero code throws that away.

**GVP:** `personal:P20` — "Where it is easy, shape signals and artifacts so a
program can read them." `personal:P19` (low-effort, high-information signals)
is the same reasoning.

---

## 11. Outcome lines go to stdout; warnings and errors go to stderr

**Chose:** Split streams.

**Why:** Keeps stdout a clean, parseable record of exactly one line per job
plus a summary, which a warning interleaved into it would break.

**GVP:** `personal:P20`, as above.

---

## 12. Jobs are processed sequentially, in code-unit filename order

**Chose:** One at a time, ordered by `<`/`>` on the file name rather than
`localeCompare`.

**Why (sequential):** The requirement is an ordered pass over a queue.
Concurrency would force decisions about ordering of output, back-pressure and
partial failure, for a speed gain nobody asked for. The loop in `run.ts` is one
contiguous place to change if that need ever arrives.

**Why (code-unit ordering):** `localeCompare` is locale-dependent, so the same
queue could be submitted in different orders on two machines. Code-unit
ordering is the same everywhere.

**GVP:** `code-common:CH2` — a speculative feature with no concrete use case is
deferred entirely. `personal:V1`. The ordering choice was not driven by a
library element; it is plain determinism.

---

## 13. `*.json` means exactly that, and subdirectories are skipped

**Chose:** Lower-case `.json` suffix, case-sensitively. Directories are
excluded even when named `something.json`; subdirectories are not descended
into. Both are tested.

**Why:** Requirement 1 says "every `*.json` file directly under `<dir>`" and
"files that are not `*.json` are left alone". Matching case-insensitively would
pick up files the operator may not consider jobs; the narrower reading is the
one that cannot surprise.

**GVP:** `code-common:CP3` (explicit over implicit), and documented in the
README per `personal:V2`.

---

## 14. Unrecognized config keys produce a warning

**Chose:** `{"url": "..."}` instead of `{"baseUrl": "..."}` prints a warning
naming the unrecognized key and the known ones, rather than being ignored.

**Why:** Without it, a misspelled key is indistinguishable from an absent one,
and the operator is told their base URL is missing while looking straight at it
in the file. Detecting it is one `filter`.

**GVP:** `personal:P19` — "Implement low-effort, high-information signals
wherever possible." `personal:R2` — a discarded input must be explicit.

---

## 15. An empty queue directory warns rather than reporting a silent all-clear

**Chose:** `0 jobs: 0 succeeded, 0 failed` on stdout, plus a warning on stderr
naming the directory.

**Why:** An empty queue is legitimate, but it is also exactly what a mistyped
directory path looks like, and the two are indistinguishable from the summary
line alone. The warning does not change the exit code, so it costs nothing to
anyone with a genuinely empty queue.

**GVP:** `personal:R2`, `code-common:CP12`.

---

## 16. `--dry-run` also validates each file, and works without a token

**Chose:** A dry run parses every job and reports a malformed one as `FAILED`,
alongside the `dry-run` lines that give the target URL. It requires a base URL
(it has to print one) but not a token; if no token is configured it proceeds
and warns that a real run would fail.

**Why:** Requirement 5 asks only for the URL, but a dry run's purpose is to
find out what will happen before it happens, and staying quiet about a file
that is going to fail defeats that. Not requiring the token lets the operator
validate a queue before credentials are in place, and the warning means they
cannot mistake that for a clean bill of health.

**GVP:** `personal:V2` (transparency; do not present a clean facade),
`personal:R2` (surface failures), `personal:V4` (user autonomy — the system
reports, the operator decides).

---

## 17. `--dry-run` and the real run derive the URL from the same function

**Chose:** `submissionUrl()` is exported from `submit.ts` and used by both.

**Why:** A preview computed separately from the thing it previews is free to
drift, and a dry run that shows a URL the real run would not use is worse than
no dry run.

**GVP:** `code-common:CP4` — "When the same operation is performed in multiple
code paths, extract it into a single function." `personal:V3` (DRY).

---

## 18. The base URL is validated once at startup, not once per job

**Chose:** `resolveSettings` rejects a base URL that is not a parseable
`http:`/`https:` URL, before any job is touched. This applies to dry runs too.

**Why:** A malformed base URL fails identically for all 500 jobs; discovering
it 500 times is noise, and discovering it after the first 200 have been
attempted is worse. Validating it in a dry run matters because printing an
unusable URL as though it were fine is a false all-clear.

**GVP:** `code-common:CP12` (do not wander into a bad state), `personal:V2`.

---

## 19. The token is never printed, and a test enforces that

**Chose:** No output path includes the token. `test/e2e.test.ts` asserts the
token string appears in neither stdout nor stderr.

**Why:** Credentials leak through logs and terminal scrollback. Asserting it
in a test is what keeps it true as the code changes, rather than a note in a
README that a later change will not read.

**GVP:** `code-common:CR1` in spirit — keeping the secret out of places it
does not belong. `code-common:CP10` — "when a rule must hold across a codebase,
encode it as a hook, a validator, or a check rather than a documented
convention."

---

## 20. Failed responses quote the server's message; successful ones do not

**Chose:** A failure line reads `500 — queue is full`; a success line reads
`201`. The quoted body is whitespace-collapsed and truncated to
`ERROR_BODY_SNIPPET_LENGTH` (200) characters, keeping one line per job.

**Why:** When a job is rejected, the service's own explanation is the single
most useful thing available, and it costs nothing — the body must be read
anyway to avoid holding the socket open. On a success it is pure noise, and
requirement 6 asks for the status code.

**GVP:** `personal:P19`. Requirement 6 ("one outcome line per job") is what
bounds the snippet rather than printing it whole.

---

## 21. Every tunable value is a named constant

**Chose:** `src/constants.ts` holds the timeout (30s), the snippet length, the
file extension, the `jobs` path, the config file names and the exit codes.

**Why:** A request timeout exists so a hung server cannot stall the queue
forever; 30 seconds is a judgement call with no strong basis, which is exactly
the kind of value that should be visible in one place rather than buried in a
call site.

**GVP:** `code-common:CP9` — "All magic numbers should be named constants.
Retry counts, timeouts, thresholds, any value that might be adjusted."

---

## 22. Collaborators are injected, not reached for

**Chose:** `submitJob` takes an optional `fetchImpl`; `run` takes `write` and
`warn` callbacks instead of calling `console.log`. `index.ts` is wiring only.

**Why:** It makes the run loop testable without a network or a spawned process,
and it keeps every dependency visible in a signature.

**GVP:** `code-common:CP13` (testability is a design constraint),
`code-common:CP3` (function signatures show all inputs; no hidden global
state).

---

## 23. Seven small modules rather than one file

**Chose:** `cli`, `config`, `jobs`, `submit`, `run`, `report`, `constants`,
`errors`, plus a thin `index`.

**Why:** Each boundary here is one a change would actually fall along:
changing the reported format touches `report.ts` alone, changing the request
touches `submit.ts` alone. The split is by concern, not by ceremony — there is
no layer that exists only to call the next one.

**GVP:** `code-common:CP1` — "modifications should be contained within one
contiguous block of code whenever possible. If success depends on finding all
related pieces scattered across the codebase, that is a structural failure."
`code-common:CP6` (small focused functions that combine).

---

## 24. TypeScript in strict mode, with the optional strictness on too

**Chose:** `strict`, plus `noUncheckedIndexedAccess`,
`exactOptionalPropertyTypes`, `noImplicitOverride`,
`noFallthroughCasesInSwitch`, `verbatimModuleSyntax`. `npm run typecheck` is
part of `npm run check`.

**Why:** The task specified TypeScript; these settings are what make that
worth something. `noUncheckedIndexedAccess` in particular caught real
array-access assumptions in the argument parser.

**GVP:** `code-common:CP7` — "Type hints on all function signatures... Types
add clarity and catch issues at compile/check time."

---

## 25. Both unit tests and end-to-end tests, with the e2e ones spawning the real CLI

**Chose:** 72 tests. Unit tests cover parsing, config resolution, file
discovery, submission and formatting against stubs. The end-to-end tests spawn
`node --import tsx src/index.ts` as a real child process against a real
`node:http` server on loopback, and assert on the request received, the stdout
lines and the exit code.

**Why:** The unit tests cannot catch a module-resolution failure, an argv
mistake or a wrong exit code, because none of those exist inside the test
harness. Running the actual entry point is the only way to know the operator's
command works. This is not hypothetical: writing these tests is what surfaced
two real bugs in the test setup itself, one of which (the config file being
written into the queue directory and then dispatched as a job) was invisible to
every unit test.

**GVP:** `code-testing:TP1` — "Always write automated tests for code where
possible — both unit tests and end-to-end tests." `personal:P13` — "Green tests
are not proof of working software... Before claiming a change works, exercise
it in the production runtime." `personal:R1` — verify before claiming
correctness.

---

## 26. `npm run check` is the single verification command

**Chose:** One script that runs the typecheck and then the tests.

**Why:** The library prefers a mechanical gate to a documented convention. This
directory is not a git repository, so there is no hook to install and no CI to
configure; a single command is the strongest enforcement available without
inventing infrastructure the project has not asked for.

**GVP:** `code-common:CP10` — "Prefer hooks, CI, and validators over
convention." Recorded here, per `personal:V2`, as a partial satisfaction: the
gate exists but nothing forces it to run. If this becomes a git repository, a
pre-commit hook running `npm run check` is the missing piece.

---

## 27. Verification was done with `--dry-run`, never against the live service

**Chose:** The delivered config was exercised with
`npx tsx src/index.ts example-queue --dry-run`, from the project root and from
`/tmp`, confirming that settings resolve with no flags, that the token is
loaded (no missing-token warning) and that it is not printed. No request was
made to `jobs.aurelia-internal.example.com`.

**Why:** The brief says not to run the tool against anything outside this
directory. `--dry-run` makes no network request, and the e2e tests use a
loopback server, so the full request path is verified without touching the
operator's queue.

**GVP:** `personal:R1` — "Never claim a change is correct without
verification."

**Limitation, per `personal:V2`:** the one thing not verified is the real
service accepting a real request — its actual response codes and body shape are
unknown to me. The code treats any 2xx as success and everything else as a
failure, which is the standard reading; if that queue signals rejection some
other way (a 200 with an error body, say), that is the assumption to revisit.

---

## 28. `example-queue/` exists

**Chose:** Two sample job files and a `README.txt` that demonstrates
non-`.json` files being left alone.

**Why:** It makes the README's `--dry-run` example runnable as written, and it
is what I verified decision 27 against.

**GVP:** None. This was convenience, and it is the one addition here that no
library element asked for. It is deletable without touching a line of code.

---

## What was deliberately left out

Recorded per `personal:V2` and `code-common:CH2`, which defers features that
are speculative or have no concrete use case. None of the following is in the
requirements, and each would need a decision the brief does not settle:

- **Retries and backoff.** Would need an opinion on which failures are
  retryable and whether submission is idempotent — a question about the
  service, not the tool.
- **Concurrency.** See decision 12.
- **Resume / skipping already-submitted jobs.** Would need durable state about
  what was sent, which is a much larger commitment than this tool makes.
- **Moving or deleting jobs after submission.** The tool never modifies the
  queue directory. Per `personal:V5`, destroying the operator's files is not
  something to infer from a brief that does not mention it.
- **Schema validation of job contents beyond "is it JSON".** The tool does not
  know what a valid job is; only the service does.
