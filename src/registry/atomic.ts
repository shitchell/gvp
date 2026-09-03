import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

let counter = 0;

/**
 * The temp path used for an atomic replace of `target`.
 *
 * Exported for testing: the load-bearing property is that the temp is a
 * SIBLING of the target — rename is only atomic within a filesystem — and
 * that cannot be observed portably from writeFileAtomic's behavior, because
 * a temp in os.tmpdir() is same-device on a typical test machine and fails
 * identically (EACCES from rename) when the target dir is unwritable. So the
 * derivation is tested directly instead of inferred (TP2: design for testing).
 *
 * The suffix must NOT be `.yml`: pruneStaleRegistryEntries unlinks any `.yml`
 * it cannot parse, so a `.yml` temp would let a concurrent prune delete an
 * in-flight write — the exact path D52 closes.
 *
 * pid + counter alone collides across PID namespaces sharing a bind-mounted
 * $HOME, and across vitest workers if the pool ever changes from `forks` to
 * `threads` (threads share process.pid and each module registry restarts
 * counter at 0) — which would reproduce the very torn-file bug this closes.
 */
export function tempPathFor(target: string): string {
  return path.join(
    path.dirname(target),
    `.${path.basename(target)}.${process.pid}.${counter++}.${crypto.randomBytes(4).toString('hex')}.tmp`,
  );
}

/**
 * Write `content` to `target` atomically (D52).
 *
 * Writes to a temp file in the SAME directory (rename is only atomic
 * within a filesystem) and renames over the target. A concurrent reader
 * therefore sees either the old file or the new one, never a truncated
 * one — which matters because pruneStale* unlinks entries it cannot
 * parse, turning a torn read into deletion.
 *
 * SCOPE: atomic with respect to concurrent READERS, not durable across
 * machine crashes. The temp file is not fsynced before the rename and the
 * parent directory is not fsynced after it, so a crash can still leave the
 * entry at its previous content or, on some filesystems, absent. Per-write
 * fsync would put a write barrier on every cairn invocation for every user
 * once D43 lands, and D56 already records that a lost entry is survivable
 * (rebuilding is lossy but safe). Recorded as a scope clause on D52.
 *
 * Throws on failure; callers in the registry path wrap in try/catch per
 * D57 (recording failure never fails the command).
 */
export function writeFileAtomic(target: string, content: string): void {
  const dir = path.dirname(target);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = tempPathFor(target);
  try {
    fs.writeFileSync(tmp, content);
    fs.renameSync(tmp, target);
  } catch (err) {
    try { fs.unlinkSync(tmp); } catch { /* already gone */ }
    throw err;
  }
}
