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

    // Note: elements with empty maps_to are handled by W001 (EMPTY_MAPS_TO) in the
    // semantic pass, not W003 here. This is intentional delegation — W003 only fires
    // when maps_to is non-empty but doesn't satisfy the mapping_rules for the category.
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

  // W014: Transitive traceability — non-root active elements must trace to at least one root element (R3)
  {
    // Identify root categories
    const rootCategories = new Set<string>();
    for (const catName of catalog.registry.categoryNames) {
      const catDef = catalog.registry.getByName(catName);
      if (catDef?.is_root) rootCategories.add(catName);
    }

    for (const element of catalog.getAllElements()) {
      if (element.status === 'deprecated' || element.status === 'rejected') continue;
      const catDef = catalog.registry.getByName(element.categoryName);
      if (!catDef || catDef.is_root) continue;
      if (element.maps_to.length === 0) continue; // W001 handles this

      // BFS/DFS walk through maps_to graph to find a root element
      const visited = new Set<string>();
      const queue = [element.hashKey()];
      let foundRoot = false;

      while (queue.length > 0) {
        const current = queue.pop()!;
        if (visited.has(current)) continue;
        visited.add(current);

        const currentEl = elementLookup.get(current);
        if (!currentEl) continue;

        if (rootCategories.has(currentEl.categoryName)) {
          foundRoot = true;
          break;
        }

        for (const ref of currentEl.maps_to) {
          const target = elementLookup.get(ref);
          if (target && !visited.has(target.hashKey())) {
            queue.push(target.hashKey());
          }
        }
      }

      if (!foundRoot) {
        diagnostics.push(createDiagnostic(
          'W014',
          'NO_ROOT_TRACE',
          `Element ${element.toLibraryId()} cannot trace to any root element transitively`,
          'warning',
          PASS_NAME,
          { elementId: element.id, documentPath: element.documentPath, categoryName: element.categoryName },
        ));
      }
    }
  }

  return diagnostics;
}
