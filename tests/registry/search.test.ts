import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { searchLibraries, searchLibrariesWithSkips } from '../../src/registry/query.js';
import { upsertLibraryEntry } from '../../src/registry/library-entry.js';

// The network guarantee (D54) is only testable if a resolve() call is
// observable. Wrap the real module so cachedPathFor stays PURE and real,
// and only createSourceResolver is instrumented.
const netSpy = vi.hoisted(() => vi.fn());
vi.mock('../../src/inheritance/source-resolver.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/inheritance/source-resolver.js')>();
  return {
    ...actual,
    createSourceResolver: (...args: unknown[]) => {
      netSpy(...args);
      return { resolve: (src: string) => { throw new Error(`network attempted for ${src}`); } };
    },
  };
});

describe('libs search (D54, R6)', () => {
  let tmp: string, lib: string, orig: string | undefined;
  let cache: string, origCache: string | undefined;
  beforeEach(() => {
    netSpy.mockClear();
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 's-'));
    orig = process.env.GVP_REGISTRY_ROOT;
    process.env.GVP_REGISTRY_ROOT = tmp;
    cache = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-'));
    origCache = process.env.CAIRN_CACHE_DIR;
    process.env.CAIRN_CACHE_DIR = cache;
    lib = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sl-')));
    fs.writeFileSync(path.join(lib, 'p.yaml'),
      'meta:\n  name: personal\n' +
      'principles:\n  - id: P17\n    name: Build a tentative flex point\n    statement: seam uncertain\n' +
      'decisions:\n  - id: D1\n    name: Pick a thing\n    rationale: the flex point argument\n');
    upsertLibraryEntry('k', {
      name: 'personal', source: lib, document_path: 'p', file: 'p.yaml', scope: null,
      project_id: null, library_id: null, element_counts: { principles: 1, decisions: 1 },
    });
  });
  afterEach(() => {
    if (orig === undefined) delete process.env.GVP_REGISTRY_ROOT; else process.env.GVP_REGISTRY_ROOT = orig;
    if (origCache === undefined) delete process.env.CAIRN_CACHE_DIR; else process.env.CAIRN_CACHE_DIR = origCache;
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.rmSync(cache, { recursive: true, force: true });
    fs.rmSync(lib, { recursive: true, force: true });
  });

  it('matches element names, and says so', () => {
    const hits = searchLibraries('tentative');
    expect(hits.map((r) => r.id)).toContain('P17');
    // Reporting the field the hit actually came from -- not just the
    // category's primary field -- is what makes a name hit distinguishable.
    expect(hits.find((r) => r.id === 'P17')!.field).toBe('name');
    expect(hits.find((r) => r.id === 'P17')!.excerpt).toBe('Build a tentative flex point');
  });

  it('matches a DECISION rationale — the incident case', () => {
    const ids = searchLibraries('flex point argument').map((r) => r.id);
    expect(ids).toContain('D1');
  });

  it('reports the matched field, so a rationale hit is not mislabelled', () => {
    const hit = searchLibraries('flex point argument').find((r) => r.id === 'D1')!;
    expect(hit.field).toBe('rationale');
    expect(hit.category).toBe('decisions');
    expect(hit.excerpt).toContain('flex point argument');
    expect(hit.key).toBe('k');
    expect(hit.library).toBe('personal');
    expect(hit.document_path).toBe('p');
  });

  it('matches a principle statement', () => {
    expect(searchLibraries('seam uncertain').map((r) => r.id)).toContain('P17');
  });

  it('does not match a field that is neither name nor the primary field (R6)', () => {
    // `impact` is the CONSTRAINT primary field, so finding it on a principle
    // would mean the search is unioning field names instead of dispatching
    // on the category's schema.
    fs.writeFileSync(path.join(lib, 'p.yaml'),
      'meta:\n  name: personal\n' +
      'principles:\n  - id: P18\n    name: Quiet\n    statement: nothing here\n    impact: zebracoded\n');
    expect(searchLibraries('zebracoded')).toEqual([]);
  });

  it('searches a USER-DEFINED category via its declared primary field', () => {
    // A defaults-only registry makes every user-defined category
    // unsearchable -- the silent-miss failure #15 is about.
    fs.writeFileSync(path.join(lib, 'p.yaml'),
      'meta:\n  name: personal\n  definitions:\n    categories:\n      wager:\n' +
      '        yaml_key: wagers\n        id_prefix: W\n        primary_field: bet\n' +
      'wagers:\n  - id: W1\n    name: A punt\n    bet: quantum lentils\n');
    const hits = searchLibraries('quantum lentils');
    expect(hits.map((h) => h.id)).toEqual(['W1']);
    expect(hits[0]!.field).toBe('bet');
  });

  it('still matches names in a category with no primary_field', () => {
    fs.writeFileSync(path.join(lib, 'p.yaml'),
      'meta:\n  name: personal\n  definitions:\n    categories:\n      wager:\n' +
      '        yaml_key: wagers\n        id_prefix: W\n' +
      'wagers:\n  - id: W1\n    name: quantum lentils\n    bet: unsearchable\n');
    expect(searchLibraries('quantum lentils').map((h) => h.id)).toEqual(['W1']);
    expect(searchLibraries('unsearchable')).toEqual([]);
  });

  it('is case-insensitive in both directions', () => {
    // Both directions matter: lowering only the QUERY still misses an
    // upper-case value in the document.
    expect(searchLibraries('TENTATIVE').map((r) => r.id)).toContain('P17');
    fs.writeFileSync(path.join(lib, 'p.yaml'),
      'meta:\n  name: personal\n' +
      'decisions:\n  - id: D2\n    name: SHOUTED NAME\n    rationale: LOUD RATIONALE\n');
    expect(searchLibraries('shouted name').map((r) => r.id)).toEqual(['D2']);
    expect(searchLibraries('loud rationale').map((r) => r.id)).toEqual(['D2']);
  });

  it('reports an element once even when name and primary field both match', () => {
    fs.writeFileSync(path.join(lib, 'p.yaml'),
      'meta:\n  name: personal\n' +
      'decisions:\n  - id: D3\n    name: flex point\n    rationale: the flex point argument\n');
    expect(searchLibraries('flex point').map((r) => r.id)).toEqual(['D3']);
  });

  it('bounds the excerpt so one long field cannot flood the output', () => {
    const long = 'x'.repeat(400);
    fs.writeFileSync(path.join(lib, 'p.yaml'),
      'meta:\n  name: personal\n' +
      `decisions:\n  - id: D4\n    name: Long one\n    rationale: needle ${long}\n`);
    expect(searchLibraries('needle')[0]!.excerpt).toHaveLength(160);
  });

  it('reports uncached remotes rather than silently skipping them', () => {
    upsertLibraryEntry('r', {
      name: 'up', source: '@github:a/b@v1', document_path: 'x', file: 'x.yaml', scope: null,
      project_id: null, library_id: null, element_counts: {},
    });
    const { skipped } = searchLibrariesWithSkips('tentative');
    expect(skipped).toContain('@github:a/b@v1');
  });

  it('never touches the network for an uncached remote without --fetch (D54)', () => {
    upsertLibraryEntry('r', {
      name: 'up', source: '@github:a/b@v1', document_path: 'x', file: 'x.yaml', scope: null,
      project_id: null, library_id: null, element_counts: {},
    });
    const { results, skipped } = searchLibrariesWithSkips('tentative');
    expect(netSpy).not.toHaveBeenCalled();
    expect(skipped).toEqual(['@github:a/b@v1']);
    // The cached libraries are still searched -- one uncached remote must
    // not swallow the rest of the results.
    expect(results.map((r) => r.id)).toContain('P17');
  });

  it('opts into the network only under --fetch, and reports a failed fetch as skipped', () => {
    upsertLibraryEntry('r', {
      name: 'up', source: '@github:a/b@v1', document_path: 'x', file: 'x.yaml', scope: null,
      project_id: null, library_id: null, element_counts: {},
    });
    const { skipped } = searchLibrariesWithSkips('tentative', { fetch: true });
    expect(netSpy).toHaveBeenCalledTimes(1);
    expect(skipped).toEqual(['@github:a/b@v1']);
  });

  it('reports a local library whose directory is gone as missingLocal, not skipped', () => {
    fs.rmSync(lib, { recursive: true, force: true });
    const { skipped, missingLocal, unreadable } = searchLibrariesWithSkips('tentative');
    expect(missingLocal).toEqual([lib]);
    expect(skipped).toEqual([]);
    expect(unreadable).toEqual([]);
    // A missing local is NOT --fetch eligible: D54's fetch policy is about
    // remotes, so --fetch must not reclassify or network on it.
    const withFetch = searchLibrariesWithSkips('tentative', { fetch: true });
    expect(withFetch.missingLocal).toEqual([lib]);
    expect(netSpy).not.toHaveBeenCalled();
  });

  it('reports a present directory with a missing document as unreadable', () => {
    fs.rmSync(path.join(lib, 'p.yaml'));
    const { unreadable, missingLocal, skipped } = searchLibrariesWithSkips('tentative');
    expect(unreadable).toEqual([path.join(lib, 'p.yaml')]);
    expect(missingLocal).toEqual([]);
    expect(skipped).toEqual([]);
  });

  it('reports an unparseable document as unreadable rather than throwing', () => {
    // Genuinely unparseable: an unclosed flow sequence. (`::: nope` LOOKS
    // broken but js-yaml happily parses it to {'::': 'nope'}.)
    fs.writeFileSync(path.join(lib, 'p.yaml'), 'decisions: [1, 2\nmeta: }{\n');
    let res!: ReturnType<typeof searchLibrariesWithSkips>;
    expect(() => { res = searchLibrariesWithSkips('tentative'); }).not.toThrow();
    expect(res.unreadable).toEqual([path.join(lib, 'p.yaml')]);
  });

  it('reports a document that parses to a non-object as unreadable', () => {
    fs.writeFileSync(path.join(lib, 'p.yaml'), 'just a scalar\n');
    expect(searchLibrariesWithSkips('tentative').unreadable).toEqual([path.join(lib, 'p.yaml')]);
  });

  it('searches a cached remote without any network call', () => {
    const remote = path.join(cache, 'github', 'a--b', 'v1');
    fs.mkdirSync(remote, { recursive: true });
    fs.writeFileSync(path.join(remote, 'x.yaml'),
      'meta:\n  name: up\ndecisions:\n  - id: D9\n    name: Upstream call\n    rationale: cached rationale text\n');
    upsertLibraryEntry('r', {
      name: 'up', source: '@github:a/b@v1', document_path: 'x', file: 'x.yaml', scope: null,
      project_id: null, library_id: null, element_counts: { decisions: 1 },
    });
    const { results, skipped } = searchLibrariesWithSkips('cached rationale');
    expect(results.map((r) => r.id)).toEqual(['D9']);
    expect(skipped).toEqual([]);
    expect(netSpy).not.toHaveBeenCalled();
  });

  it('keeps scanning past every skip bucket and reports all three (D54)', () => {
    // A skip must not truncate the scan: the good library's hits still come
    // back even when a missing local, an uncached remote, and an unreadable
    // document all sit in the registry.
    const gone = path.join(os.tmpdir(), 'sl-never-existed');
    const broken = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sb-')));
    upsertLibraryEntry('a-gone', {
      name: 'gone', source: gone, document_path: 'g', file: 'g.yaml', scope: null,
      project_id: null, library_id: null, element_counts: {},
    });
    upsertLibraryEntry('b-remote', {
      name: 'up', source: '@github:a/b@v1', document_path: 'x', file: 'x.yaml', scope: null,
      project_id: null, library_id: null, element_counts: {},
    });
    upsertLibraryEntry('c-broken', {
      name: 'broken', source: broken, document_path: 'b', file: 'b.yaml', scope: null,
      project_id: null, library_id: null, element_counts: {},
    });
    const r = searchLibrariesWithSkips('flex point argument');
    expect(r.results.map((h) => h.id)).toEqual(['D1']);
    expect(r.missingLocal).toEqual([gone]);
    expect(r.skipped).toEqual(['@github:a/b@v1']);
    expect(r.unreadable).toEqual([path.join(broken, 'b.yaml')]);
    fs.rmSync(broken, { recursive: true, force: true });
  });

  it('does not search the meta block', () => {
    // Well-formed meta is an object, so the array check alone would cover
    // it; a malformed meta LIST is what makes the `meta` guard load-bearing
    // -- without it, meta entries get reported as elements.
    expect(searchLibraries('personal')).toEqual([]);
    fs.writeFileSync(path.join(lib, 'p.yaml'),
      'meta:\n  - name: personal\n' +
      'decisions:\n  - id: D1\n    name: Pick a thing\n    rationale: keep me\n');
    expect(searchLibraries('personal')).toEqual([]);
    expect(searchLibraries('keep me').map((h) => h.id)).toEqual(['D1']);
  });

  it('reports a gone library ONCE even when it held several documents', () => {
    // Buckets are pushed per document; without dedupe a 4-document library
    // printed four identical stderr lines.
    const multi = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'multi-')));
    for (const n of ['a', 'b', 'c']) {
      upsertLibraryEntry(`k-${n}`, {
        name: n, source: multi, document_path: n, file: `${n}.yaml`, scope: null,
        project_id: null, library_id: null, element_counts: {},
      } as any);
    }
    fs.rmSync(multi, { recursive: true, force: true });
    const { missingLocal } = searchLibrariesWithSkips('anything');
    expect(missingLocal.filter((x) => x === multi)).toHaveLength(1);
  });
});
