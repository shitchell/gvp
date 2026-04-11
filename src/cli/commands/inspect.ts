import { Command } from 'commander';
import { parseConfigOptions, buildCatalog, resolveDocumentFilter, getLibraryOverride, getStoreOverride } from '../helpers.js';
import { isStale, getUnreviewedUpdates } from '../../provenance/staleness.js';
import { renderElementMarkdown } from '../../exporters/shape-renderer.js';
import type { Element } from '../../model/element.js';
import type { Catalog } from '../../catalog/catalog.js';

/** Truncate a string to maxLen characters with ellipsis. */
function truncate(s: string, maxLen = 100): string {
  const clean = s.trim().replace(/\s+/g, ' ');
  if (clean.length <= maxLen) return clean;
  return clean.slice(0, maxLen - 1) + '…';
}

/**
 * Render a single element inline at a given indent depth, showing its id,
 * name, category, and a truncated preview of its primary field content.
 * Generic over category — reads primary_field from the registry.
 */
function renderInlineElement(
  el: Element,
  catalog: Catalog,
  indent: string,
): string[] {
  const lines: string[] = [];
  lines.push(
    `${indent}→ ${el.toLibraryId()}  "${el.name}"  (${el.categoryName})`,
  );
  const catDef = catalog.registry.getByName(el.categoryName);
  const primaryField = catDef?.primary_field ?? 'statement';
  const primaryValue = el.get(primaryField);
  if (primaryValue) {
    lines.push(`${indent}  ${truncate(String(primaryValue))}`);
  }
  return lines;
}

/**
 * Walk maps_to outward from `element` to a bounded depth, emitting
 * renderInlineElement() at each hop. hops=1 shows direct parents;
 * hops=2 shows parents of parents; etc. Generic over category —
 * the renderer does not branch on element.categoryName.
 */
function renderHops(
  element: Element,
  catalog: Catalog,
  hops: number,
): string[] {
  const lines: string[] = [];
  const seen = new Set<string>([element.hashKey()]);
  const allElements = catalog.getAllElements();

  function walk(current: Element, depth: number, indent: string): void {
    if (depth > hops) return;
    for (const ref of current.maps_to) {
      const target = allElements.find(
        (e) => e.toLibraryId() === ref || e.hashKey() === ref,
      );
      if (!target) continue;
      if (seen.has(target.hashKey())) continue;
      seen.add(target.hashKey());
      lines.push(...renderInlineElement(target, catalog, indent));
      walk(target, depth + 1, indent + '  ');
    }
  }

  walk(element, 1, '  ');
  return lines;
}

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
    .option('-d, --document <name>', 'Restrict element lookup to a single document (matched by meta.name or documentPath)')
    .option('--hops <n>', 'Expand maps_to N levels deep inline with id, name, and content preview', (v) => parseInt(v, 10))
    .option('--format <format>', 'Output format (text, json, markdown)', 'text')
    .action(async (elementArg: string | undefined) => {
      try {
        const { config } = parseConfigOptions(cmd);
        const catalog = buildCatalog(config, process.cwd(), getLibraryOverride(cmd), getStoreOverride(cmd));
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

        // Resolve --document filter if provided
        let allowedDocs: Set<string> | undefined;
        if (opts.document) {
          allowedDocs = resolveDocumentFilter(catalog, opts.document as string);
          if (allowedDocs.size === 0) {
            console.error(`No document matches '${opts.document}'. Check meta.name or documentPath.`);
            process.exit(1);
          }
        }

        // Find element (optionally scoped to --document)
        const candidates = catalog.getAllElements().filter(e =>
          (!allowedDocs || allowedDocs.has(e.documentPath)) &&
          (e.id === elementArg ||
           e.toLibraryId() === elementArg ||
           e.hashKey() === elementArg)
        );

        if (candidates.length === 0) {
          console.error(`Element '${elementArg}' not found`);
          process.exit(1);
        }
        if (candidates.length > 1) {
          console.error(`Element '${elementArg}' is ambiguous across ${candidates.length} documents:`);
          for (const c of candidates) {
            console.error(`  ${c.toLibraryId()}`);
          }
          console.error(`Use --document <name> or a qualified id (document:id) to disambiguate.`);
          process.exit(1);
        }
        const element = candidates[0]!;

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

        if (opts.format === 'markdown') {
          // Use the same shape-based renderer that the markdown
          // exporter uses, so procedures (and any other element
          // with declared list<model> / dict<model> fields) render
          // with structured subsections. The text format below
          // stays as-is for terminal-friendly plain output.
          process.stdout.write(renderElementMarkdown(element, catalog));
          process.stdout.write('\n');

          // --hops still appends an expansion section, even in
          // markdown mode, so consumers can compose `--format
          // markdown --hops 2` for a guide-style render.
          if (typeof opts.hops === 'number' && opts.hops > 0) {
            const hopLines = renderHops(element, catalog, opts.hops as number);
            process.stdout.write(`\n**Maps to (${opts.hops} hop${opts.hops === 1 ? '' : 's'}):**\n\n`);
            if (hopLines.length > 0) {
              for (const line of hopLines) process.stdout.write(line + '\n');
            } else {
              process.stdout.write('  (no outgoing mappings)\n');
            }
          }
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

        // --hops: bounded maps_to expansion with content previews
        if (typeof opts.hops === 'number' && opts.hops > 0) {
          if (Number.isNaN(opts.hops) || opts.hops < 0) {
            console.error(`Invalid --hops value: ${opts.hops}`);
            process.exit(1);
          }
          const hopLines = renderHops(element, catalog, opts.hops as number);
          if (hopLines.length > 0) {
            console.error(`\n--- Maps to (${opts.hops} hop${opts.hops === 1 ? '' : 's'}) ---`);
            for (const line of hopLines) console.error(line);
          } else {
            console.error(`\n--- Maps to (${opts.hops} hop${opts.hops === 1 ? '' : 's'}) ---`);
            console.error('  (no outgoing mappings)');
          }
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
