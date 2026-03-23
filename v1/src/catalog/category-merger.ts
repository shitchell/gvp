import type { Document } from '../model/document.js';
import type { CategoryDefinition } from '../schema/category-definition.js';
import type { FieldSchemaEntry } from '../schema/field-schema.js';

export interface LibraryDefinitionSnapshot {
  categories: Record<string, CategoryDefinition>;
  tags: Record<string, { description: string }>;
}

export interface MergedDefinitions {
  categories: Record<string, CategoryDefinition>;
  tags: Record<string, { description: string }>;
  allFieldSchemas: Record<string, FieldSchemaEntry>;
  librarySnapshots: Map<string, LibraryDefinitionSnapshot>;
}

/**
 * Deep merge field_schemas: target is base, source overrides (DEC-2.2).
 */
function deepMergeFieldSchemas(
  base: Record<string, FieldSchemaEntry>,
  override: Record<string, FieldSchemaEntry>,
): Record<string, FieldSchemaEntry> {
  return { ...base, ...override };
}

/**
 * Merge category definitions across documents (DEC-2.1, DEC-2.2, DEC-2.7, DEC-2.8).
 *
 * @param orderedDocuments - Documents in DFS order (ancestors first)
 * @param definitionDirection - 'ancestor' or 'descendant' (from config priority.definitions)
 */
export function mergeDefinitions(
  orderedDocuments: Document[],
  definitionDirection: 'ancestor' | 'descendant' = 'descendant',
): MergedDefinitions {
  const mergedCategories: Record<string, CategoryDefinition> = {};
  const mergedTags: Record<string, { description: string }> = {};
  const mergedAll: Record<string, FieldSchemaEntry> = {};
  const librarySnapshots = new Map<string, LibraryDefinitionSnapshot>();

  // Iterate in the direction where the winner comes LAST
  // descendant-wins: iterate ancestors first, descendants overwrite
  // ancestor-wins: iterate descendants first, ancestors overwrite
  const docs =
    definitionDirection === 'descendant'
      ? orderedDocuments // ancestors first, descendants overwrite
      : [...orderedDocuments].reverse(); // descendants first, ancestors overwrite

  for (const doc of docs) {
    // Merge category definitions from this document
    const docCategories = doc.getCategoryDefinitions();
    for (const [name, def] of Object.entries(docCategories)) {
      if (mergedCategories[name]) {
        // Deep merge field_schemas
        const existingSchemas = mergedCategories[name]!.field_schemas ?? {};
        const newSchemas = def.field_schemas ?? {};
        mergedCategories[name] = {
          ...mergedCategories[name]!,
          ...def,
          field_schemas:
            Object.keys(existingSchemas).length || Object.keys(newSchemas).length
              ? deepMergeFieldSchemas(existingSchemas, newSchemas)
              : undefined,
        };
      } else {
        mergedCategories[name] = { ...def };
      }
    }

    // Merge tag definitions
    const docTags = doc.getTagDefinitions();
    for (const [name, tag] of Object.entries(docTags)) {
      mergedTags[name] = tag;
    }

    // Capture per-library snapshot (DEC-2.12)
    if (!librarySnapshots.has(doc.source)) {
      librarySnapshots.set(doc.source, {
        categories: { ...mergedCategories },
        tags: { ...mergedTags },
      });
    }
  }

  return {
    categories: mergedCategories,
    tags: mergedTags,
    allFieldSchemas: mergedAll,
    librarySnapshots,
  };
}
