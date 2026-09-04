import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { execFileSync } from 'child_process';

// D54/D40: recording MUST NOT touch the network. That cannot be asserted
// from outcomes -- with the network down, a fully cloning implementation
// still produces "no entries for an uncached remote" and every test below
// passes (this is exactly how the Task 4 no-network claim was found to be
// untested). So assert the MECHANISM: any shell-out from this code path is
// a hard failure, deterministically, offline. Nothing recordLibraries
// legitimately reaches spawns a process.
vi.mock('child_process', () => ({
  execFileSync: vi.fn(() => {
    throw new Error('NETWORK CALL during recordLibraries - D54 violation');
  }),
  execSync: vi.fn(() => {
    throw new Error('NETWORK CALL during recordLibraries - D54 violation');
  }),
}));

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { recordLibraries } from '../../src/registry/record.js';
import { canonicalizeSource, entryKey } from '../../src/registry/key.js';
import { listLibraryKeys, readLibraryEntry, upsertLibraryEntry } from '../../src/registry/library-entry.js';
import { upsertRegistryEntry } from '../../src/config/registry.js';
import { getLibrariesDir, getProjectsDir } from '../../src/registry/paths.js';

function makeLib(dir: string): void {
  fs.mkdirSync(path.join(dir, 'code'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'personal.yaml'),
    'meta:\n  name: personal\n  scope: universal\nprinciples:\n  - id: P1\n    name: One\n    statement: x\n');
  fs.writeFileSync(path.join(dir, 'code', 'common.yaml'),
    'meta:\n  name: code-common\nrules:\n  - id: R1\n    name: Two\n    statement: y\n');
}

const NO_PROJECT = { externalSources: [], projectId: null, projectName: null, projectPath: null };

// Unreadable entries are skipped rather than dereferenced: one test
// deliberately leaves a non-entry in the keyspace.
function entries() {
  return listLibraryKeys()
    .map((k) => readLibraryEntry(k))
    .filter((e): e is NonNullable<typeof e> => e !== null);
}

describe('recordLibraries (D40, D41, D57, D58)', () => {
  let tmp: string, lib: string, orig: string | undefined, origCache: string | undefined;
  beforeEach(() => {
    vi.mocked(execFileSync).mockClear();
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rec-'));
    orig = process.env.GVP_REGISTRY_ROOT;
    origCache = process.env.CAIRN_CACHE_DIR;
    process.env.GVP_REGISTRY_ROOT = tmp;
    lib = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'lib-')));
    makeLib(lib);
  });
  afterEach(() => {
    if (orig === undefined) delete process.env.GVP_REGISTRY_ROOT; else process.env.GVP_REGISTRY_ROOT = orig;
    if (origCache === undefined) delete process.env.CAIRN_CACHE_DIR; else process.env.CAIRN_CACHE_DIR = origCache;
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.rmSync(lib, { recursive: true, force: true });
  });

  it('records EVERY document in the directory, not only inherited ones (D41)', () => {
    recordLibraries({ libraryDir: lib, ...NO_PROJECT });
    const names = entries().map((e) => e.name).sort();
    expect(names).toEqual(['code-common', 'personal']);
  });

  it('reaches documents in nested subdirectories, not just the top level (D41)', () => {
    fs.mkdirSync(path.join(lib, 'a', 'b', 'c'), { recursive: true });
    fs.writeFileSync(path.join(lib, 'a', 'b', 'c', 'deep.yaml'), 'meta:\n  name: deep\n');
    recordLibraries({ libraryDir: lib, ...NO_PROJECT });
    const deep = entries().find((e) => e.name === 'deep')!;
    expect(deep).toBeDefined();
    expect(deep.document_path).toBe(path.join('a', 'b', 'c', 'deep'));
    expect(deep.file).toBe(path.join('a', 'b', 'c', 'deep.yaml'));
  });

  it('captures scope, filename, and per-category element counts', () => {
    recordLibraries({ libraryDir: lib, ...NO_PROJECT });
    const e = entries().find((x) => x.name === 'personal')!;
    expect(e.scope).toBe('universal');
    expect(e.file).toBe('personal.yaml');
    expect(e.document_path).toBe('personal');
    expect(e.element_counts).toEqual({ principles: 1 });
  });

  it('counts a category the document defines for itself, and only real categories', () => {
    // `bets` is NOT in defaults.yaml — deliberately. An earlier draft of this
    // test used `heuristics`, which IS a default, so it stayed green with the
    // document-local merge deleted entirely (caught by mutation).
    fs.writeFileSync(path.join(lib, 'custom.yaml'), [
      'meta:',
      '  name: custom',
      '  definitions:',
      '    categories:',
      '      bet:',
      '        yaml_key: bets',
      '        id_prefix: B',
      '        primary_field: statement',
      'bets:',
      '  - id: B1',
      '    name: A bet',
      '    statement: s',
      'not_a_category:',
      '  - 1',
      '  - 2',
      '',
    ].join('\n'));
    recordLibraries({ libraryDir: lib, ...NO_PROJECT });
    const e = entries().find((x) => x.name === 'custom')!;
    // The document's own key counts; an unrelated top-level list does not.
    expect(e.element_counts).toEqual({ bets: 1 });
  });

  it('does not leak one document\'s category definitions into another', () => {
    // The merged registry must be per-document. A shared/mutated registry
    // would make `bets` countable in a document that never declared it.
    fs.writeFileSync(path.join(lib, 'a-definer.yaml'), [
      'meta:',
      '  name: definer',
      '  definitions:',
      '    categories:',
      '      bet:',
      '        yaml_key: bets',
      '        id_prefix: B',
      '        primary_field: statement',
      'bets:',
      '  - id: B1',
      '    name: A bet',
      '    statement: s',
      '',
    ].join('\n'));
    fs.writeFileSync(path.join(lib, 'z-borrower.yaml'),
      'meta:\n  name: borrower\nbets:\n  - id: B9\n    name: Nope\n    statement: s\n');
    recordLibraries({ libraryDir: lib, ...NO_PROJECT });
    expect(entries().find((x) => x.name === 'definer')!.element_counts).toEqual({ bets: 1 });
    expect(entries().find((x) => x.name === 'borrower')!.element_counts).toEqual({});
  });

  it('records library facts with no project context, skipping the edge (D58)', () => {
    recordLibraries({ libraryDir: lib, ...NO_PROJECT });
    expect(listLibraryKeys()).toHaveLength(2);
    // Entries land in the LIBRARY keyspace under the root, not in by-id.
    // Named literally rather than via getLibrariesDir() so a change to the
    // accessor cannot move the on-disk layout unnoticed.
    expect(fs.readdirSync(path.join(tmp, 'libraries')).sort())
      .toEqual(listLibraryKeys().map((k) => `${k}.yml`).sort());
    // D58: no project context means NO project entry at all, not an entry
    // keyed on a null/undefined id.
    expect(fs.existsSync(getProjectsDir())).toBe(false);
  });

  it('writes the usage edge onto the project entry when project context is present (D53)', () => {
    recordLibraries({
      libraryDir: lib,
      externalSources: [],
      projectId: 'proj-uuid',
      projectName: 'proj',
      projectPath: tmp,
    });
    const entry = yaml.load(
      fs.readFileSync(path.join(getProjectsDir(), 'proj-uuid.yml'), 'utf-8'),
    ) as { libraries: { hash: string }[] };
    expect(entry.libraries.map((l) => l.hash).sort()).toEqual(listLibraryKeys().sort());
  });

  it('never throws when the registry is unwritable, and warns once (D57)', () => {
    // An unwritable root by ENOTDIR: the parent is a regular FILE, so every
    // mkdir/write beneath it fails for every uid (a chmod-based read-only dir
    // is bypassed by root, which CI sometimes is).
    //
    // The plan drafted this as `/proc/nonexistent-registry`. Do NOT use that:
    // procfs answers mkdir(2) with ENOENT even though the parent exists, and
    // Node's recursive mkdirSync responds to ENOENT by walking UP and
    // retrying -- so it loops forever. Verified on this machine: the suite
    // hung indefinitely rather than failing.
    const blocked = path.join(tmp, 'not-a-dir');
    fs.writeFileSync(blocked, 'x');
    process.env.GVP_REGISTRY_ROOT = path.join(blocked, 'registry');
    let warning: string | undefined;
    expect(() => {
      warning = recordLibraries({ libraryDir: lib, ...NO_PROJECT });
    }).not.toThrow();
    // Swallowing is not the contract -- the caller needs something to print.
    expect(warning).toBeTruthy();
  });

  it('reports success as undefined, so the caller prints nothing on the happy path (D57)', () => {
    expect(recordLibraries({ libraryDir: lib, ...NO_PROJECT })).toBeUndefined();
  });

  it('is idempotent — a second run rewrites identical bytes', () => {
    const args = { libraryDir: lib, ...NO_PROJECT };
    recordLibraries(args);
    const snap = listLibraryKeys().map((k) => fs.readFileSync(path.join(getLibrariesDir(), `${k}.yml`), 'utf-8'));
    recordLibraries(args);
    const snap2 = listLibraryKeys().map((k) => fs.readFileSync(path.join(getLibrariesDir(), `${k}.yml`), 'utf-8'));
    expect(snap2).toEqual(snap);
  });

  // D22's auto-prune lost its only call site when runRegistryPreflight left
  // parseConfigOptions; recordLibraries is where it is re-homed. Both calls
  // survived mutation until these existed — deleting either left the whole
  // file green, which is exactly how a re-homed call gets quietly lost again.
  describe('the re-homed D22 auto-prune actually runs', () => {
    it('drops a library entry whose document is gone (D55)', () => {
      upsertLibraryEntry('deadbeefdeadbeef', {
        name: 'ghost', source: lib, document_path: 'ghost', file: 'ghost.yaml',
        scope: null, project_id: null, library_id: null, element_counts: {},
      });
      expect(listLibraryKeys()).toContain('deadbeefdeadbeef');
      recordLibraries({ libraryDir: lib, ...NO_PROJECT });
      expect(listLibraryKeys()).not.toContain('deadbeefdeadbeef');
    });

    it('drops a project entry whose every location is gone (D22)', () => {
      const vanished = path.join(tmp, 'vanished-project');
      upsertRegistryEntry('ghost-proj', 'ghost', vanished);
      expect(fs.existsSync(path.join(getProjectsDir(), 'ghost-proj.yml'))).toBe(true);
      recordLibraries({ libraryDir: lib, ...NO_PROJECT });
      expect(fs.existsSync(path.join(getProjectsDir(), 'ghost-proj.yml'))).toBe(false);
    });
  });

  describe('project_id is a fact about the library, not the reader (D48, P18)', () => {
    let owner: string, ownedLib: string;
    beforeEach(() => {
      owner = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'owner-')));
      fs.mkdirSync(path.join(owner, '.gvp'), { recursive: true });
      fs.writeFileSync(path.join(owner, '.gvp', 'config.yaml'), 'project_id: OWNER-ID\n');
      ownedLib = path.join(owner, '.gvp', 'library');
      fs.mkdirSync(ownedLib, { recursive: true });
      fs.writeFileSync(path.join(ownedLib, 'x.yaml'), 'meta:\n  name: x\n');
    });
    afterEach(() => fs.rmSync(owner, { recursive: true, force: true }));

    it("takes project_id from the LIBRARY's own .gvp/config.yaml, not the caller's", () => {
      recordLibraries({
        libraryDir: ownedLib,
        externalSources: [],
        // A DIFFERENT project is doing the reading. Its id must not leak in.
        projectId: 'CONSUMER-ID',
        projectName: 'consumer',
        projectPath: tmp,
      });
      const e = entries().find((x) => x.name === 'x')!;
      expect(e.project_id).toBe('OWNER-ID');
    });

    it('records null for a library owned by no project, even when the caller has an id', () => {
      recordLibraries({
        libraryDir: lib,
        externalSources: [],
        projectId: 'CONSUMER-ID',
        projectName: 'consumer',
        projectPath: tmp,
      });
      for (const e of entries()) expect(e.project_id).toBeNull();
    });
  });

  describe('external sources', () => {
    let ext: string;
    beforeEach(() => {
      // The library lives at <ext>/gvp — the dual lookup D47 collapses.
      ext = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ext-')));
      fs.mkdirSync(path.join(ext, 'gvp'), { recursive: true });
      fs.writeFileSync(path.join(ext, 'gvp', 'shared.yaml'), 'meta:\n  name: shared\n');
    });
    afterEach(() => fs.rmSync(ext, { recursive: true, force: true }));

    it("keys a local source on the RESOLVER'S OUTPUT, so prune does not eat it (D47)", () => {
      recordLibraries({ libraryDir: lib, externalSources: [ext], projectId: null, projectName: null, projectPath: null });
      const e = entries().find((x) => x.name === 'shared');
      // Present at all: pruneLibraryEntries runs at the END of the same call
      // and joins source + file. Keying on the raw `<ext>` string would make
      // that join `<ext>/shared.yaml`, which does not exist — so the entry
      // would be written and then immediately deleted.
      expect(e).toBeDefined();
      expect(e!.source).toBe(path.join(ext, 'gvp'));
      expect(e!.file).toBe('shared.yaml');
    });

    it('one unwritable document does not abort its siblings or the sources after it (D57)', () => {
      // Block exactly ONE entry, not the whole registry: make its file a
      // DIRECTORY, so writeFileAtomic's rename fails for that key alone.
      // An unwritable ROOT cannot show this -- every write fails there, so
      // an implementation with NO per-file guard passes it. (Verified by
      // mutation: deleting the per-file try/catch left every other test in
      // this file green, because the outer try still swallows the throw
      // while silently dropping every remaining document and source.)
      const blocked = entryKey(canonicalizeSource(lib, lib), 'personal');
      fs.mkdirSync(path.join(tmp, 'libraries', `${blocked}.yml`), { recursive: true });

      const warning = recordLibraries({
        libraryDir: lib, externalSources: [ext],
        projectId: null, projectName: null, projectPath: null,
      });

      // `personal` sorts AFTER `code/common.yaml`, so a throw that escapes
      // the loop would take out the external source too.
      expect(entries().map((e) => e.name).sort()).toEqual(['code-common', 'shared']);
      expect(warning).toBeTruthy();
    });

    // findYamlFiles is strict by design (buildCatalog needs it to be), so
    // record() must catch it. Root bypasses the permission bit that makes
    // this reproducible, so skip there rather than assert something false.
    const asRoot = typeof process.getuid === 'function' && process.getuid() === 0;
    it.skipIf(asRoot)('keeps going when a source directory cannot be walked (D57)', () => {
      const broken = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'brk-')));
      const locked = path.join(broken, 'locked');
      fs.mkdirSync(locked);
      fs.writeFileSync(path.join(broken, 'ok.yaml'), 'meta:\n  name: unreachable\n');
      fs.chmodSync(locked, 0o000);
      try {
        const warning = recordLibraries({
          libraryDir: lib, externalSources: [broken, ext],
          projectId: null, projectName: null, projectPath: null,
        });
        // The unwalkable source is skipped whole — findYamlFiles throws
        // before yielding anything — but the source AFTER it still lands.
        expect(entries().map((e) => e.name).sort()).toEqual(['code-common', 'personal', 'shared']);
        expect(warning).toBeTruthy();
      } finally {
        fs.chmodSync(locked, 0o700);
        fs.rmSync(broken, { recursive: true, force: true });
      }
    });

    it('keeps going past an unresolvable source', () => {
      recordLibraries({
        libraryDir: lib,
        externalSources: [path.join(os.tmpdir(), 'no-such-source-dir-xyz'), ext],
        projectId: null, projectName: null, projectPath: null,
      });
      expect(entries().map((e) => e.name).sort()).toEqual(['code-common', 'personal', 'shared']);
    });

    it('yields one entry per document when a source resolves back to the root library', () => {
      // HONEST SCOPE: this pins that `.` and an absolute self-reference
      // canonicalize onto the SAME key as the root library, so a
      // self-inheriting library does not double its index. It does NOT
      // exercise `seenSources` -- deleting that guard leaves this green,
      // because a repeat record() writes byte-identical entries under
      // byte-identical keys and upsertLibraryEntry's read-compare-skip
      // turns it into a no-op. `seenSources` is a work-avoidance guard
      // with no observable output difference; it is not claimed here.
      recordLibraries({
        libraryDir: lib, externalSources: ['.', lib],
        projectId: 'p', projectName: 'p', projectPath: tmp,
      });
      expect(listLibraryKeys()).toHaveLength(2);
      const entry = yaml.load(
        fs.readFileSync(path.join(getProjectsDir(), 'p.yml'), 'utf-8'),
      ) as { libraries: { hash: string }[] };
      expect(entry.libraries).toHaveLength(2);
    });

    it('does NOT shell out for an uncached remote source (D54)', () => {
      process.env.CAIRN_CACHE_DIR = path.join(tmp, 'empty-cache');
      recordLibraries({
        libraryDir: lib, externalSources: ['@github:a/b@v1.0.0'],
        projectId: null, projectName: null, projectPath: null,
      });
      expect(vi.mocked(execFileSync)).not.toHaveBeenCalled();
      // Nothing recorded for the uncached remote; the local library still is.
      expect(entries().map((e) => e.name).sort()).toEqual(['code-common', 'personal']);
    });

    it('records a CACHED remote from disk, keyed by the raw spec, and prune keeps it (D55)', () => {
      const cache = path.join(tmp, 'cache');
      const dir = path.join(cache, 'github', 'a--b', 'v1.0.0', 'gvp');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'remote.yaml'), 'meta:\n  name: remote\nvalues:\n  - id: V1\n    name: R\n    statement: s\n');
      process.env.CAIRN_CACHE_DIR = cache;
      recordLibraries({
        libraryDir: lib, externalSources: ['@github:a/b@v1.0.0'],
        projectId: null, projectName: null, projectPath: null,
      });
      expect(vi.mocked(execFileSync)).not.toHaveBeenCalled();
      const e = entries().find((x) => x.name === 'remote')!;
      expect(e).toBeDefined();
      // The remote spec verbatim — NOT the cache path, which is machine-local
      // and would make the same library a different entry on every machine.
      expect(e.source).toBe('@github:a/b@v1.0.0');
      expect(e.element_counts).toEqual({ values: 1 });
    });
  });

  describe('leniency', () => {
    it('skips a document that is not a YAML mapping without losing its siblings', () => {
      fs.writeFileSync(path.join(lib, 'scalar.yaml'), 'just a string\n');
      fs.writeFileSync(path.join(lib, 'list.yaml'), '- 1\n- 2\n');
      fs.writeFileSync(path.join(lib, 'broken.yaml'), 'meta:\n  name: [unclosed\n');
      const warning = recordLibraries({ libraryDir: lib, ...NO_PROJECT });
      expect(entries().map((e) => e.name).sort()).toEqual(['code-common', 'personal']);
      // Unindexable content is not a registry FAILURE — no warning for it.
      expect(warning).toBeUndefined();
    });

    it('records a document with no meta at all', () => {
      fs.writeFileSync(path.join(lib, 'nameless.yaml'), 'goals:\n  - id: G1\n    name: N\n    statement: s\n');
      recordLibraries({ libraryDir: lib, ...NO_PROJECT });
      const e = entries().find((x) => x.file === 'nameless.yaml')!;
      expect(e).toBeDefined();
      expect(e.name).toBeNull();
      expect(e.scope).toBeNull();
      expect(e.element_counts).toEqual({ goals: 1 });
    });
  });
});
