import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync, spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const CLI = path.resolve('dist/cli/index.js');

// `vitest run` alone would silently test a stale dist/. Fail loudly.
function assertFreshBuild(): void {
  if (!fs.existsSync(CLI)) throw new Error('dist/ missing — run `npm run build` first');
  const built = fs.statSync(CLI).mtimeMs;
  // NOTE: `recursive: true` requires Node >= 18.17. On 18.0-18.16 it
  // silently returns only top-level entries, so this would see just
  // src/*.ts. package.json declares engines >= 18.0.0.
  const newest = fs.readdirSync('src', { recursive: true, encoding: 'utf-8' })
    .filter((f) => typeof f === 'string' && f.endsWith('.ts'))
    .map((f) => fs.statSync(path.join('src', f)).mtimeMs)
    .reduce((a, b) => Math.max(a, b), 0);
  if (newest > built) throw new Error('dist/ is older than src/ — run `npm run build` first');
}

describe('libs end-to-end', () => {
  let proj: string, root: string, cache: string;

  // CAIRN_CACHE_DIR is set on EVERY invocation, not just the remote test.
  // The plan asserted "there is no cacheDir override on the CLI path" and
  // had the remote case seed the developer's real ~/.cache/cairn/sources.
  // That is wrong: createSourceResolver builds `new GitSourceResolver()`
  // with no argument, and both it and the pure `cachedPathFor` fall through
  // to defaultCacheDir(), which honors CAIRN_CACHE_DIR. Pointing it at a
  // temp dir keeps the "seed the cache, no network" intent while removing
  // the hazard of writing into (and rm -rf-ing) a real user cache.
  function run(args: string[], cwd: string, registryRoot: string): string {
    return execFileSync('node', [CLI, ...args], {
      cwd, encoding: 'utf-8',
      env: { ...process.env, GVP_REGISTRY_ROOT: registryRoot, CAIRN_CACHE_DIR: cache },
    });
  }

  /** Same invocation, but keeping stderr and the exit status (D57). */
  function runCapture(args: string[], cwd: string, registryRoot: string) {
    const r = spawnSync('node', [CLI, ...args], {
      cwd, encoding: 'utf-8',
      env: { ...process.env, GVP_REGISTRY_ROOT: registryRoot, CAIRN_CACHE_DIR: cache },
    });
    return { status: r.status, stdout: r.stdout, stderr: r.stderr };
  }

  beforeEach(() => {
    assertFreshBuild();
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-reg-'));
    cache = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-cache-'));
    proj = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-p-')));
    const lib = path.join(proj, '.gvp', 'library');
    fs.mkdirSync(lib, { recursive: true });
    fs.writeFileSync(path.join(lib, 'main.yaml'),
      'meta:\n  name: e2elib\n' +
      'goals:\n  - id: G1\n    name: A goal\n    statement: g\n' +
      'values:\n  - id: V1\n    name: A value\n    statement: v\n' +
      'decisions:\n  - id: D1\n    name: A choice\n' +
      '    rationale: chosen for the zebra property\n' +
      '    maps_to:\n      - e2elib:G1\n      - e2elib:V1\n');
  });
  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(cache, { recursive: true, force: true });
    fs.rmSync(proj, { recursive: true, force: true });
  });

  it('validate populates the registry and list reports the document', () => {
    run(['validate'], proj, root);
    const libs = JSON.parse(run(['libs', 'list', '--json'], proj, root));
    expect(libs.map((l: any) => l.name)).toContain('e2elib');
    expect(libs.find((l: any) => l.name === 'e2elib').kind).toBe('local');
  });

  it('search matches a DECISION rationale — the incident case', () => {
    run(['validate'], proj, root);
    const { results } = JSON.parse(run(['libs', 'search', 'zebra property', '--json'], proj, root));
    expect(results.map((r: any) => r.id)).toContain('D1');
    expect(results.find((r: any) => r.id === 'D1').field).toBe('rationale');
  });

  it('show reports which projects have used the library', () => {
    run(['validate'], proj, root);
    const out = JSON.parse(run(['libs', 'show', 'e2elib', '--json'], proj, root));
    expect(out[0].usage.seen_from).toContain(proj);
  });

  it('records a remote @github: source end-to-end', () => {
    // Seed the cache directly so no network I/O occurs, then inherit it.
    // The spec's end-to-end item requires BOTH a local library and a
    // remote @github: source to appear in `libs list`.
    const cached = path.join(cache, 'github', 'e2e--fixture', 'v1.0.0');
    fs.mkdirSync(cached, { recursive: true });
    fs.writeFileSync(path.join(cached, 'up.yaml'),
      'meta:\n  name: e2eup\nvalues:\n  - id: V1\n    name: Up\n    statement: u\n');
    const main = path.join(proj, '.gvp', 'library', 'main.yaml');
    fs.writeFileSync(main, fs.readFileSync(main, 'utf-8').replace(
      'meta:\n  name: e2elib\n',
      'meta:\n  name: e2elib\n  inherits:\n    - source: "@github:e2e/fixture@v1.0.0"\n'));
    run(['validate'], proj, root);
    const libs = JSON.parse(run(['libs', 'list', '--json'], proj, root));
    const remote = libs.find((l: any) => l.name === 'e2eup');
    expect(remote).toBeDefined();
    expect(remote.kind).toBe('remote');
    expect(remote.ref).toBe('v1.0.0');
    expect(libs.find((l: any) => l.name === 'e2elib')).toBeDefined();
  });

  it('an unwritable registry leaves exit code and stdout unchanged (D57)', () => {
    // The D57 guarantee exercised through the real CLI, not through
    // recordLibraries in isolation.
    //
    // The unwritable root is an ENOTDIR path -- its parent is a regular
    // file -- not a chmod 0o500 directory. chmod does not block uid 0, so
    // a root/CI run would silently succeed at writing and assert nothing.
    // A /proc path is NOT usable either: procfs answers mkdir(2) with
    // ENOENT even when the parent exists, and Node's recursive mkdir loops
    // forever on that (it hung the suite three times during Task 9).
    const blocker = path.join(root, 'blocker');
    fs.writeFileSync(blocker, 'not a directory\n');
    const unwritable = path.join(blocker, 'sub');

    // `query --format json` rather than `validate`: validate writes its
    // diagnostics to stderr, so its stdout is empty in BOTH arms and
    // "stdout unchanged" would be vacuously true.
    const ok = runCapture(['query', '--format', 'json'], proj, root);
    const blocked = runCapture(['query', '--format', 'json'], proj, unwritable);

    expect(ok.status).toBe(0);
    expect(blocked.status).toBe(0);
    expect(ok.stdout.length).toBeGreaterThan(0);
    expect(blocked.stdout).toBe(ok.stdout);
    // D57: warn ONCE to stderr and carry on.
    expect(blocked.stderr).toMatch(/could not update the library registry/);
    expect(blocked.stderr.match(/could not update the library registry/g)).toHaveLength(1);
    expect(ok.stderr).not.toMatch(/could not update the library registry/);
    // Nothing was written where it could not be written.
    expect(fs.existsSync(unwritable)).toBe(false);
  });

  it('--no-registry writes nothing', () => {
    const clean = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-clean-'));
    run(['--no-registry', 'validate'], proj, clean);
    expect(fs.existsSync(path.join(clean, 'libraries'))).toBe(false);
    fs.rmSync(clean, { recursive: true, force: true });
  });
});
