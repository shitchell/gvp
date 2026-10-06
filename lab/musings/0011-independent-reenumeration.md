---
id: 0011
status: open
opened: 2026-10-06
spawned_by: P0001
tested_by: []
tags: [methodology, enumeration, model-amendment]
---

# Single-pass enumeration undercounts whoever does it — make re-enumeration a step

Three layers of the same failure: trial 3's keyword gate missed CP5/CP6
(survey caught it); the survey missed P19 + three contested axes (P0001
caught it). Each enumerator was confident; each was corrected by an
independent pass with different machinery. The fix is structural, not a
better enumerator: **any load-bearing enumeration (axis voices, contamination
channels, fork levels) gets one independent re-enumeration before anything is
built on it** — a fresh agent, a different method, or at minimum a different
day's read.

**Candidate README amendment** (per the maintainer's self-review rule): add
this to the house rules. Cost: one subagent per enumeration (~minutes, per
P0001). Decide at next review — see LEDGER.

Open question it leaves: does a SECOND independent pass still add axes, or
does it converge? Cheap to test: run P0001's prompt once more with a
different framing and diff. If pass 3 finds nothing new, two passes suffice;
if it keeps finding, the library's contest count is method-bounded, not
real-bounded — which would itself matter for #26.

## Update — the yield curve (P0003/P0005, 2026-10-06)

Pass-over-pass novelty: survey +5 axes, P0001 +7 tensions, P0003 +1
(ai-common:P4), P0005 +2–3 (RTP2-vs-ai-H2, deprecate-vs-curate, V7-vs-V1
named). **Diminishing, not converged**, and late-pass novelty concentrates
at domain boundaries (realtime×ai-common, README×elements) — suggesting the
right N for passes is "until a pass yields only boundary-flavored milds",
and that a deliberate boundary-focused pass might close the tail faster
than another general one.
