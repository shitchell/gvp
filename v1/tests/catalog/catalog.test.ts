import { describe, it, expect } from 'vitest';
import { Catalog } from '../../src/catalog/catalog.js';
import { mergeDefinitions } from '../../src/catalog/category-merger.js';
import { validateMergedCategories } from '../../src/catalog/post-merge-validation.js';
import { Document } from '../../src/model/document.js';
import { Element } from '../../src/model/element.js';
import type { DocumentMeta } from '../../src/model/document-meta.js';
import type { ResolvedInheritance } from '../../src/inheritance/inheritance-resolver.js';
import { resolveInheritance } from '../../src/inheritance/inheritance-resolver.js';
import type { GVPConfig } from '../../src/config/schema.js';
import type { CategoryDefinition } from '../../src/schema/category-definition.js';
import {
  CatalogError,
  DuplicateIdPrefixError,
  DuplicateYamlKeyError,
  InvalidMappingRuleRefError,
  SchemaError,
} from '../../src/errors.js';

/** Default minimal config */
const defaultConfig: GVPConfig = {
  strict: false,
  suppress_diagnostics: [],
  strict_export_options: true,
  validation_rules: [],
};

/** Helper: create a Document with optional elements and definitions */
function makeDoc(
  documentPath: string,
  opts: {
    source?: string;
    inherits?: DocumentMeta['inherits'];
    elements?: Array<{ categoryName: string; data: Record<string, unknown> }>;
    definitions?: DocumentMeta['definitions'];
  } = {},
): Document {
  const source = opts.source ?? '@local';
  const meta: DocumentMeta = {
    name: documentPath,
    ...(opts.inherits ? { inherits: opts.inherits } : {}),
    ...(opts.definitions ? { definitions: opts.definitions } : {}),
  };

  const elementsByCategory = new Map<string, Element[]>();
  if (opts.elements) {
    for (const el of opts.elements) {
      const element = new Element(el.data, el.categoryName, source, documentPath);
      const existing = elementsByCategory.get(el.categoryName) ?? [];
      existing.push(element);
      elementsByCategory.set(el.categoryName, existing);
    }
  }

  return new Document(
    meta,
    elementsByCategory,
    `/${documentPath}.yaml`,
    documentPath,
    source,
  );
}

/** Helper: build ResolvedInheritance for a single document (no inheritance) */
function singleDocResolved(doc: Document): ResolvedInheritance {
  return {
    orderedDocuments: [doc],
    aliasMap: new Map(),
    sccs: [],
  };
}

describe('Catalog', () => {
  it('constructs from a single document with no inheritance', () => {
    const doc = makeDoc('main', {
      elements: [
        { categoryName: 'goal', data: { id: 'G1', name: 'Be great', status: 'active' } },
        { categoryName: 'value', data: { id: 'V1', name: 'Integrity', status: 'active' } },
      ],
    });

    const catalog = new Catalog(singleDocResolved(doc), defaultConfig);
    expect(catalog.getAllElements()).toHaveLength(2);
    expect(catalog.documents).toHaveLength(1);
  });

  it('constructs from multi-document inheritance chain', () => {
    const parent = makeDoc('parent', {
      source: '@local',
      elements: [
        { categoryName: 'goal', data: { id: 'G1', name: 'Parent goal', status: 'active' } },
      ],
    });
    const child = makeDoc('child', {
      source: '@local',
      inherits: ['parent'],
      elements: [
        { categoryName: 'value', data: { id: 'V1', name: 'Child value', status: 'active' } },
      ],
    });

    const loader = (_source: string, docPath: string) => {
      if (docPath === 'parent') return parent;
      throw new Error(`Unknown: ${docPath}`);
    };

    const resolved = resolveInheritance(child, loader);
    const catalog = new Catalog(resolved, defaultConfig);

    expect(catalog.getAllElements()).toHaveLength(2);
    expect(catalog.documents).toHaveLength(2);
  });

  it('indexes elements by category', () => {
    const doc = makeDoc('main', {
      elements: [
        { categoryName: 'goal', data: { id: 'G1', name: 'Goal 1', status: 'active' } },
        { categoryName: 'goal', data: { id: 'G2', name: 'Goal 2', status: 'active' } },
        { categoryName: 'value', data: { id: 'V1', name: 'Value 1', status: 'active' } },
      ],
    });

    const catalog = new Catalog(singleDocResolved(doc), defaultConfig);
    expect(catalog.getElementsByCategory('goal')).toHaveLength(2);
    expect(catalog.getElementsByCategory('value')).toHaveLength(1);
    expect(catalog.getElementsByCategory('nonexistent')).toHaveLength(0);
  });

  it('retrieves element by hashKey', () => {
    const doc = makeDoc('main', {
      elements: [
        { categoryName: 'goal', data: { id: 'G1', name: 'Goal 1', status: 'active' } },
      ],
    });

    const catalog = new Catalog(singleDocResolved(doc), defaultConfig);
    const el = catalog.getElement('@local:main:G1');
    expect(el).toBeDefined();
    expect(el!.name).toBe('Goal 1');
    expect(catalog.getElement('nonexistent:key:X1')).toBeUndefined();
  });

  it('registry has all 8 core categories', () => {
    const doc = makeDoc('main');
    const catalog = new Catalog(singleDocResolved(doc), defaultConfig);
    const names = catalog.registry.categoryNames;
    expect(names).toContain('goal');
    expect(names).toContain('value');
    expect(names).toContain('constraint');
    expect(names).toContain('principle');
    expect(names).toContain('rule');
    expect(names).toContain('heuristic');
    expect(names).toContain('decision');
    expect(names).toContain('milestone');
    expect(names).toHaveLength(8);
  });

  it('registry includes user-defined categories merged from documents', () => {
    const doc = makeDoc('main', {
      definitions: {
        categories: {
          custom: {
            yaml_key: 'customs',
            id_prefix: 'CU',
            mapping_rules: [['goal']],
          } as CategoryDefinition,
        },
      },
    });

    const catalog = new Catalog(singleDocResolved(doc), defaultConfig);
    const names = catalog.registry.categoryNames;
    expect(names).toContain('custom');
    expect(names.length).toBe(9); // 8 core + 1 user-defined
  });

  it('merges tag definitions from documents', () => {
    const doc = makeDoc('main', {
      definitions: {
        tags: {
          critical: { description: 'Critical priority' },
          optional: { description: 'Optional' },
        },
      },
    });

    const catalog = new Catalog(singleDocResolved(doc), defaultConfig);
    const tags = catalog.getTags();
    expect(tags.critical).toEqual({ description: 'Critical priority' });
    expect(tags.optional).toEqual({ description: 'Optional' });
  });

  it('provides library snapshots (DEC-2.12)', () => {
    const doc = makeDoc('main', {
      definitions: {
        tags: { important: { description: 'Important stuff' } },
      },
    });

    const catalog = new Catalog(singleDocResolved(doc), defaultConfig);
    const snapshot = catalog.getLibrarySnapshot('@local');
    expect(snapshot).toBeDefined();
    expect(snapshot!.tags.important).toBeDefined();
  });
});

describe('mergeDefinitions', () => {
  it('descendant-wins: later document overrides category field_schemas', () => {
    const ancestor = makeDoc('ancestor', {
      source: '@org',
      definitions: {
        categories: {
          custom: {
            yaml_key: 'customs',
            id_prefix: 'CU',
            mapping_rules: [['goal']],
            field_schemas: {
              reason: { type: 'string', required: true },
            },
          } as CategoryDefinition,
        },
      },
    });

    const descendant = makeDoc('descendant', {
      source: '@local',
      definitions: {
        categories: {
          custom: {
            yaml_key: 'customs',
            id_prefix: 'CU',
            mapping_rules: [['goal']],
            field_schemas: {
              reason: { type: 'string', required: false }, // override
              extra: { type: 'string' },
            },
          } as CategoryDefinition,
        },
      },
    });

    const result = mergeDefinitions([ancestor, descendant], 'descendant');
    expect(result.categories.custom!.field_schemas!.reason!.required).toBe(false);
    expect(result.categories.custom!.field_schemas!.extra).toBeDefined();
  });

  it('ancestor-wins: ancestor overrides descendant definitions', () => {
    const ancestor = makeDoc('ancestor', {
      source: '@org',
      definitions: {
        categories: {
          custom: {
            yaml_key: 'customs',
            id_prefix: 'CU',
            mapping_rules: [['goal']],
            field_schemas: {
              reason: { type: 'string', required: true },
            },
          } as CategoryDefinition,
        },
      },
    });

    const descendant = makeDoc('descendant', {
      source: '@local',
      definitions: {
        categories: {
          custom: {
            yaml_key: 'customs',
            id_prefix: 'CU',
            mapping_rules: [['goal']],
            field_schemas: {
              reason: { type: 'string', required: false },
            },
          } as CategoryDefinition,
        },
      },
    });

    const result = mergeDefinitions([ancestor, descendant], 'ancestor');
    // ancestor-wins: reversed iteration, ancestor comes last and overwrites
    expect(result.categories.custom!.field_schemas!.reason!.required).toBe(true);
  });

  it('merges tags across documents (descendant-wins)', () => {
    const ancestor = makeDoc('ancestor', {
      source: '@org',
      definitions: {
        tags: {
          shared: { description: 'From ancestor' },
          ancestorOnly: { description: 'Ancestor only' },
        },
      },
    });

    const descendant = makeDoc('descendant', {
      source: '@local',
      definitions: {
        tags: {
          shared: { description: 'From descendant' },
          childOnly: { description: 'Child only' },
        },
      },
    });

    const result = mergeDefinitions([ancestor, descendant], 'descendant');
    expect(result.tags.shared!.description).toBe('From descendant');
    expect(result.tags.ancestorOnly).toBeDefined();
    expect(result.tags.childOnly).toBeDefined();
  });
});

describe('validateMergedCategories', () => {
  it('passes with valid core categories', () => {
    const categories: Record<string, CategoryDefinition> = {
      goal: { yaml_key: 'goals', id_prefix: 'G', is_root: true },
      value: { yaml_key: 'values', id_prefix: 'V', is_root: true },
      principle: {
        yaml_key: 'principles',
        id_prefix: 'P',
        mapping_rules: [['goal', 'value']],
      },
    };
    expect(() => validateMergedCategories(categories)).not.toThrow();
  });

  it('throws DuplicateIdPrefixError on collision', () => {
    const categories: Record<string, CategoryDefinition> = {
      goal: { yaml_key: 'goals', id_prefix: 'G', is_root: true },
      other: { yaml_key: 'others', id_prefix: 'G', is_root: true }, // same prefix!
    };
    expect(() => validateMergedCategories(categories)).toThrow(DuplicateIdPrefixError);
  });

  it('throws DuplicateYamlKeyError on collision', () => {
    const categories: Record<string, CategoryDefinition> = {
      goal: { yaml_key: 'goals', id_prefix: 'G', is_root: true },
      other: { yaml_key: 'goals', id_prefix: 'O', is_root: true }, // same yaml_key!
    };
    expect(() => validateMergedCategories(categories)).toThrow(DuplicateYamlKeyError);
  });

  it('throws InvalidMappingRuleRefError for unknown category reference', () => {
    const categories: Record<string, CategoryDefinition> = {
      goal: { yaml_key: 'goals', id_prefix: 'G', is_root: true },
      principle: {
        yaml_key: 'principles',
        id_prefix: 'P',
        mapping_rules: [['nonexistent']],
      },
    };
    expect(() => validateMergedCategories(categories)).toThrow(InvalidMappingRuleRefError);
  });

  it('throws SchemaError for reserved field collision in field_schemas', () => {
    const categories: Record<string, CategoryDefinition> = {
      goal: {
        yaml_key: 'goals',
        id_prefix: 'G',
        is_root: true,
        field_schemas: {
          id: { type: 'string' }, // reserved!
        },
      },
    };
    expect(() => validateMergedCategories(categories)).toThrow(SchemaError);
  });

  it('throws CatalogError for root category with mapping_rules', () => {
    const categories: Record<string, CategoryDefinition> = {
      goal: {
        yaml_key: 'goals',
        id_prefix: 'G',
        is_root: true,
        mapping_rules: [['value']],
      },
      value: { yaml_key: 'values', id_prefix: 'V', is_root: true },
    };
    expect(() => validateMergedCategories(categories)).toThrow(CatalogError);
    expect(() => validateMergedCategories(categories)).toThrow(
      /Root category 'goal' must not have mapping_rules/,
    );
  });

  it('throws CatalogError for non-root category without mapping_rules', () => {
    const categories: Record<string, CategoryDefinition> = {
      goal: { yaml_key: 'goals', id_prefix: 'G', is_root: true },
      principle: {
        yaml_key: 'principles',
        id_prefix: 'P',
        // missing mapping_rules and not is_root!
      },
    };
    expect(() => validateMergedCategories(categories)).toThrow(CatalogError);
    expect(() => validateMergedCategories(categories)).toThrow(
      /Non-root category 'principle' must have mapping_rules/,
    );
  });

  it('includes context in error messages', () => {
    const categories: Record<string, CategoryDefinition> = {
      a: { yaml_key: 'aa', id_prefix: 'A', is_root: true },
      b: { yaml_key: 'bb', id_prefix: 'A', is_root: true },
    };
    expect(() => validateMergedCategories(categories, 'my-library')).toThrow(
      /my-library/,
    );
  });
});
