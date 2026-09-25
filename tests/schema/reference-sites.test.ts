import { describe, it, expect } from 'vitest';
import { collectReferenceSites, declaredReferencePaths } from '../../src/schema/reference-sites.js';
import { loadDefaults, mergeAllFieldSchemas } from '../../src/schema/defaults-loader.js';
import type { FieldSchemaEntry } from '../../src/schema/field-schema.js';

/**
 * The reference-site walker is the single source of truth shared by the
 * importer's pseudo-ID rewrite and the validator's E001 check (#22). These
 * tests pin the two properties that keep them from drifting apart again:
 * it is derived purely from the declared schemas, and it reaches every
 * reference-bearing path those schemas declare.
 */
describe('collectReferenceSites', () => {
  const schemas: Record<string, FieldSchemaEntry> = {
    related: { type: 'list', items: { type: 'reference' } },
    steps: {
      type: 'list',
      items: {
        type: 'model',
        fields: {
          id: { type: 'string' },
          name: { type: 'string' },
          maps_to: { type: 'list', items: { type: 'reference' } },
        },
      },
    },
    considered: {
      type: 'dict',
      values: {
        type: 'model',
        fields: {
          rationale: { type: 'string' },
          would_have_served: { type: 'list', items: { type: 'reference' } },
          conflicts_with: { type: 'list', items: { type: 'reference' } },
        },
      },
    },
  };

  it('finds the reserved element-level maps_to, which no schema declares', () => {
    const sites = collectReferenceSites({ id: 'D1', maps_to: ['a:G1'] }, {});
    expect(sites).toHaveLength(1);
    expect(sites[0]!.location).toBe('maps_to');
    expect(sites[0]!.detailsKey).toBeUndefined();
  });

  it('finds top-level list<reference> fields', () => {
    const sites = collectReferenceSites({ related: ['a:S1'] }, schemas);
    expect(sites.map(s => s.location)).toEqual(['related']);
    expect(sites[0]!.detailsKey).toBe('related');
  });

  it('finds list<reference> sub-fields inside list<model> items', () => {
    const data = { steps: [{ id: 'S1.1', maps_to: ['a:G1'] }] };
    const sites = collectReferenceSites(data, schemas);
    expect(sites.map(s => s.location)).toEqual(["steps.maps_to ('S1.1')"]);
    expect(sites[0]!.detailsKey).toBe('steps:S1.1');
  });

  it('finds list<reference> sub-fields inside dict<model> values — the #22 gap', () => {
    const data = {
      considered: {
        'Stored streak counter': {
          would_have_served: ['?g_streaks'],
          conflicts_with: ['?v_honest'],
        },
      },
    };
    const sites = collectReferenceSites(data, schemas);
    expect(sites.map(s => s.location)).toEqual([
      "considered.would_have_served ('Stored streak counter')",
      "considered.conflicts_with ('Stored streak counter')",
    ]);
    expect(sites.map(s => s.detailsKey)).toEqual([
      'considered:Stored streak counter',
      'considered:Stored streak counter',
    ]);
  });

  it('exposes the owning record so callers can rewrite the array in place', () => {
    const data = {
      considered: { Alt: { would_have_served: ['?g'] } },
    };
    for (const site of collectReferenceSites(data, schemas)) {
      site.owner[site.field] = site.refs.map(() => 'main:G2');
    }
    expect(data.considered.Alt.would_have_served).toEqual(['main:G2']);
  });

  it('skips absent, null, and wrong-shaped containers without throwing', () => {
    expect(collectReferenceSites({}, schemas)).toEqual([]);
    expect(collectReferenceSites({ considered: null, steps: 'nope', related: 3 }, schemas)).toEqual([]);
    expect(collectReferenceSites({ considered: { Alt: null } }, schemas)).toEqual([]);
  });

  it('labels unnamed list<model> items by 1-based index', () => {
    const data = { steps: [{ maps_to: ['a:G1'] }] };
    expect(collectReferenceSites(data, schemas)[0]!.location).toBe("steps.maps_to ('1')");
  });
});

describe('walker coverage of the shipped defaults', () => {
  const defaults = loadDefaults();

  /** Populate every declared reference path with a sentinel value. */
  function fullyPopulate(
    fieldSchemas: Record<string, FieldSchemaEntry>,
  ): Record<string, unknown> {
    const data: Record<string, unknown> = { id: 'X1', maps_to: ['sentinel'] };
    const build = (schema: FieldSchemaEntry): unknown => {
      if (schema.type === 'list' && schema.items) {
        if (schema.items.type === 'reference') return ['sentinel'];
        if (schema.items.type === 'model') return [buildModel(schema.items)];
        return [];
      }
      if (schema.type === 'dict' && schema.values && !Array.isArray(schema.values)) {
        if (schema.values.type === 'model') return { Alt: buildModel(schema.values) };
        return {};
      }
      return undefined;
    };
    const buildModel = (schema: FieldSchemaEntry): Record<string, unknown> => {
      const out: Record<string, unknown> = {};
      for (const [name, sub] of Object.entries(schema.fields ?? {})) {
        const v = build(sub);
        if (v !== undefined) out[name] = v;
      }
      return out;
    };
    for (const [name, schema] of Object.entries(fieldSchemas)) {
      const v = build(schema);
      if (v !== undefined) data[name] = v;
    }
    return data;
  }

  const allSchemas = defaults._all?.field_schemas ?? {};

  for (const [categoryName, catDef] of Object.entries(defaults.categories)) {
    it(`reaches every reference path declared for '${categoryName}'`, () => {
      const merged = mergeAllFieldSchemas(allSchemas, catDef.field_schemas);
      const declared = declaredReferencePaths(merged).length;
      const found = collectReferenceSites(fullyPopulate(merged), merged).length;
      // If these disagree, a reference-bearing container shape exists in the
      // schemas that the walker does not understand — exactly the class of bug
      // that let #22 ship. Teach collectReferenceSites the shape.
      expect(found).toBe(declared);
    });
  }

  it('knows the decision category carries the two considered.* tradeoff links', () => {
    const decision = defaults.categories.decision!;
    const merged = mergeAllFieldSchemas(allSchemas, decision.field_schemas);
    expect(declaredReferencePaths(merged)).toEqual(
      expect.arrayContaining([
        'maps_to',
        'considered{}.would_have_served',
        'considered{}.conflicts_with',
      ]),
    );
  });
});
