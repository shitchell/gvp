# P0002 — independent re-enumeration of the typing axis (trial 4's gate step)

> **Tier: probe** (instrument-grade input to trial 4). Musing 0011 in
> practice: a load-bearing enumeration gets an independent pass before
> anything is built on it. **Ran:** 2026-10-06.

## Design

Same blind setup as P0001, narrower question: which elements bear on *how
much explicit static typing to use* (annotations / strict settings / typed
models / TS-vs-JS), with direction and the decisive phrase quoted; plus a
rejected list with reasons.

## Result

The survey's "CP7 is owned (weak support from CP3)" is **wrong**. Direct
toward-more-typing voices found: `CP7` (anchor), `CP16` (*"hard requirements
such as type checking"*, maps_to CP7), `CP10` (example: *"enforce strict type
checking in a pre-commit hook"*), `R1` (*"Typecheck must pass"*), `CP3`
(*"Function signatures show all inputs"*, *"Enums over string literals"*),
`CP2` (*"Explicit function signatures"*), `P7` (conditional, via enforcement).
Indirect leaners: `P19`, `P20`, `ai-common:P4`, `WP2`/`WR2` (runtime-schema
caveat noted). Adjacent-neutral: `V1` (cuts both ways, entails neither),
`P16` (scaler — A6 territory), `P18`, `ai-common:P2`. Zero opposing voices.
Rejected list is high quality (correctly excludes `CP11`, `CP9`, `P3`,
`V2`-as-parent, the testing cluster).

Adjudications against the elements: `CP3`'s signature clause is about
inputs-as-parameters (anti-hidden-state), not annotations — treated as
adjacent, not restating. `CP2`'s clause is precisely about signature
explicitness — restating. `R1`/`CP10`/`CP16` quote the axis verbatim —
restating.

**So the typing axis is not owned and not contested — it is BUTTRESSED:**
one anchor plus four restatements plus indirect leaners, all one direction.
The survey's §4 ownership table gains a correction (its §7 extended).

## Reflection

1. Musing 0011's rule caught its second miss in two uses. Single-pass
   enumeration undercounts: trial 3's gate (keywords) < survey (manual) <
   P0001 (agent, tensions) — and now the survey's *ownership* column fails
   the same way its *contest* column did. Re-enumeration before build is
   earning standing-step status.
2. **Trial 4 as declared (directive + owned decoupling) is dead** — a lone
   CP7 inversion is unattributable against five standing co-voices. Pivoted
   to the buttressing trial (see LEDGER): lone-inversion vs quieted-buttress
   inversion, which converts the confound into the independent variable —
   trial 3's move, reused.
3. Buttressed is a *third* axis state the survey's taxonomy already named
   but underweighted: owned / contested / reconciled / **buttressed**. The
   manipulation-relevant property differs per state: contested → tie-breaks
   steer (trial 3); buttressed → unknown, trial 4's question; owned → trials
   1–2.
