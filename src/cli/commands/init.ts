import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { getLibraryOverride } from '../helpers.js';

export function initCommand(): Command {
  const cmd = new Command('init')
    .description('Initialize a GVP library in the current project')
    .action(async () => {
      // For init, `--library <path>` means "initialize the library AT
      // this path" (the directory that will BE the library, not its
      // parent). This is symmetric with the read-command semantics:
      // the same path argument points at the same location for both
      // "make me a library here" and "read a library from here".
      //
      // When no --library is passed, fall back to the walk-back default
      // of `<cwd>/.gvp/library/` — matching how cairn has always
      // initialized new libraries.
      const libraryOverride = getLibraryOverride(cmd);
      const libDir = libraryOverride
        ? path.resolve(process.cwd(), libraryOverride)
        : path.join(process.cwd(), '.gvp', 'library');
      if (fs.existsSync(libDir)) {
        console.error(`${libDir} already exists`);
        process.exit(1);
      }
      fs.mkdirSync(libDir, { recursive: true });
      // Project name derivation: when a library path was provided,
      // use the last path segment of the library dir; otherwise use
      // the cwd basename (matching the previous behavior).
      const projectName = libraryOverride
        ? path.basename(libDir)
        : path.basename(process.cwd());
      const starter = `meta:\n  name: ${projectName}\n  scope: project\n\ngoals:\n  - id: G1\n    name: \n    statement: \n    tags: []\n    maps_to: []\n`;
      fs.writeFileSync(path.join(libDir, 'project.yaml'), starter);
      console.error(`Initialized GVP library at ${libDir}. Run 'cairn validate' to check it.`);
    });
  return cmd;
}
