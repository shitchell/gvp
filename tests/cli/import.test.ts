import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as yaml from 'js-yaml';

describe('cairn import', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cairn-import-'));
    fs.mkdirSync(path.join(tmpDir, '.gvp', 'library'), { recursive: true });

    // Base library with some existing elements
    fs.writeFileSync(
      path.join(tmpDir, '.gvp', 'library', 'main.yaml'),
      `
meta:
  name: main
  scope: project

goals:
  - id: G1
    name: Existing goal
    statement: Already here.
    tags: []
    maps_to: []

values:
  - id: V1
    name: Existing value
    statement: Already here.
    tags: []
    maps_to: [main:G1]

principles:
  - id: P1
    name: Existing principle
    statement: Already here.
    tags: []
    maps_to: [main:G1, main:V1]
`,
    );

    // Config with user identity
    fs.writeFileSync(
      path.join(tmpDir, '.gvp', 'config.yaml'),
      `
user:
  name: "Test User"
  email: "test@example.com"
`,
    );
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function runCairn(...args: string[]): { stdout: string; stderr: string; exitCode: number } {
    const cliPath = path.resolve(__dirname, '../../dist/cli/index.js');
    const result = spawnSync('node', [cliPath, ...args], {
      cwd: tmpDir,
      encoding: 'utf-8',
      timeout: 15000,
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

  // 1. Single-file import with pseudo-IDs
  it('assigns real IDs to pseudo-ID elements in single-file mode', () => {
    const patchFile = path.join(tmpDir, 'patch.yaml');
    fs.writeFileSync(patchFile, `
meta:
  import: true
principles:
  - id: "?P1"
    name: New principle
    statement: From the patch.
    tags: []
    maps_to: [main:G1, main:V1]
`);
    const result = runCairn('import', patchFile, '--into', 'main', '--yes');
    expect(result.exitCode).toBe(0);
    const data = readLibDoc('main');
    const principles = data.principles as Array<Record<string, unknown>>;
    // P1 already exists, so new one should be P2
    const p2 = principles.find(p => p.id === 'P2');
    expect(p2).toBeDefined();
    expect(p2!.name).toBe('New principle');
  });

  // 2. Cross-references within patch
  it('rewrites cross-references between candidates in the same patch', () => {
    const patchFile = path.join(tmpDir, 'patch.yaml');
    fs.writeFileSync(patchFile, `
meta:
  import: true
goals:
  - id: "?G1"
    name: New goal
    statement: Fresh.
    tags: []
    maps_to: []
principles:
  - id: "?P1"
    name: New principle
    statement: Depends on new goal.
    tags: []
    maps_to: ["?G1", main:V1]
`);
    const result = runCairn('import', patchFile, '--into', 'main', '--yes');
    expect(result.exitCode).toBe(0);
    const data = readLibDoc('main');
    const principles = data.principles as Array<Record<string, unknown>>;
    const newP = principles.find(p => p.name === 'New principle');
    expect(newP).toBeDefined();
    // ?G1 should be rewritten to main:G2 (G1 already exists)
    expect(newP!.maps_to).toContain('main:G2');
    expect(newP!.maps_to).toContain('main:V1');
  });

  // 3. Mixed references
  it('preserves real references alongside rewritten pseudo-IDs', () => {
    const patchFile = path.join(tmpDir, 'patch.yaml');
    fs.writeFileSync(patchFile, `
meta:
  import: true
principles:
  - id: "?P1"
    name: Mixed refs
    statement: Mix.
    tags: []
    maps_to: [main:G1, main:V1]
`);
    const result = runCairn('import', patchFile, '--into', 'main', '--yes');
    expect(result.exitCode).toBe(0);
    const data = readLibDoc('main');
    const principles = data.principles as Array<Record<string, unknown>>;
    const newP = principles.find(p => p.name === 'Mixed refs');
    expect(newP).toBeDefined();
    expect(newP!.maps_to).toContain('main:G1');
    expect(newP!.maps_to).toContain('main:V1');
  });

  // 4. --into target resolution
  it('resolves --into by meta.name', () => {
    const patchFile = path.join(tmpDir, 'patch.yaml');
    fs.writeFileSync(patchFile, `
meta:
  import: true
goals:
  - id: "?G1"
    name: By name
    statement: Found by meta.name.
    tags: []
    maps_to: []
`);
    const result = runCairn('import', patchFile, '--into', 'main', '--yes');
    expect(result.exitCode).toBe(0);
    const data = readLibDoc('main');
    const goals = data.goals as Array<Record<string, unknown>>;
    expect(goals.find(g => g.name === 'By name')).toBeDefined();
  });

  // 5. --dry-run
  it('--dry-run shows preview without writing', () => {
    const patchFile = path.join(tmpDir, 'patch.yaml');
    fs.writeFileSync(patchFile, `
meta:
  import: true
goals:
  - id: "?G1"
    name: Dry run goal
    statement: Should not be written.
    tags: []
    maps_to: []
`);
    const result = runCairn('import', patchFile, '--into', 'main', '--dry-run');
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toContain('Dry run');
    // Verify nothing was written
    const data = readLibDoc('main');
    const goals = data.goals as Array<Record<string, unknown>>;
    expect(goals.find(g => g.name === 'Dry run goal')).toBeUndefined();
  });

  // 6. --yes mode
  it('--yes skips confirmation', () => {
    const patchFile = path.join(tmpDir, 'patch.yaml');
    fs.writeFileSync(patchFile, `
meta:
  import: true
goals:
  - id: "?G1"
    name: Auto-confirmed
    statement: Yes mode.
    tags: []
    maps_to: []
`);
    const result = runCairn('import', patchFile, '--into', 'main', '--yes');
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toContain('Import complete');
  });

  // 7. Element update (real ID)
  it('updates existing elements when patch uses real IDs', () => {
    const patchFile = path.join(tmpDir, 'patch.yaml');
    fs.writeFileSync(patchFile, `
meta:
  import: true
goals:
  - id: G1
    name: Existing goal
    statement: Updated statement from patch.
    tags: [updated]
    maps_to: []
`);
    const result = runCairn('import', patchFile, '--into', 'main', '--yes');
    expect(result.exitCode).toBe(0);
    const data = readLibDoc('main');
    const goals = data.goals as Array<Record<string, unknown>>;
    const g1 = goals.find(g => g.id === 'G1');
    expect(g1!.statement).toBe('Updated statement from patch.');
    expect(g1!.tags).toContain('updated');
  });

  // 8. Element deprecation
  it('deprecates an element via status change', () => {
    const patchFile = path.join(tmpDir, 'patch.yaml');
    fs.writeFileSync(patchFile, `
meta:
  import: true
goals:
  - id: G1
    name: Existing goal
    status: deprecated
    maps_to: []
`);
    const result = runCairn('import', patchFile, '--into', 'main', '--yes');
    expect(result.exitCode).toBe(0);
    const data = readLibDoc('main');
    const goals = data.goals as Array<Record<string, unknown>>;
    const g1 = goals.find(g => g.id === 'G1');
    expect(g1!.status).toBe('deprecated');
  });

  // 9. Origin auto-population
  it('adds origin entry to new elements and preserves existing origin', () => {
    const patchFile = path.join(tmpDir, 'patch.yaml');
    fs.writeFileSync(patchFile, `
meta:
  import: true
goals:
  - id: "?G1"
    name: With existing origin
    statement: Has origin already.
    tags: []
    maps_to: []
    origin:
      - date: "2026-01-01"
        note: "Original origin"
`);
    const result = runCairn('import', patchFile, '--into', 'main', '--yes');
    expect(result.exitCode).toBe(0);
    const data = readLibDoc('main');
    const goals = data.goals as Array<Record<string, unknown>>;
    const newG = goals.find(g => g.name === 'With existing origin');
    expect(newG).toBeDefined();
    const origin = newG!.origin as Array<Record<string, unknown>>;
    expect(origin).toHaveLength(2);
    expect(origin[0]!.note).toBe('Original origin');
    expect(origin[1]!.note).toMatch(/Imported from/);
  });

  // 10. Directory mode: multi-document import
  it('directory mode imports elements to multiple documents by relative path', () => {
    // Add a second library document
    fs.writeFileSync(
      path.join(tmpDir, '.gvp', 'library', 'obs.yaml'),
      `
meta:
  name: obs
  scope: project
  definitions:
    categories:
      observation:
        yaml_key: observations
        id_prefix: OBS
        is_root: true
        primary_field: statement
`,
    );
    // Create patch directory
    const patchDir = path.join(tmpDir, 'patches');
    fs.mkdirSync(patchDir, { recursive: true });
    fs.writeFileSync(path.join(patchDir, 'main.yaml'), `
meta:
  import: true
goals:
  - id: "?G1"
    name: Dir mode goal
    statement: From dir mode.
    tags: []
    maps_to: []
`);
    fs.writeFileSync(path.join(patchDir, 'obs.yaml'), `
meta:
  import: true
observations:
  - id: "?OBS1"
    name: Dir mode observation
    statement: From dir mode obs.
    tags: []
    maps_to: []
`);
    const result = runCairn('import', patchDir, '--yes');
    expect(result.exitCode).toBe(0);
    // Check main got the goal
    const mainData = readLibDoc('main');
    const goals = mainData.goals as Array<Record<string, unknown>>;
    expect(goals.find(g => g.name === 'Dir mode goal')).toBeDefined();
    // Check obs got the observation
    const obsData = readLibDoc('obs');
    const obs = obsData.observations as Array<Record<string, unknown>>;
    expect(obs).toBeDefined();
    expect(obs.find((o: Record<string, unknown>) => o.name === 'Dir mode observation')).toBeDefined();
  });

  // 11. Directory mode: document creation
  it('directory mode creates new documents', () => {
    const patchDir = path.join(tmpDir, 'patches');
    fs.mkdirSync(patchDir, { recursive: true });
    fs.writeFileSync(path.join(patchDir, 'newdoc.yaml'), `
meta:
  import: true
goals:
  - id: "?G1"
    name: Goal in new doc
    statement: Created by import.
    tags: []
    maps_to: []
`);
    const result = runCairn('import', patchDir, '--yes');
    expect(result.exitCode).toBe(0);
    // New document should exist
    const newDocPath = path.join(tmpDir, '.gvp', 'library', 'newdoc.yaml');
    expect(fs.existsSync(newDocPath)).toBe(true);
    const data = yaml.load(fs.readFileSync(newDocPath, 'utf-8')) as Record<string, unknown>;
    const goals = data.goals as Array<Record<string, unknown>>;
    expect(goals.find(g => g.name === 'Goal in new doc')).toBeDefined();
  });

  // 12. Manifest document deletion
  it('deletes documents listed in _manifest.yaml with --confirm-delete', () => {
    // Add a doc to delete
    fs.writeFileSync(
      path.join(tmpDir, '.gvp', 'library', 'expendable.yaml'),
      `
meta:
  name: expendable
  scope: project
goals:
  - id: G1
    name: Doomed
    statement: Will be deleted.
    tags: []
    maps_to: []
`,
    );
    const patchDir = path.join(tmpDir, 'patches');
    fs.mkdirSync(patchDir, { recursive: true });
    fs.writeFileSync(path.join(patchDir, '_manifest.yaml'), `
delete_documents:
  - expendable
`);
    // Without --confirm-delete: should error
    const result1 = runCairn('import', patchDir, '--yes');
    expect(result1.exitCode).not.toBe(0);
    expect(result1.stderr).toContain('--confirm-delete');
    // With --confirm-delete: should succeed
    const result2 = runCairn('import', patchDir, '--yes', '--confirm-delete');
    expect(result2.exitCode).toBe(0);
    expect(fs.existsSync(path.join(tmpDir, '.gvp', 'library', 'expendable.yaml'))).toBe(false);
  });

  // 13. Error: unresolved pseudo-ID
  it('errors on unresolved pseudo-ID in maps_to', () => {
    const patchFile = path.join(tmpDir, 'patch.yaml');
    fs.writeFileSync(patchFile, `
meta:
  import: true
principles:
  - id: "?P1"
    name: Bad ref
    statement: References a non-existent candidate.
    tags: []
    maps_to: ["?NOPE", main:V1]
`);
    const result = runCairn('import', patchFile, '--into', 'main', '--yes');
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain('Unresolved pseudo-ID');
    expect(result.stderr).toContain('?NOPE');
  });

  // 14. Error: pseudo-ID collision
  it('errors on pseudo-ID collision within same category', () => {
    const patchDir = path.join(tmpDir, 'patches');
    fs.mkdirSync(patchDir, { recursive: true });
    fs.writeFileSync(path.join(patchDir, 'a.yaml'), `
meta:
  import: true
goals:
  - id: "?G1"
    name: First
    statement: First.
    tags: []
    maps_to: []
`);
    fs.writeFileSync(path.join(patchDir, 'b.yaml'), `
meta:
  import: true
goals:
  - id: "?G1"
    name: Duplicate
    statement: Collision.
    tags: []
    maps_to: []
`);
    const result = runCairn('import', patchDir, '--yes');
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain('collision');
  });

  // 15. Error: --into with directory mode
  it('errors when --into is used with directory mode', () => {
    const patchDir = path.join(tmpDir, 'patches');
    fs.mkdirSync(patchDir, { recursive: true });
    fs.writeFileSync(path.join(patchDir, 'main.yaml'), `
meta:
  import: true
goals:
  - id: "?G1"
    name: X
    statement: X.
    tags: []
    maps_to: []
`);
    const result = runCairn('import', patchDir, '--into', 'main', '--yes');
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain('--into cannot be used with directory mode');
  });

  // 16. Error: missing --into in single-file mode
  it('errors when --into is missing in single-file mode', () => {
    const patchFile = path.join(tmpDir, 'patch.yaml');
    fs.writeFileSync(patchFile, `
meta:
  import: true
goals:
  - id: "?G1"
    name: X
    statement: X.
    tags: []
    maps_to: []
`);
    const result = runCairn('import', patchFile, '--yes');
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain('--into is required');
  });

  // 17. Step-level maps_to rewriting
  it('rewrites pseudo-IDs in step-level maps_to (R6 generic)', () => {
    const patchFile = path.join(tmpDir, 'patch.yaml');
    fs.writeFileSync(patchFile, `
meta:
  import: true
goals:
  - id: "?G1"
    name: New goal for step ref
    statement: Target.
    tags: []
    maps_to: []
procedures:
  - id: "?S1"
    name: Procedure with step refs
    description: Steps reference candidate.
    tags: []
    maps_to: [main:G1, main:V1]
    steps:
      - id: "?S1.1"
        name: Step one
        maps_to: ["?G1"]
`);
    const result = runCairn('import', patchFile, '--into', 'main', '--yes');
    expect(result.exitCode).toBe(0);
    const data = readLibDoc('main');
    const procedures = data.procedures as Array<Record<string, unknown>>;
    const proc = procedures.find(p => p.name === 'Procedure with step refs');
    expect(proc).toBeDefined();
    const steps = proc!.steps as Array<Record<string, unknown>>;
    // ?G1 -> G2 (G1 exists), qualified as main:G2
    expect(steps[0]!.maps_to).toContain('main:G2');
  });
});
