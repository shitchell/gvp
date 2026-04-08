import { describe, it, expect } from 'vitest';
import {
  loadDefaults,
  mergeAllFieldSchemas,
  buildCategoryElementSchema,
} from '../../src/schema/defaults-loader.js';
import type { FieldSchemaEntry } from '../../src/schema/field-schema.js';

describe('Defaults Loader (DEC-9.4)', () => {
  describe('loadDefaults', () => {
    it('loads and validates defaults.yaml', () => {
      const defaults = loadDefaults();
      expect(Object.keys(defaults.categories)).toHaveLength(9);
      expect(defaults._all?.field_schemas).toHaveProperty('priority');
      expect(defaults._all?.field_schemas).toHaveProperty('refs');
    });

    it('returns typed CategoryDefinition objects', () => {
      const defaults = loadDefaults();
      const goal = defaults.categories.goal;
      expect(goal).toBeDefined();
      expect(goal!.yaml_key).toBe('goals');
      expect(goal!.id_prefix).toBe('G');
      expect(goal!.is_root).toBe(true);
    });
  });

  describe('mergeAllFieldSchemas (DEC-2.8)', () => {
    const allSchemas: Record<string, FieldSchemaEntry> = {
      priority: { type: 'number', required: false },
      refs: { type: 'list', required: false },
    };

    it('returns _all schemas when no category schemas', () => {
      const merged = mergeAllFieldSchemas(allSchemas, undefined);
      expect(merged).toHaveProperty('priority');
      expect(merged).toHaveProperty('refs');
    });

    it('merges category schemas on top of _all', () => {
      const catSchemas: Record<string, FieldSchemaEntry> = {
        statement: { type: 'string', required: true },
      };
      const merged = mergeAllFieldSchemas(allSchemas, catSchemas);
      expect(merged).toHaveProperty('priority');
      expect(merged).toHaveProperty('refs');
      expect(merged).toHaveProperty('statement');
    });

    it('per-category wins on collision (DEC-2.8)', () => {
      const catSchemas: Record<string, FieldSchemaEntry> = {
        refs: { type: 'list', required: true }, // Override: make refs required
      };
      const merged = mergeAllFieldSchemas(allSchemas, catSchemas);
      expect(merged.refs!.required).toBe(true); // Category override wins
    });
  });

  describe('buildCategoryElementSchema', () => {
    it('builds schema for goal category', () => {
      const defaults = loadDefaults();
      const allFieldSchemas = defaults._all?.field_schemas ?? {};
      const goalDef = defaults.categories.goal!;

      const schema = buildCategoryElementSchema(goalDef, allFieldSchemas);

      // Should validate a goal element with _all fields available
      const result = schema.parse({
        id: 'G1',
        name: 'Test Goal',
        statement: 'We believe in testing.',
      });
      expect(result.id).toBe('G1');
      expect(result.status).toBe('active');
    });

    it('builds schema for decision category with considered', () => {
      const defaults = loadDefaults();
      const allFieldSchemas = defaults._all?.field_schemas ?? {};
      const decisionDef = defaults.categories.decision!;

      const schema = buildCategoryElementSchema(decisionDef, allFieldSchemas);

      // Decision with considered alternatives
      const result = schema.parse({
        id: 'D1',
        name: 'Use TypeScript',
        rationale: 'Type safety and ecosystem.',
        considered: {
          'Python': { rationale: 'Already have v0 in Python, but TS is better for npm distribution.' },
        },
      });
      expect(result.id).toBe('D1');
      expect(result.considered).toBeDefined();
    });

    it('rejects invalid considered structure', () => {
      const defaults = loadDefaults();
      const allFieldSchemas = defaults._all?.field_schemas ?? {};
      const decisionDef = defaults.categories.decision!;

      const schema = buildCategoryElementSchema(decisionDef, allFieldSchemas);

      expect(() => schema.parse({
        id: 'D1',
        name: 'Test',
        rationale: 'test',
        considered: {
          'Option A': {}, // Missing required 'rationale'
        },
      })).toThrow();
    });

    it('includes _all fields (priority, refs) on all categories', () => {
      const defaults = loadDefaults();
      const allFieldSchemas = defaults._all?.field_schemas ?? {};

      // Check that priority and refs work on a principle (non-decision category)
      const principleDef = defaults.categories.principle!;
      const schema = buildCategoryElementSchema(principleDef, allFieldSchemas);

      const result = schema.parse({
        id: 'P1',
        name: 'Test Principle',
        statement: 'Always test.',
        priority: 1,
        refs: [{ file: 'src/foo.ts', identifier: 'Foo', role: 'defines' }],
      });
      expect(result.priority).toBe(1);
      expect(result.refs).toHaveLength(1);
    });
  });
});
