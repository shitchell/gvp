---
id: 0014
status: open
opened: 2026-10-06
spawned_by: conversation (tie-break discussion)
tested_by: []
tags: [precedence, categories, preamble, delivery]
---

# Category precedence is unwritten law: rule > heuristic > principle > value

The maintainer, resolving A4 structurally rather than per-pair (2026-10-06):

> "a 'principle' is intentionally not always applicable. that's the point,
> there is some subjective judgment. it is not a rule. that said, a heuristic
> is. if they contradict, then the heuristic should always win since it does
> define a more rigid set of instructions."

Generalized (rule > heuristic > principle > value), this resolves A8's
precedence half mechanically too (CR2-the-rule beats H5-the-heuristic). But
it is written nowhere: both blind reviews (survey, P0001) flagged these as
contests precisely because no text states precedence. Two consequences:

1. **The preamble** ("how to read this library": rules bind; heuristics bind
   when applicable; principles yield to judgment and to heuristics; values
   set direction) is the cheapest fix — and a ready-made delivery trial:
   with/without-preamble arms on a principle-vs-heuristic contest.
2. **Precedence needs the hard/soft cleanup to be safe** (#26/#30): CH1 is a
   heuristic that is secretly evaluative (trial 1); granting category-based
   rule-force to miscategorised elements steers wrong with confidence.

Also empirically grounded by the maintainer's own skepticism about ambient
delivery, stated as a hunch and matching trial 3 + P0001 exactly:

> "my suspicion is that there won't readily be a noticed 'feeling of
> uncertainty' unless prompted at every turn ... perhaps that is a step for
> the parent agent to do? or one targeted review that tries to find those
> tensions and resolve them by peeking at the descriptions?"

Which is the roadmap's 4.1 (axes pass, P0001-mechanized) + bind-time
injection (L2), vs per-turn interrogation (wrong: cost + ai-common:C4).
