import * as fs from 'fs';
import * as path from 'path';

let counter = 0;

/**
 * Write `content` to `target` atomically (D52).
 *
 * Writes to a temp file in the SAME directory (rename is only atomic
 * within a filesystem) and renames over the target. A concurrent reader
 * therefore sees either the old file or the new one, never a truncated
 * one — which matters because pruneStale* unlinks entries it cannot
 * parse, turning a torn read into deletion.
 *
 * Throws on failure; callers in the registry path wrap in try/catch per
 * D57 (recording failure never fails the command).
 */
export function writeFileAtomic(target: string, content: string): void {
  const dir = path.dirname(target);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(dir, `.${path.basename(target)}.${process.pid}.${counter++}.tmp`);
  try {
    fs.writeFileSync(tmp, content);
    fs.renameSync(tmp, target);
  } catch (err) {
    try { fs.unlinkSync(tmp); } catch { /* already gone */ }
    throw err;
  }
}
