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
      // Per-suite registry root. Without this the subprocess inherits
      // GVP_REGISTRY_ROOT from globalSetup, so every CLI test in every
      // parallel worker writes into ONE shared root and their prunes
      // delete each other's entries. globalSetup is the floor (nothing
      // reaches the real ~/.gvp/registry), not the isolation boundary.
      env: { ...process.env, GVP_REGISTRY_ROOT: path.join(tmpDir, '.registry') },
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
    update_rationale: Sharpened the statement after the retro.
`);
    const result = runCairn('import', patchFile, '--into', 'main', '--yes');
    expect(result.exitCode).toBe(0);
    const data = readLibDoc('main');
    const goals = data.goals as Array<Record<string, unknown>>;
    const g1 = goals.find(g => g.id === 'G1');
    expect(g1!.statement).toBe('Updated statement from patch.');
    expect(g1!.tags).toContain('updated');
    // The control field is patch-only — it must not land in the document.
    expect(g1!.update_rationale).toBeUndefined();
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
    update_rationale: Superseded by G2; keeping the record rather than deleting it.
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

  // 11b. Directory mode: new doc honors patch meta (scope + inherits), not force-stamped scope: project
  it('directory mode honors meta (scope, inherits) when creating a new document', () => {
    const patchDir = path.join(tmpDir, 'patches');
    fs.mkdirSync(patchDir, { recursive: true });
    fs.writeFileSync(path.join(patchDir, 'impl.yaml'), `
meta:
  import: true
  name: impl
  scope: implementation
  inherits:
    - main
decisions:
  - id: "?D1"
    name: Bootstrap decision
    rationale: Created in a new implementation doc.
    tags: []
    maps_to: []
`);
    const result = runCairn('import', patchDir, '--yes');
    expect(result.exitCode).toBe(0);
    const newDocPath = path.join(tmpDir, '.gvp', 'library', 'impl.yaml');
    expect(fs.existsSync(newDocPath)).toBe(true);
    const data = yaml.load(fs.readFileSync(newDocPath, 'utf-8')) as Record<string, unknown>;
    const meta = data.meta as Record<string, unknown>;
    // Scope must be honored, NOT force-stamped to project
    expect(meta.scope).toBe('implementation');
    // inherits must be carried over
    expect(meta.inherits).toEqual(['main']);
    // The reserved 'import' control key must NOT leak into the document meta
    expect(meta.import).toBeUndefined();
    // Element still landed
    const decisions = data.decisions as Array<Record<string, unknown>>;
    expect(decisions.find(d => d.name === 'Bootstrap decision')).toBeDefined();
  });

  // 11c. Directory mode: new doc default scope when no scope in meta
  it('directory mode defaults new-document scope to project when meta omits scope', () => {
    const patchDir = path.join(tmpDir, 'patches');
    fs.mkdirSync(patchDir, { recursive: true });
    fs.writeFileSync(path.join(patchDir, 'plain.yaml'), `
meta:
  import: true
goals:
  - id: "?G1"
    name: Plain new doc goal
    statement: No scope given.
    tags: []
    maps_to: []
`);
    const result = runCairn('import', patchDir, '--yes');
    expect(result.exitCode).toBe(0);
    const newDocPath = path.join(tmpDir, '.gvp', 'library', 'plain.yaml');
    expect(fs.existsSync(newDocPath)).toBe(true);
    const data = yaml.load(fs.readFileSync(newDocPath, 'utf-8')) as Record<string, unknown>;
    const meta = data.meta as Record<string, unknown>;
    expect(meta.scope).toBe('project');
    expect(meta.name).toBe('plain');
  });

  // 11d. Directory mode regression: existing-file patching does not overwrite meta from patch
  it('directory mode does not alter existing document meta when patching', () => {
    const patchDir = path.join(tmpDir, 'patches');
    fs.mkdirSync(patchDir, { recursive: true });
    fs.writeFileSync(path.join(patchDir, 'main.yaml'), `
meta:
  import: true
goals:
  - id: "?G1"
    name: Appended to existing main
    statement: Existing-file patch.
    tags: []
    maps_to: []
`);
    const result = runCairn('import', patchDir, '--yes');
    expect(result.exitCode).toBe(0);
    const data = readLibDoc('main');
    const meta = data.meta as Record<string, unknown>;
    // Existing main meta unchanged: still project scope, name main, no leaked import key
    expect(meta.scope).toBe('project');
    expect(meta.name).toBe('main');
    expect(meta.import).toBeUndefined();
    const goals = data.goals as Array<Record<string, unknown>>;
    expect(goals.find(g => g.name === 'Appended to existing main')).toBeDefined();
    // Original G1 still present
    expect(goals.find(g => g.id === 'G1')).toBeDefined();
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

  // === #22: pseudo-IDs inside dict<model> containers (decision.considered) ===

  describe('considered.* tradeoff links (#22)', () => {
    it('rewrites pseudo-IDs in considered.would_have_served and .conflicts_with', () => {
      const patchFile = path.join(tmpDir, 'patch.yaml');
      fs.writeFileSync(patchFile, `
meta:
  import: true
goals:
  - id: "?g_streaks"
    name: Progress is visible at a glance
    statement: One screen of terminal output.
    tags: []
    maps_to: []
values:
  - id: "?v_honest"
    name: Honest reporting
    statement: Numbers reflect what happened.
    tags: []
    maps_to: []
decisions:
  - id: "?d_streak"
    name: Compute streaks at read time
    rationale: Always exactly what the record supports.
    disposition: accepted
    tags: []
    maps_to: ["?g_streaks", "?v_honest"]
    considered:
      Stored streak counter:
        description: Keep a current-streak integer per habit.
        rationale: Cheaper to read, but it drifts on backfill.
        would_have_served:
          - "?g_streaks"
        conflicts_with:
          - "?v_honest"
`);
      const result = runCairn('import', patchFile, '--into', 'main', '--yes');
      expect(result.exitCode).toBe(0);

      const data = readLibDoc('main');
      const decisions = data.decisions as Array<Record<string, unknown>>;
      const d = decisions.find(x => x.name === 'Compute streaks at read time');
      expect(d).toBeDefined();
      // G1/V1 already exist in main, so the new roots are G2/V2.
      expect(d!.maps_to).toEqual(['main:G2', 'main:V2']);

      const considered = d!.considered as Record<string, Record<string, unknown>>;
      const alt = considered['Stored streak counter']!;
      expect(alt.would_have_served).toEqual(['main:G2']);
      expect(alt.conflicts_with).toEqual(['main:V2']);
      // No '?' survives anywhere in the written document.
      expect(fs.readFileSync(
        path.join(tmpDir, '.gvp', 'library', 'main.yaml'), 'utf-8',
      )).not.toContain('?g_streaks');
    });

    it('imported considered.* links pass cairn validate', () => {
      const patchFile = path.join(tmpDir, 'patch.yaml');
      fs.writeFileSync(patchFile, `
meta:
  import: true
decisions:
  - id: "?d_streak"
    name: Compute streaks at read time
    rationale: Always exactly what the record supports.
    disposition: accepted
    tags: []
    maps_to: [main:G1, main:V1]
    considered:
      Stored streak counter:
        rationale: Cheaper to read, but it drifts on backfill.
        would_have_served: [main:G1]
        conflicts_with: ["?v_extra"]
values:
  - id: "?v_extra"
    name: Extra value
    statement: Referenced only from a considered alternative.
    tags: []
    maps_to: []
`);
      expect(runCairn('import', patchFile, '--into', 'main', '--yes').exitCode).toBe(0);
      const validated = runCairn('validate');
      expect(validated.stderr + validated.stdout).not.toContain('E001');
      expect(validated.exitCode).toBe(0);
    });

    it('--dry-run fails instead of claiming a clean resolve when a considered ref is unresolved', () => {
      const patchFile = path.join(tmpDir, 'patch.yaml');
      fs.writeFileSync(patchFile, `
meta:
  import: true
decisions:
  - id: "?d_streak"
    name: Compute streaks at read time
    rationale: Always exactly what the record supports.
    tags: []
    maps_to: [main:G1, main:V1]
    considered:
      Stored streak counter:
        rationale: Drifts on backfill.
        would_have_served:
          - "?never_defined"
`);
      const result = runCairn('import', patchFile, '--into', 'main', '--dry-run');
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Unresolved pseudo-ID');
      expect(result.stderr).toContain('?never_defined');
      // The location names the exact sub-field and the alternative, as E001 does.
      expect(result.stderr).toContain("considered.would_have_served ('Stored streak counter')");
      // Crucially: it must NOT print a rewrite list implying everything resolved.
      expect(result.stderr).not.toContain('References rewritten');
      expect(result.stderr).not.toContain('Dry run');
    });

    it('errors on an unresolved considered ref in a real write too (nothing lands on disk)', () => {
      const patchFile = path.join(tmpDir, 'patch.yaml');
      fs.writeFileSync(patchFile, `
meta:
  import: true
decisions:
  - id: "?d_streak"
    name: Should not be written
    rationale: Nope.
    tags: []
    maps_to: [main:G1, main:V1]
    considered:
      Some alternative:
        rationale: Why not.
        conflicts_with: ["?missing"]
`);
      const result = runCairn('import', patchFile, '--into', 'main', '--yes');
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('nothing was written');
      const data = readLibDoc('main');
      expect(data.decisions).toBeUndefined();
    });
  });

  // === #28: provenance on updates ===

  describe('update provenance (#28)', () => {
    /** Read main:G1 back from disk. */
    function readG1(): Record<string, unknown> {
      const goals = readLibDoc('main').goals as Array<Record<string, unknown>>;
      return goals.find(g => g.id === 'G1')!;
    }

    it('errors when an updated element has no update_rationale', () => {
      const patchFile = path.join(tmpDir, 'patch.yaml');
      fs.writeFileSync(patchFile, `
meta:
  import: true
goals:
  - id: G1
    name: Existing goal
    statement: Changed without saying why.
`);
      const result = runCairn('import', patchFile, '--into', 'main', '--yes');
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('update_rationale');
      expect(result.stderr).toContain('main:G1');
      // Nothing written.
      expect(readG1().statement).toBe('Already here.');
    });

    it('--dry-run also enforces the update_rationale gate', () => {
      const patchFile = path.join(tmpDir, 'patch.yaml');
      fs.writeFileSync(patchFile, `
meta:
  import: true
goals:
  - id: G1
    name: Existing goal
    statement: Changed without saying why.
`);
      const result = runCairn('import', patchFile, '--into', 'main', '--dry-run');
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('update_rationale');
    });

    it('writes an updated_by entry carrying the update_rationale', () => {
      const patchFile = path.join(tmpDir, 'patch.yaml');
      fs.writeFileSync(patchFile, `
meta:
  import: true
goals:
  - id: G1
    name: Existing goal
    statement: Narrowed after the retro.
    update_rationale: The old statement covered two goals at once.
`);
      const result = runCairn('import', patchFile, '--into', 'main', '--yes');
      expect(result.exitCode).toBe(0);

      const g1 = readG1();
      const updatedBy = g1.updated_by as Array<Record<string, unknown>>;
      expect(updatedBy).toHaveLength(1);
      expect(updatedBy[0]!.rationale).toBe('The old statement covered two goals at once.');
      expect(updatedBy[0]!.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(updatedBy[0]!.date).toBeTruthy();
      expect(updatedBy[0]!.by).toEqual({ name: 'Test User', email: 'test@example.com' });
      // A recorded rationale is not a skip-review stance.
      expect(updatedBy[0]!.skip_review).toBeUndefined();
      // The element's own fields are untouched by the change record.
      expect(g1.rationale).toBeUndefined();
      expect(g1.update_rationale).toBeUndefined();
    });

    it('appends to existing updated_by history rather than replacing it', () => {
      // Seed a prior change record on G1.
      const mainPath = path.join(tmpDir, '.gvp', 'library', 'main.yaml');
      const doc = yaml.load(fs.readFileSync(mainPath, 'utf-8')) as Record<string, unknown>;
      const goals = doc.goals as Array<Record<string, unknown>>;
      goals[0]!.updated_by = [
        { id: '00000000-0000-4000-8000-000000000001', date: '2026-01-01T00:00:00.000Z', rationale: 'The first change.' },
      ];
      fs.writeFileSync(mainPath, yaml.dump(doc, { lineWidth: -1, noRefs: true, sortKeys: false }));

      const patchFile = path.join(tmpDir, 'patch.yaml');
      fs.writeFileSync(patchFile, `
meta:
  import: true
goals:
  - id: G1
    statement: A second change.
    update_rationale: The second change.
`);
      expect(runCairn('import', patchFile, '--into', 'main', '--yes').exitCode).toBe(0);

      const updatedBy = readG1().updated_by as Array<Record<string, unknown>>;
      expect(updatedBy).toHaveLength(2);
      expect(updatedBy[0]!.rationale).toBe('The first change.');
      expect(updatedBy[1]!.rationale).toBe('The second change.');
    });

    it('--skip-review still writes an update entry, flagged skip_review: true', () => {
      const patchFile = path.join(tmpDir, 'patch.yaml');
      fs.writeFileSync(patchFile, `
meta:
  import: true
goals:
  - id: G1
    statement: Mechanical reformat.
`);
      const result = runCairn('import', patchFile, '--into', 'main', '--yes', '--skip-review');
      expect(result.exitCode).toBe(0);
      expect(result.stderr).toContain('[skip-review]');

      const updatedBy = readG1().updated_by as Array<Record<string, unknown>>;
      expect(updatedBy).toHaveLength(1);
      expect(updatedBy[0]!.skip_review).toBe(true);
      expect(updatedBy[0]!.rationale).toBe('skip-review update');
      expect(updatedBy[0]!.id).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('--skip-review keeps an explicit update_rationale alongside the flag', () => {
      const patchFile = path.join(tmpDir, 'patch.yaml');
      fs.writeFileSync(patchFile, `
meta:
  import: true
goals:
  - id: G1
    statement: Reworded.
    update_rationale: Still worth recording.
`);
      expect(runCairn('import', patchFile, '--into', 'main', '--yes', '--skip-review').exitCode).toBe(0);
      const updatedBy = readG1().updated_by as Array<Record<string, unknown>>;
      expect(updatedBy[0]!.rationale).toBe('Still worth recording.');
      expect(updatedBy[0]!.skip_review).toBe(true);
    });

    it('per-element skip_review lets mechanical and substantive updates share one patch', () => {
      const patchFile = path.join(tmpDir, 'patch.yaml');
      fs.writeFileSync(patchFile, `
meta:
  import: true
goals:
  - id: G1
    statement: Whitespace only.
    skip_review: true
values:
  - id: V1
    statement: Substantively narrowed.
    update_rationale: It was claiming more than we can honour.
`);
      const result = runCairn('import', patchFile, '--into', 'main', '--yes');
      expect(result.exitCode).toBe(0);

      const g1Updated = readG1().updated_by as Array<Record<string, unknown>>;
      expect(g1Updated[0]!.skip_review).toBe(true);
      expect(g1Updated[0]!.rationale).toBe('skip-review update');
      // The control key never lands in the document.
      expect(readG1().skip_review).toBeUndefined();

      const values = readLibDoc('main').values as Array<Record<string, unknown>>;
      const v1Updated = values.find(v => v.id === 'V1')!.updated_by as Array<Record<string, unknown>>;
      expect(v1Updated[0]!.rationale).toBe('It was claiming more than we can honour.');
      expect(v1Updated[0]!.skip_review).toBeUndefined();
    });

    it('still errors for the elements that lack update_rationale when others carry skip_review', () => {
      const patchFile = path.join(tmpDir, 'patch.yaml');
      fs.writeFileSync(patchFile, `
meta:
  import: true
goals:
  - id: G1
    statement: Whitespace only.
    skip_review: true
values:
  - id: V1
    statement: Substantively narrowed, silently.
`);
      const result = runCairn('import', patchFile, '--into', 'main', '--yes');
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('main:V1');
      expect(result.stderr).not.toContain('main:G1');
    });

    it('new elements need no update_rationale and still get origin, not updated_by', () => {
      const patchFile = path.join(tmpDir, 'patch.yaml');
      fs.writeFileSync(patchFile, `
meta:
  import: true
goals:
  - id: "?g_new"
    name: Brand new goal
    statement: Fresh.
    tags: []
    maps_to: []
`);
      expect(runCairn('import', patchFile, '--into', 'main', '--yes').exitCode).toBe(0);
      const goals = readLibDoc('main').goals as Array<Record<string, unknown>>;
      const g = goals.find(x => x.name === 'Brand new goal')!;
      expect(g.origin).toHaveLength(1);
      expect(g.updated_by).toBeUndefined();
    });

    it('notes (but does not fail on) update_rationale attached to an added element', () => {
      const patchFile = path.join(tmpDir, 'patch.yaml');
      fs.writeFileSync(patchFile, `
meta:
  import: true
goals:
  - id: G99
    name: Not actually present
    statement: Treated as an add.
    tags: []
    maps_to: []
    update_rationale: I thought this existed.
`);
      const result = runCairn('import', patchFile, '--into', 'main', '--yes');
      expect(result.exitCode).toBe(0);
      expect(result.stderr).toContain('is being ADDED, not updated');
      const goals = readLibDoc('main').goals as Array<Record<string, unknown>>;
      const g = goals.find(x => x.id === 'G99')!;
      expect(g.update_rationale).toBeUndefined();
      expect(g.origin).toHaveLength(1);
    });

    it('rejects a wrong-typed update_rationale rather than treating it as absent', () => {
      const patchFile = path.join(tmpDir, 'patch.yaml');
      fs.writeFileSync(patchFile, `
meta:
  import: true
goals:
  - id: G1
    statement: Changed.
    update_rationale: true
`);
      const result = runCairn('import', patchFile, '--into', 'main', '--yes');
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("'update_rationale' must be a non-empty string");
    });
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
