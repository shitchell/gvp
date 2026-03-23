#!/usr/bin/env node
import { Command } from 'commander';
import { validateCommand } from './commands/validate.js';
import { exportCommand } from './commands/export.js';

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

program.parse();
