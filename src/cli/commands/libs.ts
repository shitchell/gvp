import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { loadAllLibraries, invertUsage, searchLibrariesWithSkips } from '../../registry/query.js';
import { listLibraryKeys, readLibraryEntry, pruneLibraryEntries } from '../../registry/library-entry.js';
import { getLibrariesDir } from '../../registry/paths.js';

/**
 * `cairn libs` — inspect the registry of libraries cairn has resolved
 * (D54, D55). This is the surface #15 was filed to get: without it the
 * registry is data nobody can reach.
 *
 * Every read subcommand carries `--json` because the downstream consumer
 * is an agent-facing ruleset (G7) — a human table parsed by regex defeats
 * the purpose.
 */
export function libsCommand(): Command {
  const cmd = new Command('libs').description('Inspect the registry of GVP libraries cairn has resolved');

  cmd
    .command('list')
    .description('Enumerate every known library document')
    .option('--kind <kind>', 'Filter by kind (local|remote)')
    .option('--scope <scope>', 'Filter by meta.scope')
    .option('--json', 'Machine-readable output')
    .action((opts: { kind?: string; scope?: string; json?: boolean }) => {
      let libs = loadAllLibraries();
      if (opts.kind) libs = libs.filter((l) => l.kind === opts.kind);
      if (opts.scope) libs = libs.filter((l) => l.scope === opts.scope);
      if (opts.json) {
        console.log(JSON.stringify(libs, null, 2));
        return;
      }
      if (libs.length === 0) {
        // Distinguish an empty registry from an empty FILTER. Saying
        // "nothing recorded" while entries exist is a false statement about
        // system state, and this output is what an agent reads back (G7).
        console.log(
          opts.kind || opts.scope ? 'No libraries match those filters.' : 'No libraries recorded yet.',
        );
        return;
      }
      for (const l of libs.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))) {
        const total = Object.values(l.element_counts).reduce((a, b) => a + b, 0);
        const mark = l.cached ? '' : ' (not cached)';
        console.log(
          `${(l.name ?? '(unnamed)').padEnd(22)} ${l.kind.padEnd(6)} ${String(total).padStart(4)}  ${l.source}${mark}`,
        );
      }
    });

  cmd
    .command('show')
    .description('Show one library document, including which projects have used it')
    .argument('<selector>', 'meta.name, or <source>:<document_path> to disambiguate')
    .option('--json', 'Machine-readable output')
    .action((selector: string, opts: { json?: boolean }) => {
      const usage = invertUsage();
      const all = loadAllLibraries();
      let matches = all.filter((l) => l.name === selector);
      if (matches.length === 0) {
        matches = all.filter((l) => `${l.source}:${l.document_path}` === selector);
      }
      if (matches.length === 0) {
        console.error(`No library matches '${selector}'.`);
        process.exit(1);
      }
      const out = matches.map((m) => ({
        ...m,
        usage: usage.get(m.key) ?? { seen_from: [], first_seen: null, last_seen: null },
      }));
      // Names are explicitly NOT unique (D46) — never silently first-match.
      // `personal.yaml` exists in 16 places on one developer's machine, so
      // guessing would hand back the wrong library with no signal, exactly
      // as resolving an ambiguous reference by first-match would (R8).
      //
      // Under --json the candidates ARE the answer the caller needs in
      // order to disambiguate, so they are emitted — but the exit status is
      // still non-zero, so an agent cannot mistake an ambiguous result for
      // a resolved one by reading element [0].
      if (matches.length > 1) {
        if (opts.json) {
          console.log(JSON.stringify(out, null, 2));
        } else {
          console.error(
            `'${selector}' is ambiguous — ${matches.length} matches. Disambiguate with <source>:<document_path>:`,
          );
          for (const m of matches) console.error(`  ${m.source}:${m.document_path}`);
        }
        process.exit(1);
      }
      if (opts.json) {
        console.log(JSON.stringify(out, null, 2));
        return;
      }
      const m = out[0]!;
      console.log(`${m.name ?? '(unnamed)'}  [${m.kind}${m.cached ? '' : ', not cached'}]`);
      console.log(`  source:   ${m.source}`);
      console.log(`  file:     ${m.file}`);
      if (m.ref) console.log(`  ref:      ${m.ref}`);
      if (m.scope) console.log(`  scope:    ${m.scope}`);
      console.log(
        `  elements: ${Object.entries(m.element_counts).map(([k, v]) => `${k}=${v}`).join(' ') || '(none)'}`,
      );
      if (m.usage.first_seen) console.log(`  first seen: ${m.usage.first_seen}`);
      if (m.usage.last_seen) console.log(`  last seen:  ${m.usage.last_seen}`);
      console.log(`  seen from:`);
      for (const p of m.usage.seen_from) console.log(`    ${p}`);
    });

  cmd
    .command('search')
    .description('Search element names and primary fields across all known libraries')
    .argument('<query>')
    .option('--fetch', 'Fetch uncached remote libraries (performs network I/O)')
    .option('--json', 'Machine-readable output')
    .action((query: string, opts: { fetch?: boolean; json?: boolean }) => {
      const { results, skipped, missingLocal, unreadable } = searchLibrariesWithSkips(query, {
        fetch: Boolean(opts.fetch),
      });
      if (opts.json) {
        // The skip buckets travel INSIDE the payload, so a machine consumer
        // never has to scrape stderr to learn the answer was partial.
        console.log(JSON.stringify({ results, skipped, missingLocal, unreadable }, null, 2));
        return;
      }
      for (const r of results) {
        console.log(`${r.library ?? '(unnamed)'}:${r.id}  [${r.category}/${r.field}]  ${r.name}`);
        console.log(`    ${r.excerpt}`);
      }
      if (results.length === 0) console.log('No matches.');
      // Never silently miss — naming skips is the point (D54). A silent
      // miss looks identical to "the element does not exist", which is the
      // failure #15 was filed about.
      for (const s of skipped) {
        console.error(
          opts.fetch
            ? `cairn: could not fetch remote ${s}`
            : `cairn: skipped uncached remote ${s} (use --fetch to include)`,
        );
      }
      // --fetch guidance belongs ONLY to the remote bucket. A deleted local
      // directory and an unparseable document cannot be fixed by fetching.
      for (const s of missingLocal) {
        console.error(`cairn: local library no longer on disk, skipped: ${s}`);
      }
      for (const s of unreadable) {
        console.error(`cairn: could not read document, skipped: ${s}`);
      }
    });

  cmd
    .command('forget')
    .description('Remove one library entry from the registry')
    .argument('<selector>', '<source>:<document_path>')
    .action((selector: string) => {
      let removed = 0;
      for (const key of listLibraryKeys()) {
        const e = readLibraryEntry(key);
        if (!e) continue;
        // Match ONLY the unambiguous selector. `name` is explicitly not
        // unique (D46), so matching it would silently delete every entry
        // sharing a name -- `show` refuses to guess, and so must this.
        if (`${e.source}:${e.document_path}` === selector) {
          // A concurrent prune runs on every cairn invocation (C2), so the
          // file may already be gone.
          try {
            fs.unlinkSync(path.join(getLibrariesDir(), `${key}.yml`));
            removed++;
          } catch {
            /* gone */
          }
        }
      }
      console.log(`Removed ${removed} entr${removed === 1 ? 'y' : 'ies'}.`);
    });

  cmd
    .command('prune')
    .description('Drop local entries whose document is gone; optionally drop uncached remotes')
    .option('--remote', 'Also drop remote entries that are no longer cached')
    .action((opts: { remote?: boolean }) => {
      // Delegate the local half to the ONE implementation (Task 6).
      // Duplicating it here would be the redundant-mechanism smell P11
      // exists to catch, and the two copies would drift.
      const before = listLibraryKeys().length;
      pruneLibraryEntries();
      let removed = before - listLibraryKeys().length;
      if (opts.remote) {
        // Remote eviction is opt-in only (D55): an uncached remote is
        // still re-fetchable, so it is never dropped automatically.
        for (const lib of loadAllLibraries()) {
          if (lib.kind === 'remote' && !lib.cached) {
            try {
              fs.unlinkSync(path.join(getLibrariesDir(), `${lib.key}.yml`));
              removed++;
            } catch {
              /* gone */
            }
          }
        }
      }
      console.log(`Pruned ${removed} entr${removed === 1 ? 'y' : 'ies'}.`);
    });

  return cmd;
}
