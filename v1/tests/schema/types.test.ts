import { describe, it, expect } from 'vitest';
import { FIELD_TYPES, isFieldType, FieldType } from '../../src/schema/types.js';

describe('Type Map (DEC-3.4, DEC-10.11)', () => {
  it('contains exactly 8 field types', () => {
    expect(FIELD_TYPES).toHaveLength(8);
  });

  it('contains all required types', () => {
    const expected: FieldType[] = ['string', 'number', 'boolean', 'list', 'dict', 'model', 'datetime', 'enum'];
    for (const type of expected) {
      expect(FIELD_TYPES).toContain(type);
    }
  });

  it('is frozen', () => {
    expect(Object.isFrozen(FIELD_TYPES)).toBe(true);
  });

  it('isFieldType returns true for valid types', () => {
    for (const type of FIELD_TYPES) {
      expect(isFieldType(type)).toBe(true);
    }
  });

  it('isFieldType returns false for invalid types', () => {
    expect(isFieldType('foo')).toBe(false);
    expect(isFieldType('date')).toBe(false);
    expect(isFieldType('integer')).toBe(false);
    expect(isFieldType('')).toBe(false);
  });
});
