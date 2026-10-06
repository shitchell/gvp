---
id: 0009
status: testing
opened: 2026-10-06
spawned_by: survey
tested_by: [P0001]
tags: [cairn-axes, tooling, roadmap-4.1]
---

# What mechanism can `cairn axes` actually use?

Survey defect 4 proved keyword scans undercount (CP5/CP6 missed). Candidate
mechanisms: (a) embeddings — blocked on T2, stub produces false positives;
(b) agent pass — feasibility unknown, P0001 probes it; (c) tag-concern
direction analysis — the glossary already encodes axis *sides* (simplicity vs
maintainability on CH2's own tags), cheap but partial; (d) keyword as first
filter + human/agent confirm. Also must distinguish buttressed same-direction
pairs (deliberate) from contests: **direction, not co-occurrence**.

Cost anchor: the manual survey took one sitting for 102 elements. The tool
earns its place at re-run time (every import touching the design core), not at
first run.

## Update (P0001, 2026-10-06)

Recall ordering is now empirical: keyword scan (10 voices on A1) < manual
survey (12 voices, 5 contested axes) < prompted agent pass (13 voices, 8
contested + 4 mild). Mechanism (b) is the front-runner: an agent pass with
the tag glossary and library inheritance in the prompt, keywords as a
pre-filter at most, and **independent re-enumeration as a standing step**
(musing 0011) since every single pass to date has been corrected by the next.
Before shipping: a trial-grade eval — multiple runs, a held-out or synthetic
library with seeded contests, measured precision/recall.
