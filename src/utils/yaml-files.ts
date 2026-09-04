import * as fs from 'fs';
import * as path from 'path';

/**
 * Every `.yaml`/`.yml` file under `dir`, recursively, sorted.
 *
 * Lifted verbatim out of `src/cli/helpers.ts` so the registry recorder and
 * catalog construction share ONE walker (P11) — two copies would drift, and
 * a recorder that disagreed with the loader about which files are documents
 * would index a different set than the one the user can actually reference.
 *
 * THROWS on an unreadable or missing directory, deliberately. Recording
 * wants leniency but catalog construction does not, and silently loading a
 * partial document set would be worse than failing. The registry supplies
 * its own leniency at the call site (`record.ts`'s per-source try/catch).
 */
export function findYamlFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isFile() && /\.ya?ml$/.test(entry.name)) {
      files.push(path.join(dir, entry.name));
    } else if (entry.isDirectory()) {
      files.push(...findYamlFiles(path.join(dir, entry.name)));
    }
  }
  return files.sort();
}
