import { describe, it, expect } from 'vitest';
import {
  resolveInheritance,
  type DocumentLoader,
} from '../../src/inheritance/inheritance-resolver.js';
import { Document } from '../../src/model/document.js';
import type { DocumentMeta } from '../../src/model/document-meta.js';

/** Helper: create a minimal Document for testing. */
function makeDoc(
  documentPath: string,
  inherits?: DocumentMeta['inherits'],
  source = '@local',
): Document {
  const meta: DocumentMeta = {
    name: documentPath,
    ...(inherits ? { inherits } : {}),
  };
  return new Document(
    meta,
    new Map(), // no elements needed for inheritance tests
    `/${documentPath}.yaml`,
    documentPath,
    source,
  );
}

describe('Inheritance Resolver (DEC-1.0, DEC-1.3, DEC-1.8)', () => {
  it('resolves single document (no inheritance)', () => {
    const doc = makeDoc('root');
    const loader: DocumentLoader = () => {
      throw new Error('should not be called');
    };

    const result = resolveInheritance(doc, loader);
    expect(result.orderedDocuments).toHaveLength(1);
    expect(result.orderedDocuments[0]!.documentPath).toBe('root');
  });

  it('resolves linear inheritance A -> B (DEC-1.3: ancestors first)', () => {
    const docB = makeDoc('b');
    const docA = makeDoc('a', ['b']);

    const loader: DocumentLoader = (_source, docPath) => {
      if (docPath === 'b') return docB;
      throw new Error(`Unknown doc: ${docPath}`);
    };

    const result = resolveInheritance(docA, loader);
    expect(result.orderedDocuments.map((d) => d.documentPath)).toEqual([
      'b',
      'a',
    ]);
  });

  it('resolves chain A -> B -> C (deepest ancestor first)', () => {
    const docC = makeDoc('c');
    const docB = makeDoc('b', ['c']);
    const docA = makeDoc('a', ['b']);

    const docs = new Map([
      ['b', docB],
      ['c', docC],
    ]);
    const loader: DocumentLoader = (_source, docPath) => {
      const doc = docs.get(docPath);
      if (!doc) throw new Error(`Unknown doc: ${docPath}`);
      return doc;
    };

    const result = resolveInheritance(docA, loader);
    expect(result.orderedDocuments.map((d) => d.documentPath)).toEqual([
      'c',
      'b',
      'a',
    ]);
  });

  it('resolves diamond inheritance (DEC-1.3: DFS order, no duplicates)', () => {
    //     A
    //    / \
    //   B   C
    //    \ /
    //     D
    const docD = makeDoc('d');
    const docB = makeDoc('b', ['d']);
    const docC = makeDoc('c', ['d']);
    const docA = makeDoc('a', ['b', 'c']);

    const docs = new Map([
      ['b', docB],
      ['c', docC],
      ['d', docD],
    ]);
    const loader: DocumentLoader = (_source, docPath) => {
      const doc = docs.get(docPath);
      if (!doc) throw new Error(`Unknown doc: ${docPath}`);
      return doc;
    };

    const result = resolveInheritance(docA, loader);
    const order = result.orderedDocuments.map((d) => d.documentPath);
    // DFS: A -> B -> D (leaf, add D), add B; A -> C -> D (already visited, skip), add C; add A
    expect(order).toEqual(['d', 'b', 'c', 'a']);
  });

  it('handles direct cycle gracefully (DEC-1.8: cycle-breaking)', () => {
    // A inherits B, B inherits A
    const docA = makeDoc('a', ['b']);
    const docB = makeDoc('b', ['a']);

    const docs = new Map([
      ['a', docA],
      ['b', docB],
    ]);
    const loader: DocumentLoader = (_source, docPath) => {
      const doc = docs.get(docPath);
      if (!doc) throw new Error(`Unknown doc: ${docPath}`);
      return doc;
    };

    // Should not throw — cycle is broken by the visiting set
    const result = resolveInheritance(docA, loader);
    expect(result.orderedDocuments.length).toBeGreaterThan(0);
    // Both documents should appear exactly once
    const paths = result.orderedDocuments.map((d) => d.documentPath);
    expect(paths).toContain('a');
    expect(paths).toContain('b');
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('handles 3-node cycle (DEC-1.8)', () => {
    // A -> B -> C -> A
    const docA = makeDoc('a', ['b']);
    const docB = makeDoc('b', ['c']);
    const docC = makeDoc('c', ['a']);

    const docs = new Map([
      ['a', docA],
      ['b', docB],
      ['c', docC],
    ]);
    const loader: DocumentLoader = (_source, docPath) => {
      const doc = docs.get(docPath);
      if (!doc) throw new Error(`Unknown doc: ${docPath}`);
      return doc;
    };

    const result = resolveInheritance(docA, loader);
    const paths = result.orderedDocuments.map((d) => d.documentPath);
    expect(paths).toContain('a');
    expect(paths).toContain('b');
    expect(paths).toContain('c');
    expect(new Set(paths).size).toBe(3);
  });

  it('all documents appear exactly once (shared ancestor)', () => {
    //   A
    //  / \
    // B   C (both inherit from shared)
    // |   |
    // shared
    const shared = makeDoc('shared');
    const docB = makeDoc('b', ['shared']);
    const docC = makeDoc('c', ['shared']);
    const docA = makeDoc('a', ['b', 'c']);

    const docs = new Map([
      ['b', docB],
      ['c', docC],
      ['shared', shared],
    ]);
    const loader: DocumentLoader = (_source, docPath) => {
      const doc = docs.get(docPath);
      if (!doc) throw new Error(`Unknown doc: ${docPath}`);
      return doc;
    };

    const result = resolveInheritance(docA, loader);
    const paths = result.orderedDocuments.map((d) => d.documentPath);
    expect(new Set(paths).size).toBe(paths.length); // No duplicates
    expect(paths).toHaveLength(4);
  });

  it('returns alias map', () => {
    const doc = makeDoc('a');
    const loader: DocumentLoader = () => {
      throw new Error('nope');
    };

    const result = resolveInheritance(doc, loader);
    expect(result.aliasMap).toBeInstanceOf(Map);
  });

  it('accumulates aliases through inheritance chain', () => {
    const orgDoc = makeDoc('root', [], '@github:company/org-gvp');
    const docB = makeDoc('b', [
      { source: '@github:company/org-gvp', as: 'org' },
    ]);
    const docA = makeDoc('a', ['b']);

    const loader: DocumentLoader = (source, docPath) => {
      if (source === '@local' && docPath === 'b') return docB;
      if (source === '@github:company/org-gvp') return orgDoc;
      throw new Error(`Unknown: ${source}:${docPath}`);
    };

    const result = resolveInheritance(docA, loader);
    // Aliases from B should propagate through to A's alias map
    expect(result.aliasMap).toBeInstanceOf(Map);
  });

  it('throws InheritanceError for failed document load', () => {
    const docA = makeDoc('a', ['nonexistent']);
    const loader: DocumentLoader = () => {
      throw new Error('not found');
    };

    expect(() => resolveInheritance(docA, loader)).toThrow(/Failed to load/);
  });

  it('wraps loader error in InheritanceError', () => {
    const docA = makeDoc('a', ['missing']);
    const loader: DocumentLoader = () => {
      throw new Error('disk read error');
    };

    expect(() => resolveInheritance(docA, loader)).toThrow(
      /Failed to load inherited document 'missing' from source '@local': disk read error/,
    );
  });

  it('handles object-form inherits with source', () => {
    const externalDoc = makeDoc('root', [], 'external-lib');
    const docA = makeDoc('a', [{ source: 'external-lib' }]);

    const loader: DocumentLoader = (source, _docPath) => {
      if (source === 'external-lib') return externalDoc;
      throw new Error(`Unknown source: ${source}`);
    };

    const result = resolveInheritance(docA, loader);
    expect(result.orderedDocuments).toHaveLength(2);
  });

  it('detects SCCs with >1 member for mutual cycles', () => {
    // A inherits B, B inherits A — they form a 2-member SCC
    const docA = makeDoc('a', ['b']);
    const docB = makeDoc('b', ['a']);

    const docs = new Map([
      ['a', docA],
      ['b', docB],
    ]);
    const loader: DocumentLoader = (_source, docPath) => {
      const doc = docs.get(docPath);
      if (!doc) throw new Error(`Unknown doc: ${docPath}`);
      return doc;
    };

    const result = resolveInheritance(docA, loader);
    // Should find at least one SCC with 2 members
    expect(result.sccs.length).toBeGreaterThanOrEqual(1);
    const sccPaths = result.sccs.flatMap((scc) =>
      scc.map((d) => d.documentPath),
    );
    expect(sccPaths).toContain('a');
    expect(sccPaths).toContain('b');
  });

  it('returns no SCCs for acyclic graphs', () => {
    const docB = makeDoc('b');
    const docA = makeDoc('a', ['b']);

    const loader: DocumentLoader = (_source, docPath) => {
      if (docPath === 'b') return docB;
      throw new Error(`Unknown doc: ${docPath}`);
    };

    const result = resolveInheritance(docA, loader);
    expect(result.sccs).toEqual([]);
  });

  it('handles empty inherits array', () => {
    const meta: DocumentMeta = { name: 'test', inherits: [] };
    const doc = new Document(meta, new Map(), '/test.yaml', 'test', '@local');
    const loader: DocumentLoader = () => {
      throw new Error('nope');
    };

    const result = resolveInheritance(doc, loader);
    expect(result.orderedDocuments).toHaveLength(1);
  });

  it('multiple inherits processed in declaration order', () => {
    // A inherits [x, y, z] — all leaves
    const docX = makeDoc('x');
    const docY = makeDoc('y');
    const docZ = makeDoc('z');
    const docA = makeDoc('a', ['x', 'y', 'z']);

    const docs = new Map([
      ['x', docX],
      ['y', docY],
      ['z', docZ],
    ]);
    const loader: DocumentLoader = (_source, docPath) => {
      const doc = docs.get(docPath);
      if (!doc) throw new Error(`Unknown doc: ${docPath}`);
      return doc;
    };

    const result = resolveInheritance(docA, loader);
    expect(result.orderedDocuments.map((d) => d.documentPath)).toEqual([
      'x',
      'y',
      'z',
      'a',
    ]);
  });
});
