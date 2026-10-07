# Abstract/Summary

Trial 5 is declared and its instrument is licensed: delivery is the variable,
the library is byte-identical in all four arms, and the measurement is `CR1`'s
**radius** across four sites rather than a flip. Building it found a harness that
delivered nothing while looking healthy — the failure mode of a delivery trial is
a convincing null, not an error.

# Results

| licence | method | result |
|---|---|---|
| scorer, real artifacts | re-score trial 2's **12 snapshots**, compare to a different scorer's recorded locations | **12/12** (after one real convention mismatch fixed) |
| scorer, synthetics | 6 known-answer projects + 3 hook cross-reference cases | **9/9** |
| gate | mutations, incl. **11 against run-level checks** via synthetic run worlds | **41/41 caught** |
| harness | live `claude -p` per arm; model must name the element it was shown | **4/4** (L0→NONE, L1/L2→CR1, L2n→WP3) |
| detector | credential-at-rest vs indirection, + 3 declared misses | **19/19 + boundary pinned** |

Defects found and fixed before dispatch: **4**. Harness dead in all 3 hooked arms
(regex backreference across an alternation; non-blocking exit, silent). Scorer
licence passed while scoring **0** real snapshots. Gate's `$HOME` guard
unfalsifiable under the mutation flag. Hook script's own comments named its arm.

## Explanation

Asked where L0 is known to **fail**, not where it works: `CR1` steers the file it
names 3/3 (trial 2) — a ceiling — while trial 2's `baseline` rep 2 ignored its
config, cited `CR1` for doing so, and hard-coded the live token into a test
fixture. So four sites, scored independently and never pooled: config (control,
expected at ceiling), tests (**habit** domain, trial 4's §6 requirement), README,
prescribed example. Arms: L0 pointer / L1 session-start / L2 at the moment of the
write / **L2n** — same hook, same trigger, inert payload — which separates
"something interrupted me" from "`CR1` arrived". L2 informs; a blocking hook
produces compliance trivially and measures enforcement, which was never in doubt.
Because the manipulation sits outside the library, the content-channel class that
cost trials 1–4 their defects is closed by construction and merely asserted.

Two findings precede any run. **The library states the hypothesis**:
`ai-common:P3` ("deliver at the moment the agent will act") and `C3`
("token-distance recall is lossy") — constant across arms, so not a confound, but
a negative result obliges a library patch rather than a footnote. **The
known-answer corpus is gitignored**: trial 2's snapshots exist in one checkout, so
every future scorer licence silently degrades to synthetics — and the protocol is
explicit that synthetics bound only the errors their author imagined.

Deliberate scope change: the preamble arm (PA-05) was **unfolded**, not dropped —
its observable needs a contested axis, a delivery trial needs an owned element,
and `CR1` is a sole owner.

## Methodology

12 runs × 4 arms × n=3, `opus[1m]`, task = trial 2's job dispatcher with
requirements 1–8 byte-identical plus two that make the un-named sites mandatory
rather than incidental (tests, a README worked invocation). `RUN_PROMPT`/
`CLAUDE.md` byte-identical to trial 2's. Nothing dispatched — per `personal:P12`
the pilot is its own unit (brief 0002). Full:
`experiments/2026-10-delivery-cr1/{TRIAL.yaml,PREDICTIONS.md}`.
