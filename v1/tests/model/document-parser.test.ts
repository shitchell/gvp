import { describe, it, expect } from 'vitest';
import { parseDocument } from '../../src/model/document-parser.js';
import { CategoryRegistry } from '../../src/model/category-registry.js';
import { loadDefaults } from '../../src/schema/defaults-loader.js';

describe('Document Parser', () => {
  const defaults = loadDefaults();
  const registry = CategoryRegistry.fromDefaults(defaults);

  it('parses a minimal document with goals', () => {
    const yaml = `
meta:
  name: test

goals:
  - id: G1
    name: Test Goal
    statement: We will test.
    tags: []
    maps_to: []
`;
    const doc = parseDocument(yaml, '/test.yaml', 'test', '@local', registry);
    expect(doc.name).toBe('test');
    expect(doc.getAllElements()).toHaveLength(1);
    expect(doc.getElementsByCategory('goal')).toHaveLength(1);
    expect(doc.getElementsByCategory('goal')[0]!.id).toBe('G1');
  });

  it('parses multiple categories', () => {
    const yaml = `
meta:
  name: test

goals:
  - id: G1
    name: Goal One
    statement: First goal.
    tags: []
    maps_to: []

values:
  - id: V1
    name: Value One
    statement: First value.
    tags: []
    maps_to: []
`;
    const doc = parseDocument(yaml, '/test.yaml', 'test', '@local', registry);
    expect(doc.getAllElements()).toHaveLength(2);
    expect(doc.getElementsByCategory('goal')).toHaveLength(1);
    expect(doc.getElementsByCategory('value')).toHaveLength(1);
  });

  it('applies document-level defaults (DEC-2.5)', () => {
    const yaml = `
meta:
  name: test
  defaults:
    tags: [default-tag]

goals:
  - id: G1
    name: Goal One
    statement: Test.
    maps_to: []
`;
    const doc = parseDocument(yaml, '/test.yaml', 'test', '@local', registry);
    const goal = doc.getElementsByCategory('goal')[0]!;
    expect(goal.tags).toContain('default-tag');
  });

  it('element fields override defaults', () => {
    const yaml = `
meta:
  name: test
  defaults:
    status: deprecated

goals:
  - id: G1
    name: Goal One
    statement: Test.
    status: active
    tags: []
    maps_to: []
`;
    const doc = parseDocument(yaml, '/test.yaml', 'test', '@local', registry);
    expect(doc.getElementsByCategory('goal')[0]!.status).toBe('active');
  });

  it('sets source and documentPath on elements', () => {
    const yaml = `
meta:
  name: test

goals:
  - id: G1
    name: Goal
    statement: Test.
    tags: []
    maps_to: []
`;
    const doc = parseDocument(yaml, '/lib/test.yaml', 'test', '@github:foo/bar', registry);
    const el = doc.getElementsByCategory('goal')[0]!;
    expect(el.source).toBe('@github:foo/bar');
    expect(el.documentPath).toBe('test');
    expect(el.toCanonicalId()).toBe('@github:foo/bar:test:G1');
  });

  it('throws ValidationError for invalid element (missing id)', () => {
    const yaml = `
meta:
  name: test

goals:
  - name: No ID
    statement: Test.
`;
    expect(() => parseDocument(yaml, '/test.yaml', 'test', '@local', registry)).toThrow();
  });

  it('ignores unknown top-level keys', () => {
    const yaml = `
meta:
  name: test
custom_section:
  - something: here

goals:
  - id: G1
    name: Goal
    statement: Test.
    tags: []
    maps_to: []
`;
    const doc = parseDocument(yaml, '/test.yaml', 'test', '@local', registry);
    expect(doc.getAllElements()).toHaveLength(1);
  });

  it('parses flat tag definitions (DEC-2.14)', () => {
    const yaml = `
meta:
  name: test
  definitions:
    tags:
      framework:
        description: Core framework design
      tooling:
        description: CLI implementation

goals:
  - id: G1
    name: Goal
    statement: Test.
    tags: [framework]
    maps_to: []
`;
    const doc = parseDocument(yaml, '/test.yaml', 'test', '@local', registry);
    const tags = doc.getTagDefinitions();
    expect(tags.framework).toBeDefined();
    expect(tags.framework!.description).toBe('Core framework design');
  });

  it('parses decision with considered field', () => {
    const yaml = `
meta:
  name: test

decisions:
  - id: D1
    name: Use TypeScript
    rationale: Type safety.
    tags: []
    maps_to: []
    considered:
      Python:
        rationale: Already have v0 in Python.
`;
    const doc = parseDocument(yaml, '/test.yaml', 'test', '@local', registry);
    const decision = doc.getElementsByCategory('decision')[0]!;
    expect(decision.get('considered')).toBeDefined();
  });

  it('applies status default to active', () => {
    const yaml = `
meta:
  name: test

goals:
  - id: G1
    name: Goal
    statement: Test.
`;
    const doc = parseDocument(yaml, '/test.yaml', 'test', '@local', registry);
    expect(doc.getElementsByCategory('goal')[0]!.status).toBe('active');
  });
});
