---
id: 0018
status: open
opened: 2026-10-07
spawned_by: trial-5 design (harness self-test)
tested_by: []
tags: [delivery, integrations, instrument, roadmap-gate]
---

# A silent integration is indistinguishable from a measured null

Trial 5's first harness build was dead and looked healthy. The L2 detector used
a backreference across a regex alternation and numbered it wrong, so the hook
script raised at import. A non-zero exit from a `PreToolUse` or `SessionStart`
hook is a **non-blocking error**: Claude Code continued, nothing was injected,
nothing surfaced in the run's output or transcript, and all three hooked arms
delivered exactly nothing.

Had the trial been dispatched in that state, it would have produced a clean,
internally consistent, *completely false* branch-3 result: "no prompt-layer
delivery moves a habit" — the branch that retires the injection half of the
roadmap. The failure mode of a delivery mechanism is not an error; **it is a
convincing null.**

What caught it was not the hook's own log (empty either way) but a behavioural
check: the throwaway prompt asks the model to name any library element quoted to
it, and the hooked arms must answer with their arm's element while L0 answers
NONE. **Only the model's answer proves the payload landed in context.**

Generalisation, and the reason this is a musing rather than a defect note:

> **Every integration the roadmap ships (4.2's review hook, 4.3's delta
> injection, 4.4's capture hook, 4.5's scaffolding) has the same failure mode,
> and the same remedy: a mechanical "did it fire" assertion plus a behavioural
> "did it arrive" assertion, both of which must be able to fail.** An integration
> without them cannot be distinguished from a decoration, which is precisely the
> question `experiments/REGISTER.md`'s delivery column exists to answer.

Trial 5 now carries both: `selftest/validate-detector.py` (no live session
needed) and the gate's delivery manipulation check (a hooked run whose log shows
no injection is *meaningless*, not null). The protocol's channel table gains the
row.

**Sharper form of the worry, worth its own test:** trials 1–4 measured elements
and asked "did it steer?". A delivery trial has to ask "did it arrive?" first,
and that is a *manipulation check on the independent variable* — which trial 1
had (it verified the element differed) and which no trial has yet needed for the
delivery channel. How many other independent variables in this programme are
assumed-delivered rather than verified-delivered?
