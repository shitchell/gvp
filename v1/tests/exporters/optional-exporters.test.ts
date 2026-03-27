import { describe, it, expect } from 'vitest';
import { Document } from '../../src/model/document.js';
import { Element } from '../../src/model/element.js';
import { Catalog } from '../../src/catalog/catalog.js';
import type { DocumentMeta } from '../../src/model/document-meta.js';
import type { ResolvedInheritance } from '../../src/inheritance/inheritance-resolver.js';
import type { GVPConfig } from '../../src/config/schema.js';
import { DotExporter } from '../../src/exporters/dot-exporter.js';
import { SqliteExporter } from '../../src/exporters/sqlite-exporter.js';
import { createExporterRegistry } from '../../src/exporters/registry.js';

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
    name: 'Test Goal',
    status: 'active',
    tags: [],
    maps_to: [],
    statement: 'Testing.',
  },
};

const valueData = {
  categoryName: 'value',
  data: {
    id: 'V1',
    name: 'Test Value',
    status: 'active',
    tags: [],
    maps_to: ['test:G1'],
    statement: 'Testing values.',
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

describe('Optional Exporters', () => {
  describe('DotExporter', () => {
    it('is registered in exporter registry', () => {
      expect(createExporterRegistry().has('dot')).toBe(true);
    });

    it('generates valid DOT output', () => {
      const catalog = buildCatalog(
        makeDoc('test', { elements: [goalData, valueData] }),
      );
      const exporter = new DotExporter();
      const output = exporter.export(catalog);
      expect(output).toContain('digraph gvp');
      expect(output).toContain('rankdir=BT');
      expect(output).toContain('G1');
      expect(output).toContain('V1');
      expect(output).toContain('->'); // Edge from V1 to G1
    });

    it('uses category colors', () => {
      const catalog = buildCatalog(
        makeDoc('test', { elements: [goalData, valueData] }),
      );
      const exporter = new DotExporter();
      const output = exporter.export(catalog);
      expect(output).toContain('#4CAF50'); // Goal color
      expect(output).toContain('#2196F3'); // Value color
    });

    it('excludes deprecated elements by default', () => {
      const catalog = buildCatalog(
        makeDoc('test', { elements: [goalData, deprecatedData] }),
      );
      const exporter = new DotExporter();
      const output = exporter.export(catalog);
      expect(output).toContain('G1');
      expect(output).not.toContain('V2');
      expect(output).not.toContain('Old Value');
    });

    it('includes deprecated elements with includeDeprecated flag', () => {
      const catalog = buildCatalog(
        makeDoc('test', { elements: [goalData, deprecatedData] }),
      );
      const exporter = new DotExporter();
      const output = exporter.export(catalog, { includeDeprecated: true });
      expect(output).toContain('G1');
      expect(output).toContain('V2');
    });
  });

  describe('SqliteExporter', () => {
    it('is registered in exporter registry', () => {
      expect(createExporterRegistry().has('sqlite')).toBe(true);
    });

    it('throws helpful message when dependency not available', () => {
      const catalog = buildCatalog(
        makeDoc('test', { elements: [goalData] }),
      );
      const exporter = new SqliteExporter();
      expect(() => exporter.export(catalog)).toThrow(/better-sqlite3/);
    });
  });
});
