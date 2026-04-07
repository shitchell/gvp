import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { buildCatalog } from '../../src/cli/helpers.js';
import { configSchema } from '../../src/config/schema.js';

/**
 * Regression tests for src/cli/helpers.ts buildCatalog inheritance resolution.
 *
 * Bug: when an inheriting document references its parent by `meta.name`
 * (e.g. `inherits: code-common`), the loader and leaf-detection logic in
 * buildCatalog were comparing against the document's filesystem-relative
 * `docPath` (e.g. `code/common`) instead of its `meta.name`. The result was
 * that nested-directory libraries failed with "Document not found:
 * code-common.yaml" whenever a child's name did not match its file path.
 *
 * These tests use Guy's personal library shape as the canonical fixture: a
 * root doc at the library root plus a `code/` subdirectory whose docs are
 * named `code-common`, `code-realtime`, `code-web`.
 */
describe('CLI buildCatalog — nested-directory inheritance', () => {
  let tmpDir: string;
  let cwd: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cairn-build-catalog-'));
    cwd = tmpDir;
    fs.mkdirSync(path.join(tmpDir, '.gvp', 'library', 'code'), {
      recursive: true,
    });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeLib(relPath: string, content: string): void {
    const fullPath = path.join(tmpDir, '.gvp', 'library', relPath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content);
  }

  it('resolves inherits by meta.name when name differs from docPath', () => {
    // personal.yaml — name === docPath (the easy case that already worked)
    writeLib(
      'personal.yaml',
      `
meta:
  name: personal
  scope: universal

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

    // code/common.yaml — name "code-common" differs from docPath "code/common"
    writeLib(
      'code/common.yaml',
      `
meta:
  name: code-common
  scope: personal
  inherits: personal

principles:
  - id: CP1
    name: Common principle
    statement: Code should be clear.
    tags: []
    maps_to: [personal:V1]
`,
    );

    // code/realtime.yaml — name "code-realtime", inherits parent BY NAME
    writeLib(
      'code/realtime.yaml',
      `
meta:
  name: code-realtime
  scope: personal
  inherits: code-common

principles:
  - id: RTP1
    name: Realtime principle
    statement: Hot loops do not allocate.
    tags: []
    maps_to: [personal:V1]
`,
    );

    const config = configSchema.parse({});
    const catalog = buildCatalog(config, cwd);

    const elementIds = catalog.getAllElements().map((e) => e.id);
    // All three documents should be merged into the catalog without errors.
    expect(elementIds).toContain('G1');
    expect(elementIds).toContain('V1');
    expect(elementIds).toContain('CP1');
    expect(elementIds).toContain('RTP1');
  });

  it('does not double-include parent documents that are referenced by name', () => {
    // Diamond shape with name-based inherits:
    // personal (root) <- code-common <- {code-realtime, code-web}
    writeLib(
      'personal.yaml',
      `
meta:
  name: personal
  scope: universal

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

    writeLib(
      'code/common.yaml',
      `
meta:
  name: code-common
  scope: personal
  inherits: personal

principles:
  - id: CP1
    name: Common principle
    statement: Code should be clear.
    tags: []
    maps_to: [personal:V1]
`,
    );

    writeLib(
      'code/realtime.yaml',
      `
meta:
  name: code-realtime
  scope: personal
  inherits: code-common

principles:
  - id: RTP1
    name: Realtime principle
    statement: Hot loops do not allocate.
    tags: []
    maps_to: [personal:V1]
`,
    );

    writeLib(
      'code/web.yaml',
      `
meta:
  name: code-web
  scope: personal
  inherits: code-common

principles:
  - id: WP1
    name: Web principle
    statement: Sanitize DOM input.
    tags: []
    maps_to: [personal:V1]
`,
    );

    const config = configSchema.parse({});
    const catalog = buildCatalog(config, cwd);

    // code-common should appear exactly once even though both code-realtime
    // and code-web inherit from it.
    const cp1Elements = catalog
      .getAllElements()
      .filter((e) => e.id === 'CP1');
    expect(cp1Elements).toHaveLength(1);

    // All four documents' elements should be present.
    const ids = catalog.getAllElements().map((e) => e.id);
    expect(ids).toContain('G1');
    expect(ids).toContain('CP1');
    expect(ids).toContain('RTP1');
    expect(ids).toContain('WP1');
  });

  it('still resolves inherits by docPath when name === docPath', () => {
    // Backward-compat: the "easy" case where name and docPath agree
    // (which is what the existing inheritance integration test exercises)
    // must continue to work after the fix.
    writeLib(
      'org.yaml',
      `
meta:
  name: org
  scope: universal

goals:
  - id: G1
    name: Org goal
    statement: An org goal.
    tags: []
    maps_to: []
`,
    );

    writeLib(
      'project.yaml',
      `
meta:
  name: project
  scope: project
  inherits: org

decisions:
  - id: D1
    name: Use TypeScript
    rationale: Type safety.
    tags: []
    maps_to: [org:G1]
`,
    );

    const config = configSchema.parse({});
    const catalog = buildCatalog(config, cwd);

    const ids = catalog.getAllElements().map((e) => e.id);
    expect(ids).toContain('G1');
    expect(ids).toContain('D1');
  });
});
