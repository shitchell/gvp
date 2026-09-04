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

    // Shared dual-lookup probe; the FALLBACK is what differs here -- an
    // unresolvable user-supplied path must throw, not silently succeed.
    const found = findLibrarySubdir(resolved);
    if (found) return found;

    if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
      return resolved;
    }

    throw new InheritanceError(
      `Cannot resolve source '${source}': no library directory found at '${resolved}'. ` +
      `Checked: ${path.join(resolved, 'gvp')}, ${path.join(resolved, '.gvp', 'library')}, ${resolved}`
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
  // CAIRN_CACHE_DIR mirrors GVP_REGISTRY_ROOT (D22's test-isolation
  // pattern). Without it the suite reads the developer's real
  // ~/.cache/cairn/sources, so record/query tests would pass or fail based
  // on what happens to be cloned on that machine.
  const override = process.env.CAIRN_CACHE_DIR;
  if (override && override.length > 0) return path.resolve(override);
  return path.join(os.homedir(), '.cache', 'cairn', 'sources');
}

/**
 * Dual lookup within a resolved repo directory (DEC-1.2, DEC-1.10):
 * gvp/ wins over .gvp/library/, falling back to the repo root.
 * Lifted from GitSourceResolver so cachedPathFor can share it.
 */
/**
 * The dual-lookup PROBE (DEC-1.2, DEC-1.10 in the v1 design docs): `gvp/`
 * wins over `.gvp/library/`. Returns null when neither exists.
 *
 * This is the one place that rule is written. Callers supply their own
 * fallback, which is where they legitimately differ: GitSourceResolver
 * falls back to the repo root (the clone provably exists and may itself be
 * the library), while LocalSourceResolver must THROW (the path is
 * user-supplied and may not exist at all). Collapsing the fallbacks too
 * would turn that error into a bogus success.
 */
export function findLibrarySubdir(dir: string): string | null {
  const gvpDir = path.join(dir, 'gvp');
  if (fs.existsSync(gvpDir) && fs.statSync(gvpDir).isDirectory()) return gvpDir;
  const dotGvpLibrary = path.join(dir, '.gvp', 'library');
  if (fs.existsSync(dotGvpLibrary) && fs.statSync(dotGvpLibrary).isDirectory()) return dotGvpLibrary;
  return null;
}

/** Probe, falling back to the repo root. For clones, which provably exist. */
export function findLibraryDirIn(repoDir: string): string {
  return findLibrarySubdir(repoDir) ?? repoDir;
}

/**
 * The remote source grammar: `@<provider>:<path>@<commitish>`.
 *
 * The single definition, used by GitSourceResolver.resolve and
 * cachedPathFor; registry/key.ts imports it rather than redeclaring.
 *
 * Non-global by design: `exec`/`match` on a non-global regex never touch
 * `lastIndex`, so sharing one module-level instance is safe. Adding a `g`
 * flag would silently break `.match()` at the call site below (it would
 * return matched strings instead of capture groups, with no type error).
 *
 * Note the lazy `(.+?)` splits at the FIRST `@`, so a repoPath containing
 * `@` parses oddly. No supported provider allows that, and this matches
 * pre-extraction behavior exactly -- recorded so it is not inherited as
 * intentional spec.
 */
export const REMOTE_SOURCE_RE = /^@(\w+):(.+?)@(.+)$/;

/** Cache key for a parsed remote source. Single source of truth. */
export function remoteCacheKey(provider: string, repoPath: string, commitish: string): string {
  return `${provider}/${repoPath.replace(/\//g, '--')}/${commitish}`;
}

/**
 * The cached library directory for a remote source, or null if it is
 * not on disk. PURE — never performs network I/O, never clones. This is
 * what the registry uses; calling GitSourceResolver.resolve instead
 * would fetch (D54).
 */
export function cachedPathFor(source: string, cacheDir: string = defaultCacheDir()): string | null {
  // Reuses the single grammar definition declared above.
  const m = REMOTE_SOURCE_RE.exec(source);
  if (!m) return null;
  const dir = path.join(cacheDir, remoteCacheKey(m[1] as string, m[2] as string, m[3] as string));

  // Containment: `commitish` is interpolated into the path unescaped, and
  // sources arrive from third-party library YAML, so `..` segments could
  // otherwise point outside the cache -- which Task 12 would then scan for
  // YAML. `resolve` gets away with this because a bogus ref fails the
  // fetch; a pure read has no such gate.
  const resolvedDir = path.resolve(dir);
  if (resolvedDir !== path.resolve(cacheDir) &&
      !resolvedDir.startsWith(path.resolve(cacheDir) + path.sep)) return null;

  // existsSync is not isDirectory: a cache entry that is a regular file
  // would otherwise be handed back as a "library directory", and the caller
  // gets ENOTDIR from a path it never typed instead of a clean "not cached".
  const st = fs.statSync(resolvedDir, { throwIfNoEntry: false });
  if (!st?.isDirectory()) return null;
  return findLibraryDirIn(resolvedDir);
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
    // Parse @provider:path@commitish using the single shared grammar.
    const match = source.match(REMOTE_SOURCE_RE);
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

    // Step 0: Check cache (same derivation cachedPathFor uses — one source of truth)
    const cachedPath = path.join(this.cacheDir, remoteCacheKey(provider!, repoPath!, commitish));

    if (fs.existsSync(cachedPath)) {
      return findLibraryDirIn(cachedPath);
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
    return findLibraryDirIn(cachedPath);
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
