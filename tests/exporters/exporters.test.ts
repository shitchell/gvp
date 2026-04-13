import { describe, it, expect } from 'vitest';
import { Document } from '../../src/model/document.js';
import { Element } from '../../src/model/element.js';
import { CategoryRegistry } from '../../src/model/category-registry.js';
import { Catalog } from '../../src/catalog/catalog.js';
import type { DocumentMeta } from '../../src/model/document-meta.js';
import type { ResolvedInheritance } from '../../src/inheritance/inheritance-resolver.js';
import type { GVPConfig } from '../../src/config/schema.js';
import type { CategoryDefinition } from '../../src/schema/category-definition.js';
import { JsonExporter } from '../../src/exporters/json-exporter.js';
import { CsvExporter } from '../../src/exporters/csv-exporter.js';
import { MarkdownExporter } from '../../src/exporters/markdown-exporter.js';
import { createExporterRegistry } from '../../src/exporters/registry.js';
import { Exporter, type ExportOptions } from '../../src/exporters/base.js';
import { z } from 'zod';

/** Minimal config for tests */
const defaultConfig: GVPConfig = {
  strict: false,
  suppress_diagnostics: [],
  strict_export_options: true,
  validation_rules: [],
};

/** Helper: create a Document with elements */
function makeDoc(
  documentPath: string,
  opts: {
    source?: string;
    elements?: Array<{ categoryName: string; data: Record<string, unknown> }>;
    definitions?: DocumentMeta['definitions'];
  } = {},
): Document {
  const source = opts.source ?? '@local';
  const meta: DocumentMeta = {
    name: documentPath,
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

/** Helper: build ResolvedInheritance for documents */
function resolvedFrom(...docs: Document[]): ResolvedInheritance {
  return {
    orderedDocuments: docs,
    aliasMap: new Map(),
    sccs: [],
  };
}

/** Helper: build a catalog from documents */
function buildCatalog(...docs: Document[]): Catalog {
  return new Catalog(resolvedFrom(...docs), defaultConfig);
}

/** Standard test elements */
const goalData = {
  categoryName: 'goal',
  data: {
    id: 'G1',
    name: 'Deliver quality software',
    status: 'active',
    tags: ['engineering'],
    maps_to: [],
    statement: 'We aim to deliver quality software.',
  },
};

const valueData = {
  categoryName: 'value',
  data: {
    id: 'V1',
    name: 'Integrity',
    status: 'active',
    tags: ['core'],
    maps_to: ['G1'],
    statement: 'Act with integrity in all we do.',
  },
};

const deprecatedData = {
  categoryName: 'value',
  data: {
    id: 'V2',
    name: 'Old Value',
    status: 'deprecated',
    tags: [],
    maps_to: [],
    statement: 'This is deprecated.',
  },
};

const decisionData = {
  categoryName: 'decision',
  data: {
    id: 'D1',
    name: 'Use TypeScript',
    status: 'active',
    tags: ['tech'],
    maps_to: ['V1'],
    statement: 'We chose TypeScript for type safety.',
    considered: {
      plain_javascript: {
        rationale: 'Faster initial development but less safe',
      },
      rust_wasm: {
        rationale: 'Too complex for team',
      },
    },
  },
};

const dynamicFieldData = {
  categoryName: 'goal',
  data: {
    id: 'G2',
    name: 'Scale team',
    status: 'active',
    tags: [],
    maps_to: [],
    statement: 'Grow the engineering team.',
    custom_field: 'custom value',
    another_field: 42,
  },
};

// -- JsonExporter --

describe('JsonExporter', () => {
  const exporter = new JsonExporter();

  it('has correct key and name', () => {
    expect(exporter.key).toBe('json');
    expect(exporter.name).toBe('JSON');
  });

  it('produces valid JSON', () => {
    const catalog = buildCatalog(makeDoc('main', { elements: [goalData, valueData] }));
    const result = exporter.export(catalog);
    expect(() => JSON.parse(result)).not.toThrow();
  });

  it('includes all documents, elements, categories, and tags', () => {
    const doc = makeDoc('main', {
      elements: [goalData, valueData],
      definitions: { tags: { engineering: { description: 'Engineering team' } } },
    });
    const catalog = buildCatalog(doc);
    const parsed = JSON.parse(exporter.export(catalog));

    expect(parsed.documents).toHaveLength(1);
    expect(parsed.documents[0].name).toBe('main');
    expect(parsed.documents[0].documentPath).toBe('main');
    expect(parsed.documents[0].source).toBe('@local');
    expect(parsed.documents[0].elements.length).toBeGreaterThanOrEqual(2);
    expect(parsed.categories).toBeDefined();
    expect(parsed.tags).toBeDefined();
    expect(parsed.tags.engineering).toEqual({ description: 'Engineering team' });
  });

  it('includes _category, _libraryId, _canonicalId on elements', () => {
    const catalog = buildCatalog(makeDoc('main', { elements: [goalData] }));
    const parsed = JSON.parse(exporter.export(catalog));
    const el = parsed.documents[0].elements[0];

    expect(el._category).toBe('goal');
    expect(el._libraryId).toBe('main:G1');
    expect(el._canonicalId).toBe('@local:main:G1');
  });

  it('excludes deprecated elements by default', () => {
    const catalog = buildCatalog(
      makeDoc('main', { elements: [goalData, valueData, deprecatedData] }),
    );
    const parsed = JSON.parse(exporter.export(catalog));
    const ids = parsed.documents[0].elements.map((e: { id: string }) => e.id);

    expect(ids).toContain('G1');
    expect(ids).toContain('V1');
    expect(ids).not.toContain('V2');
  });

  it('includes deprecated elements with includeDeprecated flag', () => {
    const catalog = buildCatalog(
      makeDoc('main', { elements: [goalData, valueData, deprecatedData] }),
    );
    const parsed = JSON.parse(exporter.export(catalog, { includeDeprecated: true }));
    const ids = parsed.documents[0].elements.map((e: { id: string }) => e.id);

    expect(ids).toContain('G1');
    expect(ids).toContain('V1');
    expect(ids).toContain('V2');
  });
});

// -- CsvExporter --

describe('CsvExporter', () => {
  const exporter = new CsvExporter();

  it('has correct key and name', () => {
    expect(exporter.key).toBe('csv');
    expect(exporter.name).toBe('CSV');
  });

  it('produces valid CSV with headers', () => {
    const catalog = buildCatalog(makeDoc('main', { elements: [goalData] }));
    const result = exporter.export(catalog);
    const lines = result.split('\n');

    expect(lines.length).toBeGreaterThanOrEqual(2); // header + at least 1 data row
    const headers = lines[0].split(',');
    expect(headers).toContain('qualified_id');
    expect(headers).toContain('id');
    expect(headers).toContain('document');
    expect(headers).toContain('category');
    expect(headers).toContain('name');
    expect(headers).toContain('status');
    expect(headers).toContain('tags');
    expect(headers).toContain('maps_to');
    expect(headers).toContain('priority');
  });

  it('includes dynamic columns from element data', () => {
    const catalog = buildCatalog(
      makeDoc('main', { elements: [goalData, dynamicFieldData] }),
    );
    const result = exporter.export(catalog);
    const headers = result.split('\n')[0].split(',');

    expect(headers).toContain('custom_field');
    expect(headers).toContain('another_field');
    // Dynamic columns should be after fixed columns
    const customIdx = headers.indexOf('custom_field');
    const priorityIdx = headers.indexOf('priority');
    expect(customIdx).toBeGreaterThan(priorityIdx);
  });

  it('escapes commas and quotes in values', () => {
    const commaData = {
      categoryName: 'goal',
      data: {
        id: 'G3',
        name: 'Goal with, comma',
        status: 'active',
        tags: [],
        maps_to: [],
        statement: 'Has "quotes" inside',
      },
    };
    const catalog = buildCatalog(makeDoc('main', { elements: [commaData] }));
    const result = exporter.export(catalog);

    // Name with comma should be quoted
    expect(result).toContain('"Goal with, comma"');
    // Statement with quotes should be escaped
    expect(result).toContain('"Has ""quotes"" inside"');
  });

  it('returns empty string for no elements', () => {
    const catalog = buildCatalog(makeDoc('main', { elements: [] }));
    const result = exporter.export(catalog);
    expect(result).toBe('');
  });

  it('excludes deprecated elements by default', () => {
    const catalog = buildCatalog(
      makeDoc('main', { elements: [goalData, deprecatedData] }),
    );
    const result = exporter.export(catalog);
    expect(result).not.toContain('V2');
    expect(result).not.toContain('Old Value');
  });

  it('joins tags and maps_to with semicolons', () => {
    const multiTag = {
      categoryName: 'goal',
      data: {
        id: 'G4',
        name: 'Multi tags',
        status: 'active',
        tags: ['alpha', 'beta'],
        maps_to: ['V1', 'V2'],
      },
    };
    const catalog = buildCatalog(makeDoc('main', { elements: [multiTag] }));
    const result = exporter.export(catalog);

    expect(result).toContain('alpha;beta');
    expect(result).toContain('V1;V2');
  });
});

// -- MarkdownExporter --

describe('MarkdownExporter', () => {
  const exporter = new MarkdownExporter();

  it('has correct key and name', () => {
    expect(exporter.key).toBe('markdown');
    expect(exporter.name).toBe('Markdown');
  });

  it('produces markdown with document and category headers', () => {
    const catalog = buildCatalog(makeDoc('main', { elements: [goalData, valueData] }));
    const result = exporter.export(catalog);

    expect(result).toContain('# main');
    // Should have category headers (uses display_label or generated plural)
    expect(result).toMatch(/^## /m);
  });

  it('uses category display labels when available', () => {
    // The default categories from defaults.yaml will have display_label set.
    // We check that the markdown uses whatever the registry provides.
    const catalog = buildCatalog(makeDoc('main', { elements: [goalData] }));
    const result = exporter.export(catalog);

    // Goal category should have a section header
    expect(result).toMatch(/^## /m);
    // Element should be rendered
    expect(result).toContain('### G1: Deliver quality software');
  });

  it('renders element details (statement, tags, maps_to)', () => {
    const catalog = buildCatalog(makeDoc('main', { elements: [valueData] }));
    const result = exporter.export(catalog);

    expect(result).toContain('Act with integrity in all we do.');
    expect(result).toContain('**Tags:** core');
    expect(result).toContain('**Maps to:** G1');
  });

  it('renders considered alternatives for decisions', () => {
    const catalog = buildCatalog(makeDoc('main', { elements: [decisionData] }));
    const result = exporter.export(catalog);

    expect(result).toContain('**Considered alternatives:**');
    expect(result).toContain('Plain Javascript');
    expect(result).toContain('Faster initial development but less safe');
    expect(result).toContain('Rust Wasm');
    expect(result).toContain('Too complex for team');
  });

  it('shows status for non-active elements when includeDeprecated is true', () => {
    const catalog = buildCatalog(
      makeDoc('main', { elements: [deprecatedData] }),
    );
    const result = exporter.export(catalog, { includeDeprecated: true });

    expect(result).toContain('**Status:** deprecated');
  });

  it('excludes deprecated elements by default', () => {
    const catalog = buildCatalog(
      makeDoc('main', { elements: [goalData, deprecatedData] }),
    );
    const result = exporter.export(catalog);

    expect(result).toContain('G1');
    expect(result).not.toContain('V2');
    expect(result).not.toContain('Old Value');
  });
});

// -- Exporter registry --

describe('createExporterRegistry', () => {
  it('contains json, csv, markdown, dot, and sqlite exporters', () => {
    const registry = createExporterRegistry();

    expect(registry.has('json')).toBe(true);
    expect(registry.has('csv')).toBe(true);
    expect(registry.has('markdown')).toBe(true);
    expect(registry.has('compact')).toBe(true);
    expect(registry.has('dot')).toBe(true);
    expect(registry.has('sqlite')).toBe(true);
    expect(registry.size).toBe(6);
  });

  it('returns Exporter instances', () => {
    const registry = createExporterRegistry();
    for (const exp of registry.values()) {
      expect(exp).toBeInstanceOf(Exporter);
      expect(typeof exp.key).toBe('string');
      expect(typeof exp.name).toBe('string');
      expect(exp.optionsSchema).toBeDefined();
    }
  });
});

// -- Exporter base class --

describe('Exporter base class', () => {
  it('requires key, name, optionsSchema, and export to be implemented', () => {
    class TestExporter extends Exporter {
      readonly key = 'test';
      readonly name = 'Test';
      readonly optionsSchema = z.object({});

      export(catalog: Catalog, _options?: ExportOptions): string {
        return `test: ${catalog.getAllElements().length} elements`;
      }
    }

    const exp = new TestExporter();
    expect(exp.key).toBe('test');
    expect(exp.name).toBe('Test');

    const catalog = buildCatalog(makeDoc('main', { elements: [goalData] }));
    const result = exp.export(catalog);
    expect(result).toContain('elements');
  });
});
