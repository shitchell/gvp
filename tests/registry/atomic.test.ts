import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { writeFileAtomic, tempPathFor } from '../../src/registry/atomic.js';

describe('writeFileAtomic', () => {
  let dir: string;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atomic-')); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  it('writes content to the target path', () => {
    const target = path.join(dir, 'a.yml');
    writeFileAtomic(target, 'hello');
    expect(fs.readFileSync(target, 'utf-8')).toBe('hello');
  });

  it('replaces existing content', () => {
    const target = path.join(dir, 'a.yml');
    fs.writeFileSync(target, 'old');
    writeFileAtomic(target, 'new');
    expect(fs.readFileSync(target, 'utf-8')).toBe('new');
  });

  it('leaves no temp files behind on success', () => {
    writeFileAtomic(path.join(dir, 'a.yml'), 'x');
    expect(fs.readdirSync(dir)).toEqual(['a.yml']);
  });

  it('creates the parent directory when missing', () => {
    const target = path.join(dir, 'nested', 'a.yml');
    writeFileAtomic(target, 'x');
    expect(fs.readFileSync(target, 'utf-8')).toBe('x');
  });

  // Root ignores permission bits, so the permission-based test below would
  // pass vacuously as root. Skip rather than silently prove nothing.
  const asRoot = typeof process.getuid === 'function' && process.getuid() === 0;

  it('derives the temp path as a SIBLING of the target', () => {
    // The property that makes this atomic — rename is only atomic within a
    // filesystem — and the one every behavioral test here passes without.
    // Tested on the derivation directly: a behavioral test cannot see it,
    // because a temp in os.tmpdir() is same-device on a typical machine and
    // fails identically (EACCES from rename) when the target dir is
    // unwritable. Verified: an implementation writing to os.tmpdir() passes
    // every behavioral assertion in this file.
    expect(path.dirname(tempPathFor('/a/b/c.yml'))).toBe('/a/b');
    expect(path.dirname(tempPathFor(path.join(dir, 'x.yml')))).toBe(dir);
  });

  it('derives a temp name that a .yml-filtering prune will skip', () => {
    // pruneStaleRegistryEntries unlinks any `.yml` it cannot parse, so a
    // `.yml` temp would let a concurrent prune delete an in-flight write.
    const tmp = path.basename(tempPathFor('/a/b/c.yml'));
    expect(tmp.endsWith('.tmp')).toBe(true);
    expect(tmp.endsWith('.yml')).toBe(false);
  });

  it('derives a distinct temp path on every call', () => {
    const a = tempPathFor('/a/b/c.yml');
    const b = tempPathFor('/a/b/c.yml');
    expect(a).not.toBe(b);
  });

  it.skipIf(asRoot)('leaves the target at its previous content when the write fails', () => {
    // The user-visible guarantee the whole task is about.
    const sub = path.join(dir, 'ro2');
    fs.mkdirSync(sub);
    const target = path.join(sub, 'a.yml');
    fs.writeFileSync(target, 'original');
    fs.chmodSync(sub, 0o500);
    try {
      expect(() => writeFileAtomic(target, 'replacement')).toThrow();
    } finally {
      fs.chmodSync(sub, 0o700);
    }
    expect(fs.readFileSync(target, 'utf-8')).toBe('original');
    expect(fs.readdirSync(sub)).toEqual(['a.yml']);
  });

  it('cleans up the temp file when rename fails', () => {
    // target is a directory -> rename fails
    const target = path.join(dir, 'adir');
    fs.mkdirSync(target);
    // Assert WHERE it failed, so a refactor that made writeFileSync fail
    // first cannot keep this green while no longer testing rename cleanup.
    expect(() => writeFileAtomic(target, 'x')).toThrow(/EISDIR/);
    const leftovers = fs.readdirSync(dir).filter((f) => f !== 'adir');
    expect(leftovers).toEqual([]);
  });
});
