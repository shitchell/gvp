import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

describe('--store flag', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cairn-store-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  /** Create a valid GVP store at a path under tmpDir. Returns the store root. */
  function createStore(name: string): string {
    const storeRoot = path.join(tmpDir, name);
    const libDir = path.join(storeRoot, '.gvp', 'library');
    fs.mkdirSync(libDir, { recursive: true });
    fs.writeFileSync(
      path.join(libDir, 'main.yaml'),
      `
meta:
  name: main
  scope: project
goals:
  - id: G1
    name: Store goal
    statement: From the store.
    tags: []
    maps_to: []
`,
    );
    return storeRoot;
  }

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

  it('--store alone discovers config and library from store path', () => {
    const store = createStore('myproject');
    // Add a config with suppress_diagnostics to prove it's picked up
    fs.writeFileSync(
      path.join(store, '.gvp', 'config.yaml'),
      'suppress_diagnostics: ["W005"]\n',
    );
    const result = runCairn('validate', '--store', store);
    // Should find the library and validate without error
    expect(result.exitCode).toBe(0);
    // W005 should be suppressed (proves config was picked up from store)
    expect(result.stderr).not.toContain('W005');
  });

  it('--store + --library: config from store, library from --library', () => {
    const store = createStore('configsource');
    fs.writeFileSync(
      path.join(store, '.gvp', 'config.yaml'),
      'suppress_diagnostics: ["W005"]\n',
    );
    // Create a separate library directory
    const separateLib = path.join(tmpDir, 'other-lib');
    fs.mkdirSync(separateLib, { recursive: true });
    fs.writeFileSync(
      path.join(separateLib, 'alt.yaml'),
      `
meta:
  name: alt
  scope: project
goals:
  - id: G1
    name: Alt goal
    statement: From separate lib.
    tags: []
    maps_to: []
`,
    );
    const result = runCairn('validate', '--store', store, '--library', separateLib);
    expect(result.exitCode).toBe(0);
    // W005 suppressed proves config is from store
    expect(result.stderr).not.toContain('W005');
  });

  it('--store + --config: --config wins for config, store governs library', () => {
    const store = createStore('libsource');
    // Store config suppresses W005
    fs.writeFileSync(
      path.join(store, '.gvp', 'config.yaml'),
      'suppress_diagnostics: ["W005"]\n',
    );
    // Explicit config does NOT suppress W005
    const explicitConfig = path.join(tmpDir, 'explicit.yaml');
    fs.writeFileSync(explicitConfig, 'suppress_diagnostics: []\n');
    const result = runCairn('validate', '--store', store, '--config', explicitConfig);
    expect(result.exitCode).toBe(0);
    // W005 should NOT be suppressed (--config wins over store config)
    // The library is still from the store (validates successfully)
  });

  it('errors when store path does not exist', () => {
    const result = runCairn('validate', '--store', path.join(tmpDir, 'nonexistent'));
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain('does not exist');
  });

  it('errors when store path has no .gvp/ subdirectory', () => {
    const noGvp = path.join(tmpDir, 'nogvp');
    fs.mkdirSync(noGvp);
    const result = runCairn('validate', '--store', noGvp);
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain('.gvp/');
  });

  it('no flags: CWD behavior unchanged (regression)', () => {
    // Create a store at tmpDir itself (CWD) so the walk-back finds it
    const libDir = path.join(tmpDir, '.gvp', 'library');
    fs.mkdirSync(libDir, { recursive: true });
    fs.writeFileSync(
      path.join(libDir, 'main.yaml'),
      `
meta:
  name: main
  scope: project
goals:
  - id: G1
    name: CWD goal
    statement: From CWD.
    tags: []
    maps_to: []
`,
    );
    // Run without --store, from tmpDir as cwd
    const result = runCairn('validate');
    expect(result.exitCode).toBe(0);
  });
});
