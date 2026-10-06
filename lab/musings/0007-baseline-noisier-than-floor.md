---
id: 0007
status: open
opened: 2026-10-06
spawned_by: trial-3
tested_by: []
tags: [variance, methodology, n]
---

# Trial 3's baseline was noisier than its noise floor. Why?

`baseline` and `N-inverted` differ by one inert element — same population —
yet baseline had the only minimal-build outlier (rep 2: absent on all three
forks) while the floor was uniform. At n=3 it's within variance, but if
baseline variance is systematically high on contested-axis tasks, every
trial's power calculation is off. Also worth asking: does the *presence* of an
inverted-but-inert element somehow regularize runs? (It shouldn't. It wasn't
cited. But "shouldn't" has lost before.)

**How to test:** cheapest first — more baseline reps on the tally task
(probe-grade, no variants needed) to see if rep-2-style outliers recur at a
measurable rate.
