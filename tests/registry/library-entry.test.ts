import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { upsertLibraryEntry, readLibraryEntry, type LibraryEntry } from '../../src/registry/library-entry.js';
import { getLibrariesDir } from '../../src/registry/paths.js';

const base = (): LibraryEntry => ({
  name: 'code-common',
  source: '/abs/lib',
  document_path: 'code/common',
  file: 'code/common.yaml',
  scope: 'universal',
  project_id: null,
  library_id: null,
  element_counts: { principles: 15, rules: 2 },
});

/** Write a raw (possibly malformed) entry, bypassing upsert's shaping. */
function writeRaw(key: string, body: unknown): void {
  fs.mkdirSync(getLibrariesDir(), { recursive: true });
  fs.writeFileSync(
    path.join(getLibrariesDir(), `${key}.yml`),
    typeof body === 'string' ? body : yaml.dump(body)
  );
}

describe('library entry (D51)', () => {
  let tmp: string, orig: string | undefined;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lib-'));
    orig = process.env.GVP_REGISTRY_ROOT;
    process.env.GVP_REGISTRY_ROOT = tmp;
  });
  afterEach(() => {
    if (orig === undefined) delete process.env.GVP_REGISTRY_ROOT; else process.env.GVP_REGISTRY_ROOT = orig;
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('writes an entry that round-trips', () => {
    upsertLibraryEntry('deadbeefdeadbeef', base());
    expect(readLibraryEntry('deadbeefdeadbeef')).toEqual(base());
  });

  it('carries NO timestamps — they would void idempotence (P18)', () => {
    upsertLibraryEntry('deadbeefdeadbeef', base());
    const raw = fs.readFileSync(path.join(getLibrariesDir(), 'deadbeefdeadbeef.yml'), 'utf-8');
    expect(raw).not.toMatch(/first_seen|last_seen|timestamp/);
  });

  // The regex above only rules out three SPELLINGS. A per-writer field named
  // anything else (recorded_at, writer, host, seq) voids P18 just as
  // completely and would slip past it, so pin the field set exactly.
  it('stores exactly the eight declared fields — no per-writer field of any name (P18)', () => {
    upsertLibraryEntry('deadbeefdeadbeef', base());
    const raw = fs.readFileSync(path.join(getLibrariesDir(), 'deadbeefdeadbeef.yml'), 'utf-8');
    const parsed = yaml.load(raw) as Record<string, unknown>;
    expect(Object.keys(parsed).sort()).toEqual([
      'document_path',
      'element_counts',
      'file',
      'library_id',
      'name',
      'project_id',
      'scope',
      'source',
    ]);
  });

  it('is byte-identical across repeated writes of the same facts', () => {
    upsertLibraryEntry('k', base());
    const a = fs.readFileSync(path.join(getLibrariesDir(), 'k.yml'), 'utf-8');
    upsertLibraryEntry('k', base());
    const b = fs.readFileSync(path.join(getLibrariesDir(), 'k.yml'), 'utf-8');
    expect(b).toBe(a);
  });

  // The test above cannot fail while read-compare-skip is in place: the
  // second write is skipped, so the bytes are trivially unchanged. The
  // property P18 actually rests on is that two writers holding the same
  // facts emit the same bytes even when they BUILT the object differently.
  // That is what sortKeys buys, and only a different construction order
  // can detect its removal.
  it('is byte-identical across writers that constructed the object differently (sortKeys)', () => {
    upsertLibraryEntry('forward', base());
    const reversed: Record<string, unknown> = {};
    const src = base() as unknown as Record<string, unknown>;
    for (const k of Object.keys(src).reverse()) reversed[k] = src[k];
    upsertLibraryEntry('reversed', reversed as unknown as LibraryEntry);
    expect(fs.readFileSync(path.join(getLibrariesDir(), 'reversed.yml'), 'utf-8')).toBe(
      fs.readFileSync(path.join(getLibrariesDir(), 'forward.yml'), 'utf-8')
    );
  });

  // Read-compare-skip: asserted nowhere else. Without it every cairn command
  // rewrites every library entry. mtime is the observable — writeFileAtomic
  // renames a fresh temp file over the target, which resets it to now.
  it('does not rewrite the file when the on-disk bytes already match', () => {
    upsertLibraryEntry('k', base());
    const p = path.join(getLibrariesDir(), 'k.yml');
    const past = new Date('2020-01-01T00:00:00Z');
    fs.utimesSync(p, past, past);
    upsertLibraryEntry('k', base());
    expect(fs.statSync(p).mtime.getTime()).toBe(past.getTime());
  });

  // Pairs with the test above: proves the mtime probe is live rather than
  // measuring a write that never happens for some unrelated reason.
  it('does rewrite the file when the facts changed', () => {
    upsertLibraryEntry('k', base());
    const p = path.join(getLibrariesDir(), 'k.yml');
    const past = new Date('2020-01-01T00:00:00Z');
    fs.utimesSync(p, past, past);
    upsertLibraryEntry('k', { ...base(), element_counts: { principles: 16, rules: 2 } });
    expect(fs.statSync(p).mtime.getTime()).toBeGreaterThan(past.getTime());
  });

  it('last-write-wins when the library content changed', () => {
    upsertLibraryEntry('k', base());
    const changed = { ...base(), element_counts: { principles: 16, rules: 2 } };
    upsertLibraryEntry('k', changed);
    expect(readLibraryEntry('k')?.element_counts.principles).toBe(16);
  });

  it('returns null for a missing or corrupt entry rather than throwing', () => {
    expect(readLibraryEntry('nope')).toBeNull();
    fs.mkdirSync(getLibrariesDir(), { recursive: true });
    fs.writeFileSync(path.join(getLibrariesDir(), 'bad.yml'), '::: not yaml');
    expect(readLibraryEntry('bad')).toBeNull();
  });

  it('returns null for YAML that parses to a non-object', () => {
    writeRaw('scalar', '42\n');
    expect(readLibraryEntry('scalar')).toBeNull();
    writeRaw('seq', '- a\n- b\n');
    expect(readLibraryEntry('seq')).toBeNull();
    writeRaw('empty', '');
    expect(readLibraryEntry('empty')).toBeNull();
  });

  // A parseable-but-incomplete entry is reachable (hand-edited, half-written
  // by an older build) and STICKY -- pruneLibraryEntries only unlinks
  // UNparseable entries. `libs search` joins `file`, `show` iterates
  // element_counts: handing such an entry back throws a TypeError far away
  // from here.
  it('rejects an entry missing any field a consumer dereferences', () => {
    for (const missing of ['source', 'document_path', 'file'] as const) {
      const e = base() as unknown as Record<string, unknown>;
      delete e[missing];
      writeRaw('partial', e);
      expect(readLibraryEntry('partial'), `missing ${missing}`).toBeNull();
    }
  });

  it('normalizes the optional fields instead of handing back non-strings', () => {
    writeRaw('weird', {
      ...base(),
      name: 42,
      scope: ['universal'],
      project_id: { a: 1 },
      library_id: true,
      element_counts: 'not-a-map',
    });
    const e = readLibraryEntry('weird');
    expect(e).not.toBeNull();
    expect(e!.name).toBeNull();
    expect(e!.scope).toBeNull();
    expect(e!.project_id).toBeNull();
    expect(e!.library_id).toBeNull();
    expect(e!.element_counts).toEqual({});
  });

  it('normalizes a list-valued element_counts to an empty map', () => {
    writeRaw('listcounts', { ...base(), element_counts: [1, 2, 3] });
    expect(readLibraryEntry('listcounts')!.element_counts).toEqual({});
  });
});
