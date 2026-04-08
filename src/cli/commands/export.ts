import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { parseConfigOptions, buildCatalog, resolveDocumentFilter, getLibraryOverride } from '../helpers.js';
import { createExporterRegistry } from '../../exporters/registry.js';

export function exportCommand(): Command {
  const cmd = new Command('export')
    .description('Export the GVP catalog to a format')
    .option('-f, --format <format>', 'Output format (json, csv, markdown)', 'json')
    .option('-o, --output <path>', 'Output file path (default: stdout)')
    .option('-d, --document <name>', 'Restrict export to a single document (matched by meta.name or documentPath)')
    .option('--include-deprecated', 'Include deprecated/rejected elements')
    .action(async () => {
      try {
        const { config } = parseConfigOptions(cmd);
        const catalog = buildCatalog(config, process.cwd(), getLibraryOverride(cmd));
        const registry = createExporterRegistry();

        const opts = cmd.opts();
        const format = opts.format as string;
        const exporter = registry.get(format);

        if (!exporter) {
          const available = [...registry.keys()].join(', ');
          console.error(`Unknown format '${format}'. Available: ${available}`);
          process.exit(1);
        }

        let documentFilter: Set<string> | undefined;
        if (opts.document) {
          documentFilter = resolveDocumentFilter(catalog, opts.document as string);
          if (documentFilter.size === 0) {
            console.error(`No document matches '${opts.document}'. Check meta.name or documentPath.`);
            process.exit(1);
          }
        }

        const output = exporter.export(catalog, {
          includeDeprecated: opts.includeDeprecated as boolean,
          documentFilter,
        });

        if (opts.output) {
          const outPath = path.resolve(opts.output as string);
          fs.mkdirSync(path.dirname(outPath), { recursive: true });
          fs.writeFileSync(outPath, output);
          console.error(`Exported to ${outPath}`);
        } else {
          // stdout for structured output (DEC-5.12)
          process.stdout.write(output);
        }
      } catch (e) {
        console.error(`Error: ${(e as Error).message}`);
        process.exit(1);
      }
    });

  return cmd;
}
