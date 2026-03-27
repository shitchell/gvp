import type { Catalog } from '../../catalog/catalog.js';
import type { GVPConfig } from '../../config/schema.js';
import type { Diagnostic } from '../diagnostic.js';
import { createDiagnostic } from '../diagnostic.js';
import { isStale } from '../../provenance/staleness.js';

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

  return diagnostics;
}
