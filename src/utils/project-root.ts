import * as fs from 'fs';
import * as path from 'path';
import type { Catalog } from '../catalog/catalog.js';

/**
 * Find the project root by walking up from the catalog's ENTRY (leaf) document.
 *
 * `catalog.documents` is in inheritance DFS order — ancestors first, the entry
 * (project's own) document LAST. We must walk up from the entry document, not
 * `documents[0]`: with external/path inheritance the first document is a deepest
 * inherited ancestor living OUTSIDE the project (e.g. under `~/.gvp/library`),
 * and walking up from there resolves to the wrong root (e.g. `$HOME`, because it
 * contains a `.gvp`). Refs being validated belong to the entry document, so its
 * location defines the project root.
 *
 * Project root is determined by:
 * 1. Parent of the .gvp directory (if found)
 * 2. Directory containing .git (fallback)
 * 3. null if neither found
 */
export function findProjectRoot(catalog: Catalog): string | null {
  const docs = catalog.documents;
  if (docs.length === 0) return null;

  const entryDoc = docs[docs.length - 1]!; // entry/leaf doc is last in DFS order
  let current = path.dirname(path.resolve(entryDoc.filePath));
  while (true) {
    // Check for .gvp directory — parent is project root
    if (fs.existsSync(path.join(current, '.gvp'))) {
      return current;
    }
    // Fallback: .git directory
    if (fs.existsSync(path.join(current, '.git'))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

/**
 * Find the project root from a directory path (not catalog).
 */
export function findProjectRootFromDir(startDir: string): string | null {
  let current = path.resolve(startDir);
  while (true) {
    if (fs.existsSync(path.join(current, '.gvp'))) {
      return current;
    }
    if (fs.existsSync(path.join(current, '.git'))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}
