import { describe, it, expect } from 'vitest';

describe('gvp add (CMD-4)', () => {
  describe('nextId generation', () => {
    function nextId(prefix: string, existingIds: string[]): string {
      const maxNum = existingIds.reduce((max, id) => {
        const num = parseInt(id.replace(prefix, ''), 10);
        return isNaN(num) ? max : Math.max(max, num);
      }, 0);
      return `${prefix}${maxNum + 1}`;
    }

    it('generates correct sequential ID from contiguous set', () => {
      expect(nextId('G', ['G1', 'G2', 'G3'])).toBe('G4');
    });

    it('skips gaps and uses max+1 (DEC-9.5)', () => {
      // Gap at 3,4 — should still produce G6, not fill gaps
      expect(nextId('G', ['G1', 'G2', 'G5'])).toBe('G6');
    });

    it('handles empty list', () => {
      expect(nextId('V', [])).toBe('V1');
    });

    it('ignores non-numeric IDs', () => {
      expect(nextId('D', ['D1', 'Dfoo', 'D3'])).toBe('D4');
    });

    it('works with multi-char prefix', () => {
      expect(nextId('DEC-', ['DEC-1', 'DEC-2'])).toBe('DEC-3');
    });
  });

  describe('field parsing', () => {
    function parseField(entry: string): { key: string; value: unknown } | null {
      const eqIdx = entry.indexOf('=');
      if (eqIdx <= 0) return null;
      const key = entry.substring(0, eqIdx);
      const rawValue = entry.substring(eqIdx + 1);
      let value: unknown;
      try { value = JSON.parse(rawValue); } catch { value = rawValue; }
      return { key, value };
    }

    it('parses simple string field', () => {
      expect(parseField('description=A cool goal')).toEqual({
        key: 'description',
        value: 'A cool goal',
      });
    });

    it('parses JSON array field', () => {
      expect(parseField('tags=["alpha","beta"]')).toEqual({
        key: 'tags',
        value: ['alpha', 'beta'],
      });
    });

    it('parses numeric field', () => {
      expect(parseField('priority=3')).toEqual({
        key: 'priority',
        value: 3,
      });
    });

    it('handles value with equals sign', () => {
      expect(parseField('description=x=y')).toEqual({
        key: 'description',
        value: 'x=y',
      });
    });

    it('rejects entry with no key', () => {
      expect(parseField('=value')).toBeNull();
    });
  });
});
