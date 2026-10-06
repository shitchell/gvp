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

*(pending)*

## Reflection

*(pending)*
