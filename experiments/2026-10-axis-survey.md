# Axis-ownership survey — who else speaks when an element speaks

> **Performed:** 2026-10-06, by manual read of all **102 active elements** in
> the personal library (`cairn query --format compact`, cairn 5.1.0).
> **Why:** protocol §9 item 2c — trial 3 found ten voices on one axis and
> concluded that axis ownership must be checked *before* any element is
> manipulated, because byte-wise one-element is not semantically one-element.
> **Method:** an *axis* is a question an element answers (e.g. "build a seam
> for a feature with no concrete use case?"). An element is a *voice* on an
> axis if its text entails an answer. Judged from statements, not tags or
> keywords — §5 records why keyword scans are not sufficient, with the miss
> that proves it.

---

## 1. Headline numbers

| classification | axes | distinct elements |
|---|---|---|
| **contested** — voices entail opposing answers | **5** | **20** (~20% of the library) |
| **reconciled** — opposing pull, but a voice carries an explicit resolution | 2 | 15 |
| **buttressed** — multiple voices, same position, deliberate | ~7 | ~22 |
| **owned** — effectively one voice on the question | ~40 | the rest |

The contested fifth is not random: it is **the design-philosophy core** —
simplicity, flexibility, reuse, deferral, interface surface. These are also
the elements agents actually consult on a design task (trial 3's runs cited
2–5 axis elements each, all from this cluster). **The library is most
contested exactly where it is most used.**

## 2. The contested axes

### A1 — build a seam for a speculative need? *(trial 3's axis, and bigger than declared)*

| toward seams | toward deferral | mediating |
|---|---|---|
| `V7` optionality · `P17` build uncertain seams · `P21` many early flex points · `H3` build on cost asymmetry · `CP15` persistence seam · **`CP5` config infrastructure early** · **`CP6` proactive reusability** | `V1` simplicity · `P5` no speculative planning · `H1` extraction timing · `CH2` deferral tree | `P1` |

**13 voices — trial 3 declared 10.** `CP5` (*"wire up configuration from the
start rather than hardcoding"*) and `CP6` (*"write code as if it will be
reused, even when unsure — parameterize functions, extract logic that could
serve other purposes"*) are pro-seam voices the trial's keyword scan missed.
The pilot run even cited `CP5` for its seam decision, in plain sight in a
quote trial 3's own FINDINGS reproduces. Recorded as trial 3 **defect 4**
(§5 below; FINDINGS §6 amended).

### A2 — expose it as a user-facing option?

`V4` (*"the system provides options and defaults; the user decides"*), `P21`,
`CP5` **for** · `P8` (consolidated interfaces, fewer entry points), `CP11`
(every flag/config key is a commitment) **against** · `H7` bounding both
directions. Six voices. Overlaps A1 but asks a different question — trial 3's
pilot answered them *differently* (build the seam, withhold the flag), which
is evidence agents treat them as distinct axes too.

### A3 — generic mechanism or minimal fix?

`P4` (*"prefer building a generic mechanism that handles the class... special-
case fixes accumulate"*) and `CP6` **for** · `V1` (*"every generalization
should solve a real problem, not a hypothetical one"*) **against**. `P4`'s
trigger (a real failure occurred) softens the contest but does not resolve it:
an agent holding a concrete bug gets opposite pulls on how widely to fix it.

### A4 — extract shared logic now, or wait?

**The sharpest textual contradiction in the library:**

> *"If you find yourself writing similar code twice, you should have extracted
> it the first time."* — `CP6`

> *"Wait until a second consumer forces the design. Do not create shared
> abstractions before a real shared need exists AND the boundary is
> empirically clear."* — `H1`

With `V3` (DRY) and `CP4` (centralize shared logic) on `CP6`'s side. Four
voices, no tie-break anywhere.

### A5 — change locality vs deduplication *(edge case)*

`CP1` (one contiguous block; scattering is structural failure) vs `CP4`
(extract duplicates into one function — which scatters the feature across
call sites). Two voices; a genuine fork when a change exists in two places.

## 3. The reconciled axes — the library already knows the trial-3 fix

Two axes carry opposing pull **and an explicit resolution**, authored long
before trial 3 demonstrated that tie-breaks steer:

- **Unknown/invalid data:** `V5`/`R2`/`RTR2` (never silently discard) vs
  `WR2` (drop bad messages) — resolved by `WP2`: *"Unknown fields may be
  preserved **(per V5)** but must not be executed."*
- **Verify everything vs ship reversibly:** `R1`/`P2`/`P13`/`TP1-3`/`TH1`
  vs `H8` — `H8` carries its own protocol: *"Record that the validation was
  priced and declined, and what would trigger doing it after all."*

These two are the native proof that the trial-3 pattern (name the conflict,
resolve it in-text) is already this library's idiom when the author *saw* the
conflict. The five contested axes are the ones nobody saw — which is the
case for `cairn axes` existing (roadmap 4.1).

## 4. Shape × ownership — what this means for the programme

**The good news first: trials 1 and 2 survive retroactive inspection.**

- `CR1` (trial 2): sole owner, confirmed — no other element states a position
  on where secrets live. Clean attribution stands.
- `CH1` (trial 1): effectively owned. The adopt-vs-write question has only
  weak adjacent voices (`V1` generally; `ai-common:P2`'s "prefer tools with
  deeper AI training data *when the choice is otherwise even*"; `CP16` on
  language, not libraries). The null result is **not** explained by
  contestation — the evaluative-phrasing explanation stands.

So the shape hypothesis's two data points both sat on owned axes, and the
trial-1-vs-trial-2 contrast is the owned-axis shape comparison we feared we
didn't have. **The worry that trials 1–2 "measured contested axes without
knowing it" is resolved: they didn't.**

**The complication:** shape and ownership are correlated in this library. The
owned axes skew directive (`CR1`, `CR2`, `R1`, `R2`, `WR1-2`, `RTR1-2`,
`CP7`, `RTP5-7`); the evaluative elements cluster on the contested
design-philosophy core (`CH2`, `H1`, `H3`, `P1`...). That is probably not an
authoring accident: **elements are evaluative where the territory is
genuinely contested** — the fuzziness lives in the domain. `docs/philosophy.md`
calls the fuzzy categories deliberate; this is what that looks like
empirically.

**Trial 4 recommendation: `code-common:CP7` (strict typing).**

- **directive** — "Type hints on all function signatures. TypeScript over
  JavaScript." No weighing, no branch.
- **owned** — `CP3` (explicit over implicit) gives weak support; nothing
  opposes; no tag gloss states its position (checked — `maintainability`'s
  "testability" is the nearest word and is not a typing position).
- **prior-neutral** — unlike `CR1`, both polarities are ordinary professional
  practice (strict annotation vs inference-first are both mainstream), so the
  confound trial 2 needed `M-narrowed` to dodge does not exist at all here.
- **mechanically observable** — annotations on signatures, `tsconfig`
  strictness flags, `any` density: all countable from the artifact; the
  tone-matched inversion ("Inferred typing — annotate only where inference
  fails") was already drafted as trial 1's `R-inverted` arm text.

If `CP7` steers, trial 2 generalises beyond safety-adjacent rules with the
cleanest inversion the programme has had. If it does not, the shape hypothesis
needs a qualifier about *stakes*, which would be just as informative.

The queue's other candidates, re-read under ownership: `personal:H5` and
`code-testing:TH1` sit in aligned multi-voice clusters (delegation;
testing) — testable, but attribution would need the trial-3 caveat. `V5`
(values tier) sits on a **reconciled** axis, which is actually interesting in
its own right: manipulating `V5` tests whether a *value* steers when a
downstream principle (`WP2`) cites it by id.

## 5. Why `cairn axes` cannot be a keyword scan *(trial 3, defect 4)*

Trial 3's gate asserted "the set of elements on the axis is exactly the
declared set" — using a keyword list (`flex point|seam|speculat|defer|…`).
It passed, and it was wrong: `CP5` and `CP6` are pro-seam voices that use
none of those words (*"wire up configuration from the start"*, *"write code
as if it will be reused"*). The miss was found by this survey's full read,
not by any scan — and the pilot run had already cited `CP5` for its seam
decision, so the evidence was sitting in trial 3's own quotes.

Consequences, recorded in trial 3's FINDINGS as defect 4:

- trial 3's "nine contradicting voices" is **eleven, plus `P1` mediating**.
  No conclusion changes — both missed voices are pro-seam, which *further*
  explains `A-decisive`'s null (the prevailing direction was even stronger
  than declared) and leaves `D-decisive`'s against-the-grain steer intact.
- **the same lesson as protocol §6, now at the library layer:** a keyword
  list enumerates the forms an axis can take; it cannot be completed. A real
  `cairn axes` needs semantic matching (embeddings — the T2 gap — or an agent
  pass), with keyword scans demoted to a cheap first filter.
- the survey took one sitting for 102 elements. That is the cost ceiling an
  agent-pass implementation competes with, and it is low — but it does not
  scale to re-running on every import, which is exactly when an axis check
  pays for itself. The tool earns its place at the margin the human won't
  re-walk.

## 6. Standing results for the programme

1. **Ownership is now checked, library-wide, once.** Future trials pick
   candidates from this table instead of re-deriving; the table goes stale on
   every import touching the design core, which is a reason for 4.1, not for
   re-surveys.
2. **Buttressing is a design pattern here, not an accident** — rule+principle
   pairs stating one position (`WP1`+`WR1`, `RTP1/3`+`RTR1`, `P10`+`CP14`).
   An axes tool must separate *same-direction redundancy* (fine, deliberate)
   from *opposing positions* (the hazard). Direction, not co-occurrence.
3. **Tie-breaks are already the native idiom for seen conflicts** (`WP2`,
   `H8`). The contested five are unseen conflicts. The actionable retrospective
   edit — per trial 3 — is an against-the-grain tie-break on whichever side
   of each axis the agents currently override; A4 (`CP6` vs `H1`) is the
   sharpest candidate and the cheapest to settle by decree.

## 7. Post-report corrections — found by probe P0001, 2026-10-06

*(Same precedent as trial 3's defect 4: enumeration corrections are recorded,
attributed, and the original numbers left visible above.)*

A fresh agent, prompted for internal tensions and blind to this survey
(`lab/probes/0001-prompted-contradiction-detection.md`), recovered 6 of the 7
axes above, produced no clear false positive — **and found what this survey
missed:**

- **A1 gains a thirteenth voice:** `P19` — *"implement low-effort,
  high-information signals… even when it is not certain they will be
  immediately useful"* — pro-build, scoped to signal-shaped features.
- **Three contested axes this survey did not see:**
  - **A6 — rigor allocation:** `TP1` ("all code") + `CP7` ("all function
    signatures") + `P9` (uniformity) vs `P16` (*"let leaf or disposable
    components be built more loosely"*). No element carves the exception.
  - **A7 — rename vs commitment:** `ai-common:P2`/`C2` + `CP8` (remove
    misleading names) vs `CP11` (a renamed flag is the named breaking case).
  - **A8 — scaffolding sign-off:** `CR2` (*"explicit, verbatim, quoted
    verification from the user… No exceptions"*) vs `H5` (*"never ask 'go or
    no go'"*), `P15`, and `P17` (*"even with a throwaway consumer"* — the
    exact artifact CR2 forbids). The sharpest miss, and operationally live
    for any agent working under this library.
- **Four mild-friction axes noted:** `RTP7` vs `CP3` (scratch mutation vs no
  hidden state); `P7`/`CP10` vs `V4` (auto-enforcement vs opt-in); `H2` vs
  `H6`/`P15` (user-facing delegation — §2 had flagged it as "edge"); `CP5`
  vs `V6` (zero-config default vs no privileged frame).

**Corrected headline: 8 contested axes, ~30 elements (~29%).** §1's table is
left as written; this section is the diff.

The meta-result outranks the numbers: keyword scan (10 voices on A1) <
manual survey (12, 5 contested axes) < prompted agent pass (13, 8 + 4 mild).
**Single-pass enumeration undercounts regardless of who enumerates** — this
survey corrected trial 3 and has now been corrected the same way. `cairn
axes` (§5) should be an agent pass with independent re-enumeration, keywords
demoted to a pre-filter; and the §1-level claim worth keeping is unchanged in
direction but stronger: the library is more contested than any single reader
concludes.
