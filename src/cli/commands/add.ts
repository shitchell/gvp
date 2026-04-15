import { Command } from 'commander';
import * as fs from 'fs';
import * as yaml from 'js-yaml';
import { randomUUID } from 'crypto';
import { parseConfigOptions, buildCatalog, requireUserIdentity, getLibraryOverride, getStoreOverride } from '../helpers.js';
import { resolveTimezone } from '../../schema/datetime.js';

export function addCommand(): Command {
  const cmd = new Command('add')
    .description('Add a new element to a GVP document')
    .argument('<category>', 'Element category (e.g., goal, value, decision)')
    .argument('<name>', 'Element name')
    .option('-d, --document <path>', 'Target document (default: last/leaf document in library)')
    .option('-f, --field <key=value...>', 'Set field values')
    .option('--skip-review', 'Mark provenance as skip-review (DEC-4.6)')
    .option('--no-provenance', 'Legacy alias for --skip-review')
    .action(async (category: string, name: string) => {
      try {
        const { config } = parseConfigOptions(cmd);
        const catalog = buildCatalog(config, process.cwd(), getLibraryOverride(cmd), getStoreOverride(cmd));
        const opts = cmd.opts();

        // Verify category exists
        const catDef = catalog.registry.getByName(category);
        if (!catDef) {
          const available = catalog.registry.categoryNames.join(', ');
          console.error(`Unknown category '${category}'. Available: ${available}`);
          process.exit(1);
        }

        // Find target document
        const docs = catalog.documents;
        const targetDoc = opts.document
          ? docs.find(d => d.documentPath === opts.document || d.name === opts.document)
          : docs[docs.length - 1]; // Last doc = leaf = most specific

        if (!targetDoc) {
          console.error(`Document '${opts.document}' not found`);
          process.exit(1);
        }

        // Generate next ID (DEC-9.5): find max numeric suffix in TARGET DOCUMENT, increment by 1
        const prefix = catDef.id_prefix;
        const existingIds = targetDoc.getElementsByCategory(category).map(e => e.id);
        const maxNum = existingIds.reduce((max, id) => {
          const num = parseInt(id.replace(prefix, ''), 10);
          return isNaN(num) ? max : Math.max(max, num);
        }, 0);
        const newId = `${prefix}${maxNum + 1}`;

        // Build element data
        const elementData: Record<string, unknown> = {
          id: newId,
          name,
          status: 'active',
          tags: [],
          maps_to: [],
        };

        // Apply field values from --field flags
        if (opts.field) {
          for (const entry of opts.field as string[]) {
            const eqIdx = entry.indexOf('=');
            if (eqIdx > 0) {
              const key = entry.substring(0, eqIdx);
              const value = entry.substring(eqIdx + 1);
              // Try to parse as JSON, fall back to string
              try { elementData[key] = JSON.parse(value); } catch { elementData[key] = value; }
            }
          }
        }

        // Add origin provenance (DEC-4.7)
        const skipReview = opts.skipReview || opts.provenance === false;
        const tz = resolveTimezone(config.default_timezone);
        const user = requireUserIdentity(config);
        const originEntry: Record<string, unknown> = {
          id: randomUUID(),
          date: new Date().toISOString(),
          by: user,
        };
        if (skipReview) {
          originEntry.skip_review = true;
        }
        elementData.origin = [originEntry];

        // Write to YAML file
        const filePath = targetDoc.filePath;
        const content = fs.readFileSync(filePath, 'utf-8');
        const data = yaml.load(content) as Record<string, unknown> ?? {};

        const yamlKey = catDef.yaml_key;
        if (!data[yamlKey]) data[yamlKey] = [];
        (data[yamlKey] as unknown[]).push(elementData);

        fs.writeFileSync(filePath, yaml.dump(data, {
          lineWidth: -1,
          noRefs: true,
          sortKeys: false,
        }));

        console.error(`Added ${newId}: "${name}" to ${targetDoc.name} (${yamlKey})`);
        // Output the new ID to stdout for scripting
        process.stdout.write(newId);
      } catch (e) {
        console.error(`Error: ${(e as Error).message}`);
        process.exit(1);
      }
    });

  return cmd;
}
