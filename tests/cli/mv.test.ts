import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as yaml from 'js-yaml';

/**
 * Tests for `cairn mv` — move elements between documents and rename documents,
 * rewriting element references library-wide. Safety-critical: a silent
 * ref-rewrite bug corrupts decision traceability, so every operation must
 * leave the library passing `cairn validate --strict`.
 *
 * Library shape (two documents, child inherits parent):
 *   parent.yaml  (name: parent, scope: project)
 *   child.yaml   (name: child,  scope: implementation, inherits: [parent])
 *
 * Reference direction: child elements may reference parent elements
 * (descendant -> ancestor). A parent referencing a child is illegal.
 *
 * Element-reference fields (per the default schema) are:
 *   - top-level `maps_to`  (list<reference>)
 *   - `procedure.related`  (list<reference>)
 *   - `procedure.steps[].maps_to` (nested step-level list<reference>)
 * The `refs`/`considered` fields in the default schema are NOT element
 * references (refs = code refs file/identifier/role; considered = dict of
 * alternatives), so they are not rewritten.
 */
describe('cairn mv', () => {
  let tmpDir: string;

  function writeLib(): void {
    fs.mkdirSync(path.join(tmpDir, '.gvp', 'library'), { recursive: true });

    fs.writeFileSync(
      path.join(tmpDir, '.gvp', 'library', 'parent.yaml'),
      `meta:
  name: parent
  scope: project

goals:
  - id: G1
    name: Parent goal
    statement: Top level.
    tags: []
    maps_to: []

values:
  - id: V1
    name: Parent value
    statement: A value.
    tags: []
    maps_to:
      - parent:G1
`,
    );

    fs.writeFileSync(
      path.join(tmpDir, '.gvp', 'library', 'child.yaml'),
      `meta:
  name: child
  scope: implementation
  inherits:
    - parent

goals:
  - id: G1
    name: Child goal
    statement: A child-local goal that shares the G1 number with parent.
    tags: []
    maps_to: []

decisions:
  - id: D1
    name: Decision one
    statement: References a same-doc goal and a cross-doc value.
    rationale: Because.
    tags: []
    maps_to:
      - child:G1
      - parent:V1
    origin:
      - id: 11111111-1111-1111-1111-111111111111
        date: '2026-01-01T00:00:00.000Z'
        note: seeded

procedures:
  - id: S1
    name: A procedure referencing D1
    description: Inbound refs to child:D1 via related and a nested step maps_to.
    rationale: needed.
    tags: []
    maps_to:
      - child:G1
      - parent:V1
    related:
      - child:D1
    steps:
      - id: step1
        name: Use the decision
        maps_to:
          - child:D1
    origin:
      - id: 22222222-2222-2222-2222-222222222222
        date: '2026-01-01T00:00:00.000Z'
        note: seeded
`,
    );

    fs.writeFileSync(
      path.join(tmpDir, '.gvp', 'config.yaml'),
      `user:
  name: "Test User"
  email: "test@example.com"
`,
    );
  }

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cairn-mv-'));
    writeLib();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function runCairn(...args: string[]): { stdout: string; stderr: string; exitCode: number } {
    const cliPath = path.resolve(__dirname, '../../dist/cli/index.js');
    const result = spawnSync('node', [cliPath, ...args], {
      cwd: tmpDir,
      encoding: 'utf-8',
      timeout: 20000,
    });
    return {
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? '',
      exitCode: result.status ?? 1,
    };
  }

  function readLibDoc(docPath: string): Record<string, unknown> {
    const filePath = path.join(tmpDir, '.gvp', 'library', docPath + '.yaml');
    return yaml.load(fs.readFileSync(filePath, 'utf-8')) as Record<string, unknown>;
  }

  function findElement(doc: Record<string, unknown>, yamlKey: string, id: string): Record<string, unknown> | undefined {
    const arr = doc[yamlKey] as Array<Record<string, unknown>> | undefined;
    return arr?.find(e => e.id === id);
  }

  // (sanity) seed library passes validate --strict before any operation
  it('seed library passes validate --strict before any move (sanity)', () => {
    const v = runCairn('validate', '--strict');
    expect(v.exitCode).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // Mode A: element move
  // ---------------------------------------------------------------------------

  // (a) inbound rewrite incl. nested step-level refs
  it('rewrites all inbound maps_to / related / nested step maps_to references', () => {
    // Move child:D1 -> parent (no D-category there yet, so it keeps id D1 -> parent:D1).
    const result = runCairn('mv', 'child:D1', 'parent', '--yes');
    expect(result.exitCode).toBe(0);

    const child = readLibDoc('child');
    const parent = readLibDoc('parent');

    expect(findElement(child, 'decisions', 'D1')).toBeUndefined();
    expect(findElement(parent, 'decisions', 'D1')).toBeDefined();

    // Inbound: procedure S1 related (child:D1 -> parent:D1)
    const s1 = findElement(child, 'procedures', 'S1')!;
    expect(s1.related).toEqual(['parent:D1']);
    // Inbound: nested step-level maps_to (child:D1 -> parent:D1)
    const steps = s1.steps as Array<Record<string, unknown>>;
    expect(steps[0].maps_to).toEqual(['parent:D1']);

    const v = runCairn('validate', '--strict');
    expect(v.exitCode).toBe(0);
  });

  // (b) moved element's same-doc qualified outbound refs stay pinned to source doc
  it('keeps the moved element same-doc outbound references qualified to the source document', () => {
    // child:D1 maps_to [child:G1, parent:V1]. After moving D1 -> parent,
    // child:G1 must STAY child:G1 (different element from parent:G1).
    const result = runCairn('mv', 'child:D1', 'parent', '--yes');
    expect(result.exitCode).toBe(0);

    const parent = readLibDoc('parent');
    const movedD1 = findElement(parent, 'decisions', 'D1')!;
    expect(movedD1.maps_to).toContain('child:G1');
    expect(movedD1.maps_to).not.toContain('parent:G1');
    expect(movedD1.maps_to).toContain('parent:V1');

    const v = runCairn('validate', '--strict');
    expect(v.exitCode).toBe(0);
  });

  it('re-qualifies bare same-doc outbound refs to the source document', () => {
    // Author a bare same-doc ref in child (D1 maps_to bare G1 meaning child:G1).
    const childPath = path.join(tmpDir, '.gvp', 'library', 'child.yaml');
    const doc = yaml.load(fs.readFileSync(childPath, 'utf-8')) as Record<string, unknown>;
    const decisions = doc.decisions as Array<Record<string, unknown>>;
    const d1 = decisions.find(d => d.id === 'D1')!;
    d1.maps_to = ['G1', 'parent:V1']; // bare G1 == child:G1
    fs.writeFileSync(childPath, yaml.dump(doc, { lineWidth: -1, noRefs: true, sortKeys: false }));

    const result = runCairn('mv', 'child:D1', 'parent', '--yes');
    expect(result.exitCode).toBe(0);

    const parent = readLibDoc('parent');
    const movedD1 = findElement(parent, 'decisions', 'D1')!;
    expect(movedD1.maps_to).toContain('child:G1');
    expect(movedD1.maps_to).not.toContain('parent:G1');

    const v = runCairn('validate', '--strict');
    expect(v.exitCode).toBe(0);
  });

  // (c) ID collision in target -> reassignment per DEC-9.5, not overwrite
  it('reassigns the local ID per DEC-9.5 on collision instead of overwriting', () => {
    const parentPath = path.join(tmpDir, '.gvp', 'library', 'parent.yaml');
    const doc = yaml.load(fs.readFileSync(parentPath, 'utf-8')) as Record<string, unknown>;
    // status deprecated so it is exempt from W005 (self-document-only mapping)
    // and W003/W014 traceability — we only need it to occupy the D1 slot.
    doc.decisions = [
      { id: 'D1', name: 'Pre-existing parent decision', status: 'deprecated', statement: 'Do not overwrite me.', rationale: 'x', tags: [], maps_to: ['parent:G1', 'parent:V1'] },
    ];
    fs.writeFileSync(parentPath, yaml.dump(doc, { lineWidth: -1, noRefs: true, sortKeys: false }));

    const result = runCairn('mv', 'child:D1', 'parent', '--yes');
    expect(result.exitCode).toBe(0);

    const parent = readLibDoc('parent');
    const decisions = parent.decisions as Array<Record<string, unknown>>;
    const origD1 = decisions.find(d => d.name === 'Pre-existing parent decision')!;
    expect(origD1.id).toBe('D1');
    const moved = decisions.find(d => d.name === 'Decision one')!;
    expect(moved.id).toBe('D2');

    // Inbound refs to child:D1 must now point at parent:D2 (the reassigned id)
    const child = readLibDoc('child');
    const s1 = findElement(child, 'procedures', 'S1')!;
    expect(s1.related).toEqual(['parent:D2']);
    const steps = s1.steps as Array<Record<string, unknown>>;
    expect(steps[0].maps_to).toEqual(['parent:D2']);

    const v = runCairn('validate', '--strict');
    expect(v.exitCode).toBe(0);
  });

  // (d) provenance preserved + move stamped
  it('preserves provenance and stamps the move', () => {
    const result = runCairn('mv', 'child:D1', 'parent', '--yes');
    expect(result.exitCode).toBe(0);

    const parent = readLibDoc('parent');
    const moved = findElement(parent, 'decisions', 'D1')!;
    const origin = moved.origin as Array<Record<string, unknown>>;
    expect(origin.some(o => o.id === '11111111-1111-1111-1111-111111111111')).toBe(true);
    expect(origin.length).toBeGreaterThan(1);
    const stamp = origin[origin.length - 1];
    expect(String(stamp.note ?? '')).toMatch(/move/i);
  });

  // (h) illegal parent->child move is refused
  it('refuses a move that would create a parent->child (illegal-direction) reference', () => {
    // Add a parent decision that references parent:V1, then move V1 -> child.
    // After such a move, parent:D1 -> child:V1 would be a parent->child ref.
    const parentPath = path.join(tmpDir, '.gvp', 'library', 'parent.yaml');
    const doc = yaml.load(fs.readFileSync(parentPath, 'utf-8')) as Record<string, unknown>;
    doc.decisions = [
      { id: 'D1', name: 'Parent decision referencing V1', statement: 'x', rationale: 'x', tags: [], maps_to: ['parent:V1'] },
    ];
    fs.writeFileSync(parentPath, yaml.dump(doc, { lineWidth: -1, noRefs: true, sortKeys: false }));

    const result = runCairn('mv', 'parent:V1', 'child', '--yes');
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr.toLowerCase()).toMatch(/parent.*child|illegal|direction|inheritance/);

    const parent = readLibDoc('parent');
    expect(findElement(parent, 'values', 'V1')).toBeDefined();
  });

  // (g) --dry-run writes nothing
  it('--dry-run previews everything and writes nothing (element move)', () => {
    const before = fs.readFileSync(path.join(tmpDir, '.gvp', 'library', 'child.yaml'), 'utf-8');
    const beforeParent = fs.readFileSync(path.join(tmpDir, '.gvp', 'library', 'parent.yaml'), 'utf-8');

    const result = runCairn('mv', 'child:D1', 'parent', '--dry-run');
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toMatch(/child:D1/);
    expect(result.stderr).toMatch(/parent:D1/);

    expect(fs.readFileSync(path.join(tmpDir, '.gvp', 'library', 'child.yaml'), 'utf-8')).toBe(before);
    expect(fs.readFileSync(path.join(tmpDir, '.gvp', 'library', 'parent.yaml'), 'utf-8')).toBe(beforeParent);
  });

  // ---------------------------------------------------------------------------
  // Mode B: document rename
  // ---------------------------------------------------------------------------

  // (e) doc-rename re-qualifies all elements + rewrites qualified internal refs + cross-doc inbound refs
  it('renames a document: updates meta.name and rewrites all qualified references library-wide', () => {
    const result = runCairn('mv', '--doc', 'parent', 'core', '--yes');
    expect(result.exitCode).toBe(0);

    // The file is renamed parent.yaml -> core.yaml so documentPath matches the
    // new name (references resolve by documentPath).
    expect(fs.existsSync(path.join(tmpDir, '.gvp', 'library', 'parent.yaml'))).toBe(false);
    const core = readLibDoc('core');
    expect((core.meta as Record<string, unknown>).name).toBe('core');

    // Within-doc fully-qualified ref rewritten: parent:V1 maps_to parent:G1 -> core:G1
    const v1 = findElement(core, 'values', 'V1')!;
    expect(v1.maps_to).toEqual(['core:G1']);

    // Cross-doc inbound refs in child rewritten: parent:V1 -> core:V1
    const child = readLibDoc('child');
    expect((child.meta as Record<string, unknown>).inherits).toEqual(['core']);
    const d1 = findElement(child, 'decisions', 'D1')!;
    expect(d1.maps_to).toContain('core:V1');
    expect(d1.maps_to).toContain('child:G1'); // within-child ref unchanged
    const s1 = findElement(child, 'procedures', 'S1')!;
    expect(s1.maps_to).toContain('core:V1');

    const v = runCairn('validate', '--strict');
    expect(v.exitCode).toBe(0);
  });

  it('--dry-run previews a doc rename and writes nothing', () => {
    const before = fs.readFileSync(path.join(tmpDir, '.gvp', 'library', 'parent.yaml'), 'utf-8');
    const beforeChild = fs.readFileSync(path.join(tmpDir, '.gvp', 'library', 'child.yaml'), 'utf-8');

    const result = runCairn('mv', '--doc', 'parent', 'core', '--dry-run');
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toMatch(/core/);

    expect(fs.readFileSync(path.join(tmpDir, '.gvp', 'library', 'parent.yaml'), 'utf-8')).toBe(before);
    expect(fs.readFileSync(path.join(tmpDir, '.gvp', 'library', 'child.yaml'), 'utf-8')).toBe(beforeChild);
  });
});
