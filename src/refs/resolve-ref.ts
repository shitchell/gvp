import type { Element } from '../model/element.js';

/**
 * Reference resolution (DEC-6.4 revised, #11; #13/path-fallback).
 *
 * A reference resolves to an element by the library short address
 * `[<alias>:]<meta.name>:<id>`, plus the canonical `<source>:<documentPath>:<id>`
 * (exact hashKey) as an absolute escape hatch.
 *
 * - The `as:` alias selects the *library* (source). Absent ⇒ resolve across all
 *   libraries, preferring the local (`@local`) library on a collision.
 * - `meta.name` selects the *document* within a library. It must be unique within a
 *   library (E006), so within one source the pair (name, id) is unambiguous.
 * - **`documentPath` is a lenient fallback**: if the document segment matches no
 *   `meta.name`, it is tried against `documentPath` too. meta.name always takes
 *   precedence (it is the stable identity — file paths change), so path is only a
 *   convenience for un-migrated refs and never overrides a name match. Restored
 *   after 2.0.0 dropped it: dropping path was never required by the meta.name/alias
 *   fix (they are orthogonal), and keeping it as a fallback avoids breaking refs.
 * - A document segment that still matches more than one library (and no local one)
 *   is *ambiguous* — the caller should tell the author to qualify with the alias.
 */

export const LOCAL_SOURCE = '@local';

export type RefMatch =
  | { status: 'ok'; element: Element }
  | { status: 'ambiguous'; matches: Element[] }
  | { status: 'notfound' };

/** Alias → source string (e.g. 'org' → '@github:company/org-gvp@v1'). */
export type AliasMap = Map<string, string>;

/**
 * Resolve a reference string against a set of elements, returning a discriminated
 * result so callers can distinguish not-found from ambiguous.
 */
export function matchRef(ref: string, elements: Element[], aliasMap: AliasMap): RefMatch {
  // 1. Canonical absolute address — exact hashKey (source:documentPath:id).
  const exact = elements.find((e) => e.hashKey() === ref);
  if (exact) return { status: 'ok', element: exact };

  const parts = ref.split(':');

  // 2. alias:doc:id — the alias selects the library (source); doc = meta.name
  //    (path as fallback) within that library.
  if (parts.length === 3) {
    const [alias, doc, id] = parts;
    const source = aliasMap.get(alias!);
    if (source !== undefined) {
      return pickByDoc(elements.filter((e) => e.source === source), doc!, id!);
    }
    // Unknown alias → not resolvable by the alias grammar. (A canonical
    // 3-part @source:path:id would already have matched via exact hashKey.)
    return { status: 'notfound' };
  }

  // 3. bare doc:id — meta.name (path fallback) across all libraries, local-preferred.
  if (parts.length === 2) {
    const [doc, id] = parts;
    return pickByDoc(elements, doc!, id!);
  }

  return { status: 'notfound' };
}

/**
 * Resolve a `<doc>:<id>` pair within a candidate set. Tries the document segment
 * as `meta.name` first (the stable identity); only if nothing matches by name does
 * it fall back to `documentPath`. So name always wins and path is lenient-only.
 */
function pickByDoc(candidates: Element[], doc: string, id: string): RefMatch {
  const byName = candidates.filter((e) => e.documentName === doc && e.id === id);
  if (byName.length > 0) return pick(byName);
  const byPath = candidates.filter((e) => e.documentPath === doc && e.id === id);
  return pick(byPath);
}

/**
 * Reduce a candidate list to a single match. On collision, prefer the local
 * (`@local`) library — a bare reference means "this project's" document — and
 * only report ambiguous when no single local candidate breaks the tie.
 */
function pick(matches: Element[]): RefMatch {
  if (matches.length === 1) return { status: 'ok', element: matches[0]! };
  if (matches.length === 0) return { status: 'notfound' };
  const local = matches.filter((e) => e.source === LOCAL_SOURCE);
  if (local.length === 1) return { status: 'ok', element: local[0]! };
  return { status: 'ambiguous', matches };
}

/** Convenience: resolve to the element, or undefined if not uniquely resolvable. */
export function resolveRef(ref: string, elements: Element[], aliasMap: AliasMap): Element | undefined {
  const m = matchRef(ref, elements, aliasMap);
  return m.status === 'ok' ? m.element : undefined;
}
