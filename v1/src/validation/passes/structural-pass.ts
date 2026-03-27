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

  // E001: Broken maps_to references
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

  // W007: Undefined tags — element uses a tag not defined in any document's meta.definitions.tags
  const definedTags = new Set<string>(Object.keys(catalog.getTags()));
  for (const element of catalog.getAllElements()) {
    for (const tag of element.tags) {
      if (!definedTags.has(tag)) {
        diagnostics.push(createDiagnostic(
          'W007',
          'UNDEFINED_TAG',
          `Element ${element.toLibraryId()} uses tag '${tag}' which is not defined in any document's tag definitions`,
          'warning',
          PASS_NAME,
          { elementId: element.id, documentPath: element.documentPath },
        ));
      }
    }
  }

  // W009: ID sequence gaps within a category in a document
  for (const doc of catalog.documents) {
    // Group elements by category within this document
    const categoryElements = new Map<string, string[]>();
    for (const element of doc.getAllElements()) {
      const catDef = catalog.registry.getByName(element.categoryName);
      if (!catDef) continue;

      const prefix = catDef.id_prefix;
      // Extract numeric suffix from ID (e.g., "G3" -> 3)
      const match = element.id.match(new RegExp(`^${escapeRegex(prefix)}(\\d+)$`));
      if (!match) continue;

      const ids = categoryElements.get(element.categoryName) ?? [];
      ids.push(element.id);
      categoryElements.set(element.categoryName, ids);
    }

    for (const [categoryName, ids] of categoryElements) {
      const catDef = catalog.registry.getByName(categoryName);
      if (!catDef) continue;
      const prefix = catDef.id_prefix;

      // Extract and sort numeric suffixes
      const nums = ids
        .map(id => {
          const m = id.match(new RegExp(`^${escapeRegex(prefix)}(\\d+)$`));
          return m ? parseInt(m[1]!, 10) : null;
        })
        .filter((n): n is number => n !== null)
        .sort((a, b) => a - b);

      if (nums.length < 2) continue;

      // Check for gaps
      for (let i = 1; i < nums.length; i++) {
        if (nums[i]! - nums[i - 1]! > 1) {
          const missingStart = nums[i - 1]! + 1;
          const missingEnd = nums[i]! - 1;
          const missingRange = missingStart === missingEnd
            ? `${prefix}${missingStart}`
            : `${prefix}${missingStart}-${prefix}${missingEnd}`;
          diagnostics.push(createDiagnostic(
            'W009',
            'ID_SEQUENCE_GAP',
            `Document '${doc.name}' has gap in ${categoryName} IDs: missing ${missingRange}`,
            'warning',
            PASS_NAME,
            { documentPath: doc.documentPath, categoryName },
          ));
        }
      }
    }
  }

  // E003: Broken inheritance — document references a parent that doesn't exist
  const knownDocPaths = new Set<string>();
  for (const doc of catalog.documents) {
    knownDocPaths.add(doc.documentPath);
    knownDocPaths.add(doc.source + ':' + doc.documentPath);
  }
  for (const doc of catalog.documents) {
    if (!doc.meta.inherits) continue;
    const inherits = doc.meta.inherits as Array<string | { source: string; as?: string }>;
    for (const parent of inherits) {
      const parentPath = typeof parent === 'string' ? parent : parent.source;
      // The parent should be in the catalog's documents if inheritance resolved correctly.
      // If it's listed but not found, it's a broken reference.
      const found = catalog.documents.some(d =>
        d.documentPath === parentPath ||
        d.source + ':' + d.documentPath === parentPath
      );
      if (!found) {
        diagnostics.push(createDiagnostic(
          'E003',
          'BROKEN_INHERITANCE',
          `Document '${doc.name}' inherits from '${parentPath}' which does not exist in the catalog`,
          'error',
          PASS_NAME,
          { documentPath: doc.documentPath },
        ));
      }
    }
  }

  return diagnostics;
}

/** Escape regex special characters in a string */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
