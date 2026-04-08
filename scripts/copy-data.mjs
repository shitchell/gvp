#!/usr/bin/env node
/**
 * Copy non-TypeScript data files from src/ to dist/.
 *
 * tsc only compiles .ts files, so any resource referenced at runtime via
 * path.resolve(..., '../data/defaults.yaml') or similar must be copied
 * into dist/ separately. Without this step, dist/data/ drifts from
 * src/data/ and the installed package ships a stale defaults file.
 *
 * Current targets:
 *   src/data/defaults.yaml -> dist/data/defaults.yaml
 *
 * Add new entries here when introducing other non-TS data files.
 */

import { mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, '..');

const COPIES = [
  { from: 'src/data/defaults.yaml', to: 'dist/data/defaults.yaml' },
];

let copied = 0;
for (const { from, to } of COPIES) {
  const src = resolve(repoRoot, from);
  const dst = resolve(repoRoot, to);
  if (!existsSync(src)) {
    console.error(`[copy-data] source missing: ${from}`);
    process.exit(1);
  }
  mkdirSync(dirname(dst), { recursive: true });
  copyFileSync(src, dst);
  copied++;
}

console.log(`[copy-data] copied ${copied} file(s) from src/ to dist/`);
