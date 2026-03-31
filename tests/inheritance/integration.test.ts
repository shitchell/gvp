import { describe, it, expect } from 'vitest';
import { resolveInheritance, type DocumentLoader } from '../../src/inheritance/inheritance-resolver.js';
import { parseDocument } from '../../src/model/document-parser.js';
import { CategoryRegistry } from '../../src/model/category-registry.js';
import { loadDefaults } from '../../src/schema/defaults-loader.js';

describe('Inheritance Integration', () => {
  const defaults = loadDefaults();
  const registry = CategoryRegistry.fromDefaults(defaults);

  // Simulate a 3-level inheritance: org -> personal -> project
  const orgYaml = `
meta:
  name: org-standards
  scope: universal

goals:
  - id: G1
    name: Sustainable Revenue
    statement: Build sustainable revenue streams.
    tags: []
    maps_to: []

values:
  - id: V1
    name: User Trust
    statement: Users trust our products.
    tags: []
    maps_to: [org-standards:G1]
`;

  const personalYaml = `
meta:
  name: personal
  scope: personal
  inherits: [org-standards]

values:
  - id: V1
    name: Simplicity
    statement: Keep it simple.
    tags: []
    maps_to: [org-standards:G1]

principles:
  - id: P1
    name: Fail Loudly
    statement: Errors should be visible.
    tags: []
    maps_to: [personal:V1, org-standards:V1]
`;

  const projectYaml = `
meta:
  name: taskflow
  scope: project
  inherits: [personal]

goals:
  - id: G1
    name: CLI task management
    statement: Manage tasks from the command line.
    tags: []
    maps_to: [org-standards:G1]

decisions:
  - id: D1
    name: Use JSON storage
    rationale: Simple and human-readable.
    tags: []
    maps_to: [taskflow:G1, personal:V1]
`;

  function createDocs() {
    const orgDoc = parseDocument(orgYaml, '/org.yaml', 'org-standards', '@local', registry);
    const personalDoc = parseDocument(personalYaml, '/personal.yaml', 'personal', '@local', registry);
    const projectDoc = parseDocument(projectYaml, '/project.yaml', 'taskflow', '@local', registry);
    return { orgDoc, personalDoc, projectDoc };
  }

  function createLoader(docs: Map<string, ReturnType<typeof parseDocument>>): DocumentLoader {
    return (_source: string, docPath: string) => {
      const doc = docs.get(docPath);
      if (!doc) throw new Error(`Unknown document: ${docPath}`);
      return doc;
    };
  }

  it('resolves 3-level inheritance in correct DFS order', () => {
    const { orgDoc, personalDoc, projectDoc } = createDocs();
    const loader = createLoader(new Map([['org-standards', orgDoc], ['personal', personalDoc]]));

    const result = resolveInheritance(projectDoc, loader);
    const order = result.orderedDocuments.map(d => d.documentPath);

    // DFS: taskflow -> personal -> org-standards (leaf, add) -> add personal -> add taskflow
    expect(order).toEqual(['org-standards', 'personal', 'taskflow']);
  });

  it('ancestors come first in ordered list', () => {
    const { orgDoc, personalDoc, projectDoc } = createDocs();
    const loader = createLoader(new Map([['org-standards', orgDoc], ['personal', personalDoc]]));

    const result = resolveInheritance(projectDoc, loader);
    // First doc should be the deepest ancestor
    expect(result.orderedDocuments[0]!.documentPath).toBe('org-standards');
    // Last doc should be the entry point
    expect(result.orderedDocuments[result.orderedDocuments.length - 1]!.documentPath).toBe('taskflow');
  });

  it('all documents have accessible elements', () => {
    const { orgDoc, personalDoc, projectDoc } = createDocs();
    const loader = createLoader(new Map([['org-standards', orgDoc], ['personal', personalDoc]]));

    const result = resolveInheritance(projectDoc, loader);

    const allElements = result.orderedDocuments.flatMap(d => d.getAllElements());
    expect(allElements.length).toBeGreaterThanOrEqual(5); // G1+V1 from org, V1+P1 from personal, G1+D1 from project
  });

  it('no SCCs in acyclic inheritance', () => {
    const { orgDoc, personalDoc, projectDoc } = createDocs();
    const loader = createLoader(new Map([['org-standards', orgDoc], ['personal', personalDoc]]));

    const result = resolveInheritance(projectDoc, loader);
    expect(result.sccs).toHaveLength(0);
  });
});
