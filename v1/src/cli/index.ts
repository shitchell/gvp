#!/usr/bin/env node
import { Command } from 'commander';
import { validateCommand } from './commands/validate.js';
import { exportCommand } from './commands/export.js';
import { diffCommand } from './commands/diff.js';
import { addCommand } from './commands/add.js';
import { inspectCommand } from './commands/inspect.js';
import { queryCommand } from './commands/query.js';
import { reviewCommand } from './commands/review.js';
import { editCommand } from './commands/edit.js';
import { analyzeCommand } from './commands/analyze.js';
import { initCommand } from './commands/init.js';

const program = new Command();

program
  .name('gvp')
  .description('Goals, Values, and Principles — decision traceability framework')
  .version('1.0.0-alpha')
  .option('--config <path>', 'Load specific config file (replaces discovery)')
  .option('--no-config', 'Skip all config files')
  .option('-c, --override <key=value...>', 'Inline config override (highest precedence)')
  .option('--strict', 'Promote warnings to errors')
  .option('-v, --verbose', 'Verbose output (-v, -vv, -vvv)', (_: string, prev: number) => (prev ?? 0) + 1, 0);

program.addCommand(validateCommand());
program.addCommand(exportCommand());
program.addCommand(diffCommand());
program.addCommand(addCommand());
program.addCommand(inspectCommand());
program.addCommand(queryCommand());
program.addCommand(reviewCommand());
program.addCommand(editCommand());
program.addCommand(analyzeCommand());
program.addCommand(initCommand());

program.parse();
