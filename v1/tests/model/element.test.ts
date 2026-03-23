import { describe, it, expect } from 'vitest';
import { Element } from '../../src/model/element.js';

describe('Element (DEC-6.2, DEC-6.3, DEC-6.4)', () => {
  const makeElement = (overrides: Partial<Record<string, unknown>> = {}) => new Element(
    { id: 'V1', name: 'Alignment', status: 'active', tags: ['framework'], maps_to: ['gvp:G1'], ...overrides },
    'value',
    '@github:company/org-gvp',
    'values',
  );

  describe('toString (DEC-6.4)', () => {
    it('returns id: "name" format', () => {
      expect(makeElement().toString()).toBe('V1: "Alignment"');
    });
  });

  describe('toLibraryId (DEC-6.4)', () => {
    it('returns documentPath:id format', () => {
      expect(makeElement().toLibraryId()).toBe('values:V1');
    });
  });

  describe('toCanonicalId (DEC-6.4)', () => {
    it('returns source:documentPath:id format', () => {
      expect(makeElement().toCanonicalId()).toBe('@github:company/org-gvp:values:V1');
    });
  });

  describe('hashKey (DEC-6.2)', () => {
    it('matches canonical ID', () => {
      const el = makeElement();
      expect(el.hashKey()).toBe(el.toCanonicalId());
    });

    it('is consistent for equal elements', () => {
      const a = makeElement();
      const b = makeElement();
      expect(a.hashKey()).toBe(b.hashKey());
    });
  });

  describe('equals (DEC-6.2)', () => {
    it('returns true for same (source, documentPath, id)', () => {
      const a = makeElement();
      const b = makeElement();
      expect(a.equals(b)).toBe(true);
    });

    it('returns false for different id', () => {
      const a = makeElement();
      const b = makeElement({ id: 'V2' });
      expect(a.equals(b)).toBe(false);
    });

    it('returns false for different source', () => {
      const a = makeElement();
      const b = new Element(
        { id: 'V1', name: 'Alignment', status: 'active' },
        'value', '@github:other/repo', 'values',
      );
      expect(a.equals(b)).toBe(false);
    });

    it('returns false for different documentPath', () => {
      const a = makeElement();
      const b = new Element(
        { id: 'V1', name: 'Alignment', status: 'active' },
        'value', '@github:company/org-gvp', 'other-doc',
      );
      expect(a.equals(b)).toBe(false);
    });
  });

  describe('priority (DEC-6.3)', () => {
    it('does not affect equality', () => {
      const a = makeElement({ priority: 1 });
      const b = makeElement({ priority: 99 });
      expect(a.equals(b)).toBe(true);
    });

    it('is accessible as a property', () => {
      expect(makeElement({ priority: 5 }).priority).toBe(5);
      expect(makeElement().priority).toBeUndefined();
    });
  });

  describe('dynamic fields', () => {
    it('get() returns dynamic field values', () => {
      const el = makeElement({ statement: 'We believe in alignment.' });
      expect(el.get('statement')).toBe('We believe in alignment.');
    });

    it('get() returns undefined for missing fields', () => {
      expect(makeElement().get('nonexistent')).toBeUndefined();
    });

    it('data returns a copy of all fields', () => {
      const el = makeElement({ statement: 'test' });
      const data = el.data;
      expect(data.id).toBe('V1');
      expect(data.statement).toBe('test');
    });
  });

  describe('defaults', () => {
    it('defaults status to active', () => {
      const el = new Element(
        { id: 'G1', name: 'Test' },
        'goal', '@local', 'doc',
      );
      expect(el.status).toBe('active');
    });

    it('defaults tags and maps_to to empty arrays', () => {
      const el = new Element(
        { id: 'G1', name: 'Test' },
        'goal', '@local', 'doc',
      );
      expect(el.tags).toEqual([]);
      expect(el.maps_to).toEqual([]);
    });
  });
});
