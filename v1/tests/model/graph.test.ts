import { describe, it, expect } from 'vitest';
import { Element } from '../../src/model/element.js';
import { Graph, buildAncestorsGraph, buildDescendantsGraph } from '../../src/model/graph.js';

/** Helper to create elements with minimal boilerplate */
const el = (
  id: string,
  maps_to: string[] = [],
  source = '@local',
  docPath = 'doc',
) =>
  new Element(
    { id, name: `Name of ${id}`, status: 'active', tags: [], maps_to },
    'category',
    source,
    docPath,
  );

/** Helper to look up elements by libraryId or hashKey from a list */
const makeLookup =
  (elements: Element[]) =>
  (ref: string): Element | undefined =>
    elements.find((e) => e.toLibraryId() === ref || e.hashKey() === ref);

describe('Graph (DEC-6.1)', () => {
  describe('single-node graph', () => {
    it('contains the start element with no edges', () => {
      const a = el('A');
      const graph = buildAncestorsGraph(a, () => undefined);
      expect(graph.size).toBe(1);
      expect(graph.has(a)).toBe(true);
      expect(graph.edges).toHaveLength(0);
    });
  });

  describe('linear chain', () => {
    // A maps_to B maps_to C
    const c = el('C');
    const b = el('B', ['doc:C']);
    const a = el('A', ['doc:B']);
    const all = [a, b, c];
    const lookup = makeLookup(all);

    it('ancestors(A) includes all 3 nodes', () => {
      const graph = buildAncestorsGraph(a, lookup);
      expect(graph.size).toBe(3);
      expect(graph.has(a)).toBe(true);
      expect(graph.has(b)).toBe(true);
      expect(graph.has(c)).toBe(true);
    });

    it('ancestors(A) has correct edges', () => {
      const graph = buildAncestorsGraph(a, lookup);
      expect(graph.edges).toHaveLength(2);
      expect(graph.successors(a).map((e) => e.id)).toEqual(['B']);
      expect(graph.successors(b).map((e) => e.id)).toEqual(['C']);
      expect(graph.successors(c)).toHaveLength(0);
    });
  });

  describe('roots()', () => {
    it('returns nodes with no incoming edges', () => {
      const c = el('C');
      const b = el('B', ['doc:C']);
      const a = el('A', ['doc:B']);
      const graph = buildAncestorsGraph(a, makeLookup([a, b, c]));
      const roots = graph.roots();
      expect(roots.map((e) => e.id)).toEqual(['A']);
    });
  });

  describe('leaves()', () => {
    it('returns nodes with no outgoing edges', () => {
      const c = el('C');
      const b = el('B', ['doc:C']);
      const a = el('A', ['doc:B']);
      const graph = buildAncestorsGraph(a, makeLookup([a, b, c]));
      const leaves = graph.leaves();
      expect(leaves.map((e) => e.id)).toEqual(['C']);
    });
  });

  describe('immutability (DEC-6.5)', () => {
    it('graph is frozen', () => {
      const a = el('A');
      const graph = buildAncestorsGraph(a, () => undefined);
      expect(Object.isFrozen(graph)).toBe(true);
    });
  });

  describe('start element always included (DEC-6.5)', () => {
    it('element with no maps_to still appears in graph', () => {
      const a = el('A');
      const graph = buildAncestorsGraph(a, () => undefined);
      expect(graph.has(a)).toBe(true);
      expect(graph.size).toBe(1);
    });

    it('element with unresolvable maps_to still appears', () => {
      const a = el('A', ['nonexistent:ref']);
      const graph = buildAncestorsGraph(a, () => undefined);
      expect(graph.has(a)).toBe(true);
      expect(graph.size).toBe(1);
    });
  });

  describe('cycle handling (DEC-6.7)', () => {
    it('A -> B -> A does not infinite loop', () => {
      const a = el('A', ['doc:B']);
      const b = el('B', ['doc:A']);
      const graph = buildAncestorsGraph(a, makeLookup([a, b]));
      expect(graph.size).toBe(2);
      expect(graph.has(a)).toBe(true);
      expect(graph.has(b)).toBe(true);
      expect(graph.edges).toHaveLength(2);
    });

    it('self-referencing cycle does not infinite loop', () => {
      const a = el('A', ['doc:A']);
      const graph = buildAncestorsGraph(a, makeLookup([a]));
      expect(graph.size).toBe(1);
      // Self-edge: A -> A, but the walk skips revisiting
      // The edge is added before the visited check triggers on the target
    });
  });

  describe('filter()', () => {
    it('returns a new graph with subset of nodes', () => {
      const c = el('C');
      const b = el('B', ['doc:C']);
      const a = el('A', ['doc:B']);
      const graph = buildAncestorsGraph(a, makeLookup([a, b, c]));

      const filtered = graph.filter((e) => e.id !== 'C');
      expect(filtered.size).toBe(2);
      expect(filtered.has(a)).toBe(true);
      expect(filtered.has(b)).toBe(true);
      expect(filtered.has(c)).toBe(false);
      // Edge from B -> C should be removed since C is excluded
      expect(filtered.edges).toHaveLength(1);
    });
  });

  describe('pathsTo()', () => {
    it('finds a direct path', () => {
      const b = el('B');
      const a = el('A', ['doc:B']);
      const graph = buildAncestorsGraph(a, makeLookup([a, b]));
      const paths = graph.pathsTo(a, b);
      expect(paths).toHaveLength(1);
      expect(paths[0].map((e) => e.id)).toEqual(['A', 'B']);
    });

    it('finds path through multiple nodes', () => {
      const c = el('C');
      const b = el('B', ['doc:C']);
      const a = el('A', ['doc:B']);
      const graph = buildAncestorsGraph(a, makeLookup([a, b, c]));
      const paths = graph.pathsTo(a, c);
      expect(paths).toHaveLength(1);
      expect(paths[0].map((e) => e.id)).toEqual(['A', 'B', 'C']);
    });

    it('returns empty for unreachable target', () => {
      const a = el('A');
      const b = el('B');
      const nodes = new Map<string, Element>();
      nodes.set(a.hashKey(), a);
      nodes.set(b.hashKey(), b);
      const graph = new Graph(nodes, new Map());
      expect(graph.pathsTo(a, b)).toHaveLength(0);
    });

    it('finds multiple paths in a diamond', () => {
      // A -> B -> D and A -> C -> D
      const d = el('D');
      const b = el('B', ['doc:D']);
      const c = el('C', ['doc:D']);
      const a = el('A', ['doc:B', 'doc:C']);
      const graph = buildAncestorsGraph(a, makeLookup([a, b, c, d]));
      const paths = graph.pathsTo(a, d);
      expect(paths).toHaveLength(2);
      const pathIds = paths.map((p) => p.map((e) => e.id));
      expect(pathIds).toContainEqual(['A', 'B', 'D']);
      expect(pathIds).toContainEqual(['A', 'C', 'D']);
    });
  });

  describe('edges()', () => {
    it('returns correct [from, to] pairs', () => {
      const b = el('B');
      const a = el('A', ['doc:B']);
      const graph = buildAncestorsGraph(a, makeLookup([a, b]));
      const edges = graph.edges;
      expect(edges).toHaveLength(1);
      expect(edges[0][0].id).toBe('A');
      expect(edges[0][1].id).toBe('B');
    });
  });

  describe('buildDescendantsGraph', () => {
    it('finds elements that map to the target', () => {
      const c = el('C');
      const b = el('B', ['doc:C']);
      const a = el('A', ['doc:B']);
      const all = [a, b, c];

      // Descendants of C: B maps to C, A maps to B
      const graph = buildDescendantsGraph(c, all);
      expect(graph.size).toBe(3);
      expect(graph.has(a)).toBe(true);
      expect(graph.has(b)).toBe(true);
      expect(graph.has(c)).toBe(true);
    });

    it('returns single-node graph when nothing maps to element', () => {
      const a = el('A');
      const b = el('B');
      const graph = buildDescendantsGraph(a, [a, b]);
      expect(graph.size).toBe(1);
      expect(graph.has(a)).toBe(true);
    });

    it('handles cycles in descendants', () => {
      const a = el('A', ['doc:B']);
      const b = el('B', ['doc:A']);
      const graph = buildDescendantsGraph(a, [a, b]);
      expect(graph.size).toBe(2);
    });

    it('edges point from child to parent', () => {
      const b = el('B');
      const a = el('A', ['doc:B']);
      const graph = buildDescendantsGraph(b, [a, b]);
      const edges = graph.edges;
      expect(edges).toHaveLength(1);
      expect(edges[0][0].id).toBe('A');
      expect(edges[0][1].id).toBe('B');
    });
  });
});
