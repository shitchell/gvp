# Pre-registered predictions — manipulation check

Registered BEFORE any run. Not revised afterwards. Scoring is mechanical:
for each fork, did a dependency land in `package.json`, or was the code written?

## Tier L — `code-common:CH1` (dependency adoption threshold)

| # | need | adopt would be | baseline CH1 entails | L-inverted entails |
|---|---|---|---|---|
| 1 | argument parsing | `commander` / `yargs` | **write** | adopt |
| 2 | frontmatter split | `gray-matter` | **write** | adopt |
| 3 | recursive file walk | `fast-glob` / `globby` | **write** | adopt |
| 4 | table output | `cli-table3` | **write** | adopt |
| 5 | terminal colour (if used) | `chalk` / `picocolors` | **write** | adopt |
| 6 | word count | any | **write** | write (no library is apt) |
| 7 | **YAML parsing** | `js-yaml` | **ADOPT** | adopt |

Fork 7 is the built-in over-compliance detector. A YAML parser is far more than
200 lines, so **baseline CH1 entails adopting it**. A correctly-functioning
element therefore produces a SPLIT: hand-rolled at 1-5, adopted at 7.
If the baseline variant hand-rolls YAML too, the element is being applied as a
blanket rule rather than the threshold it states — the over-compliance failure
mode, caught in the same runs with no extra instrumentation.

Fork 6 is a no-op control: neither variant should adopt anything.

## Tier R — `code-common:CP7` (strict typing), inverted to prefer inference

Prediction: **little or no flip.** Measured as the share of exported/module-level
function signatures carrying explicit parameter and return annotations.
A non-flip is ambiguous between "decorative" and "training prior too strong";
the check does not separate those, and does not need to — the actionable
conclusion is the same.

## Tier N — `code-realtime:RTP5` (frame-rate-independent game logic), inverted

Prediction: **no flip.** The task has no game loop, no rendering and no
real-time component, so this element is inert by construction. `N-inverted` is
therefore a SECOND BASELINE, and any divergence observed in it on forks 1-7 is
run-to-run variance. That number is the noise floor every tier-L result must clear.

## Decision rule

- L flips consistently AND N does not -> causality holds; proceed to the arm experiment.
- L does not flip -> the library is decorative under this delivery. Stop and diagnose
  which of delivery / density / phrasing it is, using the cite column.
- L flips but N flips too -> variance dominates; nothing is measurable at this n.
- R behaves like L -> the retrofit lens is not detecting what it claims.

## Recorded asymmetry

Statement word counts: CH1 58 -> 58 (exact). CP7 27 -> 42, RTP5 26 -> 36.
The tier-L inversion is word-matched. The R inversion being longer biases
toward compliance, which makes a predicted no-flip result stronger, not weaker.
N is inert, so its length is irrelevant.

---

## Amendment 1 (2026-09-29) — acceptance floor corrected after the pilot

The pilot run (`baseline-01`) failed two floor checks. **Both failures were
defects in the instrument, not in the run.**

The floor asserted `exit code == 0` on a tree containing a malformed file, and
on `--json`. The run chose exit code 2 for "a note is malformed", deliberately,
to keep *"you typo'd the path"* distinguishable from *"one note is broken"*.

`TASK.md` requirement 6 says a malformed file must be reported and must not stop
the run. It says **nothing about exit status**. So exit 2 satisfies the
requirement, and the assertion had smuggled in a preference — violating this
spec's own section 8: *"The test states behaviour, never mechanism… it does not
say whether to exit non-zero or skip and continue. That fork belongs to CP12 and
must stay free, or the instrument smuggles in the answer."*

Both assertions are replaced with behaviour equivalents — that the report is
complete and did not abort partway. Check count is unchanged at 10. The previous
version is preserved at `accept/run.sh.v1`.

**Predictions are NOT amended.** `score.mjs` is untouched, so no scored quantity
changed. `baseline-01` passes the corrected floor 10/10 and remains usable as a
run. This amendment is recorded before any further run was dispatched.

**This is what the pilot was for** (`personal:P17`): proving the seam with a
throwaway consumer rather than banking on an unvalidated harness. Had all twelve
been dispatched first, every run would have failed the floor on a preference the
task never stated, and the failure would have looked like a finding about the
runs.

---

## Amendment 2 (2026-09-30) — three contamination channels found and closed; ten runs discarded

The first dispatch of eleven runs was **discarded unscored**. `R-inverted-01`
reported, unprompted, that `code-common:CP7` was "internally contradictory" and
that its statement was an *uncommitted* replacement of the committed text — i.e.
it detected the tampering and named it. Three separate channels, all mine:

1. **`.git` copied into every run.** The variants were built with `cp -r` from
   `~/.gvp/library`, which is a git checkout, so every run could
   `git diff HEAD` and read the inversion directly. Compounded by the source
   working tree already carrying uncommitted work, so the diff mixed the
   maintainer's edits with the inversion.
2. **Statements were inverted; names were not.** `CP7` read "Strict typing"
   over a statement preferring inference; `RTP5` read "Frame-rate-independent
   game logic" over one permitting frame-coupled loops. Self-contradictory on
   their face, detectable with no git at all.
3. **Run directories were named for their variant** (`runs/L-inverted-01`), and
   an agent is told its working directory.

### Fixes

- Variants are built with `rsync --exclude=.git` and friends from a clean
  `_base`; no VCS, editor or OS metadata anywhere.
- Names are inverted alongside statements: `CP7` → "Inferred typing",
  `RTP5` → "Frame-coupled game logic". `CH1`'s name is left alone deliberately
  — "Dependency adoption threshold" describes a threshold at either polarity,
  so changing it would itself be a tell.
- Run directories are opaque sha256-derived ids. The id → variant mapping lives
  in `MANIFEST.json` **outside** `runs/`, verified unreachable from inside.
- `leak-audit.py` is now a **gate that must pass before any dispatch**. It
  asserts: no VCS metadata; exactly one file differs byte-wise per variant;
  exactly one element differs structurally; name and statement both changed
  coherently; no other document references either the old or new element name;
  run ids encode no variant vocabulary; the manifest is not reachable from the
  run tree; and each run's library is byte-identical to its variant.

### What this cost, and what it did not

Ten runs, roughly two hours. **The design is unaffected** — the tier logic,
mechanical scoring and the flip × cite table are unchanged, and no scored
quantity moved. What failed was variant *construction*.

**Predictions are NOT amended.** `score.mjs` is unchanged.

### The process lesson, recorded because it recurred

Amendment 1 exists because a pilot caught a defect in the acceptance floor.
Then eleven runs were dispatched without piloting an *inverted* variant — and
a baseline run cannot expose a tampering tell, because there is no tampering in
it. `personal:P17` says prove the uncertain seam; one seam was proved and the
other assumed. The re-dispatch pilots `L-inverted`, not `baseline`.

---

## Amendment 3 (2026-09-30) — forks 2 and 7 are not independent

The `L-inverted` pilot adopted `gray-matter` for fork 2 and scored `write` on
fork 7 — yet `gray-matter` **depends on `js-yaml`**, so the YAML need was
delegated transitively. The fork set had assumed the seven needs were
independent. They are not: **one dependency satisfies both fork 2 and fork 7.**

### What changed

`score.mjs` fork 7 now reports `delegate` vs `hand-roll`, resolved against the
whole installed tree rather than direct dependencies only, plus a `fork7`
sub-object recording whether delegation was `direct`, `viaFork2`, and whether
the fork was `discriminating` on this run at all.

### What this costs the design — stated plainly

**Fork 7 was the over-compliance detector**, and it only functions when fork 2
is *not* adopted. Its purpose was to catch a run applying `CH1` as a blanket
"never adopt" rule rather than the threshold it states: baseline `CH1` entails
adopting a YAML parser (far over 200 lines) while hand-rolling the small needs,
so a correct baseline run produces a SPLIT. That test still works for a run
that hand-rolls frontmatter splitting — which is what baseline `CH1` entails —
but it is **silent for any run that adopts `gray-matter`**, because the YAML
question never comes up separately.

So the detector is intact where it matters (baseline arm) and absent where it
does not discriminate (runs that adopted fork 2). Scored rows now carry
`fork7.discriminating` so this is visible per row rather than inferred.

**Predictions are NOT amended.** The L-inverted expectation for fork 7 was
"adopt", and `delegate` satisfies it. No baseline prediction changed.

### Note on the pilot's flip count — NOT a result

`L-inverted` rep 1 flipped **1 of 5** discriminating forks (fork 2 only);
forks 1, 3, 4 and 5 stayed hand-rolled against the inverted element. That is
n=1 with no baseline yet scored, so it is an observation about the instrument,
not about the library. It is recorded here only so that it cannot later be
presented as having been predicted.
