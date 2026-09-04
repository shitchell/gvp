import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { cachedPathFor } from '../../src/inheritance/source-resolver.js';

describe('cachedPathFor (D54)', () => {
  let cache: string;
  const key = path.join('github', 'shitchell--gvp-docs', 'v0.7.0');

  beforeEach(() => {
    cache = fs.mkdtempSync(path.join(os.tmpdir(), 'cache-'));
  });
  afterEach(() => fs.rmSync(cache, { recursive: true, force: true }));

  it('returns null for an uncached remote WITHOUT touching the network', () => {
    expect(cachedPathFor('@github:shitchell/gvp-docs@v0.7.0', cache)).toBeNull();
  });

  it('returns the repo root when the cache exists with no gvp/ subdir', () => {
    const dir = path.join(cache, key);
    fs.mkdirSync(dir, { recursive: true });
    expect(cachedPathFor('@github:shitchell/gvp-docs@v0.7.0', cache)).toBe(dir);
  });

  it('applies the dual lookup, preferring gvp/', () => {
    const dir = path.join(cache, key);
    fs.mkdirSync(path.join(dir, 'gvp'), { recursive: true });
    fs.mkdirSync(path.join(dir, '.gvp', 'library'), { recursive: true });
    expect(cachedPathFor('@github:shitchell/gvp-docs@v0.7.0', cache)).toBe(path.join(dir, 'gvp'));
  });

  it('falls back to .gvp/library when gvp/ is absent', () => {
    const dir = path.join(cache, key);
    fs.mkdirSync(path.join(dir, '.gvp', 'library'), { recursive: true });
    expect(cachedPathFor('@github:shitchell/gvp-docs@v0.7.0', cache)).toBe(path.join(dir, '.gvp', 'library'));
  });

  it('returns null for a malformed source', () => {
    expect(cachedPathFor('@github:no-commitish', cache)).toBeNull();
    expect(cachedPathFor('/a/local/path', cache)).toBeNull();
  });
});
