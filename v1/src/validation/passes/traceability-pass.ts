import type { Catalog } from '../../catalog/catalog.js';
import type { GVPConfig } from '../../config/schema.js';
import type { Diagnostic } from '../diagnostic.js';
import { createDiagnostic } from '../diagnostic.js';

const PASS_NAME = 'traceability';

/**
 * Mapping rules compliance (VAL-2).
 * Checks that non-root elements map to appropriate categories per mapping_rules.
 */
export function traceabilityPass(catalog: Catalog, _config: GVPConfig): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  // Build lookup: libraryId/hashKey -> element
  const elementLookup = new Map<string, import('../../model/element.js').Element>();
  for (const el of catalog.getAllElements()) {
    elementLookup.set(el.toLibraryId(), el);
    elementLookup.set(el.hashKey(), el);
  }

  for (const element of catalog.getAllElements()) {
    if (element.status === 'deprecated' || element.status === 'rejected') continue;

    const catDef = catalog.registry.getByName(element.categoryName);
    if (!catDef || catDef.is_root) continue;
    if (!catDef.mapping_rules || catDef.mapping_rules.length === 0) continue;

    // mapping_rules is OR of AND groups: [[goal, value], [principle]]
    // means element must map to (goal AND value) OR (principle)
    const mappedCategories = new Set<string>();
    for (const ref of element.maps_to) {
      const target = elementLookup.get(ref);
      if (target) {
        mappedCategories.add(target.categoryName);
      }
    }

    const satisfiesRules = catDef.mapping_rules.some(andGroup =>
      andGroup.every(requiredCat => mappedCategories.has(requiredCat)),
    );

    if (!satisfiesRules && element.maps_to.length > 0) {
      diagnostics.push(createDiagnostic(
        'W003',
        'MAPPING_RULES_VIOLATION',
        `Element ${element.toLibraryId()} does not satisfy mapping_rules for category '${element.categoryName}'`,
        'warning',
        PASS_NAME,
        { elementId: element.id, documentPath: element.documentPath, categoryName: element.categoryName },
      ));
    }
  }

  return diagnostics;
}
