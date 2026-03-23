import type { Catalog } from '../../catalog/catalog.js';
import type { GVPConfig } from '../../config/schema.js';
import type { Diagnostic } from '../diagnostic.js';
import { createDiagnostic } from '../diagnostic.js';

const PASS_NAME = 'structural';

/**
 * Broken references, undefined tags, ID gaps (VAL-1).
 */
export function structuralPass(catalog: Catalog, _config: GVPConfig): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  // Build a set of all known element identifiers for fast lookup
  const knownIds = new Set<string>();
  for (const element of catalog.getAllElements()) {
    knownIds.add(element.toLibraryId());
    knownIds.add(element.hashKey());
  }

  // Check for broken maps_to references
  for (const element of catalog.getAllElements()) {
    for (const ref of element.maps_to) {
      if (!knownIds.has(ref)) {
        diagnostics.push(createDiagnostic(
          'E001',
          'BROKEN_REFERENCE',
          `Element ${element.toLibraryId()} references '${ref}' in maps_to, but no matching element was found`,
          'error',
          PASS_NAME,
          { elementId: element.id, documentPath: element.documentPath },
        ));
      }
    }
  }

  return diagnostics;
}
