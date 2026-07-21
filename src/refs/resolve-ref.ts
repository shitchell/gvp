import type { Element } from '../model/element.js';

/**
 * Reference resolution (DEC-6.4 revised, #11).
 *
 * A reference is resolved to an element by the library short address
 * `[<alias>:]<meta.name>:<id>`, plus the canonical absolute address
 * `<source>:<documentPath>:<id>` (exact hashKey) as an escape hatch.
 *
 * - The `as:` alias selects the *library* (source). Absent ⇒ resolve across all
 *   libraries, preferring the local (`@local`) library on a name collision.
 * - `meta.name` selects the *document* within a library. It must be unique within
 *   a library (enforced by E006), so within one source the pair (name, id) is
 *   unambiguous.
 * - A bare `name:id` that still matches more than one library (and no local one)
 *   is *ambiguous* — the caller should tell the author to qualify with the alias.
 *
 * Path-based short refs (`documentPath:id`) are intentionally NOT resolved here —
 * they are not stable across file reorganization. The canonical form still works.
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

  // 2. alias:name:id — the alias selects the library (source).
  if (parts.length === 3) {
    const [alias, name, id] = parts;
    const source = aliasMap.get(alias!);
    if (source !== undefined) {
      const matches = elements.filter(
        (e) => e.source === source && e.documentName === name && e.id === id,
      );
      return pick(matches);
    }
    // Unknown alias → not resolvable by the alias grammar. (A canonical
    // 3-part @source:path:id would already have matched via exact hashKey.)
    return { status: 'notfound' };
  }

  // 3. bare name:id — meta.name across all libraries, local-preferred.
  if (parts.length === 2) {
    const [name, id] = parts;
    const matches = elements.filter((e) => e.documentName === name && e.id === id);
    return pick(matches);
  }

  return { status: 'notfound' };
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
