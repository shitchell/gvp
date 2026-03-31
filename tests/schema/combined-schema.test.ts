import { describe, it, expect } from 'vitest';
import { buildElementSchema } from '../../src/schema/combined-schema.js';
import { SchemaError } from '../../src/errors.js';

describe('buildElementSchema (DEC-3.2, DEC-3.7)', () => {
  it('validates a complete element with reserved + dynamic fields', () => {
    const schema = buildElementSchema({
      statement: { type: 'string', required: true },
    });
    const result = schema.parse({
      id: 'G1',
      name: 'Test Goal',
      statement: 'We believe in testing.',
    });
    expect(result.id).toBe('G1');
    expect(result.name).toBe('Test Goal');
    expect(result.statement).toBe('We believe in testing.');
    expect(result.status).toBe('active'); // default
  });

  it('rejects missing reserved field (id)', () => {
    const schema = buildElementSchema({
      statement: { type: 'string', required: true },
    });
    expect(() => schema.parse({ name: 'Test', statement: 'x' })).toThrow();
  });

  it('rejects missing required dynamic field', () => {
    const schema = buildElementSchema({
      statement: { type: 'string', required: true },
    });
    expect(() => schema.parse({ id: 'G1', name: 'Test' })).toThrow();
  });

  it('applies defaults for status, tags, maps_to', () => {
    const schema = buildElementSchema({});
    const result = schema.parse({ id: 'G1', name: 'Test' });
    expect(result.status).toBe('active');
    expect(result.tags).toEqual([]);
    expect(result.maps_to).toEqual([]);
  });

  it('throws SchemaError if field_schemas collides with reserved field', () => {
    expect(() => buildElementSchema({
      id: { type: 'string', required: true },
    })).toThrow(SchemaError);
  });

  it('throws SchemaError for maps_to collision', () => {
    expect(() => buildElementSchema({
      maps_to: { type: 'list' },
    })).toThrow(SchemaError);
  });

  it('validates optional dynamic fields', () => {
    const schema = buildElementSchema({
      considered: {
        type: 'dict',
        required: false,
        values: {
          type: 'model',
          fields: {
            rationale: { type: 'string', required: true },
          },
        },
      },
    });
    // Without considered — OK
    const withoutConsidered = schema.parse({ id: 'D1', name: 'Test Decision' });
    expect(withoutConsidered.id).toBe('D1');

    // With valid considered — OK
    const withConsidered = schema.parse({
      id: 'D1',
      name: 'Test Decision',
      considered: { 'Option A': { rationale: 'because' } },
    });
    expect(withConsidered.considered).toBeDefined();
  });

  it('validates with refs pattern (list of model with enum)', () => {
    const schema = buildElementSchema({
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
    const result = schema.parse({
      id: 'D1',
      name: 'Test',
      refs: [{ file: 'src/foo.ts', identifier: 'Foo', role: 'defines' }],
    });
    expect(result.refs).toHaveLength(1);
  });

  it('preserves extra unknown fields (passthrough)', () => {
    const schema = buildElementSchema({});
    const result = schema.parse({
      id: 'G1',
      name: 'Test',
      custom_field: 'hello',
    });
    expect(result.custom_field).toBe('hello');
  });
});
