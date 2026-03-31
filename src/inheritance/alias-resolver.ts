import type { DocumentMeta } from '../model/document-meta.js';

/**
 * Alias map: alias name -> canonical source path.
 * Per DEC-1.1a: document-scoped, inherited by children, descendant wins.
 */
export type AliasMap = Map<string, string>;

/**
 * Extract alias entries from a document's meta.inherits.
 * Only object-form entries with an `as` field create aliases.
 */
function extractAliases(inherits: DocumentMeta['inherits']): Map<string, string> {
  const aliases = new Map<string, string>();
  if (!inherits || !Array.isArray(inherits)) return aliases;

  for (const entry of inherits) {
    if (typeof entry === 'object' && entry !== null && 'source' in entry && 'as' in entry && entry.as) {
      aliases.set(entry.as, entry.source);
    }
  }
  return aliases;
}

/**
 * Build an alias map for a document by combining parent aliases with the document's own aliases.
 * Descendant wins on conflict (DEC-1.1a).
 *
 * @param docMeta - The document's meta block
 * @param parentAliases - Aliases inherited from parent documents
 * @returns Combined alias map where the document's aliases override parents'
 */
export function buildAliasMap(
  docMeta: DocumentMeta,
  parentAliases: AliasMap = new Map(),
): AliasMap {
  const ownAliases = extractAliases(docMeta.inherits);

  // Start with parent aliases, overlay with own (descendant wins)
  const combined = new Map(parentAliases);
  for (const [alias, source] of ownAliases) {
    combined.set(alias, source);
  }
  return combined;
}

/**
 * Resolve a source alias to its canonical source path.
 * If the source is an alias, replace it. Otherwise, return as-is.
 */
export function resolveAlias(source: string, aliases: AliasMap): string {
  return aliases.get(source) ?? source;
}
