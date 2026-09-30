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

  /**
   * Create a valid GVP store directory. The store IS the .gvp/ directory
   * itself — it directly contains config.yaml and library/.
   * Returns the store path.
   *
   * G1 carries a tag the library never defines, so validating this store
   * emits exactly one W007. That warning is what makes the suppression
   * assertions below load-bearing: without it, "stderr has no W007" would be
   * true whether or not the store's config was ever read. These tests used
   * W005 as the vehicle before #41 retired it, but W005 never fired on a root
   * element, so the fixture emitted nothing and the assertions were already
   * vacuous — they passed for a library with no diagnostics at all.
   */
  function createStore(name: string): string {
    const storeDir = path.join(tmpDir, name);
    const libDir = path.join(storeDir, 'library');
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
    tags: [undefined-tag]
    maps_to: []
`,
    );
    return storeDir;
  }

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

  it('--store alone discovers config and library from store path', () => {
    const store = createStore('mystore');
    // Add config directly inside the store (the store IS the .gvp/ dir)
    fs.writeFileSync(
      path.join(store, 'config.yaml'),
      'suppress_diagnostics: ["W007"]\n',
    );
    // Control: without the store's config, the fixture's W007 is printed.
    // This is what stops the assertion below from passing vacuously.
    expect(runCairn('validate', '--library', path.join(store, 'library'), '--no-config').stderr)
      .toContain('W007');

    const result = runCairn('validate', '--store', store);
    // Should find the library and validate without error
    expect(result.exitCode).toBe(0);
    // W007 should be suppressed (proves config was picked up from store)
    expect(result.stderr).not.toContain('W007');
  });

  it('--store + --library: config from store, library from --library', () => {
    const store = createStore('configsource');
    fs.writeFileSync(
      path.join(store, 'config.yaml'),
      'suppress_diagnostics: ["W007"]\n',
    );
    // Create a separate library directory. It carries its own undefined tag,
    // so the suppression being tested has to come from the store's config
    // while the diagnostic being suppressed comes from --library.
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
    tags: [undefined-tag]
    maps_to: []
`,
    );
    expect(runCairn('validate', '--library', separateLib, '--no-config').stderr).toContain('W007');

    const result = runCairn('validate', '--store', store, '--library', separateLib);
    expect(result.exitCode).toBe(0);
    // W007 suppressed proves config is from store
    expect(result.stderr).not.toContain('W007');
  });

  it('--store + --config: --config wins for config, store governs library', () => {
    const store = createStore('libsource');
    // Store config suppresses W007
    fs.writeFileSync(
      path.join(store, 'config.yaml'),
      'suppress_diagnostics: ["W007"]\n',
    );
    // Explicit config does NOT suppress W007
    const explicitConfig = path.join(tmpDir, 'explicit.yaml');
    fs.writeFileSync(explicitConfig, 'suppress_diagnostics: []\n');
    const result = runCairn('validate', '--store', store, '--config', explicitConfig);
    expect(result.exitCode).toBe(0);
    // W007 is NOT suppressed — --config wins over store config — and the
    // library is still the store's, which is what carries the undefined tag.
    // Asserting the warning is present is the half that was missing: the test
    // previously only checked the exit code, which cannot distinguish
    // "--config won" from "neither config was read".
    expect(result.stderr).toContain('W007');
    expect(result.stderr).toContain('main:G1');
  });

  it('errors when store path does not exist', () => {
    const result = runCairn('validate', '--store', path.join(tmpDir, 'nonexistent'));
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain('does not exist');
  });

  it('errors when store has no library/ subdirectory', () => {
    // Create a directory but don't put library/ in it
    const emptyStore = path.join(tmpDir, 'emptystore');
    fs.mkdirSync(emptyStore);
    const result = runCairn('validate', '--store', emptyStore);
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain('library');
  });

  it('no flags: CWD behavior unchanged (regression)', () => {
    // Create a standard project layout at tmpDir so CWD walk-back finds it
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
