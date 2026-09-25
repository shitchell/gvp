import type { Catalog } from '../../catalog/catalog.js';
import type { GVPConfig } from '../../config/schema.js';
import type { Diagnostic } from '../diagnostic.js';
import { createDiagnostic } from '../diagnostic.js';

const PASS_NAME = 'traceability';

/**
 * Does any library in play declare a value-anchor category? Checks the flat
 * merged registry first (the common case) and then each element-owning library's
 * own registry, so a category that only an ancestor declares — or one a
 * descendant overrode the flag off — still counts (DEC-2.12).
 */
function anyCategoryIsValueAnchor(catalog: Catalog): boolean {
  const hasAnchor = (registry: Catalog['registry']): boolean =>
    registry.categoryNames.some(name => registry.getByName(name)?.is_value_anchor);

  if (hasAnchor(catalog.registry)) return true;
  const sources = new Set(catalog.getAllElements().map(el => el.source));
  for (const source of sources) {
    if (hasAnchor(catalog.getRegistryForSource(source))) return true;
  }
  return false;
}

/**
 * Mapping rules compliance (VAL-2).
 * Checks that non-root elements map to appropriate categories per mapping_rules.
 *
 * Every category lookup here is keyed to the *element's own library* via
 * `catalog.categoryFor` (DEC-2.12, #27). An element is judged under the
 * definitions it was authored against, so a descendant library that tightens
 * `mapping_rules` cannot retroactively invalidate an ancestor's elements, and one
 * that loosens them cannot silently stop enforcing the ancestor's stricter
 * contract. That applies to the walked elements too, not just the starting one:
 * whether a node counts as a root (W014) or a value anchor (W017) is a question
 * about *that* node's library.
 */
export function traceabilityPass(catalog: Catalog, _config: GVPConfig): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  // Reference strings resolve through the catalog's unified resolver (meta.name +
  // alias + canonical, #11); BFS-queued hash keys look up via getElement.
  for (const element of catalog.getAllElements()) {
    if (element.status === 'deprecated' || element.status === 'rejected') continue;

    const catDef = catalog.categoryFor(element);
    if (!catDef || catDef.is_root) continue;
    if (!catDef.mapping_rules || catDef.mapping_rules.length === 0) continue;

    // mapping_rules is OR of AND groups: [[goal, value], [principle]]
    // means element must map to (goal AND value) OR (principle)
    const mappedCategories = new Set<string>();
    for (const ref of element.maps_to) {
      const target = catalog.resolveRef(ref, element);
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
    // "Is this a root?" is asked per element, not per category name: two
    // libraries may disagree about whether a category is a root, and each
    // library's own elements answer with its own definition (DEC-2.12).
    for (const element of catalog.getAllElements()) {
      if (element.status === 'deprecated' || element.status === 'rejected') continue;
      const catDef = catalog.categoryFor(element);
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

        const currentEl = catalog.getElement(current);
        if (!currentEl) continue;

        if (catalog.categoryFor(currentEl)?.is_root) {
          foundRoot = true;
          break;
        }

        for (const ref of currentEl.maps_to) {
          const target = catalog.resolveRef(ref, currentEl);
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

  // W017: Soft, transitive value anchor (#6). Non-root active elements should
  // trace transitively to at least one value-anchor category. When none is
  // reachable this is a *warning*, not an error: the acceptance value is often
  // authored later and lives upstream in an org/personal library, and
  // hard-erroring during incremental library-building forces a hollow local
  // value stub (C1/P6) — the exact smell we are avoiding. Suppressible;
  // --strict promotes. Dispatches on the is_value_anchor flag, not a name (R6).
  {
    // Only meaningful if a value-anchor category is declared *somewhere* in play.
    // The gate is deliberately catalog-wide while the per-node test below is
    // per-library: a catalog where no library has the concept at all should stay
    // silent, but once some library does, each element answers with its own
    // library's definition (DEC-2.12).
    if (anyCategoryIsValueAnchor(catalog)) {
      for (const element of catalog.getAllElements()) {
        if (element.status === 'deprecated' || element.status === 'rejected') continue;
        const catDef = catalog.categoryFor(element);
        if (!catDef || catDef.is_root) continue;
        if (element.maps_to.length === 0) continue; // W001 handles empty maps_to

        const visited = new Set<string>();
        const queue = [element.hashKey()];
        let foundValue = false;

        while (queue.length > 0) {
          const current = queue.pop()!;
          if (visited.has(current)) continue;
          visited.add(current);

          const currentEl = catalog.getElement(current);
          if (!currentEl) continue;

          // The starting element is non-root, so it can never be a value anchor
          // itself; any match is a genuine transitive ancestor.
          if (catalog.categoryFor(currentEl)?.is_value_anchor) {
            foundValue = true;
            break;
          }

          for (const ref of currentEl.maps_to) {
            const target = catalog.resolveRef(ref, currentEl);
            if (target && !visited.has(target.hashKey())) {
              queue.push(target.hashKey());
            }
          }
        }

        if (!foundValue) {
          diagnostics.push(createDiagnostic(
            'W017',
            'NO_VALUE_TRACE',
            `Element ${element.toLibraryId()} does not trace to any value transitively — ` +
              `the acceptance value for a constraint/requirement/exclusion-anchored element ` +
              `usually lives in an org/personal library; wire it up or add one`,
            'warning',
            PASS_NAME,
            { elementId: element.id, documentPath: element.documentPath, categoryName: element.categoryName },
          ));
        }
      }
    }
  }

  return diagnostics;
}
