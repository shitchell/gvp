import * as fs from 'fs';
import * as path from 'path';
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
 * Stub resolver for git-based sources (DEC-1.9).
 * Validates commit-ish is present. Full git fetching deferred for alpha.
 */
export class GitSourceResolver implements SourceResolver {
  resolve(source: string): string {
    // Parse @github:user/repo@commitish or @azure:org/project@commitish
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

    const [, provider, repoPath, commitish] = match;

    // Reject branch-like references (no slashes, starts with letter, no dots)
    // This is a heuristic — exact validation would require git
    // For alpha, just ensure something is there
    if (!commitish || commitish.length === 0) {
      throw new InheritanceError(
        `Git source '${source}' requires a commit-ish after '@'`
      );
    }

    // For alpha: throw not-implemented
    throw new InheritanceError(
      `Git source resolution not yet implemented. ` +
      `Source: @${provider}:${repoPath}@${commitish}. ` +
      `For now, use local filesystem paths or clone the repo manually.`
    );
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
