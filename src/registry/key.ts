import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createHash } from 'crypto';
import { REMOTE_SOURCE_RE } from '../inheritance/source-resolver.js';

/**
 * Is this source a remote spec? Mirrors createSourceResolver's dispatch
 * (src/inheritance/source-resolver.ts) — an `@` prefix means remote,
 * except `@local` which is the local library itself.
 */
export function isRemoteSource(source: string): boolean {
  return source.startsWith('@') && source !== '@local';
}

/**
 * The remote source grammar lives in `src/inheritance/source-resolver.ts`
 * (Task 4), which owns it — `GitSourceResolver.resolve` already parses it.
 * Import it rather than defining a second copy.
 *
 * DIRECTION MATTERS: `inheritance/` is the lower layer and `registry/`
 * consumes it (record.ts and query.ts both import source-resolver).
 * Defining the constant here and importing it *down* into source-resolver
 * would invert that layering and become a genuine cycle the moment key.ts
 * needs anything from the resolver.
 */

/**
 * Derive kind and ref from a source string (D50 — neither is stored).
 * The remote grammar is exactly `@<provider>:<path>@<commitish>`.
 */
export function parseSource(source: string): { kind: 'local' | 'remote'; ref: string | null } {
  if (!isRemoteSource(source)) return { kind: 'local', ref: null };
  const m = REMOTE_SOURCE_RE.exec(source);
  return { kind: 'remote', ref: m ? (m[3] as string) : null };
}

/**
 * Expand a leading `~` or `~/` to the user's home directory. Other forms
 * (`~user`) are left untouched — cairn sources are the current user's own
 * paths. LocalSourceResolver does not expand tildes, so callers do it
 * before handing the source string off.
 */
export function expandTilde(p: string): string {
  if (p === '~') return os.homedir();
  if (p.startsWith('~/')) return path.join(os.homedir(), p.slice(2));
  return p;
}

/**
 * Canonicalize a source for keying (D47).
 *
 * Local: expand `~`, resolve against `baseDir`, then realpath. Resolving
 * is precisely the step that collapses the dual lookup, the tilde form,
 * a relative form, and symlink aliases onto one identity — which is why
 * local libraries are keyed by resolved path rather than by the source
 * string the caller happened to type.
 *
 * `config.source` is deliberately NOT accepted here: it is a free-form
 * string, and two unrelated projects setting the same value would
 * otherwise collide on one key and overwrite each other. Callers pass
 * the RESOLVED library directory.
 *
 * Remote: already canonical (the ref is part of the string); verbatim.
 */
export function canonicalizeSource(source: string, baseDir: string): string {
  if (isRemoteSource(source)) return source;
  const abs = path.resolve(baseDir, expandTilde(source));
  try {
    return fs.realpathSync(abs);
  } catch {
    return abs; // not on disk (e.g. evicted); absolute is the best we can do
  }
}

/**
 * Entry key: first 16 hex of SHA-256 over source + NUL + documentPath.
 *
 * The separator prevents the boundary between the two inputs from being
 * ambiguous. Concretely, without it `('/a','bc')` and `('/ab','c')` both
 * hash "/abc" and collide -- verified. (An earlier version of this comment
 * offered `('/a/b','c')` vs `('/a','b/c')` as the example; those produce
 * "/a/bc" and "/ab/c" and never collided.)
 *
 * NUL specifically, because a POSIX path cannot contain one -- that is what
 * makes the boundary unambiguous rather than merely unlikely.
 */
export function entryKey(canonicalSource: string, documentPath: string): string {
  return createHash('sha256')
    .update(canonicalSource)
    .update('\0')
    .update(documentPath)
    .digest('hex')
    .slice(0, 16);
}
