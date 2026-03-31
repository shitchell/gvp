import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Document } from '../../src/model/document.js';
import { Element } from '../../src/model/element.js';
import type { DocumentMeta } from '../../src/model/document-meta.js';
import type { ResolvedInheritance } from '../../src/inheritance/inheritance-resolver.js';
import type { GVPConfig } from '../../src/config/schema.js';
import { Catalog } from '../../src/catalog/catalog.js';
import { semanticPass } from '../../src/validation/passes/semantic-pass.js';
import { coveragePass } from '../../src/validation/passes/coverage-pass.js';
import * as fs from 'fs';
import * as path from 'path';
import { tmpdir } from 'os';

/** Default minimal config */
const defaultConfig: GVPConfig = {
  strict: false,
  suppress_diagnostics: [],
  strict_export_options: true,
  validation_rules: [],
};

/** Helper: create a Document with optional elements */
function makeDoc(
  documentPath: string,
  filePath: string,
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
    filePath,
    documentPath,
    source,
  );
}

/** Helper: build a Catalog from documents */
function makeCatalog(docs: Document[], config: GVPConfig = defaultConfig): Catalog {
  const resolved: ResolvedInheritance = {
    orderedDocuments: docs,
    aliasMap: new Map(),
    sccs: [],
  };
  return new Catalog(resolved, config);
}

describe('W010: Ref file does not exist', () => {
  let testDir: string;

  beforeEach(() => {
    // Create a temp directory with .git to simulate a project root
    testDir = fs.mkdtempSync(path.join(tmpdir(), 'gvp-test-'));
    fs.mkdirSync(path.join(testDir, '.git'));
    fs.mkdirSync(path.join(testDir, 'library'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('fires W010 for missing ref file', () => {
    const yamlPath = path.join(testDir, 'library', 'main.yaml');
    fs.writeFileSync(yamlPath, ''); // just needs to exist for filePath

    const doc = makeDoc('main', yamlPath, {
      elements: [
        {
          categoryName: 'decision',
          data: {
            id: 'DC1',
            name: 'Choice',
            status: 'active',
            maps_to: ['main:G1'],
            refs: [{ file: 'src/nonexistent.ts', identifier: 'someFunc', role: 'implements' }],
          },
        },
        {
          categoryName: 'goal',
          data: { id: 'G1', name: 'Goal', status: 'active' },
        },
      ],
    });

    const catalog = makeCatalog([doc]);
    const results = semanticPass(catalog, defaultConfig);

    const w010 = results.filter(d => d.code === 'W010');
    expect(w010).toHaveLength(1);
    expect(w010[0]!.description).toContain('nonexistent.ts');
    expect(w010[0]!.context.details).toBe('src/nonexistent.ts');
  });

  it('does not fire W010 when ref file exists', () => {
    const yamlPath = path.join(testDir, 'library', 'main.yaml');
    fs.writeFileSync(yamlPath, '');

    // Create the referenced file
    fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(testDir, 'src', 'existing.ts'), 'export function hello() {}');

    const doc = makeDoc('main', yamlPath, {
      elements: [
        {
          categoryName: 'decision',
          data: {
            id: 'DC1',
            name: 'Choice',
            status: 'active',
            maps_to: ['main:G1'],
            refs: [{ file: 'src/existing.ts', identifier: 'hello', role: 'implements' }],
          },
        },
        {
          categoryName: 'goal',
          data: { id: 'G1', name: 'Goal', status: 'active' },
        },
      ],
    });

    const catalog = makeCatalog([doc]);
    const results = semanticPass(catalog, defaultConfig);

    const w010 = results.filter(d => d.code === 'W010');
    expect(w010).toHaveLength(0);
  });
});

describe('W011: Ref identifier not found in file', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(tmpdir(), 'gvp-test-'));
    fs.mkdirSync(path.join(testDir, '.git'));
    fs.mkdirSync(path.join(testDir, 'library'), { recursive: true });
    fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('fires W011 for missing identifier in existing file', () => {
    const yamlPath = path.join(testDir, 'library', 'main.yaml');
    fs.writeFileSync(yamlPath, '');

    // File exists but does not contain the identifier
    fs.writeFileSync(
      path.join(testDir, 'src', 'module.ts'),
      'export function otherFunc() { return 42; }',
    );

    const doc = makeDoc('main', yamlPath, {
      elements: [
        {
          categoryName: 'decision',
          data: {
            id: 'DC1',
            name: 'Choice',
            status: 'active',
            maps_to: ['main:G1'],
            refs: [{ file: 'src/module.ts', identifier: 'missingFunc', role: 'implements' }],
          },
        },
        {
          categoryName: 'goal',
          data: { id: 'G1', name: 'Goal', status: 'active' },
        },
      ],
    });

    const catalog = makeCatalog([doc]);
    const results = semanticPass(catalog, defaultConfig);

    const w011 = results.filter(d => d.code === 'W011');
    expect(w011).toHaveLength(1);
    expect(w011[0]!.description).toContain('missingFunc');
    expect(w011[0]!.context.details).toBe('src/module.ts::missingFunc');
  });

  it('does not fire W011 when identifier is found', () => {
    const yamlPath = path.join(testDir, 'library', 'main.yaml');
    fs.writeFileSync(yamlPath, '');

    fs.writeFileSync(
      path.join(testDir, 'src', 'module.ts'),
      'export function myFunc() { return 42; }',
    );

    const doc = makeDoc('main', yamlPath, {
      elements: [
        {
          categoryName: 'decision',
          data: {
            id: 'DC1',
            name: 'Choice',
            status: 'active',
            maps_to: ['main:G1'],
            refs: [{ file: 'src/module.ts', identifier: 'myFunc', role: 'implements' }],
          },
        },
        {
          categoryName: 'goal',
          data: { id: 'G1', name: 'Goal', status: 'active' },
        },
      ],
    });

    const catalog = makeCatalog([doc]);
    const results = semanticPass(catalog, defaultConfig);

    const w011 = results.filter(d => d.code === 'W011');
    expect(w011).toHaveLength(0);
  });
});

describe('W013: Decision has no code refs', () => {
  it('fires W013 for active decision with no refs', () => {
    const doc = makeDoc('main', '/main.yaml', {
      elements: [
        {
          categoryName: 'goal',
          data: { id: 'G1', name: 'Goal', status: 'active' },
        },
        {
          categoryName: 'decision',
          data: {
            id: 'DC1',
            name: 'Choice',
            status: 'active',
            maps_to: ['main:G1'],
          },
        },
      ],
    });

    const catalog = makeCatalog([doc]);
    const results = coveragePass(catalog, defaultConfig);

    const w013 = results.filter(d => d.code === 'W013');
    expect(w013).toHaveLength(1);
    expect(w013[0]!.context.elementId).toBe('DC1');
  });

  it('does not fire W013 for non-decision categories', () => {
    const doc = makeDoc('main', '/main.yaml', {
      elements: [
        {
          categoryName: 'goal',
          data: { id: 'G1', name: 'Goal', status: 'active' },
        },
        {
          categoryName: 'value',
          data: { id: 'V1', name: 'Value', status: 'active' },
        },
      ],
    });

    const catalog = makeCatalog([doc]);
    const results = coveragePass(catalog, defaultConfig);

    const w013 = results.filter(d => d.code === 'W013');
    expect(w013).toHaveLength(0);
  });

  it('does not fire W013 for decisions with refs', () => {
    const doc = makeDoc('main', '/main.yaml', {
      elements: [
        {
          categoryName: 'goal',
          data: { id: 'G1', name: 'Goal', status: 'active' },
        },
        {
          categoryName: 'decision',
          data: {
            id: 'DC1',
            name: 'Choice',
            status: 'active',
            maps_to: ['main:G1'],
            refs: [{ file: 'src/module.ts', identifier: 'myFunc', role: 'implements' }],
          },
        },
      ],
    });

    const catalog = makeCatalog([doc]);
    const results = coveragePass(catalog, defaultConfig);

    const w013 = results.filter(d => d.code === 'W013');
    expect(w013).toHaveLength(0);
  });

  it('does not fire W013 for inactive decisions', () => {
    const doc = makeDoc('main', '/main.yaml', {
      elements: [
        {
          categoryName: 'decision',
          data: {
            id: 'DC1',
            name: 'Choice',
            status: 'deprecated',
          },
        },
      ],
    });

    const catalog = makeCatalog([doc]);
    const results = coveragePass(catalog, defaultConfig);

    const w013 = results.filter(d => d.code === 'W013');
    expect(w013).toHaveLength(0);
  });
});
