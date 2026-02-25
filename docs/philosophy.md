# Philosophy: On Fuzzy Boundaries

GVP's categories are tools for thinking, not rigid taxonomies. The boundaries between them are intentionally fuzzy — and that's a feature, not a bug. This document discusses the areas where categories overlap and why precise categorization matters less than you might think.

## Goals vs. Values

Goals and values are tightly coupled. They co-evolve, and sometimes it's genuinely hard to tell where one ends and the other begins.

**The working distinction:**

- A **goal** is a target state of a system — the world, a person, a project. It's quantifiable, even if broadly: "end homelessness," "ship v1," "reduce page load time to under 2 seconds."
- A **value** is a subjective quality you favor. It shapes how you make trade-offs but doesn't prescribe a specific target: "reliability," "compassion," "simplicity."

**Where it gets fuzzy:**

"We want to end homelessness" — is that a goal or a value? You can break it apart: the goal is "zero people without shelter" (a measurable state), and the values behind it might be "compassion" or "reducing suffering" (qualities you care about). But the two are deeply entangled.

You likely wouldn't have a goal of ending homelessness unless you already held values aligned with it. And sometimes goals come first — social pressure, ambition, curiosity — and values shift to support them over time. A goal adopted for shallow reasons can, through the work of pursuing it, reshape your values into genuine alignment.

**Why it doesn't matter (much):**

Since every non-root element must trace to both a goal and a value, the framework forces you to articulate both sides even when they feel like the same thing. You don't need to split the atom perfectly — you just need to name the destination (goal) and the quality that makes it worth pursuing (value). If you're wrong about which is which, the traceability graph still works.

The real value of distinguishing them is conceptual clarity for yourself. Goals are things you can check off. Values are things you hold. The same underlying motivation often produces one of each.

## Values vs. Principles

Values describe what you *care about*. Principles describe what you *do about it*.

- **Value:** "Reliability" — a quality you favor.
- **Principle:** "Fail loudly" — an actionable bias that operationalizes the value.

The boundary is fuzzy because some statements sit in between: "prefer simplicity" could be a value (you care about simplicity) or a principle (when faced with two approaches, pick the simpler one). In practice, if it tells you what to *do* when facing a decision, it's a principle. If it describes a *quality* you want but doesn't prescribe action, it's a value.

Principles can be thought of as flexible rules — guidelines that carry weight but allow judgment. Ideally, principles with enough supporting evidence eventually evolve into heuristics (formalized decision procedures) or rules (hard stops). But many principles remain principles forever, and that's fine.

## The Spectrum

The categories form a rough spectrum from fuzzy to precise:

```
values → principles → heuristics → rules
(fuzzy)                          (precise)
```

Values are the most abstract — they describe qualities, not actions. Principles add directionality ("prefer X"). Heuristics add structure ("if A, then B; else C"). Rules remove ambiguity entirely ("never do X").

Goals sit orthogonally — they're about *where you're going*, while the spectrum above is about *how you get there*. Design choices, milestones, and constraints are more concrete and contextual, tied to specific projects or implementations rather than enduring beliefs.

## Why This Matters

The fuzzy boundaries are a feature because GVP is a tool for *review and alignment*, not classification. The point isn't to categorize perfectly — it's to:

1. **Make your reasoning explicit.** Even imperfect categorization is better than implicit assumptions.
2. **Surface contradictions.** When you trace everything to goals and values, conflicts become visible.
3. **Enable review.** When circumstances change, you can walk the graph and ask: "Does this still hold? Does this still serve the goal it claims to?"
4. **Encourage honesty.** The framework works best when you're honest about your actual motivations, even when they're messy or contradictory.

If you're spending more time debating whether something is a goal or a value than actually documenting it, pick one and move on. The traceability graph will catch any real alignment problems regardless.

## The Framework Serves Alignment, Not People

GVP is not designed to serve humans. It is designed to serve alignment, coherency, and internal consistency. Where those goals happen to align with the people using the tool, the tool will feel helpful. Where they don't — where a user resists introspection, or where stated values conflict with actual behavior — the framework will create friction. That friction is not a bug.

This distinction matters because "serve the user" is a common default that subtly undermines the framework's purpose. A tool that serves the user would minimize discomfort, skip hard questions, and rubber-stamp reviews. A tool that serves alignment forces you to articulate your reasoning, surface contradictions, and confront drift between what you say and what you do.

In a shared environment where multiple actors control different parts of the GVP store, the framework does not take sides. It surfaces misalignment between those actors' stated goals and values. Whether that misalignment gets resolved — and in whose favor — is a human decision the framework does not make. It only makes the disagreement visible.

The framework is useful to people who share its core values: alignment, coherency, honesty. For those who don't, it may feel like unnecessary overhead. That's an acceptable trade-off.

## Introspection Is Hard — And Worth It

Many people — including experienced professionals — find it difficult or pointless to analyze their own decision-making process. They prefer to "go with their gut." The framework asks them to do something uncomfortable: articulate the reasoning behind their instincts.

This difficulty is a known cost of using GVP. The framework does not try to eliminate it — it accepts it as the price of alignment. For users who are resistant to introspection, the initial experience may feel frustrating.

But the payoff compounds over time. Documented reasoning enables better planning, catches contradictions early, and prevents the slow drift between stated values and actual behavior. And with practice, the process itself gets easier:

- **Easier reflection.** Introspection is a skill. The more you practice articulating your reasoning, the more natural it becomes.
- **Greater self-knowledge.** The act of documenting why you make decisions surfaces patterns you might not have noticed — values you hold but never named, biases you didn't realize were shaping your choices.
- **A reusable corpus.** Over time, your GVP libraries accumulate documented goals, values, and principles that diminish the need for long, deep analysis. New projects start with a quick review — does the same stuff still apply? — rather than building from scratch. Libraries can be separated by category or domain and mixed and matched as fitting for different projects.

See [Developing a GVP Library](guide/developing-a-library.md) for practical guidance on building libraries efficiently, including workflows for AI-assisted GVP development.
