import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { spawn } from 'child_process';
import * as yaml from 'js-yaml';
import { upsertLibraryEntry, readLibraryEntry } from '../../src/registry/library-entry.js';
import { getLibrariesDir } from '../../src/registry/paths.js';

// Requires a fresh `npm run build` — these spawn real node processes
// against dist/.
function assertBuilt(): void {
  if (!fs.existsSync(path.resolve('dist/registry/library-entry.js'))) {
    throw new Error('dist/ missing — run `npm run build` first');
  }
}

describe('registry concurrency (C2, P18, D52)', () => {
  let tmp: string, orig: string | undefined;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-'));
    orig = process.env.GVP_REGISTRY_ROOT;
    process.env.GVP_REGISTRY_ROOT = tmp;
  });
  afterEach(() => {
    if (orig === undefined) delete process.env.GVP_REGISTRY_ROOT; else process.env.GVP_REGISTRY_ROOT = orig;
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  // A REMOTE source: pruneLibraryEntries never removes remote entries
  // (D55), so in the prune-race test below only a torn read could delete
  // it -- which is exactly the D52 failure being hunted.
  const entry = () => ({
    name: 'x', source: '@github:a/b@v1', document_path: 'd', file: 'd.yaml', scope: null,
    project_id: null, library_id: null, element_counts: { values: 1 },
  }) as any;

  // NOTE: in-process Promise.resolve().then(...) proves NOTHING here —
  // each callback runs a synchronous fs sequence to completion, so there
  // is no interleaving and the assertions pass trivially. Real
  // concurrency requires real processes.
  it('concurrent PROCESSES leave exactly one valid entry', () => {
    assertBuilt();
    const script = path.join(os.tmpdir(), `w-${process.pid}.mjs`);
    fs.writeFileSync(script, `
      import { upsertLibraryEntry } from '${path.resolve('dist/registry/library-entry.js')}';
      const base = ${JSON.stringify(entry())};
      // Each iteration writes DISTINCT bytes. Identical payloads would hit
      // upsertLibraryEntry's read-compare-skip and turn this into a
      // tautology -- after the first write there is nothing left to tear,
      // so it would pass even without atomic writes.
      for (let i = 0; i < 200; i++) {
        upsertLibraryEntry('k', { ...base, element_counts: { values: i } });
      }
    `);
    const procs = Array.from({ length: 8 }, () =>
      spawn(process.execPath, [script], { env: { ...process.env, GVP_REGISTRY_ROOT: tmp } }));
    return Promise.all(procs.map((p) => new Promise((res) => p.on('exit', res)))).then(() => {
      fs.unlinkSync(script);
      const files = fs.readdirSync(getLibrariesDir());
      expect(files.filter((f) => f.endsWith('.tmp'))).toEqual([]);
      expect(files).toEqual(['k.yml']);
      // NOTE: this asserts only on the FINAL state, after every writer
      // has exited, so it passes with or without atomic writes. It guards
      // against leftover temp files and lost entries, not against torn
      // reads -- the concurrent-reader test below is what discriminates.
      const final = readLibraryEntry('k');
      expect(final).not.toBeNull();
      expect(final!.source).toBe('@github:a/b@v1');
      expect(final!.document_path).toBe('d');
      expect(Object.keys(final!.element_counts)).toEqual(['values']);
    });
  }, 30_000);

  it('two concurrent same-project runs both retain their usage edges', () => {
    assertBuilt();
    // D53's merge property: a blind rewrite would drop one side's edge.
    const script = path.join(os.tmpdir(), `e-${process.pid}.mjs`);
    fs.writeFileSync(script, `
      import { upsertRegistryEntry } from '${path.resolve('dist/config/registry.js')}';
      const which = process.argv[2];
      for (let i = 0; i < 100; i++) upsertRegistryEntry('pid-1', 'proj', '/tmp/proj', [which]);
    `);
    const procs = ['aaa', 'bbb'].map((w) =>
      spawn(process.execPath, [script, w], { env: { ...process.env, GVP_REGISTRY_ROOT: tmp } }));
    return Promise.all(procs.map((p) => new Promise((res) => p.on('exit', res)))).then(() => {
      fs.unlinkSync(script);
      const entry: any = yaml.load(fs.readFileSync(path.join(tmp, 'by-id', 'pid-1.yml'), 'utf-8'));
      expect(entry.libraries.map((l: any) => l.hash).sort()).toEqual(['aaa', 'bbb']);
    });
  }, 30_000);

  it('a concurrent PRUNE never deletes a live entry (the D52 data-loss path)', () => {
    assertBuilt();
    // D52's actual argument: a torn read makes pruneLibraryEntries unlink
    // a LIVE entry, because it deletes anything it cannot parse. The reader
    // test below detects the torn read; this one detects the deletion.
    const w = path.join(os.tmpdir(), `wp-${process.pid}.mjs`);
    const pr = path.join(os.tmpdir(), `pp-${process.pid}.mjs`);
    fs.writeFileSync(w, `
      import { upsertLibraryEntry } from '${path.resolve('dist/registry/library-entry.js')}';
      const base = ${JSON.stringify(entry())};
      for (let i = 0; i < 400; i++) upsertLibraryEntry('k', { ...base, element_counts: { values: i } });
    `);
    fs.writeFileSync(pr, `
      import { pruneLibraryEntries } from '${path.resolve('dist/registry/library-entry.js')}';
      for (let i = 0; i < 400; i++) pruneLibraryEntries();
    `);
    const procs = [
      ...Array.from({ length: 3 }, () => spawn(process.execPath, [w], { env: { ...process.env, GVP_REGISTRY_ROOT: tmp } })),
      spawn(process.execPath, [pr], { env: { ...process.env, GVP_REGISTRY_ROOT: tmp } }),
    ];
    // Poll for DISAPPEARANCE-after-appearance. Asserting on final state is
    // vacuous: prune deletes the live entry mid-run but a writer
    // immediately recreates it, so the end state looks fine either way.
    // Measured over 5 runs each: bare writeFileSync -> vanished 4,3,1,4,3;
    // temp+rename -> 0,0,0,0,0.
    const target = path.join(getLibrariesDir(), 'k.yml');
    let appeared = false, vanished = 0;
    const watch = setInterval(() => {
      if (fs.existsSync(target)) appeared = true;
      else if (appeared) vanished++;
    }, 1);
    return Promise.all(procs.map((p) => new Promise((res) => p.on('exit', res)))).then(() => {
      clearInterval(watch);
      fs.unlinkSync(w); fs.unlinkSync(pr);
      expect(appeared).toBe(true);
      // A remote entry is never pruned under normal operation (D55), so a
      // disappearance can only come from a torn read making prune unlink a
      // live entry -- the D52 data-loss path.
      expect(vanished).toBe(0);
      expect(readLibraryEntry('k')).not.toBeNull();
    });
  }, 30_000);

  it('a concurrent reader never observes a partial file', () => {
    assertBuilt();
    const script = path.join(os.tmpdir(), `w2-${process.pid}.mjs`);
    fs.writeFileSync(script, `
      import { upsertLibraryEntry } from '${path.resolve('dist/registry/library-entry.js')}';
      const base = ${JSON.stringify(entry())};
      // Distinct bytes per iteration -- see the note in the test above.
      for (let i = 0; i < 400; i++) {
        upsertLibraryEntry('k', { ...base, element_counts: { values: i } });
      }
    `);
    const procs = Array.from({ length: 4 }, () =>
      spawn(process.execPath, [script], { env: { ...process.env, GVP_REGISTRY_ROOT: tmp } }));
    let bad = 0, reads = 0;
    const done = Promise.all(procs.map((p) => new Promise((res) => p.on('exit', res))));
    const poll = setInterval(() => {
      // THE DISCRIMINATOR: an entry that EXISTS but does not parse.
      //
      // Counting null as acceptable is what made an earlier version of
      // this test unable to fail. `sortKeys: true` sorts `source` last in
      // the dumped YAML, so every truncated read is missing it and
      // readLibraryEntry returns null -- converting the exact failure this
      // test hunts into a pass. Non-atomic writes also cannot produce a
      // "blended" record, because O_TRUNC prevents old bytes surviving.
      //
      // Measured: with a bare writeFileSync this counter lands in the
      // 10-22 range per run; with temp+rename it is 0.
      if (!fs.existsSync(path.join(getLibrariesDir(), 'k.yml'))) return;
      reads++;
      const e = readLibraryEntry('k');
      if (e === null) { bad++; return; }
      if (e.source !== '@github:a/b@v1' || e.document_path !== 'd'
          || typeof e.element_counts?.values !== 'number') bad++;
    }, 1);
    return done.then(() => {
      clearInterval(poll);
      fs.unlinkSync(script);
      expect(reads).toBeGreaterThan(0);
      expect(bad).toBe(0);
    });
  }, 30_000);

  // Read-compare-skip deserves its own assertion, kept away from the
  // concurrency tests above so it cannot mask them.
  it('skips the write when the bytes are already identical', () => {
    upsertLibraryEntry('k', entry());
    const before = fs.statSync(path.join(getLibrariesDir(), 'k.yml')).mtimeMs;
    upsertLibraryEntry('k', entry());
    expect(fs.statSync(path.join(getLibrariesDir(), 'k.yml')).mtimeMs).toBe(before);
  });
});
