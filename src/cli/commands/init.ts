import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';

export function initCommand(): Command {
  const cmd = new Command('init')
    .description('Initialize a GVP library in the current project')
    .action(async () => {
      const libDir = path.join(process.cwd(), '.gvp', 'library');
      if (fs.existsSync(libDir)) {
        console.error('.gvp/library/ already exists');
        process.exit(1);
      }
      fs.mkdirSync(libDir, { recursive: true });
      const projectName = path.basename(process.cwd());
      const starter = `meta:\n  name: ${projectName}\n  scope: project\n\ngoals:\n  - id: G1\n    name: \n    statement: \n    tags: []\n    maps_to: []\n`;
      fs.writeFileSync(path.join(libDir, 'project.yaml'), starter);
      console.error(`Initialized GVP library at ${libDir}`);
    });
  return cmd;
}
