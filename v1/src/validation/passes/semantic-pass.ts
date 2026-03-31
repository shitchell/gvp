import type { Catalog } from '../../catalog/catalog.js';
import type { GVPConfig } from '../../config/schema.js';
import type { Diagnostic } from '../diagnostic.js';
import { createDiagnostic } from '../diagnostic.js';
import { isStale } from '../../provenance/staleness.js';
import { createRefParserRegistry, findParser } from '../../parsers/registry.js';
import * as fs from 'fs';
import * as path from 'path';

const PASS_NAME = 'semantic';

/**
 * Semantic warnings W001-W006 (VAL-4).
 */
export function semanticPass(catalog: Catalog, _config: GVPConfig): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  // Build lookup for resolving maps_to references
  const elementLookup = new Map<string, import('../../model/element.js').Element>();
  for (const el of catalog.getAllElements()) {
    elementLookup.set(el.toLibraryId(), el);
    elementLookup.set(el.hashKey(), el);
  }

  // W001: Empty maps_to on non-root active element (VAL-4)
  for (const element of catalog.getAllElements()) {
    if (element.status !== 'active') continue;
    if (element.maps_to.length > 0) continue;

    const catDef = catalog.registry.getByName(element.categoryName);
    if (!catDef || catDef.is_root) continue;

    // Non-root active element with no maps_to
    diagnostics.push(createDiagnostic(
      'W001',
      'EMPTY_MAPS_TO',
      `Element ${element.toLibraryId()} is a non-root active element with no maps_to references`,
      'warning',
      PASS_NAME,
      { elementId: element.id, documentPath: element.documentPath, categoryName: element.categoryName },
    ));
  }

  // W002: Empty document (no active elements)
  for (const doc of catalog.documents) {
    const activeElements = doc.getAllElements().filter(e => e.status === 'active');
    if (activeElements.length === 0) {
      diagnostics.push(createDiagnostic(
        'W002',
        'EMPTY_DOCUMENT',
        `Document '${doc.name}' contains no active elements`,
        'warning',
        PASS_NAME,
        { documentPath: doc.documentPath },
      ));
    }
  }

  // W005: Self-document-only mapping (DEC-5.5: always fires, suppress via diagnostic system)
  for (const element of catalog.getAllElements()) {
    if (element.status !== 'active') continue;
    if (element.maps_to.length === 0) continue;

    const catDef = catalog.registry.getByName(element.categoryName);
    if (catDef?.is_root) continue;

    const allSelfDocument = element.maps_to.every(ref => {
      const target = elementLookup.get(ref);
      return target && target.documentPath === element.documentPath;
    });

    if (allSelfDocument) {
      diagnostics.push(createDiagnostic(
        'W005',
        'SELF_DOCUMENT_MAPPING',
        `Element ${element.toLibraryId()} maps only to elements within its own document`,
        'warning',
        PASS_NAME,
        { elementId: element.id, documentPath: element.documentPath },
      ));
    }
  }

  // W006: Staleness — element has unreviewed non-skip-review updates (DEC-4.7)
  for (const element of catalog.getAllElements()) {
    if (element.status !== 'active') continue;

    if (isStale(element)) {
      diagnostics.push(createDiagnostic(
        'W006',
        'STALE_ELEMENT',
        `Element ${element.toLibraryId()} has unreviewed updates`,
        'warning',
        PASS_NAME,
        { elementId: element.id, documentPath: element.documentPath },
      ));
    }
  }

  // W010/W011: Ref file/identifier validation (DEC-10.5)
  // Determine project root by walking up from first document's filePath looking for .git/
  const projectRoot = findProjectRoot(catalog);
  if (projectRoot) {
    const parsers = createRefParserRegistry();

    for (const element of catalog.getAllElements()) {
      const refs = element.get('refs') as Array<{ file: string; identifier: string; role: string }> | undefined;
      if (!refs || !Array.isArray(refs)) continue;

      for (const ref of refs) {
        const absPath = path.resolve(projectRoot, ref.file);

        // W010: Ref file does not exist on disk
        if (!fs.existsSync(absPath)) {
          diagnostics.push(createDiagnostic(
            'W010',
            'REF_FILE_MISSING',
            `Element ${element.toLibraryId()} ref file does not exist: ${ref.file}`,
            'warning',
            PASS_NAME,
            { elementId: element.id, documentPath: element.documentPath, details: ref.file },
          ));
          continue;
        }

        // W011: Ref identifier not found in file
        if (ref.identifier) {
          const ext = path.extname(ref.file);
          const parser = findParser(ext, parsers);
          if (parser) {
            try {
              const content = fs.readFileSync(absPath, 'utf-8');
              const block = parser.extractBlock(content, ref.identifier);
              if (block === null) {
                diagnostics.push(createDiagnostic(
                  'W011',
                  'REF_IDENTIFIER_MISSING',
                  `Element ${element.toLibraryId()} ref identifier not found in ${ref.file}: ${ref.identifier}`,
                  'warning',
                  PASS_NAME,
                  { elementId: element.id, documentPath: element.documentPath, details: `${ref.file}::${ref.identifier}` },
                ));
              }
            } catch {
              // File read error — skip silently (W010 would have caught non-existent files)
            }
          }
        }
      }
    }
  }

  return diagnostics;
}

/**
 * Find the project root by walking up from the catalog's first document filePath
 * looking for a .git/ directory.
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
