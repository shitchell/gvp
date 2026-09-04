import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { pruneLibraryEntries, upsertLibraryEntry, listLibraryKeys } from '../../src/registry/library-entry.js';
import { getLibrariesDir } from '../../src/registry/paths.js';

describe('library prune (D55)', () => {
  let tmp: string, lib: string, orig: string | undefined;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pr-'));
    orig = process.env.GVP_REGISTRY_ROOT;
    process.env.GVP_REGISTRY_ROOT = tmp;
    lib = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'pl-')));
    fs.writeFileSync(path.join(lib, 'a.yaml'), 'meta:\n  name: a\n');
    fs.writeFileSync(path.join(lib, 'b.yaml'), 'meta:\n  name: b\n');
    const base = { scope: null, project_id: null, library_id: null, element_counts: {} };
    upsertLibraryEntry('ka', { ...base, name: 'a', source: lib, document_path: 'a', file: 'a.yaml' } as any);
    upsertLibraryEntry('kb', { ...base, name: 'b', source: lib, document_path: 'b', file: 'b.yaml' } as any);
    upsertLibraryEntry('kr', { ...base, name: 'r', source: '@github:x/y@v1', document_path: 'r', file: 'r.yaml' } as any);
  });
  afterEach(() => {
    if (orig === undefined) delete process.env.GVP_REGISTRY_ROOT; else process.env.GVP_REGISTRY_ROOT = orig;
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.rmSync(lib, { recursive: true, force: true });
  });

  it('drops a deleted document but keeps its live siblings', () => {
    fs.unlinkSync(path.join(lib, 'a.yaml'));
    pruneLibraryEntries();
    expect(listLibraryKeys().sort()).toEqual(['kb', 'kr']);
  });

  it('retains remote entries even when uncached (D55)', () => {
    pruneLibraryEntries();
    expect(listLibraryKeys()).toContain('kr');
  });

  it('drops nothing when everything is present', () => {
    pruneLibraryEntries();
    expect(listLibraryKeys().sort()).toEqual(['ka', 'kb', 'kr']);
  });

  // The prune is the ONLY thing that clears an unparseable entry, and
  // readLibraryEntry's field validation makes more entries unparseable
  // than a YAML syntax error alone -- so a half-written entry from an
  // older build stays forever if this branch is dropped.
  it('unlinks an entry it cannot parse', () => {
    fs.writeFileSync(path.join(getLibrariesDir(), 'junk.yml'), '::: not yaml');
    fs.writeFileSync(path.join(getLibrariesDir(), 'partial.yml'), 'name: p\nscope: null\n');
    pruneLibraryEntries();
    expect(listLibraryKeys().sort()).toEqual(['ka', 'kb', 'kr']);
  });

  // The remote retention above holds when the cache never existed. It must
  // equally hold for a remote whose cache WAS present and got evicted --
  // that is the case D55 names, and a `fs.existsSync(source)` mutant that
  // survives the test above is killed here only if the remote source is
  // never path-joined at all.
  it('retains a remote entry whose source string names no filesystem path', () => {
    fs.rmSync(lib, { recursive: true, force: true });
    pruneLibraryEntries();
    expect(listLibraryKeys()).toEqual(['kr']);
  });
});
