# Developing a GVP Library

Practical guidance for building and maintaining a GVP library. This covers the mindset, patterns, and trade-offs that come up during library development.

For the philosophical foundations behind these practices — why introspection matters, why the framework serves alignment rather than comfort — see [Philosophy](../philosophy.md).

## Start Verbose, Tighten Later

When building a new library, capture everything. Don't worry about perfect categorization or minimal overlap — get the ideas down first. Multiple values that seem similar are not redundant; they triangulate the actual shape of your motivations. Each additional point helps clarify what you actually care about.

Once you have a comprehensive draft, review it for consolidation. Some elements will merge naturally. Others will stay separate because, on closer inspection, they do different work. Fuzziness at the goal and value level is acceptable and even expected. Tightness is expected at the heuristic, rule, and design choice level — those should be precise enough to act on.

## Map Design Choices to the Heuristics That Produce Them

The ideal GVP graph has well-defined heuristics for every recurring decision, and every design choice maps back to the heuristic that produced it. This makes the reasoning chain fully explicit: a design choice was made because a heuristic was applied, which operationalizes a principle, which traces to goals and values.

In practice, not every design choice will have a corresponding heuristic — not because they don't trace back to one, but because the effort to painstakingly map every heuristic for every one-off decision might not add proportional value to the map. But when you notice a pattern in your decision-making, formalize it as a heuristic and link the design choices that follow from it. This makes it much easier for collaborators (human or AI) to make aligned changes, and much easier to review whether past decisions still hold.

## Building GVPs with AI Assistance

For guidance on using AI assistants to build and maintain GVP libraries — including planning workflows, decision logging, and copy/paste-able agent configuration — see the [AI Integration Guide](ai-integration.md).

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
