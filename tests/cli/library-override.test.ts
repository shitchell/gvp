import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { buildCatalog } from '../../src/cli/helpers.js';
import { configSchema } from '../../src/config/schema.js';

/**
 * Tests for the `buildCatalog` `libraryOverride` parameter — the
 * primitive behind the global `--library <path>` CLI flag.
 *
 * Contract (per the claude-worker-pm feature request):
 *   - When libraryOverride is provided, walk-back discovery is
 *     SKIPPED entirely and the provided path is used as the
 *     library directory directly.
 *   - The path points at the library directory (where YAML
 *     documents live), NOT at a project root that contains a
 *     `.gvp/library/` child. No sugar for the project-root form.
 *   - Relative paths are resolved against cwd.
 *   - Missing paths produce a clear error, not a silent walk-back.
 *   - Non-directory paths (e.g., a regular file) also error out.
 *   - The override replaces ONLY library discovery. Config
 *     discovery still walks from cwd, and the two axes compose
 *     orthogonally (tested via isolation, not via assertions on
 *     config behavior which lives in its own test suite).
 */
describe('CLI --library override (buildCatalog libraryOverride param)', () => {
  let tmpDir: string;
  const defaultConfig = configSchema.parse({});

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cairn-library-override-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeLibraryAt(libDir: string): void {
    fs.mkdirSync(libDir, { recursive: true });
    fs.writeFileSync(
      path.join(libDir, 'project.yaml'),
      `
meta:
  name: overridden
  scope: project
goals:
  - id: G1
    name: Goal from the override library
    statement: This comes from the non-CWD library.
    tags: []
    maps_to: []
`,
    );
  }

  it('loads library from an absolute override path, skipping walk-back', () => {
    // Put the override library somewhere that is NOT a subdirectory
    // of the fake cwd — proves walk-back is actually skipped.
    const overrideLib = path.join(tmpDir, 'elsewhere', 'lib');
    writeLibraryAt(overrideLib);

    // The "cwd" passed to buildCatalog does NOT contain a .gvp/library
    // anywhere in its ancestry chain. If walk-back ran, it would fail.
    const fakeCwd = path.join(tmpDir, 'somewhere', 'else');
    fs.mkdirSync(fakeCwd, { recursive: true });

    const catalog = buildCatalog(defaultConfig, fakeCwd, overrideLib);
    const ids = catalog.getAllElements().map((e) => e.id);
    expect(ids).toContain('G1');
    expect(catalog.getAllElements()[0]!.name).toBe(
      'Goal from the override library',
    );
  });

  it('resolves relative override paths against cwd', () => {
    // Library at tmpDir/lib, cwd at tmpDir — relative path `lib`
    // should resolve to tmpDir/lib.
    const overrideLib = path.join(tmpDir, 'lib');
    writeLibraryAt(overrideLib);

    const catalog = buildCatalog(defaultConfig, tmpDir, 'lib');
    const ids = catalog.getAllElements().map((e) => e.id);
    expect(ids).toContain('G1');
  });

  it('errors loudly when the override path does not exist', () => {
    const missing = path.join(tmpDir, 'nonexistent');
    const exitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation(((code?: number) => {
        throw new Error(`process.exit called with ${code}`);
      }) as never);
    const errorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    expect(() => buildCatalog(defaultConfig, tmpDir, missing)).toThrow(
      /process.exit called with 1/,
    );
    // Error message should name the missing path explicitly.
    const calls = errorSpy.mock.calls.map((c) => c.join(' '));
    expect(calls.some((m) => m.includes('does not exist'))).toBe(true);
    expect(calls.some((m) => m.includes(missing))).toBe(true);

    exitSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('errors when the override path is a file, not a directory', () => {
    const fakePath = path.join(tmpDir, 'not-a-dir.yaml');
    fs.writeFileSync(fakePath, 'meta:\n  name: x\n');

    const exitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation(((code?: number) => {
        throw new Error(`process.exit called with ${code}`);
      }) as never);
    const errorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    expect(() => buildCatalog(defaultConfig, tmpDir, fakePath)).toThrow(
      /process.exit called with 1/,
    );
    const calls = errorSpy.mock.calls.map((c) => c.join(' '));
    expect(calls.some((m) => m.includes('not a directory'))).toBe(true);

    exitSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('uses the override path as the library root (subdirectory YAML files discovered recursively)', () => {
    // The override path is used as the library root; findYamlFiles
    // walks it recursively. This means pointing --library at a
    // parent directory that happens to contain nested YAML files
    // "accidentally works" — documents are found, but their
    // documentPath is computed relative to the override, not
    // relative to the conventional .gvp/library/ root. This is the
    // same recursive-descent behavior as walk-back discovery;
    // --library just skips the walk-back and uses the provided path
    // as the root directly.
    //
    // Users who want the "traditional" layout should point --library
    // AT the library directory (e.g., ~/my-lib/.gvp/library/), not
    // at the project root. This test documents the actual behavior
    // so future changes don't accidentally tighten the semantic.
    const libDir = path.join(tmpDir, 'my-lib');
    writeLibraryAt(libDir);

    // Pointing at libDir directly: clean documentPath.
    const direct = buildCatalog(defaultConfig, tmpDir, libDir);
    const directEl = direct.getAllElements().find((e) => e.id === 'G1')!;
    expect(directEl.documentPath).toBe('project');

    // Pointing at the parent: still finds the doc, but its
    // documentPath is relative to the parent (`my-lib/project`).
    const parent = buildCatalog(defaultConfig, tmpDir, tmpDir);
    const parentEl = parent.getAllElements().find((e) => e.id === 'G1')!;
    expect(parentEl.documentPath).toBe('my-lib/project');
  });

  it('undefined libraryOverride preserves walk-back discovery', () => {
    // Regression: passing undefined should behave identically to
    // omitting the argument entirely. Walk-back from cwd should
    // still find a library at <cwd>/.gvp/library/.
    const lib = path.join(tmpDir, '.gvp', 'library');
    writeLibraryAt(lib);

    const catalogOmitted = buildCatalog(defaultConfig, tmpDir);
    const catalogUndefined = buildCatalog(defaultConfig, tmpDir, undefined);

    expect(catalogOmitted.getAllElements().map((e) => e.id)).toContain('G1');
    expect(catalogUndefined.getAllElements().map((e) => e.id)).toContain('G1');
  });
});

// Import vi lazily for vitest spy assertions
import { vi } from 'vitest';
