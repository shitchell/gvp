import { Command } from 'commander';
import { parseConfigOptions, buildCatalog } from '../helpers.js';
import { traceGitDiff, formatDiffTrace } from '../../refs/git-diff-tracer.js';
import * as path from 'path';

export function diffCommand(): Command {
  const cmd = new Command('diff')
    .description('Trace code changes back to GVP decisions via refs')
    .argument('[commitA]', 'Start commit (default: HEAD~1)')
    .argument('[commitB]', 'End commit (default: HEAD)')
    .option('--scope <scope>', 'Scope: staged, working, or commit range')
    .option('--format <format>', 'Output format: text (default) or json', 'text')
    .action(async (commitA?: string, commitB?: string) => {
      try {
        const { config } = parseConfigOptions(cmd);
        const catalog = buildCatalog(config);
        const opts = cmd.opts();

        let a: string;
        let b: string;

        if (opts.scope === 'staged') {
          a = 'HEAD';
          b = '--cached';  // git diff --cached
        } else if (opts.scope === 'working') {
          a = 'HEAD';
          b = '';  // git diff (working tree)
        } else {
          a = commitA ?? 'HEAD~1';
          b = commitB ?? 'HEAD';
        }

        // Find the worktree root (where .git is)
        const cwd = process.cwd();
        let root = cwd;
        const fs = await import('fs');
        while (root !== path.dirname(root)) {
          if (fs.existsSync(path.join(root, '.git'))) break;
          root = path.dirname(root);
        }

        const result = traceGitDiff(catalog, a, b, root);

        if (opts.format === 'json') {
          // JSON to stdout for programmatic consumption
          const jsonOutput = result.refChanges.map(c => ({
            element: {
              id: c.element.id,
              name: c.element.name,
              category: c.element.categoryName,
              libraryId: c.element.toLibraryId(),
            },
            ref: c.ref,
            changeType: c.changeType,
          }));
          process.stdout.write(JSON.stringify(jsonOutput, null, 2) + '\n');
        } else {
          // Human-readable output to stderr
          const output = formatDiffTrace(result, catalog);
          console.error(output);
        }

        process.exit(0);
      } catch (e) {
        console.error(`Error: ${(e as Error).message}`);
        process.exit(1);
      }
    });

  return cmd;
}
