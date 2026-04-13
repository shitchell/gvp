import { Command } from 'commander';
import { parseConfigOptions, buildCatalog, resolveDocumentFilter, filterElementsByDocument, getLibraryOverride, getStoreOverride } from '../helpers.js';
import { createExporterRegistry } from '../../exporters/registry.js';
import { renderCompactLine } from '../../exporters/compact-exporter.js';

export function queryCommand(): Command {
  const cmd = new Command('query')
    .description('Query and filter elements in the catalog')
    .option('-c, --category <name>', 'Filter by category')
    .option('-t, --tag <tag>', 'Filter by tag')
    .option('-s, --status <status>', 'Filter by status (default: active)', 'active')
    .option('-d, --document <name>', 'Filter by document')
    .option('--refs-file <path>', 'Filter by ref file path (DEC-10.6)')
    .option('--refs-identifier <id>', 'Filter by ref identifier (DEC-10.6)')
    .option('--format <format>', 'Output format (text, json, csv, compact)', 'text')
    .option('--include-deprecated', 'Include deprecated/rejected elements')
    .action(async () => {
      try {
        const { config } = parseConfigOptions(cmd);
        const catalog = buildCatalog(config, process.cwd(), getLibraryOverride(cmd), getStoreOverride(cmd));
        const opts = cmd.opts();

        let elements = catalog.getAllElements();

        // Apply filters
        if (!opts.includeDeprecated) {
          const status = opts.status as string;
          elements = elements.filter(e => e.status === status);
        }

        if (opts.category) {
          elements = elements.filter(e => e.categoryName === opts.category);
        }

        if (opts.tag) {
          elements = elements.filter(e => e.tags.includes(opts.tag as string));
        }

        if (opts.document) {
          const allowed = resolveDocumentFilter(catalog, opts.document as string);
          if (allowed.size === 0) {
            console.error(`No document matches '${opts.document}'. Check meta.name or documentPath.`);
            process.exit(1);
          }
          elements = filterElementsByDocument(elements, allowed);
        }

        // Ref filters (DEC-10.6)
        if (opts.refsFile || opts.refsIdentifier) {
          elements = elements.filter(e => {
            const refs = e.get('refs') as Array<{file: string; identifier: string}> | undefined;
            if (!refs) return false;
            return refs.some(r =>
              (!opts.refsFile || r.file === opts.refsFile) &&
              (!opts.refsIdentifier || r.identifier === opts.refsIdentifier)
            );
          });
        }

        if (opts.format === 'json') {
          const output = elements.map(e => ({
            ...e.data,
            _category: e.categoryName,
            _libraryId: e.toLibraryId(),
            _canonicalId: e.toCanonicalId(),
          }));
          process.stdout.write(JSON.stringify(output, null, 2));
        } else if (opts.format === 'csv') {
          const header = 'qualified_id,category,name,status,tags';
          const rows = elements.map(e =>
            `${e.toLibraryId()},${e.categoryName},"${e.name}",${e.status},"${e.tags.join(';')}"`
          );
          process.stdout.write([header, ...rows].join('\n'));
        } else if (opts.format === 'compact') {
          if (elements.length === 0) {
            console.error('No elements match the query.');
            process.exit(0);
          }
          for (const el of elements) {
            const catDef = catalog.registry.getByName(el.categoryName);
            process.stdout.write(renderCompactLine(el, catDef?.primary_field) + '\n');
          }
        } else {
          // Text output
          if (elements.length === 0) {
            console.error('No elements match the query.');
            process.exit(0);
          }
          console.error(`Found ${elements.length} element(s):\n`);
          for (const el of elements) {
            console.error(`  ${el.toLibraryId()}  "${el.name}"  [${el.categoryName}]  tags: [${el.tags.join(', ')}]`);
          }
        }
      } catch (e) {
        console.error(`Error: ${(e as Error).message}`);
        process.exit(1);
      }
    });

  return cmd;
}
