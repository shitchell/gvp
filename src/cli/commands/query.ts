import { Command } from 'commander';
import { parseConfigOptions, buildCatalog, resolveDocumentFilter, filterElementsByDocument, getLibraryOverride, getStoreOverride } from '../helpers.js';
import { renderCompactLine } from '../../exporters/compact-exporter.js';
import { createListingRegistry } from '../../listings/registry.js';

/**
 * NOTE ON FORMAT DISPATCH (gvp:P15 / gvp:R6). `export` resolves its format
 * through createExporterRegistry(); this command hand-rolls the switch
 * below, and the divergence is deliberate rather than pending cleanup:
 *
 *   - `query --format json` emits a FLAT ARRAY of elements, while
 *     JsonExporter emits `{documents, categories, tags}`. `query --format
 *     csv` emits `qualified_id,category,name,status,tags`, while
 *     CsvExporter emits reserved columns plus every dynamic field. The
 *     names collide; the formats do not. Routing query through the registry
 *     would silently change both outputs — including the very output #24
 *     extends.
 *   - `ExportOptions` carries only `includeDeprecated` and `documentFilter`.
 *     It cannot express `--category`, `--tag`, `--status` or the ref
 *     filters, so an exporter handed this catalog would re-derive the
 *     unfiltered element set and quietly ignore the user's query.
 *
 * Unifying them is a real change to the Exporter contract (an element-set
 * or predicate input) plus a breaking change to two output shapes. It is
 * out of scope for #24 and recorded here so the next reader does not
 * mistake it for an oversight. The unused `createExporterRegistry` import
 * that used to sit at the top of this file — the thing that made it look
 * like an abandoned refactor — is gone.
 */
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
    .option(
      '--list <type>',
      `Enumerate a kind of thing in the resolved catalog instead of its elements (${[...createListingRegistry().keys()].join(', ')})`,
    )
    .option('--include-deprecated', 'Include deprecated/rejected elements')
    .action(async () => {
      try {
        const { config, preflight } = parseConfigOptions(cmd);
        const catalog = buildCatalog(config, process.cwd(), getLibraryOverride(cmd), getStoreOverride(cmd), preflight);
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

        // Held past the filter step: `--list` needs it to restrict which
        // ROWS appear, independently of which elements survive.
        let documentFilter: Set<string> | undefined;
        if (opts.document) {
          documentFilter = resolveDocumentFilter(catalog, opts.document as string);
          if (documentFilter.size === 0) {
            console.error(`No document matches '${opts.document}'. Check meta.name or documentPath.`);
            process.exit(1);
          }
          elements = filterElementsByDocument(elements, documentFilter);
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

        // `--list <type>` selects WHAT to enumerate; `--format` still
        // selects HOW to render it (personal:P3). The two are separate
        // flags precisely so they compose — a `--format documents` would
        // have put a selector in the renderer's slot.
        if (opts.list) {
          const listings = createListingRegistry();
          const listing = listings.get(opts.list as string);
          if (!listing) {
            console.error(
              `Unknown listing type '${opts.list}'. Available: ${[...listings.keys()].join(', ')}`,
            );
            process.exit(1);
          }
          const rows = listing!.rows(catalog, { elements, documentFilter });
          if (opts.format === 'json') {
            process.stdout.write(JSON.stringify(rows, null, 2) + '\n');
          } else if (opts.format === 'text') {
            // Text goes to stderr like every other text view in this
            // command; stdout stays reserved for structured output (DEC-5.12).
            console.error(listing!.renderText(rows));
          } else {
            // Refuse rather than silently falling back to text. A listing
            // is not an element stream, so the element formats have nothing
            // to render — saying so beats emitting a shape the caller did
            // not ask for (gvp:V10).
            console.error(
              `Format '${opts.format}' is not available for --list ${listing!.key}. Available: text, json`,
            );
            process.exit(1);
          }
          return;
        }

        if (opts.format === 'json') {
          const output = elements.map(e => ({
            ...e.data,
            _category: e.categoryName,
            // Document identity, split out because `_canonicalId` cannot be
            // split back apart — `source` may itself contain `:` (e.g.
            // `@github:org/repo`), so string-splitting it is not a
            // substitute (gvp:P14). These three are the join key against
            // `--list documents` rows (`name`, `document_path`, `source`);
            // `_document` alone is not sufficient because document names are
            // not unique across inherited libraries (gvp:D46).
            _document: e.documentName,
            _documentPath: e.documentPath,
            _source: e.source,
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
