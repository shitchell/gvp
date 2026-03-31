# Gap Remediation Plan

## Priority 1: Critical Gaps (Batch A — sequential due to interdependencies)

### A1: Fix _all field schemas merge from user documents
- File: `src/catalog/category-merger.ts`
- Fix: Populate `mergedAll` from document `_all` blocks, not just defaults
- Test: Verify user document `_all` field_schemas cascade

### A2: Add config_overrides support
- File: `src/model/document-meta.ts` — add `config_overrides` to schema
- File: `src/catalog/catalog.ts` — apply config_overrides after CFG-2 merge
- Test: Ancestor enforces strict mode via config_overrides

### A3: Fix W001 and warning codes
- File: `src/validation/passes/semantic-pass.ts`
- Fix: W001 = empty maps_to on non-root (not empty document). Add W006 staleness.
- Fix: Ensure W003 is used correctly (not for mapping rules — that should be its own code)

### A4: Fill validation pass stubs
- File: `src/validation/passes/schema-pass.ts` — validate element fields against Zod schemas
- File: `src/validation/passes/structural-pass.ts` — add undefined tags, ID gaps, broken inheritance
- File: `src/validation/passes/semantic-pass.ts` — add W006 staleness detection
- File: `src/validation/passes/user-rules-pass.ts` — basic rule engine from config

## Priority 2: Missing CLI Commands (Batch B — can parallelize some)

### B1: gvp add (CMD-4)
- next_id() algorithm, editor templates, --skip-review, origin provenance

### B2: gvp edit (CMD-5)
- Inline field updates, updated_by provenance, --skip-review

### B3: gvp review (CMD-6)
- Staleness detection, interactive display, --approve with hash, stamp reviewed_by

### B4: gvp inspect (DEC-7.2)
- Single element view, --trace, --refs, --reviews, --updates, --ref file::id

### B5: gvp query (CMD-2)
- Filter by tags, category, document, status, --refs-file, --refs-identifier

### B6: gvp analyze (DEC-10.16)
- Wire embedding analysis to CLI, unmapped relationship detection

## Priority 3: Important Gaps (Batch C)

### C1: --scope flag on validate (DEC-10.5)
### C2: Verbose logging (-v/-vv/-vvv) (DEC-8.2)
### C3: JSON exporter losslessness (DEC-7.10) — add inherits, defaults, definitions
### C4: Git-aware ref staleness in semantic pass (DEC-10.2)
### C5: Transitive traceability check (VAL-2)
### C6: Multi-leaf catalog loading fix

## Priority 4: Moderate Gaps (Batch D)

### D1: Missing error types (CircularInheritanceError, MissingMappingRulesError)
### D2: DOT exporter tier-based layout + subgraphs
### D3: meta.id_prefix support
### D4: Diagnostic code validation at config load
### D5: SQLite exporter implementation
