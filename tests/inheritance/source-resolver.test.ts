import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { LocalSourceResolver, GitSourceResolver, createSourceResolver } from '../../src/inheritance/source-resolver.js';
import { InheritanceError } from '../../src/errors.js';

describe('LocalSourceResolver (DEC-1.2, DEC-1.7, DEC-1.10)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gvp-test-'));
  });

  it('resolves @local to base directory', () => {
    fs.mkdirSync(path.join(tmpDir, 'test.yaml'), { recursive: true });
    const resolver = new LocalSourceResolver(tmpDir);
    expect(resolver.resolve('@local')).toBe(tmpDir);
  });

  it('prefers gvp/ over .gvp/library/ (DEC-1.10)', () => {
    const targetDir = path.join(tmpDir, 'target');
    fs.mkdirSync(path.join(targetDir, 'gvp'), { recursive: true });
    fs.mkdirSync(path.join(targetDir, '.gvp', 'library'), { recursive: true });

    const resolver = new LocalSourceResolver(tmpDir);
    expect(resolver.resolve('./target')).toBe(path.join(targetDir, 'gvp'));
  });

  it('falls back to .gvp/library/ when gvp/ absent (DEC-1.2)', () => {
    const targetDir = path.join(tmpDir, 'target');
    fs.mkdirSync(path.join(targetDir, '.gvp', 'library'), { recursive: true });

    const resolver = new LocalSourceResolver(tmpDir);
    expect(resolver.resolve('./target')).toBe(path.join(targetDir, '.gvp', 'library'));
  });

  it('resolves absolute paths', () => {
    const targetDir = path.join(tmpDir, 'abs-target');
    fs.mkdirSync(targetDir, { recursive: true });

    const resolver = new LocalSourceResolver('/some/other/dir');
    expect(resolver.resolve(targetDir)).toBe(targetDir);
  });

  it('throws for non-existent path', () => {
    const resolver = new LocalSourceResolver(tmpDir);
    expect(() => resolver.resolve('./nonexistent')).toThrow(InheritanceError);
  });

  it('throws for remote sources', () => {
    const resolver = new LocalSourceResolver(tmpDir);
    expect(() => resolver.resolve('@github:foo/bar')).toThrow(InheritanceError);
  });
});

describe('GitSourceResolver (DEC-1.9)', () => {
  const resolver = new GitSourceResolver();

  it('requires immutable commit-ish', () => {
    expect(() => resolver.resolve('@github:foo/bar')).toThrow(/immutable commit-ish/);
  });

  it('rejects source without @provider prefix', () => {
    expect(() => resolver.resolve('foo/bar@v1')).toThrow(InheritanceError);
  });

  it('throws InheritanceError for nonexistent repo', () => {
    expect(() => resolver.resolve('@github:nonexistent/repo-does-not-exist@v99.0.0')).toThrow(InheritanceError);
  });

  it('throws for unknown provider', () => {
    expect(() => resolver.resolve('@unknownprovider:foo/bar@v1')).toThrow(/Unknown git provider/);
  });

  it('constructs correct GitHub URL in error message', () => {
    try {
      resolver.resolve('@github:nonexistent/repo@v999');
    } catch (e) {
      expect((e as Error).message).toContain('https://github.com/nonexistent/repo.git');
    }
  });

  it('constructs correct Azure DevOps URL in error message', () => {
    try {
      resolver.resolve('@azure:myorg/myproject/myrepo@v1');
    } catch (e) {
      expect((e as Error).message).toContain('https://dev.azure.com/myorg/myproject/_git/myrepo');
    }
  });

  it('rejects Azure source with insufficient path segments', () => {
    expect(() => resolver.resolve('@azure:org/repo@v1')).toThrow(/org\/project\/repo format/);
  });

  it('uses cache on second resolve', () => {
    const tmpCache = fs.mkdtempSync(path.join(os.tmpdir(), 'cairn-cache-'));
    const cachedResolver = new GitSourceResolver(tmpCache);

    // Create a fake cached clone with .gvp/library/
    const cacheKey = 'github/test--repo/v1.0.0';
    const fakeCachePath = path.join(tmpCache, cacheKey);
    fs.mkdirSync(path.join(fakeCachePath, '.gvp', 'library'), { recursive: true });

    // Should return cached path without attempting to clone
    const result = cachedResolver.resolve('@github:test/repo@v1.0.0');
    expect(result).toBe(path.join(fakeCachePath, '.gvp', 'library'));
  });
});

describe('createSourceResolver', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gvp-test-'));
  });

  it('routes local sources to LocalSourceResolver', () => {
    const resolver = createSourceResolver(tmpDir);
    expect(resolver.resolve('@local')).toBe(tmpDir);
  });

  it('routes git sources to GitSourceResolver', () => {
    const resolver = createSourceResolver(tmpDir);
    expect(() => resolver.resolve('@github:nonexistent/repo@v1')).toThrow(InheritanceError);
  });
});
