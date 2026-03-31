---
title: GVP v1 Requirements
description: Comprehensive requirements for the GVP TypeScript rewrite, compiled from the v0 codebase, TAStest integration needs, and planning discussions.
status: draft
---

# GVP v1 Requirements

> **Editing policy**: Do not remove or edit original requirement text. To record changes, append update notes below the original text referencing the relevant decision (e.g., "**Update (DEC-2.1):** ..."). This preserves the original requirements as stated and tracks how decisions refined them.

## Context

GVP v0 is a Python CLI tool (~2500 LOC) in scrappy alpha. This document captures all requirements for a v1 rewrite in TypeScript, informed by:

- The working v0 codebase and its capabilities
- The TAStest documentation system requirements (`2026-02-25-gvp-requirements-for-doc-system.md`)
- Planning discussions and MEMORY.md future tasks
- Architectural issues identified in v0 that v1 should resolve

## Architectural Requirements

### ARCH-1: MVC Architecture

The system must be structured as model/controller/view layers so that the core domain logic is consumable by any interface: importable TypeScript library, CLI, and eventual TUI/GUI.

- **Model**: Catalog, Document, Element, schema/category registry, config
- **Controller**: Operations (validate, query, trace, add, edit, review, render)
- **View**: CLI output formatting, JSON serialization, future TUI/GUI

### ARCH-2: npm Distribution

The tool must be installable via `npm install gvp` (or similar package name) and immediately available as both a CLI (`npx gvp`) and an importable library (`import { loadCatalog } from 'gvp'`).

### ARCH-3: Python Portability

The TypeScript code should be written such that it can be ported to Python by AI with minimal architectural rework. This means: clear module boundaries, no framework-heavy dependencies, data structures that map naturally between languages (Zod schemas <-> Pydantic models).

### ARCH-4: Strict Typing Throughout

All domain objects must be strongly typed. No `any` types in the core model/controller layers. User-defined schemas validated at runtime with full type inference.

### ARCH-5: Catalog Preserves Per-Library Definition Context

**Added by DEC-2.12.** The resolved Catalog is not a flat merged view — it preserves definition context at each library level in the inheritance chain. When a descendant library overrides a tag or category definition, ancestor elements retain their association with the ancestor's version of that definition. All intermediate definitions are preserved and queryable. This enables: displaying elements in context of their originating library, auditing how definitions evolve across the chain, and ensuring that overriding a definition doesn't retroactively change the meaning of ancestor elements.

---

## Domain Model Requirements

### DOM-1: YAML Source of Truth

GVP libraries are collections of YAML files. Each file is a Document containing a `meta` block and element lists organized by category.

### DOM-2: Document Model

Each Document has:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `meta.name` | string | yes | Unique document name |
| `meta.scope` | string | no | Scope label (personal, team, project, implementation, etc.) |
| `meta.inherits` | string or string[] | no | Parent document(s) forming a DAG |
| `meta.id_prefix` | string | no | Prefix prepended to element IDs |
| `meta.defaults` | object | no | Default field values applied to all elements in this document |
| `meta.definitions.tags` | object | no | Tag definitions (see DOM-7 updates: flat map, no domain/concern split) |
| `meta.definitions.categories` | object | no | User-defined or overridden category definitions |

**Update (DEC-2.5):** `meta.defaults` applies only to elements within the document that defines them. Defaults do not cascade through inheritance.

**Update (DEC-2.4, DEC-2.11, DEC-2.13):** Documents may include `meta.config_overrides` — a map of `{ mode: "additive" | "replace", value: T }` entries for enforcing config settings with ancestor-wins priority.

### DOM-3: Element Model

All elements share base fields:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | yes | Unique within document (e.g., "G1", "P3") |
| `name` | string | yes | Human-readable title |
| `category` | string | yes (derived) | Which category this element belongs to |
| `status` | enum | no | "active" (default), "deprecated", "rejected" |
| `tags` | string[] | no | Tag names from defined tags |
| `maps_to` | string[] | no | Qualified IDs of elements this traces to |
| `priority` | number | no | Numeric priority |
| `origin` | provenance[] | no | Creation provenance |
| `updated_by` | provenance[] | no | Update history |
| `reviewed_by` | provenance[] | no | Review history |

Category-specific fields are defined by the category's `field_schemas`.

### DOM-4: Qualified IDs

All element references use `document_name:element_id` format. IDs are permanent — never reused, never renumbered.

### DOM-5: Schema-Driven Categories

Categories are defined in `defaults.yaml` (built-ins) and extensible via `meta.definitions.categories` in user documents. Each category definition includes:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `yaml_key` | string | yes | The YAML key for element lists (e.g., "goals", "decisions") |
| `id_prefix` | string | yes | Prefix for element IDs (e.g., "G", "D") |
| `primary_field` | string | no | The main content field name (default: "statement") |
| `display_label` | string | no | Human-readable label |
| `color` | string | no | Hex color for rendering |
| `is_root` | boolean | no | Whether this category is exempt from traceability rules |
| `mapping_rules` | string[][] | no | Traceability requirements (outer=OR, inner=AND) |
| `field_schemas` | object | no | Type-safe field definitions |
| `export_options` | object | no | Exporter-namespaced options (e.g., `{ dot: { tier: 1 } }`) |

The `_all` keyword applies field schemas to every category.

**Update (DEC-2.7):** `_all` is applied after full catalog merge — it applies to all categories in the final merged set, including categories defined by downstream documents. See DEC-2.7 in `docs/plans/2026-03-02-v1-design-decisions.md`.

**Update (DEC-2.8):** Explicit per-category `field_schemas` always win over `_all`-sourced fields for the same field name. See DEC-2.8.

**Update (DEC-2.2):** `field_schemas` cascade across library boundaries with deep merge, descendant wins on conflict.

**Update (DEC-7.6, DEC-7.9):** `tier` removed from category definition — moved to `export_options.dot.tier`. `render_options` renamed to `export_options` for consistency with DEC-7.1 exporter terminology.

### DOM-6: Built-in Categories

The following categories ship as defaults:

| Category | ID Prefix | Root? | Primary Field | Mapping Rules |
|----------|-----------|-------|---------------|---------------|
| goal | G | yes | statement | (none) |
| value | V | yes | statement | (none) |
| constraint | C | yes | impact | (none) |
| principle | P | no | statement | goal AND value |
| rule | R | no | statement | goal AND value |
| heuristic | H | no | statement | (goal AND value) OR principle OR rule |
| decision | D | no | rationale | goal AND value |
| milestone | M | no | description | goal AND value |

**Update (DEC-9.1, DEC-9.2, DEC-9.3):** `design_choice` renamed to `decision` (DOM-11). Constraint prefix changed from `CON` to `C`. `implementation_rule` and `coding_principle` removed from core defaults — they are domain-specific and expressed as tagged/scoped core categories in examples (see DEC-9.3, DEC-9.7). Core set reduced from 10 to 8 categories. Mapping rules for remaining 5 non-root categories unchanged from v0.

### DOM-7: Tags

Two-dimensional classification:
- **Domain tags**: what area (code, systems, ux, business, etc.)
- **Concern tags**: what quality (maintainability, reliability, usability, etc.)

Defined in `meta.definitions.tags.{domains|concerns}`. Accumulate across documents (first-wins).

**Update (DEC-2.1):** Accumulation priority changed from "first-wins" to descendant-wins by default (configurable via `priority.definitions`). See DEC-2.1 in `docs/plans/2026-03-02-v1-design-decisions.md`.

**Update (DEC-2.14):** The domain/concern tag delineation is dropped. Tags are generic flat labels — no enforced two-dimensional classification. The `meta.definitions.tags` structure is a flat map of tag names to definitions, not subdivided into `domains` and `concerns`. See DEC-2.14 in `docs/plans/2026-03-02-v1-design-decisions.md`.

### DOM-8: Inheritance

Documents form a DAG via `meta.inherits`:
- Multi-parent supported
- BFS resolution order
- Circular inheritance detected and rejected
- Elements can map to elements in ancestor documents

### DOM-9: Provenance Tracking

Three provenance fields track element lifecycle:
- `origin`: Who/when/how element was created
- `updated_by`: List of update records with date/rationale
- `reviewed_by`: List of review records with date/note

Each provenance entry is an object with at minimum a `date` field.

**Update (DEC-4.1–4.8):** Provenance entries now include `id` (auto-generated UUID), `date` (DEC-3.4 datetime with timezone), and `by` (structured identity: `{name, email}`). Update entries include required `rationale` and optional `skip_review` boolean. Review entries include required `updates_reviewed` (list of update UUIDs) and optional `note`. Origin entries have no rationale or review fields. Staleness = any non-skip-review update whose ID isn't in any review's `updates_reviewed`. User identity is personal config only — excluded from `config_overrides` (DEC-4.8).

### DOM-10: Considered Alternatives

Decisions (and potentially other categories) support a `considered` field: a dict where keys are alternative names and values are objects with at least a `rationale` field.

**Update (DEC-9.6):** In core defaults, only the `decision` category defines `considered` in its `field_schemas`. Users can add `considered` to any category via user-defined schemas.

### DOM-11: Rename "Design Choice" to "Decision"

The built-in category `design_choice` should be renamed to `decision` (yaml_key: `decisions`, id_prefix: `D`). "Design choice" is domain-specific to software/engineering; "decision" is universally applicable — a small business choosing a vendor, a team choosing a process, an individual choosing a priority. This aligns with G6 (works anywhere) and R4 (core stays domain-agnostic).

---

## Config Requirements

### CFG-1: Walk-Backwards Discovery

Config discovery walks backwards from CWD to filesystem root, looking for `.gvp/` directories and `.gvp.yaml` files. Then checks `~/.config/gvp/` and `/etc/gvp/`.

### CFG-2: Config Merging

| Field | Merge Strategy |
|-------|---------------|
| `libraries` | Concatenate (closer scope first) |
| `strict` | OR (any source enabling strict wins) |
| `suppress_warnings` | Union |
| `validation_rules` | Concatenate |

**Update (DEC-2.3, DEC-2.4, DEC-2.13, DEC-2.15, DEC-2.16):** The `libraries` config field is dropped in v1 — library loading is now implicit from document `meta.inherits` references (DEC-2.15, DEC-1.1). Config merging applies to remaining fields (`strict`, `suppress_warnings`, `validation_rules`). Library documents may additionally define `meta.config_overrides` which are processed AFTER config file merging and use ancestor-wins priority with explicit `{ mode, value }` per key (DEC-2.4, DEC-2.13). `config_overrides` supersedes CFG-2's merge strategies for the fields it covers. See `docs/plans/2026-03-02-v1-design-decisions.md`.

### CFG-3: CLI Override

CLI flags (`--config`, `--library`, `--strict`) take precedence over discovered config.

---

## Validation Requirements

### VAL-1: Structural Validation

- Broken references: `maps_to` targets that don't exist in the catalog
- Broken inheritance: `inherits` referencing non-existent documents
- Circular inheritance detection
- Undefined tags: tags used on elements but not defined in any document
- ID sequence gaps within a category within a document

### VAL-2: Traceability Validation

Non-root, non-deprecated elements must satisfy at least one group in their category's `mapping_rules` — directly or transitively through the `maps_to` graph.

### VAL-3: Schema Validation

Category-specific fields validated against `field_schemas`:
- Required fields present
- Types match (string, number, boolean, list, dict, nested model)
- No extra fields when schema is strict
- Nested model validation (e.g., `considered` entries must have `rationale`)

### VAL-4: Semantic Warnings

| Code | Description |
|------|-------------|
| W001 | Empty `maps_to` on non-root element |
| W002 | Duplicate document name |
| W003 | Library path does not exist |
| W004 | (reserved) |
| W005 | Self-document-only mapping |
| W006 | Staleness: ancestor `updated_by` newer than element's `reviewed_by` |
| W007 | Duplicate tag definition |
| W008 | Duplicate category definition |
| W009 | ID sequence gap |

**Update (DEC-2.6, DEC-2.10):** W007/W008 fire only for intra-library sibling conflicts (two documents in the same library, neither inherits from the other). Cross-library overlaps are resolved silently by DEC-2.1.

**Update (DEC-2.6, DEC-2.9):** New warning codes:

| Code | Description | Source |
|------|-------------|--------|
| W010 | Conflicting `config_overrides` within SCC (circular dependency) | DEC-2.9 |
| W011 | Parent-child definition override (tag or category) | DEC-2.6 |
| W012 | Descendant `config_overrides` entry overridden by ancestor | DEC-2.13 |

### VAL-5: Tiered Enforcement

- Errors block
- Warnings inform
- Strict mode promotes warnings to errors
- Individual warnings suppressible by code in config

### VAL-6: User-Defined Validation Rules

Config supports custom rules with match filters + require checks + severity level.

---

## Command Requirements

### CMD-1: validate

Load catalog, run all validation checks, report errors and warnings. Exit code reflects pass/fail. Success message explicitly notes structural-only checks and suggests `gvp render` for semantic review.

### CMD-2: query

Filter elements by tags, category, document, status, and other criteria. Output as table or JSON.

### CMD-3: trace

Given an element, walk the `maps_to` graph upward (ancestors) or downward (descendants). Output as tree or JSON. Cycle detection via "seen above" markers.

### CMD-4: add

Create a new element with auto-assigned next ID. Supports CLI flags, interactive prompts, and $EDITOR modes. Optional provenance tracking with `--skip-review` escape hatch (DEC-4.6: writes full provenance but marks entry as not requiring review).

### CMD-5: edit

Modify an existing element with inline field updates or $EDITOR. Tracks `updated_by` provenance. Supports `--skip-review` for trivial changes (DEC-4.6: writes full provenance but marks entry as not requiring review).

### CMD-6: review

Detect stale elements (ancestor `updated_by` newer than element's `reviewed_by`). Interactive review flow. Stamps `reviewed_by` after review.

### CMD-7: render

Render the catalog to one or more output formats. Supports `--output-dir` and `--to-stdout`.

---

## Renderer Requirements

### REN-1: Markdown

Per-document files with sections organized by category. Renders primary field, maps_to, tags, provenance, considered alternatives.

### REN-2: CSV

Flat export of all elements with columns for base and category-specific fields.

### REN-3: SQLite

Relational schema with tables for documents, elements, tags, mappings, and considered alternatives. Enables ad-hoc querying.

### REN-4: DOT/PNG (Graphviz)

Graph visualization with subgraphs per document, nodes colored by category, edges for `maps_to`, tier-based layout.

### REN-5: JSON

Machine-readable export of the full catalog or filtered results.

### REN-6: Schema-Driven Rendering

Renderers should use category definitions (primary_field, color, display_label, field_schemas) rather than hardcoding knowledge of specific fields. v0 hardcodes; v1 should not.

---

## TAStest Integration Requirements

*(From `2026-02-25-gvp-requirements-for-doc-system.md`)*

### TAS-1: Custom Schema for `code_refs` Field (Critical)

Define a custom schema on `decisions` that validates a `code_refs` field: a list of `{file: string, symbol: string, role: enum}` entries linking decisions to code locations. `role` enum: `defines`, `implements`, `uses`, `extends`. Field is optional on decisions (gradual adoption).

### TAS-2: Git-Aware Staleness Detection (Critical)

`gvp review` compares `reviewed_by` timestamps against `git log` for files referenced in `code_refs`. Supports scoping: `--since <ref>`, `--from <ref-a> --to <ref-b>`.

### TAS-3: Query by `code_refs` (Critical)

`gvp query --refs-file <path>` and `--refs-symbol <name>` to find decisions referencing a given file or symbol.

### TAS-4: Machine-Readable JSON Output (Critical)

`gvp query --format json` and `gvp review --format json` for programmatic consumption by doc generators, commit hooks, and AI agents.

### TAS-5: Symbol Existence Validation (Important)

`gvp validate --check-code-refs` resolves `code_refs` against the filesystem. Missing file = error, missing symbol = warning. Optional `=files` mode for file-only checks.

### TAS-6: Stale Refs Report (Important)

`gvp review --stale-refs` lists all `code_refs` where the referenced file or symbol no longer exists.

### TAS-7: Render with `code_refs` Context (Important)

Exporters include `code_refs` sections when rendering decisions — table of file/symbol/role.

### TAS-8: `gvp trace --code` (Nice-to-have)

Given a file::symbol, walk: symbol -> decision -> maps_to -> goals/values. "Why does this code exist?" in one command.

### TAS-9: Orphan Detection (Nice-to-have)

Warning when `code_refs` point to symbols with no `@system` tags in TSDoc. Accepts an external manifest file.

### TAS-10: Bulk `code_refs` Import (Nice-to-have)

`gvp import-refs --from manifest.json --strategy suggest` to bootstrap `code_refs` from an existing codebase with interactive approval.

---

## Future / Deferred Requirements

*(From MEMORY.md — not blocking v1, but should not be designed against)*

### FUT-1: Docs Templating System

Use template structures to generate docs so that SOT tables (like traceability rules) can be defined once and imported into multiple docs.

### FUT-2: Git-Based Cross-Repo Inheritance

Ability to keep personal GVPs in a personal repo and link them across projects.

### FUT-3: Domain-Specific Example Libraries

Cover a wide variety of domains with industry-specific terms and framings.

### FUT-4: Traceability Rule Revisit

Consider "goal OR value" instead of "goal AND value", with a semantic rule that value-only mapping is only permissible when not violating a goal.

---

## Non-Functional Requirements

### NFR-1: Editor/IDE Integration Path

YAML source files should be amenable to editor tooling (autocompletion, validation). Consider JSON Schema generation from category definitions for YAML LSP integration.

### NFR-2: Error Messages

All errors must include: file path, element ID (if applicable), human-readable description, and structured data for programmatic consumption.

### NFR-3: Performance

Catalog loading should be fast enough for pre-commit hooks and interactive CLI use. Target: <500ms for a catalog with 100 elements across 10 documents.

### NFR-4: Zero Config Start

The tool should work with sensible defaults and no configuration file. Drop YAML files in `.gvp/library/`, run `gvp validate`.
