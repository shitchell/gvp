# Guiding-Element Review — who reviews what

The single most load-bearing rule of working in a GVP library, and the one most often gotten
wrong. Encoded as guiding elements `personal:P15` + `personal:H5` (published in `gvp-docs`).

## The distinction

**Guiding elements** = goals, values, constraints, principles, heuristics, rules. They are the
things that *guide*. **Decisions are NOT guiding elements** — a decision is the *guided output*, the
thing the guiding elements produce. (Milestones and refs aren't guiding elements either.)

So "the human reviews the guiding-element patch, not the diff" does **not** mean "the human reviews
the decisions." It means the human reviews **goals/values/constraints/principles/heuristics/rules**.

## The review model (`personal:P15`)

> Humans review guiding elements, not decisions.

A decision that follows **unambiguously** from the existing guiding elements is correct by
construction — it needs **no human review**. Human review attention is a scarce, high-leverage
resource: it belongs on the guidance that determines *all future* decisions, not on each individual
decision that guidance yields. Surfacing decisions for approval one by one defeats the entire point
of building the library (`personal:G1` — systems that align with intent without constant oversight).

## The operational gate (`personal:H5`)

When a decision is needed, run this gate:

```
Do the existing guiding elements yield a SINGLE reasonable decision?
├─ YES → record the decision, cite the element(s) it follows from, proceed. No human review.
└─ NO (multiple reasonable decisions) →
     1. weigh the options against the existing guidance,
     2. select one,
     3. AUTHOR the new guiding element(s) (a GVP patch) that make the selected
        decision the unambiguous result next time,
     4. surface THAT guiding-element patch — not the decision — for human review,
     5. on approval, apply it; the decision now follows unambiguously.
```

The deliverable when guidance is silent or ambiguous is **a guiding-element patch**, never "please
bless this decision." If you find yourself asking a human to approve a decision, stop: either it
already follows from guidance (just cite it) or you owe a guiding-element patch that makes it follow.

## In the full-traceability workflow

This refines step 2 ("Review the Design Doc") and the human-in-the-loop points:
- The agent translates ambiguity into **new guiding elements**, drafts them as a patch
  (`cairn import --dry-run`), and that patch is the review surface.
- Decisions (`D…`) are then added freely as the unambiguous consequence — they do not gate on human
  review (they remain fully traceable via `maps_to`, and a human *can* inspect them, but approval is
  not required).
- Net effect: the human's review queue is small and stable (the guidance), while decisions scale
  freely underneath it.

## Common failure mode (worth naming)

Calling a batch of new **decisions** "the guiding-element patch" and asking the human to review them.
That is reviewing the output, not the guidance. If the decisions were unambiguous, no review was
needed; if they were not, the missing artifact is the guiding element(s) that disambiguate them.
