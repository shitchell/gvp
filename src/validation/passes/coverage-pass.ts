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

  // W013: Decision has no refs (scoped to *accepted* decisions only, #8).
  // A decision's disposition {accepted, declined, deferred} governs whether the
  // absence of refs is a coverage gap. Only `accepted` decisions are expected to
  // have produced artifacts; a `declined`/`deferred` decision's rationale +
  // considered alternatives ARE the record, so its lack of refs is encoded, not
  // a gap. Absent disposition ⇒ `accepted`, preserving legacy behavior.
  // Reading the decision category's declared `disposition` enum here is the
  // scoped R6 exception authorized by the coverage-gating decision (see #8).
  for (const element of catalog.getAllElements()) {
    if (element.status !== 'active') continue;
    if (element.categoryName !== 'decision') continue;

    const disposition = (element.get('disposition') as string | undefined) ?? 'accepted';
    if (disposition !== 'accepted') continue;

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

  // W018: Top-side root coverage (#8). Every root whose category declares
  // `requires_decision: true` is an "actionable point-root" that should have at
  // least one Decision tracing to it (any disposition — accept/decline/defer all
  // count as actioned). `value` (a direction, not a point) and `exclusion`
  // (already its own resolution) omit the flag and are exempt by construction.
  // Driven entirely by the schema flag, so no category names are hard-coded (R6).
  // Together with W012/W013 this closes the loop: nothing decreed goes silently
  // unaddressed; nothing built goes silently unjustified.
  {
    type El = import('../../model/element.js').Element;
    const byLibraryId = new Map<string, El>();
    const byHashKey = new Map<string, El>();
    for (const el of catalog.getAllElements()) {
      byLibraryId.set(el.toLibraryId(), el);
      byHashKey.set(el.hashKey(), el);
    }

    // Reverse adjacency: parent hashKey -> active child elements that map to it.
    const reverse = new Map<string, El[]>();
    for (const el of catalog.getAllElements()) {
      if (el.status !== 'active') continue;
      for (const ref of el.maps_to) {
        const parent = byLibraryId.get(ref) ?? byHashKey.get(ref);
        if (!parent) continue;
        const list = reverse.get(parent.hashKey()) ?? [];
        list.push(el);
        reverse.set(parent.hashKey(), list);
      }
    }

    for (const root of catalog.getAllElements()) {
      if (root.status !== 'active') continue;
      const catDef = catalog.registry.getByName(root.categoryName);
      if (!catDef?.requires_decision) continue;

      // Reverse BFS: does any active decision transitively trace up to this root?
      const visited = new Set<string>();
      const queue = [root.hashKey()];
      let covered = false;
      while (queue.length > 0) {
        const current = queue.pop()!;
        if (visited.has(current)) continue;
        visited.add(current);
        for (const child of reverse.get(current) ?? []) {
          if (child.categoryName === 'decision') { covered = true; break; }
          queue.push(child.hashKey());
        }
        if (covered) break;
      }

      if (!covered) {
        diagnostics.push(createDiagnostic(
          'W018',
          'ROOT_NO_DECISION',
          `Root ${root.toLibraryId()} has no Decision tracing to it — ` +
            `it may be decreed-but-unaddressed; record an accepted/declined/deferred decision`,
          'warning',
          PASS_NAME,
          { elementId: root.id, documentPath: root.documentPath, categoryName: root.categoryName },
        ));
      }
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

