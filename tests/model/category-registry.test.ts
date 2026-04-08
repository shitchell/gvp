import { describe, it, expect } from 'vitest';
import { CategoryRegistry } from '../../src/model/category-registry.js';
import { loadDefaults } from '../../src/schema/defaults-loader.js';

describe('CategoryRegistry', () => {
  const defaults = loadDefaults();
  const registry = CategoryRegistry.fromDefaults(defaults);

  describe('lookup', () => {
    it('has 9 core categories', () => {
      expect(registry.categoryNames).toHaveLength(9);
    });

    it('getByName returns category definition', () => {
      const goal = registry.getByName('goal');
      expect(goal).toBeDefined();
      expect(goal!.yaml_key).toBe('goals');
      expect(goal!.id_prefix).toBe('G');
    });

    it('getByName returns undefined for unknown', () => {
      expect(registry.getByName('unknown')).toBeUndefined();
    });

    it('getByYamlKey returns name and definition', () => {
      const result = registry.getByYamlKey('decisions');
      expect(result).toBeDefined();
      expect(result!.name).toBe('decision');
      expect(result!.def.id_prefix).toBe('D');
    });

    it('getByIdPrefix returns name and definition', () => {
      const result = registry.getByIdPrefix('C');
      expect(result).toBeDefined();
      expect(result!.name).toBe('constraint');
    });

    it('allYamlKeys returns all yaml keys', () => {
      const keys = registry.allYamlKeys;
      expect(keys).toContain('goals');
      expect(keys).toContain('values');
      expect(keys).toContain('decisions');
      expect(keys).toContain('procedures');
      expect(keys).toHaveLength(9);
    });
  });

  describe('getElementSchema', () => {
    it('returns Zod schema for a category', () => {
      const schema = registry.getElementSchema('goal');
      const result = schema.parse({
        id: 'G1', name: 'Test Goal', statement: 'We will test.',
      });
      expect(result.id).toBe('G1');
    });

    it('schema validates required fields', () => {
      const schema = registry.getElementSchema('goal');
      expect(() => schema.parse({ name: 'No ID' })).toThrow();
    });

    it('caches schemas (same object returned)', () => {
      const s1 = registry.getElementSchema('goal');
      const s2 = registry.getElementSchema('goal');
      expect(s1).toBe(s2);
    });

    it('throws for unknown category', () => {
      expect(() => registry.getElementSchema('unknown')).toThrow();
    });

    it('decision schema validates considered field', () => {
      const schema = registry.getElementSchema('decision');
      const result = schema.parse({
        id: 'D1', name: 'Test', rationale: 'Because.',
        considered: { 'Alt A': { rationale: 'reason' } },
      });
      expect(result.considered).toBeDefined();
    });
  });

  describe('merge', () => {
    it('adds new categories', () => {
      const merged = registry.merge({
        custom: { yaml_key: 'customs', id_prefix: 'CU', primary_field: 'description' },
      });
      expect(merged.categoryNames).toHaveLength(10);
      expect(merged.getByName('custom')).toBeDefined();
    });

    it('overrides existing categories on collision', () => {
      const merged = registry.merge({
        goal: { yaml_key: 'goals', id_prefix: 'G', primary_field: 'description', color: '#000000' },
      });
      expect(merged.getByName('goal')!.color).toBe('#000000');
    });

    it('preserves original registry (immutable)', () => {
      registry.merge({
        custom: { yaml_key: 'customs', id_prefix: 'CU' },
      });
      expect(registry.categoryNames).toHaveLength(9); // Original unchanged (9 core)
    });
  });
});
