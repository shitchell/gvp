---
title: GVP v1 Design Decisions — Running Log
description: Tracks all design decisions made during the v1 rewrite planning. Each theme is discussed, options evaluated, and conclusions recorded with rationale.
status: in-progress
---

# GVP v1 Design Decisions

## Instructions for Claude (Start Here)

### Context

This document tracks design decisions for a complete TypeScript rewrite of GVP (Goals, Values, and Principles), a decision traceability framework. The user (Guy) is the sole developer. This is a scrappy alpha — **NO backwards compatibility considerations. Ever.** If something is broken, rip it out. The user will update his YAML files.

### Skills to Invoke

At session start, invoke `superpowers:brainstorming`. It drives the overall flow. After ALL themes are decided, invoke `superpowers:writing-plans` to create the implementation plan. Ignore the `decision-tracking-markdown` skill — we have our own format established here.

### Process Flow Per Theme

```
1. Discuss theme (one question at a time, prefer multiple choice)
   → Helps ensure we capture rejected alternatives naturally
2. Record decisions (verbatim rationale + all rejected alternatives)
3. Self-check (consistency, completeness, rationale present?)
4. Launch Explorer agent audit (fresh eyes — check for inconsistencies,
   ambiguities, stale references, gaps across ALL decided themes)
5. Resolve findings together with user
6. User reviews (they catch things the agent misses — this is NOT optional)
7. Update review statuses in BOTH:
   - This doc (theme discussion items table + appendix)
   - v1-missing-requirements-approved.md
8. Confirm theme is closed → next theme
```

### Decision Recording Rules

Every decision MUST include:

- **Timestamp**: US Eastern Time, down to the minute (e.g., `2026-03-16 10:30 AM EST`). Record the time the decision is written.
- **Status**: Decided, Deferred, or Open.
- **Rationale**: Verbatim quotes from the user. Use direct quotes. Never paraphrase, infer, or assume rationale. If the user doesn't provide rationale, **STOP and ask**. Do not proceed without it.
- **Rejected alternatives**: Every option that was considered but not chosen, with the reason it was rejected. Multiple choice questions naturally produce these.
- **Implications**: What this decision means for other parts of the system.

Rules:
- Requirements define **behavior**, NOT implementation details. If an auditor or agent injects implementation specifics, reject them.
- **NO backwards compatibility.** Any approach that considers it should fall under strict scrutiny. Direct quote: "we could not give a SHIT about backwards compatibility and actively want to avoid letting it ever influence a single decision."
- When asking the user questions, prefer **multiple choice** (2-4 options with descriptions). This helps ensure alternatives are captured. Open-ended is fine for clarification.
- **One question at a time.** Don't overwhelm.

### Files and Their Roles

| File | Role | Mutable? |
|------|------|----------|
| `docs/plans/2026-03-02-v1-design-decisions.md` | This doc. Running decision log. Primary artifact. | Yes — update continuously |
| `docs/plans/2026-02-26-v1-requirements.md` | Requirements doc. Update as decisions refine them. | Yes — update after themes conclude |
| `v1-missing-requirements-approved.md` (repo root) | Audit findings with user notes. Update review statuses. | Yes — update review statuses |
| `/home/guy/2026-02-25-gvp-requirements-for-doc-system.md` | TAStest integration requirements. | Read-only reference |

### Current Progress

**Completed:**
- Theme 1: Inheritance & Library Resolution (DEC-1.0 through DEC-1.11)
  - Post-theme self-check: done
  - Post-theme explorer audit: done
  - Gap resolution: done (6 new decisions from gaps)
  - User review: done
- Theme 2: Merge & Priority Semantics (DEC-2.1 through DEC-2.16)
  - Dates: ~2026-03-03 through 2026-03-16
  - Post-theme self-check: done
  - Post-theme explorer audit: done (16 findings, then 18-finding re-audit)
  - Gap resolution: done (10 new decisions from audit findings)
  - User review: done
- Theme 3: Dynamic Schema System in TypeScript (DEC-3.1 through DEC-3.12)
  - Date: 2026-03-17
  - Post-theme self-check: done
  - Post-theme explorer audit: done (15 findings)
  - Gap resolution: done (5 new decisions from audit findings)
  - User review: done
- Theme 4: Provenance System (DEC-4.1 through DEC-4.8)
  - Date: 2026-03-19
  - Post-theme self-check: done
  - Post-theme explorer audit: done (12 findings)
  - Gap resolution: done (2 new decisions from audit findings)
  - User review: done

- Theme 5: Validation Architecture (DEC-5.1 through DEC-5.13)
  - Date: 2026-03-19
  - Post-theme self-check: done
  - Post-theme explorer audit: done (18 findings)
  - Gap resolution: done (7 new decisions from audit findings)
  - User review: done

- Theme 6: Graph Traversal (DEC-6.1 through DEC-6.7)
  - Date: 2026-03-19
  - Post-theme self-check: done
  - Post-theme explorer audit: done (10 findings)
  - Gap resolution: done (3 new decisions from audit findings)
  - User review: done

- Theme 7: Renderer / Exporter Design (DEC-7.1 through DEC-7.11)
  - Date: 2026-03-20
  - Post-theme self-check: done
  - Post-theme explorer audit: done (13 findings)
  - Gap resolution: done (3 new decisions from audit findings)
  - User review: done

- Theme 8: CLI & Config Philosophy (DEC-8.1 through DEC-8.11)
  - Date: 2026-03-20
  - Post-theme self-check: done
  - Post-theme explorer audit: done (20 findings)
  - Gap resolution: done (4 new decisions from audit findings)
  - User review: done

- Theme 9: Naming & Identity (DEC-9.1 through DEC-9.7)
  - Date: 2026-03-20
  - Post-theme self-check: done
  - Post-theme explorer audit: done (15 findings)
  - Gap resolution: done (3 new decisions from audit findings)
  - User review: done

- Theme 10: Refs, Git Integration, & Embedding System (DEC-10.1 through DEC-10.16)
  - Date: 2026-03-20
  - Post-theme self-check: done
  - Post-theme explorer audit: done (18 findings)
  - Gap resolution: done (7 new decisions from audit findings)
  - User review: done

**ALL THEMES COMPLETE.**

**Next step:** Invoke `superpowers:writing-plans` to create the implementation plan.

**Theme order:**
1. ~~Inheritance & Library Resolution~~ ✓ (~2026-03-02)
2. ~~Merge & Priority Semantics~~ ✓ (~2026-03-03 to 2026-03-16)
3. ~~Dynamic Schema System in TypeScript~~ ✓ (2026-03-17)
4. ~~Provenance System~~ ✓ (2026-03-19)
5. ~~Validation Architecture~~ ✓ (2026-03-19)
6. ~~Graph Traversal~~ ✓ (2026-03-19)
7. ~~Renderer / Exporter Design~~ ✓ (2026-03-20)
8. ~~CLI & Config Philosophy~~ ✓ (2026-03-20)
9. ~~Naming & Identity~~ ✓ (2026-03-20)
10. ~~Refs, Git Integration, & Embedding System~~ ✓ (2026-03-20)
4. Provenance System
5. Validation Architecture
6. Graph Traversal
7. Renderer / Exporter Design
8. CLI & Config Philosophy
9. Naming & Identity

### Key Decisions That Affect Everything Downstream

Read these before starting any theme — they constrain all subsequent decisions:

- **DEC-1.0**: Both library-level and document-level inheritance. Dependencies implicit from document `meta.inherits`.
- **DEC-1.1**: Three-piece structure: `.gvp/library/` (portable), `.gvp/config.yaml` (committed project config), `.gvp.yaml` (local/gitignored).
- **DEC-1.1a**: Aliases are document-scoped, inherited by child documents (descendants override ancestors).
- **DEC-1.1b**: Canonical IDs are source-path-based: `@github:company/org-gvp:values:V1`.
- **DEC-1.1c**: Reference syntax `[[source:]document:]element`. Documents referenced by file path (not meta.name). Segment count determines scope (1=same doc, 2=same lib, 3=cross-lib).
- **DEC-1.3**: Priority is recursive DFS, ancestors win. Tag/category definition priority is INVERSE (descendant wins) — decided in DEC-2.1. Priority direction is configurable (also DEC-2.1).
- **DEC-1.8**: Circular deps: DFS cycle-breaking for priority + Tarjan's SCC for mutual access. SCC priority mode configurable (DFS-order default, equal-priority option).
- **DEC-1.9**: Git sources require immutable commit-ish (`@v1.2.3`). No branches. CLI auto-resolves branches/HEAD to commits.
- **DEC-2.1**: One DFS ordering, two directions. Elements: ancestor wins. Definitions: descendant wins. Both configurable via `priority.elements` / `priority.definitions`.
- **DEC-2.4**: `config_overrides` in library meta — ancestor-enforced settings with explicit `{ mode, value }` per key. All config options overridable. Processed after CFG-2 merging.
- **DEC-2.5**: Defaults are per-document only — no cascade through inheritance.
- **DEC-2.12**: Catalog preserves per-library definition context. Ancestor elements retain ancestor definitions even when descendants override them.
- **DEC-3.2**: Reserved field set (hardcoded in code, same namespace as dynamic fields). Collision = validation error at catalog build.
- **DEC-3.3**: Exporter-namespaced `export_options` on category definitions. Exporters must declare Zod schemas. Validated at catalog build.
- **DEC-3.9**: Category definitions are fully inherited across libraries, including all associated validation context.
- **DEC-4.7**: Unified provenance schema — three distinct entry types (origin, update, review) with UUIDs, structured identity, and `updates_reviewed` linking.
- **DEC-5.1**: Validation as a pipeline of independent passes. Five built-in passes: schema, structural, traceability, semantic, user_rules.
- **DEC-5.7**: Catalog errors = exceptions (fail-fast). Pass results = Diagnostics (collect-all). Two distinct error mechanisms.
- **DEC-8.9**: Four config layers — system (`/etc/gvp/`), global (`~/.config/gvp/`), project (`.gvp/config.yaml`), local (`.gvp.yaml`). Closer scope wins.
- **X.1**: NO backwards compatibility.

---

## How to Read This Document

Each theme section contains:
- **Context**: What problem we're solving and why it matters
- **Discussion Items**: Specific questions that need answers, with source references
- **Decision(s)**: What we decided, with rationale (added as conclusions are reached)

Items reference the missing-requirements audit (`v1-missing-requirements-approved.md`) and the v1 requirements doc (`docs/plans/2026-02-26-v1-requirements.md`).

Review statuses: `UNREVIEWED` → `DISCUSSED` → `DECIDED` → `CAPTURED` (in v1 requirements doc)

**Note on numbering**: Discussion item IDs (e.g., 2.1, 2.7) reflect the order items were identified. DEC numbers (e.g., DEC-2.1, DEC-2.7) reflect the order decisions were made. These do not correspond 1:1 — item 2.1 may resolve to DEC-2.7 because decisions were made in discussion order, not item order. Decision blocks within each theme appear in the order they were recorded, not in numeric sequence.

---

## Theme 1: Inheritance & Library Resolution

### Context

v0 supports document inheritance via `meta.inherits` with path-based and name-based resolution within a single library directory. The user wants v1 to support a much richer set of import sources (git repos, named system libraries, aliased imports) while handling name conflicts gracefully. This is foundational — most other design decisions depend on how libraries find and relate to each other.

### Discussion Items

| ID | Item | Source | Review Status |
|----|------|--------|---------------|
| 1.1 | Git-based imports (`@github:foo/bar`, `@azure:bar/baz/lol`) | missing-reqs: Loader/path-based inheritance | DECIDED (DEC-1.1c, DEC-1.2) |
| 1.2 | Named imports with aliasing (akin to `import foo as bar`) | missing-reqs: Loader/path-based inheritance | DECIDED (DEC-1.1a) |
| 1.3 | Name-based imports from system paths (e.g., `inherits: ["DevopsGVP"]`) | missing-reqs: Loader/path-based inheritance | DECIDED (DEC-1.1c — source path required) |
| 1.4 | Path-based imports (local filesystem) | missing-reqs: Loader/path-based inheritance | DECIDED (DEC-1.1, DEC-1.2) |
| 1.5 | Name conflict resolution without a global registry | missing-reqs: Loader/path-based inheritance | DECIDED (DEC-1.1a, DEC-1.1b — library-scoped aliases + source-path canonical IDs) |
| 1.6 | How org/personal libraries work in team/shared projects | missing-reqs: Loader/path-based inheritance | DECIDED (covered by DEC-1.0 through DEC-1.5) |
| 1.7 | Duplicate document name handling (currently W002) | missing-reqs: Loader/duplicate doc names | DECIDED (subsumed — same doc names in different libraries are fine by construction via DEC-1.1a, DEC-1.1b) |
| 1.8 | Priority: parent-wins vs child-wins, configurable | missing-reqs: Config/walk-backwards | DECIDED (DEC-1.3 — recursive DFS, ancestors win; tag priority inverse, deferred to Theme 2) |
| 1.9 | Manual library priority (`Map<Library, int>`) | missing-reqs: Config/walk-backwards | DECIDED (not needed — priority is structural from inherits order, DEC-1.3) |
| 1.10 | Interaction between parent-priority and manual-priority | missing-reqs: Config/walk-backwards | DECIDED (N/A — no manual priority, DEC-1.3) |

### Decisions

**DEC-1.0: Inheritance operates at both Library and Document levels**

- **Status**: Decided
- **Decision**: Libraries can depend on other libraries (for loading/resolution). Documents within a library can inherit from specific documents (for traceability). Two distinct mechanisms serving different purposes.
- **Rationale**: "i want this to be infinitely flexible. we might find that we like the values driving another project and want to import those but NOT the design decisions they ultimately led to (which hopefully would be captured in the same library but a separate file)."
- **Implication**: Both levels are expressed through document `meta.inherits`. A library's dependencies are implicit — they're the union of all external sources referenced by its documents' `inherits` blocks. There is no separate library-level dependency manifest (see DEC-1.1). The `inherits` mechanism serves dual purpose: it makes external documents *available* for reference AND establishes *traceability relationships*.
- **Rejected alternatives**:
  - *Document-level only*: A document inherits from specific documents (like v0). Libraries are just collections loaded together. Rejected: too inflexible — can't express "load this whole library but only inherit from one of its documents."
  - *Library-level only*: Libraries declare dependencies on other libraries. Individual documents don't declare inheritance. Rejected: too coarse — loses the ability to selectively inherit from specific documents within a library.

**DEC-1.0a: Library dependencies are fully transitive**

- **Status**: Decided
- **Decision**: If project A depends on library B, and B depends on library C, A automatically has access to C's documents. No private dependencies.
- **Rationale**: "i like transparency lol. that's a big part of this. things work best when everyone -- especially those actively working on a project -- know why and how decisions are being made, as messy as that might be."
- **Rejected alternatives**:
  - *Explicit only*: A only sees B's documents. If A wants C's, A must declare its own dependency on C. Rejected: more verbose, and the friction discourages the transparency that makes GVP valuable.
  - *Transitive but overridable* (`private: true`): Transitive by default, but a library can hide a dependency from consumers. Rejected: conflicts with the core value of transparency. "if you don't want consumers to see that part of your rationale for half-assing a feature is because some client rep insulted you lol, i would still include that in the GVP lib, BUT i'd just... not share that with the customer :p"

**DEC-1.1: Three-piece directory structure**

- **Status**: Decided
- **Decision**: Three distinct pieces:
  - **`.gvp/library/`** — THE Library. Portable, committed, shareable. Contains only GVP documents (`*.yaml`). This is what gets imported by other projects. For standalone GVP repos, `/gvp/` serves the same role.
  - **`.gvp/config.yaml`** — Project config. Committable and shareable, but NOT part of the Library. Contains project-level settings (strict mode, suppress_warnings, validation rules, AI config, etc.).
  - **`.gvp.yaml`** — Local/personal config. Conventionally gitignored. Personal overrides.
- **Rationale**: "i like strong, type-safe schemas everywhere -- even directory structures :p since `config.yaml` isn't the same 'type' of document as the library files, it doesn't track for me to have config.yaml live alongside the project's library documents." Principle: within a single directory, favor same-type for all sub-directories and same-type for all files. The Library directory contains ONLY documents — no config, no metadata files.
- **Implication**: `.gvp/` is a container with each child being a distinct type. `library/` is data iterated over. `config.yaml` is project settings read once at setup. Dependencies are NOT declared in config — they are implicit from document-level `meta.inherits` references.
- **Rejected alternatives**:
  - *`.gvp/` IS the library (flat)*: Documents live directly in `.gvp/` alongside `config.yaml`. Rejected: mixes data files with metadata files, breaking the "same-type siblings" principle.
  - *`.gvp/` portable + `.gvprc` local*: `.gvp/` is the entire portable library (no `library/` subdir), `.gvprc` is local config. Rejected: doesn't mirror git's `.git/config` pattern. Also loses the ability to have a committed config alongside a local-only config.
  - *Dependency manifest in config.yaml or library.yaml*: Library dependencies declared in a separate manifest file. Rejected: unnecessary — dependencies are implicit from document `meta.inherits` blocks. "we don't need to define dependencies anywhere except in the docs that inherit them. this also simplifies the inheritance/merging logic"

**DEC-1.1a: Source and alias inheritance through document hierarchy**

- **Status**: Decided
- **Decision**: Aliases are defined per-document in `meta.inherits` using an `as` field. An alias replaces only the source segment of a reference — document and element segments are always explicit. **Child documents inherit all of their parents' source access and aliases**, with reverse priority (descendants take priority over ancestors) for alias conflict resolution. A child document does NOT need to redeclare a source that its parent already inherits — it can reference that source by its parent's alias or by the full source path.
- **Syntax**: `inherits` entries are polymorphic — bare strings for local documents, objects for external sources:
  ```yaml
  # doc-a.yaml
  meta:
    name: doc-a
    inherits:
      - source: "@github:company/org-gvp"
        as: org

  # doc-b.yaml
  meta:
    name: doc-b
    inherits:
      - doc-a                                  # local: inherits doc-a, gaining access to "org" alias
      - source: "@github:shitchell/my-gvp"    # external: git-based source
        as: personal                           # alias (optional, replaces source in maps_to)
  ```
  Then in doc-b's `maps_to`:
  - `doc-a:V1` — element V1 in local document "doc-a" (2-segment, same library)
  - `org:values:V1` — element V1 in document "values" from the library aliased "org" (3-segment, cross-library; alias inherited from doc-a)
  - `personal:my-principles:P1` — element P1 in document "my-principles" from personal lib (3-segment, cross-library; own alias)
- **Rationale**: "this allows maximum portability since new and divergent Libraries can be added without needing to know or care what aliases other Libraries are using." Source inheritance through the document hierarchy avoids repetitive redeclaration: "child documents inherit all of their parents' sources using reverse priority (i.e.: descendants take priority over ancestors) for alias conflict resolution". "this would still apply even if an alias isn't defined for a source; child documents would still have access to the inherited source by full source path."
- **Rejected alternatives**:
  - *Global aliases*: Aliases declared once and shared across all libraries in the dependency tree. Rejected: requires coordination between independent library authors, breaks portability.
  - *Library-scoped aliases in a manifest/config*: Aliases declared once for the whole library. Rejected: no library-level dependency manifest exists — dependencies are implicit from document `inherits`.
  - *No aliases (source paths only)*: Always use full source paths in references. Rejected: too verbose for day-to-day YAML authoring (`@github:company/org-gvp:values:V1` in every `maps_to` entry).
  - *Aliases include the document segment*: `inherits` entries specify both `source` and `document`, alias replaces both. Rejected: "i wouldn't specify the document? i don't see a need." The alias should only update the source name; documents are always referenced explicitly.
  - *No source inheritance (each document must redeclare)*: Every document must explicitly declare all external sources it needs. Rejected: repetitive and error-prone when multiple documents in a library need the same external sources.

**DEC-1.1b: Source-path-based canonical IDs**

- **Status**: Decided
- **Decision**: The catalog uses source-path-based canonical identifiers internally and in all output (JSON, trace, etc.). Format: `@github:company/org-gvp:values:V1`. Library names don't need to be globally unique.
- **Rationale**: "thinking through [library-name based] leads to either (a) your constraint about uniqueness that i'm trying to avoid per my previous rationale -- easier addition of new Libraries that don't have to know or care about prior aliases -- and (b) if we aim to preserve that flexibility we could do so by including the alias from each Library in the catalog tree... but then that gets confusing for the end-user if different Libraries use different aliases :p source path based is just the easiest."
- **Implication**: Verbose but unambiguous. CLI output and renderers can optionally shorten to aliases for readability, but the canonical form is always available.
- **Rejected alternatives**:
  - *Library-name based* (e.g., `org-gvp:values:V1`): Uses each library's own declared `name` field. Shorter and more readable. Rejected: requires library names to be globally unique within the dependency tree, which conflicts with the goal of friction-free library addition.
  - *Flat document:element (v0 style)* (e.g., `values:V1`): Requires document names to be globally unique. Rejected: fragile with multiple libraries — name collisions are likely and force refactoring.

**DEC-1.1c: Element reference syntax**

- **Status**: Decided
- **Decision**: References use `[[source:]document:]element` syntax. Cross-library references always require the document name (no skipping). Document references use the file path relative to the library directory, without the `.yaml` extension.
  - `V1` — element V1 in the same document (1-segment)
  - `gvp:V1` — element V1 in the document at `gvp.yaml` within the same library (2-segment)
  - `v0/decisions:D1` — element D1 in the document at `v0/decisions.yaml` within the same library (2-segment, subdirectory)
  - `org:values:V1` — element V1 in document `values.yaml` from the library aliased "org" (3-segment, cross-library)
- **No ambiguity between aliases and document paths**: An alias replaces only the *source* segment. A 2-segment reference is ALWAYS `document:element` (same library). A 3-segment reference is ALWAYS `source:document:element` (cross-library). If you have a local document named "personal" AND an alias "personal", `personal:V1` refers to the local document. To use the alias, you must include the document: `personal:some-doc:V1`.
- **Rationale**: "Always require document" for cross-references — no ambiguity, no guesswork. Bare names (single segment) resolve within the same document only. Two segments resolve within the same library. Three segments cross library boundaries. This also enables each document to maintain its own isolated numbering starting from 0 — "the biggest overarching reason for this is to reduce error while ensuring uniqueness. if we wanted to support a `[V1]` syntax that works across documents in the same library, then we would need to ensure V1 remains unique across all documents. that means, within the same document, numberings can end up starting at non-zero indices or skipping chunks. this adds a lot of overhead, requiring manual review of all documents if adding new elements manually. and especially right now while we're manually updating YAML files, that's very error prone. in the (hopefully near) future when we are strictly updating this through automated tools, it will be less of a concern. but if, for any reason even in the future, a user wants/needs to update a YAML file manually, this option makes that easier and less error prone"
- **Document references are path-based**: Documents are referenced by their file path (without extension) relative to the library directory, not by `meta.name`. Rationale: "i kinda prefer referencing them by path (without the extension) than name in `maps_to` or `inherits`... i favor the explicitness of path-based references." The `meta.name` field is retained for display/labeling purposes.
- **Canonical form**: `@github:shitchell/my-gvp:personal:V1` (source path replaces alias in catalog output).
- **Rejected alternatives**:
  - *Allow skipping document when unambiguous*: `personal:V1` works if V1 is unique across a library, error if ambiguous. Rejected: "Always require document" — no guesswork. Segment count unambiguously determines scope (1=same doc, 2=same library cross-doc, 3=cross-library).
  - *Different separators* (e.g., `/` for document, `:` for library): `gvp/V1` for document scope, `personal:V1` for library scope. Rejected: adds syntax complexity without clear benefit given that segment count already disambiguates.
  - *Name-based document references*: Use `meta.name` instead of file path for document references. Rejected: paths are more explicit, don't require opening files to discover names, and naturally handle subdirectories.

**DEC-1.2: Remote import convention — dual lookup paths**

- **Status**: Decided
- **Decision**: When importing from a remote source (e.g., `@github:foo/bar`), the resolver checks two locations in the target repo: `/.gvp/library/` first, then `/gvp/`. This allows importing from both normal projects (which embed GVP in `.gvp/`) and standalone GVP repos (which use a top-level `gvp/` directory).
- **Rationale**: "this allows us to import a normal project OR for a repo that is explicitly for tracking company GVPs to keep those files in a non-hidden directory with surrounding documentation that isn't bundled with the library itself"
- **Implication**: Standalone GVP repos can have `gvp/` with documents plus `README.md`, `docs/`, etc. at the top level without that surrounding documentation being treated as library content.
- **Rejected alternatives**:
  - *Single lookup path (`.gvp/library/` only)*: Only look in `.gvp/library/`. Rejected: forces standalone GVP repos to use a hidden directory, burying the primary content.
  - *Convention-free (user specifies path in source)*: e.g., `@github:foo/bar#path/to/library`. Maximum flexibility but requires each consumer to know the internal structure of the source repo.

**DEC-1.3: Inheritance priority — recursive depth-first, ancestors win**

- **Status**: Decided
- **Decision**: Priority is determined by the `inherits` order in each document, resolved recursively depth-first with parents expanded before the parent itself. Given `D inherits [A, E]` and `A inherits [B, C]`, the resolution order for D is: **B, C, A, E**. The most upstream ancestors have the highest priority.
- **Rationale**: "if Document A inherits B then C, then Document D inherits A then E, Document D's priority would be B, C, A, E. i.e.: parents get decomposed into *their* parents (which take priority over the parent)"
- **Implication**: The most foundational, broadly-shared definitions are the hardest to override. In an org context: company-wide values (top of chain) override team values (mid-chain), which override project values (leaf). Priority is per-document (different documents in the same library can have different inheritance chains).
- **Note**: Tag/category definition priority uses inverse order (descendant wins by default). Decided: see DEC-2.1.
- **Rejected alternatives**:
  - *Dependency order in config.yaml*: Library-level dependencies determine priority. Rejected: config.yaml dependencies just make documents available — priority is a document-level concern established through `inherits`.
  - *Inheritance depth / closest wins*: Definitions from the current library override those from direct dependencies, which override transitive. Rejected for structural inheritance priority (but may apply to tag/category definitions — see Theme 2).
  - *Configurable strategy*: Default to one approach, config flag to switch. Decided: see DEC-2.1 — both `priority.elements` and `priority.definitions` are configurable.

**DEC-1.4: Semantic conflicts exist only at the decision layer**

- **Status**: Decided
- **Decision**: Goals, values, and principles don't "conflict" — they coexist, and their tension is a feature. Conflicts only materialize at the heuristic, rule, and decision layers, where concrete choices must satisfy potentially competing upstream elements. Resolving these conflicts is fundamentally a human activity.
- **Rationale**: "for goals, values, and principles, the only conflict might be in how humans feel around what decisions best account for all of the merged GVPs. and THAT is handled however the humans decide lol." The example given: personal value "optimize for developer happiness" vs company value "optimize for compliance" don't conflict — but a personal heuristic "secrets can be stored in repos if test repo + zero cost" vs a company rule "no secrets in repos ever" DO conflict at the decision layer.
- **Implication**: The tool's job is to surface these tensions, not resolve them. Structural detection of tension is tractable (e.g., a decision mapping to both a heuristic and a rule that address the same concern). Full semantic conflict detection is aspirational — "i am not sure what GVP could do to assess this semantic conflict, although i would LOVE to find a way to automate surfacing that conflict"
- **Rejected alternatives**:
  - *Require explicit resolution*: If two inherited root elements appear to conflict, require the project to document a resolution. Rejected: the tool can't reliably detect semantic conflict at the goal/value level. Forcing resolution of non-conflicts adds friction without value.
  - *Out of scope for v1*: Defer entirely. Partially rejected: structural tension detection (heuristic vs rule on same decision) is tractable for v1. Full semantic analysis is deferred.

**DEC-1.5: AI-assisted mapping suggestions and conflict detection**

- **Status**: Decided
- **Decision**: Two AI-assisted features built into `gvp` as optional, config-gated capabilities:
  1. **Candidate mapping suggestions** (embeddings): Ingest the full catalog, surface elements a decision should probably map to but doesn't. Uses vector similarity — no LLM needed.
  2. **Semantic conflict review** (LLM): Ingest the full catalog, assess gaps across the board and conflicts within decisions. Requires LLM API call.
  Both require user configuration (API key, model) and are fully optional. No AI dependency for core functionality.
- **Rationale**: "for this, i'm thinking that we just set up the ability for users to configure an API key and model. i would envision the AI-assist for #1 as being a behind-the-scenes prompt to ingest the entire Catalog and then assess gaps across the board and conflicts within Decisions. for both AI and embedding options, i'd build those into `gvp` itself but require config to setup and both be optional"
- **Deferred**: Generic hook/event system (`onAdd()`, `onValidate()`, etc.) for user-overridable behavior. Rationale for deferral: "(1) i don't immediately see a great value-add or how it *should* be integrated and (2) it's a super simple addition later. it takes next to nothing to scatter empty `onFoo()` functions that we let the user override."
- **Rejected alternatives**:
  - *Separate companion package* (`gvp-ai`): Core stays pure, AI in separate install. Rejected: the features are simple enough to include in core behind config gates. Separate packages add friction for users.
  - *Hook-only approach*: Core provides structured hooks, users wire in their own AI tools. Rejected for v1: premature — no clear design for how hooks should integrate. Deferred as a future enhancement.

**DEC-1.6: Document names must be unique within a library (path-based identity)**

- **Status**: Decided
- **Decision**: No two documents within the same library may have the same file path (trivially enforced by the filesystem). Document identity within a library is the file path relative to the library directory, without extension. The `meta.name` field is retained for display/labeling but is NOT used for reference resolution.
- **Rationale**: "i kinda prefer referencing them by path (without the extension) than name in `maps_to` or `inherits`... i favor the explicitness of path-based references."
- **Rejected alternatives**:
  - *Name-based identity*: Use `meta.name` as document identity. Rejected: requires opening files to discover names, doesn't naturally handle subdirectories, and allows naming conflicts that paths prevent by construction.

**DEC-1.7: Local path syntax for filesystem-based sources**

- **Status**: Decided
- **Decision**: Local filesystem sources use relative (`./path/to/library`) or absolute (`/path/to/library`) paths in `inherits` source entries. No `file:///` URL scheme.
- **Syntax**:
  ```yaml
  inherits:
    - source: "./shared-gvp/library"       # relative to this library's directory
      as: shared
    - source: "/usr/share/gvp/devops"      # absolute path
      as: devops
  ```
- **Rejected alternatives**:
  - *`file:///` URL scheme*: `source: "file:///usr/share/gvp/devops"`. Rejected: unnecessary verbosity for a common case. Relative and absolute paths are unambiguous and familiar.

**DEC-1.8: Circular dependency handling**

- **Status**: Decided
- **Decision**: Circular dependencies are detected and handled in two phases:
  1. **DFS with cycle-breaking**: DFS traversal detects cycles and breaks them at the back-edge (skipping the already-visited node). A warning is emitted identifying the full cycle path. Priority within the cycle follows DFS completion order by default.
  2. **SCC post-pass for mutual access**: After DFS, Tarjan's algorithm identifies all strongly connected components (SCCs). All documents within an SCC get mutual access to each other's elements, regardless of where cycles were broken. This ensures no document loses access to elements it should be able to reference.

  **Priority within SCCs is configurable**:
  - **Default: DFS-order-dependent** — priority follows DFS completion order, which is determined by the `inherits` declaration order of whichever document first introduces the cycle members. Deterministic and predictable.
  - **Option: Equal priority within SCCs** — documents in the same SCC have no priority ordering between them. Definition conflicts within an SCC are resolved by a simple tie-breaker (e.g., alphabetical path). Only non-cycle ancestors have real priority.

  Solid documentation is required to explain the difference between the two modes.

- **Rationale**: "i feel like DFS-order-dependent is fine; if jack lists bob over it department, then perhaps that should be the priority? BUT i feel like we're stretching imagine into wild hypotheticals around bad design in ways i can't easily visualize lmao, so it's hard to say; maybe there is some scenario where this sort of way of defining things makes sense, and if so, i cannot readily imagine it let alone consider what its priority should look like. so with that, i'd say: make it configurable :p AND we need solid documentation around this to explain the difference between the two options. i'd default to the DFS-order-dependent priority"
- **Technical note**: Tarjan's SCC detection runs in O(V+E), single pass, and handles arbitrarily complex overlapping cycles. The post-pass for mutual access is a bulk operation on each SCC — no iterative propagation needed, even when cycles intersect.
- **Rejected alternatives**:
  - *Error (hard stop)*: Circular dependencies are always an error. Rejected: too strict — cycles may occur temporarily during development and shouldn't block all operations.
  - *Warning + arbitrary break, no mutual access*: Detect cycle, break it, and let the broken document lose access. Rejected: the document at the break point would arbitrarily lose access to elements it should be able to reference.
  - *Neighbor proximity for priority*: Use graph distance from entry point instead of DFS order. Rejected: adds complexity without clear benefit — DFS order already reflects traversal distance modulated by declared `inherits` order.

**DEC-1.9: Version pinning for git-based sources**

- **Status**: Decided
- **Decision**: Git-based sources require an immutable commit-ish specifier using `@`: `@github:foo/bar@v1.2.3`. Only commits and tags are valid — branches are NOT stored in YAML. If the commit-ish cannot be resolved, it is an error. If no commit-ish is specified in the YAML, it is an error.
  - **CLI auto-resolution**: When adding a new external source via the CLI (or TUI/GUI), users can provide a `--ref` flag. If a branch is given, the tool resolves its HEAD commit and inserts the commit SHA. If no ref is given, the tool resolves the HEAD of the default branch to a commit SHA and inserts that. The user never has to manually look up a commit hash.
  - **Example flow**: `gvp add-source @github:company/org-gvp --ref main` → resolves `main` to `abc1234`, writes `source: "@github:company/org-gvp@abc1234"` into the YAML.
- **Rationale**: "let's go with error [for no commit-ish]. and let's ensure our automated views (CLI, TUI, GUI) offer a `--ref` or similar input. if a branch is given, resolve the HEAD commit and insert that instead of the branch name. if no ref is given, resolve the HEAD of the default branch to a commit and insert that."
- **Rejected alternatives**:
  - *Allow branches*: `@github:foo/bar@main` resolves to HEAD of branch. Rejected: branches are mutable — the same reference resolves to different content over time, breaking reproducibility.
  - *Always HEAD*: No version pinning, always latest. Rejected: no reproducibility, no way to prevent upstream changes from breaking your library.
  - *No ref = latest tag*: If no commit-ish, auto-resolve to latest tag. Rejected: implicit behavior — error is more honest and forces explicit pinning.

**DEC-1.10: Dual lookup path priority**

- **Status**: Decided
- **Decision**: When importing from a remote source and both `/.gvp/library/` and `/gvp/` exist, `/gvp/` wins.
- **Rationale**: A top-level `gvp/` directory is an explicit, non-hidden declaration that this repo is a GVP library. It signals stronger intent than a `.gvp/library/` embedded in a project.
- **Rationale**: A top-level `gvp/` directory is an explicit, non-hidden declaration that this repo is a GVP library — it signals stronger intent. This also enables a "meta-GVP" pattern: a repo can offer an importable GVP library at `/gvp/` while maintaining its own internal GVP library at `/.gvp/library/` for that repo's own development decisions, separate from the importable one.
- **Rejected alternatives**:
  - *`.gvp/library/` wins*: Hidden directory takes priority. Rejected: the non-hidden directory signals stronger intent.
  - *Merge both*: Load documents from both locations. Rejected: ambiguous — could lead to duplicate documents and unclear ownership.
  - *Error if both exist*: Force the repo to pick one. Rejected: too strict — a project might legitimately have both (importable library + internal library).

**DEC-1.11: Same-source multiple aliases**

- **Status**: Decided
- **Decision**: A document may alias the same source multiple times with different aliases. This is allowed (not an error).
- **Rationale**: No strong use case identified, but no reason to prohibit it either. Restrictive validation without clear benefit adds friction.

---

## Theme 2: Merge & Priority Semantics

### Context

When multiple libraries and documents contribute definitions (tags, categories, defaults, elements), how do conflicts resolve? v0 uses first-wins for tags and categories, no-override for defaults. The user wants this to be configurable and consistent.

### Discussion Items

| ID | Item | Source | Review Status |
|----|------|--------|---------------|
| 2.1 | `_all` keyword merge timing and semantics | missing-reqs: Schema/_all keyword | DECIDED (DEC-2.7) |
| 2.2 | Defaults merging: no-override vs override behavior | missing-reqs: Loader/defaults merging | DECIDED (DEC-2.5) |
| 2.3 | Tag definition accumulation semantics | v1-reqs: DOM-7 | DECIDED (DEC-2.1) |
| 2.4 | Category definition accumulation semantics | v1-reqs: DOM-5 | DECIDED (DEC-2.1) |
| 2.5 | Tag/category priority is INVERSE of inheritance priority (closest wins) | DEC-1.3 note, Theme 1 discussion | DECIDED (DEC-2.1) |
| 2.6 | Intra-library definition conflicts (two docs in same library define same tag) | Theme 1 discussion | DECIDED (DEC-2.6) |
| 2.7 | field_schemas cascade across libraries | Merge audit, inconsistency C | DECIDED (DEC-2.2) |
| 2.8 | Config discovery vs document priority are separate systems | Merge audit, inconsistency B | DECIDED (DEC-2.3) |
| 2.9 | config_overrides in library meta (ancestor-enforced settings) | Discussion of org enforcement needs | DECIDED (DEC-2.4) |
| 2.10 | `_all` vs per-category field conflict resolution | Audit finding 1+2 | DECIDED (DEC-2.8) |
| 2.11 | config_overrides within SCC (circular deps) | Audit finding 8 | DECIDED (DEC-2.9) |
| 2.12 | W007/W008 scope: within-library only, not cross-library | Audit finding 3 | DECIDED (DEC-2.10) |
| 2.13 | All config.yaml options valid in config_overrides | Audit finding 4 | DECIDED (DEC-2.11) |
| 2.14 | Definition context preserved per-library in Catalog | Audit finding 5 | DECIDED (DEC-2.12) |
| 2.15 | config_overrides requires explicit mode on every key | Audit finding 14 | DECIDED (DEC-2.13) |
| 2.16 | Drop domain/concern tag delineation — flat generic tags | Audit finding 12 + discussion | DECIDED (DEC-2.14) |
| 2.17 | Drop `libraries` config field — deps are implicit from `meta.inherits` | Audit finding 10 + DEC-1.1 implication | DECIDED (DEC-2.15) |
| 2.18 | CFG-2 language outdated — requires update notes | Audit finding 7+10 | DECIDED (DEC-2.16) |

### Decisions

**DEC-2.1: Definition priority is inverse of element priority (configurable)**

- **Status**: Decided
- **Decision**: Tag and category *definitions* use the same DFS priority ordering as elements (DEC-1.3), but in reverse — descendants (closest to the project) win by default. Elements continue to use ancestor-wins by default. Both are independently configurable:
  ```yaml
  priority:
    elements: ancestor      # default
    definitions: descendant  # default
  ```
  Valid values: `ancestor` | `descendant`. The resolver computes one ordered list of documents (DFS per DEC-1.3), then iterates forward or backward depending on the merge type.
- **Rationale**: "i would have it use the same exact priority order BUT in reverse (closest to the project). this keeps the logic simpler, consistent, and predictable. one way to order loaded files." Definitions are vocabulary — projects should speak their own language. Elements are authority — org-level goals/values should be hard to accidentally override. Configurability satisfies V8 and P8: "if there's some context where someone wants org tag definitions to take priority, they can."
- **Naming**: Priority direction uses `ancestor`/`descendant` terminology. "i feel like that *might* feel a little technical for some users, but we can abstract that away in UIs. i think it makes sense for the underlying technical pieces to retain precise language."
- **Rejected alternatives**:
  - *Same direction for everything (ancestor wins)*: Consistent but prevents projects from customizing vocabulary to fit their domain.
  - *Separate ordering algorithms*: More flexible but adds complexity — two systems to learn and maintain instead of one algorithm with a direction flag.
- **Implication**: One DFS ordering, two iteration directions. UIs can abstract `ancestor`/`descendant` into friendlier labels (e.g., "Company overrides project" / "Project overrides company"). Adopts the "closest wins" (inheritance depth) approach for definitions, which was deferred from DEC-1.3's rejected alternatives. Also resolves DEC-1.3's deferred configurability — both directions are now configurable.

**DEC-2.5: Defaults are per-document only (no cascade)**

- **Status**: Decided
- **Decision**: `meta.defaults` applies only to elements within the document that defines them. Defaults do not cascade through inheritance — a child document does not inherit its parent's defaults. Each document is responsible for declaring its own defaults.
- **Rationale**: Cascading defaults creates surprising leakage. Example: an org defines `defaults: { tags: [compliance] }` for its own elements, but if defaults cascade, child projects silently inherit `tags: [compliance]` on every element — even though the org didn't intend that as a mandate. Per-document scoping avoids this: "yeah, i think we say defaults are per-document. that feels best here." This is also consistent with v0 behavior.
- **Rejected alternatives**:
  - *Cascade with descendant-wins*: Defaults accumulate through the inheritance chain, descendant overrides ancestor. Rejected: can't distinguish "defaults for my own elements" from "defaults I want to impose on all children." Leads to surprising leakage (scenario 3 in discussion).
  - *Cascade with ancestor-wins*: Org defaults override project defaults. Rejected: even more restrictive — projects can't set their own defaults without `config_overrides`.
  - *Per-library scoping*: Defaults apply to all documents within a library but not across library boundaries. Rejected: per-document is simpler and already the v0 behavior. No use case identified for library-wide defaults that document-level defaults can't handle.
- **Implication**: One fewer merge point in the system. Defaults are simple: define them where you use them. Defaults are applied at load time and baked into the element's resolved form before the element is made available to child documents (DEC-1.0a). Transitive library elements are visible to child documents, but the defaults that shaped them are not propagated — elements are seen in their default-resolved form. The full resolved catalog preserves all per-library resolved elements, defaults, and definitions (DEC-2.12).

**DEC-2.7: `_all` expands after full catalog merge (globally)**

- **Status**: Decided
- **Decision**: `_all` field schemas are applied after all documents have been loaded and all categories have been accumulated into the final merged catalog. Every `_all` block from every document applies to every category in the final set — including categories that were defined by downstream documents the `_all` author didn't know about. Priority for conflicting `_all` schemas follows DEC-2.1 (descendant wins by default for definitions).
- **Rationale**: "`all` means 'all', not 'all core GVP elements'." If an org says "every element type has a priority field," that should hold for element types defined downstream too.
- **Rejected alternatives**:
  - *Expand at definition time per-document*: Each document's `_all` only applies to categories known at that document's load point. Rejected: violates the plain meaning of "all" — a new category added downstream wouldn't get the org's universal fields, creating inconsistency.
- **Implication**: Load order is: (1) accumulate all category definitions across all documents, (2) apply all `_all` blocks to the full category set, (3) run post-merge validation. `_all` conflicts between documents follow the same priority direction as category definitions (DEC-2.1).

**DEC-2.6: Intra-library sibling definition conflicts — warning + DFS tiebreak**

- **Status**: Decided
- **Decision**: When two sibling documents within the same library (neither inherits from the other) define the same tag or category, the definition from whichever document appears first in DFS traversal wins. W007 (duplicate tag) or W008 (duplicate category) is emitted as a warning. Parent/child overrides (where a child document redefines a tag or category from a parent) emit W011 (parent-child definition override) — a separate, independently suppressible warning. W011 uses a distinct code so users who consider parent-child overrides intentional can suppress it without also suppressing the sibling conflict warnings (W007/W008).
- **Rationale**: Sibling conflicts are likely unintentional duplication, so a warning is appropriate. Parent/child overrides are more likely intentional but still worth flagging for auditability: "i'd probably go ahead and flag it as a warning? users can suppress it if they want." Separate warning codes for sibling vs parent-child ensures independent suppressibility.
- **Rejected alternatives**:
  - *Hard error on sibling duplicates*: Forces consolidation into one document. Rejected: too strict — may be temporarily useful during development and doesn't warrant blocking.
  - *Definitions must live in a single designated document*: Eliminates conflict by construction. Rejected: too rigid — "what if you want to organize definitions alongside the elements they describe?"
  - *Silent parent/child overrides (no warning)*: Originally decided, then revised. Parent-child overrides are a feature, but flagging them as a suppressible warning supports auditability without imposing friction.
- **Implication**: W007/W008 fire for sibling conflicts. W011 fires for parent-child definition overrides. All are independently suppressible.

**DEC-2.2: field_schemas cascade across library boundaries (descendant wins)**

- **Status**: Decided
- **Decision**: When a child library/document overrides a category definition that a parent also defines, the `field_schemas` within that category are deep-merged, with descendant fields winning on conflict. This means a department can define a `coding_standard` element type with custom field schemas and mapping rules, and child projects inherit those schemas — they don't need to redeclare them.
- **Rationale**: "a department could define its own element types with custom rules that say XYZ must map to this new element. for that to be adhered to, we would need those to cascade." Follows DEC-2.1's descendant-wins default for definitions.
- **Rejected alternatives**:
  - *Per-library scoping (no cascade)*: Each library defines its own field schemas independently. Rejected: breaks the use case of org-defined element types that child projects must adhere to.
  - *Wholesale replacement*: Child's category definition completely replaces parent's, including all field_schemas. Rejected: loses parent's fields unnecessarily when child only wants to add or override one field.

**DEC-2.3: Config discovery and document priority are separate systems**

- **Status**: Decided
- **Decision**: Config discovery (walk-backwards from CWD) determines the project's own `.gvp/library/` location and config settings. Document-level priority (DFS from `meta.inherits`, DEC-1.3) determines *who wins* in conflicts among loaded documents. These are independent systems — config does NOT determine element or definition priority. Priority is always driven by the `meta.inherits` chain. Note: the v0 `libraries` config field is dropped in v1 (DEC-2.15) — all library loading beyond the project's own library is driven by `meta.inherits` source resolution.
- **Rationale**: Config says "here are your settings." Inheritance says "these are my authorities." Conflating the two would create counterintuitive behavior where the directory a library happens to live in affects its semantic authority.
- **Implication**: Resolves inconsistency B from the merge audit. Config is for settings (strict, suppress_warnings, validation_rules), not for library loading.

**DEC-2.4: config_overrides in library meta (ancestor-enforced settings)**

- **Status**: Decided
- **Decision**: Any GVP document may include a `meta.config_overrides` block containing config settings that are enforced with **ancestor priority** (most upstream wins). This is the one exception to the general descendant-wins pattern for non-element data. Every key requires an explicit `{ mode, value }` wrapper (see DEC-2.13):
  ```yaml
  meta:
    config_overrides:
      strict:
        mode: replace
        value: true
      suppress_warnings:
        mode: additive
        value: [W001]                       # additive: project can add, not remove
      priority:
        mode: replace
        value:
          elements: ancestor
  ```
  All config.yaml options are valid keys in `config_overrides` (see DEC-2.11). `config_overrides` is processed AFTER all config file merging (CFG-2) — the result of CFG-2 merging is the baseline, then `config_overrides` values from the inheritance chain are applied on top with ancestor-wins priority (see DEC-2.13 for mode semantics).
- **Rationale**: "what if we allow a `config_overrides` in the meta block of a library, and *that* particular block is always parsed with ancestor priority?" Most config should be descendant-wins (your project, your rules), but orgs need a mechanism to enforce certain settings. Per-setting mode control: "by default it's complete replacement? but it'd be nice if we offered some way to change that. like if we had a ~~global 'additive/replace' option for all config_overrides AND~~ a per-setting additive/replace setting."
  *(Note: the global mode default was subsequently rejected in favor of requiring explicit `{ mode, value }` on every key — see DEC-2.13.)*
- **Rejected alternatives**:
  - *All config ancestor-wins*: Org controls everything. Rejected: too restrictive — projects need autonomy for most settings.
  - *Sigil/prefix convention* (e.g., `+[W001]` for additive): Compact but introduces magic syntax. Rejected in favor of the object wrapper: "No magic sigils to learn or explain. Schema validates cleanly."
  - *No org enforcement mechanism*: Projects always have final say. Rejected: "we might have cases where an org wants to enforce certain config settings."
  - *Polymorphic syntax (bare values or objects)*: Originally proposed — bare values use a global `mode` default, objects specify per-key mode. Rejected in favor of requiring explicit `{ mode, value }` on every key (DEC-2.13): clearer, no ambiguity, easier to understand.
- **Implication**: `config_overrides` is the org's enforcement tool. Regular config (`config.yaml`, `.gvp.yaml`) remains descendant-wins. The two systems compose: org locks what it cares about, project controls the rest. Any document can contain `config_overrides` — ancestor-wins priority across the full inheritance chain handles conflicts.

**DEC-2.8: Explicit per-category field_schemas always win over `_all`**

- **Status**: Decided
- **Decision**: When `_all` and an explicit per-category definition both define the same field on the same category, the explicit per-category definition always wins — regardless of which document defined them or the priority direction. This applies both within a single document and across documents. For cross-library `_all` conflicts (two libraries both define `_all` with different values for the same field), standard DEC-2.1 priority (descendant-wins by default) applies. But a category-specific `field_schemas` entry always beats an `_all`-sourced entry for the same field, even if the `_all` comes from a higher-priority document.
- **Rationale**: "`_all` is a default, but category-specific definitions should override for specificity's sake." Cross-library `_all` conflicts use "standard priority rules when determining cross-Library `_all` conflicts, and for cross-Library/inheritance conflicts between `_all` and a category-specific definition, the category-specific will still always win." Principle: explicit beats implicit.
- **Rejected alternatives**:
  - *`_all` wins after expansion (universal override)*: `_all` fields overwrite per-category fields. Rejected: makes `_all` a foot-gun — defining a universal field would silently override intentional per-category customizations.
  - *Normal priority direction applies to both equally*: After `_all` expansion, treat all fields identically for priority. Rejected: loses the semantic distinction between "I defined this field specifically for this category" vs "I defined this field for everything."
- **Implication**: `_all` serves as "universal default field schemas." Per-category is "specific override." The resolution order is: (1) accumulate all categories (DEC-2.1), (2) expand `_all` into all categories (DEC-2.7), (3) explicit per-category fields override `_all`-sourced fields for the same field name — regardless of which document the `_all` or per-category definition came from (cross-document scope), (4) remaining cross-document conflicts among same-source fields (e.g., two `_all` definitions for the same field) resolved by DEC-2.1 priority direction.

**DEC-2.9: config_overrides within SCC — DFS tiebreak + warning**

- **Status**: Decided
- **Decision**: When two documents in a strongly connected component (SCC / circular dependency) both define `config_overrides`, the conflict is resolved as follows:
  - **DFS-order SCC mode (default)**: The DFS-tiebreak mechanism from DEC-1.8 determines the winner (entry-point-dependent). W010 is emitted.
  - **Equal-priority SCC mode**: Alphabetical path tiebreak determines the winner, consistent with DEC-1.8's equal-priority tie-breaking mechanism. W010 is emitted.
  In both cases, resolution may differ depending on which project is the entry point (DFS mode) or may be deterministic but arbitrary (equal-priority mode). W010 (conflicting config_overrides within SCC) is always emitted to flag the design smell.
- **Rationale**: Circular libraries with enforcement settings is a design smell worth flagging. Entry-point-dependent resolution is consistent with DEC-1.8's existing SCC behavior for element priority. Equal-priority mode still needs a deterministic winner for config — alphabetical tiebreak is consistent with DEC-1.8's own equal-priority behavior.
- **Rejected alternatives**:
  - *Hard error*: `config_overrides` in an SCC is always an error. Rejected: too strict — may block valid development scenarios.
  - *Merge all SCC config_overrides equally*: Combine them without tiebreak. Rejected: additive keys might work, but replace keys need a deterministic winner.
  - *DFS-tiebreak only (no equal-priority path)*: Ignore the equal-priority SCC mode for config_overrides. Rejected: leaves an undefined behavior for a supported configuration.

**DEC-2.10: W007/W008 fire only for within-library sibling conflicts**

- **Status**: Decided
- **Decision**: Duplicate tag (W007) and duplicate category (W008) warnings fire only when two sibling documents *within the same library* define the same tag or category. Cross-library overlaps (two independent libraries both defining `reliability`) are expected and resolved silently by DEC-2.1's priority direction.
- **Rationale**: "cross-library tag overlaps are expected and resolved silently." Independent libraries are expected to define overlapping vocabulary. Emitting W007/W008 for every cross-library overlap would be extremely noisy.
- **Implication**: Clarifies DEC-2.6's scope. W007/W008 are intra-library sibling hygiene warnings. W011 (parent-child definition override) fires within the same library and across libraries. Cross-library sibling overlaps are silent. Parent/child definition overrides within the same library remain flagged per DEC-2.6 (W011).

**DEC-2.11: All config.yaml options are valid in config_overrides**

- **Status**: Decided
- **Decision**: Every option that is valid in `.gvp/config.yaml` is also a valid key in `meta.config_overrides`. There is no hardcoded list of "overridable" vs "non-overridable" config keys — if it's a config option, it can be enforced via `config_overrides`.
- **Rationale**: "simplifies the logic (no hardcoding specific config options that are overridable), easier to understand/know what is overridable (everything vs specific keys to memorize)."
- **Implication**: The `config_overrides` schema mirrors the `config.yaml` schema, wrapped in `{ mode, value }` per DEC-2.13.

**DEC-2.12: Definition context preserved per-library in the Catalog**

- **Status**: Decided
- **Decision**: The final Catalog preserves definition context at each library level in the inheritance chain. When a descendant library overrides a tag or category definition, ancestor elements retain their association with the ancestor's version of that definition. The "winning" definition (DEC-2.1 descendant-wins) is the default for the project's own elements, but all intermediate definitions are preserved and queryable.
  - Example: Parent library defines `compliance: "Meets regulatory standards"`. Child library redefines `compliance: "Passes CI checks"`. In the final Catalog, parent elements tagged `compliance` are resolvably tied to the parent's definition. Child elements tagged `compliance` use the child's definition. A UI can display both with the correct annotations.
- **Rationale**: "the final Catalog should preserve information of all intermediate definitions as they exist in each Library, even if descendant Libraries overwrite them down the chain." This supports: displaying elements in context of their originating library, auditing how definitions evolve across the chain, and ensuring that overriding a definition doesn't retroactively change the meaning of ancestor elements.
- **Implication**: The Catalog is not just a flat merged view — it preserves per-library definition snapshots. Implementation may involve instantiating definition-context objects per library level. Detailed design deferred to implementation planning.

**DEC-2.13: config_overrides requires explicit mode on every key; mode itself is non-overridable**

- **Status**: Decided
- **Decision**: Every key in `config_overrides` must use the `{ mode: "additive" | "replace", value: T }` wrapper. No bare values, no global `mode` default. The `mode` on each key is itself subject to ancestor-wins/replace semantics — a descendant cannot change the merge mode that an ancestor defined for a key. If an ancestor sets `suppress_warnings: { mode: additive, value: [W001] }`, a descendant cannot change `mode` to `replace` for that key.
  ```yaml
  config_overrides:
    strict:
      mode: replace
      value: true
    suppress_warnings:
      mode: additive
      value: [W001]
  ```
- **Rationale**: "i think i favor [requiring mode for every definition]. a bit of a pain to handwrite in the YAML, but i don't imagine any humans will be handwriting this anyways lol. i'll personally use an LLM at first, and then in the near-future we'll have a UI." Requiring explicit mode: clearer, easier to understand, no ambiguity. Mode non-overridable: "the merge-mode definition itself **is** replace (i.e.: if the org-level defines a merge-mode of 'Union', then that remains true downstream and cannot be overridden)."
- **Rejected alternatives**:
  - *Polymorphic syntax (bare values use global mode default)*: Originally proposed in DEC-2.4. Rejected: "might be clearer and easier to understand" to require explicit mode everywhere.
  - *Mode is overridable by descendants*: A child could change an ancestor's `additive` to `replace`. Rejected: undermines org enforcement — the org chose additive for a reason.
- **Implication**: Supersedes DEC-2.4's original polymorphic syntax. `config_overrides` is always a flat map of `{ mode, value }` objects. When an ancestor's `config_overrides` entry overrides a descendant's entry for the same key, W012 (descendant config_override overridden by ancestor) is emitted. This is suppressible. The mode for a key is determined by whichever ancestor first defines it — adding a new ancestor document to the chain can change the effective mode for existing keys.

**DEC-2.14: Drop domain/concern tag delineation — flat generic tags**

- **Status**: Decided
- **Decision**: Tags are generic flat labels. The v0 two-dimensional classification (`meta.definitions.tags.{domains|concerns}`) is dropped. Tags are defined in a flat map: `meta.definitions.tags: { tagname: { description: "..." }, ... }`. There is no enforced structural distinction between "domain" and "concern" tags — users can organize their tags however they want, or not at all.
- **Rationale**: "i see no reason for the delineation. generic tags work just fine." The domain/concern split was an arbitrary structural imposition. Per P2 (fuzzy boundaries are a feature), tags should be flexible thinking tools, not rigid taxonomies.
- **Rejected alternatives**:
  - *Keep domain/concern split*: Enforced two-dimensional classification. Rejected: no clear benefit, adds schema complexity, forces users to categorize their tags before they can use them.
- **Implication**: Simplifies the tag schema. DOM-7 in requirements doc updated with note. `gvp.yaml` library file will need its tag definitions restructured in the flat format.

**DEC-2.15: Drop `libraries` config field — dependencies are implicit from `meta.inherits`**

- **Status**: Decided
- **Decision**: The v0 `libraries` config field (a list of additional library directories to scan) is dropped in v1. Library dependencies are fully implicit from document-level `meta.inherits` references (DEC-1.1). The only library directory loaded implicitly is the project's own `.gvp/library/` (or `/gvp/` for standalone repos, per DEC-1.2/DEC-1.10). All other libraries are discovered and loaded by resolving `meta.inherits` source references. CFG-2's `libraries: Concatenate (closer scope first)` merge strategy is obsolete.
- **Rationale**: DEC-1.1 established that "dependencies are implicit from document `meta.inherits` blocks" and explicitly rejected a dependency manifest in config. The `libraries` config field is a v0 artifact that served the same purpose — pointing the loader at additional directories. With v1's source-based imports (`@github:foo/bar`, local paths in `inherits`), this field has no role. Dropping it simplifies config and eliminates a class of problems (duplicate loading, ordering ambiguity).
- **Rejected alternatives**:
  - *Keep `libraries` for convenience*: Allow users to pre-declare library paths in config as a shortcut. Rejected: adds a second mechanism for the same thing `meta.inherits` already handles, creating ambiguity about which is authoritative.
  - *Deduplicate instead of dropping*: Keep the field but dedup by canonical path. Rejected: solving a problem that shouldn't exist — if the field is redundant with `inherits`, remove it rather than patching it.

**DEC-2.16 (editorial): CFG-2 language requires update notes for v1 decisions**

- **Status**: Decided
- **Decision**: CFG-2's original merge strategy descriptions are retained as-is in the requirements doc, with update notes appended referencing DEC-2.3 (config vs document priority are separate), DEC-2.4 (`config_overrides` processed after CFG-2), DEC-2.13 (explicit mode required), and DEC-2.15 (`libraries` field dropped). The requirements doc uses an append-only editing policy — original text is never removed, only annotated with decision references.
- **Rationale**: Preserves the original requirements as stated while tracking how design decisions refined them. The requirements doc and design decisions doc serve different roles — requirements state what, decisions state how and why.

---

## Theme 3: Dynamic Schema System in TypeScript

### Context

v0 uses Pydantic's `create_model()` to generate typed Element subclasses at runtime from YAML-defined `field_schemas`. The TS rewrite needs an equivalent mechanism. This also encompasses the boundary between reserved/structural fields and dynamic/customizable fields.

### Discussion Items

| ID | Item | Source | Review Status |
|----|------|--------|---------------|
| 3.1 | TS equivalent of Pydantic `create_model()` (Zod, TypeBox, etc.) | missing-reqs: Schema/Pydantic codegen | DECIDED (DEC-3.1) |
| 3.2 | Reserved structural fields vs dynamic customizable fields | missing-reqs: Loader/BASE_ELEMENT_ATTRS | DECIDED (DEC-3.2) |
| 3.3 | Render options in schema definitions (display name, color, renderer extensibility) | missing-reqs: Renderer/markdown name transform | DECIDED (DEC-3.3, DEC-3.3b) |
| 3.4 | Date type support in field schemas | missing-reqs: Loader/removed requirement note | DECIDED (DEC-3.4) |
| 3.5 | Non-root categories must have mapping_rules (validation) | missing-reqs: Schema/new category validation | DECIDED (DEC-3.5) |
| 3.6 | Post-merge uniqueness validation (id_prefix, yaml_key, mapping_rules refs) | missing-reqs: Schema/post-merge validation | DECIDED (DEC-3.6) |
| 3.7 | `extra="allow"` equivalent — how dynamic fields coexist with typed base | missing-reqs: Schema/BaseElement extra | DECIDED (DEC-3.7) |

### Decisions

**DEC-3.2: Reserved structural fields — explicit set in code, same namespace**

- **Timestamp**: 2026-03-17 ~12:00 PM EST
- **Status**: Decided
- **Decision**: v1 maintains an explicit hardcoded set of reserved field names (like v0's `BASE_ELEMENT_ATTRS`: `id`, `name`, `status`, `tags`, `maps_to`, `origin`, `updated_by`, `reviewed_by`, `priority`). Reserved fields share the same flat namespace as user-defined `field_schemas` fields. If a `field_schemas` entry attempts to define a reserved field name, it is a validation error (not a warning). Reserved fields are visible everywhere — in schema introspection, templates, and any tooling output. Validation occurs during catalog construction; any command that needs a catalog hits this check automatically.
- **Rationale**: "coding does the same thing; i can define the variable `foo` in python, but i can't define the variable `class` because it's reserved, but you don't learn that unless either (a) some person or documentation tells you ahead of time or (b) you get an error :p" On visibility: "i would have it show up everywhere. i'd try to include a seamless sort of pre-compile built-in to the Catalog building step which fails anywhere a catalog is needed"
- **Rejected alternatives**:
  - *Schema-declared `reserved: true` flag*: Each field in the category schema can be marked `reserved: true`, making the mechanism generic. Rejected: over-engineered — the reserved set is small, stable, and owned by GVP core. Making it generic suggests library authors should reserve fields, which muddies the boundary.
  - *Structural vs content namespace split*: Reserved fields on the element root, user fields nested under a `fields:` key. No collision possible by construction. Rejected: changes YAML authoring ergonomics for no real benefit — "A to avoid the schema rewrite."
- **Implication**: Adding a new reserved field is a code change + version bump. The reserved set should be kept minimal.

**DEC-3.7: Dynamic fields coexist via flat namespace with full runtime validation**

- **Timestamp**: 2026-03-17 ~12:05 PM EST
- **Status**: Decided
- **Decision**: Dynamic fields from `field_schemas` live in the same flat namespace as reserved fields. They are fully validated at runtime (not documentation-only). Validation occurs during catalog construction. Internally, the implementation may use separate validators for reserved vs dynamic fields, but this is an implementation detail — the behavior is a single flat element with all fields validated.
- **Rationale**: "sounds good to me" — affirming that dynamic fields should be fully validated and that the internal validator architecture is an implementation detail, not a behavioral decision.
- **Rejected alternatives**:
  - *Typed base + untyped bag*: Reserved fields strongly typed, everything else is `Record<string, unknown>` with no runtime validation. Rejected: loses the value of `field_schemas` — they'd be documentation-only.
- **Implication**: The Zod schema for each category is built at catalog construction time by combining reserved field definitions with `field_schemas` definitions.

**DEC-3.1: Zod as the runtime validation library**

- **Timestamp**: 2026-03-17 ~12:10 PM EST
- **Status**: Decided
- **Decision**: v1 uses Zod for runtime schema validation and dynamic model generation. Zod schemas are built programmatically from `field_schemas` definitions at catalog construction time, serving as the TS equivalent of Pydantic's `create_model()`.
- **Rationale**: "Zod sounds good to me" — Zod is the de facto standard for TS runtime validation, maps cleanly to the `create_model()` pattern, and has excellent error messages.
- **Rejected alternatives**:
  - *TypeBox*: JSON Schema compatible, faster at runtime. Rejected: more verbose API, and JSON Schema compatibility isn't a driving requirement.
  - *Valibot*: Newer, tree-shakeable. Rejected: less ecosystem adoption, similar API to Zod without the maturity.
  - *Hand-rolled validation*: Full control, no dependencies. Rejected: reinvents the wheel for type coercion, error messages, nested validation.
- **Implication**: Zod is a runtime dependency of the v1 package.

**DEC-3.4: `datetime` only, always timezone-aware**

- **Timestamp**: 2026-03-17 ~12:15 PM EST
- **Status**: Decided
- **Decision**: v1's `field_schemas` type system supports `datetime` (no separate `date`-without-time type). All datetime values are stored with timezone information. Timezone resolution fallback chain: (1) config setting, (2) system timezone, (3) UTC. No error if timezone is omitted in input — the fallback chain silently provides one.
- **Rationale**: "datetime exclusively. these should ultimately be injected by tools/UIs; we don't anticipate YAMLs being hand-updated. those tools will handle date insertions, so any 'complexity' of an extra %H:%M:%S and maybe a %z is inconsequential. but we might often perform multiple updates over the course of a day, and that granular detail will be very helpful." On fallback vs error: "i don't see any reason to error or require interaction from the user unless you do?" On priority order: "sorry actually, the priority should be config -> system -> UTC"
- **Rejected alternatives**:
  - *`date` only (calendar date)*: Simpler, no timezone headaches. Rejected: insufficient granularity — multiple updates per day would be indistinguishable.
  - *`date` and `datetime` as separate types*: Both available, user picks per field. Rejected: unnecessary complexity — tools handle insertion, so the extra precision costs nothing. One type is simpler.
  - *`date`, `datetime`, and `duration`*: All of the above plus ISO 8601 durations. Rejected: YAGNI.
  - *Require explicit timezone (error if omitted)*: No fallback, strict enforcement. Rejected: "i don't see any reason to error or require interaction from the user."
- **Implication**: The v1 type map is: `string`, `number`, `boolean`, `list`, `dict`, `model`, `datetime`. Datetime values are stored in ISO 8601 format with timezone (RFC 3339 profile). Serialization back to YAML/JSON uses ISO 8601 with the resolved timezone. Provenance timestamps (Theme 4) should consider using the `datetime` type for consistency; if Theme 4 chooses a different representation, it should justify the rationale. Renderers can convert to local time for display. See also DEC-3.10 for `list` and `dict` element type specifications, and DEC-3.12 for `model` type definitions.

**DEC-3.3: Exporter-namespaced `export_options` on category definitions**

- **Timestamp**: 2026-03-17 ~12:20 PM EST
- **Status**: Decided
- **Decision**: Category definitions support a `export_options` dict where keys are renderer-declared namespaces (e.g., `export_options: { dot: { shape: "box" }, markdown: { heading_level: 3 } }`). Core display fields (`display_label`, `color`) remain top-level on the category definition. Each renderer MUST declare a Zod schema for its `export_options` key — this is not optional. `export_options` contents are validated against the declared schemas at catalog build time. The renderer registration mechanism (how renderers declare their key and schema) is deferred to Theme 7.
- **Rationale**: "i like B + C as well :) strict schemas and type-checking everywhere. i'd require the schema" — on making renderer schemas mandatory rather than optional.
- **Rejected alternatives**:
  - *Fixed render fields only*: Like v0 — `display_label`, `color`, and maybe `icon` as known fields. New render properties require a code change. Rejected: not extensible enough for renderer plugins.
  - *Open `export_options` bag (no namespacing)*: A flat dict where renderers read what they want. Rejected: key collisions between renderers, not self-documenting.
  - *Renderer-namespaced with optional schema*: Renderers can optionally provide a schema. Rejected: "i'd require the schema" — strict validation everywhere.
- **Implication**: Theme 7 must define the renderer registration mechanism, including how renderers declare their `export_options` key and provide their Zod schema. At catalog build time, GVP accesses registered renderer schemas to validate `export_options` contents. If a renderer's schema is not yet registered at catalog build time, validation behavior is governed by DEC-3.8. Any renderer that wants `export_options` must provide a Zod schema.

**DEC-3.3b: `display_name` on field schema entries**

- **Timestamp**: 2026-03-17 ~12:25 PM EST
- **Status**: Decided
- **Decision**: Individual fields in `field_schemas` support a `display_name` property (e.g., `{ type: string, required: true, display_name: "Design Statement" }`). This controls how the field's *label* is displayed in renderers — e.g., a column heading or section title. It is a built-in, renderer-agnostic property — not namespaced under `export_options`. Renderers use `display_name` when available, falling back to key-name transformation (e.g., `replace("_", " ").title()`).
- **Rationale**: "agreed on A. i'd keep it built-in for now, it seems like an easy enough thing to add later without huge architectural changes"
- **Rejected alternatives**:
  - *Full `export_options` on fields*: Same renderer-namespaced pattern as categories, at the field level. Rejected: over-engineered for current needs — `display_name` covers 90% of the use case.
  - *No field-level display metadata*: Renderers handle all display transforms. Rejected: `replace("_", " ").title()` doesn't always produce good results (acronyms, domain terms).
- **Implication**: The `field_schemas` entry shape expands to include `type`, `required`, `display_name` (and potentially more built-in properties in the future).

**DEC-3.5: Non-root categories must have `mapping_rules` — hard requirement**

- **Timestamp**: 2026-03-17 ~12:30 PM EST
- **Status**: Decided
- **Decision**: Non-root categories (`is_root: false` or unset) MUST define `mapping_rules` (a non-empty list of category references they map to). Root categories (`is_root: true`) must NOT have `mapping_rules`. Violation is a validation error at catalog build time.
- **Rationale**: "yup, A. the intent is rigid traceability"
- **Rejected alternatives**:
  - *Allow empty `mapping_rules: []`*: Non-root categories can declare `mapping_rules` as empty, meaning "doesn't map to anything." Rejected: a non-root category that maps to nothing is either misconfigured or should be a root.
  - *Warning instead of error*: Missing `mapping_rules` emits a warning. Rejected: traceability is the core purpose — permissiveness here undermines the framework.
- **Implication**: Every element in a non-root category must be able to trace upward to a root. This is the structural guarantee that makes GVP's traceability chain work.

**DEC-3.6: Post-merge uniqueness validation is per-library**

- **Timestamp**: 2026-03-17 ~12:35 PM EST
- **Status**: Decided
- **Decision**: After merging categories within a single library, the following integrity checks are enforced (all are errors, not warnings):
  1. `id_prefix` must be unique within the library
  2. `yaml_key` must be unique within the library
  3. All category names referenced in `mapping_rules` must exist within the library's final category set
  4. Reserved field names (per DEC-3.2) cannot appear in `field_schemas` — this check is part of the reserved field validation layer that runs during catalog construction (see DEC-3.2 for rationale)
  5. `export_options` keys are validated against registered renderer schemas (per DEC-3.3; see DEC-3.8 for behavior when a renderer is unregistered)
  6. Root categories (`is_root: true`) must NOT have `mapping_rules` defined (per DEC-3.5)

  These checks are per-library, NOT cross-catalog. Different libraries may independently define categories with the same `id_prefix` or `yaml_key`. Display labels need not be unique, but natural uniqueness comes from source + element references. All validation completes before the Catalog is considered ready — reserved field conflicts and schema errors are reported at library load time, not deferred to element validation time.
- **Rationale**: "it should be clear since you said 'multi-library merge': those items you mentioned (id_prefix, yaml_key, mapping_rules) need only be unique *within a single library*. they needn't be unique across a catalog." On display labels: "display_labels needn't be unique, but they should be since sources should inherently be unique and elements will be unique within a library."
- **Rejected alternatives**:
  - *Cross-catalog uniqueness*: `id_prefix` and `yaml_key` must be globally unique across all libraries in the catalog. Rejected: overly restrictive — independent library authors shouldn't need to coordinate prefixes.
- **Implication**: Consistent with DEC-2.12 (catalog preserves per-library context). Display label convention: source + element as default label, with canonical source + library_id reference for disambiguation. Softer checks (e.g., orphan category detection) are deferred to Theme 5 (Validation).

**DEC-3.8: Unrecognized `export_options` keys — error by default, suppressible via config**

- **Timestamp**: 2026-03-17 ~1:30 PM EST
- **Status**: Decided
- **Source**: Audit finding 1 — ambiguity in DEC-3.3's "flagged" language
- **Decision**: If a category definition contains a `export_options` key that doesn't match any registered renderer schema, it is a validation error at catalog build time (catalog build fails). This can be downgraded to a warning via config (e.g., `strict_export_options: false`) for environments where not all renderers are installed.
- **Rationale**: "that's fair. i was going to say B, but i think you're right to callout the strict schemas everyone mentality :)" — aligning with the principle of strict validation everywhere while acknowledging practical needs for optional renderers.
- **Rejected alternatives**:
  - *Warning by default*: Unrecognized keys emit a warning but catalog builds successfully. Rejected: inconsistent with the "strict schemas and type-checking everywhere" principle that drove DEC-3.3.
  - *Hard error, no override*: Always fails, no way to suppress. Rejected: too rigid for environments with optional/pluggable renderers.
- **Implication**: The config layer must support a `strict_export_options` setting (or equivalent). Theme 8 (CLI & Config) should include this.

**DEC-3.9: Category definitions are fully inherited across libraries**

- **Timestamp**: 2026-03-17 ~1:35 PM EST
- **Status**: Decided
- **Source**: Audit finding 2 — cross-library `mapping_rules` validation scope
- **Decision**: When Library B depends on Library A, B automatically inherits all of A's category definitions (including `yaml_key`, `id_prefix`, `mapping_rules`, `field_schemas`, etc.). Inherited categories bring along their full validation context — if category `CodeStandard` has `mapping_rules: [Decision]`, then `Decision` is also inherited. Inherited categories are validated in the consumer's context as if defined locally. B can override inherited categories (descendant wins per DEC-2.1).
- **Rationale**: "i'd say yes, it inherits. but then i'd suggest that it should also inherit anything associated with that category and use the same validations as if that category (and connected datums/definitions) were defined in lib b"
- **Rejected alternatives**:
  - *Categories are per-library only*: Each library defines its own categories independently. `field_schemas` cascade only applies when both libraries define the same category. Rejected: breaks transitive dependency model (DEC-1.0a) and creates orphaned category references.
  - *Inherit categories but not validation context*: B gets A's categories but doesn't re-validate them. Rejected: "it should also inherit anything associated with that category and use the same validations."
- **Implication**: The scenario of "Library B has category X but not category Y that X's mapping_rules references" cannot happen — inheriting X transitively pulls in everything X needs. This is consistent with DEC-1.0a (fully transitive dependencies). Also resolves audit finding 10: parent elements in the catalog are validated against the inherited (cascaded) schemas in the consumer's context, not just the original parent schemas.

**DEC-3.10: `list` and `dict` types support element/value type specifications**

- **Timestamp**: 2026-03-17 ~1:40 PM EST
- **Status**: Decided
- **Source**: Audit finding 3 — `list` type has no element type specification
- **Decision**: The `list` type supports an optional `items` metadata field specifying element type constraints (e.g., `{ type: list, items: { type: string } }` for a list of strings). The `dict` type supports an optional `values` metadata field (as in v0, e.g., `{ type: dict, values: { type: model, fields: { ... } } }`). If `items` or `values` is omitted, the list/dict accepts any element/value type.
- **Rationale**: Aligns with ARCH-4 (strict typing) and the existing v0 pattern for `dict` with `values`. Extending the same pattern to `list` with `items` is consistent and expected.
- **Rejected alternatives**:
  - *Untyped lists/dicts only*: No element type specification. Rejected: defeats the "strict typing throughout" principle.
- **Implication**: Zod schemas for `list` fields use `z.array(innerSchema)` where `innerSchema` is derived from the `items` spec. Similarly, `dict` fields use `z.record(valueSchema)`.

**DEC-3.11: `considered` is a dynamic field, not reserved**

- **Timestamp**: 2026-03-17 ~1:45 PM EST
- **Status**: Decided
- **Source**: Audit finding 5 — `considered` field status unclear
- **Decision**: `considered` is NOT a reserved field. It is defined on specific categories (like `decision`) via `field_schemas` using the `model` type (see DEC-3.12). Each category that wants to support alternatives must explicitly define `considered` with the appropriate nested model schema in its `field_schemas`. There is no hardcoded enforcement of `considered` structure — it's validated like any other dynamically-defined field.
- **Rationale**: Consistent with the principle that the validator uses dynamically loaded schemas, not hardcoded field names (per the missing-requirements audit: "The validator will not validate any named, hardcoded field").
- **Rejected alternatives**:
  - *Reserved field*: `considered` is part of the hardcoded reserved set. Rejected: it's category-specific (not all categories need alternatives tracking), and reserving it would prevent libraries from defining their own semantics for the field.
  - *Universal via `_all`*: `considered` is defined in the `_all` block so every category has it. Rejected: not every category benefits from alternatives tracking — it's primarily for decisions.
- **Implication**: The default schema for the `decision` category (or equivalent in v1) should include `considered` in its `field_schemas`. This is a defaults/data concern, not a core engine concern.

**DEC-3.12: `model` type uses inline nested field definitions**

- **Timestamp**: 2026-03-17 ~1:50 PM EST
- **Status**: Decided
- **Source**: Audit finding 12 — `model` type specification missing
- **Decision**: The `model` type is defined inline using a nested `fields` structure, consistent with v0's approach. Example:
  ```yaml
  considered:
    type: dict
    required: false
    values:
      type: model
      fields:
        rationale:
          type: string
          required: true
        description:
          type: string
          required: false
  ```
  Each nested `model` definition is scoped to the field it's defined on. Models can be nested to arbitrary depth (a model field can contain another model field).
- **Rationale**: Maintains v0's proven pattern. Inline definitions keep schema definitions self-contained within category schemas — no need for a separate "named model" registry.
- **Rejected alternatives**:
  - *Named model references*: Define models separately and reference by name (e.g., `type: model, ref: ConsideredAlternative`). Rejected: adds a model registry concept that doesn't exist elsewhere in GVP — unnecessary complexity for current needs.
  - *Category references*: `type: model, category: decision` to reuse a category's schema as a field type. Rejected: conflates two concepts (categories define element types with traceability; model fields are nested data structures without traceability semantics).
- **Implication**: Zod schemas for `model` fields use `z.object({ ... })` built recursively from the `fields` spec. The `field_schemas` entry shape for any field is: `{ type, required, display_name?, items?, values?, fields? }` where `items` applies to `list`, `values` applies to `dict`, and `fields` applies to `model`.

---

## Theme 4: Provenance System

### Context

v0 tracks element lifecycle via `origin`, `updated_by`, and `reviewed_by` fields. The user wants a rethink: unique IDs for updates, linking reviews to specific updates, git-like reviewer identity, and timezone-aware timestamps.

### Discussion Items

| ID | Item | Source | Review Status |
|----|------|--------|---------------|
| 4.1 | Unique IDs for provenance entries (updates, reviews) | missing-reqs: review/reviewed_by stamping | DECIDED (DEC-4.1) |
| 4.2 | Linking reviews to specific updates | missing-reqs: review/reviewed_by stamping | DECIDED (DEC-4.2) |
| 4.3 | Reviewer identity: git-like username/email, future GPG signing | missing-reqs: review/$USER default | DECIDED (DEC-4.3) |
| 4.4 | Timezone-aware timestamps | missing-reqs: review/date.today() | DECIDED (DEC-4.4) |
| 4.5 | `--approve` hidden flag with anti-gaming mechanism | missing-reqs: CLI/review --approve | DECIDED (DEC-4.5) |
| 4.6 | `--skip-review` escape hatch for trivial changes | v1-reqs: CMD-4, CMD-5 | DECIDED (DEC-4.6) |

### Decisions

**DEC-4.1: Auto-generated UUID per provenance entry**

- **Timestamp**: 2026-03-19 ~12:00 PM EST
- **Status**: Decided
- **Decision**: Every provenance entry (origin, update, review) receives an auto-generated UUID. UUIDs are generated by the tool at write time, never hand-authored. This enables explicit linking between entries (e.g., reviews referencing specific updates), querying individual entries, and audit trails.
- **Rationale**: "i like A :)" — UUIDs are cheap, unambiguous, and make the linking story trivial.
- **Rejected alternatives**:
  - *Sequential per-element IDs*: Provenance entries get sequential IDs scoped to the element (e.g., `u1`, `u2`). Rejected: requires checking existing entries to assign the next ID, adds ordering logic for little benefit over UUIDs.
  - *Timestamps as natural keys*: Use the `datetime` timestamp as the unique identifier. Rejected: fragile — two provenance events in the same second on the same element, while unlikely, would collide.
- **Implication**: Provenance entry schema includes an `id` field (UUID string). This `id` is distinct from the element's `id` — it identifies the provenance entry itself.

**DEC-4.2: Reviews explicitly reference specific update IDs via `updates_reviewed`**

- **Timestamp**: 2026-03-19 ~12:05 PM EST
- **Status**: Decided
- **Decision**: Each review entry includes an `updates_reviewed: [uuid, ...]` field listing the specific update IDs that were actually reviewed. Only updates that the reviewer was shown and explicitly reviewed should be included — no implicit "everything up to this point" semantics. The responsibility for ensuring only actually-reviewed updates are listed falls on the UI/tool presenting the review, not the data layer.
- **Rationale**: "we should **only** mark updates that were actually reviewed. no 'through <uuid>'. if Element A undergoes Update 1 (unreviewed) followed by an Update 2, then someone performs a review... depending on how the UI presents the review, they might never be shown Update 1 and only be shown the current state of Element A -- Update 2. in that case, they should *not* mark Update 1 as reviewed. this should probably fall on the UI/tool to ensure this is adhered"
- **Rejected alternatives**:
  - *Watermark / "through" approach*: `through: "uuid"` meaning "reviewed everything up to and including this update." Rejected: can't express selective review (reviewed updates 1 and 3 but not 2), and implies the reviewer saw all prior updates.
  - *Timestamp-based coverage*: `covers_through: "datetime"` — reviewed everything before this timestamp. Rejected: less precise than UUIDs, can't handle out-of-order entries.
- **Implication**: The review system's staleness check looks for update entries whose UUIDs don't appear in any review's `updates_reviewed` list (excluding `skip_review: true` entries per DEC-4.6). UI/tool implementations must track which updates were displayed to the reviewer and only include those in `updates_reviewed`.

**DEC-4.3: Structured identity via GVP's own config**

- **Timestamp**: 2026-03-19 ~12:10 PM EST
- **Status**: Decided
- **Decision**: Provenance entries record author/reviewer identity as a structured object: `{ name: "Guy", email: "guy@example.com" }`. Identity is configured in GVP's own config (`.gvp.yaml` or `.gvp/config.yaml`) under a `user` section (e.g., `user: { name: "...", email: "..." }`). Identity must be configured before provenance operations work — no fallback to `$USER`, git config, or other tools' settings. Future GPG signing hooks into this identity naturally.
- **Rationale**: "A for sure lol. we aren't going to borrow another tool's settings :p and no unstructured, unvalidated strings lmao, that does not follow the strict typing everywhere rule :p"
- **Rejected alternatives**:
  - *Fallback chain (config → env → git → $USER)*: Less friction, but identity might be inconsistent across entries. Rejected: "we aren't going to borrow another tool's settings."
  - *Unstructured string (e.g., `"Guy <guy@example.com>"`)*: Simple but makes querying and future GPG signing harder. Rejected: "does not follow the strict typing everywhere rule."
- **Implication**: GVP config schema must include a `user` section with required `name` and `email` fields. Provenance commands should error clearly if identity is not configured (e.g., `"GVP user identity not configured. Run 'gvp config set user.name ...' and 'gvp config set user.email ...'"`).

**DEC-4.4: Provenance timestamps use DEC-3.4 `datetime`, overridable via CLI**

- **Timestamp**: 2026-03-19 ~12:15 PM EST
- **Status**: Decided
- **Decision**: Provenance timestamps use the same `datetime` type defined in DEC-3.4 (ISO 8601 with timezone, fallback chain: config → system → UTC). Timestamps are auto-generated by the tool by default (`datetime.now()` with resolved timezone). Users can override with a CLI flag (e.g., `--timestamp "2026-03-18T10:00:00-04:00"`) for backdating or importing historical data. The provided timestamp is validated against the `datetime` schema.
- **Rationale**: "nope, general datetime :) and yeah: B. i like letting the user, especially through the cli tools, have fairly granular control"
- **Rejected alternatives**:
  - *Always auto-generated, no override*: Guarantees accuracy but prevents legitimate use cases (backdating, importing). Rejected: "i like letting the user... have fairly granular control."
- **Implication**: CLI commands for `add`, `edit`, and `review` should accept an optional `--timestamp` flag. The flag value is validated as ISO 8601 with timezone.

**DEC-4.5: Hash-based proof-of-review for `--approve`**

- **Timestamp**: 2026-03-19 ~12:20 PM EST
- **Status**: Decided
- **Decision**: The `--approve` flag on `gvp review` is hidden from all documentation and help text. It is discoverable only through (1) inspecting source code and (2) at the end of `gvp review <element>` output. Anti-gaming mechanism: `gvp review <element>` outputs a one-time hash at the end of its display. `gvp review --approve <element> --token <hash>` requires that hash. The hash encodes the specific update IDs that were shown during the review (not the full element state). If the pending updates change between `gvp review` and `gvp review --approve`, the hash is invalid. This ensures the reviewer actually saw the review content before approving, and that approval covers exactly what was displayed.
- **Rationale**: "yup, i like C :)" — strongest guarantee that the reviewer actually saw the review output. On hash encoding update IDs rather than element state: "yeah, i think i'd go with B, and this should be well documented somewhere" — a typo fix via `--skip-review` shouldn't invalidate a review in progress.
- **Rejected alternatives**:
  - *Session-based gate*: Running `gvp review` writes a token to a temp file that unlocks `--approve`. Rejected: weaker guarantee — doesn't prove the reviewer saw specific content, just that they ran the command.
  - *Output-based discovery only, no enforcement*: `--approve` is hidden but always works. Rejected: a determined agent could find it via source code and skip review entirely.
  - *Element state hash*: Hash of the element's full current content. Rejected: unrelated changes (e.g., a `--skip-review` typo fix) would invalidate the token, disrupting the review flow.
- **Implication**: The `gvp review` command must compute and display a hash of the pending update IDs at the end of its output. The `--approve` flag must validate this hash before stamping the review. Hash algorithm and format are implementation details.

**DEC-4.6: `--skip-review` — full provenance with review opt-out**

- **Timestamp**: 2026-03-19 ~12:25 PM EST
- **Status**: Decided
- **Decision**: The `--no-provenance` flag from v0 is replaced by `--skip-review`. This flag writes a full provenance entry (UUID, timestamp, identity, rationale — everything a normal update has) but adds `skip_review: true` to the entry. The review system ignores entries with `skip_review: true` when checking staleness. All GVP tools (including `gvp review`) exclude skip-review entries from pending review sets. The full audit trail is preserved — every change is recorded, but trivial changes don't trigger the review chain.
- **Rationale**: "let's change the flag to `--skip-review` and i think i like C :) add a full provenance entry but with some attribute or marking that indicates it was marked for skipping review. our tools (including `gvp`) should *not* consider these updates when performing checks. full trace but still provides the escape hatch"
- **Rejected alternatives**:
  - *Fully invisible (`--no-provenance`)*: Skips writing provenance entirely. Rejected: loses audit trail — no record that a change occurred (only git history shows it).
  - *Lightweight trace with `trivial: true`*: Writes a provenance entry with a `trivial` flag. Rejected: functionally similar to the chosen approach but `skip_review` more accurately describes the behavior (it's not about whether the change is trivial, it's about opting out of review).
- **Implication**: The provenance entry schema for updates includes an optional `skip_review: boolean` field (defaults to `false`/absent). The staleness detection algorithm must filter out `skip_review: true` entries. This interacts cleanly with DEC-4.5: skip-review entries are excluded from the pending update set, so they don't affect the review hash. CLI commands `add` and `edit` accept `--skip-review` instead of `--no-provenance`.

**DEC-4.7: Unified provenance entry schema per type**

- **Timestamp**: 2026-03-19 ~2:00 PM EST
- **Status**: Decided
- **Source**: Audit finding 2 — no unified schema definition; also resolves findings 3, 4, 5, 12
- **Decision**: Three provenance entry types with distinct schemas:

  **Origin entry** (creation record):
  ```yaml
  origin:
    - id: "uuid"             # auto-generated (DEC-4.1)
      date: "datetime"       # auto-generated or overridable (DEC-4.4)
      by: {name, email}      # from GVP user config (DEC-4.3)
  ```
  No `rationale`, `skip_review`, or `updates_reviewed`. Creation is a fact, not a change to review.

  **Update entry** (`updated_by`):
  ```yaml
  updated_by:
    - id: "uuid"             # auto-generated
      date: "datetime"       # auto-generated or overridable
      by: {name, email}      # from GVP user config
      rationale: "string"    # required — why the change was made
      skip_review: false     # optional, defaults false (DEC-4.6)
  ```

  **Review entry** (`reviewed_by`):
  ```yaml
  reviewed_by:
    - id: "uuid"                    # auto-generated
      date: "datetime"              # auto-generated or overridable
      by: {name, email}             # from GVP user config
      updates_reviewed: ["uuid"]    # required — which update IDs (DEC-4.2)
      note: "string"               # optional — reviewer comments
  ```

  **Staleness definition**: An element is stale if it has any update entry where `skip_review` is not `true` and whose `id` does not appear in any review's `updates_reviewed` list. Origin entries are NOT part of the staleness check — creation is not a change that requires review.

- **Rationale**: "i like your schema :) the only thing i might tweak is making `covers` a little more explicit, perhaps `reviews` or `updates_reviewed`?" On origin not being reviewable: origin records creation, not a change — there's nothing to review against a prior state. On `rationale` being required for updates: every change should be justified. On `note` being optional for reviews: a reviewer may have nothing to add beyond "approved."
- **Rejected alternatives**:
  - *Single schema for all types*: All three types share the same fields, with unused fields optional. Rejected: muddies the semantics — `updates_reviewed` on an origin entry is meaningless.
  - *Origin supports skip_review*: Allow creation to bypass review. Rejected: origin isn't part of staleness detection, so `skip_review` on origin has no effect.
- **Implication**: The provenance entry schemas are part of the reserved field internals (DEC-3.2). They are not user-configurable via `field_schemas`. The `note` field on reviews preserves the v0 behavior from `stamp_review()`.

**DEC-4.8: User identity is personal — excluded from config_overrides**

- **Timestamp**: 2026-03-19 ~2:05 PM EST
- **Status**: Decided
- **Source**: Audit finding 7 — identity + config_overrides interaction
- **Decision**: The `user` config section (`user.name`, `user.email`) is excluded from `config_overrides` (DEC-2.4). Identity is inherently personal — ancestor libraries cannot set or enforce identity values. Identity is configured in `.gvp.yaml` (local/gitignored config) only. If an org wants to enforce identity constraints (e.g., email domain), that's done at the process level (PR reviews, CI checks) or via validation rules (Theme 5), not config overrides.
- **Rationale**: "yeah, i'd go with A. if we want to enforce that, that can be done through git repos / prs that enforce certain rules"
- **Rejected alternatives**:
  - *Identity overridable like any other config*: Org library can enforce identity values via config_overrides. Rejected: identity is about the person, not the project.
  - *Constraint-based enforcement*: Org library can enforce identity constraints (e.g., email regex) but not set values. Rejected: validation rules (Theme 5) are a better fit for constraints than config_overrides.
- **Implication**: DEC-2.4's `config_overrides` mechanism must explicitly exclude the `user` config section. Identity validation timing: errors at command invocation (not catalog build), since identity is only needed when performing provenance operations.

---

## Theme 5: Validation Architecture

### Context

v0 validation is split across the loader (schema validation via Pydantic), validate command (structural + traceability), and ad-hoc checks in other commands. The user wants DRY validation with a single entry point and consistent treatment of built-in and user-defined rules.

### Discussion Items

| ID | Item | Source | Review Status |
|----|------|--------|---------------|
| 5.1 | DRY validation: single entry point, `validate` builds on top | missing-reqs: Schema/post-merge validation note | DECIDED (DEC-5.1) |
| 5.2 | User-defined rules merged with built-in, treated identically | missing-reqs: Test/user-defined rules | DECIDED (DEC-5.2) |
| 5.3 | Custom exception types (CircularInheritanceError, etc.) | missing-reqs: Model/cycle detection | DECIDED (DEC-5.3) |
| 5.4 | Warning suppression: strongly typed, not string prefix extraction | missing-reqs: Validation/warning suppression | DECIDED (DEC-5.4) |
| 5.5 | W005 configurability (self-document-only mapping) | missing-reqs: Validation/W005 conditional | DECIDED (DEC-5.5) |
| 5.6 | `considered` validation via dynamic schema, not hardcoded | missing-reqs: Validation/considered field | DECIDED (DEC-5.6) |

### Decisions

**DEC-5.1: Validation as a pipeline of independent passes**

- **Timestamp**: 2026-03-19 ~3:00 PM EST
- **Status**: Decided
- **Decision**: Validation is structured as a pipeline of independent passes. Each pass is its own function/module that takes a catalog + config and returns a list of diagnostics (errors and warnings). Commands specify which passes they need — `gvp validate` runs all passes, other commands may run a subset. Passes can run in any combination; there is no required ordering between passes (though catalog construction must complete before any pass runs).
- **Rationale**: "let's go with C :) B demands a linear / ladder-like approach. and *maybe* that's fine? maybe that's all we'll end up needing? but C allows us the flexibility to do different validations at different points if we end up wanting / needing to. more flexibility to adapt to future changes / requirements."
- **Rejected alternatives**:
  - *Two tiers (catalog + validate)*: Catalog build does structural, `validate` does everything else. Rejected: too rigid — can't express "run schema + user-defined but skip semantic."
  - *Single engine with severity levels*: One function, configurable depth (`level: "structural"` vs `level: "full"`). Rejected: "demands a linear / ladder-like approach" — can't skip intermediate levels.
- **Implication**: The pass interface is simple: `(catalog: Catalog, config: Config) => Diagnostic[]`. Catalog construction (DEC-3.6) is NOT a pass — it's a prerequisite that must succeed before passes run. Passes are composable and independently testable.

**DEC-5.2: User-defined rules as a dedicated pass with named-pass flex point**

- **Timestamp**: 2026-03-19 ~3:05 PM EST
- **Status**: Decided
- **Decision**: User-defined validation rules run as a dedicated pass, currently invoked only during `gvp validate`. User-defined rules produce diagnostics using the same `Diagnostic` type as built-in passes — same output format, same severity system, same suppression mechanism. Each pass (built-in and user-defined) has a name (e.g., `"schema"`, `"traceability"`, `"semantic"`, `"user_rules"`) to support future per-pass injection of user-defined rules. This is an explicit flex point: the architecture supports injecting user rules into specific passes (e.g., running user traceability rules alongside built-in traceability checks), but this is deferred to a future version.
- **Rationale**: "let's go with A for now; i think i'd have a specific user-defined-rules pipeline and, for now, only run that during `gvp validate`. BUT, i do like B and would like to leave that as a flex-point in the future. so it might be nice to make sure we mix in some way for each pipeline to have a name... so that we can more easily tie in user-defined rules at specific points." On documentation: "let's make a note to create a dedicated flex-points document during implementation so that we can readily review it in the future if we want to leverage any of those implementation choices for some future tweak"
- **Rejected alternatives**:
  - *User rules injected into existing passes now*: Rules declare which pass they belong to and run alongside built-in checks. Rejected: more complex than needed for current requirements — deferred as a flex point.
  - *No distinction (all rules are the same type)*: Built-in checks refactored into a declarative rule format. Rejected: forces complex structural validation into a declarative format that may be too constraining.
- **Implication**: During implementation, create a `docs/flex-points.md` document tracking architectural flex points and the design choices that enable them. This pass-naming flex point should be the first entry.

**DEC-5.3: Exception hierarchy — GVPError base with domain and specific subtypes**

- **Timestamp**: 2026-03-19 ~3:10 PM EST
- **Status**: Decided
- **Decision**: v1 uses a custom exception hierarchy: `GVPError` (base) → domain errors (e.g., `ValidationError`, `InheritanceError`, `SchemaError`, `ProvenanceError`) → specific errors (e.g., `CircularInheritanceError`, `DuplicateIdPrefixError`, `MissingMappingRulesError`). Callers can catch at any level of granularity. TypeScript supports this cleanly via `extends Error`.
- **Rationale**: "yup, C :)" — the hierarchy gives flexibility to catch broad or narrow.
- **Rejected alternatives**:
  - *One per validation domain only*: `SchemaValidationError`, `TraceabilityError`, etc. (~5-8 types). Rejected: not granular enough for specific error handling.
  - *One per specific error only*: `CircularInheritanceError`, `BrokenReferenceError`, etc. (~20+ types, flat). Rejected: no way to catch "any validation error" without listing them all.
- **Implication**: The hierarchy mirrors the pass structure naturally — each pass's errors are subtypes of a domain error.

**DEC-5.4: Diagnostics — typed objects with severity, codes, and metadata**

- **Timestamp**: 2026-03-19 ~3:15 PM EST
- **Status**: Decided
- **Decision**: Validation findings are represented as `Diagnostic` objects with: `code` (stable string identifier, e.g., `"W001"`), `name` (human-readable, e.g., `"EMPTY_DOCUMENT"`), `description` (explains the diagnostic), `severity` (`"error"` | `"warning"`), `pass` (which pass produced it), and structured context (which element, field, details). Diagnostics are defined as class instances or objects implementing a `Diagnostic` interface — each pass owns its own diagnostic definitions. Diagnostic codes must be unique across the system; uniqueness is enforced via a build-time check (not a compile-time registry pattern). Suppression in config references diagnostic codes and is validated at config load — unknown codes are errors. Strict mode promotes warning-severity diagnostics to errors.
- **Rationale**: On typed objects: "B :) it's a little more effort to make the warnings so verbose... and i'm torn on that... but i think i like it lol." On naming: user noted that warnings and errors are the same concept with different severities, suggesting a unified name. "Diagnostic" was chosen as the established term (used by TypeScript compiler, Rust, etc.). On architecture: "i halfway feel like it's maybe an... atypical design choice to combat a concern (duplicate codes) we could readily solve through some separate check, and maybe simple classes / models that extend a warning interface would make more sense." On uniqueness: "let's go with that with some mechanism in place at build time to ensure codes are unique :)"
- **Rejected alternatives**:
  - *String-based warning codes (v0 approach)*: Suppress by string prefix. Rejected: "not strongly typed... we should use a design choice that adheres to a strongly typed, traceable principle."
  - *Central const object registry*: All diagnostics in one `WARNINGS = { W001: {...}, ... } as const` object. Rejected: atypical pattern to solve a uniqueness concern better handled by a build-time check. Splits ownership away from the passes that define the diagnostics.
  - *Pass-scoped suppression only*: Suppress entire passes instead of individual diagnostics. Rejected: too coarse — can't suppress one specific warning while keeping others in the same pass.
- **Implication**: The diagnostic code format (e.g., `W001`, `E001`, or domain-prefixed like `SCH_001`) is an implementation detail. Codes are never reused across versions (same stability principle as element IDs per R1). The `Diagnostic` interface is the contract between passes and the validation runner.

**DEC-5.5: W005 always fires — suppress via diagnostic system**

- **Timestamp**: 2026-03-19 ~3:20 PM EST
- **Status**: Decided
- **Decision**: W005 (self-document-only mapping) fires unconditionally for any element that maps only within its own document, regardless of whether the document inherits from other documents. The v0 conditional logic (only fire when `doc.inherits` is non-empty) is removed. Users who don't want this diagnostic suppress it via the typed diagnostic system (DEC-5.4).
- **Rationale**: "yeah, i think my hesitance is that i would feel meh implementing it that way... but to be fair, i won't be implementing it lmao. i can afford to be lazy + robust here :p those are in fact all of the attributes we care about, so it makes sense."
- **Rejected alternatives**:
  - *Config toggle for W005 scope*: A specific config option (`w005_scope: "inheriting_only" | "all"`) controls when it fires. Rejected: unnecessary complexity — the diagnostic suppression system already provides this control.
  - *Keep v0 conditional logic*: Only fire for inheriting documents. Rejected: the conditional was a workaround for lack of good suppression. With typed diagnostics, the workaround is unnecessary.
- **Implication**: All diagnostics should default to firing broadly, using the suppression system for user customization. This is the general pattern — diagnostics are opinionated by default with explicit opt-outs.

**DEC-5.6: `considered` validation via Zod schema — no hardcoded field logic**

- **Timestamp**: 2026-03-19 ~3:25 PM EST
- **Status**: Decided
- **Decision**: The `considered` field is validated entirely through the dynamic Zod schema system (DEC-3.11, DEC-3.12). There is no dedicated `_validate_considered()` function or any hardcoded field-specific validation logic. The `considered` field is defined on specific categories (like `decision`) via `field_schemas` using the `model` type with nested `fields`. Zod validates its structure like any other dynamically-defined field during the schema validation pass.
- **Rationale**: Consistent with the principle that "The validator will not validate any named, hardcoded field. It will use dynamically loaded schemas and validate those schemas in GVP Libraries." (from missing-requirements audit)
- **Rejected alternatives**:
  - *Dedicated validation function (v0 approach)*: Hardcoded `_validate_considered()` that checks structure specifically. Rejected: violates the dynamic schema principle — `considered` is just another field.
- **Implication**: The v0 `_validate_considered()` function is not ported to v1. Its logic is subsumed by the schema validation pass operating on Zod schemas built from `field_schemas`.

**DEC-5.7: Catalog construction errors are exceptions, pass results are Diagnostics**

- **Timestamp**: 2026-03-19 ~4:00 PM EST
- **Status**: Decided
- **Source**: Audit finding 1 — unclear error reporting model between catalog construction and validation passes
- **Decision**: Two distinct error mechanisms: Catalog construction (DEC-3.6) throws exceptions from the DEC-5.3 hierarchy (e.g., `SchemaError`, `DuplicateIdPrefixError`) on failure — fail-fast, no passes run. Validation passes (DEC-5.1) return `Diagnostic[]` — collect-all, reported together after all passes complete. This mirrors the ESLint pattern: parser errors (exceptions) prevent linting; lint results (diagnostics) are collected and reported. Zod's `ZodError` during schema validation at catalog build time propagates naturally through the exception hierarchy.
- **Rationale**: "let's go with A :)" — following TS ecosystem precedent (Zod throws, ESLint parser throws, TS compiler uses Diagnostics for analysis). Clean separation: catalog = prerequisite (fail-fast), passes = analysis (collect-all).
- **Rejected alternatives**:
  - *Everything is Diagnostics*: Catalog construction also returns Diagnostics, with error-severity ones halting further processing. Rejected: muddies the distinction between "can't build" and "built but has issues."
- **Implication**: Strict mode (DEC-5.4) applies only to pass Diagnostics, not catalog construction errors. Catalog construction errors are always errors — they can't be suppressed or downgraded. Config strictness settings (DEC-2.4, DEC-3.8) do not affect catalog construction.

**DEC-5.8: Suppression wins over strict mode**

- **Timestamp**: 2026-03-19 ~4:05 PM EST
- **Status**: Decided
- **Source**: Audit finding 3 — suppression vs strict mode precedence undefined
- **Decision**: When a diagnostic code is both suppressed in config and subject to strict mode promotion, suppression wins. Strict mode only promotes *unsuppressed* warning-severity diagnostics to errors. Suppression is an intentional, per-code decision; strict mode is a broad policy that catches things you forgot to address, not things you chose to ignore.
- **Rationale**: "A" — suppression is deliberate and specific.
- **Rejected alternatives**:
  - *Strict mode wins*: Suppressed warnings are still promoted and reported in strict mode. Rejected: undermines the purpose of explicit suppression.
  - *Suppression wins for warnings, strict wins for errors*: Can suppress warnings but not errors. Rejected: unnecessary complexity — error-severity diagnostics shouldn't be in the suppression list to begin with.
- **Implication**: Processing order: (1) passes produce Diagnostics, (2) suppressed codes are removed, (3) strict mode promotes remaining warnings to errors.

**DEC-5.9: Five canonical built-in validation passes**

- **Timestamp**: 2026-03-19 ~4:10 PM EST
- **Status**: Decided
- **Source**: Audit finding 5 — no canonical pass list defined
- **Decision**: v1 has five built-in validation passes, each with a stable name:
  1. **`schema`** — Validates element content against Zod schemas built from `field_schemas` (VAL-3)
  2. **`structural`** — Broken references, broken inheritance chains, undefined tags, ID gaps (VAL-1)
  3. **`traceability`** — `mapping_rules` compliance, R3 (every non-root element traces to a goal and a value) (VAL-2)
  4. **`semantic`** — Semantic warnings (W001-W012), staleness detection (VAL-4, DEC-4.7)
  5. **`user_rules`** — User-defined validation rules from config (VAL-6)

  `gvp validate` runs all five. Other commands may run a subset. Catalog construction (DEC-3.6) is NOT a pass — it's a prerequisite.
- **Rationale**: Maps directly to VAL-1 through VAL-4 and VAL-6 from the requirements. Staleness belongs in `semantic` rather than its own pass: "yeah, i'd put staleness with semantic :)"
- **Rejected alternatives**:
  - *Staleness as its own pass*: Separate `staleness` pass. Rejected: staleness is a semantic concern (is the element's review state coherent?), not a distinct validation domain.
- **Implication**: Pass names are stable identifiers used for the flex point in DEC-5.2 (future per-pass user rule injection). Adding a new pass is possible but should be rare — most new checks fit into an existing pass.

**DEC-5.10: User diagnostic codes use a separate namespace**

- **Timestamp**: 2026-03-19 ~4:15 PM EST
- **Status**: Decided
- **Source**: Audit finding 7 — diagnostic code uniqueness scope unclear
- **Decision**: User-defined rules must use a distinct code prefix (e.g., `U001`, `U002`). Built-in diagnostic codes use their own prefixes (e.g., `W001` for warnings, `E001` for errors — exact format is an implementation detail). If a user-defined rule's code collides with a built-in code, it's an error at config load time. Build-time checks enforce uniqueness within built-in codes; config-load checks enforce no collision between user and built-in codes.
- **Rationale**: "A" — clean separation, no ambiguity, prefix makes it immediately obvious in output whether a diagnostic came from a built-in pass or a user rule.
- **Rejected alternatives**:
  - *Shared namespace, no shadowing*: User rules can use any code, collision = error. Rejected: user could accidentally pick a code that a future version introduces, breaking their config on upgrade.
  - *Shared namespace, user shadows built-in*: User rule replaces built-in behavior. Rejected: too risky — accidentally disabling important built-in checks.
- **Implication**: The user code prefix (`U` or similar) should be documented. User-defined rules declare their code in config, validated at load time.

**DEC-5.11: Diagnostic suppression is exact-match only**

- **Timestamp**: 2026-03-19 ~4:20 PM EST
- **Status**: Decided
- **Source**: Audit finding 8 — prefix/wildcard suppression unclear
- **Decision**: Diagnostic suppression in config uses exact code matching only. `suppress: ["W005", "W006"]` suppresses those two codes. Wildcard or prefix patterns (e.g., `"W0*"`) are not supported. Every suppressed code is validated at config load — unknown or invalid codes are errors.
- **Rationale**: "A, explicit :3" — more strongly typed, every suppressed code is validated, wildcards invite suppressing diagnostics you didn't intend to.
- **Rejected alternatives**:
  - *Prefix matching*: `suppress: ["W0*"]` suppresses all W0xx codes. Rejected: less precise, can suppress future codes unintentionally.
- **Implication**: Users who want to suppress many diagnostics must list them individually. This is a feature, not a limitation — it ensures suppression is deliberate and reviewable.

**DEC-5.12: Exit codes — 0 for success or warnings-only, non-zero for errors**

- **Timestamp**: 2026-03-19 ~4:25 PM EST
- **Status**: Decided
- **Source**: Audit finding 12 — exit code behavior undefined
- **Decision**: `gvp validate` exits 0 when there are no error-severity diagnostics (success or warnings-only). Exits non-zero when any error-severity diagnostic is present. Warnings and errors are both printed to stderr. Structured output (if any) goes to stdout. Users who want warnings to cause failure use `--strict` (which promotes warnings to errors via DEC-5.4), not a separate `--fail-on-warnings` flag.
- **Rationale**: "yup :) i'd just note that warnings and errors should both be printed to stderr. there is still some room for catching stderr if we want" — follows common convention (ESLint, tsc, rustc exit 0 on warnings-only). Strict mode already exists for hard failure on warnings.
- **Rejected alternatives**:
  - *Distinct exit codes (1 for errors, 2 for warnings)*: Rejected: uncommon convention, and strict mode already handles the "fail on warnings" use case.
  - *`--fail-on-warnings` flag*: Rejected: subtly different from `--strict` — creates confusion about which to use.
- **Implication**: CI/CD pipelines that need to fail on warnings should use `gvp validate --strict`. The `--strict` flag is the single mechanism for controlling failure threshold.

**DEC-5.13: Config validation is eager — fail at load time**

- **Timestamp**: 2026-03-19 ~4:30 PM EST
- **Status**: Decided
- **Source**: Audit finding 15 — config validation timing unclear
- **Decision**: Config is validated immediately when loaded. Invalid config (unknown suppression codes, invalid values, malformed YAML, unknown config keys) produces an error before catalog construction starts. Config validation is not a pass — it's a prerequisite, like catalog construction. Bad config = fast failure with a clear error message.
- **Rationale**: "yeah, let's go with A for this project since the aim is full alignment" — consistent with the fail-early principle throughout (catalog construction, identity validation at invocation).
- **Rejected alternatives**:
  - *Lazy validation*: Config loaded but only validated when settings are used. Rejected: delays error feedback, potentially to a confusing point in the pipeline.
- **Implication**: The startup sequence is: (1) load and validate config (fail-fast), (2) build catalog (fail-fast via exceptions), (3) run validation passes (collect Diagnostics). Each stage must succeed before the next begins.

---

## Theme 6: Graph Traversal

### Context

v0's `ancestors()` and `descendants()` return flat `set[Element]`, losing the graph structure. The user wants these to return proper graphs. Also: what constitutes element identity and ordering in the new system?

### Discussion Items

| ID | Item | Source | Review Status |
|----|------|--------|---------------|
| 6.1 | ancestors/descendants return graph structure, not flat sets | missing-reqs: Model/ancestors(), Model/descendants() | DECIDED (DEC-6.1) |
| 6.2 | Element identity: what constitutes uniqueness? | missing-reqs: Schema/Element __hash__ __eq__ | DECIDED (DEC-6.2) |
| 6.3 | Element ordering: should priority factor into comparison? | missing-reqs: Schema/Element __hash__ __eq__ | DECIDED (DEC-6.3) |
| 6.4 | Element string representation (TS equivalent of __str__/__repr__) | missing-reqs: Schema/Element __str__ __repr__ | DECIDED (DEC-6.4) |

### Decisions

**DEC-6.1: ancestors/descendants return a full Graph object**

- **Timestamp**: 2026-03-19 ~5:00 PM EST
- **Status**: Decided
- **Decision**: `catalog.ancestors(element)` and `catalog.descendants(element)` return a `Graph` class instance with nodes, directed edges, and traversal methods (e.g., `pathsTo()`, `pathsFrom()`, `roots()`, `leaves()`). Both methods return the same `Graph` type — the direction is implicit from the call site (ancestors = upward traversal, descendants = downward). The `Graph` class is direction-agnostic: `roots()` means "nodes with no incoming edges" regardless of which method produced the graph.
- **Rationale**: "honestly, i think D. no derivation necessary. let's get the full deal. derivation code would be expensive anyways" — a proper Graph class avoids re-deriving structure from raw adjacency data. On using the same type for both directions: "yup, A seems fine to me"
- **Rejected alternatives**:
  - *Adjacency map (`Map<Element, Element[]>`)*: Lightweight but requires callers to derive paths, trees, and edge lists. Rejected: "derivation code would be expensive anyways."
  - *Tree/DAG nodes (recursive structure)*: Natural for tree rendering but duplicates elements that appear in multiple paths. Rejected: less flexible than a full graph.
  - *Edge list (`Array<[Element, Element]>`)*: Simple but requires reconstruction for tree display. Rejected: too low-level.
  - *Directional graph types*: Distinct `AncestorGraph`/`DescendantGraph` types. Rejected: unnecessary complexity — same graph, different call site.
- **Implication**: The `Graph` class is a core data structure. Its interface should support the needs of `gvp trace` (tree output), DOT rendering (edges), and validation (reachability). The `Graph` class does NOT need to be a general-purpose graph library — it's scoped to GVP's traversal needs. The start element is always included as a node in the returned graph (even if it has no ancestors/descendants). Graphs are immutable once constructed (DEC-6.5). Filtering (e.g., excluding deprecated elements) is a caller concern — `ancestors()`/`descendants()` return the full graph.

**DEC-6.2: Element identity is `(source, document, id)` — matching canonical FQID**

- **Timestamp**: 2026-03-19 ~5:05 PM EST
- **Status**: Decided
- **Decision**: Element equality and hashing are based on the `(source, document_path, id)` tuple — the same components as the canonical FQID from DEC-1.1b (e.g., `@github:company/org-gvp:values:V1`). `document_path` is the file path relative to the library directory, without extension (per DEC-1.1c) — e.g., `values` for `values.yaml` or `config/defaults` for `config/defaults.yaml`. Two elements are equal if and only if they have the same source, document path, and id. Document paths alone are NOT sufficient for uniqueness in v1's multi-library model — two libraries can have documents with the same file path.
- **Rationale**: "yup, A :) it is our SOT canonical FQID for elements, so it would be what we use for equality"
- **Rejected alternatives**:
  - *`(document.name, id)` (v0 approach)*: Rejected: document names are not globally unique across libraries in v1.
  - *`(library_path, document, id)`*: Uses resolved local file path instead of source URI. Rejected: file paths change per machine; source is the stable identifier.
  - *`(document_path, id)`*: Uses document file path. Rejected: same instability as library path.
- **Implication**: Element equality checks require access to the source context. Elements must carry their source information (or a reference to it). This is consistent with DEC-2.12 (catalog preserves per-library context).

**DEC-6.3: Priority does not affect element equality or ordering operators**

- **Timestamp**: 2026-03-19 ~5:10 PM EST
- **Status**: Decided
- **Decision**: Priority is not part of element identity or comparison operators. Equality uses `(source, document, id)` only (DEC-6.2). Sorting by priority is done explicitly when needed (e.g., `elements.sort(byPriority)`) — it is not baked into default comparison behavior. Two elements are "the same element" regardless of their priority values.
- **Rationale**: "i was going to say it should affect ordering... but we can do that explicitly as you said, and it could result in unexpected outcomes. yeah, let's go with A"
- **Rejected alternatives**:
  - *Priority affects ordering but not equality*: Elements implement a default sort where priority is the primary key. Rejected: "could result in unexpected outcomes" — sorted collections would change behavior based on priority values, creating subtle bugs.
- **Implication**: Any code that needs priority-ordered elements must sort explicitly. This keeps element identity clean and predictable.

**DEC-6.4: Three string representation methods**

- **Timestamp**: 2026-03-19 ~5:15 PM EST
- **Status**: Decided
- **Decision**: Elements have three distinct string representation methods:
  1. **`toString()`** — Human-readable display form: `V1: "Alignment"` (id + name). Called automatically by JS template literals and string concatenation.
  2. **`toLibraryId()`** — Within-library qualified reference: `values:V1` (document:id). Used in YAML `maps_to` fields and within-library references (DEC-1.1c 2-segment format).
  3. **`toCanonicalId()`** — Fully qualified ID: `@github:company/org-gvp:values:V1`. Globally unique across all libraries (DEC-1.1b). Used for cross-library references, debugging, and logging.
- **Rationale**: "i like B, i'd just call the second one `toLibraryId`" — the three use cases (display, YAML authoring, debugging/logging) are distinct and shouldn't be conflated.
- **Rejected alternatives**:
  - *Two methods (`toString()` + `toDebugString()`)*: Combines YAML reference and debug/canonical into one. Rejected: the within-library reference and the canonical ID serve different purposes — collapsing them means one method does double duty.
  - *v0 approach (`__str__` = `doc:id`, `__repr__` = `file:doc:id`)*: Misuses Python conventions. Rejected: v1 uses purpose-named methods instead of overloading generic protocols.
- **Implication**: The three methods map to DEC-1.1c's reference syntax: `toString()` is for display (not a reference), `toLibraryId()` is a 2-segment reference, `toCanonicalId()` is a 3-segment reference with source. `toLibraryId()` always returns the format relative to the element's origin library — callers in different libraries should use `toCanonicalId()` for safe cross-library references.

**DEC-6.5: Graph objects are immutable; start element always included**

- **Timestamp**: 2026-03-19 ~5:30 PM EST
- **Status**: Decided
- **Source**: Audit findings 5 and 6 — isolated elements and graph mutability
- **Decision**: Graph objects returned by `ancestors()` and `descendants()` are immutable once constructed — no add/remove node/edge methods. The start element is always included as a node in the returned graph, even if it has no ancestors or descendants (an orphan element produces a single-node graph, not an empty one). Filtering (e.g., excluding deprecated elements) is a caller concern — the graph methods return the full subgraph, callers filter as needed.
- **Rationale**: On immutability: "A :)" — graphs are derived data from the Catalog (source of truth). Modifications should happen at the catalog level. On including the start element: "i'd go with A, yeah :)" — an empty graph is ambiguous (broken catalog or root element?); including the start node makes the graph self-contained.
- **Rejected alternatives**:
  - *Mutable graphs*: Callers can modify returned graphs. Rejected: requires defensive copies, risk of inconsistent state when graphs are shared or cached.
  - *Start element excluded*: Graph contains only ancestors/descendants, not the element itself. Rejected: empty graph is ambiguous.
  - *Built-in filtering*: `ancestors(element, { includeDeprecated: false })`. Rejected: filtering is a caller/renderer concern, not core graph responsibility.
- **Implication**: If callers need a filtered view, they construct a new graph from the original. The Graph class may provide utility methods for this (e.g., `filter(predicate)` returning a new immutable Graph), but this is an implementation detail.

**DEC-6.6: Local library source identity — configured in project config, `@local` fallback**

- **Timestamp**: 2026-03-19 ~5:35 PM EST
- **Status**: Decided
- **Source**: Audit finding 1 — local/root library has no source URI for identity
- **Decision**: The local project's source identity is explicitly configured in `.gvp/config.yaml` via a `source` field (e.g., `source: "@github:shitchell/gvp"`). This is required for published/shared libraries — it becomes part of their elements' canonical IDs. For personal/unpublished projects, the `source` field is optional and defaults to `@local`. Elements in the local library use whatever source is configured (or `@local`) for their `toCanonicalId()` and identity tuple (DEC-6.2).
- **Rationale**: "i agree fully :) C with A as a fallback, no B because magic" — explicit configuration over auto-derivation. The user owns their identity.
- **Rejected alternatives**:
  - *`@local` sentinel only*: All local elements use `@local`. Rejected: identity changes when a project is published, breaking equality and references.
  - *Auto-derive from git remote*: Inspect `.git/config` for origin URL and derive source. Rejected: "no B because magic" — magical behavior is fragile and surprising.
- **Implication**: When a project transitions from unpublished (`@local`) to published (configured source), existing elements' canonical IDs change. This is a one-time migration — the project adds `source:` to config and updates any cross-library references. Since this is a scrappy alpha with no backwards compatibility concerns (DEC-X.1), this is acceptable.

**DEC-6.7: `maps_to` cycles are allowed — graph handles them gracefully**

- **Timestamp**: 2026-03-19 ~5:40 PM EST
- **Status**: Decided
- **Source**: Audit findings 4 and 10 — cycle handling in `maps_to` graph
- **Decision**: Cycles in the `maps_to` graph are allowed. `maps_to` means "relates to" — it is intentionally vague and does not imply a strict justification hierarchy. Bidirectional mappings (A maps to B, B maps to A) are valid. The Graph class handles cycles gracefully via seen-set traversal (nodes are visited at most once). No validation diagnostic is emitted for `maps_to` cycles. `gvp trace` output marks cycles with "seen above" indicators (per CMD-3).
- **Rationale**: "nah, in my mind it's intentionally vague. if it meant 'justified by', then we might have `justifies` or `justified_by`. `maps_to` is intentionally fuzzy, and i'm fine with having bi-directional mappings. it mostly just means 'relates to'. we might add more granular edges later, but for now this is fine"
- **Rejected alternatives**:
  - *Error — cycles forbidden*: Structural validation rejects `maps_to` cycles. Rejected: `maps_to` is not a strict hierarchy — circular relationships are valid (values reinforcing each other, mutual dependencies).
  - *Warning — cycles flagged*: Emit a diagnostic for cycles. Rejected: cycles are intentional and expected in some domains.
- **Implication**: The Graph class's traversal methods must use seen-set cycle detection to prevent infinite loops. This is distinct from inheritance cycle detection (DEC-1.8), which IS an error because inheritance defines a strict ordering. `maps_to` and inheritance are separate graphs with different cycle policies.

---

## Theme 7: Renderer / Exporter Design

### Context

v0 has four renderers (markdown, CSV, SQLite, DOT/PNG) that hardcode field knowledge. The user wants schema-driven rendering, minimal default dependencies, and clearer terminology.

### Discussion Items

| ID | Item | Source | Review Status |
|----|------|--------|---------------|
| 7.1 | "Exporter" vs "renderer" terminology | missing-reqs: Renderer/CSV column order note | DECIDED (DEC-7.1) |
| 7.2 | Trace vs render overlap — consolidate or distinguish? | missing-reqs: Renderer/CSV column order note | DECIDED (DEC-7.2) |
| 7.3 | Dynamic columns in CSV/SQLite from schema | missing-reqs: Renderer/CSV column order | DECIDED (DEC-7.3) |
| 7.4 | Minimal default dependencies (only built-in renderers by default) | missing-reqs: Package/optional dependencies | DECIDED (DEC-7.4) |
| 7.5 | Use graphviz JS library for PNG, not shelling out to `dot` | missing-reqs: Renderer/dot requirement | DECIDED (DEC-7.5) |
| 7.6 | Tier/rank representation for dynamic categories | missing-reqs: Renderer/DOT tier ranking | DECIDED (DEC-7.6) |
| 7.7 | JSON as a first-class renderer/exporter | v1-reqs: REN-5, TAS-4 | DECIDED (DEC-7.7) |

### Decisions

**DEC-7.1: "Exporter" terminology for all output formats**

- **Timestamp**: 2026-03-20 ~12:00 PM EST
- **Status**: Decided
- **Decision**: All output format transformations are called "exporters," not "renderers." Markdown, CSV, SQLite, DOT/PNG, and JSON are all exporters. One term, one interface, one registration mechanism.
- **Rationale**: "yeah, i think B :) that's pretty standard terminology and captures both" — "export" accurately describes what all of them do (transform catalog data into a target format). "Render" implies visual presentation, which doesn't fit CSV or SQLite.
- **Rejected alternatives**:
  - *All are "renderers"*: Same concept, different word. Rejected: "render" implies visual output, which is misleading for data formats like CSV and SQLite.
  - *Two types ("renderers" and "exporters")*: Human-readable outputs are "renderers," machine-readable are "exporters." Rejected: the distinction creates unnecessary complexity — they share the same interface and registration mechanism.
- **Implication**: The codebase uses "Exporter" consistently. The field previously called `render_options` is renamed to `export_options` for consistency (DEC-7.9). All references across all decisions have been updated.

**DEC-7.2: `gvp inspect` for element-level views; exporters as shared formatting layer**

- **Timestamp**: 2026-03-20 ~12:05 PM EST
- **Status**: Decided
- **Decision**: Two distinct commands with shared infrastructure:
  - **`gvp export`** — Whole catalog → format. Uses exporters.
  - **`gvp inspect <element>`** — Single element exploration. Supports flags for different views: `--trace` (graph ancestry/descendants), `--reviews` (review history), `--updates` (update history), etc. Uses exporters for `--format` output formatting.

  Exporters are a shared formatting layer that both commands use. The exporter interface accepts both full catalog and subgraph/subset inputs. `gvp inspect` builds the data view, then hands it to an exporter for formatting.
- **Rationale**: "i can dig. i might go with `show` or `inspect`, though, with a `--trace` flag. this would also lead into other options for inspecting a single element -- reviews, updates, etc..." On sharing exporters: "i might still have it borrow some of the exporters under the hood?" — exporters are infrastructure, not command-specific.
- **Rejected alternatives**:
  - *Trace as a mode of export*: `gvp export --format tree --element V1`. Rejected: different inputs (one element vs whole catalog) and different user intent (exploration vs data export).
  - *Trace and export fully independent*: No shared infrastructure. Rejected: duplicates formatting logic.
- **Implication**: The exporter interface must support both full-catalog and scoped inputs. CMD-3 (trace) in the requirements should be updated to reference `gvp inspect --trace`. The `inspect` command is Theme 8 (CLI) territory for detailed flag design.

**DEC-7.3: Dynamic columns in CSV; per-category tables in SQLite; reserved fields normalized**

- **Timestamp**: 2026-03-20 ~12:10 PM EST
- **Status**: Decided
- **Decision**:
  - **CSV**: Reserved fields (DEC-3.2) as fixed columns in a stable order, followed by dynamic `field_schemas` fields appended as additional columns. Empty cells where a field doesn't apply to an element's category.
  - **SQLite**: Per-category tables. Each category gets its own table with columns for reserved fields + that category's `field_schemas` fields. No empty cells from cross-category mismatch.
  - **Both**: Reserved list fields (`maps_to`, `tags`, `origin`, `updated_by`, `reviewed_by`) are normalized into join/relationship tables in SQLite. Dynamic `field_schemas` list/dict fields stay as JSON columns. Normalization is scoped exclusively to reserved fields — it is not schema-driven.
- **Rationale**: CSV as one flat file is simplest for spreadsheet use. SQLite per-category tables is natural for relational data. On normalization: "in that case, yeah, i'd go with A :) explicitly noting that it's only operationalizable against reserved keywords" — the exporter doesn't need to inspect `field_schemas` to decide what to normalize.
- **Rejected alternatives**:
  - *Per-category CSV*: Each category gets its own CSV file. Rejected: adds file management complexity for the most common use case (quick flat export).
  - *Schema-driven normalization*: Any `field_schemas` field with `type: list` gets its own join table. Rejected: generates potentially dozens of tiny join tables, noisy.
  - *Everything denormalized*: All list fields stored as JSON arrays. Rejected: loses the queryability that makes SQLite useful for reserved structural fields.
- **Implication**: The SQLite exporter needs access to the category registry to generate per-category tables. The CSV exporter needs access to `field_schemas` to know which dynamic columns to include.

**DEC-7.4: Built-in exporters use Node.js built-ins only; graph visualization is optional**

- **Timestamp**: 2026-03-20 ~12:15 PM EST
- **Status**: Decided
- **Decision**: Exporters that use only Node.js built-in functionality are included by default: Markdown, CSV, JSON. Exporters requiring external npm dependencies are optional: SQLite (requires a TS SQLite library) and DOT/PNG (requires a WASM graphviz library per DEC-7.5). Users must explicitly install optional exporter dependencies. The default install has zero external runtime dependencies for export.
- **Rationale**: "A :) anything node.js comes with can be shipped, any external deps require opt-in" — for security-minded orgs and minimalists, only built-in functionality ships by default.
- **Rejected alternatives**:
  - *JSON only by default*: Everything else optional. Rejected: too minimal — Markdown and CSV are zero-dep and broadly useful.
  - *All exporters included*: Graphviz WASM and SQLite library bundled by default. Rejected: adds significant package size for features many users won't use.
  - *SQLite as built-in*: Bundle a SQLite library as a default dependency. Rejected: "we are aiming to minimize required dependencies by shipping only what's required. exporters with dependency requirements are optional."
- **Implication**: Optional exporters fail gracefully with a clear message if their dependency isn't installed (e.g., `"DOT/PNG export requires @hpcc-js/wasm-graphviz. Install with: npm install @hpcc-js/wasm-graphviz"`). Built-in exporters (Markdown, CSV, JSON) are always available.

**DEC-7.5: WASM-based graphviz for PNG generation — no system calls**

- **Timestamp**: 2026-03-20 ~12:20 PM EST
- **Status**: Decided
- **Decision**: v1 uses a WASM-compiled graphviz library (e.g., `@hpcc-js/wasm-graphviz`) for DOT → SVG/PNG conversion. No shelling out to the system `dot` binary. The graphviz library is an optional npm dependency (DEC-7.4). All rendering happens in-process.
- **Rationale**: "A :) no system calls lol" — eliminates the system dependency friction entirely. WASM graphviz is mature and runs in Node.js.
- **Rejected alternatives**:
  - *Shell out to system `dot` (v0 approach)*: Requires graphviz installed on the system. Rejected: system dependency is friction, especially in CI/CD or containerized environments.
  - *DOT text only, no PNG*: Export DOT format, users pipe to `dot` themselves. Rejected: less convenient, and the WASM approach eliminates the need for this compromise.
- **Implication**: The specific WASM library is an implementation choice. The DOT exporter generates DOT text, then optionally converts to SVG/PNG using the WASM library if available.

**DEC-7.6: `tier` moves to `export_options.dot` — not a top-level category field**

- **Timestamp**: 2026-03-20 ~12:25 PM EST
- **Status**: Decided
- **Decision**: The `tier` field is removed from the top-level category definition schema and moved to `export_options: { dot: { tier: N } }`. Tier is purely a DOT/graph layout concern — it controls `rank=same` grouping for visual hierarchy. No other exporter, command, or validation rule uses tier. Its Zod schema is declared by the DOT exporter class (per DEC-7.8).
- **Rationale**: "yup :) i think it's just for the renderer, so i'd go with render options" — tier has no consumers outside the DOT exporter, so it belongs in that exporter's namespace.
- **Rejected alternatives**:
  - *Keep tier on category definition*: Top-level field as in v0. Rejected: tier is only used by the DOT exporter — putting it at the category level implies it's a semantic property of the category.
  - *Tier on category + DOT overrides*: Category defines default tier, DOT export_options can override. Rejected: unnecessary complexity for a single-consumer field.
- **Implication**: DOM-5 in the requirements should be updated to remove `tier` from the category definition's optional fields. The DOT exporter's `optionsSchema` includes `tier` as an optional integer.

**DEC-7.7: JSON as a first-class, lossless, strongly-typed exporter**

- **Timestamp**: 2026-03-20 ~12:30 PM EST
- **Status**: Decided
- **Decision**: JSON is a built-in exporter (zero dependencies, ships by default). The JSON output must be lossless — it contains sufficient information to fully reconstruct the catalog and all source data. The output format has a Zod schema (strongly typed). The specific JSON structure (flat vs nested, field ordering, etc.) is an implementation detail — the constraints are losslessness and strong typing only.
- **Rationale**: "my only constraints are: 1. it's strongly typed/schemafied 2. no information loss (i.e.: you could fully reconstruct the catalog and all sources) other than that, dealer's choice on the JSON structure :)"
- **Rejected alternatives**: None — JSON as a first-class exporter was uncontroversial.
- **Implication**: The JSON exporter is the foundation for programmatic consumption (TAS-4: AI agents, doc generators, commit hooks). The Zod schema for the output format serves as documentation and enables consumers to validate the JSON they receive.

**DEC-7.8: Exporter registration via abstract base class**

- **Timestamp**: 2026-03-20 ~12:35 PM EST
- **Status**: Decided
- **Decision**: Exporters are classes that extend an abstract `Exporter` base class. Each subclass declares: `key` (string identifier, e.g., `"dot"`), `name` (human-readable, e.g., `"Graphviz DOT"`), `optionsSchema` (Zod schema for `export_options` — required per DEC-3.3), and an `export()` method. Built-in exporters are imported directly at startup. Optional exporters (e.g., DOT/PNG) are conditionally imported based on dependency availability. The base class handles common registration logic.
- **Rationale**: "yeah i mean... if it was me, i'd probably just bake it into the exporter class? have each one extend a base Exporter class... with that base class handling registration. i think we used that approach elsewhere. then have any declarations just be part of the exporter class."
- **Rejected alternatives**:
  - *Static registry with plain objects*: Exporters register via `{ key, optionsSchema, export }` objects collected at startup. Rejected: less idiomatic TS than class-based approach; misses the opportunity for the base class to handle shared logic.
  - *Plugin discovery (convention-based)*: Auto-discover `gvp-exporter-*` npm packages. Rejected: overkill for v1 with only 5 exporters. Can be added later as a flex point.
- **Implication**: This fulfills the exporter registration mechanism deferred from DEC-3.3. The exporter's `key` is what appears in `export_options` keys on category definitions. At catalog build time, registered exporter schemas are used to validate `export_options` contents (per DEC-3.8, unrecognized keys are errors by default).

**DEC-7.9: Rename `render_options` to `export_options`**

- **Timestamp**: 2026-03-20 ~1:00 PM EST
- **Status**: Decided
- **Source**: Audit finding 1 — naming mismatch between "exporter" terminology and "render_options" field name
- **Decision**: The `render_options` field on category definitions is renamed to `export_options` for consistency with DEC-7.1's "exporter" terminology. All references across all decisions have been updated. The config key `strict_render_options` (DEC-3.8) is similarly renamed to `strict_export_options`.
- **Rationale**: "yep, rename :)" — no backwards compatibility concerns (DEC-X.1), and consistency matters.
- **Rejected alternatives**:
  - *Keep `render_options`*: Established across many decisions. Rejected: the mismatch creates cognitive friction — users see "exporters" in commands but `render_options` in schemas.
- **Implication**: All YAML category definitions use `export_options:` instead of `render_options:`. The requirements doc should be updated accordingly.

**DEC-7.10: JSON losslessness — catalog + all source data, file paths derivable**

- **Timestamp**: 2026-03-20 ~1:05 PM EST
- **Status**: Decided
- **Source**: Audit finding 6 — JSON losslessness scope vague
- **Decision**: The JSON exporter's output must contain sufficient information to fully reconstruct the catalog. This includes: (1) category definitions and field_schemas, (2) all elements with all fields, (3) provenance metadata (origin, updated_by, reviewed_by), (4) document metadata (inherits, defaults), (5) library source and config. File paths are derivable from source + document path and are NOT stored separately. Line numbers are NOT included. Raw YAML comments/formatting are NOT included — JSON captures the logical model, not the physical representation.
- **Rationale**: "i'd say 7 to an extent. *if* a Library is sourced from a local filepath, and we are tracking source + document name, then the filepath should be reconstructable. if it was sourced from a repo or similar, then we won't have a filepath to reconstruct per se (except perhaps relative to the remote repo root). line numbers do not need to be reconstructed"
- **Rejected alternatives**: None — the scope was clarified, not debated.
- **Implication**: The JSON exporter is the canonical machine-readable representation of a catalog. Round-tripping (JSON → catalog → JSON) should produce identical output.

**DEC-7.11: Optional exporter dependencies fail at use time; validated at catalog build per DEC-3.8**

- **Timestamp**: 2026-03-20 ~1:10 PM EST
- **Status**: Decided
- **Source**: Audit finding 7 — optional exporter failure timing unspecified
- **Decision**: Optional exporters that are not installed do not cause errors at startup — all commands work regardless of which optional exporters are installed. The failure matrix:
  - Exporter installed + valid `export_options`: validated at catalog build time (Zod schema check)
  - Exporter installed + invalid `export_options`: error at catalog build time
  - Exporter NOT installed + `export_options` defined: error at catalog build time per DEC-3.8 (unrecognized key). Suppressible via config (`strict_export_options: false`).
  - Exporter NOT installed + no `export_options`: no error. Error at use time if user tries `gvp export --format dot`.
  - Exporter NOT installed + DEC-3.8 suppressed + `export_options` defined: no validation of options contents. Error at use time if user tries to export.
- **Rationale**: "definitely at use time and i'd say also during `validate`" — catalog build validates what it can (schema), use time catches the rest.
- **Rejected alternatives**:
  - *Fail at startup*: If any registered exporter's dependency is missing, the app fails to start. Rejected: prevents ALL commands from working, even ones that don't need the missing exporter.
- **Implication**: The `gvp validate` command runs the schema validation pass which catches invalid `export_options` contents (for installed exporters). Missing exporters are caught by DEC-3.8's key validation.

---

## Theme 8: CLI & Config Philosophy

### Context

The user favors gratuitous configurability while maintaining sensible defaults. Several v0 behaviors are hardcoded that should be config-driven.

### Discussion Items

| ID | Item | Source | Review Status |
|----|------|--------|---------------|
| 8.1 | Config override modes: load specific file, skip user/global, skip all | missing-reqs: CLI/--config /dev/null | DECIDED (DEC-8.1) |
| 8.2 | `--verbose` should be functional | missing-reqs: CLI/--verbose | DECIDED (DEC-8.2) |
| 8.3 | Trace tree truncation width as config value | missing-reqs: Command/trace truncation | DECIDED (DEC-8.3) |
| 8.4 | Editor template generation from dynamic schemas | missing-reqs: Command/editor template | DECIDED (DEC-8.4) |
| 8.5 | Editor edit strips `#` comment lines | missing-reqs: Command/edit strips comments | DECIDED (DEC-8.5) |
| 8.6 | Editor fallback cascade ($VISUAL, $EDITOR, etc.) | missing-reqs: Command/editor fallback | DECIDED (DEC-8.6) |
| 8.7 | Philosophy: framework serves alignment, not users | missing-reqs: Philosophy | DECIDED (DEC-8.7) |

### Decisions

**DEC-8.1: Config override modes — flags, inline overrides, and env vars**

- **Timestamp**: 2026-03-20 ~2:00 PM EST
- **Status**: Decided
- **Decision**: v1 supports multiple config override mechanisms:
  - `--config <path>` — load this file exclusively, replacing all config discovery
  - `--no-config` — skip all config files entirely
  - `-c key=value` — inline config override, highest precedence
  - `GVP_CONFIG_SYSTEM` — env var for system config path (set to empty or `/dev/null` to skip)
  - `GVP_CONFIG_GLOBAL` — env var for global/user config path (same)
  - `GVP_CONFIG_PROJECT` — env var for project config path (same)
  - `GVP_CONFIG_LOCAL` — env var for local config path (same)

  Four config layers (closest scope wins): `/etc/gvp/config.yaml` (system) → `~/.config/gvp/config.yaml` (global/user) → `.gvp/config.yaml` (project) → `.gvp.yaml` (local/personal).

  Precedence: `-c` > `--config` > env vars > discovered config files. `--no-config` disables ALL config sources (files and env vars); only `-c` inline overrides still apply.
- **Rationale**: "i dig C, but why not go ahead and add the env vars? it's... super trivial to add :p" — follows git conventions (`GIT_CONFIG_GLOBAL`, `GIT_CONFIG_SYSTEM`, `-c key=value`). Env vars are trivial to implement and provide granular control per config layer.
- **Rejected alternatives**:
  - *`--config /dev/null` for skip-all*: v0's approach. Rejected: unclear syntax — `--no-config` is more explicit.
  - *Flags only, no env vars*: Simpler but less composable for CI/CD and scripting. Rejected: env vars are trivial and follow established conventions.
- **Implication**: The four env vars map to the four config layers. All config override mechanisms feed into the same config loading pipeline, validated eagerly per DEC-5.13. `--config <path>` replaces file discovery only — library `config_overrides` (DEC-2.4) still apply on top (DEC-8.8). `--config` and `--no-config` are mutually exclusive — specifying both is an error.

**DEC-8.2: `--verbose` with leveled verbosity**

- **Timestamp**: 2026-03-20 ~2:05 PM EST
- **Status**: Decided
- **Decision**: The `--verbose` flag supports stacking for leveled output:
  - `-v` — Library/document loading trace: which configs loaded, which libraries resolved, inheritance chain
  - `-vv` — Pipeline detail: validation pass progress, exporter activity, timing info
  - `-vvv` — Debug internals: Zod schema construction, config merging steps, internal state

  Follows the established convention used by ssh, curl, git, and others (P10).
- **Rationale**: "yup, maximum configurability for the configuration :p i doubt it will ever be used lol, but easy enough to add in :)" — leveled verbosity is the established convention and trivial to implement.
- **Rejected alternatives**:
  - *Single `--verbose` flag (on/off)*: Less granular. Rejected: stacking is the convention and costs nothing extra.
  - *`--log-level debug|info|warn`*: More explicit but less conventional for CLI tools. Rejected: `-v`/`-vv`/`-vvv` is more idiomatic.
- **Implication**: Verbose output goes to stderr (consistent with DEC-5.12 — diagnostics to stderr, structured output to stdout).

**DEC-8.3: Magic numbers exposed as config values**

- **Timestamp**: 2026-03-20 ~2:10 PM EST
- **Status**: Decided
- **Decision**: Any magic number in the codebase (e.g., truncation width, default timeout) is defined as a named constant and exposed as a config value with a sensible default. The trace tree truncation width specifically defaults to terminal width (auto-detected), overridable via config (e.g., `display.truncation_width: 120`) and CLI inline override (`-c display.truncation_width=80`). This is a general pattern, not specific to truncation — all magic numbers follow the same principle: constant → config value → sensible default.
- **Rationale**: "any magic numbers should at *least* have a constant set, but i think a config is generally the better move so that we can tweak as wanted. fairly painless to expose a constant through the config, even if 90% of those never get set in the config"
- **Rejected alternatives**:
  - *Hardcoded constants only*: Named constants in code but not configurable. Rejected: "a config is generally the better move."
- **Implication**: The config schema grows to include display/formatting options. This is consistent with V8 (Configurability) and P8 (opinionated defaults with escape hatches).

**DEC-8.4: Editor templates generated dynamically from field_schemas**

- **Timestamp**: 2026-03-20 ~2:15 PM EST
- **Status**: Decided
- **Decision**: When `gvp add --editor` opens an editor, the template is dynamically generated from the target category's `field_schemas`. Required fields are shown with placeholder values. Optional fields are shown as commented-out lines. `#` comment lines provide guidance (field descriptions, type hints). Reserved fields (DEC-3.2) that are auto-populated (e.g., `id`, `origin`) are omitted from the template.
- **Rationale**: "i think it's straightforward" — dynamic templates from schemas is the natural consequence of the schema-driven architecture.
- **Rejected alternatives**: None — this was uncontroversial.
- **Implication**: The template generator needs access to the category registry and `field_schemas`. This ties into DEC-3.3b (`display_name` on fields can be used in template comments).

**DEC-8.5: Editor strips `#` comment lines — git commit message convention**

- **Timestamp**: 2026-03-20 ~2:20 PM EST
- **Status**: Decided
- **Decision**: After the editor closes, lines starting with `#` are stripped before parsing the YAML. This allows inline comments and guidance in the editor template (DEC-8.4) without breaking YAML parsing. Follows the git commit message convention (P10).
- **Rationale**: "comments in the editor are to help the user. that intention does not map well to comments that would end up in the structured yaml"
- **Rejected alternatives**: None — v0 already does this, and the convention is well-established.
- **Implication**: YAML comments are intentionally non-preservable through the editor flow. Users who want persistent comments in their YAML files should not use the editor mode for those files.

**DEC-8.6: Editor fallback cascade unchanged from v0**

- **Timestamp**: 2026-03-20 ~2:25 PM EST
- **Status**: Decided
- **Decision**: Editor resolution follows the same cascade as v0: `$VISUAL` → `$EDITOR` → `which editor` → `which vi` → `which nano` → error. This is already captured as D9 in the GVP library and follows POSIX conventions.
- **Rationale**: "yup :) looks good" — the cascade respects user environment (P7), follows established conventions (P10), and ensures the tool works everywhere (G8).
- **Rejected alternatives**: None — no reason to change a working, conventional cascade.
- **Implication**: Unchanged from v0. D9 in the GVP library already documents this.

**DEC-8.7: Philosophy already captured in GVP library — no new requirement needed**

- **Timestamp**: 2026-03-20 ~2:30 PM EST
- **Status**: Decided
- **Decision**: The "framework serves alignment, not users" philosophy is already captured across multiple GVP library elements: P6 ("where coherency demands friction, friction wins"), P8 ("opinionated defaults with escape hatches"), V1 (Alignment), V2 (Coherency), CON1 (agents optimize for minimal effort). No new requirement or GVP element is needed. The philosophy doc (`docs/philosophy.md`) may need rephrasing to better reflect the actual design — the framework defaults to serving alignment but gives users configurable escape hatches, rather than imposing alignment unconditionally.
- **Rationale**: "i think it's already captured in the goals/values" — confirmed by reviewing P6, P8, V1, V2, CON1. On the philosophy doc's framing: "as it stands, i'm not sure the actual phrasing is actually consistent with our design / intention"
- **Rejected alternatives**:
  - *Add PHI-1 requirement*: Formal requirement capturing the philosophy. Rejected: would duplicate P6 + P8.
  - *Add R5 rule ("alignment over convenience")*: Unconditional rule. Rejected: "it's intentionally left to the user to decide things like that, e.g.: by suppressing warnings if desired."
- **Implication**: The philosophy doc should be revisited during documentation cleanup to ensure its framing reflects configurable friction, not imposed friction. This is a documentation task, not a design decision.

**DEC-8.8: `--config` replaces file discovery only — library `config_overrides` still apply**

- **Timestamp**: 2026-03-20 ~3:00 PM EST
- **Status**: Decided
- **Source**: Audit finding 3 — `--config` interaction with `config_overrides` unclear
- **Decision**: `--config <path>` replaces config FILE discovery — it loads the specified file instead of walking backwards to find configs. However, library `config_overrides` (DEC-2.4) still apply on top of whatever config was loaded. Library-level governance cannot be bypassed by a CLI flag. The user controls their config files; library authors control their overrides.
- **Rationale**: "yup :) i agree on A" — `config_overrides` is a library-level governance mechanism (an org can enforce strict mode). Bypassing it with a CLI flag defeats the purpose.
- **Rejected alternatives**:
  - *`--config` bypasses everything*: Full control — only the specified file and `-c` overrides. Rejected: defeats the purpose of library governance via `config_overrides`.
- **Implication**: The config loading pipeline is: (1) load config files (discovered or `--config`), (2) apply `-c` inline overrides, (3) apply library `config_overrides` (ancestor-wins per DEC-2.4). `-c` inline overrides are applied before `config_overrides`, so a library can still enforce its overrides on top of inline values.

**DEC-8.9: Four config layers — system, global, project, local**

- **Timestamp**: 2026-03-20 ~3:05 PM EST
- **Status**: Decided
- **Source**: Audit finding 2 — config layer count mismatch between DEC-1.1 and CFG-1
- **Decision**: v1 has four config layers, from broadest to narrowest scope:
  1. **System**: `/etc/gvp/config.yaml` — machine-wide defaults
  2. **Global/User**: `~/.config/gvp/config.yaml` — user-wide preferences (e.g., identity from DEC-4.3)
  3. **Project**: `.gvp/config.yaml` — project-level settings, committed to VCS
  4. **Local**: `.gvp.yaml` — personal overrides, conventionally gitignored

  Closer scope wins on conflict (local > project > global > system), consistent with CFG-2. Each layer has a corresponding env var (DEC-8.1).
- **Rationale**: "C. we have servers we use at work where it would be useful to have system enforced stuffs. granted, in practice i think i'd tend to use repos over system-specific, untracked GVPs, but it'd be nice to have the option. each of those servers a purpose"
- **Rejected alternatives**:
  - *Two layers (DEC-1.1 only)*: Project + local. Rejected: no place for user-wide identity or system-wide defaults.
  - *Three layers*: Drop system layer. Rejected: "we have servers we use at work where it would be useful to have system enforced stuffs."
- **Implication**: DEC-1.1's description of the three-piece structure (`.gvp/library/`, `.gvp/config.yaml`, `.gvp.yaml`) is still accurate for the project-level view. The global and system layers are additional config sources discovered via CFG-1's walk-backwards + standard paths.

**DEC-8.10: `--strict` as both CLI flag and config value**

- **Timestamp**: 2026-03-20 ~3:10 PM EST
- **Status**: Decided
- **Source**: Audit finding 12 — `--strict` never formally decided as CLI flag
- **Decision**: Strict mode is available as both a CLI flag (`--strict`) and a config value (`strict: true`). CLI flag overrides config. Config allows permanent strictness per project/user/system. Strict mode promotes warning-severity diagnostics to errors (DEC-5.4), subject to suppression precedence (DEC-5.8: suppression wins over strict).
- **Rationale**: "yup, lean a. it's a common want. but it'd still also be nice to make it permanent through a config"
- **Rejected alternatives**:
  - *Config only, use `-c strict=true` for per-invocation*: Rejected: `--strict` is common enough to warrant a dedicated flag.
- **Implication**: The `--strict` flag is syntactic sugar for `-c strict=true`. CFG-2's merge strategy for `strict` ("OR — any source enabling strict wins") still applies across config layers.

**DEC-8.11: Auto-populated reserved fields omitted from editor templates**

- **Timestamp**: 2026-03-20 ~3:15 PM EST
- **Status**: Decided
- **Source**: Audit finding 7 — auto-populated reserved fields not enumerated
- **Decision**: Reserved fields (DEC-3.2) are classified as:
  - **Auto-populated (omitted from editor templates)**: `id` (generated by tool), `origin` (auto-generated provenance), `updated_by` (auto-generated on edit), `reviewed_by` (auto-generated on review)
  - **Defaulted (shown with default value)**: `status` (defaults to `"active"`)
  - **User-provided (shown with placeholders)**: `name`, `tags`, `maps_to`, `priority` (optional, commented out)

  Editor templates show user-provided and defaulted fields, plus dynamic `field_schemas` fields. Auto-populated fields are omitted entirely.
- **Rationale**: "yup, looks good to me! good balance of what is known / can be auto-generated vs not overstepping (e.g.: by auto-deciding a priority that might be wrong)"
- **Rejected alternatives**: None — the classification was uncontroversial.
- **Implication**: This classification is stable — adding a new reserved field requires deciding whether it's auto-populated, defaulted, or user-provided.

---

## Theme 9: Naming & Identity

### Context

Several naming inconsistencies and improvements identified.

### Discussion Items

| ID | Item | Source | Review Status |
|----|------|--------|---------------|
| 9.1 | `design_choice` → `decision` | v1-reqs: DOM-11 | DECIDED (DEC-9.1) |
| 9.2 | ID prefixes: single chars where unique, 2+ only where needed | missing-reqs: Data/coding principle prefix | DECIDED (DEC-9.2) |
| 9.3 | Resolve `C` vs `CP` inconsistency for coding_principle | missing-reqs: Data/coding principle prefix | DECIDED (DEC-9.3) |
| 9.4 | Bundled defaults.yaml packaged with the tool | missing-reqs: Package/package data | DECIDED (DEC-9.4) |

### Decisions

**DEC-9.1: Rename `design_choice` to `decision`**

- **Timestamp**: 2026-03-20 ~4:00 PM EST
- **Status**: Decided
- **Decision**: The built-in category `design_choice` is renamed to `decision`. `yaml_key` changes from `design_choices` to `decisions`. Category name changes from `design_choice` to `decision`. `id_prefix: D` is unchanged. The `rationale` primary field is unchanged.
- **Rationale**: Already documented in DOM-11: "'Design choice' is domain-specific to software/engineering; 'decision' is universally applicable — a small business choosing a vendor, a team choosing a process, an individual choosing a priority." Aligns with G6 (works anywhere) and R4 (core stays domain-agnostic).
- **Rejected alternatives**: None — this was pre-decided in DOM-11.
- **Implication**: All references to `design_choice`/`design_choices` in defaults, examples, and documentation need updating.

**DEC-9.2: All core categories use single-char ID prefixes**

- **Timestamp**: 2026-03-20 ~4:05 PM EST
- **Status**: Decided
- **Decision**: All core category ID prefixes are single characters. The constraint category's prefix changes from `CON` to `C`. This is possible because the `coding_principle` category (which previously used `C`) is removed from core defaults (DEC-9.3). The full core prefix set: G (goal), V (value), C (constraint), P (principle), R (rule), H (heuristic), D (decision), M (milestone). All unique, all single-char.
- **Rationale**: "our core elements should have no overlapping first chars. So it's fine and preferable to use single chars. Keep it simple and use 2+ chars only where required for uniqueness."
- **Rejected alternatives**:
  - *Keep `CON` for constraint, `CP` for coding_principle*: Fixes the inconsistency but keeps multi-char prefixes unnecessarily. Rejected: single chars are simpler and sufficient after removing domain-specific categories.
- **Implication**: User-defined categories may use multi-char prefixes where needed (e.g., `CP` for a user's `coding_principle` in an example library). Core defaults model the single-char ideal.

**DEC-9.3: Remove domain-specific categories from core defaults**

- **Timestamp**: 2026-03-20 ~4:10 PM EST
- **Status**: Decided
- **Decision**: `coding_principle` and `implementation_rule` are removed from the core `defaults.yaml`. They are domain-specific categories that violate R4 (core stays domain-agnostic). In v1, these concepts are expressed as standard core categories with appropriate tags and scoping:
  - A "coding principle" is a `principle` with a `coding` tag, in a coding-scoped document
  - An "implementation rule" is a `rule` in an implementation-scoped document

  The software-project example library retains these as illustrations of how to organize domain-specific elements using tags and scoping rather than custom categories.

  The eight core categories in v1 defaults are: goal, value, constraint, principle, rule, heuristic, decision, milestone.
- **Rationale**: "coding principle is also not to be a core item. it will be a principle with a tag for coding. same for implementation rule: it's not a core element, it's a rule that is segregated into a separate document, given a tag, whatever..." On retaining examples: "that is simply how **i** like to conceptualize and split this up. and i will retain an example that splits it up this way because i think it *is* a useful way to split it up... but i do not want to codify my personal approach into the core"
- **Rejected alternatives**:
  - *Keep domain-specific categories in defaults*: Retain `coding_principle` and `implementation_rule` as built-ins. Rejected: violates R4 and H1 (domain-specific elements belong in examples, not core).
- **Implication**: The software-project example should be updated to show how to define custom categories (or use tagged/scoped core categories) for domain-specific needs. This serves as documentation of the pattern.

**DEC-9.4: Defaults bundled as YAML, loaded through the same pipeline as user files**

- **Timestamp**: 2026-03-20 ~4:15 PM EST
- **Status**: Decided
- **Decision**: The built-in category definitions (`defaults.yaml`) are shipped as a YAML file bundled with the npm package. They are loaded through the exact same YAML → Zod validation pipeline as user-defined library files. No separate loading path for defaults.
- **Rationale**: "i was originally thinking of going with YAML, that way we ensure the default elements are treated identically to any user-defined elements AND that user-defined elements are handled appropriately (if we can ensure that loading built-in yaml definitions works, user definitions in yamls should work, too)" — dogfooding: if defaults load correctly, the full pipeline is validated on every invocation.
- **Rejected alternatives**:
  - *TypeScript constants*: Define defaults as typed TS objects in code. Rejected: doesn't exercise the YAML loading path — bugs in YAML parsing could hide until a user hits them. Different code paths for defaults vs user files is the kind of divergence that causes subtle bugs.
- **Implication**: The defaults YAML file serves triple duty: (1) category definitions, (2) integration test of the loading pipeline, (3) documentation of "how to define categories" for users who want to inspect the format. The npm package must include `.yaml` files in its published artifacts.

**DEC-9.5: `next_id()` algorithm — prefix + max numeric suffix + 1**

- **Timestamp**: 2026-03-20 ~4:30 PM EST
- **Status**: Decided
- **Source**: Missing-requirements audit — `next_id()` algorithm not captured
- **Decision**: New element IDs are auto-assigned as `{id_prefix}{max_num + 1}` where `max_num` is the highest numeric suffix among existing IDs in the same category in the same document. The prefix comes from the category definition (DEC-9.2). IDs are scoped per-document per-category — the same prefix can have different sequences in different documents. IDs are never reused (R1) — deprecated/rejected elements retain their IDs and their numbers are consumed.
- **Rationale**: Consistent with v0 behavior and R1 (IDs are never reused). Simple, predictable, sequential.
- **Rejected alternatives**: None — this is the established pattern from v0.
- **Implication**: The `gvp add` command uses this algorithm. If an element is deleted outside of GVP (violating R2), the tool does not reclaim its ID — it skips over gaps. Example: if G1 and G3 exist but G2 was improperly deleted, the next goal is G4, not G2.

**DEC-9.6: `considered` field defined on `decision` category only in core defaults**

- **Timestamp**: 2026-03-20 ~4:35 PM EST
- **Status**: Decided
- **Source**: Audit finding 9 — which core categories get `considered` in field_schemas
- **Decision**: In the core `defaults.yaml`, only the `decision` category defines `considered` in its `field_schemas` (using the `dict` type with `model` values per DEC-3.12). Other categories do not include `considered` in their default schemas. Users can add `considered` to any category via user-defined `field_schemas` if they want to track alternatives for principles, heuristics, etc.
- **Rationale**: "yeah, just a. any element could feasibly have a 'considered' to discuss alternative values considered, alternative heuristics, etc... and maybe that'd be useful? but for now i just see the most value coming from decision considerations (which inform heuristics and their underlying GVPs)"
- **Rejected alternatives**:
  - *Decision + heuristic*: Both involve evaluating alternatives. Rejected: heuristics describe how to decide, not what was considered. `considered` is specifically about evaluated alternatives.
  - *All non-root categories*: Universal alternatives tracking. Rejected: overkill — most elements don't benefit from formal alternatives tracking.
- **Implication**: The `_all` block in defaults does NOT include `considered`. It remains category-specific. Users who want `considered` on other categories define it in their library's category overrides.

**DEC-9.7: Examples show both tag-based and custom-category patterns**

- **Timestamp**: 2026-03-20 ~4:40 PM EST
- **Status**: Decided
- **Source**: Audit finding 6 — how domain-specific categories appear in examples
- **Decision**: The example libraries demonstrate both patterns for domain-specific element organization:
  1. **Tag-based (software-project example)**: Uses core categories with tags and document scoping. "Coding principles" are `principle` elements with a `coding` tag. "Implementation rules" are `rule` elements in implementation-scoped documents. This is the user's preferred approach.
  2. **Custom categories (separate example)**: Defines custom categories in `meta.definitions.categories` to demonstrate the feature. Shows how to create domain-specific categories with their own `yaml_key`, `id_prefix`, `field_schemas`, and `mapping_rules`.
- **Rationale**: "for my part, i'm going to be lazy lol and just use tagging instead of a new category... but i do want multiple examples, and i'd definitely love to have one that showcases defining separate categories"
- **Rejected alternatives**: None — both patterns are valid and worth demonstrating.
- **Implication**: The software-project example should be updated during implementation to remove `coding_principle` and `implementation_rule` category definitions and replace them with tagged core categories. A separate example (new or existing) should demonstrate custom category definitions.

---

## Theme 10: Refs, Git Integration, & Embedding System

### Context

Elements in a GVP library often relate to external resources — code files, documents, policies, contracts. The TAStest integration requirements (TAS-1 through TAS-10) originally framed this as `code_refs` on design choices. Through discussion, this was generalized to a domain-agnostic `refs` field on all elements, with git-aware staleness detection, format-specific identifier parsing, and an embedding-powered similarity system for surfacing unmapped relationships and potential conflicts.

### Discussion Items

| ID | Item | Source | Review Status |
|----|------|--------|---------------|
| 10.1 | Domain-agnostic `refs` field on all elements | TAS-1 generalized | DECIDED (DEC-10.1) |
| 10.2 | Git-aware staleness for refs | TAS-2 generalized | DECIDED (DEC-10.2) |
| 10.3 | RefParser extensible parsing system | TAS-2, TAS-5 | DECIDED (DEC-10.3) |
| 10.4 | Identifier existence validation | TAS-5, TAS-6 | DECIDED (DEC-10.4) |
| 10.5 | Scoped validation for refs | TAS-2 | DECIDED (DEC-10.5) |
| 10.6 | Query and inspect by refs | TAS-3 | DECIDED (DEC-10.6) |
| 10.7 | Inspect by ref shortcut with trace | TAS-8 | DECIDED (DEC-10.7) |
| 10.8 | Embedding system architecture | TAS-10, conflict detection | DECIDED (DEC-10.8) |
| 10.9 | Embedding-powered features | TAS-10, conflict detection | DECIDED (DEC-10.9) |

### Decisions

**DEC-10.1: Domain-agnostic `refs` field on all elements via `_all`**

- **Timestamp**: 2026-03-20 ~5:00 PM EST
- **Status**: Decided
- **Decision**: All elements support an optional `refs` field, defined in the `_all` block of core defaults. Each ref entry has three fields:
  - `file` (string, required) — path to the referenced resource, relative to project root
  - `identifier` (string, required) — a stable identifier within that file (class name, function name, markdown heading, section number, YAML key — whatever is stable in that format)
  - `role` (enum, required) — how the resource relates to the element: `defines`, `implements`, `uses`, `extends`

  Example:
  ```yaml
  refs:
    - file: src/core/TestDevice.ts
      identifier: TestDevice
      role: defines
    - file: docs/policies/security-policy.md
      identifier: "Data Retention"
      role: implements
  ```
- **Rationale**: Originally `code_refs` on decisions only (TAS-1). Generalized: "what if we just added a `refs` on decisions? that feels pretty agnostic, and most decisions would probably have documents tracking them or implementing them?" On making it available to all elements: "any GVP element could have supplementary documents/files." On the `identifier` field: "symbol could become `identifier` so that it also maps to markdown or similar (e.g.: a parser could use `identifier` to map to headers)"
- **Rejected alternatives**:
  - *`code_refs` on `decision` only*: Software-specific, violates R4. Rejected: "can we take the tastest requirement and make it domain agnostic?"
  - *`refs` on `decision` only*: Decisions are the primary use case. Rejected: "any GVP element could have supplementary documents/files."
  - *`refs` in core defaults but not `_all`*: Only specific categories get refs. Rejected: universally useful, optional anyway.
- **Implication**: The `_all` block in defaults.yaml adds `refs: { type: list, required: false, items: { type: model, fields: { file: { type: string, required: true }, identifier: { type: string, required: true }, role: { type: string, required: true } } } }`. The `role` enum validation is handled by the schema system.

**DEC-10.2: Git-aware staleness detection for refs — automatic in git repos**

- **Timestamp**: 2026-03-20 ~5:05 PM EST
- **Status**: Decided
- **Decision**: When a project is a git repo, GVP automatically checks refs for staleness during the `semantic` validation pass. Two levels of staleness:
  1. **File-level** (universal, any file type): Compare `git log -1 --format=%aI -- <file>` against the element's latest review timestamp. If the file was modified after the last review, flag as stale.
  2. **Identifier-level** (format-specific): Use a RefParser (DEC-10.3) to extract the identifier's content block at the last-reviewed commit and at the current state. If the content changed, flag as stale. If the identifier is missing, flag separately (DEC-10.4).

  If the project is not a git repo, ref staleness checks are silently skipped — only normal GVP staleness (DEC-4.7) applies.
- **Rationale**: "i'd actually love if it were repo-aware. if it's a git repo, then automatically compare refs. if not a repo, just do the normal non-repo thing."
- **Rejected alternatives**:
  - *Opt-in via config*: `git_staleness: true` to enable. Rejected: minimal friction means it just works.
  - *Separate command flag*: `gvp validate --check-refs`. Rejected: same reason.
- **Implication**: The staleness engine needs read access to git history (`git log`, `git show`). The checks are read-only and fast. File-level checks work for any file type. Identifier-level checks require a registered RefParser for the file's extension.

**DEC-10.3: RefParser — extensible, extension-based identifier parsing**

- **Timestamp**: 2026-03-20 ~5:10 PM EST
- **Status**: Decided
- **Decision**: Format-specific identifier parsing is handled by `RefParser` classes, following the same abstract base class pattern as Exporters (DEC-7.8). Each parser declares which file extensions it handles and implements an `extractBlock(content: string, identifier: string): string | null` method that returns the content block for a given identifier (e.g., the full function body, the markdown section under a heading).

  Built-in parsers for v1:
  - **Markdown** (`.md`): identifier = heading text (any level)
  - **TypeScript/JavaScript** (`.ts`, `.tsx`, `.js`, `.jsx`): identifier = class/function/method name
  - **YAML** (`.yaml`, `.yml`): identifier = key path

  Extension dispatch: file extension → registered parser. Unknown extensions → file-level staleness only, no identifier parsing. No error, graceful degradation.

  The staleness engine uses RefParser by fetching file content at two git states and comparing `extractBlock()` output:
  ```
  oldBlock = parser.extractBlock(contentAtLastReview, identifier)
  newBlock = parser.extractBlock(contentAtCurrentState, identifier)
  ```
  The parser doesn't know about git — it just parses content strings. The staleness engine handles git plumbing.
- **Rationale**: "i would definitely make this extensible so that we can add support for other languages like python, golang, etc... with ease in the future." On extension-based dispatch: "sane defaults for identifiers based on... extension" — simple, fast, covers 99% of cases.
- **Rejected alternatives**:
  - *Mimetype detection from content*: Read file contents to determine parser type. Rejected: overkill when extension already tells you.
- **Implication**: Adding support for a new language is one file, one class — same pattern as exporters. Future parsers: Python (`.py`), Go (`.go`), Rust (`.rs`), etc.

**DEC-10.4: Identifier existence validation — warning, always on**

- **Timestamp**: 2026-03-20 ~5:15 PM EST
- **Status**: Decided
- **Decision**: During the `semantic` validation pass, if a RefParser is available for a ref's file extension, GVP checks whether the identifier still exists in the current file content. Missing identifiers produce a warning-severity Diagnostic (not an error). This check runs automatically during `gvp validate` and `gvp inspect --refs` — no flag needed.

  Diagnostic codes distinguish between:
  - File no longer exists on disk
  - File exists but identifier is missing (renamed/deleted)
  - File changed since last review (staleness)
  - Identifier content changed since last review (identifier-level staleness)
- **Rationale**: "agreed on A, maximum flexibility." On when it runs: "i think for this, i'd aim for 1 and 2 [validate and inspect]. default to always on in a repo."
- **Rejected alternatives**:
  - *Error severity*: Missing identifiers block validation. Rejected: identifiers go stale during refactoring — warnings are the right default.
  - *Opt-in flag*: `gvp validate --check-refs`. Rejected: zero-friction means always on.
- **Implication**: Strict mode (DEC-5.4, DEC-8.10) can promote these warnings to errors for projects that want hard enforcement.

**DEC-10.5: Scoped validation for refs — staged, working, commit range**

- **Timestamp**: 2026-03-20 ~5:20 PM EST
- **Status**: Decided
- **Decision**: `gvp validate` supports scoped ref checking to focus on changes relevant to the current work:
  - `--scope staged` — only check refs for files in the git index (staged for commit)
  - `--scope working` — only check refs for unstaged working tree changes
  - `--scope <commit>..<commit>` — only check refs for files changed in a commit range (PR review use case)

  The scoped check:
  1. Gets the list of changed files from git
  2. Finds all elements whose `refs` reference those files
  3. Runs identifier existence and staleness checks on those refs
  4. Walks the `maps_to` graph (DEC-6.1) to surface upstream elements that might be affected (blast radius analysis)

  Without `--scope`, `gvp validate` checks all refs (full check).
- **Rationale**: "i'd love an option that does minimize the search by focusing only on select changes, e.g.: those in the current index staged for commit and any refs they might correspond to (and corresponding changes through a DAG)"
- **Rejected alternatives**: None — the scoped check is complementary to the full check.
- **Implication**: The `--scope` flag is specific to ref-related validation. Other validation passes (schema, structural, traceability) always run fully regardless of scope. This flag enables efficient pre-commit hooks and PR review workflows.

**DEC-10.6: Query and inspect by refs**

- **Timestamp**: 2026-03-20 ~5:25 PM EST
- **Status**: Decided
- **Decision**: Two complementary ref lookup mechanisms:
  - **`gvp query --refs-file <path>` and `--refs-identifier <name>`** — Search across the catalog for elements whose `refs` reference a given file or identifier. Returns matching elements. Supports `--format json` via the exporter layer.
  - **`gvp inspect <element> --refs`** — Show a single element's refs with live status (OK, missing file, missing identifier, stale).

  Query searches across elements by ref (find all decisions referencing `Foo.ts`). Inspect shows a single element's refs with current status.
- **Rationale**: "yup, both :)" — complementary use cases.
- **Rejected alternatives**: None — both are useful and independent.
- **Implication**: `gvp query` gains ref-filtering flags. `gvp inspect` gains `--refs` view. Both use the exporter layer for `--format` output.

**DEC-10.7: Inspect by ref shortcut with trace**

- **Timestamp**: 2026-03-20 ~5:30 PM EST
- **Status**: Decided
- **Decision**: `gvp inspect --ref <file>::<identifier> --trace` is a convenience shortcut that:
  1. Finds all elements whose `refs` reference the given file+identifier (query by ref)
  2. For each matching element, shows its trace graph (ancestors via `maps_to`)

  This answers "why does this thing exist?" in one command — from a file/identifier to the goals and values that justify it.
- **Rationale**: "yeah, i do like the `--ref` convenience shortcut" — the "why does this code exist?" question is a killer use case worth a one-command path.
- **Rejected alternatives**:
  - *Manual composition*: `gvp query --refs-file Foo.ts --format json | gvp inspect --trace --stdin`. Rejected: too much friction for a ubiquitous use case.
- **Implication**: The `--ref` flag on `gvp inspect` takes a `file::identifier` argument. If the identifier is omitted (`--ref file`), it matches all refs to that file.

**DEC-10.8: Embedding system — core interface + built-in plugin**

- **Timestamp**: 2026-03-20 ~5:35 PM EST
- **Status**: Decided
- **Decision**: GVP has an embedding system with two layers:
  1. **Core interface**: An abstract `EmbeddingProvider` class (same pattern as `Exporter` and `RefParser`). Defines: `embed(text: string): number[]` and `similarity(a: number[], b: number[]): number`. The core interface is part of GVP's main package.
  2. **Built-in plugin**: A default embedding provider shipped as an optional npm dependency. Uses a local embedding model by default (runs locally, no API key, works offline). Configurable to use an API-based provider (OpenAI, Anthropic) for better quality embeddings.

  Embeddings are cached in `.gvp/embeddings.db` (or similar), rebuilt when element content changes. The cache is gitignored.
- **Rationale**: "that makes sense to me :) let's go with B but still go ahead and build the plugin and interface as part of v1" — embedding is useful enough for a first-class interface, but the backend should be pluggable. "local model by default (zero friction, works offline), API as an upgrade path."
- **Rejected alternatives**:
  - *Core feature (non-pluggable)*: Embedding baked into GVP core. Rejected: DEC-7.4 principle — optional deps require opt-in.
  - *AI agent only*: GVP provides JSON output, let external AI agents handle similarity. Rejected: "i was actually wanting to add some assistance built-in."
- **Implication**: The embedding provider is an optional dependency like the DOT exporter. Missing dependency → embedding features gracefully degrade (not available, clear message). The `EmbeddingProvider` interface is a flex point for future LLM-powered analysis (DEC-10.9).

**DEC-10.9: Embedding-powered features — similarity-based for v1, LLM path for future**

- **Timestamp**: 2026-03-20 ~5:40 PM EST
- **Status**: Decided
- **Decision**: v1 embedding features (all require the optional embedding plugin):
  1. **Import refs suggestion** (`gvp import-refs --suggest`): Embed code symbols and GVP elements, find nearest neighbors, suggest ref mappings interactively. Human confirms each.
  2. **Unmapped relationship detection**: Flag pairs of elements that are semantically similar but not connected via `maps_to`. "D7 is related to V3 but doesn't map to it — is that intentional?"
  3. **Conflict detection**: Flag pairs of elements with high semantic similarity that might contradict each other. v1 uses similarity-only (let the human judge). Future upgrade path to LLM-powered analysis for higher accuracy.
  4. **PR review suggestions**: For scoped validation (`--scope staged`), embed the changed code and surface semantically related decisions. "This PR touches code related to decisions D4, D7 — have they been reviewed?"

  All features are advisory — they surface information for human review, never auto-modify the catalog.
- **Rationale**: "i'd also have it review decisions to find matching (unmapped) GVPs OR potentially conflicting... if possible? that's the big one." On conflict detection approach: "yeah, let's go with A [similarity-only] but make it easy to update later, and we'll probably ultimately need some LLM integration"
- **Rejected alternatives**:
  - *LLM-powered conflict detection in v1*: Send element pairs to an LLM for contradiction analysis. Rejected: deferred — similarity flagging is useful on its own. "make it easy to update later."
  - *No conflict detection*: Just import-refs and relationship detection. Rejected: conflict detection is "the big one."
- **Implication**: The `EmbeddingProvider` interface is designed to be extended with an `AnalysisProvider` (or similar) for LLM-powered features in the future. The similarity-based approach is a stepping stone, not the end state.

**DEC-10.10: Per-category `refs` override — optional by default, overridable to required**

- **Timestamp**: 2026-03-20 ~6:00 PM EST
- **Status**: Decided
- **Source**: Audit finding 1 — can a category override `refs` from `_all` to make it required?
- **Decision**: Per DEC-2.8 (explicit per-category wins over `_all`), a category can override `refs` to make it required. For example, a `decision` category could define `refs: { type: list, required: true }` in its `field_schemas` to enforce that all decisions must have refs. The core defaults ship `refs` as optional via `_all`; projects tighten per-category as needed.
- **Rationale**: "yes, any optional thing can be overridden to be required" — consistent with the general `_all` / per-category override model.
- **Implication**: This is just the existing DEC-2.8 mechanism applied to `refs`. No new behavior needed.

**DEC-10.11: Add `enum` as a field_schemas type constraint**

- **Timestamp**: 2026-03-20 ~6:05 PM EST
- **Status**: Decided
- **Source**: Audit finding 6 — `role` enum constraint not explicit in schema
- **Decision**: The `field_schemas` type system gains an `enum` constraint. Fields can declare `type: enum, values: ["defines", "implements", "uses", "extends"]`. Zod validates the value against the allowed list (`z.enum([...])`). This is generic — usable for any constrained string field (role, status, priority labels, etc.), not just `refs.role`.
- **Rationale**: "yeah, i dig that :) let's add enums as a type" — natural extension, useful beyond just refs, Zod supports it natively.
- **Rejected alternatives**:
  - *Validate enum in a validation pass*: Schema says `type: string`, validation pass checks allowed values. Rejected: validation should happen at the schema level where possible.
- **Implication**: The v1 type map is now: `string`, `number`, `boolean`, `list`, `dict`, `model`, `datetime`, `enum`. DEC-3.4's type map should be updated. The `refs` field definition in `_all` uses `role: { type: enum, values: ["defines", "implements", "uses", "extends"], required: true }`.

**DEC-10.12: `--scope` walks all transitive ancestors**

- **Timestamp**: 2026-03-20 ~6:10 PM EST
- **Status**: Decided
- **Source**: Audit finding 8 — graph walking distance for scoped validation
- **Decision**: When `--scope` finds elements with refs to changed files, it walks the full `maps_to` graph transitively — all ancestors, not just direct parents. The entire connected upstream chain is surfaced.
- **Rationale**: "A, the whole point is review as you said :p walk the whole thing, even if it means walking the whole project and whole library"
- **Rejected alternatives**:
  - *Direct parents only*: One level up. Rejected: misses broader impacts. "the whole point is review."
- **Implication**: For large projects, this could surface many elements. The output should clearly indicate why each element was surfaced (which ref triggered it, how far up the chain).

**DEC-10.13: Ref changes create provenance entries**

- **Timestamp**: 2026-03-20 ~6:15 PM EST
- **Status**: Decided
- **Source**: Audit finding 12 — ref edits and provenance
- **Decision**: Adding, removing, or modifying a `refs` entry is treated as a meaningful change to the element. It creates an `updated_by` provenance entry (DEC-4.7) with rationale. The `--skip-review` flag (DEC-4.6) is available for trivial ref updates.
- **Rationale**: "A" — refs are part of the element's traceability story. Adding a ref changes how a decision connects to the codebase. Worth tracking.
- **Rejected alternatives**:
  - *No provenance for ref changes*: Refs are metadata/bookkeeping. Rejected: refs are part of the traceability chain.
- **Implication**: `gvp edit` tracks ref changes the same as any other field change. The `updated_by` entry's `rationale` should indicate what ref changed.

**DEC-10.14: `role` enum is extensible via schema overrides**

- **Timestamp**: 2026-03-20 ~6:20 PM EST
- **Status**: Decided
- **Source**: Audit finding 14 — role enum extensibility
- **Decision**: The default `role` enum is `["defines", "implements", "uses", "extends"]`. Users can extend it by overriding the `refs` field schema in their library's category definitions. For example, a category could define `role: { type: enum, values: ["defines", "implements", "uses", "extends", "documents", "supersedes", "validates"] }` to add custom roles.
- **Rationale**: "yeah, we can make it extensible :)" — aligns with V8 (configurability) and the general pattern of extensible defaults.
- **Rejected alternatives**:
  - *Fixed set*: Only four core roles. Rejected: limits expressiveness for domain-specific ref semantics.
- **Implication**: Per DEC-2.8, per-category `field_schemas` override `_all`. A category's `refs` schema can expand the role enum. The default four roles cover most use cases.

**DEC-10.15: Binary file refs are valid — file-level staleness only**

- **Timestamp**: 2026-03-20 ~6:25 PM EST
- **Status**: Decided
- **Source**: Audit finding 15 — binary file ref handling
- **Decision**: Refs pointing to binary files (images, PDFs, etc.) are valid. No RefParser exists for binary formats, so only file-level git staleness applies ("this file changed since your last review"). The `identifier` field on binary refs serves as a human-readable label (e.g., `"main architecture diagram"`) rather than a parseable reference. No validation diagnostic for "unknown file extension."
- **Rationale**: "yup, A" — a decision referencing a diagram or PDF is legitimate. File-level staleness is still useful.
- **Rejected alternatives**:
  - *Invalid — refs must point to parseable files*: Error if no RefParser exists. Rejected: legitimate use case for diagrams, contracts, policies.
- **Implication**: Graceful degradation is the pattern: full parsing where possible (known extensions), file-level-only where not (unknown/binary extensions), never an error for the file type itself.

**DEC-10.16: Embedding analysis is a separate command, not a validation pass**

- **Timestamp**: 2026-03-20 ~6:30 PM EST
- **Status**: Decided
- **Source**: Audit finding 17 — embedding analysis validation integration
- **Decision**: Embedding-powered features (unmapped relationship detection, conflict flagging, PR review suggestions) are accessed via a separate command (`gvp analyze` or similar), not as part of `gvp validate`. Validation is deterministic — it answers "is this correct?" Embedding analysis is advisory/probabilistic — it answers "have you considered this?" Mixing them would muddy what "validation passed" means.
- **Rationale**: "yeah, i think A makes sense" — clean conceptual boundary between deterministic validation and advisory analysis.
- **Rejected alternatives**:
  - *Optional validation pass*: A 6th pass that runs if the plugin is installed. Rejected: muddies the meaning of "validation passed."
  - *Flag on validate*: `gvp validate --analyze`. Rejected: same problem — validation output mixes deterministic and probabilistic findings.
- **Implication**: `gvp analyze` is a new top-level command. It requires the embedding plugin (DEC-10.8). Without the plugin, the command errors with an install message. The `import-refs --suggest` feature also lives under the `analyze` umbrella or as its own command.

---

## Cross-Cutting Decisions

*(For decisions that span multiple themes)*

| ID | Decision | Rationale | Themes |
|----|----------|-----------|--------|
| X.1 | NO backwards compatibility. Ever. | Single user, scrappy alpha. Solid design > migration paths. | All |

---

## Appendix: Review Status Tracker

Tracks review status of items from `v1-missing-requirements-approved.md`:

| Source Section | Item | Theme | Review Status |
|----------------|------|-------|---------------|
| CLI | `--config /dev/null` | 8.1 | DECIDED (DEC-8.1) |
| CLI | `--verbose` | 8.2 | DECIDED (DEC-8.2) |
| CLI | `--approve` hidden flag | 4.5 | DECIDED (DEC-4.5) |
| Validation | Warning suppression by code prefix | 5.4 | DECIDED (DEC-5.4, DEC-5.11) |
| Validation | `considered` nested validation | 5.6 | DECIDED (DEC-5.6) |
| Validation | W005 conditional on inherits | 5.5 | DECIDED (DEC-5.5) |
| Loader | Path-based inheritance resolution | 1.1-1.6 | DECIDED (DEC-1.0 through DEC-1.11) |
| Loader | Date type fields | 3.4 | DECIDED (DEC-3.4) |
| Loader | Defaults merging (no override) | 2.2 | DECIDED (DEC-2.5) |
| Loader | BASE_ELEMENT_ATTRS reserved fields | 3.2 | DECIDED (DEC-3.2) |
| Loader | Duplicate document name W002 | 1.7 | SUPERSEDED (DEC-1.1a, DEC-1.1b) |
| Command | Trace truncation at 120 chars | 8.3 | DECIDED (DEC-8.3) |
| Command | `trace --maps-to` multi-tree output | 7.2 | DECIDED (DEC-7.2 — now `gvp inspect --trace`) |
| Command | `next_id()` algorithm | 9.5 | DECIDED (DEC-9.5) |
| Command | Editor fallback cascade | 8.6 | DECIDED (DEC-8.6) |
| Command | Editor template format | 8.4 | DECIDED (DEC-8.4) |
| Command | Editor strips `#` comments | 8.5 | DECIDED (DEC-8.5) |
| Command | `reviewed_by` defaults to identity | 4.3 | DECIDED (DEC-4.3) |
| Command | `reviewed_by` uses timezone | 4.4 | DECIDED (DEC-4.4) |
| Exporter | Markdown considered name transform | 7.3 | DECIDED (DEC-7.3 — dynamic per schema) |
| Exporter | CSV column order | 7.3 | DECIDED (DEC-7.3 — dynamic columns) |
| Exporter | DOT node ID escaping | 7.5 | DEFERRED (implementation detail — WASM graphviz may handle) |
| Exporter | DOT tier-based rank=same | 7.6 | DECIDED (DEC-7.6) |
| Exporter | PNG requires `dot` in $PATH | 7.5 | DECIDED (DEC-7.5 — WASM, no system dep) |
| Schema | `_all` merge timing | 2.7-2.8 | DECIDED (DEC-2.7, DEC-2.8) |
| Schema | Pydantic create_model() codegen | 3.1 | DECIDED (DEC-3.1 — Zod) |
| Schema | BaseElement extra="allow" | 3.7 | DECIDED (DEC-3.7) |
| Schema | Element __str__/__repr__/__hash__/__eq__ | 6.2-6.4 | DECIDED (DEC-6.2, DEC-6.3, DEC-6.4) |
| Schema | Non-root requires mapping_rules | 3.5 | DECIDED (DEC-3.5) |
| Schema | Post-merge uniqueness validation | 3.6 | DECIDED (DEC-3.6) |
| Model | Inheritance cycle detection | 5.3 | DECIDED (DEC-5.3) |
| Model | ancestors() returns graph | 6.1 | DECIDED (DEC-6.1, DEC-6.5) |
| Model | descendants() returns graph | 6.1 | DECIDED (DEC-6.1, DEC-6.5) |
| Config | Library dir implicit inclusion | 1.4 | DECIDED (DEC-1.1, DEC-1.2) |
| Config | Walk-backwards + config layers | 8.1, 8.9 | DECIDED (DEC-8.1, DEC-8.9) |
| Config | config_overrides in library meta | 2.4 | DECIDED (DEC-2.4, DEC-2.11, DEC-2.13) |
| Package | defaults.yaml bundling | 9.4 | DECIDED (DEC-9.4) |
| Package | Optional dependencies | 7.4 | DECIDED (DEC-7.4) |
| Test | User-defined validation rules | 5.2 | DECIDED (DEC-5.2) |
| Philosophy | Framework serves alignment | 8.7 | DECIDED (DEC-8.7 — captured in GVP library P6+P8) |
| Data | Coding principle prefix C vs CP | 9.2-9.3 | DECIDED (DEC-9.2, DEC-9.3 — removed from core) |
