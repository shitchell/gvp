import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Command } from 'commander';
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { parseConfigOptions, buildCatalog } from '../../src/cli/helpers.js';
import { runProjectPreflight } from '../../src/config/preflight.js';
import { configSchema } from '../../src/config/schema.js';
import { getLibrariesDir, getProjectsDir } from '../../src/registry/paths.js';

/**
 * Task 10 wiring (D42, D43): recording runs from catalog construction,
 * not from config parsing, and every command that builds a catalog hands
 * `buildCatalog` the project identity so the usage edge (D53) is written.
 *
 * Contract pinned here:
 *   - parseConfigOptions RETURNS the PreflightResult instead of consuming it
 *   - parseConfigOptions itself writes nothing to the registry
 *   - buildCatalog records libraries, and the project edge only when the
 *     preflight was actually passed through (a call site left unwired
 *     records libraries but silently loses the project edge)
 *   - `--no-registry` disables recording, and survives `--no-config`
 *   - the D57 warning is EMITTED, once, on stderr
 */

const FIXTURE_DOC = [
  'meta:',
  '  name: wiring-fixture',
  'goals:',
  '  - id: G1',
  '    name: Ship it',
  '    statement: Ship the thing.',
  'values:',
  '  - id: V1',
  '    name: Care',
  '    statement: Care about the thing.',
  '',
].join('\n');

function makeProject(): string {
  const proj = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'cairn-wiring-')));
  fs.mkdirSync(path.join(proj, '.gvp', 'library'), { recursive: true });
  fs.writeFileSync(path.join(proj, '.gvp', 'library', 'main.yaml'), FIXTURE_DOC);
  return proj;
}

/** A Command stand-in: parseConfigOptions calls optsWithGlobals(), not opts(). */
function fakeCmd(opts: Record<string, unknown>): Command {
  const cmd = new Command();
  cmd.optsWithGlobals = () => opts as never;
  return cmd;
}

function libraryEntryFiles(): string[] {
  try {
    return fs.readdirSync(getLibrariesDir()).sort();
  } catch {
    return [];
  }
}

describe('recording wiring (D42)', () => {
  let proj: string, orig: string | undefined, tmp: string;

  beforeEach(() => {
    tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'reg-')));
    orig = process.env.GVP_REGISTRY_ROOT;
    process.env.GVP_REGISTRY_ROOT = tmp;
    proj = makeProject();
  });

  afterEach(() => {
    if (orig === undefined) delete process.env.GVP_REGISTRY_ROOT;
    else process.env.GVP_REGISTRY_ROOT = orig;
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.rmSync(proj, { recursive: true, force: true });
  });

  describe('parseConfigOptions', () => {
    it('surfaces a PreflightResult carrying gvpDir and projectId', () => {
      const prev = process.cwd();
      process.chdir(proj);
      try {
        const { preflight } = parseConfigOptions(fakeCmd({}));
        expect(preflight.gvpDir).toBe(path.join(proj, '.gvp'));
        expect(typeof preflight.projectId).toBe('string');
      } finally {
        process.chdir(prev);
      }
    });

    it('does not write the registry during config parsing — that moved post-catalog (D53)', () => {
      const prev = process.cwd();
      process.chdir(proj);
      try {
        parseConfigOptions(fakeCmd({}));
        expect(fs.existsSync(path.join(tmp, 'by-id'))).toBe(false);
        expect(fs.existsSync(path.join(tmp, 'libraries'))).toBe(false);
      } finally {
        process.chdir(prev);
      }
    });

    it('leaves the registry enabled when --no-registry is absent (D43)', () => {
      const prev = process.cwd();
      process.chdir(proj);
      try {
        // commander gives `registry: true` for an untouched `--no-X` option.
        const { config } = parseConfigOptions(fakeCmd({ registry: true }));
        expect(config.registry?.enabled).toBe(true);
      } finally {
        process.chdir(prev);
      }
    });

    it('turns recording off for --no-registry (D44)', () => {
      const prev = process.cwd();
      process.chdir(proj);
      try {
        const { config } = parseConfigOptions(fakeCmd({ registry: false }));
        expect(config.registry?.enabled).toBe(false);
      } finally {
        process.chdir(prev);
      }
    });
  });

  describe('buildCatalog records (D42)', () => {
    it('writes library entries and the project edge when the preflight is passed', () => {
      const preflight = runProjectPreflight(proj);
      buildCatalog(configSchema.parse({}), proj, undefined, undefined, preflight);

      expect(libraryEntryFiles()).toHaveLength(1);
      const entryPath = path.join(getProjectsDir(), `${preflight.projectId}.yml`);
      expect(fs.existsSync(entryPath)).toBe(true);
      const entry = yaml.load(fs.readFileSync(entryPath, 'utf-8')) as {
        project_name: string;
        locations: { path: string }[];
        libraries: { hash: string }[];
      };
      // The project's path is the parent of .gvp/, and its name that dir's
      // basename — the derivation runRegistryPreflight used to own.
      expect(entry.project_name).toBe(path.basename(proj));
      expect(entry.locations.map((l) => l.path)).toEqual([proj]);
      expect(entry.libraries.map((l) => l.hash)).toEqual(
        libraryEntryFiles().map((f) => f.replace(/\.yml$/, '')),
      );
    });

    it('loses the project edge when a call site forgets the preflight (D58)', () => {
      // This is the shape of an unwired command: the library keyspace still
      // fills, so "the registry has entries" would pass while that command
      // contributed no usage edge at all.
      buildCatalog(configSchema.parse({}), proj);
      expect(libraryEntryFiles()).toHaveLength(1);
      expect(fs.existsSync(getProjectsDir())).toBe(false);
    });

    it('records nothing when registry.enabled is false (D43/D44)', () => {
      const preflight = runProjectPreflight(proj);
      buildCatalog(
        configSchema.parse({ registry: { enabled: false } }),
        proj,
        undefined,
        undefined,
        preflight,
      );
      expect(fs.existsSync(getLibrariesDir())).toBe(false);
      expect(fs.existsSync(getProjectsDir())).toBe(false);
    });

    it('the --no-registry opt-out survives --no-config', () => {
      // --no-config discards every config layer, so a global
      // `registry.enabled: false` is defeated by it (recorded under
      // Deferred). The FLAG must not be: it is applied to the loaded
      // config after loadConfig, so no config-discovery flag can bypass it.
      const prev = process.cwd();
      process.chdir(proj);
      let config;
      try {
        ({ config } = parseConfigOptions(fakeCmd({ registry: false, config: false })));
      } finally {
        process.chdir(prev);
      }
      expect(config.registry?.enabled).toBe(false);
      buildCatalog(config, proj, undefined, undefined, runProjectPreflight(proj));
      expect(fs.existsSync(getLibrariesDir())).toBe(false);
      expect(fs.existsSync(getProjectsDir())).toBe(false);
    });

    it('emits the D57 warning on stderr, once, when recording fails', () => {
      // Unwritable root by ENOTDIR — the parent is a regular file, so every
      // write beneath it fails for every uid (root included).
      const blocked = path.join(tmp, 'not-a-dir');
      fs.writeFileSync(blocked, 'x');
      const preflight = runProjectPreflight(proj);
      process.env.GVP_REGISTRY_ROOT = path.join(blocked, 'registry');

      const seen: string[] = [];
      const spy = vi
        .spyOn(process.stderr, 'write')
        .mockImplementation((chunk: string | Uint8Array) => {
          seen.push(String(chunk));
          return true;
        });
      try {
        expect(() =>
          buildCatalog(configSchema.parse({}), proj, undefined, undefined, preflight),
        ).not.toThrow();
      } finally {
        spy.mockRestore();
      }

      const warnings = seen.filter((s) => s.includes('library registry'));
      expect(warnings).toHaveLength(1);
      expect(warnings[0]!.endsWith('\n')).toBe(true);
    });

    it('prints nothing on the happy path (D57)', () => {
      const preflight = runProjectPreflight(proj);
      const seen: string[] = [];
      const spy = vi
        .spyOn(process.stderr, 'write')
        .mockImplementation((chunk: string | Uint8Array) => {
          seen.push(String(chunk));
          return true;
        });
      try {
        buildCatalog(configSchema.parse({}), proj, undefined, undefined, preflight);
      } finally {
        spy.mockRestore();
      }
      expect(seen.filter((s) => s.includes('library registry'))).toEqual([]);
    });
  });

  // Every command that builds a catalog must hand the preflight through.
  // Asserted per command against the BUILT CLI: an unwired call site still
  // records library entries, so only the project edge distinguishes it.
  describe('every catalog-building command is wired (D42)', () => {
    const CLI = path.resolve(__dirname, '../../dist/cli/index.js');
    const COMMANDS: [string, string[]][] = [
      ['add', ['add', 'goal', 'Another goal']],
      ['analyze', ['analyze']],
      ['diff', ['diff']],
      ['edit', ['edit', 'G1', '--skip-review', '-f', 'statement=changed']],
      ['export', ['export']],
      ['import', ['import', 'no-such-patch.yaml']],
      ['inspect', ['inspect', 'G1']],
      ['mv', ['mv', 'wiring-fixture:G1', 'wiring-fixture']],
      ['query', ['query']],
      ['review', ['review']],
      ['validate', ['validate']],
    ];

    it.each(COMMANDS)('%s passes the preflight to buildCatalog', (_name, argv) => {
      const root = path.join(proj, '.registry');
      const result = spawnSync('node', [CLI, ...argv], {
        cwd: proj,
        env: { ...process.env, GVP_REGISTRY_ROOT: root },
        encoding: 'utf-8',
        timeout: 15000,
      });
      // Exit status is irrelevant — several of these legitimately fail after
      // catalog construction. What matters is that recording happened.
      const projectId = (
        yaml.load(fs.readFileSync(path.join(proj, '.gvp', 'config.yaml'), 'utf-8')) as {
          project_id: string;
        }
      ).project_id;
      const entryPath = path.join(root, 'by-id', `${projectId}.yml`);
      expect(
        fs.existsSync(entryPath),
        `no project entry after \`cairn ${argv.join(' ')}\`; stderr: ${result.stderr}`,
      ).toBe(true);
      const entry = yaml.load(fs.readFileSync(entryPath, 'utf-8')) as {
        libraries?: { hash: string }[];
      };
      expect(entry.libraries?.length).toBeGreaterThan(0);
    });

    it('--no-registry is a registered flag, and records nothing (D44)', () => {
      // The other half of the opt-out: the config path is unit-tested above,
      // but nothing else proves the option is REGISTERED on the program —
      // an unregistered `--no-registry` makes commander reject the whole
      // invocation with "unknown option".
      const root = path.join(proj, '.registry');
      const result = spawnSync('node', [CLI, '--no-registry', 'validate'], {
        cwd: proj,
        env: { ...process.env, GVP_REGISTRY_ROOT: root },
        encoding: 'utf-8',
        timeout: 15000,
      });
      expect(result.stderr).not.toMatch(/unknown option/i);
      expect(fs.existsSync(root)).toBe(false);
    });
  });
});
