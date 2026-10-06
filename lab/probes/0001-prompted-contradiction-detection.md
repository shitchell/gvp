# P0001 — can a prompted agent pass recover the contested axes?

> **Tier: probe.** n=1, loose controls, nothing register-grade claimed.
> **Tests:** musing [0004](../musings/0004-prompted-contradiction-detection.md)
> (capability vs attention gap) and musing
> [0009](../musings/0009-cairn-axes-mechanism.md) (is an agent pass a viable
> `cairn axes` mechanism).
> **Ran:** 2026-10-06.

## Design

One fresh general-purpose subagent — no access to this conversation, the
survey, or the trials — handed a clean copy of the untampered personal
library (six YAML files, `README.md`/`ROADMAP.md` excluded) and asked
directly for internal tensions: opposing pull on a concrete implementer
question, not topical overlap; judge from statements; check the tag glossary;
report sides by element id, severity, and whether any element already
resolves it. Also asked for near-tensions considered and rejected, to see the
decision boundary.

Contrast with trial 3: there, 0/12 runs *reported* the contradiction while
resolving it silently — but nothing asked them to look. This probe asks.

## Scoring, fixed before results

Answer key = the survey ([`experiments/2026-10-axis-survey.md`](../../experiments/2026-10-axis-survey.md)):
five contested axes (A1 seams/deferral, A2 option surface, A3
generic-vs-minimal, A4 extraction timing, A5 locality-vs-dedup) and two
reconciled axes (unknown-data/`WP2`, verify-vs-reversibility/`H8`).

- **hit** — a reported tension matches an axis's question and names ≥1
  element from each side
- **partial** — right question, materially incomplete sides
- **miss** — axis not reported
- **false positive** — reported tension that is same-direction redundancy or
  topical overlap. **Adjudicated honestly against the elements, not against
  the survey:** the survey is the best current map, not ground truth — a
  probe tension the survey missed triggers a re-read and, if real, a survey
  correction (that is exactly how the survey corrected trial 3).

Reading of results for musing 0004: strong recall → attention gap (reading b;
agent pass viable). Weak recall → capability gap (reading a; `cairn axes`
cannot lean on an agent pass). Middling → the mechanism question moves to
"agent pass as *candidate generator* with human confirm".

## Result

The agent reported **14 tensions** (T1–T14) and 14 near-tensions it
considered and rejected. Scored against the key:

| axis (survey) | probe | verdict |
|---|---|---|
| A1 seams/deferral | T2 | **hit** — and adds `P19` as a pro-build voice the survey missed (*"even when it is not certain they will be immediately useful"*); correctly cites `P17` as a partial resolution |
| A2 option surface | — | **partial/miss** — components appear across T2/T5 but the question (expose options vs consolidate surface, `V4`/`P21`/`CP5` vs `P8`/`CP11`) is never isolated |
| A3 generic-vs-minimal | T3 | **hit** |
| A4 extraction timing | T1 | **hit** — leads with the same `CP6`-vs-`H1` quote-pair the survey called sharpest |
| A5 locality-vs-dedup | T14 | **hit** |
| R1 unknown-data | T11 | **hit** — found `WP2`'s "(per V5)" resolution *and* named the unresolved edge (whole-message drop vs never-reject) the survey glossed |
| R2 verify-vs-reversibility | T9 | **hit** — correctly identified `H8` as self-resolving |

**6 hits, 1 partial, 0 clear false positives** — the rejection list is
high-quality too (`P7`-vs-`P18`, `P8`-vs-`H7`, `P1`-vs-`P17` all correctly
read as refinements, matching the survey's buttressed/mediating logic).

**And seven tensions the survey missed.** Adjudicated against the elements
(per the pre-registered rule — the survey is a map, not ground truth):

| probe | question | adjudication |
|---|---|---|
| T4 | uniform rigor (`TP1` "all code", `CP7` "all signatures", `P9`) vs blast-radius rigor (`P16` *"let leaf or disposable components be built more loosely"*) | **real, contested** — survey missed the whole axis |
| T5 | rename a misleading public name (`ai-common:P2` *"aggressively remove… misleading names"*, `CP8`) vs surface-is-commitment (`CP11` lists "a renamed flag" as the breaking case) | **real, contested** |
| T6+T7 | scaffolding sign-off: `CR2` *"explicit, verbatim, quoted verification from the user… No exceptions"* vs `H5` *"never ask go or no go"*, `P15`, and `P17`'s *"even with a throwaway consumer"* | **real, contested — the sharpest find.** T7 is near-textual: P17 endorses the exact artifact CR2 forbids without sign-off |
| T8 | `RTP7` module-scope scratch mutation vs `CP3` "no hidden state" | real, mild |
| T10 | auto-enforcement (`P7`/`CP10`/`C2`) vs opt-in (`V4`) | real, mild |
| T12 | `H2`'s user-facing never-delegate vs `H6`/`P15` | real, mild (survey had flagged it as "edge") |
| T13 | `CP5` zero-config default vs `V6` no-privileged-frame | real, mild, narrow |

Corrections applied to the survey (its §7). Contested axes: **5 → 8**;
elements on contested axes ≈30 (~29%).

## Reflection

1. **Musing 0004 is answered: it's an attention gap, not a capability gap.**
   Prompted, a fresh agent recovers nearly everything a day of manual survey
   found, finds real contests the survey missed, and almost nothing false.
   Trial 3's 0/12 silence was about having no reason to speak, not inability
   to see.
2. **Musing 0009 moves hard toward the agent pass.** The recall ordering is
   now empirical: keyword scan (10 voices) < manual survey (12, +5 axes) <
   prompted agent (+1 voice, +3 contested axes, +4 mild). `cairn axes` =
   agent pass with the glossary and inheritance in the prompt; keywords demote
   to a pre-filter at most. Cost: one subagent, ~5 minutes.
3. **Three layers of the same lesson, and the third one is on me.** The
   survey corrected trial 3's enumeration; this probe corrected the survey's.
   Single-pass enumeration undercounts *whoever does it* — the fix is
   independent re-enumeration, not a better enumerator. → musing 0011,
   candidate README amendment.
4. **The probe surfaced a library bug with operational teeth.** `CR2`-vs-`H5`
   (T6/T7) is not academic: it governs whether *our own agents* may proceed
   on derivable scaffolding decisions. Guiding-element patch candidates go to
   the maintainer per `personal:P15` — listed in the LEDGER entry.
5. **Limits, honestly:** n=1, one model, and the probe's prompt taught it
   what a tension is (opposing pull on a concrete question) — some of its
   edge over the survey may be that definition doing the work. A second run
   with a vaguer prompt would isolate that. Also it merged A2 into A1 —
   question-individuation is where it was weakest.

**Status of claims:** probe-grade. "An agent pass recovers contested axes"
is now a *hypothesis with one strong supporting probe*, not a shown result.
If `cairn axes` ships on this mechanism, a trial-grade eval (multiple runs,
held-out libraries, seeded synthetic contests) comes first.
