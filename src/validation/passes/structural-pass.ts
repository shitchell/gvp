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

  // E001: Broken maps_to references (element-level)
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

    // E001 (extended): broken maps_to inside procedure steps. Step
    // maps_to uses the same traceability mechanism as element-level
    // maps_to — no new relationship type (D19). A typo in a step's
    // maps_to is just as much a broken reference as one at the
    // element level.
    const steps = element.get('steps') as
      | Array<Record<string, unknown>>
      | undefined;
    if (Array.isArray(steps)) {
      for (const step of steps) {
        if (!step || typeof step !== 'object') continue;
        const stepMapsTo = step.maps_to;
        if (!Array.isArray(stepMapsTo)) continue;
        for (const ref of stepMapsTo) {
          if (typeof ref !== 'string') continue;
          if (!knownIds.has(ref)) {
            diagnostics.push(createDiagnostic(
              'E001',
              'BROKEN_REFERENCE',
              `Element ${element.toLibraryId()} step '${step.id ?? step.name ?? '?'}' references '${ref}' in maps_to, but no matching element was found`,
              'error',
              PASS_NAME,
              {
                elementId: element.id,
                documentPath: element.documentPath,
                details: `step:${step.id ?? step.name ?? '?'}`,
              },
            ));
          }
        }
      }
    }

    // E001 (extended): broken references in procedure element-level
    // `related` — a list of element ids that apply to the procedure
    // as a whole but aren't specific steps.
    const related = element.get('related') as string[] | undefined;
    if (Array.isArray(related)) {
      for (const ref of related) {
        if (typeof ref !== 'string') continue;
        if (!knownIds.has(ref)) {
          diagnostics.push(createDiagnostic(
            'E001',
            'BROKEN_REFERENCE',
            `Element ${element.toLibraryId()} references '${ref}' in related, but no matching element was found`,
            'error',
            PASS_NAME,
            { elementId: element.id, documentPath: element.documentPath },
          ));
        }
      }
    }
  }

  // E005: Duplicate step id within a procedure (R1 precondition — ids
  // must be unique within their parent scope). Only fires on explicit
  // duplicates; auto-assigned ids are sequential and unique by
  // construction.
  for (const element of catalog.getAllElements()) {
    const steps = element.get('steps') as
      | Array<Record<string, unknown>>
      | undefined;
    if (!Array.isArray(steps)) continue;
    const seen = new Set<string>();
    for (const step of steps) {
      if (!step || typeof step !== 'object') continue;
      const id = step.id;
      if (typeof id !== 'string' || id.length === 0) continue;
      if (seen.has(id)) {
        diagnostics.push(createDiagnostic(
          'E005',
          'DUPLICATE_STEP_ID',
          `Element ${element.toLibraryId()} has duplicate step id '${id}'; step ids must be unique within their parent (R1 within procedure scope)`,
          'error',
          PASS_NAME,
          {
            elementId: element.id,
            documentPath: element.documentPath,
            details: `step:${id}`,
          },
        ));
      }
      seen.add(id);
    }
  }

  // W007: Undefined tags — element uses a tag not defined in its own library's documents (DEC-2.10: within-library scope)
  // Group tag definitions by source (library)
  const tagsBySource = new Map<string, Set<string>>();
  for (const doc of catalog.documents) {
    const docTags = doc.getTagDefinitions();
    if (!tagsBySource.has(doc.source)) {
      tagsBySource.set(doc.source, new Set());
    }
    const sourceTagSet = tagsBySource.get(doc.source)!;
    for (const tagName of Object.keys(docTags)) {
      sourceTagSet.add(tagName);
    }
  }
  for (const element of catalog.getAllElements()) {
    const sourceDefinedTags = tagsBySource.get(element.source) ?? new Set<string>();
    for (const tag of element.tags) {
      if (!sourceDefinedTags.has(tag)) {
        diagnostics.push(createDiagnostic(
          'W007',
          'UNDEFINED_TAG',
          `Element ${element.toLibraryId()} uses tag '${tag}' which is not defined in its library's tag definitions`,
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

  // E002: Duplicate element ID within a category in a document
  for (const doc of catalog.documents) {
    const seenIds = new Map<string, Set<string>>(); // category -> Set<id>
    for (const el of doc.getAllElements()) {
      if (!seenIds.has(el.categoryName)) seenIds.set(el.categoryName, new Set());
      const ids = seenIds.get(el.categoryName)!;
      if (ids.has(el.id)) {
        diagnostics.push(createDiagnostic(
          'E002',
          'DUPLICATE_ELEMENT_ID',
          `Document '${doc.name}' has duplicate ${el.categoryName} element ID '${el.id}'`,
          'error',
          PASS_NAME,
          { elementId: el.id, documentPath: doc.documentPath, categoryName: el.categoryName },
        ));
      }
      ids.add(el.id);
    }
  }

  // W008: Duplicate category definition within a single library (same source)
  {
    const catDefsBySource = new Map<string, Map<string, string[]>>(); // source -> (catName -> docPaths[])
    for (const doc of catalog.documents) {
      const docCats = doc.getCategoryDefinitions();
      for (const catName of Object.keys(docCats)) {
        if (!catDefsBySource.has(doc.source)) catDefsBySource.set(doc.source, new Map());
        const sourceCats = catDefsBySource.get(doc.source)!;
        if (!sourceCats.has(catName)) sourceCats.set(catName, []);
        sourceCats.get(catName)!.push(doc.documentPath);
      }
    }
    for (const [, sourceCats] of catDefsBySource) {
      for (const [catName, docPaths] of sourceCats) {
        if (docPaths.length > 1) {
          diagnostics.push(createDiagnostic(
            'W008',
            'DUPLICATE_CATEGORY_DEF',
            `Category '${catName}' is defined in multiple documents within the same library: ${docPaths.join(', ')}`,
            'warning',
            PASS_NAME,
            { categoryName: catName, details: docPaths.join(', ') },
          ));
        }
      }
    }
  }

  // E003: Broken inheritance — document references a parent that doesn't exist.
  // Inherits entries may reference parents by docPath, by source:docPath, or
  // by meta.name (the canonical convention). All three forms must resolve.
  for (const doc of catalog.documents) {
    if (!doc.meta.inherits) continue;
    const inherits = doc.meta.inherits as Array<string | { source: string; as?: string }>;
    for (const parent of inherits) {
      const parentPath = typeof parent === 'string' ? parent : parent.source;
      // The parent should be in the catalog's documents if inheritance resolved correctly.
      // If it's listed but not found, it's a broken reference.
      const found = catalog.documents.some(d =>
        d.documentPath === parentPath ||
        d.source + ':' + d.documentPath === parentPath ||
        d.meta.name === parentPath
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
