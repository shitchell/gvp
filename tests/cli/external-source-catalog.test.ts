import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { buildCatalog } from '../../src/cli/helpers.js';
import { configSchema } from '../../src/config/schema.js';

/**
 * Integration tests for object-form `inherits` that names an EXTERNAL
 * source library by local filesystem path — the align -> ~/.gvp use case.
 *
 * Object-form `inherits` ({ source: <path>, as: <alias> }) loads EVERY
 * document from the named source library. Those documents merge into the
 * catalog keyed by their own documentPath, so references use the natural
 * 2-segment `document:element` form (e.g. personal:V2, code/common:CP7) —
 * identical to same-library refs.
 */
describe('CLI buildCatalog — external-source (local path) inheritance', () => {
  let srcRoot: string; // personal-style source library root
  let projRoot: string; // consuming project root

  beforeEach(() => {
    srcRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cairn-extsrc-'));
    projRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cairn-extproj-'));

    const srcLib = path.join(srcRoot, '.gvp', 'library', 'code');
    fs.mkdirSync(srcLib, { recursive: true });
    fs.writeFileSync(
      path.join(srcRoot, '.gvp', 'library', 'personal.yaml'),
      `
meta:
  name: personal
values:
  - id: V1
    name: Simplicity
    statement: Keep it simple.
    tags: []
    maps_to: []
  - id: V2
    name: Transparency
    statement: Be honest about trade-offs.
    tags: []
    maps_to: []
`,
    );
    fs.writeFileSync(
      path.join(srcRoot, '.gvp', 'library', 'code', 'common.yaml'),
      `
meta:
  name: code-common
principles:
  - id: CP7
    name: Fail loudly
    statement: Errors should be visible.
    tags: []
    maps_to: []
`,
    );

    fs.mkdirSync(path.join(projRoot, '.gvp', 'library'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(srcRoot, { recursive: true, force: true });
    fs.rmSync(projRoot, { recursive: true, force: true });
  });

  function writeProjectDoc(content: string): void {
    fs.writeFileSync(path.join(projRoot, '.gvp', 'library', 'main.yaml'), content);
  }

  function projConfig() {
    return configSchema.parse({});
  }

  it('pulls all docs from a local-path source; cross-source refs resolve', () => {
    writeProjectDoc(`
meta:
  name: main
  inherits:
    - source: "${srcRoot}"
      as: personal
decisions:
  - id: D1
    name: Reuse personal lib
    rationale: cross-source.
    tags: []
    maps_to: [personal:V2, code/common:CP7]
`);
    const catalog = buildCatalog(projConfig(), projRoot);
    const libIds = catalog.getAllElements().map((e) => e.toLibraryId());

    expect(libIds).toContain('personal:V1');
    expect(libIds).toContain('personal:V2');
    expect(libIds).toContain('code/common:CP7');
    expect(libIds).toContain('main:D1');
  });

  it('source documents carry the raw source string as their source', () => {
    writeProjectDoc(`
meta:
  name: main
  inherits:
    - source: "${srcRoot}"
      as: personal
`);
    const catalog = buildCatalog(projConfig(), projRoot);
    const v2 = catalog.getAllElements().find((e) => e.toLibraryId() === 'personal:V2');
    expect(v2?.source).toBe(srcRoot);
  });

  it('errors clearly when the source path does not resolve', () => {
    writeProjectDoc(`
meta:
  name: main
  inherits:
    - source: "/no/such/cairn/source/path/xyz"
      as: personal
`);
    expect(() => buildCatalog(projConfig(), projRoot)).toThrow(
      /Failed to load inherited source|Cannot resolve source/,
    );
  });
});
