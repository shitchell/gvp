# P0003 — does the patch set dissolve the contests it targets?

> **Tier: probe.** Tests proposal 0001 (`lab/proposals/0001-tiebreak-library/`)
> before the maintainer reviews it. **Ran:** 2026-10-06.

## Design

Identical prompt and setup to [P0001](0001-prompted-contradiction-detection.md)
— a fresh, context-blind agent asked for internal tensions — but against the
**patched** library (CR2 rewritten as the honesty rule, H3 carrying the
sliding threshold, CP6's absolute softened, `personal:R3` category precedence
added, `code-testing:TH2` falsifiability added, README reading-preamble;
note the README ships in the library copy this time, unlike P0001, because
the preamble is part of the fix under test).

## Expectations, fixed before launch

1. **A4** (CP6 vs H1) — no longer reported as a direct contradiction; if
   reported at all, as resolved (by the H3 threshold and/or R3 precedence).
2. **A8** (CR2 vs H5/P17) — not reported; the rewritten CR2 no longer
   collides with P17 (throwaway carve-out is explicit) and R3 settles the
   H5 residual.
3. **No new tensions introduced by the six patches** — in particular nothing
   involving R3, TH2, or the reworded H3/CP6/CR2.
4. **The untouched contests still fire** — A1/A2/A3 variants, T4 rigor
   (P16), T5 rename-vs-commitment, T8/T10/T13-class mild ones. The patch set
   did not address them; a probe that stops reporting them is drifting, not
   agreeing.
5. R3's existence should surface in "Resolved?" fields where applicable —
   the first delivery evidence (probe-grade only) that a written precedence
   rule gets *used* when visible.

Failure of (3) blocks the proposal; failure of (1)/(2) sends the rewrite
back; failure of (4) impeaches the probe, not the library.

## Result

12 tensions reported, 18 near-tensions rejected. Against the frozen
expectations:

| expectation | verdict |
|---|---|
| 1 — A4 dissolves | **HELD.** CP6 reads as deferring to H3; the CP1-vs-CP4 contest reports *"personal:H1 is the designated timing arbiter ... as a heuristic it outranks both principles under R3"* |
| 2 — A8 gone | **HELD.** CR2 appears only in the rejected list: *"CR2 targets placeholder deliverables ... and exempts throwaway instruments"* |
| 3 — no new tensions | **FAILED, twice.** (i) The H3 rewrite dropped "identified (not speculative)" — deliberately, the maintainer's 5%-example covers speculative needs — and so now **directly contradicts CH2's third branch** ("speculative ... defer entirely"). Both heuristics; R3 cannot rank them; the probe: *"the arbiters themselves disagree."* (ii) TH2-under-R3 **deepens** TP1-vs-P16: a heuristic demanding falsifiable checks would beat the principle licensing loose leaf code — overriding exactly the judgment the maintainer ruled to preserve |
| 4 — untouched contests still fire | **HELD** (option surface, rename-vs-commitment, rigor, delegation, scratch-state, auto-vs-opt-in all still reported) |
| 5 — R3 gets used | **HELD.** Four tensions marked resolved *by R3* by a blind reader — first delivery evidence that a written precedence rule is applied when visible |

Per the frozen rule, expectation 3's failure **blocked the proposal**. Fixes
applied as patch 7 (CH2's third branch yields to H3's threshold when the
build is near-free and the retrofit costly) and patch 2-rev (TH2 binds only
checks whose green is *reported as evidence* — V2's territory — leaving P16's
loose-leaf license intact). Re-verified blind: P0005.

Also surfaced, not mine and not blocking: `ai-common:P4`'s categorical
*"even when that means redesigning"* forecloses the V1/H3 cost-weighing — a
candidate ninth contested axis for the survey (noted for the next review;
P0001 missed it too).

## Reflection

1. **The loop caught its own author.** Survey corrected trial 3; P0001
   corrected the survey; P0003 corrected the proposal the survey's author
   wrote. Third instance of musing 0011's law, now spanning artifacts AND
   authors: every enumeration-shaped claim needs an independent pass,
   including fixes.
2. **Precedence changes the blast radius of every future edit.** T5's
   deepening is the instructive one: adding a *heuristic* to a library with
   R3 in it silently outranks standing principles. An element addition now
   carries category-force consequences that the author must check — `cairn
   axes` should eventually flag "new heuristic outranks principle X on a
   shared axis" at import time.
3. **The fix for a contradiction can be a contradiction.** H3-vs-CH2 existed
   *because* the rewrite faithfully encoded the maintainer's intent — the
   intent genuinely overrides CH2's old absolute. The right fix was to make
   CH2 say so, not to weaken H3 back.
4. n=1 per probe, same model family as always; and the probe's resolution
   judgments lean on the README preamble being read — which is the untested
   delivery question (musing 0014). Probe-grade throughout.
