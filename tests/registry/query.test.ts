import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { loadAllLibraries, invertUsage } from '../../src/registry/query.js';
import { upsertLibraryEntry } from '../../src/registry/library-entry.js';
import { getProjectsDir, getLibrariesDir } from '../../src/registry/paths.js';

describe('registry query (D50, D53)', () => {
  let tmp: string, orig: string | undefined;
  let origCache: string | undefined, cache: string;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'q-'));
    orig = process.env.GVP_REGISTRY_ROOT;
    process.env.GVP_REGISTRY_ROOT = tmp;
    // Isolate the remote cache too: `cached` would otherwise be answered by
    // whatever happens to be cloned on the developer's machine.
    cache = fs.mkdtempSync(path.join(os.tmpdir(), 'qc-'));
    origCache = process.env.CAIRN_CACHE_DIR;
    process.env.CAIRN_CACHE_DIR = cache;
  });
  afterEach(() => {
    if (orig === undefined) delete process.env.GVP_REGISTRY_ROOT; else process.env.GVP_REGISTRY_ROOT = orig;
    if (origCache === undefined) delete process.env.CAIRN_CACHE_DIR; else process.env.CAIRN_CACHE_DIR = origCache;
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.rmSync(cache, { recursive: true, force: true });
  });

  const entry = (over: Record<string, unknown> = {}) => ({
    name: 'personal', source: '/abs/lib', document_path: 'personal', file: 'personal.yaml',
    scope: null, project_id: null, library_id: null, element_counts: { values: 3 }, ...over,
  }) as any;

  it('derives kind and ref rather than reading stored fields (D50)', () => {
    upsertLibraryEntry('k1', entry());
    upsertLibraryEntry('k2', entry({ source: '@github:a/b@v0.7.0' }));
    const libs = loadAllLibraries();
    expect(libs.find((l) => l.key === 'k1')!.kind).toBe('local');
    expect(libs.find((l) => l.key === 'k2')!.kind).toBe('remote');
    expect(libs.find((l) => l.key === 'k2')!.ref).toBe('v0.7.0');
  });

  it('ignores kind/ref present on disk and recomputes from source (D50)', () => {
    // A hand-edited or future-build entry carrying kind/ref must not be
    // believed -- D50 says they are derived, never stored. Defense in
    // depth: readLibraryEntry already strips unknown keys, so mutating
    // either layer ALONE still passes; this pins the end-to-end guarantee
    // that survives when both change.
    fs.mkdirSync(getLibrariesDir(), { recursive: true });
    fs.writeFileSync(path.join(getLibrariesDir(), 'k3.yml'), yaml.dump({
      ...entry({ source: '@github:a/b@v9.9.9' }), kind: 'local', ref: 'LIES',
    }));
    const lib = loadAllLibraries().find((l) => l.key === 'k3')!;
    expect(lib.kind).toBe('remote');
    expect(lib.ref).toBe('v9.9.9');
  });

  it('reports a local library that is present on disk as cached', () => {
    const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ql-')));
    upsertLibraryEntry('k4', entry({ source: dir }));
    expect(loadAllLibraries().find((l) => l.key === 'k4')!.cached).toBe(true);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('inverts the usage edge into seen_from with min/max timestamps', () => {
    fs.mkdirSync(getProjectsDir(), { recursive: true });
    fs.writeFileSync(path.join(getProjectsDir(), 'p1.yml'), yaml.dump({
      project_id: 'p1', project_name: 'one', locations: [{ path: '/p/one', last_seen: 'T' }],
      libraries: [{ hash: 'k1', first_seen: '2026-01-01T00:00:00Z', last_seen: '2026-02-01T00:00:00Z' }],
    }));
    fs.writeFileSync(path.join(getProjectsDir(), 'p2.yml'), yaml.dump({
      project_id: 'p2', project_name: 'two', locations: [{ path: '/p/two', last_seen: 'T' }],
      libraries: [{ hash: 'k1', first_seen: '2025-06-01T00:00:00Z', last_seen: '2026-09-01T00:00:00Z' }],
    }));
    const usage = invertUsage();
    expect(usage.get('k1')!.seen_from.sort()).toEqual(['/p/one', '/p/two']);
    expect(usage.get('k1')!.first_seen).toBe('2025-06-01T00:00:00Z');
    expect(usage.get('k1')!.last_seen).toBe('2026-09-01T00:00:00Z');
  });

  it('does not attribute one project\'s libraries to another (D53)', () => {
    fs.mkdirSync(getProjectsDir(), { recursive: true });
    fs.writeFileSync(path.join(getProjectsDir(), 'p1.yml'), yaml.dump({
      project_id: 'p1', locations: [{ path: '/p/one' }],
      libraries: [{ hash: 'ka', first_seen: 'A', last_seen: 'A' }],
    }));
    fs.writeFileSync(path.join(getProjectsDir(), 'p2.yml'), yaml.dump({
      project_id: 'p2', locations: [{ path: '/p/two' }],
      libraries: [{ hash: 'kb', first_seen: 'B', last_seen: 'B' }],
    }));
    const usage = invertUsage();
    expect(usage.get('ka')!.seen_from).toEqual(['/p/one']);
    expect(usage.get('kb')!.seen_from).toEqual(['/p/two']);
  });

  it('records a shared location once across project entries', () => {
    fs.mkdirSync(getProjectsDir(), { recursive: true });
    for (const id of ['p1', 'p2']) {
      fs.writeFileSync(path.join(getProjectsDir(), `${id}.yml`), yaml.dump({
        project_id: id, locations: [{ path: '/p/shared' }],
        libraries: [{ hash: 'k1', first_seen: 'A', last_seen: 'Z' }],
      }));
    }
    expect(invertUsage().get('k1')!.seen_from).toEqual(['/p/shared']);
  });

  it('ignores usage edges whose hash is not a string', () => {
    fs.mkdirSync(getProjectsDir(), { recursive: true });
    fs.writeFileSync(path.join(getProjectsDir(), 'p1.yml'), yaml.dump({
      project_id: 'p1', locations: [{ path: '/p/one' }],
      libraries: [{ hash: 42 }, { hash: null }, 'not-an-object', { hash: 'good', last_seen: 'Z' }],
    }));
    expect([...invertUsage().keys()]).toEqual(['good']);
  });

  it('marks a remote whose cache is gone as not cached', () => {
    upsertLibraryEntry('k2', entry({ source: '@github:a/b@v0.7.0' }));
    expect(loadAllLibraries().find((l) => l.key === 'k2')!.cached).toBe(false);
  });

  it('marks a remote present in the cache as cached', () => {
    fs.mkdirSync(path.join(cache, 'github', 'a--b', 'v0.7.0'), { recursive: true });
    upsertLibraryEntry('k5', entry({ source: '@github:a/b@v0.7.0' }));
    expect(loadAllLibraries().find((l) => l.key === 'k5')!.cached).toBe(true);
  });

  // Genuinely unparseable YAML. `::: nope` LOOKS corrupt but js-yaml parses
  // it to {'::': 'nope'}, so a test using it exercises the shape guard, not
  // the parse guard.
  const CORRUPT = 'libraries: [1, 2\nlocations: }{\n';

  it('skips corrupt project entries instead of throwing', () => {
    fs.mkdirSync(getProjectsDir(), { recursive: true });
    fs.writeFileSync(path.join(getProjectsDir(), 'bad.yml'), CORRUPT);
    expect(() => invertUsage()).not.toThrow();
  });

  it('skips a project entry that parses but has the wrong shape', () => {
    fs.mkdirSync(getProjectsDir(), { recursive: true });
    fs.writeFileSync(path.join(getProjectsDir(), 'odd.yml'), '::: nope\n');
    fs.writeFileSync(path.join(getProjectsDir(), 'scalar.yml'), 'hello\n');
    fs.writeFileSync(path.join(getProjectsDir(), 'notlist.yml'), yaml.dump({ libraries: 'nope' }));
    expect(() => invertUsage()).not.toThrow();
    expect(invertUsage().size).toBe(0);
  });

  it('keeps the good project entries when one is corrupt', () => {
    fs.mkdirSync(getProjectsDir(), { recursive: true });
    fs.writeFileSync(path.join(getProjectsDir(), 'bad.yml'), CORRUPT);
    fs.writeFileSync(path.join(getProjectsDir(), 'ok.yml'), yaml.dump({
      project_id: 'ok', locations: [{ path: '/p/ok' }],
      libraries: [{ hash: 'kk', first_seen: 'A', last_seen: 'Z' }],
    }));
    expect(invertUsage().get('kk')!.seen_from).toEqual(['/p/ok']);
  });

  it('returns an empty map when no projects have been recorded', () => {
    expect(invertUsage().size).toBe(0);
  });
});
