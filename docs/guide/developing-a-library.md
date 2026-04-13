# Developing a GVP Library

Practical guidance for building and maintaining a GVP library. This covers the mindset, patterns, and trade-offs that come up during library development.

For the philosophical foundations behind these practices — why introspection matters, why the framework serves alignment rather than comfort — see [Philosophy](../philosophy.md).

## Start Verbose, Tighten Later

When building a new library, capture everything. Don't worry about perfect categorization or minimal overlap — get the ideas down first. Multiple values that seem similar are not redundant; they triangulate the actual shape of your motivations. Each additional point helps clarify what you actually care about.

Once you have a comprehensive draft, review it for consolidation. Some elements will merge naturally. Others will stay separate because, on closer inspection, they do different work. Fuzziness at the goal and value level is acceptable and even expected. Tightness is expected at the heuristic, rule, and design choice level — those should be precise enough to act on.

## Map Design Choices to the Heuristics That Produce Them

The ideal GVP graph has well-defined heuristics for every recurring decision, and every design choice maps back to the heuristic that produced it. This makes the reasoning chain fully explicit: a design choice was made because a heuristic was applied, which operationalizes a principle, which traces to goals and values.

In practice, not every design choice will have a corresponding heuristic — not because they don't trace back to one, but because the effort to painstakingly map every heuristic for every one-off decision might not add proportional value to the map. But when you notice a pattern in your decision-making, formalize it as a heuristic and link the design choices that follow from it. This makes it much easier for collaborators (human or AI) to make aligned changes, and much easier to review whether past decisions still hold.

## Decompose to the Deepest Guiding Element

When recording a new decision or heuristic, decompose the solution rationale to its most domain-agnostic guiding element before recording. A surface-level heuristic yields value for one scenario; identifying the underlying principle yields aligned decisions across domains and contexts not yet encountered.

This is DRY applied to guiding elements: duplicating reasoning across scenario-specific heuristics is like copy-pasting code — it creates maintenance burden and drift when the underlying logic evolves. Decompose to a shared broad element extended by domain-specific files, so changes propagate from one place.

**Example.** Consider a CLI tool where you decide "prefer fewer subcommands with flags over many subcommands":

- **Surface-level heuristic:** "consolidated CLI design — prefer fewer subcommands with flags." Useful for this CLI, but doesn't help when you're designing an API, a config file format, or a documentation structure.
- **Decomposed:** A domain-agnostic value like "Discoverability" → a principle like "consolidated interface design" that applies to CLIs, APIs, config formats, and any interface where users need to find functionality. The value applies to graphic design projects, finance dashboards, documentation structure — not just CLIs.

The decomposed form serves three purposes:

1. **Reuse.** The same principle guides decisions in domains you haven't encountered yet.
2. **Maintenance.** When the underlying reasoning evolves ("actually, discoverability is less important than learnability in this context"), you update one element, not every scenario-specific heuristic that encoded the same logic.
3. **Alignment.** Collaborators (human or AI) encountering a new decision point can trace back to the shared principle and produce an aligned decision without having seen the specific scenario before.

When in doubt, ask: "Is this the deepest reason, or is there a more general principle underneath?" If you can imagine the same reasoning applying in a completely different domain, you haven't decomposed far enough.

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
