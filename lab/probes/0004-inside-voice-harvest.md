# P0004 — the inside-voice harvest: 36 DECISIONS files, read once, across runs

> **Tier: probe** (archival; zero new runs, zero contamination risk). Tests
> musing 0006. Delegated to one subagent (~358k tokens of reading kept out of
> the driver's context). **Ran:** 2026-10-06 overnight. Coverage: 36/36
> files; classification rules recorded in the raw output for auditability.

## Result

| class | hits | rate |
|---|---|---|
| **would-have-flipped** (author names an element change that would have altered its own decision) | **7** | ~19% of runs |
| **steering-meta** (explicit commentary on element efficacy: pulls, overrides, gaps, scope disclaimers) | **106** | ~3 per run |
| files with neither | 2 | 36 → 34 productive |

## The three findings that matter

### 1. Convergent unprompted patches — the high-confidence retrospective signal

All three trial-2 `I-inverted` runs **independently proposed the same
qualifier on CR1** (distinguish live from development credentials /
"configuration, not ambient state" intent), each explicitly routing it per
`P9`/`P15`/`H5` — the rule gets changed by decision, not routed around.
Three blind runs converging on one patch is a signal no single run can give,
and **nobody could see it until something read across runs.** The roadmap
4.4 harvest hook should therefore cluster by proposed-element, not just
collect: convergence is the ranking function for the review queue (#39).

### 2. Runs improvise precedence — in BOTH directions (pre-R3 evidence)

Trial 1, `N-inverted` rep 1: *"`personal:R2` is a rule, and the competing
consideration was interface tidiness"* — rule beats taste. Trial 3,
`A-decisive` rep 2: *"I went with P20 — **a principle, where CH2 is a
heuristic serving it**"* — principle beats heuristic, **the inverse of the
maintainer's R3**. The pre-R3 library delivered no precedence, so runs
invented it, inconsistently, each confident. → musing 0015; and the
preamble delivery trial gains a sharp observable: do improvised precedence
statements disappear (or align with R3) when the preamble ships?

### 3. The systematic unmet element: CP10/P7's enforcement gap, 10 of 36 files

Runs repeatedly, honestly report that `npm run check` is a convention, not a
hook — because their run directories have no git repo or CI to hook into.
An element the *environment* makes unsatisfiable produces a permanent
drumbeat of confessed gaps. Two readings, both useful: the honesty norm
(V2) is working; and element applicability depends on harness affordances —
a delivery-layer fact the library cannot see. (Also a small instrument note:
our isolated run worlds systematically forbid one element's satisfaction.)

Smaller notes: ~15 distinct "patch that would settle it" proposals beyond
the convergent trio, several high quality (exit-code semantics; "a filter
narrows what is reported, never what is diagnosed"; "a measurement with no
basis is reported as absent, never as zero"); `ai-infra:R7` cited from the
machine-wide registry as "outside influence rather than governance" —
cross-library steering through the registry is real and self-reported.

## Reflection

1. **Musing 0006 is answered: yes, harvestable, and better than hoped.**
   ~19% would-have-flipped plus ~3 steering-meta per run, extractable by one
   cheap pass. The design upgrade from this probe: harvest → **cluster by
   element** → rank by convergence → feed #39. Patches confirming a taken
   decision are noise; only decision-changing ones count (the agent's
   classification note, worth keeping as the filter).
2. **DECISIONS.md is a second instrument.** The trials score artifacts; the
   decisions corpus scores the *library* — gaps, pulls, improvised
   precedence — for free, on every run we have ever done or will do.
3. Caveats: one reader, one pass (0011 applies to harvests too); the
   RUN_PROMPT *asks* for element commentary, so rates here are
   prompted-corpus rates — a Stop-hook on organic sessions will see less.
