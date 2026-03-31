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
        let source: string;
        let docPath: string;

        if (typeof entry === 'string') {
          // Local document reference (same source)
          source = doc.source;
          docPath = entry;
        } else if (typeof entry === 'object' && entry !== null && 'source' in entry) {
          // External source reference
          source = entry.source as string;
          docPath = '';
        } else {
          continue;
        }

        // Try to load the parent document
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

        // Recurse into parent (DFS — process parents before self)
        dfs(parent, aliases);
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
        let successorKey: string;
        if (typeof entry === 'string') {
          successorKey = `${doc.source}:${entry}`;
        } else if (
          typeof entry === 'object' &&
          entry !== null &&
          'source' in entry
        ) {
          successorKey = `${entry.source}:`;
        } else {
          continue;
        }

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
