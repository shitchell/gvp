import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  buildCatalog,
  resolveDocumentFilter,
  filterElementsByDocument,
} from '../../src/cli/helpers.js';
import { configSchema } from '../../src/config/schema.js';

/**
 * Tests for the --document filter helper used by query/inspect/export/validate.
 *
 * Matching contract (P14 explicit over implicit):
 *   - Filter matches by exact `meta.name` OR exact filesystem `documentPath`
 *   - No substring, no prefix, no case-insensitive fuzz
 *   - Empty set return signals "no match" so callers can error loudly
 *
 * Fixture mirrors a real-world shape: a library with a root doc and a
 * subdirectory whose docs have meta.name ≠ documentPath (e.g. code/common.yaml
 * with meta.name: code-common).
 */
describe('CLI --document filter', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cairn-doc-filter-'));
    const lib = path.join(tmpDir, '.gvp', 'library');
    fs.mkdirSync(path.join(lib, 'code'), { recursive: true });

    fs.writeFileSync(
      path.join(lib, 'personal.yaml'),
      `
meta:
  name: personal
  scope: universal
  description: Root personal library with universal goals and values

goals:
  - id: G1
    name: Root goal
    statement: A root goal.
    tags: []
    maps_to: []

values:
  - id: V1
    name: Simplicity
    statement: Keep it simple.
    tags: []
    maps_to: [personal:G1]
`,
    );

    fs.writeFileSync(
      path.join(lib, 'code', 'common.yaml'),
      `
meta:
  name: code-common
  scope: personal
  inherits: personal
  description: Common code principles

principles:
  - id: CP1
    name: Clarity over cleverness
    statement: Code should be clear.
    tags: []
    maps_to: [personal:V1]
`,
    );

    fs.writeFileSync(
      path.join(lib, 'code', 'realtime.yaml'),
      `
meta:
  name: code-realtime
  scope: personal
  inherits: code-common

principles:
  - id: RTP1
    name: Hot-loop allocation ban
    statement: Do not allocate in hot loops.
    tags: []
    maps_to: [personal:V1]
`,
    );
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('resolveDocumentFilter', () => {
    it('matches by meta.name when name differs from documentPath', () => {
      const catalog = buildCatalog(configSchema.parse({}), tmpDir);
      const paths = resolveDocumentFilter(catalog, 'code-common');
      expect([...paths]).toEqual(['code/common']);
    });

    it('matches by documentPath when meta.name differs', () => {
      const catalog = buildCatalog(configSchema.parse({}), tmpDir);
      const paths = resolveDocumentFilter(catalog, 'code/common');
      expect([...paths]).toEqual(['code/common']);
    });

    it('matches when meta.name === documentPath (the simple case)', () => {
      const catalog = buildCatalog(configSchema.parse({}), tmpDir);
      const paths = resolveDocumentFilter(catalog, 'personal');
      expect([...paths]).toEqual(['personal']);
    });

    it('returns empty set for unknown document name', () => {
      const catalog = buildCatalog(configSchema.parse({}), tmpDir);
      const paths = resolveDocumentFilter(catalog, 'does-not-exist');
      expect(paths.size).toBe(0);
    });

    it('does NOT match by substring (P14 explicit over implicit)', () => {
      const catalog = buildCatalog(configSchema.parse({}), tmpDir);
      // "code" is a substring of "code-common" and "code-realtime" but
      // neither meta.name nor documentPath — must not match.
      const paths = resolveDocumentFilter(catalog, 'code');
      expect(paths.size).toBe(0);
    });

    it('does NOT match by partial path prefix', () => {
      const catalog = buildCatalog(configSchema.parse({}), tmpDir);
      // "common" is the file basename of code/common.yaml but not a full
      // documentPath or meta.name — must not match.
      const paths = resolveDocumentFilter(catalog, 'common');
      expect(paths.size).toBe(0);
    });
  });

  describe('filterElementsByDocument', () => {
    it('returns only elements whose documentPath is in the allowed set', () => {
      const catalog = buildCatalog(configSchema.parse({}), tmpDir);
      const allowed = resolveDocumentFilter(catalog, 'code-common');
      const filtered = filterElementsByDocument(
        catalog.getAllElements(),
        allowed,
      );
      const ids = filtered.map((e) => e.id).sort();
      expect(ids).toEqual(['CP1']);
    });

    it('returns empty array when allowed set is empty', () => {
      const catalog = buildCatalog(configSchema.parse({}), tmpDir);
      const filtered = filterElementsByDocument(
        catalog.getAllElements(),
        new Set(),
      );
      expect(filtered).toEqual([]);
    });
  });

  describe('meta.description is parsed and exposed', () => {
    it('is preserved on the document after parsing', () => {
      const catalog = buildCatalog(configSchema.parse({}), tmpDir);
      const personalDoc = catalog.documents.find(
        (d) => d.meta.name === 'personal',
      );
      expect(personalDoc?.meta.description).toBe(
        'Root personal library with universal goals and values',
      );

      const codeCommonDoc = catalog.documents.find(
        (d) => d.meta.name === 'code-common',
      );
      expect(codeCommonDoc?.meta.description).toBe('Common code principles');
    });

    it('is optional — documents without description still parse', () => {
      const catalog = buildCatalog(configSchema.parse({}), tmpDir);
      const realtimeDoc = catalog.documents.find(
        (d) => d.meta.name === 'code-realtime',
      );
      expect(realtimeDoc).toBeDefined();
      expect(realtimeDoc?.meta.description).toBeUndefined();
    });
  });
});
