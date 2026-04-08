import { describe, it, expect } from 'vitest';
import { buildZodSchema } from '../../src/schema/build-schema.js';
import { SchemaError } from '../../src/errors.js';
import type { FieldSchemaEntry } from '../../src/schema/field-schema.js';

describe('buildZodSchema (DEC-3.1)', () => {
  it('builds schema for simple required string field', () => {
    const schema = buildZodSchema({
      statement: { type: 'string', required: true },
    });
    expect(schema.parse({ statement: 'hello' })).toEqual({ statement: 'hello' });
  });

  it('rejects missing required field', () => {
    const schema = buildZodSchema({
      statement: { type: 'string', required: true },
    });
    expect(() => schema.parse({})).toThrow();
  });

  it('rejects wrong type for required field', () => {
    const schema = buildZodSchema({
      statement: { type: 'string', required: true },
    });
    expect(() => schema.parse({ statement: 123 })).toThrow();
  });

  it('allows missing optional field', () => {
    const schema = buildZodSchema({
      statement: { type: 'string' },
    });
    expect(schema.parse({})).toEqual({});
  });

  it('builds schema for number field', () => {
    const schema = buildZodSchema({
      priority: { type: 'number', required: false },
    });
    expect(schema.parse({ priority: 5 })).toEqual({ priority: 5 });
    expect(schema.parse({})).toEqual({});
  });

  it('builds schema for boolean field', () => {
    const schema = buildZodSchema({
      active: { type: 'boolean', required: true },
    });
    expect(schema.parse({ active: true })).toEqual({ active: true });
    expect(() => schema.parse({ active: 'yes' })).toThrow();
  });

  it('builds schema for reference field (D20a)', () => {
    // `reference` is structurally a string but semantically annotated
    // as an element id. The Zod schema accepts any string; renderers
    // and graph tooling branch on the declared type, not the value.
    const schema = buildZodSchema({
      governs: { type: 'reference', required: true },
    });
    expect(schema.parse({ governs: 'procedure:S1' })).toEqual({
      governs: 'procedure:S1',
    });
    expect(schema.parse({ governs: 'gvp:P3' })).toEqual({ governs: 'gvp:P3' });
    // Non-string values are rejected at the type boundary
    expect(() => schema.parse({ governs: 123 })).toThrow();
    expect(() => schema.parse({ governs: null })).toThrow();
  });

  it('builds schema for list of reference (D20a)', () => {
    // The most common shape for reference fields: a list of element
    // ids, like the existing `related` field on procedures. Under
    // D20a, this shape is declared explicitly rather than inferred
    // from data.
    const schema = buildZodSchema({
      related: {
        type: 'list',
        required: false,
        items: { type: 'reference' },
      },
    });
    expect(
      schema.parse({ related: ['procedure:S1', 'gvp:P3', 'code/common:CP1'] }),
    ).toEqual({ related: ['procedure:S1', 'gvp:P3', 'code/common:CP1'] });
    expect(schema.parse({ related: [] })).toEqual({ related: [] });
    expect(schema.parse({})).toEqual({});
    expect(() => schema.parse({ related: ['ok', 42] })).toThrow();
  });

  it('builds schema for enum field (DEC-10.11)', () => {
    const schema = buildZodSchema({
      role: { type: 'enum', values: ['defines', 'implements', 'uses', 'extends'], required: true },
    });
    expect(schema.parse({ role: 'defines' })).toEqual({ role: 'defines' });
    expect(() => schema.parse({ role: 'invalid' })).toThrow();
  });

  it('throws SchemaError for enum without values', () => {
    expect(() => buildZodSchema({
      role: { type: 'enum', required: true },
    })).toThrow(SchemaError);
  });

  it('builds schema for list with typed items (DEC-3.10)', () => {
    const schema = buildZodSchema({
      tags: { type: 'list', items: { type: 'string' } },
    });
    expect(schema.parse({ tags: ['a', 'b'] })).toEqual({ tags: ['a', 'b'] });
    expect(() => schema.parse({ tags: [1, 2] })).toThrow();
  });

  it('builds schema for untyped list (DEC-3.10)', () => {
    const schema = buildZodSchema({
      data: { type: 'list' },
    });
    expect(schema.parse({ data: [1, 'a', true] })).toEqual({ data: [1, 'a', true] });
  });

  it('builds schema for dict with typed values (DEC-3.10)', () => {
    const schema = buildZodSchema({
      metadata: { type: 'dict', values: { type: 'string' } },
    });
    expect(schema.parse({ metadata: { key: 'val' } })).toEqual({ metadata: { key: 'val' } });
    expect(() => schema.parse({ metadata: { key: 123 } })).toThrow();
  });

  it('builds schema for nested model (DEC-3.12)', () => {
    const schema = buildZodSchema({
      author: {
        type: 'model',
        required: true,
        fields: {
          name: { type: 'string', required: true },
          email: { type: 'string', required: true },
        },
      },
    });
    expect(schema.parse({ author: { name: 'Guy', email: 'guy@example.com' } }))
      .toEqual({ author: { name: 'Guy', email: 'guy@example.com' } });
    expect(() => schema.parse({ author: { name: 'Guy' } })).toThrow(); // missing email
  });

  it('throws SchemaError for model without fields', () => {
    expect(() => buildZodSchema({
      author: { type: 'model', required: true },
    })).toThrow(SchemaError);
  });

  it('builds schema for the considered pattern (dict of model)', () => {
    const schema = buildZodSchema({
      considered: {
        type: 'dict',
        required: false,
        values: {
          type: 'model',
          fields: {
            rationale: { type: 'string', required: true },
            description: { type: 'string', required: false },
          },
        },
      },
    });
    const valid = { considered: { 'Option A': { rationale: 'because' } } };
    expect(schema.parse(valid)).toEqual(valid);

    const invalid = { considered: { 'Option A': {} } };
    expect(() => schema.parse(invalid)).toThrow(); // missing required rationale
  });

  it('builds schema for the refs pattern (list of model with enum)', () => {
    const schema = buildZodSchema({
      refs: {
        type: 'list',
        required: false,
        items: {
          type: 'model',
          fields: {
            file: { type: 'string', required: true },
            identifier: { type: 'string', required: true },
            role: {
              type: 'enum',
              values: ['defines', 'implements', 'uses', 'extends'],
              required: true,
            },
          },
        },
      },
    });
    const valid = { refs: [{ file: 'src/foo.ts', identifier: 'Foo', role: 'defines' }] };
    expect(schema.parse(valid)).toEqual(valid);

    expect(() => schema.parse({ refs: [{ file: 'src/foo.ts' }] })).toThrow(); // missing fields
    expect(() => schema.parse({ refs: [{ file: 'src/foo.ts', identifier: 'Foo', role: 'invalid' }] })).toThrow();
  });

  it('builds schema for datetime field (DEC-3.4)', () => {
    const schema = buildZodSchema({
      created_at: { type: 'datetime', required: true },
    }, { defaultTimezone: 'UTC' });
    const result = schema.parse({ created_at: '2026-03-17T14:30:00Z' });
    expect(result.created_at).toBe('2026-03-17T14:30:00Z');
  });

  it('throws SchemaError for unknown type', () => {
    expect(() => buildZodSchema({
      foo: { type: 'unknown' as any, required: true },
    })).toThrow(SchemaError);
  });
});
