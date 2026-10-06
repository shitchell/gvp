# Pre-registration — trial 4, strict typing and the buttressing question

> **Frozen before the first dispatch.** Amendments append at the bottom with
> the dispatch they preceded, never edited into the body.
> Declaration: `TRIAL.yaml`. Protocol:
> `../../docs/plans/2026-09-30-trial-orchestration.md`.
> Axis re-enumeration: `lab/probes/0002-cp7-axis-reenumeration.md`.

---

## 1. The questions

1. **Style-domain steering.** Trial 2 showed a directive overrides a *safety*
   prior. CP7's domain is pure style — annotations, strict settings, named
   models — where nothing is at stake but convention. Does a directive still
   steer there? (`I-quiet` carries this.)
2. **Buttressing.** P0002 found CP7 anchored by four restating voices.
   When the anchor inverts and the restatements stand, who wins? (The
   `I-lone`/`I-quiet` delta carries this — musing 0012.)

## 2. The prior is measured, and a prior claim is corrected

The REGISTER's trial-4 preview said CP7 was *"prior-neutral (both polarities
are ordinary practice, so trial 2's safety-prior confound does not exist)"*.
**Half of that was wrong and is corrected here, before dispatch.** Both
polarities are ordinary in professional practice — but the *model's* prior is
not neutral. Trial 3's twelve surviving run roots are twelve runs of this
same library on this same task, untampered on the typing axis:

| | tsconfig | strict | ret-annotations | interfaces | `any` | typecheck script |
|---|---|---|---|---|---|---|
| all 12 runs | 12/12 | 12/12 | **194/195 (99.5%)** | 3–10 per run | 0 | 12/12 |

The style prior sits at ceiling. So the I-arms are **override-the-prior**
tests — trial 2's structure in a style domain — and the baseline/floor arms
are expected to be near-zero-variance, which is what makes any movement
legible. What survives of the original claim: no *safety* objection opposes
inversion, so trial 2's `I`-arm confound (an inverted rule being
self-evidently wrong) is absent.

## 3. The arms, byte-exact

Built and verified by `instrument/build-variants.sh`; `cairn validate`
output is sha-identical across all five arms (`a50cebbc…`, from `/tmp`).

- **`baseline`** — untampered.
- **`I-lone`** — CP7 → *"Inferred typing — Let inference carry the types it
  can. Omit annotations the compiler already knows, prefer plain objects over
  model classes for internal shapes, and reach for a checker only where a
  boundary genuinely needs one. Fewer restatements of what the code already
  says."* (trial 1's tone-matched inversion, verbatim, name included).
  Buttresses intact: the library now says both *"reach for a checker only
  where a boundary genuinely needs one"* (CP7) and *"Typecheck must pass"*
  (R1).
- **`I-quiet`** — same inversion, plus four same-shape swaps that silence the
  buttresses without touching their own axes: CP2 *"Explicit function
  signatures"*→*"Explicit control flow"*; CP10's example strict-type-checking
  →formatter; CP16's hard-requirement example type-checking→deployment
  targets; R1 *"Typecheck must pass"*→*"Checks must pass"*. Two files, five
  elements — the declared deviation that constitutes the independent
  variable.
- **`M-narrowed`** — one prescription boundary-scoped: *"Type hints on
  exported function signatures; omit them on internal ones and let inference
  carry those."* Name unchanged. Both polarities are lint-mainstream
  (`explicit-module-boundary-types` is literally this norm).
- **`N-inverted`** — trial 3's null verbatim (`code-web:WP3`), inert for a
  local CSV CLI.

## 4. Forks

Scored from the snapshot by a TS-AST scorer (the `typescript` package, not
regex — protocol §6's "ask whether the thing happened"), which must be
**validated against the twelve trial-3 roots first**: it should reproduce the
§2 table before it is allowed to score a single trial-4 run.

| fork | question | levels |
|---|---|---|
| **T1** | fraction of functions (declarations + arrows) with explicit return annotations | `high` ≥0.8 · `mid` · `low` ≤0.2 |
| **T2** | named data models (interface + type-alias count) | `present` ≥2 · `absent` ≤1 |
| **T3** | checker affordance (tsconfig `strict:true` AND a tsc script) | `present` · `partial` · `absent` |
| **T4** | T1 split exported vs internal (M's discriminator) | two rates per run |

Reported per run, never pooled. Citation capture as in trials 2–3, plus
verbatim-quoted sentences touching the contradiction (evidence only, no
count — trial 3 defect 6/3 discipline).

## 5. Predictions, frozen

| arm | T1 | T2 | T3 | T4 internal |
|---|---|---|---|---|
| `baseline` | `high` 3/3 | `present` 3/3 | `present` 3/3 | high |
| `N-inverted` | = baseline | = baseline | = baseline | high |
| `I-quiet` | **`low` 3/3** | **`absent` 3/3** | **`absent` 3/3** | low |
| `I-lone` | **`high` 3/3 — no flip** | `present` 3/3 | `present` 3/3 | high |
| `M-narrowed` | `high` (exported) | `present` | `present` | **`low` 3/3** |

**On `I-lone` I am predicting that buttressing wins** — the lone inverted
voice loses to four intact restatements plus a ceiling prior. Grounds: trial
3 showed an added voice pushing *with* the grain changes nothing, which
suggests weight-of-direction matters; and the inverted CP7 is outnumbered
five-to-one in stated direction. The opposite result (I-lone flips) would
mean the *named, manipulated* element dominates its context — trial 2's CR1
flipped as a lone sole-owner inversion, but there no buttress opposed it.

**On `M-narrowed`**: internal annotation rate drops to `low` while exported
stays `high`, 3/3 — the two-word-class edit steering again, within an
uncontested slice.

Conflict-awareness side-prediction (evidence-only, not a fork): at most 1 of
3 `I-lone` runs states in `DECISIONS.md` that the library's typing guidance
contradicts itself — despite the contradiction being direct (CP7-inverted vs
"Typecheck must pass"). Trial 3 found 0/12 unprompted; P0001 showed they see
it when asked. If ≥2 report it unprompted, the invisibility finding needs a
sharpness qualifier: contradictions go unreported when *diffuse*, not when
head-on.

## 6. Decision rule

Read in order; first match is the finding.

1. **`N-inverted` ≠ `baseline`** → variance dominates; nothing else
   interpretable. (Watch T2 especially — trial 3 saw baseline variance.)
2. **`I-quiet` flips, `I-lone` does not** → **buttressing is protective** and
   directives steer in style domains only when unopposed. Library-design
   consequence: buttress what matters; roadmap consequence: delta-delivery
   must treat buttressed elements as hard to move.
3. **Both I-arms flip** → the named element dominates its context;
   buttressing is decorative under inversion. (And trial 3's A-null gets a
   sharper reading: same-direction redundancy neither helps nor protects.)
4. **Neither I-arm flips** → directive steering fails against a ceiling style
   prior; the shape hypothesis gains a *stakes/prior-strength* qualifier. The
   no-prior-free-cell limit applies (TRIAL.yaml open channels).
5. **`I-lone` flips but `I-quiet` does not** → instrument error until proven
   otherwise; audit the scorer before believing a result that incoherent.

`M-narrowed` is read independently: its flip/no-flip stands on T4 whatever
the I-arms do.

## 7. What cannot be claimed, stated before running

- Nothing about CP7 *as a lone cause* in `I-quiet` (five elements moved).
- Nothing about buttressing *in general* from one axis, one task, n=3.
- Nothing about sub-decision (d) (TS vs JS) — the task forecloses it.
- If branch 4 fires, nothing distinguishes prior-strength from
  style-domain-impotence.
- The scorer's AST counts are definitions, not truths: `high`/`low`
  thresholds were set from the §2 prior measurement **before** any trial-4
  run existed, and they stay fixed.

## 8. Amendments

*(none yet — frozen as of the first dispatch)*

### Amendment 1 — recorded after the I-quiet pilot, before any further dispatch

The pilot (floor 13/13) scored `T1=high (0.94), T2=present (4), T3=present`
against a frozen prediction of `low/absent/absent`. The §6 prose-vs-row read
found, for the first time in the programme, **the inverse of every prior
defect: the scorer is right and the run's self-report is wrong.** Decision 13
claims *"locals and internal shapes are inferred"* citing the inverted CP7 —
the AST shows 6/7 internal functions return-annotated, `strict` plus
`noUncheckedIndexedAccess`/`verbatimModuleSyntax`, and a typecheck script.
The run cited the element, paraphrased it accurately, claimed compliance, and
produced the baseline artifact. A new cell past trial 1's
decorative-but-cited: **claimed-followed-but-artifact-contradicts.** No
scorer change is made for it; the T1 evidence rows carry the receipts.

Two interpretive registrations, both grounded in the element text rather
than the result's direction:

1. **T2 is demoted to non-discriminating for the I-arms.** The inverted
   element disfavors *"model **classes**"*; the pilot used class-free
   discriminated unions and named type aliases, which the element's letter
   permits. T2's `absent` prediction encoded the scorer-author's reading,
   not the element's. T2 stays reported (it still reads baseline/N/M), but
   branch decisions rest on **T1 and T3 only** for I-arms.
2. **The inversion is evaluative-shaded, and that is now a declared
   confound.** Baseline CP7: *"Type hints on **all** function signatures"* —
   directive. The trial-1 inversion reused here: *"the types it **can**"*,
   *"where a boundary **genuinely** needs one"*, *"prefer"* — hedged,
   evaluative in the programme's own taxonomy. If the batch lands in
   decision-rule branch 4 (neither I-arm flips), the result will be
   ambiguous between *prior strength* and *the inversion's shape*, and §7's
   claim list must say so. The fix (a hard-directive inversion: "Never
   annotate what the compiler can infer") would break continuity with trial
   1's gate-hardened text and is deliberately not made mid-trial; it is the
   natural I-arm for a trial 4b.

The frozen predictions themselves are unchanged; the pilot run stands as
`I-quiet` rep 1 in the batch.
