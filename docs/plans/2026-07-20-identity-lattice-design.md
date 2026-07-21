# Identity-Lattice Reform — Design (#6, #7, #8)

**Date:** 2026-07-20
**Branch:** `feature/identity-lattice`
**Tickets:** #7 (new root types), #6 (mapping_rules reform), #8 (decision disposition + top-side coverage)
**Status:** design locked; ready for translation → implementation

This trio is one coordinated reform of cairn's taxonomy and validation model. The
throughline (same complaint as #4): the validation model does not yet *express what we
actually mean*. #7 adds the missing vocabulary, #6 fixes the bottom-of-graph anchor rules
to accept it, #8 adds the top-of-graph coverage rule and makes "we deliberately declined
this" a first-class, honest record.

Build order: **#7 → #6 → #8** (each depends on the prior).

---

## Design decisions — provenance

Every open question in the three tickets was triaged against the existing guiding elements
(per the maintainer's instruction: decide what guidance determines, confer on the rest).

### Determined by existing guidance

| # | Question | Decision | Anchored in |
|---|---|---|---|
| 7 | Core built-in vs. custom categories | **Core** — add to `src/data/defaults.yaml` | `R4` + `H1`: structural, domain-agnostic requirements-engineering vocab; as fundamental as goal/value/constraint |
| 7 | Names / prefixes / keys | `user_requirement`/`U`, `exclusion`/`X`, `is_root: true` | Settled in ticket; verified working on 1.0.25-beta |
| 6 | Value anchor: direct vs transitive | **Transitive** | Ticket Refinement 1; mirrors existing `W014` transitive walk |
| 6 | New "no value reachable" diagnostic | **W017** | Next in sequence (`D7` tiered validation) |
| 6 | Scope: decision-only vs all guided categories | **All guided categories** | `V2` (coherency) + `G5` (consistency across scopes) |
| 6 | `mapping_rules` shape | Hard non-value-root anchor stays in `mapping_rules` (W003); soft value nudge is the **separate W017 pass** | `P11`: keep distinct-purpose mechanisms distinct; one-pass-per-concern |
| 8 | disposition values / default / W013 scoping | `{accepted, declined, deferred}`, default `accepted`, `W013`→accepted-only | Ticket; default preserves all 28 existing decisions |
| 8 | New top-side coverage diagnostic | **W018** | Next in sequence |

### Conferred with maintainer (2026-07-20)

- **disposition representation** → *field_schema + scoped R6 exception.* disposition is an enum
  `field_schema` on the `decision` category (decision-specific data stays in the category def,
  per `R4`). A new decision narrowly extends `R6`'s exception surface: validation passes MAY
  read a declared enum field that gates coverage severity. `R6` itself anticipates this
  ("candidates for promotion if a future decision tightens the universality guarantee").

- **exclusion top-side coverage** → *exclusion self-satisfies* (excluded from the W018 rule),
  implemented "in whatever way is most DRY and well designed." Resolution: a schema-driven
  `requires_decision` category-def flag rather than a hard-coded exemption list. The flag also
  subsumes the ticket's "exempt `value`" guard. W018 iterates the flag and hard-codes no
  category names (`R6`-clean).

---

## Part A — #7: new root categories (the identity lattice)

Two new **root** categories added to core `src/data/defaults.yaml`:

```yaml
  user_requirement:
    yaml_key: user_requirements
    id_prefix: U
    primary_field: statement
    display_label: "User Requirement"
    is_root: true
    requires_decision: true          # actionable point-root (see Part C)
    color: "<tbd>"

  exclusion:
    yaml_key: exclusions
    id_prefix: X
    primary_field: statement
    display_label: "Exclusion"
    is_root: true
    # no requires_decision — self-satisfies top-side coverage
    color: "<tbd>"
```

- **Requirement (U)** — a stakeholder-*decreed* mandate, asserted as input, **not derivable**
  from any value. Distinct from Rule (derived, re-derivable from a value) and Goal
  (self-authored, open-ended vs. decreed, binary).
- **Exclusion (X)** — a self-imposed *out-of-scope* boundary; the negative space of goals.

Roots need no upward mapping but are *encouraged* to map when applicable. A requirement→value
link means **"resonates-with / partially-motivated-by," NOT "derived-from"** — downstream
tooling must not try to re-derive the requirement (the under-determination residual is the
decreed core). No new edge type is introduced for this; it stays an ordinary `maps_to` and the
semantic is documented, not enforced.

**Also mark existing roots** `goal` and `constraint` with `requires_decision: true`
(see Part C). `value` stays unmarked (it is a direction, not a point).

## Part B — #6: mapping_rules reform

`mapping_rules` is already an OR-of-AND-groups list evaluated *data-driven* by
`traceability-pass.ts` (W003) against an element's directly-mapped categories — so widening the
allowed anchors is a **data change in defaults.yaml, no W003 code change**.

Generalize the "goal slot" of every guided category to "any non-value root," keeping the
`[goal, value]` pair intact (goals always carry a value):

```yaml
  # principle, rule, decision, milestone, procedure:
  mapping_rules:
    - [goal, value]
    - [constraint]
    - [user_requirement]
    - [exclusion]

  # heuristic (retains its principle/rule inheritance groups):
  mapping_rules:
    - [goal, value]
    - [constraint]
    - [user_requirement]
    - [exclusion]
    - [principle]
    - [rule]
```

Backward-compatible: `[goal, value]` remains a satisfying group, so nothing existing breaks —
this is a strict superset.

### W017 — soft, transitive value anchor (NEW pass logic)

Separate from W003. For every non-root active element: if **no value is reachable transitively**
through the `maps_to` graph (including inherited libraries), emit **W017** (`NO_VALUE_TRACE`).

- Severity: **warning**; → error under `--strict`; suppressible via `suppress_diagnostics`.
- Message points at the likely home: the acceptance-value for a constraint/requirement/exclusion-
  anchored element usually lives in an org/personal library — wire it up or add it.
- Transitive walk mirrors the existing W014 root-trace loop in `traceability-pass.ts`.
- Rationale (`P6`/`C1`): hard-erroring during incremental library-building forces a hollow local
  value stub — the exact smell we are avoiding.

## Part C — #8: decision disposition + top-side coverage

### C.1 — `disposition` facet on decision

```yaml
  decision:
    field_schemas:
      disposition:
        type: enum
        values: [accepted, declined, deferred]
        required: false
        display_name: "Disposition"
      considered: { … unchanged … }
```

Decision is redefined as **"a resolved choice with rationale"** (not "a choice with material
impact in files"). A decline/defer produces no artifacts yet is a real, consequential choice.

| disposition | expectation |
|---|---|
| `accepted` (default when absent) | expects `refs`; **W013** applies |
| `declined` | expects nothing; `rationale` + `considered` are the record; **W013 exempt** |
| `deferred` | expects a deferral rationale + trigger; **W013 exempt** |

**W013 scoping (coverage-pass change):** fire only when effective disposition is `accepted`.
Reading the `disposition` enum in the coverage pass is authorized by the new scoped-R6-exception
decision. Absence ⇒ `accepted`, preserving all 28 existing decisions' behavior.

### C.2 — W018: top-side root coverage (NEW, coverage-pass)

> Every root whose category declares `requires_decision: true` has **≥1 Decision tracing to it**
> (any disposition).

- Targets: `goal`, `constraint`, `user_requirement`. Exempt by construction: `value`, `exclusion`
  (no flag).
- Severity: **warning**, coverage-pass only (runs under `--coverage`), → error under `--strict`,
  suppressible.
- Driven entirely by the `requires_decision` flag — no category names in code (`R6`).

Together with the existing bottom-side coverage (W012/W013) this closes the loop end-to-end:
nothing decreed goes silently unaddressed; nothing built goes silently unjustified.

---

## Code-change inventory

1. **`src/data/defaults.yaml`** — add `user_requirement` + `exclusion` categories; generalize
   `mapping_rules` on all guided categories; add `disposition` field_schema to `decision`; add
   `requires_decision: true` to goal/constraint/user_requirement.
2. **`src/schema/category-definition.ts`** — add `requires_decision?: boolean` to interface + zod.
3. **Validation passes** —
   - W017 (`NO_VALUE_TRACE`): transitive value reachability (traceability-pass or a sibling).
   - W018 (`ROOT_NO_DECISION`): coverage-pass, driven by `requires_decision`.
   - W013: scope to effective `accepted` disposition.
   - Register new codes in the diagnostic catalog / README validation-codes table.
4. **Docs** — `README.md` (categories + validation-codes tables), `docs/guide/schema-reference.md`
   (Requirement/Exclusion delineation tests; re-sharpen `Rule`'s "unconditional requirement"
   wording to avoid the terminology collision), `GLOSSARY.md`.
5. **cairn's own `.gvp` library** — new guiding elements + decisions (below), added *through the
   tool* (`cairn add` / `cairn import`), with `refs` to the code above.

## New library elements (titles → verbatim `name`s)

Authored into `.gvp/library/gvp.yaml` (D-ids continue from D28):

- **D29 — Requirement and Exclusion as core identity-lattice roots** (maps: G6, G9, V7; refs defaults.yaml)
- **D30 — Generalize mapping anchors to any non-value root** (maps: G5, V2; refs defaults.yaml, traceability-pass)
- **D31 — Soft transitive value anchor (W017) as a separate warning pass** (maps: G5, V3, C1; refs the W017 code)
- **D32 — Decision disposition facet {accepted,declined,deferred}** (maps: G3/G4, V3, V9; refs defaults.yaml, coverage-pass)
- **D33 — Scoped R6 exception: validation may read declared coverage-gating enum fields** (maps: V2, V10; amends R6; refs coverage-pass)
- **D34 — Top-side decision coverage via `requires_decision` flag (W018)** (maps: G4, V9; refs category-definition, coverage-pass)
- Possible new **guiding elements** if review wants them: a principle on *decreed vs derived
  inputs*, and a heuristic *Requirement-vs-Rule/Constraint delineation test*. Flagged for the
  maintainer's guiding-element review rather than pre-decided.

## Verification plan

- `cairn validate` and `cairn validate --coverage` clean (no new errors; expected new W017/W018
  warnings surfaced intentionally).
- Unit tests per new/changed pass; source-grep guard test for W018 (no category-name literals),
  matching the `R6` precedent in `tests/exporters/shape-renderer.test.ts`.
- Probe: a `decision` mapping only to a `user_requirement` no longer trips W003 (the #7 wrinkle).
- Deterministic checks (workflow steps 4 & 7): design-doc titles ↔ library names; library
  decision ids ↔ implementation plan.
