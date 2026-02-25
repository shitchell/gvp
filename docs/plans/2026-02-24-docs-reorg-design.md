# Documentation Reorganization Design

## Problem

The current docs are functional but lack clear audience separation. Non-technical users, power users, and AI assistants all land on the same README and get the same level of detail. Some content is in the wrong place (example-specific categories in the core README, technical YAML field names in the glossary), some features are undocumented (5+ CLI flags, validation codes, config discovery), and there's no dedicated AI integration guide despite G7 (Usable by AI assistants) being a core goal.

## Goals

- Three audience tiers: non-technical, technical/power user, AI-specific
- Every doc has a clear audience and purpose
- Single source of truth for reference material (DRY)
- README is self-sufficient for Tier 1 readers (terms explained in-context)
- Example-specific content lives in examples, not core docs

## Audience Tiers

| Tier | Audience | Needs |
|------|----------|-------|
| 1 | Anyone -- business users, managers, individuals | What GVP is, why it matters, how to think about goals/values/principles |
| 2 | Developers, CLI users | Full command reference, YAML schema, validation codes, config |
| 3 | AI assistants and their operators | Copy/paste-able startup prose, how to read/query/propose GVP changes |

## File Structure

```
README.md                              # Tier 1: non-technical onboarding
GLOSSARY.md                            # Tier 1: non-technical definitions
docs/
  philosophy.md                        # Tier 1: theory, fuzzy boundaries, alignment
  guide/
    developing-a-library.md            # Tier 1/2: practical how-to (exists, minor trim)
    usage.md                           # Tier 2: full subcommand reference, all flags, examples
    ai-integration.md                  # Tier 3: AI-readable overview, copy/paste startup prose
  reference/
    schema.md                          # Tier 2: YAML format, meta fields, element fields
    validation.md                      # Tier 2: traceability rules (canonical SOT), W001-W006, errors, --strict
    config.md                          # Tier 2: config discovery, suppress_warnings, validation rules
  plans/                               # (unchanged)
examples/
  software-project/                    # Reworked: modeled after gvp's own .gvp/ library
    README.md                          # Discusses Project vs. Implementation scope distinction
  small-business/                      # (unchanged)
```

## Changes Per File

### README.md -- Rewrite

**Keep:**
- "Why" section
- Elements table -- core 8 categories only, with "How to identify" litmus tests
- Relationships section
- Scope and Inheritance section (includes multi-parent example)
- Tags section
- Installation
- Quick Start examples

**Trim:**
- Subcommands section: only validate, render, trace, review with 1-2 examples each
- Link to `docs/guide/usage.md` for full reference (add, edit, query, all flags)

**Fix:**
- Traceability: simplify to one-sentence rule ("every element except goals, values, and constraints must trace to at least one goal and one value, directly or transitively") + link to `reference/validation.md` for per-category details
- "Extensible categories" wording: clarify this is about tags for domain classification, not new category types
- Terms used in prose should be self-explanatory in-context (e.g., "GVP 'Libraries' are directories that store YAML specifications for GVP Elements, tag definitions, and config files...")

**Remove:**
- Implementation Rule and Coding Principle from everywhere (example-specific)
- Global Options table (moves to usage.md)
- Future Work section (internal planning, not onboarding)

**Add:**
- Links to new docs in Further Reading

### GLOSSARY.md -- Trim

**Keep (Framework Terms):**
- Core 8 element categories (Goal, Value, Principle, Heuristic, Rule, Design Choice, Constraint, Milestone)
- Conceptual terms that appear in Tier 1 docs: Element, Library, Document, Scope, Tag, Provenance, Traceability, Catalog, Ancestry

**Remove:**
- Technical Terms section entirely. YAML field names (Qualified ID, maps_to, meta.defaults, reviewed_by) move to `reference/schema.md`
- Implementation Rule, Coding Principle (example-specific, not core)

### docs/philosophy.md -- Unchanged

Already solid. Covers fuzzy boundaries, "framework serves alignment not people," introspection.

### docs/guide/developing-a-library.md -- Minor trim

- Remove "Building GVPs with AI Assistance" section (lines 19-41)
- Replace with a brief note and link: "For AI-assisted workflows, see [AI Integration](ai-integration.md)"
- Everything else stays as-is

### docs/guide/usage.md -- New

Full CLI reference for power users:

- Every subcommand: validate, render, trace, review, query, add, edit
- Every flag per subcommand, including currently undocumented:
  - `--maps-to` and `--format` on trace
  - `--include-deprecated` on render
  - `--status` on query
  - `png` format, multi-format support, `all` keyword on render
  - `--no-provenance` on add/edit (documented as subcommand-specific)
- At least one common + one power-user example per subcommand
- Global options that are actually global (`--strict`, `--config`, `--library`, `--version`)

**Intentionally omitted:**
- `--approve` on review (hidden flag, stays hidden)
- `--verbose` (dead flag -- defined but never checked in code)

### docs/guide/ai-integration.md -- New

Three parts:

1. **Overview** -- How AI assistants should interact with GVP stores. Reading libraries, understanding the graph, querying elements, proposing changes. Written for any AI assistant, not Claude-specific.

2. **Copy/paste-able startup prose** -- Ready-made blocks for agent config files (CLAUDE.md, .cursorrules, system prompts, etc.). Multiple variants:
   - Minimal one-paragraph version
   - Detailed version covering review workflows and change proposals

3. **Workflows** -- Moved from developing-a-library.md:
   - The AI-assisted GVP development workflow (planning sessions, decision logs, rationale capture)
   - "Before planning: read the library, identify relevant goals/values"
   - "When proposing a design choice: trace it to goals and values"
   - "When reviewing: check for staleness, run `gvp review`"

4. **Conventions:**
   - Always reference elements as `ID "Name"` (e.g., `G2 "Be Amazing"`) -- humans don't memorize IDs

### docs/reference/schema.md -- New

- YAML document format: `meta` block fields (`name`, `scope`, `inherits`, `defaults`, `id_prefix`)
- Element fields per category (`id`, `name`, `statement`/`rationale`/`impact`, `tags`, `maps_to`, `status`, `origin`, `updated_by`, `reviewed_by`)
- Technical terms moved from GLOSSARY.md (Qualified ID, maps_to, meta.defaults, reviewed_by)
- `tags.yaml` format

### docs/reference/validation.md -- New

- Traceability rules table -- canonical single source of truth
  - Core categories only in the main table
  - Note on how extended categories (like Implementation Rule) define their own mapping rules in their respective examples
- Warning codes W001-W006 with descriptions
- Error checks (broken maps_to refs, undefined tags, ID gaps, broken inherits, circular inheritance)
- `--strict` behavior (warnings become errors)

### docs/reference/config.md -- New

- Config discovery cascade (walk-backwards from CWD to `.gvp/`, then `~/.config/gvp/`, then `/etc/gvp/`)
- `suppress_warnings` -- list of warning codes to silence
- User-defined validation rules -- match/require syntax
- Config file format and location

### examples/software-project/ -- Rework

**YAML files:**
- Rebuilt using gvp's own `.gvp/` library as the foundation
- Carry over as many Elements as seem relevant from gvp.yaml and v0.yaml
- Leverage existing entries as extended examples of element litmus tests
- Add `universal.yaml` -- org-wide layer with:
  - "Sustainable revenue" as a goal or constraint -- the org must make enough money to remain viable
  - Heuristics for when/how to compromise on quality ideals (deadline pressure, budget constraints)
  - Framed as coherent with the GVP, not in conflict -- the compromise traces to goals and values
  - At least 1-2 design choices that model this trade-off explicitly
- Add `personal.yaml` -- individual cross-project values and principles
- Adapt project-level content from gvp.yaml into the fictional "taskflow" framing
- Keep Implementation Rule and Coding Principle at implementation scope

**README.md:**
- Explicitly discuss Project vs. Implementation scope distinction:
  - Project scope: survives tool/framework changes (goals, constraints, high-level principles)
  - Implementation scope: wouldn't survive (design choices, coding principles, implementation rules)
- Walk through the 4-level chain with this framing
- Document extended categories and their traceability rules (this is where Implementation Rule and Coding Principle mapping rules live)
- Show `gvp` commands against the example

### small-business example -- Unchanged

### docs/plans/ -- Unchanged

## Code Fixes to Document (Not Implement Here)

These are code issues surfaced during the docs-vs-code comparison. They should be fixed separately but the new docs should be written assuming they work:

- **User-defined validation rules**: `cmd_validate` never passes `config` to `validate_catalog()` -- dead code. Docs assume it works; fix tracked in MEMORY.md as high priority.
- **`--verbose` flag**: defined in argparse but never checked. Either implement or remove; omitted from usage.md for now.

## Notes

- Future: docs templating system to define SOT tables (like traceability rules) once and import into multiple docs. Tracked in MEMORY.md.
- The heuristic traceability rule now includes "rule" as a valid alternative path (recent change). Docs should reflect this.
