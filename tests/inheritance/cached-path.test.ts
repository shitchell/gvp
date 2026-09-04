import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { execFileSync } from 'child_process';

// D54's whole claim is "never touches the network". Asserting that via
// behavior is not possible: with the network blocked, a fully
// network-hitting implementation passes every outcome-based test in this
// file (verified by mutation). So assert the MECHANISM -- any shell-out
// from this code path is a hard failure, deterministically, offline.
vi.mock('child_process', () => ({
  execFileSync: vi.fn(() => {
    throw new Error('NETWORK CALL in cachedPathFor - D54 violation');
  }),
  execSync: vi.fn(() => {
    throw new Error('NETWORK CALL in cachedPathFor - D54 violation');
  }),
}));
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { cachedPathFor } from '../../src/inheritance/source-resolver.js';

describe('cachedPathFor (D54)', () => {
  let cache: string;
  const key = path.join('github', 'a--b', 'v1.0.0');

  beforeEach(() => {
    cache = fs.mkdtempSync(path.join(os.tmpdir(), 'cache-'));
  });
  afterEach(() => fs.rmSync(cache, { recursive: true, force: true }));

  it('returns null for an uncached remote WITHOUT touching the network', () => {
    expect(cachedPathFor('@github:a/b@v1.0.0', cache)).toBeNull();
    expect(vi.mocked(execFileSync)).not.toHaveBeenCalled();
  });

  it('never shells out on ANY input (D54)', () => {
    for (const s of ['@github:a/b@v1', '@github:a/b', '@github:', '@local',
                     '/plain/path', '', '@gitlab:x/y@abc123']) {
      cachedPathFor(s, cache);
    }
    expect(vi.mocked(execFileSync)).not.toHaveBeenCalled();
  });

  it('rejects a cache entry that is a regular file, not a directory', () => {
    const p = path.join(cache, 'github', 'a--b');
    fs.mkdirSync(p, { recursive: true });
    fs.writeFileSync(path.join(p, 'v1'), 'not a directory');
    expect(cachedPathFor('@github:a/b@v1', cache)).toBeNull();
  });

  it('refuses a commitish that escapes the cache directory', () => {
    // Sources arrive from third-party library YAML; Task 12 scans whatever
    // this returns for YAML files.
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'outside-'));
    fs.mkdirSync(path.join(outside, 'gvp'), { recursive: true });
    try {
      const esc = '../'.repeat(10) + outside.replace(/^\//, '');
      expect(cachedPathFor(`@github:a/b@${esc}`, cache)).toBeNull();
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });

  it('returns the repo root when the cache exists with no gvp/ subdir', () => {
    const dir = path.join(cache, key);
    fs.mkdirSync(dir, { recursive: true });
    expect(cachedPathFor('@github:a/b@v1.0.0', cache)).toBe(dir);
  });

  it('applies the dual lookup, preferring gvp/', () => {
    const dir = path.join(cache, key);
    fs.mkdirSync(path.join(dir, 'gvp'), { recursive: true });
    fs.mkdirSync(path.join(dir, '.gvp', 'library'), { recursive: true });
    expect(cachedPathFor('@github:a/b@v1.0.0', cache)).toBe(path.join(dir, 'gvp'));
  });

  it('falls back to .gvp/library when gvp/ is absent', () => {
    const dir = path.join(cache, key);
    fs.mkdirSync(path.join(dir, '.gvp', 'library'), { recursive: true });
    expect(cachedPathFor('@github:a/b@v1.0.0', cache)).toBe(path.join(dir, '.gvp', 'library'));
  });

  it('returns null for a malformed source', () => {
    expect(cachedPathFor('@github:no-commitish', cache)).toBeNull();
    expect(cachedPathFor('/a/local/path', cache)).toBeNull();
  });
});
