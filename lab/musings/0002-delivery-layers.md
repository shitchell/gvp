---
id: 0002
status: open
opened: 2026-10-06
spawned_by: roadmap
tested_by: []
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
