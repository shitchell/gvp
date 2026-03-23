import { describe, it, expect } from 'vitest';
import { documentMetaSchema } from '../../src/model/document-meta.js';

describe('DocumentMeta Schema', () => {
  it('parses empty meta', () => {
    const result = documentMetaSchema.parse({});
    expect(result).toBeDefined();
  });

  it('parses meta with all fields', () => {
    const result = documentMetaSchema.parse({
      name: 'test',
      inherits: ['parent'],
      scope: 'project',
      defaults: { tags: ['default'] },
      definitions: {
        tags: { framework: { description: 'Core framework' } },
      },
    });
    expect(result.name).toBe('test');
    expect(result.scope).toBe('project');
  });

  it('parses inherits with source objects', () => {
    const result = documentMetaSchema.parse({
      inherits: [
        { source: '@github:foo/bar', as: 'org' },
        'local-doc',
      ],
    });
    expect(result.inherits).toHaveLength(2);
  });

  it('parses flat tag definitions (DEC-2.14)', () => {
    const result = documentMetaSchema.parse({
      definitions: {
        tags: {
          reliability: { description: 'System reliability' },
          performance: { description: 'System performance' },
        },
      },
    });
    expect(result.definitions?.tags).toHaveProperty('reliability');
  });
});
