import { describe, it, expect } from 'vitest';
import { parseReference } from '../../src/inheritance/reference-parser.js';

describe('Reference Parser (DEC-1.1c)', () => {
  describe('1-segment (same document)', () => {
    it('parses bare element ID', () => {
      const ref = parseReference('V1');
      expect(ref).toEqual({ element: 'V1', segmentCount: 1 });
    });
  });

  describe('2-segment (same library)', () => {
    it('parses document:element', () => {
      const ref = parseReference('values:V1');
      expect(ref).toEqual({ document: 'values', element: 'V1', segmentCount: 2 });
    });

    it('handles document path with slash', () => {
      const ref = parseReference('config/defaults:V1');
      expect(ref).toEqual({ document: 'config/defaults', element: 'V1', segmentCount: 2 });
    });
  });

  describe('3-segment (cross-library)', () => {
    it('parses source:document:element with alias', () => {
      const ref = parseReference('org:values:V1');
      expect(ref).toEqual({ source: 'org', document: 'values', element: 'V1', segmentCount: 3 });
    });

    it('parses @github source', () => {
      const ref = parseReference('@github:company/org-gvp:values:V1');
      expect(ref.source).toBe('@github:company/org-gvp');
      expect(ref.document).toBe('values');
      expect(ref.element).toBe('V1');
      expect(ref.segmentCount).toBe(3);
    });

    it('parses @azure source', () => {
      const ref = parseReference('@azure:org/project:decisions:D1');
      expect(ref.source).toBe('@azure:org/project');
      expect(ref.document).toBe('decisions');
      expect(ref.element).toBe('D1');
      expect(ref.segmentCount).toBe(3);
    });

    it('parses @local source', () => {
      const ref = parseReference('@local:values:V1');
      expect(ref.source).toBe('@local');
      expect(ref.document).toBe('values');
      expect(ref.element).toBe('V1');
      expect(ref.segmentCount).toBe(3);
    });
  });
});
