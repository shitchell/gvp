import { describe, it, expect } from 'vitest';
import { createExporterRegistry } from '../../src/exporters/registry.js';

describe('CLI', () => {
  describe('Exporter Registry', () => {
    it('has json, csv, markdown exporters', () => {
      const registry = createExporterRegistry();
      expect(registry.has('json')).toBe(true);
      expect(registry.has('csv')).toBe(true);
      expect(registry.has('markdown')).toBe(true);
    });

    it('does not have optional exporters (sqlite, dot)', () => {
      const registry = createExporterRegistry();
      expect(registry.has('sqlite')).toBe(false);
      expect(registry.has('dot')).toBe(false);
    });
  });
});
