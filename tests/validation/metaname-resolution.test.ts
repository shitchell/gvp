import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { buildCatalog } from '../../src/cli/helpers.js';
import { configSchema } from '../../src/config/schema.js';
import { structuralPass } from '../../src/validation/passes/structural-pass.js';

/**
 * Integration: meta.name-based reference resolution (#11) and document-name
 * uniqueness (#12, E006), exercised through buildCatalog + the structural pass.
 */
describe('meta.name reference resolution + E006 (#11, #12)', () => {
  let tmpDir: string;
  const config = configSchema.parse({});

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cairn-metaname-'));
    fs.mkdirSync(path.join(tmpDir, '.gvp', 'library', 'code'), { recursive: true });
  });
  afterEach(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  const write = (rel: string, body: string) =>
    fs.writeFileSync(path.join(tmpDir, '.gvp', 'library', rel), body);

  const e001 = () => structuralPass(buildCatalog(config, tmpDir), config).filter(d => d.code === 'E001');
  const e006 = () => structuralPass(buildCatalog(config, tmpDir), config).filter(d => d.code === 'E006');

  it('resolves an inherited ref by meta.name, not by file path (#11)', () => {
    write('root.yaml', `meta: {name: root}\ngoals: [{id: G1, name: G, statement: x, maps_to: []}]\nvalues: [{id: V1, name: V, statement: x, maps_to: []}]\n`);
    write('code/common.yaml', `meta: {name: code-common, inherits: root}\nprinciples: [{id: CP7, name: P, statement: x, maps_to: [root:G1, root:V1]}]\n`);

    // meta.name form resolves cleanly …
    write('proj.yaml', `meta: {name: proj, inherits: code-common}\ndecisions: [{id: D1, name: D, rationale: x, maps_to: [root:G1, root:V1, "code-common:CP7"]}]\n`);
    expect(e001().map(d => d.context.elementId)).not.toContain('D1');
  });

  it('still resolves the old file-path form as a lenient fallback (#13/path-fallback)', () => {
    write('root.yaml', `meta: {name: root}\ngoals: [{id: G1, name: G, statement: x, maps_to: []}]\nvalues: [{id: V1, name: V, statement: x, maps_to: []}]\n`);
    write('code/common.yaml', `meta: {name: code-common, inherits: root}\nprinciples: [{id: CP7, name: P, statement: x, maps_to: [root:G1, root:V1]}]\n`);
    write('proj.yaml', `meta: {name: proj, inherits: code-common}\ndecisions: [{id: D1, name: D, rationale: x, maps_to: [root:G1, root:V1, "code/common:CP7"]}]\n`);

    // path-form ref no longer breaks — meta.name is primary, path is a fallback.
    expect(e001().map(d => d.context.elementId)).not.toContain('D1');
  });

  it('resolves an inherited alias-prefixed ref across multiple leaf documents (#13)', () => {
    // Source library (separate source) with an element to reference via alias.
    fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'src', 'personal.yaml'), `meta: {name: personal}\nvalues: [{id: V1, name: V, statement: x, maps_to: []}]\n`);
    const src = path.join(tmpDir, 'src');
    // Leaf A declares the alias and uses it; leaf B is a second leaf whose (empty)
    // alias map must NOT clobber A's alias.
    write('aaa-main.yaml', `meta: {name: aaa-main, inherits: [{source: ${src}, as: me}]}\ndecisions: [{id: D1, name: D, rationale: x, maps_to: ["me:personal:V1"]}]\n`);
    write('zzz-other.yaml', `meta: {name: zzz-other}\ngoals: [{id: G1, name: G, statement: x, maps_to: []}]\n`);

    expect(e001().map(d => d.context.elementId)).not.toContain('D1');
  });

  it('resolves an alias declared in a NON-leaf ancestor document (#13)', () => {
    // The alias-declaring doc (project) is inherited by another local doc (child),
    // so project is NOT a leaf. Its `as: me` must still be in scope for its own
    // reference — aliases are collected from every doc, not just leaves.
    fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'src', 'personal.yaml'), `meta: {name: personal}\nvalues: [{id: V1, name: V, statement: x, maps_to: []}]\n`);
    const src = path.join(tmpDir, 'src');
    write('project.yaml', `meta: {name: project, inherits: [{source: ${src}, as: me}]}\ndecisions: [{id: D1, name: D, rationale: x, maps_to: ["me:personal:V1"]}]\n`);
    write('child.yaml', `meta: {name: child, inherits: project}\ngoals: [{id: G1, name: G, statement: x, maps_to: []}]\n`);

    expect(e001().map(d => d.context.elementId)).not.toContain('D1');
  });

  it('aliases are document-local: a child cannot use its parent\'s alias (D39)', () => {
    // parent declares `as: me`; child inherits parent but does NOT declare `me`.
    // Like Python `import bar as b`, `me` is private to the declaring document.
    fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'src', 'personal.yaml'), `meta: {name: personal}\nvalues: [{id: V1, name: V, statement: x, maps_to: []}]\n`);
    const src = path.join(tmpDir, 'src');
    write('parent.yaml', `meta: {name: parent, inherits: [{source: ${src}, as: me}]}\ngoals: [{id: G1, name: G, statement: x, maps_to: []}]\n`);
    write('child.yaml', `meta: {name: child, inherits: parent}\ndecisions: [{id: CD1, name: D, rationale: x, maps_to: ["me:personal:V1"]}]\n`);

    expect(e001().map(d => d.context.elementId)).toContain('CD1');
  });

  it('does not leak an inherited library\'s private alias into the consumer (D39)', () => {
    // subsrc <- midlib (declares `as: internal`) <- project (declares `as: mid`).
    fs.mkdirSync(path.join(tmpDir, 'subsrc'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'subsrc', 'deep.yaml'), `meta: {name: deep}\nvalues: [{id: V1, name: V, statement: x, maps_to: []}]\n`);
    fs.mkdirSync(path.join(tmpDir, 'midlib'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'midlib', 'mid.yaml'), `meta: {name: mid, inherits: [{source: ${path.join(tmpDir, 'subsrc')}, as: internal}]}\nprinciples: [{id: MP1, name: P, statement: x, maps_to: ["internal:deep:V1"]}]\n`);
    write('project.yaml', `meta: {name: project, inherits: [{source: ${path.join(tmpDir, 'midlib')}, as: mid}]}\ndecisions: [{id: D1, name: D, rationale: x, maps_to: ["internal:deep:V1"]}]\n`);

    const ids = e001().map(d => d.context.elementId);
    expect(ids).toContain('D1');      // project cannot use midlib's private `internal`
    expect(ids).not.toContain('MP1'); // midlib's own internal ref still resolves
  });

  it('fires E006 for two documents in one library sharing a meta.name (#12)', () => {
    write('a.yaml', `meta: {name: shared}\ngoals: [{id: G1, name: G, statement: x, maps_to: []}]\n`);
    write('b.yaml', `meta: {name: shared}\nvalues: [{id: V1, name: V, statement: x, maps_to: []}]\n`);
    const errs = e006();
    expect(errs).toHaveLength(1);
    expect(errs[0]!.description).toContain("document name 'shared'");
  });

  it('does not fire E006 when document names are unique', () => {
    write('a.yaml', `meta: {name: alpha}\ngoals: [{id: G1, name: G, statement: x, maps_to: []}]\n`);
    write('b.yaml', `meta: {name: beta}\nvalues: [{id: V1, name: V, statement: x, maps_to: []}]\n`);
    expect(e006()).toHaveLength(0);
  });
});
