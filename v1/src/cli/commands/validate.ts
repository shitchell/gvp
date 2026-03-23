import { Command } from 'commander';
import { parseConfigOptions, buildCatalog } from '../helpers.js';
import { runValidation, hasErrors, builtinPasses } from '../../validation/index.js';
import type { Diagnostic } from '../../validation/diagnostic.js';

export function validateCommand(): Command {
  const cmd = new Command('validate')
    .description('Validate the GVP library')
    .action(async () => {
      try {
        const { config } = parseConfigOptions(cmd);
        const catalog = buildCatalog(config);
        const diagnostics = runValidation(catalog, config, builtinPasses);

        // Print diagnostics to stderr (DEC-5.12)
        for (const d of diagnostics) {
          const prefix = d.severity === 'error' ? 'ERROR' : 'WARN';
          const location = d.context.elementId
            ? `${d.context.documentPath ?? ''}:${d.context.elementId}`
            : d.context.documentPath ?? '';
          console.error(`${prefix}  ${d.code}  ${location}  ${d.description}`);
        }

        if (diagnostics.length === 0) {
          console.error('Validation passed. Structural checks OK. Use `gvp export` for semantic review.');
        }

        // Exit code (DEC-5.12): 0 for success/warnings, non-zero for errors
        process.exit(hasErrors(diagnostics) ? 1 : 0);
      } catch (e) {
        console.error(`Error: ${(e as Error).message}`);
        process.exit(1);
      }
    });

  return cmd;
}
