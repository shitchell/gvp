import { Command } from 'commander';
import { parseConfigOptions, buildCatalog } from '../helpers.js';
import { isStale, getUnreviewedUpdates } from '../../provenance/staleness.js';

export function inspectCommand(): Command {
  const cmd = new Command('inspect')
    .description('Inspect a single element')
    .argument('[element]', 'Element ID (optional with --ref)')
    .option('--trace', 'Show ancestor trace (maps_to graph)')
    .option('--descendants', 'Show descendant trace')
    .option('--refs', 'Show refs with status')
    .option('--reviews', 'Show review history')
    .option('--updates', 'Show update history')
    .option('--ref <file::id>', 'Find elements referencing a file/identifier and trace')
    .option('--format <format>', 'Output format (text, json)', 'text')
    .action(async (elementArg: string | undefined) => {
      try {
        const { config } = parseConfigOptions(cmd);
        const catalog = buildCatalog(config);
        const opts = cmd.opts();

        // If no element and no --ref, show help
        if (!elementArg && !opts.ref) {
          cmd.help();
          return;
        }

        // Handle --ref mode (DEC-10.7)
        if (opts.ref) {
          const refArg = opts.ref as string;
          const parts = refArg.split('::');
          const file = parts[0];
          const identifier = parts.length > 1 ? parts[1] : undefined;

          const matching = catalog.getAllElements().filter(e => {
            const refs = e.get('refs') as Array<{file: string; identifier: string}> | undefined;
            if (!refs) return false;
            return refs.some(r =>
              r.file === file && (!identifier || r.identifier === identifier)
            );
          });

          if (matching.length === 0) {
            console.error(`No elements reference ${refArg}`);
            process.exit(0);
          }

          for (const el of matching) {
            console.error(`${el.toLibraryId()}  "${el.name}"  (${el.categoryName})`);
            if (opts.trace) {
              const graph = catalog.ancestors(el);
              for (const ancestor of graph.nodes.filter(n => n.hashKey() !== el.hashKey())) {
                console.error(`  → ${ancestor.toLibraryId()}  "${ancestor.name}"  (${ancestor.categoryName})`);
              }
            }
            console.error('');
          }
          process.exit(0);
        }

        // Find element
        const element = catalog.getAllElements().find(e =>
          e.id === elementArg ||
          e.toLibraryId() === elementArg ||
          e.hashKey() === elementArg
        );

        if (!element) {
          console.error(`Element '${elementArg}' not found`);
          process.exit(1);
        }

        if (opts.format === 'json') {
          const output: Record<string, unknown> = {
            ...element.data,
            _category: element.categoryName,
            _libraryId: element.toLibraryId(),
            _canonicalId: element.toCanonicalId(),
          };
          process.stdout.write(JSON.stringify(output, null, 2));
          process.exit(0);
        }

        // Default text output
        console.error(`${element.toLibraryId()}  "${element.name}"`);
        console.error(`Category: ${element.categoryName}`);
        console.error(`Status: ${element.status}`);
        if (element.tags.length > 0) console.error(`Tags: ${element.tags.join(', ')}`);
        if (element.maps_to.length > 0) console.error(`Maps to: ${element.maps_to.join(', ')}`);
        if (element.priority !== undefined) console.error(`Priority: ${element.priority}`);

        // Primary field
        const catDef = catalog.registry.getByName(element.categoryName);
        const primaryField = catDef?.primary_field ?? 'statement';
        const primaryValue = element.get(primaryField);
        if (primaryValue) console.error(`\n${String(primaryValue).trim()}`);

        // Stale status
        if (isStale(element)) {
          const unreviewed = getUnreviewedUpdates(element);
          console.error(`\n⚠ STALE: ${unreviewed.length} unreviewed update(s)`);
        }

        // --trace: show ancestor graph
        if (opts.trace) {
          console.error('\n--- Ancestor Trace ---');
          const graph = catalog.ancestors(element);
          for (const node of graph.nodes) {
            if (node.hashKey() === element.hashKey()) continue;
            console.error(`  → ${node.toLibraryId()}  "${node.name}"  (${node.categoryName})`);
          }
        }

        // --descendants
        if (opts.descendants) {
          console.error('\n--- Descendants ---');
          const graph = catalog.descendants(element);
          for (const node of graph.nodes) {
            if (node.hashKey() === element.hashKey()) continue;
            console.error(`  ← ${node.toLibraryId()}  "${node.name}"  (${node.categoryName})`);
          }
        }

        // --refs
        if (opts.refs) {
          const refs = element.get('refs') as Array<{file: string; identifier: string; role: string}> | undefined;
          if (refs && refs.length > 0) {
            console.error('\n--- Refs ---');
            for (const ref of refs) {
              console.error(`  ${ref.role}: ${ref.file}::${ref.identifier}`);
            }
          } else {
            console.error('\nNo refs.');
          }
        }

        // --reviews
        if (opts.reviews) {
          const reviews = (element.get('reviewed_by') ?? []) as Array<Record<string, unknown>>;
          console.error(`\n--- Reviews (${reviews.length}) ---`);
          for (const r of reviews) {
            console.error(`  ${r.date}  by: ${JSON.stringify(r.by ?? 'unknown')}  updates: ${JSON.stringify(r.updates_reviewed)}`);
            if (r.note) console.error(`    Note: ${r.note}`);
          }
        }

        // --updates
        if (opts.updates) {
          const updates = (element.get('updated_by') ?? []) as Array<Record<string, unknown>>;
          console.error(`\n--- Updates (${updates.length}) ---`);
          for (const u of updates) {
            const skip = u.skip_review ? ' [skip-review]' : '';
            console.error(`  ${u.date}  "${u.rationale}"${skip}`);
          }
        }

        console.error('');
      } catch (e) {
        console.error(`Error: ${(e as Error).message}`);
        process.exit(1);
      }
    });

  return cmd;
}
