# Linked tradeoffs on `considered` alternatives — Design

**Date:** 2026-07-21
**Branch:** `feature/considered-tradeoff-links`
**Ships as:** 1.2.0 (minor — backwards-compatible feature, per `gvp:R7` semver)

## Problem

A decision's `considered` alternatives today carry only prose: a `description`
(what it is) and a `rationale` (why rejected). There is no *machine-readable* link
from a rejected alternative to the guiding elements that drove the rejection — or to
what the alternative *would have advanced* had we chosen it. So the honest tradeoff
("we picked Three.js; we gave up the raw performance a bespoke engine would have
delivered, and we rejected Unreal because it works against our AI-centric goal") is
lost to prose and invisible to tooling.

## Design

Add **two optional reference-list fields** to the `considered` alternative model,
both scoped to the alternative:

| Field | Meaning | Polarity |
|-------|---------|----------|
| `would_have_served` | elements this alternative *would have advanced* had we chosen it — the sacrifice | counterfactual-positive |
| `conflicts_with` | elements this alternative *works against* — the reason it was rejected | negative / veto |

```yaml
decisions:
  - id: D1
    name: Render with Three.js
    rationale: Best balance of quality, velocity, and AI-tooling leverage.
    maps_to: [proj:G_ship_fast, proj:V_quality]
    considered:
      bespoke_engine:
        description: Hand-rolled WebGPU renderer.
        rationale: Max performance, but months of work and no AI leverage.
        would_have_served: [proj:G_perf, proj:V_quality]
        conflicts_with:     [proj:G_ship_fast, proj:G_ai]
      unreal:
        description: AAA-grade rendering via Unreal.
        rationale: Runtime is opaque to AI tooling.
        would_have_served: [proj:G_perf]
        conflicts_with:     [proj:G_ai]
```

Both fields are `list<reference>` (reusing the `gvp:D20a` reference type), optional,
and validated for resolvability (broken id → **E001**, like every other reference).

### The load-bearing rule (why this is not just "add a maps_to")

`conflicts_with` is a **negative/veto** edge and `would_have_served` is a
**counterfactual** one. Neither may be flattened into the decision's own `maps_to`
(which means "is justified/supported by"). This is exactly the `#7` veto-value
guardrail ("filter/veto elements must not be mapped as *drivers* of the decisions
they merely failed to veto") and the "later" that `gvp:D3` deferred typed edges for.
Because these fields live *inside* the `considered` sub-model, they are structurally
distinct from the decision's top-level `maps_to`; graph tooling must treat them as
alternative-scoped, not as decision drivers. We are **not** building a general
typed-edge system — just two well-named, polarity-carrying fields. If a future
decision wants full typed edges, this is forward-compatible with it.

## Implementation

1. **`src/data/defaults.yaml`** — add `would_have_served` and `conflicts_with`
   (`list<reference>`, `required: false`) to the `considered` value-model fields.
   *(pure data)*
2. **`src/validation/passes/structural-pass.ts`** — generalize the E001 reference
   walker. Today it recurses `list<model>` and validates the **hard-coded `maps_to`**
   sub-field, plus top-level `list<reference>`. Generalize to:
   - recurse **both** `list<model>` and `dict<model>` container fields, and
   - within each contained model, validate **every `list<reference>` sub-field**
     (dispatch on the declared sub-field type, not the literal `maps_to`).
   This is an **R6 improvement**: it removes a field-name hard-code and uniformly
   covers procedure `steps.maps_to`, the new `considered.*` fields, and any future
   reference sub-field in any container.
3. **Rendering** — no change. The shape-renderer already handles `reference`,
   `dict<model>`, and nested-model recursion, so each link renders with its resolved
   element name automatically.
4. **Tests** — E001 fires on a broken ref inside `considered.<alt>.conflicts_with`;
   a clean-validate case with resolvable refs; a render check; confirm procedure
   `steps.maps_to` still validates after the generalization (no regression).
5. **Docs** — `docs/reference/schema.md` (considered sub-fields), `GLOSSARY.md` /
   `README.md` note on tradeoff links.
6. **Dogfood** — a library decision recording this feature (refs to the code), and
   apply `would_have_served` / `conflicts_with` to a real existing decision as a live
   example (candidate: `gvp:D19`, which weighed and rejected several procedure id_prefix
   options — those rejections map cleanly to clarity/simplicity values).

## Verification

`npm run build`, full `vitest` green, `cairn validate` (+`--coverage`) clean, and the
design-doc ↔ library deterministic checks. Release 1.2.0, publish, reinstall global.
