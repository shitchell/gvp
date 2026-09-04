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
    // Override HOME rather than writing into the user's real home dir: a
    // SIGKILL would leak a directory there, and read-only-HOME CI would fail.
    // os.homedir() honors $HOME on POSIX, so coverage is identical.
    const fakeHome = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'fakehome-')));
    const prevHome = process.env.HOME;
    const prevProfile = process.env.USERPROFILE;
    process.env.HOME = fakeHome;
    process.env.USERPROFILE = fakeHome;
    try {
      const underHome = fs.realpathSync(fs.mkdtempSync(path.join(fakeHome, 'lib-')));
      const rel = path.relative(fakeHome, underHome);
      expect(canonicalizeSource(`~/${rel}`, '/nonexistent')).toBe(underHome);
    } finally {
      if (prevHome === undefined) delete process.env.HOME; else process.env.HOME = prevHome;
      if (prevProfile === undefined) delete process.env.USERPROFILE; else process.env.USERPROFILE = prevProfile;
      fs.rmSync(fakeHome, { recursive: true, force: true });
    }
  });

  it('pins the premise that the RESOLVER collapses the dual-lookup forms', () => {
    // Honest framing: canonicalizeSource does NOT do the dual lookup -- it
    // resolves and realpaths. `<p>` and `<p>/.gvp/library` are different
    // paths and canonicalize differently. The collapse happens because
    // recordLibraries keys on LocalSourceResolver.resolve's OUTPUT.
    //
    // So this is a regression guard on that premise, not coverage of
    // canonicalizeSource. It fails if the resolver ever stops collapsing
    // them, which is what would silently mint duplicate entries.
    const proj = path.join(dir, 'proj');
    fs.mkdirSync(path.join(proj, '.gvp', 'library'), { recursive: true });
    const resolver = new LocalSourceResolver(dir);
    expect(canonicalizeSource(resolver.resolve(proj), dir))
      .toBe(canonicalizeSource(resolver.resolve(path.join(proj, '.gvp', 'library')), dir));
  });

  it('gives distinct keys to distinct resolved directories', () => {
    // Renamed for honesty: this does not construct a config.source, and an
    // implementation that DID key on config.source would not fail here.
    // That failure mode is prevented by canonicalizeSource's signature --
    // it takes a resolved directory, so a free-form config value cannot
    // reach it -- and by recordLibraries passing the resolver's output.
    // Asserted end-to-end in Task 9's record tests, not here.
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

  it('separator makes the source/document boundary unambiguous', () => {
    // Mutation-verified: deleting the NUL separator from entryKey survived
    // all ten of the original tests. These are pairs that genuinely collide
    // without it -- concatenation makes both "/abc" and "/p/libfoo/x".
    expect(entryKey('/a', 'bc')).not.toBe(entryKey('/ab', 'c'));
    expect(entryKey('/p/lib', 'foo/x')).not.toBe(entryKey('/p/libfoo', '/x'));
  });

  it('canonicalizeSource is idempotent, including for an evicted target', () => {
    // Task 11's prune re-derives keys from stored sources; if canonicalizing
    // an already-canonical source moved it, prune would delete live entries
    // on every run.
    const real = path.join(dir, 'lib');
    fs.mkdirSync(real);
    const link = path.join(dir, 'link');
    fs.symlinkSync(real, link);
    const once = canonicalizeSource(link, dir);
    expect(canonicalizeSource(once, dir)).toBe(once);
    fs.rmSync(real, { recursive: true, force: true });
    const gone = canonicalizeSource(once, dir);
    expect(canonicalizeSource(gone, dir)).toBe(gone);
    expect(canonicalizeSource('@github:a/b@v1', dir)).toBe('@github:a/b@v1');
  });

  it('does not collide across sources that share a document path', () => {
    expect(entryKey('/a', 'personal')).not.toBe(entryKey('/b', 'personal'));
  });
});
