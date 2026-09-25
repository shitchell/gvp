import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { buildCatalog } from '../../src/cli/helpers.js';
import { configSchema } from '../../src/config/schema.js';
import { createListingRegistry } from '../../src/listings/registry.js';
import { DocumentsListing, type DocumentRow } from '../../src/listings/documents-listing.js';

/**
 * `cairn query --list documents` (#24, D61) — the documents in the RESOLVED
 * CATALOG, with per-category element counts.
 *
 * The contracts pinned here are the ones whose failure mode is SILENT:
 *   - rows are derived from `catalog.documents`, never from the element
 *     output. A tags-only or all-deprecated document has no elements in any
 *     filtered view and would VANISH from an element-derived listing,
 *     undercounting the catalog with nothing to say so (D54).
 *   - counts are keyed by the category's schema `yaml_key`, so a
 *     user-defined category is counted like any other (R6). Hard-coding the
 *     built-in names would report 0 for a custom category that has elements.
 *   - `query --format json` carries `_document`/`_documentPath`/`_source`,
 *     because `_canonicalId` cannot be split back apart — `source` may
 *     itself contain `:` (P14) — and because document NAMES are not unique
 *     across inherited libraries (D46), so the name alone is not a join key.
 */

const CLI = path.resolve(__dirname, '../../dist/cli/index.js');

let tmpDir: string;

/** The upstream library the project inherits from. */
function seedUpstream(root: string): string {
  const lib = path.join(root, 'upstream', '.gvp', 'library');
  fs.mkdirSync(lib, { recursive: true });
  fs.writeFileSync(
    path.join(lib, 'shared.yaml'),
    [
      'meta:',
      '  name: shared',
      '  scope: universal',
      '  description: Upstream shared roots',
      'goals:',
      '  - id: G1',
      '    name: Upstream goal',
      '    statement: A goal.',
      'values:',
      '  - id: V1',
      '    name: Upstream value',
      '    statement: A value.',
      '',
    ].join('\n'),
  );
  return path.join(root, 'upstream', '.gvp', 'library');
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cairn-list-docs-'));
  const upstreamLib = seedUpstream(tmpDir);

  const lib = path.join(tmpDir, 'project', '.gvp', 'library');
  fs.mkdirSync(lib, { recursive: true });

  // Root document: a custom category alongside built-ins, and a description.
  fs.writeFileSync(
    path.join(lib, 'main.yaml'),
    [
      'meta:',
      '  name: main',
      '  scope: project',
      '  description: The project root library',
      '  inherits:',
      `    - source: '${upstreamLib}'`,
      '  definitions:',
      '    categories:',
      '      lesson:',
      '        yaml_key: lessons',
      '        id_prefix: L',
      '        primary_field: statement',
      '        mapping_rules:',
      '          - [goal, value]',
      'decisions:',
      '  - id: D1',
      '    name: Use YAML',
      '    rationale: Hand-editable keeps the barrier low.',
      '    maps_to: [shared:G1, shared:V1]',
      '  - id: D2',
      '    name: Retired choice',
      '    status: deprecated',
      '    rationale: Superseded.',
      '    maps_to: [shared:G1, shared:V1]',
      'lessons:',
      '  - id: L1',
      '    name: A custom-category lesson',
      '    statement: Counted by schema, not by a hard-coded name.',
      '    maps_to: [shared:G1, shared:V1]',
      '',
    ].join('\n'),
  );

  // TRAP 1: a document with NO elements at all — only tag definitions.
  fs.writeFileSync(
    path.join(lib, 'vocab.yaml'),
    [
      'meta:',
      '  name: vocab',
      '  scope: project',
      '  description: Tag vocabulary only, no elements',
      '  definitions:',
      '    tags:',
      '      tooling:',
      '        description: The CLI and its implementation',
      '',
    ].join('\n'),
  );

  // TRAP 2: a document whose every element is deprecated.
  fs.writeFileSync(
    path.join(lib, 'attic.yaml'),
    [
      'meta:',
      '  name: attic',
      '  scope: project',
      'decisions:',
      '  - id: D9',
      '    name: Long retired',
      '    status: deprecated',
      '    rationale: Kept for the record.',
      '    maps_to: [shared:G1, shared:V1]',
      '',
    ].join('\n'),
  );
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function projectDir(): string {
  return path.join(tmpDir, 'project');
}

function catalog() {
  return buildCatalog(configSchema.parse({}), projectDir());
}

function activeElements(cat: ReturnType<typeof catalog>) {
  return cat.getAllElements().filter((e) => e.status === 'active');
}

function rowsFor(name: string, rows: DocumentRow[]): DocumentRow {
  const row = rows.find((r) => r.name === name);
  expect(row, `expected a row for document '${name}'`).toBeDefined();
  return row!;
}

describe('DocumentsListing', () => {
  it('lists a document that has NO elements at all (tags-only)', () => {
    const cat = catalog();
    const rows = new DocumentsListing().rows(cat, { elements: activeElements(cat) });
    const vocab = rowsFor('vocab', rows);
    expect(vocab.element_total).toBe(0);
    expect(vocab.element_counts).toEqual({});
    expect(vocab.description).toBe('Tag vocabulary only, no elements');
  });

  it('lists a document whose elements are ALL deprecated', () => {
    const cat = catalog();
    const rows = new DocumentsListing().rows(cat, { elements: activeElements(cat) });
    const attic = rowsFor('attic', rows);
    expect(attic.element_total).toBe(0);
    expect(attic.element_counts).toEqual({});
  });

  it('counts the deprecated document once deprecated elements are included', () => {
    const cat = catalog();
    const rows = new DocumentsListing().rows(cat, { elements: cat.getAllElements() });
    expect(rowsFor('attic', rows).element_counts).toEqual({ decisions: 1 });
  });

  it('keys counts by the category yaml_key, including user-defined categories (R6)', () => {
    const cat = catalog();
    const rows = new DocumentsListing().rows(cat, { elements: activeElements(cat) });
    // `lessons` is declared only in this fixture's meta.definitions. A
    // listing that hard-coded the built-in category names would drop it.
    expect(rowsFor('main', rows).element_counts).toEqual({ decisions: 1, lessons: 1 });
  });

  it('element_total is the sum of element_counts', () => {
    const cat = catalog();
    const rows = new DocumentsListing().rows(cat, { elements: activeElements(cat) });
    for (const row of rows) {
      const sum = Object.values(row.element_counts).reduce((a, b) => a + b, 0);
      expect(row.element_total).toBe(sum);
    }
  });

  it('includes inherited documents, carrying their source', () => {
    const cat = catalog();
    const rows = new DocumentsListing().rows(cat, { elements: activeElements(cat) });
    const shared = rowsFor('shared', rows);
    expect(shared.source).not.toBe('@local');
    expect(shared.element_counts).toEqual({ goals: 1, values: 1 });
    expect(rowsFor('main', rows).source).toBe('@local');
  });

  it('surfaces meta.description (D18), or null when absent', () => {
    const cat = catalog();
    const rows = new DocumentsListing().rows(cat, { elements: activeElements(cat) });
    expect(rowsFor('main', rows).description).toBe('The project root library');
    expect(rowsFor('attic', rows).description).toBeNull();
  });

  it('restricts ROWS by documentFilter but COUNTS by the element filter', () => {
    const cat = catalog();
    const listing = new DocumentsListing();

    // documentFilter drops rows entirely.
    const filtered = listing.rows(cat, {
      elements: activeElements(cat),
      documentFilter: new Set(['main']),
    });
    expect(filtered.map((r) => r.name)).toEqual(['main']);

    // An element filter that matches nothing must leave every row standing
    // with a zero count — never remove the document.
    const zeroed = listing.rows(cat, { elements: [] });
    expect(zeroed.map((r) => r.name).sort()).toEqual(
      filteredNames(cat).sort(),
    );
    expect(zeroed.every((r) => r.element_total === 0)).toBe(true);
  });

  it('emits element_counts keys in a stable (sorted) order', () => {
    const cat = catalog();
    const rows = new DocumentsListing().rows(cat, { elements: cat.getAllElements() });
    for (const row of rows) {
      const keys = Object.keys(row.element_counts);
      expect(keys).toEqual([...keys].sort());
    }
  });

  it('renderText never drops a row that rows() produced', () => {
    const cat = catalog();
    const listing = new DocumentsListing();
    const rows = listing.rows(cat, { elements: activeElements(cat) });
    const text = listing.renderText(rows);
    for (const row of rows) expect(text).toContain(row.name);
  });
});

describe('DocumentsListing with a duplicated document name across sources', () => {
  /**
   * D46: document names are NOT unique across libraries. Two inherited
   * sources can both ship a `shared.yaml` with `meta.name: shared`. The
   * listing must emit two distinct rows, and (source, document_path) must
   * be what tells them apart — which is exactly why `query --format json`
   * carries `_source` and `_documentPath` and not `_document` alone.
   */
  let dupDir: string;

  beforeEach(() => {
    dupDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cairn-list-docs-dup-'));
    const upA = seedUpstream(dupDir);
    const upBRoot = path.join(dupDir, 'upstream-b', '.gvp', 'library');
    fs.mkdirSync(upBRoot, { recursive: true });
    fs.writeFileSync(
      path.join(upBRoot, 'shared.yaml'),
      [
        'meta:',
        '  name: shared',
        '  scope: universal',
        'constraints:',
        '  - id: C1',
        '    name: A second-source constraint',
        '    statement: From the other upstream.',
        '',
      ].join('\n'),
    );

    const lib = path.join(dupDir, 'project', '.gvp', 'library');
    fs.mkdirSync(lib, { recursive: true });
    fs.writeFileSync(
      path.join(lib, 'main.yaml'),
      [
        'meta:',
        '  name: main',
        '  scope: project',
        '  inherits:',
        `    - source: '${upA}'`,
        `    - source: '${upBRoot}'`,
        'decisions:',
        '  - id: D1',
        '    name: Local decision',
        '    rationale: Local.',
        '',
      ].join('\n'),
    );
  });

  afterEach(() => {
    fs.rmSync(dupDir, { recursive: true, force: true });
  });

  it('emits one row per (source, document_path), not one per name', () => {
    const cat = buildCatalog(configSchema.parse({}), path.join(dupDir, 'project'));
    const rows = new DocumentsListing().rows(cat, { elements: cat.getAllElements() });
    const shared = rows.filter((r) => r.name === 'shared');
    expect(shared).toHaveLength(2);
    expect(new Set(shared.map((r) => r.source)).size).toBe(2);
    // Counts must not be merged across the two same-named documents.
    expect(shared.map((r) => r.element_total).sort()).toEqual([1, 2]);
  });
});

describe('listing registry', () => {
  it('registers `documents` and is the source of the accepted vocabulary', () => {
    const registry = createListingRegistry();
    expect([...registry.keys()]).toContain('documents');
    expect(registry.get('documents')).toBeInstanceOf(DocumentsListing);
  });
});

function filteredNames(cat: ReturnType<typeof catalog>): string[] {
  return cat.documents.map((d) => d.name);
}

/**
 * End-to-end against the built CLI. Exit codes and stream placement are the
 * contract an agent consumes; an in-process spy cannot prove either.
 * Requires `npm run build`.
 */
describe('query --list end-to-end (built CLI)', () => {
  function cli(args: string[]) {
    const r = spawnSync('node', [CLI, 'query', ...args], {
      cwd: projectDir(),
      env: { ...process.env, GVP_REGISTRY_ROOT: path.join(tmpDir, '.registry') },
      encoding: 'utf-8',
      timeout: 20000,
    });
    return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
  }

  it('--list documents --format json exits 0 with parseable rows on stdout', () => {
    const r = cli(['--list', 'documents', '--format', 'json']);
    expect(r.status).toBe(0);
    const rows = JSON.parse(r.stdout) as DocumentRow[];
    const names = rows.map((d) => d.name).sort();
    expect(names).toEqual(['attic', 'main', 'shared', 'vocab']);
  });

  it('json rows carry the full stable schema', () => {
    const r = cli(['--list', 'documents', '--format', 'json']);
    const rows = JSON.parse(r.stdout) as DocumentRow[];
    for (const row of rows) {
      expect(Object.keys(row).sort()).toEqual([
        'description',
        'document_path',
        'element_counts',
        'element_total',
        'name',
        'scope',
        'source',
      ]);
    }
  });

  it('the empty document survives the round trip through the CLI', () => {
    const r = cli(['--list', 'documents', '--format', 'json']);
    const rows = JSON.parse(r.stdout) as DocumentRow[];
    const vocab = rows.find((d) => d.name === 'vocab')!;
    expect(vocab.element_total).toBe(0);
  });

  it('text output goes to stderr, leaving stdout for structured output', () => {
    const r = cli(['--list', 'documents']);
    expect(r.status).toBe(0);
    expect(r.stdout).toBe('');
    expect(r.stderr).toContain('main');
  });

  it('refuses an unknown listing type and names the available ones', () => {
    const r = cli(['--list', 'bogus']);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("Unknown listing type 'bogus'");
    expect(r.stderr).toContain('documents');
  });

  it('refuses a format a listing cannot render rather than falling back', () => {
    const r = cli(['--list', 'documents', '--format', 'csv']);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('not available for --list documents');
  });

  it('--document restricts the rows', () => {
    const r = cli(['--list', 'documents', '--document', 'main', '--format', 'json']);
    expect(r.status).toBe(0);
    const rows = JSON.parse(r.stdout) as DocumentRow[];
    expect(rows.map((d) => d.name)).toEqual(['main']);
  });

  it('--include-deprecated is reflected in the counts', () => {
    const plain = JSON.parse(
      cli(['--list', 'documents', '--format', 'json']).stdout,
    ) as DocumentRow[];
    const withDep = JSON.parse(
      cli(['--list', 'documents', '--include-deprecated', '--format', 'json']).stdout,
    ) as DocumentRow[];
    expect(plain.find((d) => d.name === 'attic')!.element_total).toBe(0);
    expect(withDep.find((d) => d.name === 'attic')!.element_total).toBe(1);
    // The row is present either way — that is the point.
    expect(plain.some((d) => d.name === 'attic')).toBe(true);
  });

  it('query --format json carries the document join key', () => {
    const r = cli(['--format', 'json', '--document', 'main']);
    expect(r.status).toBe(0);
    const elements = JSON.parse(r.stdout) as Array<Record<string, unknown>>;
    expect(elements.length).toBeGreaterThan(0);
    for (const el of elements) {
      expect(el._document).toBe('main');
      expect(el._documentPath).toBe('main');
      expect(el._source).toBe('@local');
    }
  });

  it('the element join key matches a --list documents row exactly', () => {
    const rows = JSON.parse(
      cli(['--list', 'documents', '--format', 'json']).stdout,
    ) as DocumentRow[];
    const elements = JSON.parse(cli(['--format', 'json']).stdout) as Array<
      Record<string, unknown>
    >;
    for (const el of elements) {
      const match = rows.find(
        (d) =>
          d.name === el._document &&
          d.document_path === el._documentPath &&
          d.source === el._source,
      );
      expect(match, `no row joins element ${String(el._canonicalId)}`).toBeDefined();
    }
  });

  it('element counts from --list documents agree with the elements themselves', () => {
    const rows = JSON.parse(
      cli(['--list', 'documents', '--format', 'json']).stdout,
    ) as DocumentRow[];
    const elements = JSON.parse(cli(['--format', 'json']).stdout) as Array<
      Record<string, unknown>
    >;
    const total = rows.reduce((a, r) => a + r.element_total, 0);
    expect(total).toBe(elements.length);
  });
});
