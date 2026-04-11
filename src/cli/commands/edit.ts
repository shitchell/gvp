import { Command } from 'commander';
import * as fs from 'fs';
import * as yaml from 'js-yaml';
import { randomUUID } from 'crypto';
import { parseConfigOptions, buildCatalog, requireUserIdentity, getLibraryOverride, getStoreOverride } from '../helpers.js';

export function editCommand(): Command {
  const cmd = new Command('edit')
    .description('Edit an existing element')
    .argument('<element>', 'Element ID (e.g., P1, gvp:P1)')
    .option('-f, --field <key=value...>', 'Set field values')
    .option('--field-file <entries...>', 'Set field(s) from file contents: --field-file key path [key path ...]')
    .option('--rationale <text>', 'Rationale for the change (required unless --skip-review)')
    .option('--skip-review', 'Mark this update as skip-review (DEC-4.6)')
    .action(async (elementArg: string) => {
      try {
        const { config } = parseConfigOptions(cmd);
        const catalog = buildCatalog(config, process.cwd(), getLibraryOverride(cmd), getStoreOverride(cmd));
        const opts = cmd.opts();

        const element = catalog.getAllElements().find(e =>
          e.id === elementArg || e.toLibraryId() === elementArg || e.hashKey() === elementArg
        );

        if (!element) {
          console.error(`Element '${elementArg}' not found`);
          process.exit(1);
        }

        const hasFieldFlag = opts.field && (opts.field as string[]).length > 0;
        const hasFieldFileFlag = opts.fieldFile && (opts.fieldFile as string[]).length > 0;
        if (!hasFieldFlag && !hasFieldFileFlag) {
          console.error('No fields specified. Use --field key=value or --field-file key path to set fields.');
          process.exit(1);
        }

        // Require rationale unless skip-review
        if (!opts.skipReview && !opts.rationale) {
          console.error('--rationale is required unless --skip-review is set');
          process.exit(1);
        }

        // Find the document containing this element
        const doc = catalog.documents.find(d =>
          d.getAllElements().some(e => e.hashKey() === element.hashKey())
        );
        if (!doc) { console.error('Document not found'); process.exit(1); }

        const catDef = catalog.registry.getByName(element.categoryName);
        if (!catDef) { console.error('Category not found'); process.exit(1); }

        // Read and modify YAML
        const content = fs.readFileSync(doc.filePath, 'utf-8');
        const data = yaml.load(content) as Record<string, unknown>;
        const items = data[catDef.yaml_key] as Record<string, unknown>[];
        const target = items?.find(item => item.id === element.id);

        if (!target) { console.error('Element not found in YAML'); process.exit(1); }

        // Apply field changes
        if (hasFieldFlag) {
          for (const entry of opts.field as string[]) {
            const eqIdx = entry.indexOf('=');
            if (eqIdx > 0) {
              const key = entry.substring(0, eqIdx);
              const value = entry.substring(eqIdx + 1);
              try { target[key] = JSON.parse(value); } catch { target[key] = value; }
            }
          }
        }

        // Apply --field-file: read file contents and set fields
        const fieldFileEntries = opts.fieldFile as string[] | undefined;
        if (fieldFileEntries && fieldFileEntries.length > 0) {
          if (fieldFileEntries.length % 2 !== 0) {
            console.error('--field-file requires pairs of <key> <path> arguments');
            process.exit(1);
          }
          for (let i = 0; i < fieldFileEntries.length; i += 2) {
            const key = fieldFileEntries[i]!;
            const filePath = fieldFileEntries[i + 1]!;
            if (!fs.existsSync(filePath)) {
              console.error(`--field-file: file not found: ${filePath}`);
              process.exit(1);
            }
            try {
              const content = fs.readFileSync(filePath, 'utf-8');
              target[key] = content;
            } catch (err) {
              console.error(`--field-file: cannot read file '${filePath}': ${(err as Error).message}`);
              process.exit(1);
            }
          }
        }

        // Add updated_by provenance (DEC-4.7)
        const user = requireUserIdentity(config);
        const updateEntry: Record<string, unknown> = {
          id: randomUUID(),
          date: new Date().toISOString(),
          rationale: opts.rationale ?? 'skip-review update',
          by: user,
        };
        if (opts.skipReview) updateEntry.skip_review = true;

        if (!target.updated_by) target.updated_by = [];
        (target.updated_by as unknown[]).push(updateEntry);

        // Write back
        fs.writeFileSync(doc.filePath, yaml.dump(data, {
          lineWidth: -1, noRefs: true, sortKeys: false,
        }));

        const skipLabel = opts.skipReview ? ' [skip-review]' : '';
        console.error(`Updated ${element.toLibraryId()}${skipLabel}`);
      } catch (e) {
        console.error(`Error: ${(e as Error).message}`);
        process.exit(1);
      }
    });

  return cmd;
}
