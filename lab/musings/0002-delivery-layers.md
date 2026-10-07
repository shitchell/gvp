---
id: 0002
status: testing
opened: 2026-10-06
spawned_by: roadmap
tested_by: [trial-5]
tags: [delivery, hooks, roadmap-gate]
---

# Does a reactive hook (L2) out-steer the CLAUDE.md pointer (L0)?

Every trial so far ran at L0. The roadmap is gated on this: if injecting an
element *at the moment of the act* doesn't beat a pointer the agent must
choose to follow, the hook investment is decoration. `ai-common:C3`
(token-distance recall is lossy) and `ai-common:P3` (deliver at point of use)
*predict* L2 wins — the library bets on it; nothing has measured it.

**How to test (trial-grade):** same directive element (CR1 or CP7), same
task, arms = L0 pointer / L1 session-start injection / L2 PreToolUse hook
keyed on the relevant act. The element text is identical across arms — only
the delivery differs. New channel: hook output must be checksummed per arm.

**In flight as trial 5** (`experiments/2026-10-delivery-cr1`, declared
2026-10-07). Design notes that changed from the sketch above: the element is
`CR1` (not `CP7`), because the arms need a site where L0 is KNOWN to fail and
trial 2 supplied one; the measurement is **radius across four sites**, not flip,
because CR1 is at ceiling on the fork it names; L2 **informs rather than blocks**,
since a blocking hook measures enforcement and not steering; and the null arm is
`L2n` — the same hook, the same trigger, an inert payload — which separates "a
hook interrupted me" from "CR1 arrived". The checksum-per-arm requirement this
musing called for became payload fidelity + byte-identity assertions in the gate.
