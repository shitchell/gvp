# AI Integration Guide

How to use GVP effectively as an AI assistant (or as the human operating one). This guide is assistant-agnostic -- it applies to any AI tool that works with a GVP store.


## Reading a GVP Store

### Discovery

A GVP store lives in a `.gvp/` directory at or near the project root. To find it, walk backwards from the current working directory until you find a `.gvp/` directory (similar to how Git discovers `.git/`).

### Understanding the Store

Once you find `.gvp/`, read all YAML files inside it to build a picture of the project's element graph:

1. **Read tag definitions.** Tags may be defined in any document's `meta.definitions.tags` block -- either inline alongside elements, or in a dedicated tags file. Read all documents to discover the full tag vocabulary.

2. **Read each YAML document.** Each file contains a `meta` block and element lists (goals, values, principles, rules, heuristics, design choices, etc.).

3. **Follow the inheritance chain.** The `meta.inherits` field links a document to its parent(s). Inherited elements are available to the child document for `maps_to` references. Read the parent documents to understand the full graph.

4. **Trace the mappings.** Every non-root element has a `maps_to` list connecting it to the goals and values it serves. These mappings are the backbone of traceability.

### Programmatic Access

The `cairn` CLI provides structured access to the store:

```bash
# Validate the library for structural errors and warnings
cairn validate --library .gvp/

# Query elements by ID, category, tag, or status
cairn query --library .gvp/ --category goals
cairn query --library .gvp/ --id G2

# Trace an element's full mapping chain back to goals and values
cairn inspect --library .gvp/ D3 --trace
```

Use `cairn query` and `cairn inspect --trace` when you need machine-parseable output rather than reading YAML directly.


## Conventions

### Reference Elements by ID and Name

When discussing GVP elements with humans, always include both the ID and the name:

- Good: `G2 "Facilitate easier planning for AI and humans"`
- Good: `V3 "Transparency"`
- Bad: `G2`
- Bad: `the second goal`

Humans do not memorize IDs. The name provides immediate context and saves the human from looking it up. This applies to conversation, commit messages, PR descriptions, and any other human-facing output.

### Propose Changes with Traceability

When proposing a new element (a design choice, heuristic, rule, etc.), always include `maps_to` references that connect it to existing goals, values, or other upstream elements. Explain why the mapping is appropriate -- do not just list IDs.

Each category has specific traceability requirements. See [Traceability Rules](../reference/validation.md#traceability-rules) for the per-category mapping rules.

Example of a well-formed proposal:

```yaml
decisions:
  - id: D12
    name: Use streaming JSON output
    rationale: >
      CLI output uses newline-delimited JSON for machine consumption.
    maps_to: [G2, V3, P1]
    status: proposed
```

> This maps to G2 "Facilitate easier planning for AI and humans" because
> structured output is parseable by AI tools without brittle text scraping.
> It maps to V3 "Transparency" because the output format is self-describing.
> It maps to P1 "Explicit over implicit" because JSON makes field names
> visible rather than relying on positional conventions.

### Check for Staleness

Before starting substantive work, check whether the library needs attention:

```bash
cairn review --library .gvp/
```

This surfaces elements with stale review dates, deprecated items that may still be referenced, and other maintenance issues. Address or acknowledge these before layering new decisions on top.


## Startup Prose for Agent Configuration

Ready-made blocks you can drop into agent configuration files (CLAUDE.md, .cursorrules, system prompts, etc.) to onboard an AI assistant to your GVP store.

### Minimal

A single paragraph covering the essentials:

```
This project uses GVP (Goals, Values, and Principles) for decision traceability.
Before proposing changes or making design decisions, read the GVP store at `.gvp/`
to understand the project's goals, values, and how decisions trace back to them.
When proposing new decisions, include `maps_to` references to existing elements.
Reference elements as ID + Name (e.g., G2 "Facilitate easier planning").
Run `cairn validate --library .gvp/` to check structural correctness.
```

### Detailed

A longer version covering the review cycle, change proposals, validation, and tracing:

```
This project uses GVP (Goals, Values, and Principles) for decision traceability.
The GVP store is at `.gvp/`. Read all YAML files there before proposing changes
or making design decisions.

Before starting work:
- Read the GVP store to understand the project's goals, values, principles,
  and existing design choices.
- Run `cairn review --library .gvp/` to check for stale or deprecated elements.
- Identify which goals and values are relevant to the task at hand.
- Note any constraints that apply.

When proposing a design decision:
- State the decision and alternatives considered.
- Include `maps_to` references connecting the decision to existing goals and
  values. Every design choice must trace to at least one goal AND one value.
- Explain why each mapping is appropriate.
- Use the user's own words for rationale -- do not paraphrase.
- Run `cairn validate --library .gvp/` after adding new elements.

When reviewing existing decisions:
- Use `cairn inspect <ID> --trace` to walk the mapping chain from a decision back to
  its goals and values.
- Check whether upstream elements have changed since the decision was made.
- Flag decisions whose rationale may no longer hold.

Always reference elements as ID + Name (e.g., G2 "Facilitate easier planning").
Humans do not memorize IDs -- the name provides immediate context.
```


## Building GVP Libraries with AI Assistance

One effective workflow for AI-assisted GVP development:

1. **Engage in a planning session.** Discuss the project, its goals, trade-offs, and decisions naturally.
2. **Ensure trade-offs are discussed.** For each decision point, explore the pros and cons of the alternatives considered.
3. **Provide rationale for decisions.** When you choose an option, explain why -- even if the reasoning is "gut feeling" or "I don't have time to think about this more right now."
4. **Document everything at the end.** Ask the AI assistant to produce a decision log: all discussed ideas, a brief description, their status (accepted, rejected, deferred), the context, and the rationale -- grouped by choice.

For example, a decision group might look like:

> **Which language to use**
> - **Python** -- widely available, readable, fast enough for YAML processing. *Status: Accepted.* *Rationale: "Claude proposed Python during initial planning, and it was not identified as a choice until mid-plan. Switching would have required reworking the existing plan for marginal benefit."*
> - **Go** -- compiled, good for AI-assisted development. *Status: Rejected.* *Rationale: "Would have been my first choice if starting fresh. Marginal benefit didn't justify reworking the mid-plan."*
> - **Node** -- familiar from work projects. *Status: Rejected.* *Rationale: "Not as strong for CLI tools."*

Context can be provided at the document, grouping, or item level. It should be written to facilitate future decisions where the same reasoning might be relevant.

Rationale **must** use verbatim user quotes. If a verbatim quote is not available, the agent should ask for clarification rather than paraphrasing.

Instructions for this process can be added to an agent's startup configuration or given at the beginning or end of a planning session. The resulting decision log provides a rich document for inferring and generating GVP elements with minimal effort on the human's part -- other than reviewing and discussing the inferred GVPs.


## Workflows

### Before Planning

1. **Read the library.** Load all YAML files in `.gvp/` and follow `meta.inherits` to read parent documents.
2. **Identify relevant goals and values.** Determine which existing elements relate to the upcoming work.
3. **Check for staleness.** Run `cairn review --library .gvp/` and surface any elements that need attention.
4. **Note constraints.** Constraints are non-negotiable boundaries. Know them before proposing anything.

```bash
# Load and validate the store
cairn validate --library .gvp/

# Check for review-worthy items
cairn review --library .gvp/

# List all constraints
cairn query --library .gvp/ --category constraints
```

### When Proposing a Design Choice

1. **State the decision and alternatives.** Name what was considered, not just what was chosen.
2. **Map to goals and values.** Every design choice must trace to at least one goal AND one value. Include the `maps_to` references and explain why each mapping holds.
3. **Capture rationale in the user's words.** Quote directly. Do not paraphrase or infer rationale that was not stated.
4. **Validate.** Run `cairn validate --library .gvp/` to confirm structural correctness after adding the new element.

```bash
# After adding a new design choice to a YAML file
cairn validate --library .gvp/

# Verify the trace chain is complete
cairn inspect D12 --trace
```

### During Review

1. **Walk the trace graph.** Use `cairn inspect <ID> --trace` on elements under review to see their full mapping chain.
2. **Check for upstream changes.** If a goal or value has been modified or deprecated since a decision was made, the decision may need revisiting.
3. **Stamp reviewed elements.** Update the `origin.reviewed` date on elements you have verified are still current.

```bash
# Trace a specific element
cairn inspect D5 --trace

# Review all elements for staleness
cairn review --library .gvp/
```
