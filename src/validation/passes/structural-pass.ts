import type { Catalog } from '../../catalog/catalog.js';
import type { GVPConfig } from '../../config/schema.js';
import type { Diagnostic } from '../diagnostic.js';
import { createDiagnostic } from '../diagnostic.js';
import type { FieldSchemaEntry } from '../../schema/field-schema.js';
import { collectReferenceSites } from '../../schema/reference-sites.js';

const PASS_NAME = 'structural';

/**
 * Broken references, undefined tags, ID gaps (VAL-1).
 */
export function structuralPass(catalog: Catalog, _config: GVPConfig): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  // E001: Broken references. Resolution goes through the catalog's unified
  // resolver (DEC-6.4 revised, #11): meta.name short refs + `as:` alias +
  // canonical hashKey, with ambiguity reported distinctly from not-found.
  for (const element of catalog.getAllElements()) {
    const checkRef = (ref: unknown, humanLoc: string, detailsKey?: string): void => {
      if (typeof ref !== 'string') return;
      const res = catalog.resolveRefResult(ref, element);
      if (res.status === 'ok') return;
      const tail = res.status === 'ambiguous'
        ? `but it is ambiguous across ${res.matches.length} libraries — qualify it with the inherited-source alias`
        : 'but no matching element was found';
      diagnostics.push(createDiagnostic(
        'E001',
        'BROKEN_REFERENCE',
        `Element ${element.toLibraryId()} references '${ref}' in ${humanLoc}, ${tail}`,
        'error',
        PASS_NAME,
        { elementId: element.id, documentPath: element.documentPath, ...(detailsKey ? { details: detailsKey } : {}) },
      ));
    };

    // Every reference-bearing array in the element — the reserved `maps_to`, any
    // top-level list<reference>, and the list<reference> sub-fields of list<model>
    // (procedure.steps) and dict<model> (decision.considered) containers — comes
    // from ONE shared walker, `collectReferenceSites`. It derives the answer
    // entirely from the declared field schemas (R6): no field-name list lives here.
    //
    // Sharing it with the importer is the point. #22 was this pass and the
    // importer each maintaining their own walker: the validator learned about the
    // `considered.*` tradeoff links, the importer never did (it walked list<model>
    // but not dict<model>), and unresolved pseudo-IDs were written to disk. Fixing
    // only the importer would have left the divergence that caused #22 intact, one
    // adoption site away. `declaredReferencePaths` + the per-category test in
    // tests/schema/reference-sites.test.ts guard the remaining risk: a container
    // shape the walker does not understand now fails a test instead of shipping.
    //
    // R13: the schemas are the ones the ELEMENT'S OWN library declares
    // (`getRegistryForSource(element.source)`), not the flat descendant-wins merge.
    // "Which of my fields hold element references" is a definition-derived property
    // of this element's category, so a descendant library redefining `field_schemas`
    // must not change which fields an ancestor's elements are checked against —
    // in either direction (a tightening descendant would invent E001s the ancestor
    // never authored; a loosening one would silently stop checking refs the
    // ancestor declared, which reports nothing at all).
    //
    // No `catDef` guard: the walker still finds the reserved `maps_to` and the
    // library-global `_all` field schemas for an element whose category its own
    // library does not define, which is the behaviour the previous hand-rolled
    // walk had for `maps_to` and the behaviour R13 wants for the rest.
    const elementRegistry = catalog.getRegistryForSource(element.source);
    const catDefE001 = elementRegistry.getByName(element.categoryName);
    const mergedSchemas: Record<string, FieldSchemaEntry> = {
      ...elementRegistry.allFieldSchemas,
      ...(catDefE001?.field_schemas ?? {}),
    };
    for (const site of collectReferenceSites(element.data, mergedSchemas)) {
      for (const ref of site.refs) {
        checkRef(ref, site.location, site.detailsKey);
      }
    }
  }

  // E005: Duplicate item id within any list<model> field with an id sub-field
  // (R1 precondition — ids must be unique within their parent scope).
  // Only fires on explicit duplicates; auto-assigned ids are sequential
  // and unique by construction.
  //
  // R13: element-keyed. Whether a container models an `id` sub-field at all is a
  // definition-derived property of THIS element's category, so it is read from the
  // element's own library. A descendant that redefines the container without an
  // `id` would otherwise stop E005 firing on an ancestor's genuine duplicates.
  for (const element of catalog.getAllElements()) {
    const registryE005 = catalog.getRegistryForSource(element.source);
    const catDefE005 = registryE005.getByName(element.categoryName);
    if (!catDefE005) continue;
    const mergedSchemasE005 = { ...registryE005.allFieldSchemas, ...(catDefE005.field_schemas ?? {}) };
    for (const [fieldName, schema] of Object.entries(mergedSchemasE005)) {
      if (schema.type !== 'list' || !schema.items || schema.items.type !== 'model') continue;
      if (!schema.items.fields?.id) continue;
      const items = element.get(fieldName) as Array<Record<string, unknown>> | undefined;
      if (!Array.isArray(items)) continue;
      const seen = new Set<string>();
      for (const item of items) {
        if (!item || typeof item !== 'object') continue;
        const id = item.id;
        if (typeof id !== 'string' || id.length === 0) continue;
        if (seen.has(id)) {
          diagnostics.push(createDiagnostic(
            'E005',
            'DUPLICATE_STEP_ID',
            `Element ${element.toLibraryId()} has duplicate ${fieldName} id '${id}'; ids must be unique within their parent`,
            'error',
            PASS_NAME,
            {
              elementId: element.id,
              documentPath: element.documentPath,
              details: `${fieldName}:${id}`,
            },
          ));
        }
        seen.add(id);
      }
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
    // Group elements by category within this document.
    //
    // R13: `id_prefix` is element-keyed, and R13's own "IT ALSO DECIDES" names this
    // scan explicitly — "whether the W009 id-prefix scan compares an element's id
    // against the merged `id_prefix` or the one its library declares (its
    // library's)". So the prefix comes from `catalog.categoryFor(element)`, and it is
    // carried on the group rather than looked up a second time by category name:
    // a name-keyed lookup has no owning element to resolve through, which is
    // precisely where the flat registry would creep back in.
    const categoryElements = new Map<string, string[]>();
    const prefixByCategory = new Map<string, string>();
    for (const element of doc.getAllElements()) {
      const catDef = catalog.categoryFor(element);
      if (!catDef) continue;

      const prefix = catDef.id_prefix;
      // Extract numeric suffix from ID (e.g., "G3" -> 3)
      const match = element.id.match(new RegExp(`^${escapeRegex(prefix)}(\\d+)$`));
      if (!match) continue;

      const ids = categoryElements.get(element.categoryName) ?? [];
      ids.push(element.id);
      categoryElements.set(element.categoryName, ids);
      prefixByCategory.set(element.categoryName, prefix);
    }

    for (const [categoryName, ids] of categoryElements) {
      // Set in lockstep with categoryElements above, so always present.
      const prefix = prefixByCategory.get(categoryName)!;

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

  // W016: Unrecognized YAML keys (not meta, not any known category yaml_key)
  for (const doc of catalog.documents) {
    for (const key of doc.unrecognizedKeys) {
      diagnostics.push(createDiagnostic(
        'W016',
        'UNRECOGNIZED_YAML_KEY',
        `Document '${doc.name}' has unrecognized top-level key '${key}' that does not match any category yaml_key`,
        'warning',
        PASS_NAME,
        { documentPath: doc.documentPath, details: key },
      ));
    }
  }

  // W019: Unrecognized `meta` keys, and unrecognized members of a
  // recognized `meta` sub-namespace (`registry.*`).
  //
  // R12: a recognized namespace accepts unknown members only with a
  // diagnostic. W016 above has done exactly this for a document's
  // TOP-LEVEL keys since long before R12 was written; `meta` was simply
  // never covered, which is why `meta.registry.enabled: false` validated
  // clean and did nothing at all (#25).
  //
  // Breadth: EVERY unrecognized `meta` key, not only those inside a
  // recognized namespace. R12 names "`meta` and its sub-keys" as
  // containers in their own right, and the narrower reading would leave
  // the plain misspelling — `meta.registery:` — silent, which is the
  // same no-op failure one letter away. A key kept deliberately (a
  // downstream tool's annotation riding on `meta`'s passthrough) is
  // served by `suppress_diagnostics: [W019]` under D7 — R12's own
  // answer: "the escape hatch for a deliberately unrecognised key is the
  // existing, explicit one rather than silence."
  //
  // Warning, not error, per H8: an unrecognized `meta` key cannot affect
  // the current output — it is inert by definition. It names the key and
  // stops (P14): no guess at what was meant.
  for (const doc of catalog.documents) {
    for (const key of doc.unrecognizedMetaKeys) {
      diagnostics.push(createDiagnostic(
        'W019',
        'UNRECOGNIZED_META_KEY',
        `Document '${doc.name}' has unrecognized meta key 'meta.${key}', which cairn reads no meaning from`,
        'warning',
        PASS_NAME,
        { documentPath: doc.documentPath, details: key },
      ));
    }
  }

  // E003: Broken inheritance — document references a parent that doesn't exist.
  // Inherits entries may reference parents by docPath, by source:docPath, or
  // by meta.name (the canonical convention). All three forms must resolve.
  for (const doc of catalog.documents) {
    if (!doc.meta.inherits) continue;
    const inherits = doc.meta.inherits as Array<string | { source: string; as?: string }>;
    for (const parent of inherits) {
      let found: boolean;
      let parentPath: string;
      if (typeof parent === 'string') {
        // String-form: a single document in the same library, referenced by
        // docPath, source:docPath, or meta.name.
        parentPath = parent;
        found = catalog.documents.some(d =>
          d.documentPath === parentPath ||
          d.source + ':' + d.documentPath === parentPath ||
          d.meta.name === parentPath
        );
      } else {
        // Object-form: names an external SOURCE LIBRARY. Every document
        // pulled from that source carries `source === parent.source`, so the
        // inheritance resolved iff at least one such document is present.
        parentPath = parent.source;
        found = catalog.documents.some(d => d.source === parentPath);
      }
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

  // E006: Document name (meta.name) must be unique within a library (one source).
  // The library short address `[<alias>:]<meta.name>:<id>` (#11) relies on this —
  // a duplicate makes references ambiguous, a broken foundation (P13/H8). The
  // effective name (meta.name, falling back to documentPath) is used, so a declared
  // name colliding with another document's path is also caught. Cross-library
  // duplicates are fine — they are disambiguated by the `as:` alias.
  {
    const namesBySource = new Map<string, Map<string, string[]>>();
    for (const doc of catalog.documents) {
      let names = namesBySource.get(doc.source);
      if (!names) { names = new Map(); namesBySource.set(doc.source, names); }
      const paths = names.get(doc.name) ?? [];
      paths.push(doc.documentPath);
      names.set(doc.name, paths);
    }
    for (const [source, names] of namesBySource) {
      for (const [name, paths] of names) {
        if (paths.length > 1) {
          diagnostics.push(createDiagnostic(
            'E006',
            'DUPLICATE_DOCUMENT_NAME',
            `Documents [${paths.join(', ')}] in library '${source}' all resolve to document name '${name}'; ` +
              `document names (meta.name) must be unique within a library`,
            'error',
            PASS_NAME,
            { details: `${source}:${name}` },
          ));
        }
      }
    }
  }

  return diagnostics;
}

/** Escape regex special characters in a string */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
