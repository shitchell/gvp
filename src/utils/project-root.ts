import * as fs from 'fs';
import * as path from 'path';
import type { Catalog } from '../catalog/catalog.js';

/**
 * Find the project root by walking up from the catalog's first document.
 * Project root is determined by:
 * 1. Parent of the .gvp directory (if found)
 * 2. Directory containing .git (fallback)
 * 3. null if neither found
 */
export function findProjectRoot(catalog: Catalog): string | null {
  const docs = catalog.documents;
  if (docs.length === 0) return null;

  let current = path.dirname(path.resolve(docs[0]!.filePath));
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
