---
id: 0019
status: open
opened: 2026-10-07
spawned_by: trial-5 design (scorer licence)
tested_by: []
tags: [instrument, durability, protocol]
---

# The programme's only real known-answer corpus is gitignored

The protocol is unambiguous about what licenses a scorer:

> "Self-validation bounds the errors you imagined; only real artefacts find the
> rest." — protocol §6, after trial 3's scorer passed 5/5 then 6/6 synthetic
> cases and was wrong both times.

Trial 5's scorer is licensed against trial 2's twelve snapshots — real projects
with independently recorded token locations, scored by a different scorer eleven
days earlier. It found a genuine convention mismatch that no synthetic case
would have (whether `DECISIONS.md` counts as a site).

Those snapshots are **gitignored** (`experiments/2026-09-directive-cr1/
.gitignore`: `snapshots/`), as is every trial's. So:

- they exist in exactly one checkout on one machine, and in no clone;
- a worktree cannot see them, which is how the licence first ran scoring **zero**
  real artifacts and still printing ALL CLEAR;
- the run roots they were copied from live under `mktemp -d` and are already gone.

Three consequences, in increasing order of how much they matter:

1. Any future scorer's licence silently degrades to synthetics-only. The failure
   is a *pass*, not an error. (Trial 5's licence now treats fewer than twelve
   scored runs as fatal — but that is one script, not a practice.)
2. Every claim in `REGISTER.md` is auditable only on this machine. The FINDINGS
   cite evidence strings; the evidence they cite is untracked.
3. The corpus is the programme's most reusable asset and it is accumulating
   entirely by accident. Four trials in, there are ~54 real artifact sets whose
   token placement, typing habits and seam structure are *known* — a
   regression corpus for every instrument the lab will ever build.

**Options, none taken yet:** commit snapshots (they are small — mostly
TypeScript and markdown, `node_modules` already excluded); or commit a derived
answer-key JSON per trial rather than the trees; or keep them untracked and
accept that licences are machine-local, which at least should be *stated* rather
than discovered. Deposited as a path rather than decided here — it touches every
trial's directory, which is more than a design unit should change on its own.
