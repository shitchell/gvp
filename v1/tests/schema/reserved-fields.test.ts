import { describe, it, expect } from 'vitest';
import {
  RESERVED_FIELD_NAMES,
  isReservedField,
  checkReservedFieldCollision,
  reservedFieldsSchema,
} from '../../src/schema/reserved-fields.js';
import { SchemaError } from '../../src/errors.js';

describe('Reserved Fields (DEC-3.2, DEC-3.7, DEC-8.11)', () => {
  describe('RESERVED_FIELD_NAMES', () => {
    it('contains exactly 9 fields', () => {
      expect(RESERVED_FIELD_NAMES.size).toBe(9);
    });

    it('contains all expected fields', () => {
      const expected = ['id', 'name', 'status', 'tags', 'maps_to', 'origin', 'updated_by', 'reviewed_by', 'priority'];
      for (const field of expected) {
        expect(RESERVED_FIELD_NAMES.has(field)).toBe(true);
      }
    });
  });

  describe('isReservedField', () => {
    it('returns true for reserved fields', () => {
      expect(isReservedField('id')).toBe(true);
      expect(isReservedField('maps_to')).toBe(true);
      expect(isReservedField('priority')).toBe(true);
    });

    it('returns false for non-reserved fields', () => {
      expect(isReservedField('statement')).toBe(false);
      expect(isReservedField('rationale')).toBe(false);
      expect(isReservedField('considered')).toBe(false);
    });
  });

  describe('checkReservedFieldCollision', () => {
    it('throws SchemaError for reserved field in field_schemas', () => {
      expect(() => checkReservedFieldCollision({
        id: { type: 'string', required: true },
      })).toThrow(SchemaError);
    });

    it('throws SchemaError for maps_to in field_schemas', () => {
      expect(() => checkReservedFieldCollision({
        maps_to: { type: 'list' },
      })).toThrow(SchemaError);
    });

    it('does not throw for non-reserved fields', () => {
      expect(() => checkReservedFieldCollision({
        statement: { type: 'string', required: true },
        considered: { type: 'dict' },
      })).not.toThrow();
    });

    it('error message includes the offending field name', () => {
      try {
        checkReservedFieldCollision({ id: { type: 'string' } });
      } catch (e) {
        expect((e as Error).message).toContain("'id'");
        expect((e as Error).message).toContain('reserved');
      }
    });
  });

  describe('reservedFieldsSchema', () => {
    it('validates minimal element with id and name', () => {
      const result = reservedFieldsSchema.parse({ id: 'G1', name: 'Test Goal' });
      expect(result.id).toBe('G1');
      expect(result.name).toBe('Test Goal');
    });

    it('applies default status of active (DEC-8.11)', () => {
      const result = reservedFieldsSchema.parse({ id: 'G1', name: 'Test' });
      expect(result.status).toBe('active');
    });

    it('applies default empty arrays for tags and maps_to', () => {
      const result = reservedFieldsSchema.parse({ id: 'G1', name: 'Test' });
      expect(result.tags).toEqual([]);
      expect(result.maps_to).toEqual([]);
    });

    it('accepts explicit status', () => {
      const result = reservedFieldsSchema.parse({ id: 'G1', name: 'Test', status: 'deprecated' });
      expect(result.status).toBe('deprecated');
    });

    it('accepts priority as number', () => {
      const result = reservedFieldsSchema.parse({ id: 'G1', name: 'Test', priority: 1 });
      expect(result.priority).toBe(1);
    });

    it('rejects priority as string', () => {
      expect(() => reservedFieldsSchema.parse({ id: 'G1', name: 'Test', priority: 'high' })).toThrow();
    });

    it('rejects missing id', () => {
      expect(() => reservedFieldsSchema.parse({ name: 'Test' })).toThrow();
    });

    it('rejects missing name', () => {
      expect(() => reservedFieldsSchema.parse({ id: 'G1' })).toThrow();
    });

    it('accepts provenance placeholders', () => {
      const result = reservedFieldsSchema.parse({
        id: 'G1',
        name: 'Test',
        origin: [{ date: '2026-03-17' }],
        updated_by: [],
        reviewed_by: [],
      });
      expect(result.origin).toHaveLength(1);
    });
  });
});
