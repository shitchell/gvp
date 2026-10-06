# Conversation 0002 — adoption hold, terse reviews, fork-noting, launch architecture

> **With:** Shaun. **Date:** 2026-10-07 (morning after the overnight run).
> Verbatim quotes; produced `lab/PATHS.md`, `lab/reviews/`,
> `lab/OPERATIONS.md`, README model amendments.

## Proposal adoption: parked, deliberately

> "I think I'll hold off on adopting any proposals until we have some solid
> findings/numbers around how different strategies and framings impact agent
> behavior :) ... no shade; i just want to be slow and intentional updating
> my personal gvp lib"

- **Status**: Accepted — proposal 0001 stays a reviewed artifact, not an
  adoption candidate, until the delivery/framing trials produce numbers.
- **Context**: trial 4 had just shown framings can steer reports without
  steering artifacts; the caution is empirically aligned.

## Every fork gets recorded; the reviewer picks

> "anytime there are multiple directions/paths available, both should be
> noted as potential future directions to poke at. then it is simply up to
> whichever agent is reviewing and picking the next path which direction
> (or both) to ever attempt"

- **Status**: Accepted as lab law → `lab/PATHS.md` (the menu) + README loop
  amendment: a decision entry may choose a path, but it must deposit every
  alternative into PATHS first.

## Maintainer reviews become terse, quantified tables

> "i think i would like to limit my reviews, at least for now, to some sort
> of terse, quantified table. i think what i'd love to see is:
> `# Abstract/Summary` {1-2 sentences} / `# Results` {table, at least 1-2
> columns should include quantified data} / `## Explanation` {any discussion
> on the results} / `## Methodology`"

- **Status**: Accepted → `lab/reviews/NNNN-*.md`, template followed exactly;
  retrofitted for trials 1–4, the enumeration program, the harvest, and
  proposal 0001. P0004's patch-candidate clustering: **"not yet"** — parked
  in PATHS.

## Launch architecture: left to the driver, with the requirements named

> "it *could* be helpful to have an orchestrator who uses the absolute
> minimal context ... OR, maybe it's better if each run is one session,
> perhaps scheduled with cron or some other headless mechanism? i leave that
> to you as well haha. either way: we probably ought to think about how we
> launch new trials in a way that preserves intention, the self-amending
> behavior, findings, musings, etc.... and provides a solid structure to
> either orchestrators or headless sessions as you see fit. or both."

- **Status**: Accepted → `lab/OPERATIONS.md` designs both (per the
  fork-noting rule), recommends the headless phase-session + thin steer
  tier first, and parks the cron automation itself pending maintainer go.
