# Goals, Values, and Principles (GVP)

Personal GVP library. See the `gvp` utility for framework documentation (categories, validation rules, delineation tests, etc.).

## Reading this library

Categories carry force, not just taxonomy:

- **Rules** bind. Follow them; change them only by explicit decision (personal:P9).
- **Heuristics** bind when their conditions apply — a rigid procedure, even where its inputs take judgment.
- **Principles** are deliberately judgment-weighted: sometimes true, sometimes not. They set defaults, and they yield to an applicable heuristic or rule.
- **Values** set direction and shape trade-offs; they prescribe no action alone.

Where two elements pull opposite ways on one decision, personal:R3 gives the precedence: rule > heuristic > principle > value — and anything it cannot settle should be surfaced as a guiding-element patch (personal:H5), never resolved silently.

## Structure

```
gvp-docs/
├── README.md              # This file
├── schema.yaml            # Field definitions, inheritance rules, validation
├── universal.yaml         # Organization-wide GVP (highest priority, U-prefixed IDs)
├── personal.yaml          # Cross-project values, principles, heuristics, rules
├── tags.yaml              # Tag registry with descriptions
├── projects/
│   └── <project>.yaml             # Project-level: goals, milestones, constraints
│       └── <implementation>.yaml  # Implementation-level: design choices, impl rules
│           └── ...                # Arbitrary further nesting
└── generated/             # Output from gvp utility
```

## Workflow

### Capturing decisions

During planning sessions, create a PLANNING.md that records every decision with:
- Options presented (all alternatives considered)
- Selected option
- Verbatim rationale (direct quotes, never paraphrased)
- Rejected alternatives and why
- Inferred trade-off axis and bias
- Candidate heuristics

### Synthesizing GVP items

After accumulating planning docs across sessions/projects, review the "inferred bias" and "candidate heuristic" fields for clusters. Clusters become values, principles, and heuristics in `personal.yaml`.

### Evolving the framework

- **Principles without heuristics** are fine — not everything has enough data points to formalize a decision procedure yet
- **Heuristics should acknowledge their context** — if inferred from code decisions, note that; generalize as evidence accumulates from other domains
- **Each item carries origin and update history** — `origin` records where an item was first inferred; `updated_by` records subsequent modifications with a `rationale` field explaining what changed and why. See [`schema.yaml`](schema.yaml) for full field definitions
- **Use `meta.defaults`** to avoid repeating the same `origin` or `tags` on every item in a file. Items that explicitly set a field override the default
- **IDs are stable and sequential** — auto-assigned by the `gvp` utility, no gaps. Never reuse a retired ID
- **Deprecate, don't delete** — items that are no longer relevant get `status: deprecated` (or `status: rejected`). Add an `updated_by` entry with a `rationale` explaining why. Deprecated items keep their ID forever and are hidden from default renders but visible with `--include-deprecated`

## Usage

Install the `gvp` utility for rendering, validation, querying, and review workflows.
