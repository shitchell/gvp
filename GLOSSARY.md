# GVP Glossary

Canonical definitions for GVP terminology. For how the framework works, see [README.md](README.md). For technical specs, see [docs/](docs/).

## Framework Terms

| Term | Definition |
|------|------------|
| **Goal** | An ideal state you're working toward. Would remain true if you rewrote everything tomorrow. |
| **Value** | A semantic descriptor that shapes trade-offs. The thumb on the scale when two valid approaches exist. |
| **Principle** | A stated preference or bias that requires judgment to apply. Less fuzzy than a value, more flexible than a rule. |
| **Heuristic** | A well-defined if/then decision procedure. Where a principle says "prefer X," a heuristic says "if A, then B; else C." |
| **Rule** | A hard stop. Binary, no exceptions. A principle that graduated to "never cross this line." |
| **Decision** | A tool or architectural decision picked for a specific implementation. Changes when the implementation changes. |
| **Constraint** | A fact about the system or environment you don't control. Descriptive, not prescriptive. |
| **Milestone** | A concrete, achievable waypoint on the path to goals. Ordered near-term to long-term. |
| **Scope** | A human-readable label for a level in the hierarchy (e.g., "universal", "personal", "project"). User-defined granularity. |
| **Tag** | A classification label applied to elements, defined in a document's `meta.definitions.tags` block. How tags are organized (e.g., by domain vs. concern) is a user convention, not a structural requirement. |
| **Provenance** | The tracked history of where an element was first inferred (origin), how it has been modified (updated_by), and when it was last confirmed as still accurate (reviewed_by). |
| **Traceability** | The property that every element (except goals, values, and constraints) traces its justification to at least one goal and one value. |
| **Element** | A single GVP entry of any category, stored as a YAML mapping with an ID, name, and category-specific fields. |
| **Guiding Element** | The Elements which guide decisions: goals, values, principles, constraints, heuristics, and rules. |
| **Document** | A YAML file containing a `meta` block and one or more elements. |
| **Library** | A directory containing GVP documents, optionally with dedicated definition files for tags and schema. |
| **Catalog** | The fully loaded, resolved graph of all documents across all libraries. The runtime object built by the loader. |
| **Ancestry** | The resolved set of ancestor documents reachable from a document's `meta.inherits` references, traversed breadth-first. Forms a DAG when documents inherit from multiple parents. |
| **Refs** | Links from elements to external files and identifiers. Each ref specifies a `file`, optional `identifier`, and `role` (defines, implements, uses, extends). Used to connect decisions to the code and artifacts they produce. |
| **Export Options** | Output format choices for the `cairn export` command: json, csv, markdown, dot. Each format renders the catalog in a different representation. |
| **Diagnostic** | A validation finding (error or warning) emitted by `cairn validate`. Each diagnostic has a code (e.g., E001, W003), a severity level, and a human-readable message. Diagnostics can be suppressed via `suppress_diagnostics` in config. |
| **RefParser** | A pluggable parser that extracts identifiers from source files. Built-in parsers cover TypeScript, Markdown, and YAML. Custom parsers can be registered for additional file types. |

## Built-in Categories

The framework ships with 8 core categories:

| Category | YAML Key | Prefix | Root | Primary Field |
|----------|----------|--------|------|---------------|
| Goal | `goals` | G | yes | statement |
| Value | `values` | V | yes | statement |
| Constraint | `constraints` | C | yes | impact |
| Principle | `principles` | P | no | statement |
| Rule | `rules` | R | no | statement |
| Heuristic | `heuristics` | H | no | statement |
| Decision | `decisions` | D | no | rationale |
| Milestone | `milestones` | M | no | description |

Additional categories (e.g., `implementation_rule`, `coding_principle`) can be defined via `meta.definitions.categories` in any GVP document. The `software-project` example demonstrates this with domain-specific categories.

For technical terms (YAML field names, data model objects), see the [Schema Reference](docs/reference/schema.md).
