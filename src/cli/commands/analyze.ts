import { Command } from 'commander';
import { parseConfigOptions, buildCatalog, getLibraryOverride } from '../helpers.js';
import { StubEmbeddingProvider } from '../../analysis/stub-provider.js';
import { findUnmappedRelationships } from '../../analysis/analyzer.js';

export function analyzeCommand(): Command {
  const cmd = new Command('analyze')
    .description('Analyze the GVP catalog for unmapped relationships and potential conflicts')
    .option('--threshold <number>', 'Similarity threshold (0-1)', '0.7')
    .action(async () => {
      try {
        const { config } = parseConfigOptions(cmd);
        const catalog = buildCatalog(config, process.cwd(), getLibraryOverride(cmd));
        const opts = cmd.opts();

        const provider = new StubEmbeddingProvider();
        const threshold = parseFloat(opts.threshold as string);

        const elements = catalog.getAllElements().filter(e => e.status === 'active');
        console.error(`Analyzing ${elements.length} elements for unmapped relationships (threshold: ${threshold})...\n`);

        const results = await findUnmappedRelationships(elements, provider, threshold);

        if (results.length === 0) {
          console.error('No unmapped relationships found above threshold.');
          process.exit(0);
        }

        console.error(`Found ${results.length} potential relationship(s):\n`);
        for (const r of results) {
          console.error(`  ${r.elementA.toLibraryId()} <-> ${r.elementB.toLibraryId()}  (similarity: ${r.similarity.toFixed(3)})`);
          console.error(`    "${r.elementA.name}" ~ "${r.elementB.name}"`);
          console.error('');
        }

        // JSON to stdout (DEC-5.12: structured output to stdout, human to stderr)
        const jsonOutput = results.map(r => ({
          elementA: { id: r.elementA.id, name: r.elementA.name, libraryId: r.elementA.toLibraryId() },
          elementB: { id: r.elementB.id, name: r.elementB.name, libraryId: r.elementB.toLibraryId() },
          similarity: r.similarity,
        }));
        process.stdout.write(JSON.stringify(jsonOutput, null, 2) + '\n');
      } catch (e) {
        console.error(`Error: ${(e as Error).message}`);
        process.exit(1);
      }
    });

  return cmd;
}
