# Developing a GVP Library

Practical guidance for building and maintaining a GVP library. This covers the mindset, patterns, and trade-offs that come up during library development.

For the philosophical foundations behind these practices — why introspection matters, why the framework serves alignment rather than comfort — see [Philosophy](philosophy.md).

## Start Verbose, Tighten Later

When building a new library, capture everything. Don't worry about perfect categorization or minimal overlap — get the ideas down first. Multiple values that seem similar are not redundant; they triangulate the actual shape of your motivations. Each additional point helps clarify what you actually care about.

Once you have a comprehensive draft, review it for consolidation. Some elements will merge naturally. Others will stay separate because, on closer inspection, they do different work. Fuzziness at the goal and value level is acceptable and even expected. Tightness is expected at the heuristic, rule, and design choice level — those should be precise enough to act on.

## Map Design Choices to the Heuristics That Produce Them

The ideal GVP graph has well-defined heuristics for every recurring decision, and every design choice maps back to the heuristic that produced it. This makes the reasoning chain fully explicit: a design choice was made because a heuristic was applied, which operationalizes a principle, which traces to goals and values.

In practice, not every design choice will have a corresponding heuristic — not because they don't trace back to one, but because the effort to painstakingly map every heuristic for every one-off decision might not add proportional value to the map. But when you notice a pattern in your decision-making, formalize it as a heuristic and link the design choices that follow from it. This makes it much easier for collaborators (human or AI) to make aligned changes, and much easier to review whether past decisions still hold.

## Building GVPs with AI Assistance

If you're helping someone build their first GVP library, be patient with introspection. Fuzzy gut feelings are valid starting points. The goal is to capture them, not to demand precision on day one.

One effective workflow for AI-assisted GVP development:

1. **Engage in a planning session.** Discuss the project, its goals, trade-offs, and decisions naturally.
2. **Ensure trade-offs are discussed.** For each decision point, explore the pros and cons of the alternatives considered.
3. **Provide rationale for decisions.** When you choose an option, explain why — even if the reasoning is "gut feeling" or "I don't have time to think about this more right now."
4. **Document everything at the end.** Ask the AI assistant to produce a decision log: all discussed ideas, a brief description, their status (accepted, rejected, deferred), the context, and the rationale — grouped by choice.

For example, a decision group might look like:

> **Which language to use**
> - **Python** — widely available, readable, fast enough for YAML processing. *Status: Accepted.* *Rationale: "Claude proposed Python during initial planning, and it was not identified as a choice until mid-plan. Switching would have required reworking the existing plan for marginal benefit."*
> - **Go** — compiled, good for AI-assisted development. *Status: Rejected.* *Rationale: "Would have been my first choice if starting fresh. Marginal benefit didn't justify reworking the mid-plan."*
> - **Node** — familiar from work projects. *Status: Rejected.* *Rationale: "Not as strong for CLI tools."*

Context can be provided at the document, grouping, or item level. It should be written to facilitate future decisions where the same reasoning might be relevant.

Rationale **must** use verbatim user quotes. If a verbatim quote is not available, the agent should ask for clarification rather than paraphrasing.

Instructions for this process can be added to an agent's startup configuration or given at the beginning or end of a planning session. The resulting decision log provides a rich document for inferring and generating GVP elements with minimal effort on the human's part — other than reviewing and discussing the inferred GVPs.

## Consider Separating Domain-Agnostic from Domain-Specific

This is a recommendation, not a rule — use whatever structure fits your context.

When building GVP libraries for an organization, consider keeping the top-level documents domain-agnostic: goals, values, and principles that apply regardless of department or discipline. Domain-specific GVPs can then live in separate files that inherit from the shared foundation.

For example, an organization might have:

```
universal.yaml              (company-wide: values, rules, constraints)
├── code.yaml               (all engineering: coding principles, security rules)
│   └── projects/foo.yaml   (project-specific goals, design choices)
├── sales.yaml              (sales team: principles, heuristics)
│   └── projects/q3.yaml    (quarterly initiative goals, milestones)
└── operations.yaml         (ops team: principles, constraints)
```

This structure lets `universal.yaml` capture things that apply everywhere — like "no security keys in repositories, ever, even throwaway test repos" — while domain-specific files add the elements relevant to each team's work. Teams inherit the shared foundation without duplicating it, and domain-specific GVPs stay with the people who maintain them.

For personal use, the same pattern applies at a smaller scale: personal values shape all your projects, and project-specific elements extend them without repeating them.
