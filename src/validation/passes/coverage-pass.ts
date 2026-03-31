import type { Catalog } from '../../catalog/catalog.js';
import type { GVPConfig } from '../../config/schema.js';
import type { Diagnostic } from '../diagnostic.js';
import { createDiagnostic } from '../diagnostic.js';
import { createRefParserRegistry } from '../../parsers/registry.js';
import { findProjectRoot } from '../../utils/project-root.js';
import { minimatch } from 'minimatch';
import * as fs from 'fs';
import * as path from 'path';

const PASS_NAME = 'coverage';

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
  const parsers = createRefParserRegistry();

  // Build set of all referenced file::identifier pairs
  const referencedPairs = new Set<string>();
  for (const element of catalog.getAllElements()) {
    const refs = element.get('refs') as Array<{ file: string; identifier: string }> | undefined;
    if (!refs) continue;
    for (const ref of refs) {
      referencedPairs.add(`${ref.file}::${ref.identifier}`);
    }
  }

  // W012: Orphan identifiers — parser-driven discovery
  const excludePatterns = config.coverage?.exclude ?? [];
  const projectRoot = findProjectRoot(catalog);
  if (projectRoot) {
    for (const parser of parsers) {
      const files = collectFilesByExtension(projectRoot, parser.extensions);

      for (const absFile of files) {
        const relFile = path.relative(projectRoot, absFile);
        if (EXCLUDE_PATTERNS.some(p => p.test(relFile))) continue;
        if (excludePatterns.some(pattern => minimatch(relFile, pattern, { dot: true }))) continue;

        try {
          const content = fs.readFileSync(absFile, 'utf-8');
          const identifiers = parser.extractIdentifiers(content);

          for (const { identifier } of identifiers) {
            const key = `${relFile}::${identifier}`;
            if (!referencedPairs.has(key)) {
              diagnostics.push(createDiagnostic(
                'W012',
                'ORPHAN_IDENTIFIER',
                `Identifier '${identifier}' in ${relFile} is not referenced by any GVP element`,
                'warning',
                PASS_NAME,
                { details: key },
              ));
            }
          }
        } catch {
          // File read error — skip
        }
      }
    }
  }

  // W013: Decision has no refs (scoped to decisions only)
  for (const element of catalog.getAllElements()) {
    if (element.status !== 'active') continue;
    if (element.categoryName !== 'decision') continue;

    const refs = element.get('refs') as Array<unknown> | undefined;
    if (!refs || !Array.isArray(refs) || refs.length === 0) {
      diagnostics.push(createDiagnostic(
        'W013',
        'DECISION_NO_REFS',
        `Decision ${element.toLibraryId()} has no refs`,
        'warning',
        PASS_NAME,
        { elementId: element.id, documentPath: element.documentPath, categoryName: element.categoryName },
      ));
    }
  }

  return diagnostics;
}

/**
 * Recursively collect files matching given extensions, excluding test/dist/node_modules.
 */
function collectFilesByExtension(dir: string, extensions: string[]): string[] {
  const files: string[] = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (EXCLUDE_PATTERNS.some(p => p.test(fullPath))) continue;
      if (entry.isDirectory()) {
        files.push(...collectFilesByExtension(fullPath, extensions));
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (extensions.includes(ext)) {
          files.push(fullPath);
        }
      }
    }
  } catch { /* skip unreadable dirs */ }
  return files;
}

