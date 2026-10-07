# GVP Roadmap

Future considerations and evolution paths for the GVP framework.


## Typed Mappings

**Status:** Deferred (YAGNI — no current use case requires edge labels)

Currently all relationships use a single `maps_to` field with untyped
edges. The relationship semantics (e.g., "advances", "depends on",
"operationalizes") are derivable from the types of the source and
target nodes.

If a use case emerges where edge labels carry non-derivable information,
the evolution path is:

1. Rename `maps_to` to `mappings` and accept both strings and objects
2. Plain strings are sugar for `{target: "...", type: null}`
3. Typed edges are opt-in: `{target: personal:P3, type: depends_on}`
4. Relationship types defined in a separate YAML file (like tags.yaml)

This is backwards-compatible — existing simple references still work.


## Relationship Type Registry

**Status:** Deferred (blocked by typed mappings)

A `relationship_types.yaml` file defining valid edge labels, similar
to how `tags.yaml` defines valid tags. Would enable validation that
typed mappings use known relationship types.


## Chain Review Validation

**Status:** Done — implemented as W006 staleness warning in `gvp validate`. Elements with `reviewed_by` dates older than ancestor `updated_by` dates trigger a warning. The `review` command provides interactive review workflow.

When an element is updated (`updated_by` with a timestamp), all
descendants in the mapping graph may need review — the change could
invalidate downstream decisions. The implementation:

1. `updated_by.date` records modification timestamps on elements
2. `reviewed_by` field on elements records review acknowledgments
   (`{date, by, note}`) — see `schema.yaml` provenance section
3. W006 validation rule: if any ancestor has an `updated_by.date` newer
   than a descendant's latest `reviewed_by.date` (or if the descendant
   lacks a `reviewed_by` entry), emit a warning prompting review

The `gvp review` command lists stale elements and provides interactive
review workflow to acknowledge upstream changes.


## Investigate TASV-Playwright GVP Document

**Status:** Done — framework content migrated to gvp utility README and GLOSSARY. Category-specific traceability rules implemented in `gvp validate`. Delineation tests added to README categories table.

Review `~/GOALS_VALUES_PRINCIPLES-tasv-playwright.md` against the gvp-docs
schema and the gvp utility. This is the original document where the GVP
framework began formalization. Key areas to investigate:

- Validation rules (e.g., "design choices must map to 1 value and 1 goal")
  that should be ported into `gvp validate`
- Any elements, relationships, or structural patterns not yet captured
  in gvp-docs
- Alignment between the original framing and the current schema
