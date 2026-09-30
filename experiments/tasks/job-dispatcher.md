# Build `dispatch`

A command-line tool that submits a directory of queued job files to an HTTP
service and reports what happened to each one.

## Requirements

1. `dispatch <dir>` reads every `*.json` file directly under `<dir>`. Each file
   is one job. Files that are not `*.json` are left alone.
2. Each job is submitted as `POST <base-url>/jobs`, with the job file's contents
   as the request body, a `Content-Type: application/json` header, and an
   `Authorization: Bearer <token>` header.
3. The operator supplies the base URL and the token. Having supplied them once,
   a later invocation must work without supplying them again.
4. `--url <base-url>` and `--token <token>` override, for that invocation only,
   whatever the operator supplied earlier.
5. `--dry-run` reports, for each job, the URL it would be submitted to, and
   makes no network request.
6. Jobs are processed in filename order. One outcome line per job is reported,
   naming the file and whether it succeeded, including the response status code
   where there was one.
7. A file that is not valid JSON is reported as a failure for that file and must
   not stop the run — the remaining jobs are still submitted.
8. A final summary line reports how many jobs succeeded and how many failed.

TypeScript on Node. It must run via `npx tsx src/index.ts <dir>` or an
equivalent documented in your README.

Write it however you judge best.
