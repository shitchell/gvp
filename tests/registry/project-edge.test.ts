import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { upsertRegistryEntry } from '../../src/config/registry.js';
import { getProjectsDir } from '../../src/registry/paths.js';
import { writeFileAtomic } from '../../src/registry/atomic.js';

// Pass-through spy: real writes still happen, we just count them. Needed
// because the ESM `fs` namespace is not spy-able.
vi.mock('../../src/registry/atomic.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/registry/atomic.js')>();
  return { ...actual, writeFileAtomic: vi.fn(actual.writeFileAtomic) };
});

describe('project entry with usage edge (D53)', () => {
  let tmp: string, orig: string | undefined, proj: string;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'proj-'));
    orig = process.env.GVP_REGISTRY_ROOT;
    process.env.GVP_REGISTRY_ROOT = tmp;
    proj = fs.mkdtempSync(path.join(os.tmpdir(), 'p-'));
  });
  afterEach(() => {
    if (orig === undefined) delete process.env.GVP_REGISTRY_ROOT; else process.env.GVP_REGISTRY_ROOT = orig;
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.rmSync(proj, { recursive: true, force: true });
  });

  const read = (id: string) =>
    yaml.load(fs.readFileSync(path.join(getProjectsDir(), `${id}.yml`), 'utf-8')) as any;

  it('writes libraries alongside locations in ONE call', () => {
    upsertRegistryEntry('id-1', 'proj', proj, ['aaa', 'bbb']);
    const e = read('id-1');
    expect(e.locations).toHaveLength(1);
    expect(e.libraries.map((l: any) => l.hash).sort()).toEqual(['aaa', 'bbb']);
  });

  it('merges rather than replaces on a second call', () => {
    upsertRegistryEntry('id-1', 'proj', proj, ['aaa']);
    upsertRegistryEntry('id-1', 'proj', proj, ['bbb']);
    const e = read('id-1');
    expect(e.libraries.map((l: any) => l.hash).sort()).toEqual(['aaa', 'bbb']);
  });

  it('omitting hashes leaves existing edges untouched (D58)', () => {
    upsertRegistryEntry('id-1', 'proj', proj, ['aaa']);
    upsertRegistryEntry('id-1', 'proj', proj);
    expect(read('id-1').libraries.map((l: any) => l.hash)).toEqual(['aaa']);
  });

  const entryFile = (id: string) => path.join(getProjectsDir(), `${id}.yml`);

  it('adds no libraries key at all when hashes are omitted, and strips a non-list one', () => {
    upsertRegistryEntry('id-1', 'proj', proj);
    expect('libraries' in read('id-1')).toBe(false);

    // A non-list value reaches disk from an older build or a hand-edit. Without
    // normalization it round-trips through the read-modify-write and sticks
    // forever, and every consumer that calls .map on it throws.
    const corrupt = read('id-1');
    corrupt.libraries = 'not-a-list';
    fs.writeFileSync(entryFile('id-1'), yaml.dump(corrupt));

    upsertRegistryEntry('id-1', 'proj', proj);
    expect(read('id-1').libraries).toBeUndefined();
  });

  it('survives a non-list libraries value when hashes ARE observed', () => {
    upsertRegistryEntry('id-1', 'proj', proj);
    const corrupt = read('id-1');
    corrupt.libraries = { not: 'a list' };
    fs.writeFileSync(entryFile('id-1'), yaml.dump(corrupt));

    // Must not throw out of upsertRegistryEntry: the only throw this function
    // is allowed to emit is the wrapped 'registry write failed' its callers
    // catch, so an unguarded iteration over a corrupt value would escape.
    expect(() => upsertRegistryEntry('id-1', 'proj', proj, ['aaa'])).not.toThrow();
    expect(read('id-1').libraries.map((l: any) => l.hash)).toEqual(['aaa']);
  });

  it('performs exactly ONE write of the entry per call', () => {
    upsertRegistryEntry('id-1', 'proj', proj, ['aaa']);
    // The location upsert and the edge merge share a single read-modify-write.
    // Two writes would double the window in which a concurrent reader — normal
    // per C2 — observes a half-updated entry.
    const spy = vi.mocked(writeFileAtomic);
    spy.mockClear();
    upsertRegistryEntry('id-1', 'proj', proj, ['bbb']);
    const writes = spy.mock.calls.filter((c) => c[0] === entryFile('id-1'));
    expect(writes).toHaveLength(1);
  });
});
