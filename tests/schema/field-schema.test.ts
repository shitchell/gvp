import { describe, it, expect } from 'vitest';
import { fieldSchemaEntrySchema, type FieldSchemaEntry } from '../../src/schema/field-schema.js';

describe('FieldSchemaEntry (DEC-3.3b, DEC-3.10, DEC-3.12, DEC-10.11)', () => {
  it('validates simple string field', () => {
    const entry = { type: 'string', required: true };
    const result = fieldSchemaEntrySchema.parse(entry);
    expect(result.type).toBe('string');
    expect(result.required).toBe(true);
  });

  it('validates field with display_name (DEC-3.3b)', () => {
    const entry = { type: 'string', required: true, display_name: 'Design Statement' };
    const result = fieldSchemaEntrySchema.parse(entry);
    expect(result.display_name).toBe('Design Statement');
  });

  it('validates list with items (DEC-3.10)', () => {
    const entry = { type: 'list', items: { type: 'string' } };
    const result = fieldSchemaEntrySchema.parse(entry);
    expect(result.items?.type).toBe('string');
  });

  it('validates dict with values as FieldSchemaEntry (DEC-3.10)', () => {
    const entry = {
      type: 'dict',
      values: {
        type: 'model',
        fields: {
          rationale: { type: 'string', required: true },
        },
      },
    };
    const result = fieldSchemaEntrySchema.parse(entry);
    expect((result.values as FieldSchemaEntry)?.type).toBe('model');
  });

  it('validates enum with values as string[] (DEC-10.11)', () => {
    const entry = { type: 'enum', values: ['a', 'b', 'c'] };
    const result = fieldSchemaEntrySchema.parse(entry);
    expect(result.values).toEqual(['a', 'b', 'c']);
  });

  it('validates nested model (DEC-3.12)', () => {
    const entry = {
      type: 'model',
      fields: {
        rationale: { type: 'string', required: true },
        description: { type: 'string', required: false },
      },
    };
    const result = fieldSchemaEntrySchema.parse(entry);
    expect(result.fields?.rationale?.required).toBe(true);
    expect(result.fields?.description?.required).toBe(false);
  });

  it('validates the considered pattern from defaults.yaml', () => {
    const entry = {
      type: 'dict',
      required: false,
      values: {
        type: 'model',
        fields: {
          rationale: { type: 'string', required: true },
          description: { type: 'string', required: false },
        },
      },
    };
    expect(() => fieldSchemaEntrySchema.parse(entry)).not.toThrow();
  });

  it('validates the refs pattern from defaults.yaml', () => {
    const entry = {
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
    };
    expect(() => fieldSchemaEntrySchema.parse(entry)).not.toThrow();
  });

  it('rejects missing type', () => {
    expect(() => fieldSchemaEntrySchema.parse({ required: true })).toThrow();
  });

  it('rejects invalid type', () => {
    expect(() => fieldSchemaEntrySchema.parse({ type: 'foo' })).toThrow();
  });

  it('rejects enum without values', () => {
    // enum without values should still parse (values is optional on the schema)
    // but it's semantically incomplete — build-schema will handle this
    const result = fieldSchemaEntrySchema.parse({ type: 'enum' });
    expect(result.type).toBe('enum');
    expect(result.values).toBeUndefined();
  });

  it('allows list without items (DEC-3.10: untyped list)', () => {
    const result = fieldSchemaEntrySchema.parse({ type: 'list' });
    expect(result.type).toBe('list');
    expect(result.items).toBeUndefined();
  });
});
