# Patch-Based Import (`cairn import`)

The tool-managed way to add or update many elements at once. Prefer this over hand-editing
library YAML: it assigns IDs, rewrites cross-references, stamps provenance, and you can preview
the whole change before writing. Use it for bulk additions, multi-document updates, and any
change where new elements reference each other.

## When to use which command

| Situation | Command |
|-----------|---------|
| One new element, fields known | `cairn add` |
| Change one existing element | `cairn edit` |
| Several elements, or new elements that cross-reference each other, or edits spanning documents | `cairn import` |

## The three modes

**1. Single-file** — all elements in the patch go into one document.
```bash
cairn import patch.yaml --into personal
```

**2. Directory** — mirror the library layout; each `file.yaml` maps to a document by its
relative path (`code/common.yaml` → document `code/common`). `--into` is rejected here.
```bash
cairn import patches/ --dry-run
cairn import patches/ --yes
```
An optional `patches/_manifest.yaml` may request deletions:
```yaml
delete_documents: [code/legacy]   # requires --confirm-delete
```

**3. Multi-document file** — one file targeting many existing documents:
```yaml
meta:
  multi_document: true
add_enforcement:                 # arbitrary label
  document: personal             # target (documentPath or meta.name)
  patch:
    principles:
      - id: "?p_enforce"
        name: ...
```
`--into` is rejected; each sub-patch names its own `document`. A sub-patch may also carry a
`meta:` block that merges into the target document's meta (the only import mode that can update
an existing document's meta).

## Patch file shape

A patch file is just element lists under their `yaml_key` (no `meta` needed in directory/
single-file mode — it's ignored there):
```yaml
principles:
  - id: "?p_enforce"            # pseudo-ID (see below) OR an explicit real ID
    name: Every process needs a concrete enforcement mechanism
    statement: >
      ...
    tags: [meta, maintainability]
    maps_to: [personal:G1, personal:V2, "?c_effort"]
constraints:
  - id: "?c_effort"
    name: People optimize for minimal effort
    impact: >
      ...
    tags: [meta]
```

## Pseudo-IDs (`?`-prefix) — the key feature

Author new elements with placeholder IDs like `?p_enforce`, `?c_effort` and reference them in
each other's `maps_to`. On import cairn:
1. **assigns real sequential IDs** per `(category, target document)` — finds the max existing ID
   number for that category in the target doc and increments;
2. **rewrites every reference** that points at a pseudo-ID to the real, doc-qualified ID
   (`?c_effort` → `personal:C2`);
3. **errors** on any unresolved `?`-reference or pseudo-ID collision — before writing anything,
   and before `--dry-run` prints its preview.

"Every reference" is derived from the category's declared field schemas, not a fixed list, so it
covers the element's own `maps_to`, any top-level reference list (`procedure.related`), and the
reference sub-fields of nested models — `procedure.steps[].maps_to` and a decision's
`considered.<alternative>.would_have_served` / `.conflicts_with`. A new reference field added to
a schema is rewritten without any change to the importer.

This lets a patch describe a whole decomposition chain (child → parent) without you knowing the
final numbers. Pseudo-IDs must be unique per category within the patch set.

```yaml
decisions:
  - id: "?d_streak"
    name: Compute streaks at read time from the completion log
    rationale: Recomputing from the log means the streak is always what the record supports.
    disposition: accepted
    maps_to: ["?g_streaks", "?v_honest"]
    considered:
      Stored streak counter:
        description: Keep a current-streak integer per habit, bumped on mark-done.
        rationale: Cheaper to read, but it drifts on any backfill or deletion.
        would_have_served: ["?g_streaks"]   # rewritten, same as maps_to
        conflicts_with: ["?v_honest"]       # rewritten, same as maps_to
```

## Add vs update vs provenance

- **Real ID that already exists** in the target doc → **update** (patch fields overwrite,
  unmentioned fields preserved).
- **Pseudo-ID, or real ID not yet present** → **add**.
- New/added elements get an `origin` provenance entry automatically (uuid, date,
  "Imported from <file>", + your `user` identity from config if set).
- Updated elements get an `updated_by` change record — see below.

### `update_rationale` — required on every update

An update to an existing element must say **why it changed**, exactly as `cairn edit --rationale`
requires. Put it on the element as `update_rationale`:

```yaml
goals:
  - id: G1
    statement: A user can see their current streak in one screen of output.
    update_rationale: The old statement covered two outcomes at once; split them.
```

The import **fails and writes nothing** if any element being *updated* lacks it. Added elements
are unaffected — a new element's provenance is its `origin` entry.

`update_rationale` is meta-rationale *about the change*. It lands in the element's `updated_by`
change record, never in the element's own fields. It is deliberately not called `rationale`: on a
decision, `rationale` is the element's own primary field, and the two would collide in one
mapping. `update_` matches the existing provenance vocabulary (`updated_by`).

### Skipping review — recorded, not bypassed

Some updates genuinely need no review (a typo, a reflow). Say so explicitly, two ways:

| Scope | How |
|-------|-----|
| One element | `skip_review: true` on that element, in place of `update_rationale` |
| The whole patch | `--skip-review` on the command |

```yaml
goals:
  - id: G1
    statement: Whitespace reflow only.
    skip_review: true                      # mechanical — no review needed
values:
  - id: V1
    statement: Narrowed to what we can actually honour.
    update_rationale: It was claiming more than the tooling enforces.
```

Both forms **still write the `updated_by` entry**, flagged `skip_review: true` (DEC-4.6). Skipping
review is a *recorded stance* — "this change needed no review" — not an omission of provenance.
Nothing reaches an append-only record untraced. `cairn review` treats the flagged entries as
already accounted for, so they do not raise `W006`.

`update_rationale` and `skip_review` are **patch-only control keys**. They drive the import and
are stripped before writing — they never appear as element fields in the library.

## Gotchas

- **Non-default ID prefixes need explicit IDs.** Auto-numbering uses the category's *canonical*
  prefix (`P`, `C`, `H`, `R`...). If a document uses a custom prefix — e.g. `code/common` uses
  `CP*`/`CH*`/`CR*` — a pseudo-ID would mis-assign (`?p_…` → `P1`, not `CP10`). For such
  documents, give new elements **explicit** IDs (`CP10`, `CP11`, …) computed from the current
  max. Documents on default prefixes (most root docs) are safe with pseudo-IDs. Cross-references
  to pseudo-IDs in other files still get rewritten even when the referencing element has an
  explicit ID, so you can mix the two freely.
- **Only directory mode creates new documents**, and it stamps a generic
  `meta: {name, scope: project}` (it ignores a `meta:` block in the patch file). Single-file and
  multi-document modes require the target document to already exist. To create a new document
  with the right `meta` (scope/inherits), **pre-create a skeleton** file first:
  ```yaml
  # library/ai/common.yaml
  meta:
    name: ai-common
    scope: personal
    inherits: personal
  ```
  then import elements into it. (Creating a meta-only skeleton is the one sanctioned bit of hand
  authoring — it's the document frontmatter, not an element.)
- **Non-interactive runs require `--yes`** (piped stdin has no TTY to confirm at).
- **`--skip-review` is not a way to avoid provenance.** It swaps a written rationale for the
  recorded stance `skip_review: true`; the `updated_by` entry is written either way. If you find
  yourself reaching for it on a substantive change, write the `update_rationale` instead.

## Flags

| Flag | Effect |
|------|--------|
| `--into <document>` | Target document. Required in single-file mode; rejected in the other two. |
| `--dry-run` | Print the preview and exit without writing. Still runs every check. |
| `-y`, `--yes` | Skip the confirmation prompt (required non-interactively). |
| `--skip-review` | Mark every update in the patch skip-review (DEC-4.6). Still writes `updated_by`. |
| `--confirm-delete` | Permit the document deletions listed in `_manifest.yaml`. |

## Recommended flow

```bash
# 1. (new doc only) create a meta-only skeleton at library/<path>.yaml
# 2. write patch file(s) mirroring the library layout, using pseudo-IDs
#    (explicit IDs for custom-prefix docs)
cairn --store <store> import patches/ --dry-run   # 3. preview IDs + rewrites
cairn --store <store> import patches/ --yes       # 4. write
cairn --store <store> validate                    # 5. confirm structural integrity
```

The `--dry-run` step is the empirical check: it prints every `?id → realId` assignment and every
reference rewrite. Read it before writing — it catches prefix mistakes, collisions, and unresolved
references with nothing committed. Every check runs before the preview is printed, so a dry run
that prints a rewrite list is a dry run where everything resolved; a failure replaces the preview
rather than appearing alongside it.
