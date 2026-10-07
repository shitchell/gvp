---
id: 0017
status: open
opened: 2026-10-07
spawned_by: trial-5 design (axis re-enumeration)
tested_by: [trial-5]
tags: [delivery, self-reference, elements-as-claims]
---

# The library states trial 5's hypothesis as one of its own principles

The declaration-time re-enumeration for trial 5 turned up something the axis
survey had no reason to flag, because it is not a contest — it is the library
predicting the experiment's result:

> `ai-common:C3` — **Token-distance recall is lossy.** "the further information
> sits from its point of use, the less reliably it is applied. This is an
> architectural property of context windows, not a tuning problem."

> `ai-common:P3` — **Deliver context at the point of use (read-on-demand).**
> "Because recall degrades with token distance, deliver information at the
> moment the agent will act on it rather than when it first becomes available.
> Prefer read-on-demand retrieval over front-loading context that must survive
> an indeterminate distance to its point of use."

Trial 5's L0/L1/L2 arms are exactly a test of P3. Three consequences:

1. **Not a structural confound.** Both elements are present and unmodified in
   every arm, so neither can produce a between-arm difference. It is an
   interpretive one: an L2 run receives bind-time delivery while holding a
   library that endorses bind-time delivery.
2. **A new category of element.** P3 and C3 are *empirical claims about agents*,
   not preferences about code. They are the first elements the programme can
   test directly rather than use as instruments — and the shape taxonomy
   (directive/evaluative) does not describe them at all. A principle that
   asserts a fact is falsifiable; a principle that asserts a preference is not.
   Does that distinction belong in `cairn`'s categories? Compare musing 0013
   (elements have threat models) — same instinct, different axis.
3. **If L2 does not out-steer L0, the library contains a false element.** And
   the honest consequence is a patch to P3, not a footnote. That is the first
   case in the programme where a trial result would oblige a library edit rather
   than merely inform one — and `PA-15` has adoption parked until exactly these
   numbers exist, so the sequencing is already right.

**How to test:** trial 5 as declared. A sharper follow-up: P3's strong form says
*prefer* read-on-demand over front-loading; `L1 ≈ L2 > L0` would falsify the
strong form while leaving C3 intact, since C3 only claims recall degrades with
distance, not that any practical distance is fatal.
