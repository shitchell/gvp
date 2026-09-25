import type { Document } from '../model/document.js';
import type { CategoryDefinition } from '../schema/category-definition.js';
import type { FieldSchemaEntry } from '../schema/field-schema.js';

export interface SourceDefinitionSnapshot {
  categories: Record<string, CategoryDefinition>;
  tags: Record<string, { description: string }>;
  /** `_all` field schemas visible to this source (DEC-2.8, scoped per DEC-2.12) */
  allFieldSchemas: Record<string, FieldSchemaEntry>;
}

export interface MergedDefinitions {
  categories: Record<string, CategoryDefinition>;
  tags: Record<string, { description: string }>;
  allFieldSchemas: Record<string, FieldSchemaEntry>;
  sourceSnapshots: Map<string, SourceDefinitionSnapshot>;
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
 * Merge a set of documents' definitions in the given direction.
 * Shared by the global merge and each per-source snapshot so a snapshot is
 * always computed by exactly the same rules as the global view — only the
 * *set of documents in scope* differs (DEC-2.12).
 */
function mergeOver(
  orderedDocuments: Document[],
  definitionDirection: 'ancestor' | 'descendant',
): Omit<MergedDefinitions, 'sourceSnapshots'> {
  const mergedCategories: Record<string, CategoryDefinition> = {};
  const mergedTags: Record<string, { description: string }> = {};
  const mergedAll: Record<string, FieldSchemaEntry> = {};

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

    // Merge _all field_schemas from user documents (DEC-2.8)
    const docAllSchemas = (doc.meta.definitions as Record<string, unknown> | undefined)?._all;
    if (
      docAllSchemas &&
      typeof docAllSchemas === 'object' &&
      'field_schemas' in docAllSchemas
    ) {
      const schemas = (docAllSchemas as { field_schemas?: Record<string, FieldSchemaEntry> })
        .field_schemas;
      if (schemas) {
        Object.assign(mergedAll, schemas);
      }
    }
  }

  return { categories: mergedCategories, tags: mergedTags, allFieldSchemas: mergedAll };
}

/**
 * Source-level visibility (DEC-2.12): for each source, the set of sources whose
 * definitions it can see — itself plus its transitive inherited sources.
 *
 * Edges come from object-form `inherits` entries, which name an external source
 * library; `doc.source` for every document pulled from that library is the raw
 * source string from the entry (see the SourceLoader in src/cli/helpers.ts), so
 * `entry.source` and `doc.source` are directly comparable. String-form entries
 * name a document in the SAME source and so add no source-level edge.
 *
 * Deliberately NOT a prefix of `orderedDocuments`: that list is the DFS order of
 * one or more leaf documents concatenated, so a document's predecessors include
 * sibling branches and unrelated leaves that are not its ancestors at all.
 */
function buildSourceVisibility(orderedDocuments: Document[]): Map<string, Set<string>> {
  const parents = new Map<string, Set<string>>();
  const allSources = new Set<string>();

  for (const doc of orderedDocuments) {
    allSources.add(doc.source);
    const inherits = doc.meta.inherits;
    if (!Array.isArray(inherits)) continue;
    for (const entry of inherits) {
      if (typeof entry !== 'object' || entry === null || !('source' in entry)) continue;
      const parentSource = (entry as { source: unknown }).source;
      if (typeof parentSource !== 'string' || parentSource === doc.source) continue;
      const set = parents.get(doc.source) ?? new Set<string>();
      set.add(parentSource);
      parents.set(doc.source, set);
    }
  }

  const visibility = new Map<string, Set<string>>();
  for (const source of allSources) {
    // BFS over the parent graph. The `visited` set doubles as cycle protection —
    // inheritance cycles are broken rather than errored (DEC-1.8).
    const visible = new Set<string>([source]);
    const queue = [source];
    while (queue.length > 0) {
      const current = queue.pop()!;
      for (const parent of parents.get(current) ?? []) {
        if (visible.has(parent)) continue;
        visible.add(parent);
        queue.push(parent);
      }
    }
    visibility.set(source, visible);
  }

  return visibility;
}

/**
 * Merge category definitions across documents (DEC-2.1, DEC-2.2, DEC-2.7, DEC-2.8).
 *
 * Also computes the per-source snapshots that DEC-2.12 is built on: each source
 * gets the definitions *it* was authored under — its own, layered over those of
 * the sources it inherits — so that overriding a definition downstream does not
 * retroactively change the meaning of an ancestor library's elements. Sources a
 * library does not inherit (descendants, siblings, unrelated leaves) contribute
 * nothing to its snapshot.
 *
 * @param orderedDocuments - Documents in DFS order (ancestors first)
 * @param definitionDirection - 'ancestor' or 'descendant' (from config priority.definitions)
 */
export function mergeDefinitions(
  orderedDocuments: Document[],
  definitionDirection: 'ancestor' | 'descendant' = 'descendant',
): MergedDefinitions {
  const global = mergeOver(orderedDocuments, definitionDirection);

  const visibility = buildSourceVisibility(orderedDocuments);
  const sourceSnapshots = new Map<string, SourceDefinitionSnapshot>();
  for (const [source, visible] of visibility) {
    const scoped = orderedDocuments.filter(doc => visible.has(doc.source));
    sourceSnapshots.set(source, mergeOver(scoped, definitionDirection));
  }

  return { ...global, sourceSnapshots };
}
