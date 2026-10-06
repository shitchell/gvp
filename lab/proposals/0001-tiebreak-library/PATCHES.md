# Proposal 0001 — the tie-break patch set

> **Status: awaiting maintainer review** (`personal:P15` — these are guiding
> elements). `library/` here is a full copy of `~/.gvp/library` with six
> patches applied; **the real library is untouched.** Review by diffing:
> `diff -ru ~/.gvp/library lab/proposals/0001-tiebreak-library/library`.
> Rationale sources: `lab/conversations/0001-…md`, probes P0001/P0002,
> trials 1–3. Verified: `cairn validate` exit 0 with the **same 27 warnings
> as the unpatched library** — zero new diagnostics. Blind re-check: P0003.

## The six patches

| # | target | change | grounded in |
|---|---|---|---|
| 1 | `code-common:CR2` | **rewritten as the honesty rule** — "Placeholder work is never presented as done": build the real thing or report you cannot; placeholders only with incompleteness declared loudly, tests must not pass as if real; P17 throwaway instruments explicitly out of scope | CR2's Sonnet-era origin targets completion *fraud*, not artifact type; the A8 contest was text-layer only. Maintainer: *"there are better ways to resolve that without CR2"* and delegated the variant choice |
| 2 | `code-testing:TH2` | **new heuristic** — "A check that cannot fail is not a check": prove every success definition falsifiable (inject a defect, see red, restore) | the deterministic anti-husk defense for a possible Sonnet-subagent return — a hollow implementation cannot survive a mutation-tested floor. Distilled from three trials of instrument practice; directly answers *"tests that do nothing but throw superficial green checkmarks"* |
| 3 | `personal:H3` | **carries the sliding threshold** — certainty-of-need required scales inversely with cost-now vs retrofit-cost; estimates are judgment, the comparison is not | the maintainer's stated decision machinery (5%-vs-50% example), and what trial 3's runs already did unprompted (musing 0005) |
| 4 | `code-common:CP6` | final absolute sentence (*"should have extracted it the first time"*) → reusability **lowers H3's threshold**; CP6 harmonizes with H1 instead of contradicting it | the absolute was a rule-phrased clause inside a judgment-weighted principle — the actual A4 bug. H1 untouched, per the maintainer's ideal |
| 5 | `personal:R3` | **new rule** — category precedence: rule > heuristic > principle > value; within-category or wrong-feeling contests get surfaced as patches (H5), never resolved silently; precedence valid only while categories pass hard/soft | the maintainer's structural resolution, generalized — it also settles A8's H5 residual. Previously unwritten law: both blind reviews tripped on exactly its absence |
| 6 | `library/README.md` | **"Reading this library" preamble** — what force each category carries, pointer to R3 | A6's real gap: agents receive text, not YAML keys; "principle = judgment" was undelivered. Delivery efficacy is untested → the preamble is also the delivery-trial candidate (musing 0014) |

## Deliberately not done

- **H1, TP1, P16 untouched** — A6 needs no patch (principles are judgment,
  P16 *is* the judgment); A4's heuristic stays as-is since precedence + the
  H3 threshold + CP6's softening carry the fix.
- **No per-pair tie-break clauses** (trial 3's mechanism) — R3 resolves the
  *class*; clauses remain the tool for same-category contests (A1's
  CH2-vs-P21 clause from trial 3 would still be the pattern there).
- **A1/A2/A3/A5/A7 and the mild-friction axes left open** — out of this
  ruling's scope; still queued.

## Adoption notes

- Adopt by `rsync` of the four changed files (or re-apply via `cairn edit`
  for provenance stamps — the copies carry `origin:` notes already).
- **Sequencing with trial 4:** none of the six patches touches trial 4's
  elements (CP7/CP2/CP10/CP16/R1-typecheck-clause) — but adopting into
  `~/.gvp/library` changes the baseline that `build-variants.sh` snapshots.
  Trial 4's variants are already built and frozen from the pre-patch
  library; **adopt after trial 4's runs complete, or rebuild + re-gate the
  variants.** The frozen instrument is otherwise unaffected.
- The README preamble's *delivery* is unproven until the with/without trial
  runs; adopting it is safe either way (it can only be read or not read).
