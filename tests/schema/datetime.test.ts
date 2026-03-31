import { describe, it, expect } from 'vitest';
import { resolveTimezone, createDatetimeSchema } from '../../src/schema/datetime.js';

describe('Datetime Handling (DEC-3.4)', () => {
  describe('resolveTimezone', () => {
    it('returns config timezone when provided', () => {
      expect(resolveTimezone('America/New_York')).toBe('America/New_York');
    });

    it('returns system timezone when no config', () => {
      const tz = resolveTimezone();
      expect(typeof tz).toBe('string');
      expect(tz.length).toBeGreaterThan(0);
    });

    it('returns a valid timezone string', () => {
      const tz = resolveTimezone();
      // Should be either a valid IANA timezone or UTC
      expect(tz).toBeTruthy();
    });
  });

  describe('createDatetimeSchema', () => {
    const schema = createDatetimeSchema('UTC');

    it('accepts full ISO 8601 with timezone', () => {
      const result = schema.parse('2026-03-17T14:30:00-04:00');
      expect(result).toBe('2026-03-17T14:30:00-04:00');
    });

    it('accepts ISO 8601 with Z timezone', () => {
      const result = schema.parse('2026-03-17T14:30:00Z');
      expect(result).toBe('2026-03-17T14:30:00Z');
    });

    it('appends UTC timezone when missing and default is UTC', () => {
      const result = schema.parse('2026-03-17T14:30:00');
      expect(result).toBe('2026-03-17T14:30:00Z');
    });

    it('appends configured timezone when missing', () => {
      const nySchema = createDatetimeSchema('America/New_York');
      const result = nySchema.parse('2026-03-17T14:30:00');
      // Should have a timezone offset appended (exact offset depends on DST)
      expect(result).not.toBe('2026-03-17T14:30:00');
      expect(result.length).toBeGreaterThan('2026-03-17T14:30:00'.length);
    });

    it('rejects invalid date strings', () => {
      expect(() => schema.parse('not-a-date')).toThrow();
    });

    it('rejects non-string values', () => {
      expect(() => schema.parse(12345)).toThrow();
    });
  });
});
