import type { Catalog } from '../../catalog/catalog.js';
import type { GVPConfig } from '../../config/schema.js';
import type { Diagnostic } from '../diagnostic.js';
import { createDiagnostic } from '../diagnostic.js';
import * as fs from 'fs';
import * as path from 'path';

const PASS_NAME = 'coverage';

/** Patterns to exclude from source scanning */
const EXCLUDE_PATTERNS = [
  /node_modules/,
  /\/dist\//,
  /\.test\.[jt]sx?$/,
  /\.spec\.[jt]sx?$/,
  /__tests__\//,
];

/**
 * Coverage pass — bidirectional ref coverage check (W012, W013).
 * This is an optional pass, not part of the 5 canonical passes.
 * Only runs when explicitly requested.
 */
export function coveragePass(catalog: Catalog, config: GVPConfig): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  // Build set of all files referenced by any element
  const referencedFiles = new Set<string>();
  for (const element of catalog.getAllElements()) {
    const refs = element.get('refs') as Array<{ file: string; identifier: string; role: string }> | undefined;
    if (!refs || !Array.isArray(refs)) continue;
    for (const ref of refs) {
      referencedFiles.add(ref.file);
    }
  }

  // W012: Source file not referenced by any GVP element
  const sourceRoot = resolveSourceRoot(catalog, config);
  if (sourceRoot && fs.existsSync(sourceRoot)) {
    const projectRoot = findProjectRoot(catalog);
    if (projectRoot) {
      const sourceFiles = collectSourceFiles(sourceRoot);
      for (const absFile of sourceFiles) {
        const relFile = path.relative(projectRoot, absFile);
        if (!referencedFiles.has(relFile)) {
          diagnostics.push(createDiagnostic(
            'W012',
            'SOURCE_FILE_NOT_REFERENCED',
            `Source file not referenced by any GVP element: ${relFile}`,
            'warning',
            PASS_NAME,
            { details: relFile },
          ));
        }
      }
    }
  }

  // W013: GVP element has no code refs
  for (const element of catalog.getAllElements()) {
    if (element.status !== 'active') continue;

    const catDef = catalog.registry.getByName(element.categoryName);
    if (catDef?.is_root) continue;

    const refs = element.get('refs') as Array<{ file: string; identifier: string; role: string }> | undefined;
    if (!refs || !Array.isArray(refs) || refs.length === 0) {
      diagnostics.push(createDiagnostic(
        'W013',
        'ELEMENT_NO_REFS',
        `Element ${element.toLibraryId()} has no code refs`,
        'warning',
        PASS_NAME,
        { elementId: element.id, documentPath: element.documentPath },
      ));
    }
  }

  return diagnostics;
}

/**
 * Resolve the source root directory for coverage scanning.
 * Priority: config coverage.source_root > detect src/ relative to library root.
 */
function resolveSourceRoot(catalog: Catalog, config: GVPConfig): string | null {
  // Check for config-based source root
  const coverageConfig = (config as Record<string, unknown>).coverage as { source_root?: string } | undefined;
  if (coverageConfig?.source_root) {
    const projectRoot = findProjectRoot(catalog);
    if (projectRoot) {
      return path.resolve(projectRoot, coverageConfig.source_root);
    }
    return path.resolve(coverageConfig.source_root);
  }

  // Auto-detect: look for src/ relative to the project root
  const projectRoot = findProjectRoot(catalog);
  if (projectRoot) {
    const srcDir = path.join(projectRoot, 'src');
    if (fs.existsSync(srcDir)) {
      return srcDir;
    }
  }

  return null;
}

/**
 * Find the project root by walking up from the catalog's first document filePath.
 */
function findProjectRoot(catalog: Catalog): string | null {
  const docs = catalog.documents;
  if (docs.length === 0) return null;

  let current = path.dirname(path.resolve(docs[0]!.filePath));
  while (true) {
    if (fs.existsSync(path.join(current, '.git'))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

/**
 * Recursively collect source files, excluding test files, node_modules, and dist.
 */
function collectSourceFiles(dir: string): string[] {
  const files: string[] = [];

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      // Check exclusions
      if (EXCLUDE_PATTERNS.some(p => p.test(fullPath))) continue;

      if (entry.isDirectory()) {
        files.push(...collectSourceFiles(fullPath));
      } else if (entry.isFile()) {
        files.push(fullPath);
      }
    }
  } catch {
    // Directory read error — skip
  }

  return files;
}
