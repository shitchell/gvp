import * as yaml from 'js-yaml';
import { documentMetaSchema } from './document-meta.js';
import { Document } from './document.js';
import { Element } from './element.js';
import type { CategoryRegistry } from './category-registry.js';
import { ValidationError } from '../errors.js';

/**
 * Parse a GVP YAML document string into a Document object.
 *
 * Steps:
 * 1. Parse YAML
 * 2. Extract and validate meta block
 * 3. For each recognized yaml_key, parse elements against category schema
 * 4. Apply document-level defaults (DEC-2.5: per-document only, no cascade)
 */
export function parseDocument(
  yamlContent: string,
  filePath: string,
  documentPath: string,
  source: string,
  registry: CategoryRegistry,
): Document {
  const raw = yaml.load(yamlContent);
  if (!raw || typeof raw !== 'object') {
    throw new ValidationError(`Document at ${filePath} must be a YAML mapping`);
  }
  const data = raw as Record<string, unknown>;

  // Extract and validate meta
  const rawMeta = data.meta ?? {};
  const meta = documentMetaSchema.parse(rawMeta);

  // Parse elements by category
  const elementsByCategory = new Map<string, Element[]>();
  // Track which procedure elements received auto-assigned step ids.
  // Consumed by the semantic pass to emit W015.
  const autoAssignedStepIds = new Set<string>();

  for (const yamlKey of registry.allYamlKeys) {
    const rawElements = data[yamlKey];
    if (!rawElements || !Array.isArray(rawElements)) continue;

    const categoryLookup = registry.getByYamlKey(yamlKey);
    if (!categoryLookup) continue;

    const { name: categoryName } = categoryLookup;
    const schema = registry.getElementSchema(categoryName);
    const elements: Element[] = [];

    for (let i = 0; i < rawElements.length; i++) {
      const rawElement = rawElements[i];
      if (!rawElement || typeof rawElement !== 'object') {
        throw new ValidationError(
          `Element at ${filePath}:${yamlKey}[${i}] must be a YAML mapping`
        );
      }

      // Apply document-level defaults (DEC-2.5: element fields win)
      const withDefaults = meta.defaults
        ? { ...meta.defaults, ...rawElement }
        : rawElement;

      // Auto-assign item ids for any list<model> field whose model has
      // an optional id sub-field. D19: display-stable dotted ids of the
      // form `{parent.id}.{N}` (1-indexed sequential). Persisting these
      // back to YAML is required for R1 preservation across item
      // deletions; the semantic pass emits W015 when auto-assignment
      // occurred.
      const processed = maybeAutoAssignModelIds(
        withDefaults,
        categoryName,
        registry,
        autoAssignedStepIds,
      );

      // Validate against category schema
      try {
        const validated = schema.parse(processed);
        elements.push(new Element(validated as Record<string, unknown>, categoryName, source, documentPath));
      } catch (e) {
        throw new ValidationError(
          `Invalid element at ${filePath}:${yamlKey}[${i}] (${(rawElement as Record<string, unknown>).id ?? 'unknown'}): ${(e as Error).message}`
        );
      }
    }

    elementsByCategory.set(categoryName, elements);
  }

  // Detect unrecognized top-level YAML keys (not meta, not any known category yaml_key)
  const knownKeys = new Set(['meta', ...registry.allYamlKeys]);
  const unrecognizedKeys = Object.keys(data).filter(k => !knownKeys.has(k));

  return new Document(
    meta,
    elementsByCategory,
    filePath,
    documentPath,
    source,
    autoAssignedStepIds,
    unrecognizedKeys,
  );
}

/**
 * For any list<model> field in the element's category whose model has an
 * optional `id` sub-field, fill in items that lack an explicit `id` with
 * `{element.id}.{N}` (1-indexed). The returned object is a shallow copy
 * with updated arrays; the input is not mutated. Records the element id
 * in `autoAssignedStepIds` if any item received a generated id.
 *
 * Categories without qualifying list<model> fields pass through unchanged.
 */
function maybeAutoAssignModelIds(
  element: unknown,
  categoryName: string,
  registry: CategoryRegistry,
  autoAssignedStepIds: Set<string>,
): unknown {
  if (!element || typeof element !== 'object') return element;
  const elementObj = element as Record<string, unknown>;
  const parentId = elementObj.id;
  if (typeof parentId !== 'string' || parentId.length === 0) return element;

  const catDef = registry.getByName(categoryName);
  if (!catDef) return element;
  const mergedSchemas = { ...registry.allFieldSchemas, ...(catDef.field_schemas ?? {}) };

  let anyChanged = false;
  const result = { ...elementObj };

  for (const [fieldName, schema] of Object.entries(mergedSchemas)) {
    if (schema.type !== 'list' || !schema.items || schema.items.type !== 'model') continue;
    // Only auto-assign if the model has an optional id field
    const idField = schema.items.fields?.id;
    if (!idField || idField.required) continue;

    const items = elementObj[fieldName];
    if (!Array.isArray(items)) continue;

    let anyFieldAutoAssigned = false;
    const nextItems = items.map((item, idx) => {
      if (!item || typeof item !== 'object') return item;
      const itemObj = item as Record<string, unknown>;
      if (typeof itemObj.id === 'string' && itemObj.id.length > 0) return item;
      anyFieldAutoAssigned = true;
      return { ...itemObj, id: `${parentId}.${idx + 1}` };
    });

    if (anyFieldAutoAssigned) {
      anyChanged = true;
      result[fieldName] = nextItems;
    }
  }

  if (!anyChanged) return element;
  autoAssignedStepIds.add(parentId);
  return result;
}

/**
 * Load and parse a GVP YAML document from a file path.
 */
export function loadDocumentFromFile(
  filePath: string,
  documentPath: string,
  source: string,
  registry: CategoryRegistry,
): Document {
  const fs = require('fs') as typeof import('fs');
  const content = fs.readFileSync(filePath, 'utf-8');
  return parseDocument(content, filePath, documentPath, source, registry);
}
