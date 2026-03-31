import type { Element } from './element.js';

/**
 * Immutable directed graph of elements (DEC-6.1).
 * Returned by ancestors()/descendants(). Start element always included (DEC-6.5).
 * Handles cycles via seen-set (DEC-6.7: maps_to cycles are allowed).
 */
export class Graph {
  private readonly _nodes: Map<string, Element>; // hashKey -> Element
  private readonly _edges: Map<string, Set<string>>; // from hashKey -> Set<to hashKey>

  constructor(nodes: Map<string, Element>, edges: Map<string, Set<string>>) {
    this._nodes = new Map(nodes);
    this._edges = new Map();
    for (const [from, tos] of edges) {
      this._edges.set(from, new Set(tos));
    }
    Object.freeze(this);
  }

  /** All nodes in the graph */
  get nodes(): Element[] {
    return [...this._nodes.values()];
  }

  /** Number of nodes */
  get size(): number {
    return this._nodes.size;
  }

  /** All edges as [from, to] pairs */
  get edges(): [Element, Element][] {
    const result: [Element, Element][] = [];
    for (const [fromKey, toKeys] of this._edges) {
      const from = this._nodes.get(fromKey);
      if (!from) continue;
      for (const toKey of toKeys) {
        const to = this._nodes.get(toKey);
        if (to) result.push([from, to]);
      }
    }
    return result;
  }

  /** Check if graph contains an element */
  has(element: Element): boolean {
    return this._nodes.has(element.hashKey());
  }

  /** Get direct successors of an element */
  successors(element: Element): Element[] {
    const toKeys = this._edges.get(element.hashKey());
    if (!toKeys) return [];
    return [...toKeys]
      .map((k) => this._nodes.get(k))
      .filter((e): e is Element => !!e);
  }

  /** Nodes with no incoming edges */
  roots(): Element[] {
    const hasIncoming = new Set<string>();
    for (const toKeys of this._edges.values()) {
      for (const k of toKeys) hasIncoming.add(k);
    }
    return [...this._nodes.entries()]
      .filter(([key]) => !hasIncoming.has(key))
      .map(([, el]) => el);
  }

  /** Nodes with no outgoing edges */
  leaves(): Element[] {
    return [...this._nodes.entries()]
      .filter(([key]) => {
        const tos = this._edges.get(key);
        return !tos || tos.size === 0;
      })
      .map(([, el]) => el);
  }

  /** Find all paths from source to target */
  pathsTo(source: Element, target: Element): Element[][] {
    const paths: Element[][] = [];
    const dfs = (
      current: Element,
      path: Element[],
      visited: Set<string>,
    ): void => {
      if (current.hashKey() === target.hashKey()) {
        paths.push([...path, current]);
        return;
      }
      visited.add(current.hashKey());
      for (const next of this.successors(current)) {
        if (!visited.has(next.hashKey())) {
          dfs(next, [...path, current], visited);
        }
      }
    };
    dfs(source, [], new Set());
    return paths;
  }

  /** Filter graph by predicate, returning a new immutable Graph */
  filter(predicate: (element: Element) => boolean): Graph {
    const nodes = new Map<string, Element>();
    const edges = new Map<string, Set<string>>();
    for (const [key, el] of this._nodes) {
      if (predicate(el)) {
        nodes.set(key, el);
      }
    }
    for (const [from, tos] of this._edges) {
      if (!nodes.has(from)) continue;
      const filtered = new Set([...tos].filter((k) => nodes.has(k)));
      if (filtered.size > 0) edges.set(from, filtered);
    }
    return new Graph(nodes, edges);
  }
}

/**
 * Build an ancestors graph for an element (DEC-6.1, DEC-6.5).
 * Walks maps_to upward. Start element always included.
 * Cycles handled via seen-set (DEC-6.7).
 */
export function buildAncestorsGraph(
  element: Element,
  elementLookup: (ref: string) => Element | undefined,
): Graph {
  const nodes = new Map<string, Element>();
  const edges = new Map<string, Set<string>>();

  function walk(el: Element, visited: Set<string>): void {
    const key = el.hashKey();
    if (visited.has(key)) return; // Cycle handling (DEC-6.7)
    visited.add(key);
    nodes.set(key, el);

    for (const ref of el.maps_to) {
      const target = elementLookup(ref);
      if (target) {
        // Edge: el -> target (el maps to target)
        if (!edges.has(key)) edges.set(key, new Set());
        edges.get(key)!.add(target.hashKey());
        walk(target, visited);
      }
    }
  }

  walk(element, new Set());
  return new Graph(nodes, edges);
}

/**
 * Build a descendants graph for an element (DEC-6.1, DEC-6.5).
 * Finds all elements that map TO this element, recursively.
 * Start element always included.
 */
export function buildDescendantsGraph(
  element: Element,
  allElements: Element[],
): Graph {
  const nodes = new Map<string, Element>();
  const edges = new Map<string, Set<string>>();

  // Build reverse index: element hashKey -> elements that map to it
  const reverseIndex = new Map<string, Element[]>();
  for (const el of allElements) {
    for (const ref of el.maps_to) {
      // Try matching by libraryId or hashKey
      const targets = allElements.filter(
        (e) => e.toLibraryId() === ref || e.hashKey() === ref,
      );
      for (const target of targets) {
        const targetKey = target.hashKey();
        if (!reverseIndex.has(targetKey)) reverseIndex.set(targetKey, []);
        reverseIndex.get(targetKey)!.push(el);
      }
    }
  }

  function walk(el: Element, visited: Set<string>): void {
    const key = el.hashKey();
    if (visited.has(key)) return;
    visited.add(key);
    nodes.set(key, el);

    const children = reverseIndex.get(key) ?? [];
    for (const child of children) {
      if (!edges.has(child.hashKey())) edges.set(child.hashKey(), new Set());
      edges.get(child.hashKey())!.add(key);
      walk(child, visited);
    }
  }

  walk(element, new Set());
  return new Graph(nodes, edges);
}
