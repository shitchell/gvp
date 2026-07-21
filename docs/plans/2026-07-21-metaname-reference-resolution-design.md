# meta.name-based reference resolution + document-name uniqueness (#11, #12)

**Date:** 2026-07-21
**Branch:** `feature/metaname-reference-resolution`
**Ships as:** a fix + feature (breaking short-ref grammar change; fine per alpha)
**Tickets:** #11 (refs resolve by path, alias inert), #12 (enforce meta.name uniqueness, E006)

## The bug (#11)

Element references resolve by **`documentPath`** (`toLibraryId() = documentPath:id`),
never by `meta.name`, and the `as:` **alias is inert** for references (built into
`aliasMap`, consumed only to pick which repo to clone). So `code-common:CP7`
(meta.name) fails while `code/common:CP7` (path) resolves — inverting what
`DEC-1.5`/`D15` promise (meta.name is the stable identity; path is a mutable
convenience). `inspect` uses a narrower lookup than the reference resolver, so it
can't find inherited elements at all. Reproduced locally (path≠name doc).

## Target scheme (locked with maintainer)

Separate **identity** from **addressing**:

| Layer | Form | Notes |
|-------|------|-------|
| Identity (equality, `hashKey`) | `(source, documentPath, id)` | **unchanged** |
| Canonical absolute address | `source:documentPath:id` | escape hatch; exact-match still resolves |
| **Library short address** (write / display) | **`[<alias>:]<meta.name>:<id>`** | reorg-stable |

- **Alias = library selector.** Absent ⇒ resolve across all libraries; present ⇒
  restrict to the source that alias maps to (via `aliasMap`).
- **meta.name = document selector** within a library.
- **Bare `name:id` that matches >1 library ⇒ ambiguous ⇒ E001**, message tells the
  author to qualify with the `as:` alias.
- **Path-based short refs are dropped** (breaking; per "scrappy alpha, no migration
  paths"). Canonical `source:documentPath:id` still resolves as the absolute form.

## Prerequisite (#12): meta.name uniqueness — E006

The scheme is only unambiguous if `meta.name` is unique **within a library** (one
`source`). Enforce as an **error** (`E006 DUPLICATE_DOCUMENT_NAME`): two loaded
documents in the same `source` sharing an effective name is a broken-foundation
condition (`P13`/`H8`). Cross-library duplicates stay legal (disambiguated by alias).

**E006 free-up:** `E006` is currently squatted informally by the internal
`CATALOG_ELEMENT_DROP` `CatalogError` message (a bug-guard, not a diagnostic; its
test matches the *name*). De-prefix that message so `E006` is free for the formal
diagnostic. (Lesson from the W016 collision: one code, one meaning.)

## Implementation

1. **`Element`** — add optional 5th ctor param `documentName` (defaults to
   `documentPath`). `toLibraryId()` → `${documentName}:${id}`. `hashKey()`,
   `toCanonicalId()`, `equals()`, identity — **unchanged**. Optional default means
   the 24 test call sites keep working; only the parser passes a real name.
2. **`document-parser.ts`** — pass `meta.name ?? documentPath` as `documentName`.
3. **`Catalog`** — store `aliasMap` from `ResolvedInheritance`; add the single
   resolver `resolveRef(ref)` implementing the grammar above (exact hashKey →
   alias:name:id → bare name:id, ambiguity-aware). Add `resolveRefResult(ref)`
   returning `{status: ok|ambiguous|notfound, ...}` for good diagnostic messages.
4. **Centralize the 9 duplicated resolvers** (`catalog.ancestors`, `graph.ts`,
   `git-diff-tracer`, `dot-exporter`, `analyzer`, `shape-renderer`, `inspect`,
   `user-rules-pass`, structural-pass `knownIds`) onto the shared resolution — a
   `P11`/`R6` cleanup. This also **fixes `inspect`** (routes its primary-arg lookup
   through `resolveRef`).
5. **E006** — per-`source` meta.name uniqueness check (likely
   `post-merge-validation.ts` / structural pass); free the informal E006 first.
6. **Ambiguity → E001** — bare name matching multiple libraries reports "ambiguous;
   qualify with an `as:` alias".
7. **Examples + own library** — update any `path≠name` refs (e.g.
   `examples/software-project` `code/common:*` → `code-common:*`).
8. **Guiding elements** — decision amending `DEC-6.4`/`DEC-1.1c` (path→name short
   form + alias), and the E006 uniqueness rule; correct
   `cross-repo-inheritance.md` + README + `schema.md`/`validation.md`.

## Verification

Failing test first (`code-common:CP7` and `alias:name:id` resolve; `code/common:CP7`
no longer does; bare cross-library collision → ambiguous; E006 fires on same-source
name dup). Full `vitest` green, `cairn validate` clean on the updated library, and
the #11 repro table inverts to the intended result. Release + publish + reinstall.
