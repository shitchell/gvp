# Document-local aliases (Python `import as` model)

**Date:** 2026-07-21
**Supersedes:** DEC-1.1a's "aliases inherited by children"
**Motivation:** the alias resolution fixes across 2.0.0 → 2.1.1 → 2.1.2-pre converged
on a **flat global alias map** in `buildCatalog`. That is a tape-on: it leaks aliases
across library boundaries (an inherited source's private `as:` becomes usable in the
consumer, verified) and resolves same-name conflicts by arbitrary iteration order
rather than any principled rule. This redesign makes aliases coherent.

## Model — aliases are `import as`

cairn has two namespaces that must scope differently:

- **Elements** are the *public* surface: merged into one catalog and referenceable by
  `meta.name` (transitively visible, like a module's public names).
- **Aliases (`as:`) are `import as` sugar: private to the document that declares them.**
  Like `foo.py`'s `import bar as b`, the alias `b` is local to `foo`. A document that
  `inherits: foo` does NOT get `b` — it reaches `bar`'s elements by their `meta.name`
  (`bar:V1`) or declares its own `as:`.

This retires DEC-1.1a's "children inherit parents' aliases," which was *more*
permissive than Python and is exactly what produced the leak/coupling. Document-local
aliases also remove the need for descendant-wins conflict resolution: each document
uses only its own aliases, so there is nothing to reconcile.

## Mechanism

- **`Catalog`** builds, at construction, `aliasScopesByDoc: Map<docKey, AliasMap>` —
  each document's own `as:` declarations (`buildAliasMap(doc.meta)`, own-only). Plus
  `localAliasUnion`: the union of `@local` documents' aliases, used only for
  CLI-typed refs that have no source element.
- **`resolveRef(ref, fromElement?)`** selects the scope: `fromElement` present → that
  document's scope; absent (e.g. `cairn inspect me:X`) → `localAliasUnion` (leak-free:
  only the local project's aliases). `matchRef` is unchanged — it already takes the
  alias map per call.
- **All ~9 resolve sites** pass `fromElement` (they iterate elements or walk from one).
- **Cleanup folded in:** `resolveInheritance`'s per-chain `aliasMap`
  (`parentAliases`/`finalAliases`) existed to compute DEC-1.1a's accumulation — now
  obsolete. Remove it and the `aliasMap` field from `ResolvedInheritance`; drop the
  flat-union code from `buildCatalog`. The coherent design and the stray-code removal
  are the same change.

## Guiding-element updates

- **Doc:** amend `DEC-1.1a` (`docs/plans/2026-03-02-v1-design-decisions.md`) to
  document-local aliases (2026-07-21).
- **Library:** new decision **D39** — "Document-local aliases (Python import-as
  model)" — supersedes DEC-1.1a's inherited-by-children; refs the code.

## Behavioral changes

- A document can no longer use an alias declared in a document it inherits — it uses
  the `meta.name` (always works) or its own `as:`. (Breaking for anyone relying on
  inherited-by-children; that path was leaky/undocumented in practice.)
- An inherited source's internal `as:` refs still resolve — in *their own* document's
  scope. No cross-boundary leak.

## Not in scope (flagged follow-up)

Bare `meta.name` refs still resolve across the merged catalog with local-preference +
E006 ambiguity; a library's internal bare ref could go ambiguous when merged beside
another library that shares a doc name. Same "scoping when merged" theme, separate
change.

## Verification

Update the 3 tests asserting `ResolvedInheritance.aliasMap`; flip the leak repro to
assert *no* leak; add "a child cannot use its parent's alias." Non-leaf-ancestor case
still resolves (the alias is in that doc's own scope). Full suite green; threshold's
`me:code-common:CP15` still resolves (declared + used in `project.yaml`).
