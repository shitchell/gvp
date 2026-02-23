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
| **Design Choice** | A tool or architectural decision picked for a specific implementation. Changes when the implementation changes. |
| **Implementation Rule** | A hard stop contingent on design choices. If the design choice changes, the rule may not apply. |
| **Coding Principle** | A guideline for writing code in a specific implementation. Changes with the tech stack. |
| **Constraint** | A fact about the system or environment you don't control. Descriptive, not prescriptive. |
| **Milestone** | A concrete, achievable waypoint on the path to goals. Ordered near-term to long-term. |
| **Scope** | A human-readable label for a level in the hierarchy (e.g., "universal", "personal", "project"). User-defined granularity. |
| **Tag** | A classification label applied to elements. Two flavors: domain tags (what area) and concern tags (what quality). |
| **Provenance** | The tracked history of where an element was first inferred (origin) and how it has been modified (updated_by). |
| **Traceability** | The property that every element (except goals, values, and constraints) traces its justification to at least one goal and one value. |

## Technical Terms

Terms specific to the `gvp` CLI tool and YAML document format.

| Term | Definition |
|------|------------|
| **Element** | A single GVP entry of any category, stored as a YAML mapping with an ID, name, and category-specific fields. |
| **Document** | A YAML file containing a `meta` block and one or more elements. |
| **Library** | A directory containing GVP documents, optionally with a `tags.yaml` and `schema.yaml`. |
| **Chain** | The resolved inheritance path from a document to its root, determined by `meta.inherits` references. |
| **Catalog** | The fully loaded, resolved graph of all documents across all libraries. The runtime object built by the loader. |
| **Qualified ID** | A `document:ID` reference that unambiguously identifies an element across scopes (e.g., `personal:P3`). |
| **maps_to** | The field on an element that encodes its relationships to other elements as a list of qualified IDs. |
| **meta.defaults** | Default field values in a document's meta block, applied to every element in that file unless explicitly overridden. |
| **reviewed_by** | A list of review acknowledgment entries on an element, recording when it was last confirmed as still accurate. Used by W006 staleness detection. |
