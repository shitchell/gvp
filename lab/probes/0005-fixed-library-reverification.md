# P0005 — blind re-verification of proposal 0001 after the P0003 fixes

> **Tier: probe.** Same prompt and blindness as P0001/P0003, against the
> proposal library with patch 7 (CH2 yields to H3's threshold) and patch
> 2-rev (TH2 scoped to reported checks). **Ran:** 2026-10-06 (overnight).
> Expectations fixed in the fix commit: P0003's two failures resolved,
> untouched contests stable, nothing new from the fixes themselves.

## Result

16 tensions, 19 rejections. Scored:

- **H3-vs-CH2: GONE.** No such tension reported; CH2's escape hatch is
  quoted approvingly in two entries (*"CH2 also carries its own escape
  hatch"*; *"covers most of P19's territory"*). Fix verified.
- **TH2 deepening: GONE.** TP1-vs-P16 reports TH2's carve-out verbatim, and
  TH2-vs-P18 lands in the rejected list with TH2 *"names its own
  justification and scopes itself"*. Fix verified.
- **Stability: HELD.** The known open axes all still fire (P21-vs-CH2
  residue, option surface, auto-vs-opt-in, scratch-state, locality-vs-dedup,
  generic-vs-minimal, rename territory via deprecation).
- **R3 in action, with honest limits:** cited as resolver in ~10 entries,
  and correctly identified as useless for within-category contests —
  including the newly *sharpened* WR2-vs-RTR2, now legible as **rule vs
  rule**, which no precedence can settle.
- **New finds (pass 4 still yields):** RTP2 (*"in cooperative systems,
  prevention beats detection"*) vs `ai-common:H2`/`P5` (least-restrictive +
  detector, tighten on observed need) — both claim the cooperative regime,
  genuinely novel; README's deprecate-don't-delete vs `ai-common:P2`'s
  aggressive removal; V7-vs-V1 named explicitly as the root value tension.

**Proposal 0001 is unblocked** per its own frozen rule.

## Reflection

1. **The enumeration yield curve** (musing 0011's open question, first
   data): survey +5 axes → P0001 +7 tensions → P0003 +1 → P0005 +2–3.
   Diminishing, not converged. Each pass's novelty increasingly lives at
   domain *boundaries* (realtime-vs-ai-common, README-vs-elements) — exactly
   where single-perspective reads stop looking.
2. **Within-category contests are now the frontier.** R3 cleanly absorbs the
   cross-category noise, which *exposes* rule-vs-rule (WR2/RTR2) and
   heuristic-vs-heuristic as the contests that still need per-pair
   tie-breaks — trial 3's mechanism has a precise remaining jurisdiction.
3. Fix-then-blind-reverify cost two subagent passes (~10 min) and caught a
   real self-inflicted contradiction before the maintainer ever saw the
   proposal. This should simply be how library edits ship (roadmap 4.1's
   import-time check, now with a working recipe).
