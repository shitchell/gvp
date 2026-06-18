import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execFileSync } from 'child_process';
import { InheritanceError } from '../errors.js';

/**
 * Interface for resolving source identifiers to local filesystem paths.
 */
export interface SourceResolver {
  resolve(source: string): string;
}

/**
 * Resolves local filesystem source paths (DEC-1.7).
 * Supports relative and absolute paths with dual lookup (DEC-1.2, DEC-1.10):
 * 1. Check <path>/gvp/ (standalone GVP repo)
 * 2. Check <path>/.gvp/library/ (embedded in a project)
 */
export class LocalSourceResolver implements SourceResolver {
  constructor(private readonly baseDir: string) {}

  resolve(source: string): string {
    // Skip non-local sources
    if (source.startsWith('@') && source !== '@local') {
      throw new InheritanceError(
        `LocalSourceResolver cannot resolve remote source '${source}'. Use GitSourceResolver.`
      );
    }

    const resolved = source === '@local'
      ? this.baseDir
      : path.isAbsolute(source)
        ? source
        : path.resolve(this.baseDir, source);

    // Dual lookup (DEC-1.2, DEC-1.10): gvp/ wins over .gvp/library/
    const gvpDir = path.join(resolved, 'gvp');
    if (fs.existsSync(gvpDir) && fs.statSync(gvpDir).isDirectory()) {
      return gvpDir;
    }

    const dotGvpLibrary = path.join(resolved, '.gvp', 'library');
    if (fs.existsSync(dotGvpLibrary) && fs.statSync(dotGvpLibrary).isDirectory()) {
      return dotGvpLibrary;
    }

    // If path itself looks like a library directory (contains YAML files)
    if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
      return resolved;
    }

    throw new InheritanceError(
      `Cannot resolve source '${source}': no library directory found at '${resolved}'. ` +
      `Checked: ${gvpDir}, ${dotGvpLibrary}, ${resolved}`
    );
  }
}

/**
 * Provider → git URL templates.
 * Each template receives the parsed path segments and produces a clone URL.
 */
const GIT_PROVIDERS: Record<string, (repoPath: string) => string> = {
  github: (repoPath) => `https://github.com/${repoPath}.git`,
  gitlab: (repoPath) => `https://gitlab.com/${repoPath}.git`,
  bitbucket: (repoPath) => `https://bitbucket.org/${repoPath}.git`,
  azure: (repoPath) => {
    // @azure:org/project/repo → https://dev.azure.com/org/project/_git/repo
    const parts = repoPath.split('/');
    if (parts.length < 3) {
      throw new InheritanceError(
        `Azure DevOps source requires org/project/repo format, got '${repoPath}'`
      );
    }
    const [org, project, ...repoParts] = parts;
    const repo = repoParts.join('/');
    return `https://dev.azure.com/${org}/${project}/_git/${repo}`;
  },
};

/**
 * Default cache directory for cloned git sources.
 */
function defaultCacheDir(): string {
  return path.join(os.homedir(), '.cache', 'cairn', 'sources');
}

/**
 * Build the sequence of git commands that fetch a single commit-ish (tag OR
 * SHA) shallowly into `dest` and check it out in detached HEAD state.
 *
 * Why not `git clone --branch <commitish>`? `--branch` only accepts tag or
 * branch *names*, never raw commit SHAs — a SHA dies with
 * "Remote branch <sha> not found in upstream origin". This init+fetch+checkout
 * approach handles both:
 *   - tags resolve through `git fetch origin <tag>`
 *   - SHAs resolve through `git fetch origin <sha>` (GitHub enables
 *     uploadpack.allowReachableSHA1InWant)
 *
 * LIMITATION (DEC-1.9, honest by V2 "Transparency"): only commits that are
 * *reachable from a ref* (a branch/tag tip or its history) can be fetched by
 * SHA. GitHub allows this; some git servers disable
 * allowReachableSHA1InWant / allowAnySHA1InWant and will reject a bare-SHA
 * fetch. Tags are unaffected. There is no cheap, universal workaround — a
 * server that forbids SHA fetches simply cannot serve SHA pins shallowly.
 *
 * Returned commands run with `cwd: dest`; `dest` must already exist.
 */
export function buildFetchCommands(gitUrl: string, commitish: string): string[][] {
  return [
    ['git', 'init', '--quiet'],
    ['git', 'remote', 'add', 'origin', gitUrl],
    ['git', 'fetch', '--depth', '1', '--quiet', 'origin', commitish],
    ['git', 'checkout', '--quiet', '--detach', 'FETCH_HEAD'],
  ];
}

/**
 * Return true if `commitish` names a *branch head* on the remote, which is a
 * mutable ref and therefore disallowed (DEC-1.9: "Only commits and tags are
 * valid — branches are NOT stored in YAML").
 *
 * Uses `git ls-remote --heads <url> <name>`: a non-empty result means the name
 * matches a branch head. Tags and SHAs produce no head match and pass through.
 * On any network/command failure we fail *open* (return false) and let the
 * subsequent fetch decide — we don't want a flaky `ls-remote` to block a valid
 * tag/SHA pin.
 */
export function commitishIsBranch(gitUrl: string, commitish: string): boolean {
  try {
    const out = execFileSync(
      'git',
      ['ls-remote', '--heads', gitUrl, commitish],
      { stdio: ['pipe', 'pipe', 'pipe'], encoding: 'utf-8' }
    );
    return out.trim().length > 0;
  } catch {
    return false;
  }
}

/**
 * Resolver for git-based sources (DEC-1.9).
 * Clones repos to a local cache and returns the library path.
 *
 * Flow:
 * 0. Check cache — if already cloned at this commitish, return cached path
 * 1. Parse @provider:path@commitish
 * 2. Map provider to git URL
 * 3. Clone (shallow) to cache directory
 * 4. Return library path within clone (dual lookup: gvp/ then .gvp/library/)
 */
export class GitSourceResolver implements SourceResolver {
  private readonly cacheDir: string;

  constructor(cacheDir?: string) {
    this.cacheDir = cacheDir ?? defaultCacheDir();
  }

  resolve(source: string): string {
    // Parse @provider:path@commitish
    const match = source.match(/^@(\w+):(.+?)@(.+)$/);
    if (!match) {
      // Check if it's a git source without commit-ish
      const noVersion = source.match(/^@(\w+):(.+)$/);
      if (noVersion) {
        throw new InheritanceError(
          `Git source '${source}' requires an immutable commit-ish (tag or SHA). ` +
          `Use '${source}@v1.0.0' or '${source}@abc1234'. Branches are not allowed (DEC-1.9).`
        );
      }
      throw new InheritanceError(`Invalid git source format: '${source}'`);
    }

    const [, provider, repoPath, commitish] = match as RegExpMatchArray;

    if (!commitish || commitish.length === 0) {
      throw new InheritanceError(
        `Git source '${source}' requires a commit-ish after '@'`
      );
    }

    // Step 0: Check cache
    const cacheKey = `${provider}/${repoPath!.replace(/\//g, '--')}/${commitish}`;
    const cachedPath = path.join(this.cacheDir, cacheKey);

    if (fs.existsSync(cachedPath)) {
      return this.findLibraryDir(cachedPath, source);
    }

    // Step 1: Map provider to git URL
    const urlBuilder = GIT_PROVIDERS[provider!];
    if (!urlBuilder) {
      throw new InheritanceError(
        `Unknown git provider '${provider}' in source '${source}'. ` +
        `Supported: ${Object.keys(GIT_PROVIDERS).join(', ')}`
      );
    }

    const gitUrl = urlBuilder(repoPath!);

    // Step 2a: Reject mutable branch refs (DEC-1.9). A commit-ish that names a
    // branch head is not an immutable pin. Tags and SHAs pass through.
    if (commitishIsBranch(gitUrl, commitish!)) {
      throw new InheritanceError(
        `Git source '${source}' pins branch '${commitish}', which is mutable and ` +
        `not allowed (DEC-1.9). Use an immutable tag or commit SHA instead.`
      );
    }

    // Step 2b: Fetch the commit-ish (tag OR SHA) shallowly into the cache.
    // See buildFetchCommands for why we can't use `git clone --branch`.
    fs.mkdirSync(cachedPath, { recursive: true });

    try {
      for (const [cmd, ...args] of buildFetchCommands(gitUrl, commitish!)) {
        execFileSync(cmd!, args, {
          cwd: cachedPath,
          stdio: ['pipe', 'pipe', 'pipe'],
          encoding: 'utf-8',
        });
      }
    } catch (e) {
      // Clean up failed fetch
      fs.rmSync(cachedPath, { recursive: true, force: true });

      const errMsg = e instanceof Error ? e.message : String(e);
      throw new InheritanceError(
        `Failed to fetch git source '${source}' from ${gitUrl}: ${errMsg}. ` +
        `Note: pinning by SHA requires the commit to be reachable from a ref and ` +
        `the server to allow SHA fetches (GitHub does; some servers do not).`
      );
    }

    // Step 3: Return library path
    return this.findLibraryDir(cachedPath, source);
  }

  /**
   * Find the library directory within a cloned repo.
   * Dual lookup per DEC-1.2, DEC-1.10: gvp/ wins over .gvp/library/
   */
  private findLibraryDir(repoDir: string, source: string): string {
    const gvpDir = path.join(repoDir, 'gvp');
    if (fs.existsSync(gvpDir) && fs.statSync(gvpDir).isDirectory()) {
      return gvpDir;
    }

    const dotGvpLibrary = path.join(repoDir, '.gvp', 'library');
    if (fs.existsSync(dotGvpLibrary) && fs.statSync(dotGvpLibrary).isDirectory()) {
      return dotGvpLibrary;
    }

    // Fall back to repo root (maybe the whole repo IS the library)
    return repoDir;
  }
}

/**
 * Factory that creates the appropriate resolver based on source format.
 */
export function createSourceResolver(libraryDir: string): SourceResolver {
  const local = new LocalSourceResolver(libraryDir);
  const git = new GitSourceResolver();

  return {
    resolve(source: string): string {
      if (source.startsWith('@') && source !== '@local') {
        return git.resolve(source);
      }
      return local.resolve(source);
    },
  };
}
