import { describe, it, expect } from 'vitest';
import { loadDefaults } from '../../src/schema/defaults-loader.js';
import { CategoryRegistry } from '../../src/model/category-registry.js';
import { parseDocument } from '../../src/model/document-parser.js';

describe('Model Integration', () => {
  const defaults = loadDefaults();
  const registry = CategoryRegistry.fromDefaults(defaults);

  const sampleYaml = `
meta:
  name: test-project
  scope: project
  definitions:
    tags:
      reliability:
        description: System reliability
      security:
        description: System security

goals:
  - id: G1
    name: Ship reliable software
    statement: Deliver software that works correctly and predictably.
    tags: [reliability]
    maps_to: []
  - id: G2
    name: Protect user data
    statement: User data must be secure at rest and in transit.
    tags: [security]
    maps_to: []

values:
  - id: V1
    name: Simplicity
    statement: Complexity must earn its place.
    tags: []
    maps_to: [test-project:G1]

principles:
  - id: P1
    name: Fail loudly
    statement: Errors should be visible and actionable, never silent.
    tags: [reliability]
    maps_to: [test-project:G1, test-project:V1]

decisions:
  - id: D1
    name: Use TypeScript
    rationale: Type safety and npm ecosystem.
    tags: []
    maps_to: [test-project:G1, test-project:V1]
    considered:
      Python:
        rationale: Already have v0 in Python but TS is better for npm.
      Rust:
        rationale: Too steep a learning curve for the target audience.
`;

  it('loads defaults and creates registry', () => {
    expect(registry.categoryNames).toHaveLength(9);
  });

  it('parses a multi-category document', () => {
    const doc = parseDocument(sampleYaml, '/project/test.yaml', 'test-project', '@local', registry);
    expect(doc.name).toBe('test-project');
    expect(doc.getAllElements()).toHaveLength(5);
  });

  it('elements have correct identity', () => {
    const doc = parseDocument(sampleYaml, '/project/test.yaml', 'test-project', '@local', registry);
    const g1 = doc.getElementsByCategory('goal')[0]!;
    expect(g1.toString()).toBe('G1: "Ship reliable software"');
    expect(g1.toLibraryId()).toBe('test-project:G1');
    expect(g1.toCanonicalId()).toBe('@local:test-project:G1');
  });

  it('elements have correct category', () => {
    const doc = parseDocument(sampleYaml, '/project/test.yaml', 'test-project', '@local', registry);
    expect(doc.getElementsByCategory('goal')).toHaveLength(2);
    expect(doc.getElementsByCategory('value')).toHaveLength(1);
    expect(doc.getElementsByCategory('principle')).toHaveLength(1);
    expect(doc.getElementsByCategory('decision')).toHaveLength(1);
  });

  it('decision has considered field', () => {
    const doc = parseDocument(sampleYaml, '/project/test.yaml', 'test-project', '@local', registry);
    const d1 = doc.getElementsByCategory('decision')[0]!;
    const considered = d1.get('considered') as Record<string, unknown>;
    expect(considered).toHaveProperty('Python');
    expect(considered).toHaveProperty('Rust');
  });

  it('tag definitions are accessible', () => {
    const doc = parseDocument(sampleYaml, '/project/test.yaml', 'test-project', '@local', registry);
    const tags = doc.getTagDefinitions();
    expect(tags.reliability?.description).toBe('System reliability');
  });

  it('element equality works across parses', () => {
    const doc1 = parseDocument(sampleYaml, '/project/test.yaml', 'test-project', '@local', registry);
    const doc2 = parseDocument(sampleYaml, '/project/test.yaml', 'test-project', '@local', registry);
    const g1a = doc1.getElementsByCategory('goal')[0]!;
    const g1b = doc2.getElementsByCategory('goal')[0]!;
    expect(g1a.equals(g1b)).toBe(true);
    expect(g1a.hashKey()).toBe(g1b.hashKey());
  });

  it('elements from different sources are not equal', () => {
    const doc1 = parseDocument(sampleYaml, '/project/test.yaml', 'test-project', '@local', registry);
    const doc2 = parseDocument(sampleYaml, '/project/test.yaml', 'test-project', '@github:foo/bar', registry);
    const g1a = doc1.getElementsByCategory('goal')[0]!;
    const g1b = doc2.getElementsByCategory('goal')[0]!;
    expect(g1a.equals(g1b)).toBe(false);
  });

  it('defaults.yaml loads through same pipeline (DEC-9.4 dogfooding)', () => {
    // The fact that loadDefaults() succeeds and creates a working registry
    // proves the pipeline works end-to-end
    const schema = registry.getElementSchema('goal');
    const result = schema.parse({
      id: 'G1', name: 'Test', statement: 'Test.',
    });
    expect(result.id).toBe('G1');
    expect(result.status).toBe('active');
  });
});
