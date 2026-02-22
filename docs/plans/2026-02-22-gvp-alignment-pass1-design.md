# GVP Alignment Pass 1 — Design Document

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:writing-plans to create the implementation plan from this design.

**Goal:** Codify the GVP framework's terminology, extract reusable framework content from the TASV document, and upgrade the validator to enforce category-specific traceability rules. End state: `gvp` is the source of truth for what the framework *is* and how it's enforced.

**Scope:** Glossary, TASV extraction, validation upgrades (tiers 1-3), README updates, gvp-docs alignment. Does NOT include the `review` command, timestamp tracking, or example library — those are pass 2.

---

## Decision Log

### 1. Glossary lives in gvp utility repo only

- **Status:** Accepted
- **Context:** gvp is becoming source of truth; gvp-docs is a personal store
- **Rationale:** Single canonical location avoids sync issues. gvp-docs doesn't need its own copy.

### 2. Single GLOSSARY.md with two sections

- **Status:** Accepted
- **Context:** Framework terms (user-facing) vs. technical terms (implementors)
- **Rationale:** One file avoids duplication of straddling terms (e.g., "Element" — users think about it, code models it). Section headers signal audience.

### 3. Delineation tests live in README, not glossary

- **Status:** Accepted
- **Context:** Delineation tests are a decision-making tool, not definitions
- **Rationale:** They naturally fit in the README's categories table as "how to identify" notes. The glossary is strictly dictionary-style.

### 4. README is user-facing, non-technical

- **Status:** Accepted
- **Context:** GVP is intended as a cross-domain framework, including non-technical users
- **Rationale:** Technical language (Catalog, Chain, Qualified ID) stays out of the README. README links to GLOSSARY.md and docs/ for users who want deeper specs.

### 5. Doc hierarchy: GLOSSARY → README → docs/

- **Status:** Accepted
- **Context:** Three audiences — quick lookup, framework understanding, implementation detail
- **Rationale:** GLOSSARY.md for definitions, README.md for how the framework works (categories, relationships, validation, scope), docs/ for technical specs (schema, config format, relationship semantics).

### 6. Scope levels: universal/personal/project in README, implementation+ in examples/

- **Status:** Accepted
- **Context:** universal/personal/project are structural and opinionated but core to the tool. Implementation/feature layering is one valid conceptualization among many.
- **Rationale:** The tool's walk-backwards discovery and inherits chain encode universal/personal/project as structural concepts. Implementation-level scoping is domain-specific (software-oriented) and belongs in examples/ as a worked model, not in the README.

### 7. TASV document superseded by gvp

- **Status:** Accepted
- **Context:** TASV was the original framework document for a specific project (Playwright test automation)
- **Rationale:** All reusable framework content (categories, relationships, validation rules, delineation tests) migrates to gvp. Project-specific content (D1-D11, CON1-CON4) stays with the project. The TASV file becomes a historical artifact.

### 8. Milestone maps to goal + value (not goal only)

- **Status:** Accepted
- **Context:** Original TASV spec only required milestones to map to goals
- **Rationale:** A milestone that can't articulate which values it serves is either not a real milestone or has unstated values driving it. Even "scrappy mode" milestones trace to values like pragmatism. This keeps the base traceability rule universal with no exceptions.

### 9. User-defined validation rules in config.yaml

- **Status:** Accepted
- **Context:** Users may want custom constraints beyond the built-in category rules
- **Rationale:** config.yaml is the right place (it's configuration, not data). A `validation` section with simple predicate rules keeps it extensible without a new file.

---

## Design

### 1. GLOSSARY.md

Two sections, dictionary-style entries. Each entry: term, one-sentence definition, optional one-line example.

**Section 1 — Framework Terms**

Terms any user of the GVP framework needs:

| Term | Definition |
|------|------------|
| Goal | An ideal state you're working toward. Project-shape-agnostic — would remain true if you rewrote everything tomorrow. |
| Value | A semantic descriptor that shapes trade-offs. The thumb on the scale when two valid approaches exist. |
| Principle | A stated preference or bias that requires judgment to apply. Less fuzzy than a value, more flexible than a rule. |
| Heuristic | A well-defined if/then decision procedure. Where a principle says "prefer X," a heuristic says "if A, then B; else C." |
| Rule | A hard stop. Binary, no exceptions. A rule is a principle that graduated to "never cross this line." |
| Design Choice | A tool or architectural decision picked for a specific implementation. Changes when the implementation changes. |
| Implementation Rule | A hard stop contingent on design choices. If the design choice changes, the rule may not apply. |
| Coding Principle | A guideline for writing code in a specific implementation. Changes with the tech stack. |
| Constraint | A fact about the system or environment you don't control. Descriptive, not prescriptive. |
| Milestone | A concrete, achievable waypoint on the path to goals. Ordered near-term to long-term. |
| Scope | A human-readable label for what a level in the hierarchy represents (e.g., "universal", "personal", "project"). User-defined granularity. |
| Tag | A classification label applied to elements. Two flavors: domain tags (what area) and concern tags (what quality). |
| Provenance | The tracked history of where an element was first inferred (origin) and how it has been modified (updated_by). |
| Traceability | The property that every element (except goals, values, and constraints) can trace its justification back to at least one goal and one value. |

**Section 2 — Technical Terms**

Terms specific to the CLI tool and YAML spec:

| Term | Definition |
|------|------------|
| Element | A single GVP entry of any category, stored as a YAML mapping with an ID, name, and category-specific fields. |
| Document | A YAML file containing a `meta` block and one or more elements. |
| Library | A directory containing GVP documents, optionally with a `tags.yaml` and `schema.yaml`. |
| Chain | The resolved inheritance path from a document to its root, determined by `meta.inherits` references. |
| Catalog | The fully loaded, resolved graph of all documents across all libraries. The runtime object built by the loader. |
| Qualified ID | A `document:ID` reference that unambiguously identifies an element across scopes (e.g., `personal:P3`). |
| maps_to | The field on an element that encodes its relationships to other elements as a list of qualified IDs. |
| meta.defaults | Default field values in a document's meta block, applied to every element in that file unless explicitly overridden. |

### 2. README.md Updates

The current README covers subcommand usage. It needs to become the user-facing framework explanation. Structure:

1. **What is GVP?** — One-paragraph intro (cross-domain framework for decision traceability)
2. **Categories** — Table with scope, specificity, description, delineation test per category
3. **Relationships** — Prose description of how categories relate (goals are the destination, values are the compass, etc.)
4. **Scope and Inheritance** — Universal/personal/project as structural concepts, user-defined granularity, parent-wins-on-conflict
5. **Tags** — Domain vs. concern, defined in registry
6. **Traceability Rule** — The base rule + category-specific table
7. **Validation** — What `gvp validate` checks (structural + category-specific + user-defined)
8. **Installation** — pip install
9. **Quick Start** — Basic usage examples
10. **Subcommand Reference** — Current content, kept concise
11. **Links** — GLOSSARY.md, docs/ for technical specs

### 3. Validation Upgrades

#### Tier 1: Category-specific mapping rules (errors)

**Base traceability rule:** Every element must trace to >= 1 goal and >= 1 value (except goals, values, and constraints which are roots/external facts).

| Category | Mapping Rule |
|----------|-------------|
| Milestone | >= 1 goal + >= 1 value |
| Principle | >= 1 goal + >= 1 value |
| Rule | >= 1 goal + >= 1 value |
| Design Choice | >= 1 goal + >= 1 value |
| Heuristic | (>= 1 goal + >= 1 value) \|\| >= 1 principle |
| Implementation Rule | (>= 1 goal + >= 1 value) \|\| >= 1 design choice |
| Coding Principle | (>= 1 goal + >= 1 value) \|\| >= 1 (principle OR design choice) |

Implementation: add a `_validate_mappings()` function in `validate.py` that iterates elements, looks up their `maps_to` targets in the catalog, checks categories of targets against the rules above. Returns errors for violations.

The validator resolves qualified IDs to elements and checks their `.category` field. A target counts if it resolves — broken references are already caught by the existing reference check.

#### Tier 2: Semantic suggestions (warnings)

- Elements with category-required `maps_to` but empty `maps_to` list — warning before the mapping rule even fires (helps distinguish "no mappings yet" from "wrong mappings")
- Elements where `maps_to` contains only elements from the same document (potential insularity — may want cross-scope traceability)

These are warnings (suppressible, promotable to errors with `--strict`). Assign warning IDs: W004 (empty maps_to), W005 (insular mappings).

#### Tier 3: User-defined validation rules (config.yaml)

New `validation` section in config.yaml:

```yaml
validation:
  rules:
    - name: "All heuristics must have at least one tag"
      match:
        category: heuristic
      require:
        min_tags: 1

    - name: "Implementation elements must map to parent scope"
      match:
        scope: implementation
      require:
        maps_to_scope: [project, personal, universal]
```

**Predicate language (v1):**

`match` filters (all must be true):
- `category`: element category name
- `scope`: document scope_label
- `tag`: element has this tag
- `status`: element status

`require` checks (all must be true):
- `min_tags`: minimum number of tags
- `has_field`: field name must be non-empty
- `maps_to_category`: at least one maps_to target has this category (or list of categories)
- `maps_to_scope`: at least one maps_to target is in a document with this scope_label

Violations are errors by default. Add `level: warning` to make them warnings.

**Implementation:** Add a `_validate_user_rules()` function. Parse rules from `GVPConfig`. For each rule, filter elements by `match`, check `require` predicates, collect violations.

**Config changes:** Add `validation_rules: list[dict]` to `GVPConfig`. Parse from `config.yaml`'s `validation.rules` key.

### 4. gvp-docs Alignment

After the utility is updated, sync gvp-docs:

- **README.md** — Update to reference gvp utility as source of truth for framework docs. Remove framework explanation prose (it lives in gvp's README now). Keep the structure diagram, workflow sections, and links.
- **schema.yaml** — Update validation section to match the new category-specific rules. Add the traceability rule.
- **Validation table** — Ensure it matches the new rules (milestone now requires goal + value).

### 5. TASV Extraction Checklist

Content to extract from TASV into gvp:

| TASV Section | Destination | Status |
|--------------|------------|--------|
| Categories table (lines 13-24) | gvp README + GLOSSARY.md | Already in gvp-docs README, needs delineation tests added |
| Relationships (lines 28-35) | gvp README | Already in gvp-docs README, needs minor wording updates |
| Validation table (lines 37-45) | gvp README + validate.py | Rules documented, need implementation + milestone update |
| Delineation tests (lines 47-59) | gvp README | Not in gvp-docs yet, needs adding |
| "How This Document Works" intro | gvp README (adapted) | Framework explanation, not project-specific |
| Project-specific content (D1-D11, CON1-CON4, etc.) | Stays in TASV | Not migrated — project-specific |

---

## Files Changed

### New files
- `GLOSSARY.md` — canonical term definitions
- `examples/` — directory for worked examples (scope layering, etc.) — created but populated in pass 2

### Modified files
- `README.md` — rewritten as user-facing framework explanation + tool usage
- `src/gvp/commands/validate.py` — tier 1 + tier 2 validation rules
- `src/gvp/config.py` — `validation_rules` field, parsing from config.yaml
- `tests/commands/test_validate.py` — tests for new validation rules
- `tests/test_config.py` — tests for validation rules parsing

### External repos
- `~/code/git/github.com/shitchell/gvp-docs/README.md` — slim down, reference gvp
- `~/code/git/github.com/shitchell/gvp-docs/schema.yaml` — update validation rules

---

## Pass 2 Preview (separate design)

Items deferred to pass 2:
- `review` command — mark elements as reviewed, propagate timestamps
- Timestamp tracking — `edit` command auto-adds timestamps, `--no-timestamp` flag
- Example library — trimmed demo library in `examples/`
- gvp-docs repo → private, personal store
- Final doc review and polish
