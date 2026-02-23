# Examples & Doc Cleanup — Design Document

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:writing-plans to create the implementation plan from this design.

**Goal:** Add two self-contained example libraries (software project, small business), migrate integration tests from gvp-docs to examples, and do a final doc cleanup pass across both repos.

**Architecture:** Two independent example libraries under `examples/`, each a valid GVP library runnable with `gvp validate --library examples/<name>/`. Tests switch from external gvp-docs dependency to bundled example. Doc cleanup covers both gvp and gvp-docs repos.

---

## Phase 4: Example Libraries

### Example 1: Software Project ("taskflow")

A fictional CLI task management tool. Demonstrates all 4 scope levels, tags, provenance, inheritance chain, and all category types with mapping rules.

**Structure:**
```
examples/software-project/
├── tags.yaml
├── universal.yaml
├── personal.yaml
└── projects/
    ├── taskflow.yaml
    └── taskflow/
        └── v1.yaml
```

**Content:**

| File | Scope | Elements |
|------|-------|----------|
| `universal.yaml` | universal (U prefix) | 1 value, 1 rule (~2) |
| `personal.yaml` | personal | 3 values, 2 principles, 1 heuristic, 1 rule (~7) |
| `taskflow.yaml` | project | 2 goals, 1 milestone, 1 constraint (~4) |
| `v1.yaml` | implementation | 2 design choices, 1 implementation rule (~3) |

**Total:** ~16 elements across 4 scopes.

**Requirements:**
- All traceability rules must pass (`gvp validate` produces no errors)
- At least one element must have `updated_by` (for W006 test coverage)
- At least one element must have `reviewed_by` (for W006 test coverage)
- At least one element must have `origin` with provenance fields
- Tags must be defined in `tags.yaml` (domain + concern tags)
- Inheritance chain: `universal → personal → taskflow → v1`
- Cross-scope `maps_to` references throughout

### Example 2: Small Business ("Sunrise Coffee")

A fictional coffee shop opening a new location. Demonstrates 2 scope levels, no tags, minimal provenance. Proves GVP works beyond software.

**Structure:**
```
examples/small-business/
├── business.yaml
└── projects/
    └── new-location.yaml
```

**Content:**

| File | Scope | Elements |
|------|-------|----------|
| `business.yaml` | business | 2 values, 2 principles, 1 rule (~5) |
| `new-location.yaml` | project | 1 goal, 1 milestone, 1 constraint, 1 design choice (~4) |

**Total:** ~9 elements across 2 scopes.

**Requirements:**
- No `tags.yaml` — demonstrates tags are optional
- No `id_prefix` — demonstrates prefixes are optional
- Minimal provenance — shows the framework works without heavy metadata
- Inheritance: `business → new-location`
- All traceability rules must pass

---

## Phase 4: Test Migration

Switch integration tests from external gvp-docs to bundled `examples/software-project/`.

**Changes:**
- `tests/conftest.py` — change `GVP_DOCS_DIR` to point at `examples/software-project/` relative to project root
- `tests/test_integration.py` — update assertions to match example data (element counts, chain resolution, specific IDs)
- `tests/test_cli.py` — update `GVP_DOCS` constant
- Any test using `gvp_docs_library` fixture — update assertions to match new data
- The example library must be rich enough to exercise: traceability validation, inheritance chain resolution, tag validation, W006 staleness, cross-scope maps_to resolution, all renderers

---

## Phase 6: Doc Cleanup

### Targeted Updates

**gvp utility repo:**
- **README.md** — Add "Examples" section with sample commands pointing at both example libraries. Remove any references to gvp-docs as example data.
- **GLOSSARY.md** — Add `reviewed_by` to Technical Terms section. Scan for any stale definitions.

**gvp-docs repo:**
- **ROADMAP.md** — Mark "TASV investigation" as done. Mark "chain review validation" as done (covered by W006). Remove or mark stale items.
- **README.md** — Reframe as personal store documentation. Strip any "public example" language.

### Alignment Pass

Read through both repos' documentation end-to-end. Check that:
- Terminology matches between GLOSSARY, README, schema.yaml, and code
- Descriptions of features match current implementation
- Category definitions are consistent across all docs
- Validation rules described match what the code enforces
- Examples in docs use correct syntax and would actually work

### Coherency Pass

Read each document in isolation. Check that:
- Each doc reads well on its own without requiring other docs
- No stale references to removed features or old behavior
- No contradictions within a single document
- No gaps where something is referenced but never explained
- Tone is consistent within each document
