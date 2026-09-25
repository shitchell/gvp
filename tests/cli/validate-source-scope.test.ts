import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/**
 * End-to-end coverage for `cairn validate`'s source-scoped display (#29).
 *
 * Fixture mirrors the measured case: a project that inherits an external
 * library and picks up diagnostics on elements it cannot edit. The external
 * source is a local filesystem path, so nothing here touches the network.
 *
 * W005 (MAPS_ONLY_WITHIN_DOCUMENT) is the vehicle — it is the code that
 * produced 24 of the 47 unfixable warnings in the issue.
 */
describe('cairn validate — source-scoped diagnostics (#29)', () => {
  let srcRoot: string;
  let projRoot: string;

  const UPSTREAM_TAGLESS = 'upstream-lib';

  function writeUpstream(): void {
    const lib = path.join(srcRoot, '.gvp', 'library');
    fs.mkdirSync(lib, { recursive: true });
    fs.writeFileSync(
      path.join(lib, 'personal.yaml'),
      `meta:
  name: personal
  scope: universal
goals:
  - id: G1
    name: Upstream goal
    statement: An upstream goal.
    tags: []
    maps_to: []
values:
  - id: V1
    name: Upstream value
    statement: An upstream value.
    tags: []
    maps_to: []
decisions:
  - id: UD1
    name: Upstream decision one
    rationale: Maps only within its own document, so it earns a W005.
    tags: []
    maps_to: [personal:G1, personal:V1]
  - id: UD2
    name: Upstream decision two
    rationale: Also maps only within its own document.
    tags: []
    maps_to: [personal:G1, personal:V1]
`,
    );
  }

  function writeProject(configYaml?: string): void {
    const lib = path.join(projRoot, '.gvp', 'library');
    fs.mkdirSync(lib, { recursive: true });
    fs.writeFileSync(
      path.join(lib, 'main.yaml'),
      `meta:
  name: main
  scope: project
  inherits:
    - source: "${srcRoot}"
      as: up
goals:
  - id: G1
    name: Local goal
    statement: A local goal.
    tags: []
    maps_to: []
values:
  - id: V1
    name: Local value
    statement: A local value.
    tags: []
    maps_to: []
decisions:
  - id: D1
    name: Local decision
    rationale: Maps only within its own document, so it earns a local W005.
    tags: []
    maps_to: [main:G1, main:V1]
`,
    );
    if (configYaml !== undefined) {
      fs.writeFileSync(path.join(projRoot, '.gvp', 'config.yaml'), configYaml);
    }
  }

  /**
   * A project whose own elements are clean but which still inherits the
   * upstream library's diagnostics — the case the trace line exists for.
   */
  function writeCleanProject(configYaml?: string): void {
    const lib = path.join(projRoot, '.gvp', 'library');
    fs.mkdirSync(lib, { recursive: true });
    fs.writeFileSync(
      path.join(lib, 'main.yaml'),
      `meta:
  name: main
  scope: project
  inherits:
    - source: "${srcRoot}"
      as: up
goals:
  - id: G1
    name: Local goal
    statement: A local goal.
    tags: [ ]
    maps_to: [personal:G1]
values:
  - id: V1
    name: Local value
    statement: A local value.
    tags: []
    maps_to: [personal:V1]
decisions:
  - id: D1
    name: Local decision
    rationale: Maps across documents, so no local W005.
    tags: []
    maps_to: [main:G1, personal:V1]
`,
    );
    if (configYaml !== undefined) {
      fs.writeFileSync(path.join(projRoot, '.gvp', 'config.yaml'), configYaml);
    }
  }

  /** A project with no `inherits` at all — the zero-change control. */
  function writeLocalOnlyProject(configYaml?: string): void {
    const lib = path.join(projRoot, '.gvp', 'library');
    fs.mkdirSync(lib, { recursive: true });
    fs.writeFileSync(
      path.join(lib, 'main.yaml'),
      `meta:
  name: main
  scope: project
goals:
  - id: G1
    name: Local goal
    statement: A local goal.
    tags: []
    maps_to: []
values:
  - id: V1
    name: Local value
    statement: A local value.
    tags: []
    maps_to: []
decisions:
  - id: D1
    name: Local decision
    rationale: Maps only within its own document, so it earns a local W005.
    tags: []
    maps_to: [main:G1, main:V1]
`,
    );
    if (configYaml !== undefined) {
      fs.writeFileSync(path.join(projRoot, '.gvp', 'config.yaml'), configYaml);
    }
  }

  function runCairn(...args: string[]): { stdout: string; stderr: string; exitCode: number } {
    const cliPath = path.resolve(__dirname, '../../dist/cli/index.js');
    const result = spawnSync('node', [cliPath, ...args], {
      cwd: projRoot,
      env: { ...process.env, GVP_REGISTRY_ROOT: path.join(projRoot, '.registry') },
      encoding: 'utf-8',
      timeout: 20000,
    });
    return {
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? '',
      exitCode: result.status ?? 1,
    };
  }

  /** Diagnostic lines only, dropping the summary block and preflight noise. */
  function diagLines(stderr: string): string[] {
    return stderr.split('\n').filter((l) => /^(WARN|ERROR)\s/.test(l));
  }

  beforeEach(() => {
    srcRoot = fs.mkdtempSync(path.join(os.tmpdir(), `cairn-${UPSTREAM_TAGLESS}-`));
    projRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cairn-scope-proj-'));
  });

  afterEach(() => {
    fs.rmSync(srcRoot, { recursive: true, force: true });
    fs.rmSync(projRoot, { recursive: true, force: true });
  });

  it('counts inherited diagnostics by default, printing only local ones', () => {
    writeUpstream();
    writeProject();
    const r = runCairn('validate');

    const lines = diagLines(r.stderr);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('main:D1');
    expect(lines.join('\n')).not.toContain('personal:');

    expect(r.stderr).toContain('2 further warnings from');
    expect(r.stderr).toContain(srcRoot);
    expect(r.stderr).toContain('W005 ×2');
    expect(r.stderr).toContain('--include-inherited to show');
    expect(r.exitCode).toBe(0);
  });

  it('--include-inherited restores the unscoped output', () => {
    writeUpstream();
    writeProject();
    const r = runCairn('validate', '--include-inherited');

    const lines = diagLines(r.stderr);
    expect(lines).toHaveLength(3);
    expect(lines.filter((l) => l.includes('personal:'))).toHaveLength(2);
    expect(r.stderr).not.toContain('further warnings');
    expect(r.stderr).not.toContain('fully hidden');
  });

  it('--inherited show / count / hide all reachable from the CLI', () => {
    writeUpstream();
    writeProject();

    expect(diagLines(runCairn('validate', '--inherited', 'show').stderr)).toHaveLength(3);
    expect(diagLines(runCairn('validate', '--inherited', 'count').stderr)).toHaveLength(1);
    expect(diagLines(runCairn('validate', '--inherited', 'hide').stderr)).toHaveLength(1);
  });

  it('rejects an unknown --inherited mode loudly', () => {
    writeUpstream();
    writeProject();
    const r = runCairn('validate', '--inherited', 'silent');
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain('--inherited must be one of: show, count, hide');
  });

  it('hide still leaves a trace — never a silent suppression', () => {
    writeUpstream();
    writeProject();
    const r = runCairn('validate', '--inherited', 'hide');

    expect(r.stderr).toContain('1 source fully hidden');
    // No codes, no counts leaked by the trace itself.
    const summary = r.stderr
      .split('\n')
      .filter((l) => l.includes('fully hidden'))
      .join('\n');
    expect(summary).not.toMatch(/W\d{3}/);
    expect(summary).not.toMatch(/\d+ warning/);
  });

  it('the trace survives even when the project itself validates clean', () => {
    // The precise failure mode #29 documents: suppress_diagnostics prints
    // the bare "Validation passed" line and leaves you with no idea anything
    // was withheld. Here the pass line is qualified by the trace.
    writeUpstream();
    writeCleanProject();
    const r = runCairn('validate', '--inherited', 'hide');
    expect(diagLines(r.stderr)).toHaveLength(0);
    expect(r.stderr).toContain('Validation passed');
    expect(r.stderr).toContain('1 source fully hidden');
  });

  it('nothing is traced when no diagnostic was actually withheld', () => {
    // --document already removed the inherited diagnostics, so `hide`
    // withheld nothing and has nothing to confess to.
    writeUpstream();
    writeProject();
    const r = runCairn('validate', '--inherited', 'hide', '-d', 'main');
    expect(r.stderr).not.toContain('fully hidden');
    expect(diagLines(r.stderr)).toHaveLength(1);
  });

  it('config drives the same three states as the flags', () => {
    writeUpstream();
    writeProject('diagnostics:\n  inherited: hide\n');
    expect(runCairn('validate').stderr).toContain('1 source fully hidden');

    writeProject('diagnostics:\n  inherited: show\n');
    expect(diagLines(runCairn('validate').stderr)).toHaveLength(3);
  });

  it('by_source beats the blanket inherited setting', () => {
    writeUpstream();
    writeProject(
      `diagnostics:\n  inherited: hide\n  by_source:\n    "${srcRoot}": show\n`,
    );
    const r = runCairn('validate');
    expect(diagLines(r.stderr)).toHaveLength(3);
    expect(r.stderr).not.toContain('fully hidden');
  });

  it('suppress_diagnostics and source scoping compose as per-code × per-source', () => {
    // Orthogonal, not redundant (gvp:P11 — purpose, not structural
    // similarity, decides whether to merge). Suppressing W005 globally
    // removes it everywhere INCLUDING locally; source scoping would have
    // kept the local one.
    writeUpstream();
    writeProject('suppress_diagnostics:\n  - W005\n');
    const r = runCairn('validate');
    expect(diagLines(r.stderr)).toHaveLength(0);
    expect(r.stderr).toContain('Validation passed');
    expect(r.stderr).not.toContain('further warnings');
  });

  it('a local-only project is byte-identical across all three states', () => {
    writeLocalOnlyProject();
    const show = runCairn('validate', '--inherited', 'show');
    const count = runCairn('validate', '--inherited', 'count');
    const hide = runCairn('validate', '--inherited', 'hide');
    const base = runCairn('validate');

    expect(diagLines(show.stderr)).toHaveLength(1);
    expect(diagLines(count.stderr)).toEqual(diagLines(show.stderr));
    expect(diagLines(hide.stderr)).toEqual(diagLines(show.stderr));
    expect(diagLines(base.stderr)).toEqual(diagLines(show.stderr));

    for (const r of [show, count, hide, base]) {
      expect(r.stderr).not.toContain('further warnings');
      expect(r.stderr).not.toContain('fully hidden');
      expect(r.exitCode).toBe(0);
    }
  });

  it('scoping stays live under strict, where it would otherwise go inert', () => {
    // strict rewrites every warning to an error before validate sees it. The
    // `strictPromoted` stamp is what keeps the feature working for the users
    // who opted into the loudest setting.
    writeUpstream();
    writeProject('strict: true\n');

    const scoped = runCairn('validate');
    // Only the local one is printed, and it is an ERROR (strict).
    const shown = diagLines(scoped.stderr);
    expect(shown).toHaveLength(1);
    expect(shown[0]).toMatch(/^ERROR\s+W005\s+main:D1/);
    // The inherited pair is counted, reported with its promoted severity.
    expect(scoped.stderr).toContain('2 further errors from');
    // Local error still fails the build.
    expect(scoped.exitCode).toBe(1);
  });

  it('under strict, hiding an inherited-only failure lets the build pass', () => {
    writeUpstream();
    writeCleanProject('strict: true\n');

    // Unscoped: the two upstream warnings are errors and fail the build.
    const unscoped = runCairn('validate', '--include-inherited');
    expect(unscoped.exitCode).toBe(1);

    // Scoped: they are still traced, but they are not this project's failure.
    const hidden = runCairn('validate', '--inherited', 'hide');
    expect(hidden.exitCode).toBe(0);
    expect(hidden.stderr).toContain('1 source fully hidden');
  });

  it('a genuine inherited error is never scoped away', () => {
    // Errors mean the composed catalog you are consuming is invalid, which is
    // your problem whoever authored it — so `hide` cannot mask one, and
    // cannot quietly flip a failing validate green.
    writeUpstream();
    fs.appendFileSync(
      path.join(srcRoot, '.gvp', 'library', 'personal.yaml'),
      `  - id: UD3
    name: Upstream decision with a dangling ref
    rationale: Points at an element that does not exist.
    tags: []
    maps_to: [personal:G1, personal:NOPE]
`,
    );
    writeProject();
    const r = runCairn('validate', '--inherited', 'hide');
    const errors = diagLines(r.stderr).filter((l) => l.startsWith('ERROR'));
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.join('\n')).toContain('personal:UD3');
    expect(r.exitCode).toBe(1);
  });
});
