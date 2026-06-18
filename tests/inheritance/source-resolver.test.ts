import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execFileSync } from 'child_process';
import { LocalSourceResolver, GitSourceResolver, createSourceResolver, buildFetchCommands, commitishIsBranch } from '../../src/inheritance/source-resolver.js';
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

describe('buildFetchCommands (SHA-vs-tag clone strategy, DEC-1.9)', () => {
  // Regression lock: `git clone --branch <sha>` is broken for commit SHAs
  // ("Remote branch <sha> not found"). The init+fetch+checkout strategy must
  // be used so the *same* command sequence handles both tags and SHAs.

  it('never uses `git clone --branch` (which rejects SHAs)', () => {
    const cmds = buildFetchCommands('https://github.com/foo/bar.git', 'deadbeef');
    const flat = cmds.map((c) => c.join(' '));
    expect(flat.some((c) => c.includes('clone'))).toBe(false);
    expect(flat.some((c) => c.includes('--branch'))).toBe(false);
  });

  it('fetches the commit-ish explicitly and checks out FETCH_HEAD', () => {
    const sha = 'aafb8259aee7e62d006b8d522675f8d04c895417';
    const cmds = buildFetchCommands('https://github.com/shitchell/gvp-docs.git', sha);
    // The commit-ish is passed as a fetch refspec (works for tag AND SHA).
    expect(cmds).toContainEqual(['git', 'fetch', '--depth', '1', '--quiet', 'origin', sha]);
    expect(cmds).toContainEqual(['git', 'checkout', '--quiet', '--detach', 'FETCH_HEAD']);
  });

  it('produces an identical command shape for a tag and a SHA', () => {
    const tagCmds = buildFetchCommands('file:///tmp/r.git', 'v1.2.3');
    const shaCmds = buildFetchCommands('file:///tmp/r.git', '0123456789abcdef');
    // Same structure; only the commit-ish token differs in the fetch step.
    expect(tagCmds.map((c) => c[0])).toEqual(shaCmds.map((c) => c[0]));
    expect(tagCmds[2]!.slice(0, -1)).toEqual(shaCmds[2]!.slice(0, -1));
  });

  it('keeps the fetch shallow (--depth 1)', () => {
    const cmds = buildFetchCommands('file:///tmp/r.git', 'v1');
    const fetch = cmds.find((c) => c[1] === 'fetch');
    expect(fetch).toContain('--depth');
    expect(fetch).toContain('1');
  });
});

describe('GitSourceResolver fetch against local repo (tag + SHA parity)', () => {
  // Real end-to-end exercise of the fetch strategy over local file transport,
  // which (like GitHub) supports fetching reachable SHAs. We can't route the
  // GitHub provider at a file:// URL, so we drive buildFetchCommands directly —
  // the exact sequence GitSourceResolver.resolve() runs.
  let repoDir: string;
  let sha: string;

  beforeEach(() => {
    repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cairn-srcrepo-'));
    const run = (args: string[]) =>
      execFileSync('git', args, { cwd: repoDir, stdio: 'pipe', encoding: 'utf-8' });
    run(['init', '--quiet', '-b', 'main']);
    run(['config', 'user.email', 't@t']);
    run(['config', 'user.name', 't']);
    run(['config', 'commit.gpgsign', 'false']);
    fs.mkdirSync(path.join(repoDir, '.gvp', 'library'), { recursive: true });
    fs.writeFileSync(path.join(repoDir, '.gvp', 'library', 'a.yaml'), 'x: 1\n');
    run(['add', '-A']);
    run(['commit', '--quiet', '-m', 'c1']);
    run(['tag', 'v1.0.0']);
    sha = run(['rev-parse', 'HEAD']).trim();
  });

  function fetchInto(commitish: string): string {
    const dest = fs.mkdtempSync(path.join(os.tmpdir(), 'cairn-fetchdest-'));
    const url = `file://${repoDir}`;
    for (const [cmd, ...args] of buildFetchCommands(url, commitish)) {
      execFileSync(cmd!, args, { cwd: dest, stdio: 'pipe', encoding: 'utf-8' });
    }
    return dest;
  }

  it('fetches and checks out by tag', () => {
    const dest = fetchInto('v1.0.0');
    expect(fs.existsSync(path.join(dest, '.gvp', 'library', 'a.yaml'))).toBe(true);
  });

  it('fetches and checks out by commit SHA (the regression)', () => {
    const dest = fetchInto(sha);
    expect(fs.existsSync(path.join(dest, '.gvp', 'library', 'a.yaml'))).toBe(true);
  });
});

describe('commitishIsBranch — branch rejection signal (DEC-1.9)', () => {
  let repoDir: string;
  let url: string;

  beforeEach(() => {
    repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cairn-branchrepo-'));
    url = `file://${repoDir}`;
    const run = (args: string[]) =>
      execFileSync('git', args, { cwd: repoDir, stdio: 'pipe', encoding: 'utf-8' });
    run(['init', '--quiet', '-b', 'main']);
    run(['config', 'user.email', 't@t']);
    run(['config', 'user.name', 't']);
    run(['config', 'commit.gpgsign', 'false']);
    fs.writeFileSync(path.join(repoDir, 'f.txt'), 'x\n');
    run(['add', '-A']);
    run(['commit', '--quiet', '-m', 'c1']);
    run(['tag', 'v1.0.0']);
  });

  it('returns true for a branch head (mutable → rejected)', () => {
    expect(commitishIsBranch(url, 'main')).toBe(true);
  });

  it('returns false for a tag (immutable → allowed)', () => {
    expect(commitishIsBranch(url, 'v1.0.0')).toBe(false);
  });

  it('returns false for a SHA (immutable → allowed)', () => {
    const sha = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: repoDir,
      stdio: 'pipe',
      encoding: 'utf-8',
    }).trim();
    expect(commitishIsBranch(url, sha)).toBe(false);
  });

  it('fails open (returns false) on a bad URL rather than blocking', () => {
    expect(commitishIsBranch('file:///nonexistent/repo/xyz', 'main')).toBe(false);
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
