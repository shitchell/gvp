#!/usr/bin/env node
import { Command, Option } from 'commander';
import { createRequire } from 'module';
import { validateCommand } from './commands/validate.js';
import { collectOverride } from './helpers.js';

const require = createRequire(import.meta.url);
const { version } = require('../../package.json') as { version: string };
import { exportCommand } from './commands/export.js';
import { diffCommand } from './commands/diff.js';
import { addCommand } from './commands/add.js';
import { inspectCommand } from './commands/inspect.js';
import { queryCommand } from './commands/query.js';
import { reviewCommand } from './commands/review.js';
import { editCommand } from './commands/edit.js';
import { analyzeCommand } from './commands/analyze.js';
import { initCommand } from './commands/init.js';
import { importCommand } from './commands/import.js';
import { mvCommand } from './commands/mv.js';
import { libsCommand } from './commands/libs.js';
import { skillCommand } from './commands/skill.js';

const program = new Command();

program
  .name('cairn')
  .description('Cairn — decision traceability framework (Goals, Values, and Principles)')
  .version(version)
  // Program options are recognized only BEFORE the subcommand name, and
  // subcommand options only after it (#21). Without this, Commander's
  // default mode lets a program option be consumed from anywhere in argv,
  // so the program's `-c, --override` won `cairn query -c decision` over
  // the query command's own `-c, --category` — `query --help` advertised a
  // flag the parser would never honor. See mirrorGlobalOptions below for
  // how the trailing form of the global options survives the change.
  .enablePositionalOptions()
  .option('--config <path>', 'Load specific config file (replaces discovery)')
  .option('--no-config', 'Skip all config files')
  // Repeatable, NOT variadic. `<key=value...>` swallowed every following
  // token up to the next option-like one, including the subcommand name
  // (#21). collectOverride also rejects an entry with no `=`, which used
  // to be dropped in silence.
  .option('-c, --override <key=value>', 'Inline config override, repeatable (highest precedence)', collectOverride)
  .option('--library <path>', 'Load library from this directory instead of discovering from CWD')
  .option('--store <path>', 'Path to a GVP store directory (contains config.yaml and library/)')
  .option('--strict', 'Promote warnings to errors')
  .option('--no-registry', 'Skip registry recording for this invocation (D43, D44)')
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
program.addCommand(importCommand());
program.addCommand(mvCommand());
program.addCommand(libsCommand());
program.addCommand(skillCommand());

/**
 * The global options, as declared above. `--version` is excluded: Commander
 * stores it alongside the rest, but it is an action flag rather than a
 * setting, and mirroring it onto every subcommand would advertise
 * `cairn query --version` as a way to ask about `query`.
 */
const GLOBAL_OPTIONS = program.options.filter((o) => o.attributeName() !== 'version');

/**
 * Re-declare the global options on a subcommand so they are accepted after
 * it as well as before it.
 *
 * `.enablePositionalOptions()` is what makes `-c` mean `--override` before
 * the subcommand and `--category` after it, but it does so by making the
 * program stop parsing options at the first operand — which by itself would
 * reject `cairn validate --strict`, `cairn query --library X --category
 * principle` and `cairn inspect --library X <id> --trace`. That trailing
 * form is not an accident of Commander's default mode that #21 is free to
 * drop: it is the form used throughout README.md, docs/reference/,
 * docs/guide/ and both example READMEs. Fixing an option-parsing bug by
 * invalidating ~25 documented invocations would cost more than the bug.
 *
 * A short flag already taken by the subcommand is NOT mirrored — only the
 * long form is. That is the whole point of the exercise for `query`: `-c`
 * after `query` must stay `--category`, so `query` gets `--override
 * <key=value>` without the `-c` alias, and its help says so.
 *
 * Mirrored copies carry the original's argument parser (so `--override`
 * validates identically in both positions) but deliberately NOT its
 * default value. An unset mirrored option must leave no key behind at all,
 * because `optsWithGlobals()` resolves parent-over-child — a mirrored
 * `verbose: 0` would otherwise be indistinguishable from an explicit one.
 */
function mirrorGlobalOptions(cmd: Command): void {
  for (const global of GLOBAL_OPTIONS) {
    // The subcommand declares this option itself; it owns the meaning.
    if (cmd.options.some((o) => o.long === global.long)) continue;
    const shortTaken = global.short !== undefined && cmd.options.some((o) => o.short === global.short);
    const flags = shortTaken ? global.flags.replace(/^-[^,]+,\s*/, '') : global.flags;
    const mirrored = new Option(flags, global.description);
    if (global.parseArg) mirrored.argParser(global.parseArg);
    cmd.addOption(mirrored);
  }
}

for (const cmd of program.commands) mirrorGlobalOptions(cmd);

/**
 * Hoist any global given in the trailing position up to the program, so
 * every consumer reads one place.
 *
 * `optsWithGlobals()` merges ancestors OVER the command, so a mirrored
 * value would otherwise lose to the program's — including to the implicit
 * `true` that Commander gives a negated flag like `--no-registry`, which
 * would quietly re-enable the very write the user opted out of. Copying
 * upward before the action runs inverts that for explicitly-supplied
 * values only: `getOptionValueSource` distinguishes 'cli' from 'default',
 * and nothing that was merely defaulted is propagated.
 *
 * Array-valued globals (`--override`) are concatenated rather than
 * replaced, so `cairn -c a=1 query --override b=2` keeps both.
 */
program.hook('preAction', (_thisCommand, actionCommand) => {
  for (let cmd: Command | null = actionCommand; cmd !== null && cmd !== program; cmd = cmd.parent) {
    for (const global of GLOBAL_OPTIONS) {
      const key = global.attributeName();
      if (cmd.getOptionValueSource(key) !== 'cli') continue;
      const local = cmd.getOptionValue(key);
      const existing = program.getOptionValue(key);
      program.setOptionValue(
        key,
        Array.isArray(existing) && Array.isArray(local) ? [...existing, ...local] : local,
      );
    }
  }
});

program.parse();
