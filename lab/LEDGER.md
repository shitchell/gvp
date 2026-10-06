# Ledger — decisions of direction

Newest first. Each entry: what was decided, why, and what it supersedes.
Methodology amendments to [`README.md`](README.md) land here too.

---

## 2026-10-06 — tie-break resolutions landed in discussion (pending patch drafts)

The maintainer ruled on the three P0001 contests, mostly structurally:

- **A4** — resolved by category precedence (*"if they contradict, then the
  heuristic should always win"*) plus the real decision machinery, stated for
  the first time: a **sliding threshold** — certainty-of-need required scales
  inversely with cost-now vs cost-later (*"if it takes ~10 extra chars and 5
  seconds now and saves hours or days ... I might need only 5% certainty"*).
  Matches what trial 3's runs did unprompted (musing 0005 strengthens).
  Plan: upgrade `H3` to carry the threshold; soften `CP6`'s absolute final
  sentence (a rule-phrased clause inside a principle — the actual bug);
  `H1` untouched; heuristics stay rigid (rigid procedure over subjective
  inputs preserves hard/soft).
- **A8** — CR2's target is **completion fraud**, not artifact type (origin
  quoted in musing 0013). Contradiction is text-layer only; fix = move intent
  into bytes. Rewrite drafted in two variants (honesty-only vs
  honesty+scoped-sign-off), maintainer to pick. Residual enforcement insight:
  husks die to mutation-tested success definitions, not permission flow.
- **A6** — no patch; principles are deliberately judgment-weighted. But the
  category semantics are undelivered (agents get text, not YAML keys) → the
  **preamble** fix + delivery-trial candidate (musing 0014).

New musings: 0013 (threat models age with model eras), 0014 (precedence is
unwritten law; preamble as fix and as trial). Patch texts go to the
maintainer for review per personal:P15 before any cairn import.


## 2026-10-06 — P0001 scored: the agent pass beat the survey; survey corrected

First loop closed end-to-end (muse → probe → reflect → corrections) on the
day the lab was built. P0001: 6/7 axes recovered, 0 clear false positives,
**+3 contested axes and +1 voice the survey missed** — survey §7 records the
diff; musing 0004 is answered (attention gap); musing 0009 now points at an
agent-pass `cairn axes`; musing 0011 opened (independent re-enumeration as a
standing step — *candidate README amendment, decide at next review*).

**Direction:** trial 4 (`CP7`) declaration is next; its gate's axis check
will use an independent agent re-enumeration per 0011, not keywords.

**For the maintainer (guiding-element patches, per `personal:P15` — not
applied, surfaced):** the three sharpest contests now have enough evidence
for tie-break decisions: **A4** `CP6` vs `H1` (extract-on-first-write vs
second-consumer — trial 3 says whichever side you bless, phrase it as an
against-the-grain tie-break clause); **A8** `CR2` vs `H5`/`P17` (scaffolding
sign-off — operationally live for every agent run under this library); **A6**
`TP1`/`CP7` vs `P16` (uniform vs blast-radius rigor — P16 is newest and
likeliest to reflect current intent; the older absolutes may need the
exception carved in).

## 2026-10-06 — the lab exists; first probe is P0001

The maintainer handed over steering and set the lab model (quoted in
README.md), including that reviews review the model itself. Bootstrapped with
musings 0001–0010 harvested from the loose threads in three trials, the
survey, and the roadmap — nothing invented, every musing cites where it came
from.

**Direction:** exercise the full loop once immediately — probe P0001 (can a
*prompted* agent pass recover the survey's contested axes?) — before trial 4's
declaration. Rationale: P0001 is cheap, feeds two musings (0004 prompted
detection, 0009 `cairn axes` mechanism), and a working loop matters more than
a fast trial 4. Trial 4 (`CP7`) remains next in the trial queue, unchanged.

## 2026-10-06 — trial 4 = CP7; survey before any further shape test *(backfill)*

The axis-ownership survey (all 102 elements, by hand) found 5 contested axes
covering ~20% of the library, vindicated trials 1–2 as an owned-axis contrast,
and corrected trial 3 to 11 voices (defect 4: keyword scans cannot enumerate
an axis). **Decision: trial 4 is `code-common:CP7`** — directive, owned,
prior-neutral, mechanically observable — because shape and ownership correlate
in this library and CP7 decouples them. Queue items re-read under ownership:
`H5`/`TH1` sit in aligned clusters (attribution caveat needed); `V5` sits on a
*reconciled* axis, which reframes the values question as "does a value steer
when a downstream principle cites it by id?" (musing 0008).

## 2026-10-06 — the integration roadmap; delivery trial promoted *(backfill)*

Maintainer set the integration thread (hooks/injections/scaffolding/workflows
as a zero-token contract; suspicion that cairn alone is "largely bookkeeping").
Roadmap doc landed; the delivery trial (protocol queue item 5) was **promoted
to gate the roadmap**: if a reactive hook does not out-steer the L0 pointer,
the hook investment is decoration too. Synthesis adopted: deliver the delta,
at the moment it binds, enforce mechanically where possible.

## 2026-10-05/06 — trial 3 pivot: measure the contested axis *(backfill)*

Protocol §4 enumeration killed the queue's "second evaluative element" (CH2:
hybrid shape; contested axis; P21 already states the pro-seam content).
**Decision: make the contradiction the subject** — tie-break arms instead of
inversions, baseline untampered. Result: steering only against the grain;
contested axes invisible; H3 mediates unprompted. Chosen over (a) finding a
clean axis first (survey came later anyway) and (b) stripping co-stating
elements (id-gap tell; generalises to no real library).

## 2026-09-30 — trials become data structures *(backfill)*

After trial 1 cost four reactively-patched contamination channels and six
hours per usable row, the protocol was written: a trial is a YAML declaration,
channels enumerated before dispatch, gates mutation-tested, one trial in
flight, pilot the arm that can fail. Everything since runs on it.
