import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { isRemoteSource, canonicalizeSource, entryKey, parseSource } from '../../src/registry/key.js';
import { LocalSourceResolver } from '../../src/inheritance/source-resolver.js';

describe('registry key (D46, D47)', () => {
  let dir: string;
  beforeEach(() => { dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'key-'))); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  it('classifies sources by the @ prefix, with @local local', () => {
    expect(isRemoteSource('@github:a/b@v1')).toBe(true);
    expect(isRemoteSource('@local')).toBe(false);
    expect(isRemoteSource('/abs/path')).toBe(false);
  });

  it('derives kind and ref from the source rather than storing them (D50)', () => {
    expect(parseSource('@github:a/b@v1.2.0')).toEqual({ kind: 'remote', ref: 'v1.2.0' });
    expect(parseSource('/abs/path')).toEqual({ kind: 'local', ref: null });
  });

  it('canonicalizes a local source to its realpath', () => {
    const real = path.join(dir, 'lib');
    fs.mkdirSync(real);
    const link = path.join(dir, 'link');
    fs.symlinkSync(real, link);
    expect(canonicalizeSource(link, dir)).toBe(real);
    expect(canonicalizeSource(real, dir)).toBe(canonicalizeSource(link, dir));
  });

  it('collapses relative and absolute forms onto the same key', () => {
    const real = path.join(dir, 'lib');
    fs.mkdirSync(real);
    expect(canonicalizeSource('./lib', dir)).toBe(real);
    expect(canonicalizeSource(real, dir)).toBe(real);
  });

  it('collapses the tilde form onto the same key', () => {
    // The spec names this case: expandTilde runs in the CLI before
    // resolve, but sourceDocCache is keyed by the RAW string and
    // path.resolve does not expand `~`.
    //
    // The directory MUST be under $HOME — os.tmpdir() is not on Linux or
    // macOS, so guarding on `path.relative` would silently skip the
    // assertion and the test would pass green with zero coverage.
    const underHome = fs.realpathSync(
      fs.mkdtempSync(path.join(os.homedir(), '.cairn-key-test-')));
    try {
      const rel = path.relative(os.homedir(), underHome);
      expect(canonicalizeSource(`~/${rel}`, '/nonexistent')).toBe(underHome);
    } finally {
      fs.rmSync(underHome, { recursive: true, force: true });
    }
  });

  it('collapses the dual-lookup forms onto one key', () => {
    // <p> and <p>/.gvp/library name ONE library. Recording keys on the
    // RESOLVER'S output, so both must agree.
    const proj = path.join(dir, 'proj');
    fs.mkdirSync(path.join(proj, '.gvp', 'library'), { recursive: true });
    const resolver = new LocalSourceResolver(dir);
    expect(canonicalizeSource(resolver.resolve(proj), dir))
      .toBe(canonicalizeSource(resolver.resolve(path.join(proj, '.gvp', 'library')), dir));
  });

  it('never lets a free-form config.source value become a key', () => {
    // Two unrelated projects both setting `source: mylib` must not
    // collide: recording keys on the resolved dir, never config.source.
    const a = path.join(dir, 'a'); const b = path.join(dir, 'b');
    fs.mkdirSync(a); fs.mkdirSync(b);
    expect(entryKey(canonicalizeSource(a, dir), 'x'))
      .not.toBe(entryKey(canonicalizeSource(b, dir), 'x'));
  });

  it('leaves remote sources verbatim', () => {
    expect(canonicalizeSource('@github:a/b@v1', dir)).toBe('@github:a/b@v1');
  });

  it('produces a stable 16-hex key from source and document path', () => {
    const k = entryKey('/abs/lib', 'code/common');
    expect(k).toMatch(/^[0-9a-f]{16}$/);
    expect(entryKey('/abs/lib', 'code/common')).toBe(k);
    expect(entryKey('/abs/lib', 'code/other')).not.toBe(k);
  });

  it('does not collide across sources that share a document path', () => {
    expect(entryKey('/a', 'personal')).not.toBe(entryKey('/b', 'personal'));
  });
});
