import type { Document } from '../model/document.js';
import type { AliasMap } from './alias-resolver.js';
import { buildAliasMap } from './alias-resolver.js';
import { InheritanceError } from '../errors.js';

/**
 * Callback type for loading documents during inheritance resolution.
 * The resolver doesn't know how to load documents — the caller provides this.
 */
export type DocumentLoader = (source: string, documentPath: string) => Document;

/**
 * Callback type for enumerating ALL documents in an external source's
 * library (DEC-1.7 object-form inherits). Object-form `inherits` entries
 * — `{ source: <path-or-@source>, as: <alias> }` — name a source library,
 * not a single document. The resolver pulls every document from that
 * source so the inheriting document can reference any of them with the
 * natural 2-segment `document:element` form (e.g. `personal:V2`,
 * `code/common:CP7`). Each returned Document carries its own
 * `documentPath` relative to the source library and a `source` string
 * identifying the source (so identity stays unique across libraries).
 *
 * The caller provides this. When absent, object-form entries are skipped
 * (legacy behavior) so the resolver remains usable in unit tests that
 * only exercise same-library string-form inheritance.
 */
export type SourceLoader = (source: string) => Document[];

/**
 * Result of resolving a document's inheritance tree.
 */
export interface ResolvedInheritance {
  /** Documents in DFS order, ancestors first (DEC-1.3: ancestors have highest priority) */
  orderedDocuments: Document[];
  /** Accumulated alias map for the entry document */
  aliasMap: AliasMap;
  /** Strongly connected components with >1 member (DEC-1.8) */
  sccs: Document[][];
}

/**
 * Resolve a document's full inheritance tree via DFS (DEC-1.0, DEC-1.3, DEC-1.8).
 *
 * DFS Algorithm (DEC-1.3):
 * For document D with inherits: [A, E] where A inherits [B, C]:
 * 1. Recurse into A → recurse into B (leaf, add B), recurse into C (leaf, add C), add A
 * 2. Recurse into E (leaf, add E)
 * 3. Add D
 * Result: [B, C, A, E, D] — ancestors first, entry document last
 *
 * Cycle Detection (DEC-1.8):
 * Track visiting set during DFS. On back-edge, skip the node (cycle-breaking).
 *
 * Tarjan's SCC (DEC-1.8):
 * After DFS, find strongly connected components. SCCs with >1 member
 * grant mutual element access.
 */
export function resolveInheritance(
  entryDoc: Document,
  loader: DocumentLoader,
  sourceLoader?: SourceLoader,
): ResolvedInheritance {
  const ordered: Document[] = [];
  const visited = new Set<string>(); // fully-processed keys
  const visiting = new Set<string>(); // cycle detection (in-progress DFS path)
  const docMap = new Map<string, Document>(); // cache loaded docs by key

  // Register the entry document
  const entryKey = docKey(entryDoc);
  docMap.set(entryKey, entryDoc);

  function dfs(doc: Document, parentAliases: AliasMap): AliasMap {
    const key = docKey(doc);

    if (visiting.has(key)) {
      // Cycle detected — skip (DEC-1.8 cycle-breaking)
      return parentAliases;
    }

    if (visited.has(key)) {
      // Already processed — skip but don't error
      return parentAliases;
    }

    visiting.add(key);

    // Build alias map for this document (DEC-1.1a)
    const aliases = buildAliasMap(doc.meta, parentAliases);

    // Process inherits entries
    const inherits = doc.meta.inherits;
    if (inherits && Array.isArray(inherits)) {
      for (const entry of inherits) {
        if (typeof entry === 'string') {
          // String-form: a single document in the SAME source/library.
          const source = doc.source;
          const docPath = entry;
          const parentKey = `${source}:${docPath}`;
          let parent = docMap.get(parentKey);
          if (!parent) {
            try {
              parent = loader(source, docPath);
              docMap.set(parentKey, parent);
            } catch (e) {
              throw new InheritanceError(
                `Failed to load inherited document '${docPath}' from source '${source}': ${(e as Error).message}`,
              );
            }
          }
          dfs(parent, aliases);
        } else if (typeof entry === 'object' && entry !== null && 'source' in entry) {
          // Object-form: name an EXTERNAL source library (DEC-1.7). Pull
          // every document from that source so any of them can be
          // referenced by `document:element`. Without a sourceLoader the
          // resolver cannot reach the source, so we skip (and unit tests
          // that don't wire one stay unaffected).
          if (!sourceLoader) continue;
          const source = entry.source as string;
          let sourceDocs: Document[];
          try {
            sourceDocs = sourceLoader(source);
          } catch (e) {
            throw new InheritanceError(
              `Failed to load inherited source '${source}': ${(e as Error).message}`,
            );
          }
          if (sourceDocs.length === 0) {
            throw new InheritanceError(
              `Inherited source '${source}' contains no documents`,
            );
          }
          for (const sourceDoc of sourceDocs) {
            const parentKey = docKey(sourceDoc);
            if (!docMap.has(parentKey)) {
              docMap.set(parentKey, sourceDoc);
            }
            // Recurse so the source doc's own (string-form) inherits and
            // alias map are processed, and it lands in `ordered`.
            dfs(docMap.get(parentKey)!, aliases);
          }
        } else {
          continue;
        }
      }
    }

    visiting.delete(key);
    visited.add(key);
    ordered.push(doc);

    return aliases;
  }

  const finalAliases = dfs(entryDoc, new Map());

  // Tarjan's SCC post-pass (DEC-1.8)
  const sccs = findSCCs(ordered, docMap);

  return {
    orderedDocuments: ordered,
    aliasMap: finalAliases,
    sccs,
  };
}

/** Stable key for a document: source:documentPath */
function docKey(doc: Document): string {
  return `${doc.source}:${doc.documentPath}`;
}

/**
 * Tarjan's SCC algorithm (DEC-1.8).
 * Returns SCCs with >1 member (mutual access groups).
 */
function findSCCs(
  documents: Document[],
  docMap: Map<string, Document>,
): Document[][] {
  let index = 0;
  const stack: string[] = [];
  const onStack = new Set<string>();
  const indices = new Map<string, number>();
  const lowlinks = new Map<string, number>();
  const sccs: Document[][] = [];

  function strongconnect(doc: Document): void {
    const k = docKey(doc);
    indices.set(k, index);
    lowlinks.set(k, index);
    index++;
    stack.push(k);
    onStack.add(k);

    // Process successors (documents this doc inherits from)
    const inherits = doc.meta.inherits;
    if (inherits && Array.isArray(inherits)) {
      for (const entry of inherits) {
        // Only string-form (same-library) edges participate in SCC
        // detection. Object-form entries expand to whole external
        // libraries (each doc keyed by its own source:documentPath) and
        // are handled during DFS; they don't create same-key back-edges
        // here, so we skip them.
        if (typeof entry !== 'string') {
          continue;
        }
        const successorKey = `${doc.source}:${entry}`;

        if (!indices.has(successorKey)) {
          const successor = docMap.get(successorKey);
          if (successor) {
            strongconnect(successor);
            lowlinks.set(
              k,
              Math.min(lowlinks.get(k)!, lowlinks.get(successorKey)!),
            );
          }
        } else if (onStack.has(successorKey)) {
          lowlinks.set(
            k,
            Math.min(lowlinks.get(k)!, indices.get(successorKey)!),
          );
        }
      }
    }

    // If this is a root node of an SCC
    if (lowlinks.get(k) === indices.get(k)) {
      const scc: Document[] = [];
      let w: string;
      do {
        w = stack.pop()!;
        onStack.delete(w);
        const sccDoc = docMap.get(w);
        if (sccDoc) scc.push(sccDoc);
      } while (w !== k);

      // Only include SCCs with >1 member (mutual access groups)
      if (scc.length > 1) {
        sccs.push(scc);
      }
    }
  }

  for (const doc of documents) {
    if (!indices.has(docKey(doc))) {
      strongconnect(doc);
    }
  }

  return sccs;
}
