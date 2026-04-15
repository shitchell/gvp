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

  // === DEC-9.5: Per-document per-category ID scoping (ticket 019) ===

  describe('per-document ID scoping (DEC-9.5)', () => {
    /** Helper to add a second document with higher-numbered decisions */
    function addOtherDoc(dir: string) {
      fs.writeFileSync(
        path.join(dir, '.gvp', 'library', 'other.yaml'),
        `
meta:
  name: other
  scope: project

decisions:
  - id: D10
    name: Decision ten
    rationale: Existing.
    tags: []
    maps_to: []
  - id: D11
    name: Decision eleven
    rationale: Existing.
    tags: []
    maps_to: []
  - id: D12
    name: Decision twelve
    rationale: Existing.
    tags: []
    maps_to: []
  - id: D13
    name: Decision thirteen
    rationale: Existing.
    tags: []
    maps_to: []
  - id: D14
    name: Decision fourteen
    rationale: Existing.
    tags: []
    maps_to: []
`,
      );
    }

    /** Helper to add decisions D1-D3 to existing main.yaml */
    function addDecisionsToMain(dir: string) {
      const mainPath = path.join(dir, '.gvp', 'library', 'main.yaml');
      const content = fs.readFileSync(mainPath, 'utf-8');
      const data = yaml.load(content) as Record<string, unknown>;
      data.decisions = [
        { id: 'D1', name: 'Decision one', rationale: 'Existing.', tags: [], maps_to: [] },
        { id: 'D2', name: 'Decision two', rationale: 'Existing.', tags: [], maps_to: [] },
        { id: 'D3', name: 'Decision three', rationale: 'Existing.', tags: [], maps_to: [] },
      ];
      fs.writeFileSync(mainPath, yaml.dump(data, { lineWidth: -1, noRefs: true, sortKeys: false }));
    }

    // 18. Multi-doc: import into doc with lower max assigns correct next ID
    it('assigns per-document ID when importing into doc with lower max', () => {
      addDecisionsToMain(tmpDir);
      addOtherDoc(tmpDir);

      const patchFile = path.join(tmpDir, 'patch.yaml');
      fs.writeFileSync(patchFile, `
meta:
  import: true
decisions:
  - id: "?D1"
    name: New decision for main
    rationale: Should get D4.
    tags: []
    maps_to: []
`);
      const result = runCairn('import', patchFile, '--into', 'main', '--yes');
      expect(result.exitCode).toBe(0);

      const data = readLibDoc('main');
      const decisions = data.decisions as Array<Record<string, unknown>>;
      // main has D1-D3, so next should be D4 (not D15)
      const d4 = decisions.find(d => d.id === 'D4');
      expect(d4).toBeDefined();
      expect(d4!.name).toBe('New decision for main');
      // D15 should NOT exist in main
      expect(decisions.find(d => d.id === 'D15')).toBeUndefined();
    });

    // 19. Multi-doc: import into doc with higher max assigns correct next ID
    it('assigns per-document ID when importing into doc with higher max', () => {
      addDecisionsToMain(tmpDir);
      addOtherDoc(tmpDir);

      const patchFile = path.join(tmpDir, 'patch.yaml');
      fs.writeFileSync(patchFile, `
meta:
  import: true
decisions:
  - id: "?D1"
    name: New decision for other
    rationale: Should get D15.
    tags: []
    maps_to: []
`);
      const result = runCairn('import', patchFile, '--into', 'other', '--yes');
      expect(result.exitCode).toBe(0);

      const data = readLibDoc('other');
      const decisions = data.decisions as Array<Record<string, unknown>>;
      // other has D10-D14, so next should be D15
      const d15 = decisions.find(d => d.id === 'D15');
      expect(d15).toBeDefined();
      expect(d15!.name).toBe('New decision for other');
    });

    // 20. Directory mode: each sub-patch gets per-doc IDs
    it('directory mode assigns per-document IDs to each sub-patch', () => {
      addDecisionsToMain(tmpDir);
      addOtherDoc(tmpDir);

      const patchDir = path.join(tmpDir, 'patches');
      fs.mkdirSync(patchDir, { recursive: true });
      fs.writeFileSync(path.join(patchDir, 'main.yaml'), `
meta:
  import: true
decisions:
  - id: "?D1"
    name: Dir-mode decision for main
    rationale: Should get D4.
    tags: []
    maps_to: []
`);
      fs.writeFileSync(path.join(patchDir, 'other.yaml'), `
meta:
  import: true
decisions:
  - id: "?D2"
    name: Dir-mode decision for other
    rationale: Should get D15.
    tags: []
    maps_to: []
`);
      const result = runCairn('import', patchDir, '--yes');
      expect(result.exitCode).toBe(0);

      const mainData = readLibDoc('main');
      const mainDecisions = mainData.decisions as Array<Record<string, unknown>>;
      const d4 = mainDecisions.find(d => d.id === 'D4');
      expect(d4).toBeDefined();
      expect(d4!.name).toBe('Dir-mode decision for main');

      const otherData = readLibDoc('other');
      const otherDecisions = otherData.decisions as Array<Record<string, unknown>>;
      const d15 = otherDecisions.find(d => d.id === 'D15');
      expect(d15).toBeDefined();
      expect(d15!.name).toBe('Dir-mode decision for other');
    });

    // 21. Single-doc regression: behavior unchanged when only one document
    it('single-doc regression: assigns next ID correctly with one document', () => {
      addDecisionsToMain(tmpDir);

      const patchFile = path.join(tmpDir, 'patch.yaml');
      fs.writeFileSync(patchFile, `
meta:
  import: true
decisions:
  - id: "?D1"
    name: Single-doc decision
    rationale: Should get D4.
    tags: []
    maps_to: []
`);
      const result = runCairn('import', patchFile, '--into', 'main', '--yes');
      expect(result.exitCode).toBe(0);

      const data = readLibDoc('main');
      const decisions = data.decisions as Array<Record<string, unknown>>;
      const d4 = decisions.find(d => d.id === 'D4');
      expect(d4).toBeDefined();
      expect(d4!.name).toBe('Single-doc decision');
    });
  });

  // === Multi-document patch format (ticket 018) ===

  describe('multi-document patch format (ticket 018)', () => {
    // 22. Two sub-patches, different targets
    it('imports elements from multi-document patch to different targets', () => {
      fs.writeFileSync(
        path.join(tmpDir, '.gvp', 'library', 'other.yaml'),
        `
meta:
  name: other
  scope: project
goals:
  - id: G1
    name: Other goal
    statement: Existing.
    tags: []
    maps_to: []
`,
      );
      const patchFile = path.join(tmpDir, 'multi.yaml');
      fs.writeFileSync(patchFile, `
meta:
  multi_document: true
first:
  document: main
  patch:
    principles:
      - id: "?P1"
        name: New principle via multi
        statement: Added.
        tags: []
        maps_to: [main:G1]
second:
  document: other
  patch:
    goals:
      - id: "?G1"
        name: New goal in other
        statement: Added.
        tags: []
        maps_to: []
`);
      const result = runCairn('import', patchFile, '--yes');
      expect(result.exitCode).toBe(0);
      // Check main got P2
      const mainData = readLibDoc('main');
      const principles = mainData.principles as Array<Record<string, unknown>>;
      expect(principles.find(p => p.id === 'P2')).toBeDefined();
      // Check other got G2
      const otherData = readLibDoc('other');
      const goals = otherData.goals as Array<Record<string, unknown>>;
      expect(goals.find(g => g.id === 'G2')).toBeDefined();
    });

    // 23. Two sub-patches targeting same document
    it('allows multiple sub-patches targeting the same document', () => {
      const patchFile = path.join(tmpDir, 'multi.yaml');
      fs.writeFileSync(patchFile, `
meta:
  multi_document: true
batch1:
  document: main
  patch:
    goals:
      - id: "?G1"
        name: Goal batch 1
        statement: First batch.
        tags: []
        maps_to: []
batch2:
  document: main
  patch:
    principles:
      - id: "?P1"
        name: Principle batch 2
        statement: Second batch.
        tags: []
        maps_to: []
`);
      const result = runCairn('import', patchFile, '--yes');
      expect(result.exitCode).toBe(0);
      const data = readLibDoc('main');
      const goals = data.goals as Array<Record<string, unknown>>;
      const principles = data.principles as Array<Record<string, unknown>>;
      expect(goals.find(g => g.id === 'G2')).toBeDefined();
      expect(principles.find(p => p.id === 'P2')).toBeDefined();
    });

    // 24. Cross-sub-patch pseudo-ID references
    it('rewrites cross-sub-patch pseudo-ID references', () => {
      fs.writeFileSync(
        path.join(tmpDir, '.gvp', 'library', 'other.yaml'),
        `
meta:
  name: other
  scope: project
goals:
  - id: G1
    name: Other goal
    statement: Existing.
    tags: []
    maps_to: []
`,
      );
      const patchFile = path.join(tmpDir, 'multi.yaml');
      fs.writeFileSync(patchFile, `
meta:
  multi_document: true
new_goal:
  document: other
  patch:
    goals:
      - id: "?G1"
        name: Cross ref target
        statement: Target.
        tags: []
        maps_to: []
ref_principle:
  document: main
  patch:
    principles:
      - id: "?P1"
        name: Cross ref source
        statement: References goal in other doc.
        tags: []
        maps_to: ["?G1", main:V1]
`);
      const result = runCairn('import', patchFile, '--yes');
      expect(result.exitCode).toBe(0);
      const mainData = readLibDoc('main');
      const principles = mainData.principles as Array<Record<string, unknown>>;
      const newP = principles.find(p => p.name === 'Cross ref source');
      expect(newP).toBeDefined();
      // ?G1 was assigned G2 in 'other', so reference should be other:G2
      expect(newP!.maps_to).toContain('other:G2');
      expect(newP!.maps_to).toContain('main:V1');
    });

    // 25. patch.meta merges into target document meta
    it('merges patch.meta into target document meta', () => {
      const patchFile = path.join(tmpDir, 'multi.yaml');
      fs.writeFileSync(patchFile, `
meta:
  multi_document: true
update_meta:
  document: main
  patch:
    meta:
      description: "Updated via multi-doc import"
    goals:
      - id: "?G1"
        name: With meta merge
        statement: Added.
        tags: []
        maps_to: []
`);
      const result = runCairn('import', patchFile, '--yes');
      expect(result.exitCode).toBe(0);
      const data = readLibDoc('main');
      const meta = data.meta as Record<string, unknown>;
      expect(meta.description).toBe('Updated via multi-doc import');
      expect(meta.name).toBe('main'); // Original meta preserved
    });

    // 26. Error: --into with multi-doc
    it('errors when --into is used with multi-document mode', () => {
      const patchFile = path.join(tmpDir, 'multi.yaml');
      fs.writeFileSync(patchFile, `
meta:
  multi_document: true
sub:
  document: main
  patch:
    goals:
      - id: "?G1"
        name: X
        statement: X.
        tags: []
        maps_to: []
`);
      const result = runCairn('import', patchFile, '--into', 'main', '--yes');
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain('--into cannot be used with multi-document');
    });

    // 27. Error: sub-patch missing document
    it('errors when sub-patch is missing document field', () => {
      const patchFile = path.join(tmpDir, 'multi.yaml');
      fs.writeFileSync(patchFile, `
meta:
  multi_document: true
bad:
  patch:
    goals:
      - id: "?G1"
        name: X
        statement: X.
        tags: []
        maps_to: []
`);
      const result = runCairn('import', patchFile, '--yes');
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain('missing');
      expect(result.stderr).toContain('document');
    });

    // 28. --dry-run preview
    it('--dry-run shows multi-document preview without writing', () => {
      fs.writeFileSync(
        path.join(tmpDir, '.gvp', 'library', 'other.yaml'),
        `
meta:
  name: other
  scope: project
`,
      );
      const patchFile = path.join(tmpDir, 'multi.yaml');
      fs.writeFileSync(patchFile, `
meta:
  multi_document: true
sub:
  document: main
  patch:
    goals:
      - id: "?G1"
        name: Dry run multi
        statement: Should not be written.
        tags: []
        maps_to: []
`);
      const result = runCairn('import', patchFile, '--dry-run');
      expect(result.exitCode).toBe(0);
      expect(result.stderr).toContain('Dry run');
      // Verify nothing was written
      const data = readLibDoc('main');
      const goals = data.goals as Array<Record<string, unknown>>;
      expect(goals.find(g => g.name === 'Dry run multi')).toBeUndefined();
    });

    // 29. Error: pseudo-ID collision same category same target
    it('errors on pseudo-ID collision within same category and target document', () => {
      const patchFile = path.join(tmpDir, 'multi.yaml');
      fs.writeFileSync(patchFile, `
meta:
  multi_document: true
batch1:
  document: main
  patch:
    goals:
      - id: "?G1"
        name: First
        statement: First.
        tags: []
        maps_to: []
batch2:
  document: main
  patch:
    goals:
      - id: "?G1"
        name: Duplicate
        statement: Collision.
        tags: []
        maps_to: []
`);
      const result = runCairn('import', patchFile, '--yes');
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain('collision');
    });
  });
});
