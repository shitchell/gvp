# Reconstruction as a measuring instrument

> **Status:** design, not run. **Written:** 2026-09-23.
> **Prior art — this is not a new technique.** It is the GVP reconstruction loop,
> invented ad hoc on the **threshold** project and written up at
> `~/code/git/github.com/shitchell/ai-infra/skill/reference/gvp-reconstruction.md`,
> with a working implementation at `ai-infra/workflows/gvp-convergence.mjs`.
> This document changes what it is *used for*, not how it works.
>
> **Companions:** `2026-09-23-manipulation-check.md` (the gate) and
> `~/GVP-EXPERIMENT-DESIGN-2026-09-23.md` (the arm experiment).

---

## 1. The technique, and the one thing being changed

The original framing:

> **Can the library alone regenerate the project?**
>
> *If a competent engineer, given only the goals, values, principles and
> decisions, can describe what to build in exhaustive detail — the library is
> doing its job. Everywhere they have to guess is a gap, and the guess itself
> names the missing element.*

Two agents: **A**, the reconstructor, sees only `.gvp/` and describes the whole
project, flagging every guess. **B**, the comparator, sees A's report *and* the
real project, diffs them, and emits a patch.

**The change is the direction of causation.** As documented, the loop is a
library **builder**: diff, patch, repeat until converged. Used as an instrument
it becomes a **comparator between libraries**:

| | as documented (builder) | as instrument |
|---|---|---|
| library | patched each round | **frozen** |
| B's output | a patch to apply | a **score**, applied to nothing |
| loop | until converged | **one round**, N times per arm |
| varies | the library | the **arm** |
| ground truth | the project | the project (unchanged) |

Everything else — A's blindness, the gap taxonomy, the decision-consequence
bound — carries over untouched. **A must stay blind.** Only `.gvp/`; not the
README, not the code, not the design docs. The restriction *is* the test.

## 2. Why this is worth having

Three reasons, in increasing order of importance.

### 2.1 It is cheap, so n can be large

**A describes the project; it does not build it.** One agent, one report, per
run. Compare with the arm experiment, which builds the project 12 times.

That changes what is affordable: n=10 per arm rather than n=3. Since the arm
experiment's own §5 concedes *"the effect being measured is plausibly smaller
than the run-to-run variance"*, buying an order of magnitude more samples for a
fraction of the tokens is the single largest practical gain available.

**The tradeoff, stated plainly: this measures *stated* decisions, not *enacted*
ones.** An agent can describe the right architecture and then build something
else. Reconstruction measures intent; the manipulation check measures behaviour.
Neither substitutes for the other, and a divergence between them would itself be
a finding worth having.

### 2.2 It puts a number on the redundancy null

The gap taxonomy already contains the category that matters most:

> `guessed-correctly-but-unsupported` — *arrived at by inference, not from an
> element. **Still a gap** — the next reader may guess differently.*

That **is** the arm experiment's §7 control #4 — *"the model may already produce
Shaun's preferences without any library"* — made countable. The arm experiment
can only detect it as a tie in a blind ranking at n=3. Here:

- **Arm 0's entire score is that one category.** With no library, every correct
  item is a guess. So arm 0's accuracy *is the model's prior*, measured directly.
- Every arm above it measures **marginal library contribution** against that
  baseline, as a number rather than a ranking.

It is also the same distinction as the manipulation check's *no-flip + no-cite*
cell, arrived at independently — weak but real evidence that the distinction is
a property of the problem rather than an artifact of one table.

### 2.3 It reaches the trajectory question the other designs cannot afford

The arm experiment's §2b argues that the failure mode most worth catching —
locally-optimal decisions accumulating into a globally-wrong result, *"flat,
monolithic files that cannot be maintained as a project grows"* — only appears
with accumulation. The manipulation check is single-session and explicitly
cannot see it (its §9). The arm experiment cannot afford a project large enough
to show it, because it builds that project 12 times.

**Reconstruction breaks that constraint, because the reference is built once.**
A large project with real architectural history can serve as ground truth for
arbitrarily many cheap reconstructions. And the trajectory question becomes
directly observable: does the reconstructor describe a modular architecture, or
does it describe a flat one? That is `§2b` as a scoreable item.

This is the strongest argument for the technique and the reason to invest in a
good reference project rather than a convenient one.

## 3. The reference project

### Requirements

1. **Documented what / how / why per fork.** The why-list *is* the fork sheet the
   arm experiment's §6 asks for — and it is a better one, because the forks were
   *discovered by building* rather than imagined in advance. §6's own rule
   (*"a fork identified after the run is not evidence"*) is satisfied honestly:
   the forks predate every measured run, they just postdate the reference build.
2. **Large enough to have a trajectory** (per §2.3). This is where the budget
   should go.
3. **It must actually work** — built, tested, exercised. A reference that was
   never run encodes intentions, not decisions.

### The trap, and it is fatal if ignored

**If the reference is agent-built *and* agent-adjudicated, distance-to-reference
measures agreement-with-model, and arm 0 wins by construction.** The instrument
would then report that the library adds nothing — not because it adds nothing,
but because the target was defined by the thing arm 0 already is.

The mitigation is already doctrine, as stage 1 of the five-stage pipeline:

> *Stage 1 is not a formality. The most expensive failure observed in this system
> came from starting work before anyone had agreed what the project should be —
> and no amount of downstream machinery recovers from that.*

**Concretely: the human adjudicates the forks.** The agent may build and may
draft the rationale, but each documented fork needs a human ruling on which way
it went and why. Un-adjudicated forks are excluded from scoring rather than
scored on the agent's say-so.

### What this makes the claim

> **Can a library let a fresh agent one-shot what a human and an agent only
> reached after exploring?**

That is exploration compression, and it is a sharper statement of the underlying
intuition: the expectation placed on an agent is usually *"give me the end
product I would have built after I gathered more data, worked through the
unknowns, and adjusted"* — which is a hefty ask precisely because the adjusting
is where the guidance lives. The library is a bet that the adjusting can be
front-loaded.

## 4. Scoring

For each human-adjudicated fork in the reference, classify the reconstruction:

| outcome | meaning |
|---|---|
| **`derived`** | matched the reference **and** cited the element chain that yields it |
| **`guessed`** | matched, with no element support — flagged by A as a guess |
| **`missing`** | not addressed, or flagged as an unresolvable guess |
| **`wrong`** | the library led it to a different and worse answer |
| **`diverged-justified`** | different, defensibly better — see §5 |

Two metrics, and **both are needed because either alone lies**:

- **Accuracy** = `(derived + guessed + diverged-justified) / forks`.
  *Marginal contribution* = accuracy(arm N) − accuracy(arm 0).
- **Derived rate** = `derived / (derived + guessed)`. How much of the arm's
  accuracy is attributable to the library rather than coincident with the prior.

The diagnostic that falls out:

| | **high accuracy delta** | **~zero accuracy delta** |
|---|---|---|
| **high derived rate** | the library is working | **decorative-but-cited** — elements credited for what the prior already supplied |
| **low derived rate** | the library helped without being cited — check delivery | the library is inert |

The top-right cell is over-compliance, and it is invisible to either metric
alone. It is the same failure the manipulation check catches via *no-flip +
cite*; two independent instruments pointing at one failure mode is worth the
redundancy.

**Bound the scoring** with the rule the original loop already carries: *grade
every gap by decision consequence — would an implementer who believed the
reconstruction build something different? A gap with no consequence is not a
gap.* Without it, scoring chases infinite detail and never terminates.

**Also record `over-specified`** — *"the library carries an implementation
decision dressed as guidance"*. It is not a reconstruction outcome but a library
defect the reconstruction surfaces for free, and it is the direct detector for
elements like *"Principle: Use NodeJS TypeScript with Bun.Secrets…"* that fail
all three of the convergence loop's specificity tests
(`gvp-convergence.mjs:183-185`).

## 5. When the reconstruction beats the reference

Distance-to-reference punishes being right in a way the reference was not. The
`diverged-justified` bucket handles it: the reconstruction differs, and its
rationale is at least as good.

This is **not a library defect — it is a reference defect**, and it is the same
free retrospective input the manipulation check's §8(3) describes. Record it
against the reference, not against the arm.

**Honest cost:** "at least as good" is a human taste judgment, the only one in
the scoring loop. It should be rare — most divergences will be plain gaps — so
the cost is bounded, but it is real and should not be hidden behind the
otherwise-mechanical rubric.

## 6. Where this sits

| | measures | cost | answers |
|---|---|---|---|
| **manipulation check** | enacted behaviour, one element | 12 small builds | do elements drive outcomes *at all*? |
| **reconstruction** | stated intent, whole library | 1 reference + N cheap runs | how much does the library add over the prior? |
| **arm experiment** | enacted behaviour, whole library | 12 builds | does it produce better work? |

**Order: manipulation check first.** `ai-infra`'s `F-08 · Mechanism before
value` — *"building the measuring apparatus before there is anything to
measure"* — applies to this document as much as to the arm experiment. If
elements do not drive outcomes, a reference project is an expensive way to learn
nothing.

**But reconstruction should come second, ahead of the arm experiment**, because
it is cheaper per sample, it answers the redundancy null with a number, and it
can reach the trajectory question. The arm experiment is the most expensive
instrument for the least statistical power and should run last, if at all.

**Cross-reference — a second manipulation-check target.** `personal:P6`
(*decompose rationale to its most domain-agnostic element*) governs exactly the
over-specification problem §4 records. Invert it and see whether element-authoring
behaviour changes. If it does not, P6 is decorative and the fix is mechanical,
not textual — which is what `personal:P7`, `personal:C2` and `code-common:CP10`
jointly predict.

## 7. What to build

1. **Make `alsoConstrains` a `cairn validate` check.** It is currently
   schema-required inside `gvp-convergence.mjs` (`:98`) and violations are
   counted (`:207`, `:230`) — but **surfaced, not rejected**. Nothing enforces it
   for libraries authored any other way. This is the smallest high-value change
   available and it is independently useful whether or not any experiment runs.
2. **A reconstructor harness**: freeze a library, run A blind against it, emit
   the report. Mostly a fork of `gvp-convergence.mjs` with the patch loop removed.
3. **A scorer**: B, against a fixed adjudicated fork sheet, emitting the §4
   classification rather than a patch.
4. **The reference project** — the expensive item, and the one to choose
   carefully. Deferred until the manipulation check reports.

## 8. Honest limits

- Measures **what an agent says it would build**, not what it builds.
- The reference defines "good", so a bad reference silently defines bad as good.
  §3's adjudication requirement is the only defence and it is a human bottleneck.
- A blind reconstructor may describe the reference correctly for reasons
  unrelated to the elements it cites; citation is evidence, not proof. The
  manipulation check is what converts correlation into causation, which is
  another reason it runs first.
