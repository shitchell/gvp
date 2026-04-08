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

      // Auto-assign step ids for procedure elements whose steps lack
      // explicit ids. D19: display-stable dotted ids of the form
      // `{parent.id}.{N}` (1-indexed sequential). Persisting these back
      // to YAML is required for R1 preservation across step deletions;
      // the semantic pass emits W015 when auto-assignment occurred.
      const processed = maybeAutoAssignStepIds(
        withDefaults,
        categoryName,
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

  return new Document(
    meta,
    elementsByCategory,
    filePath,
    documentPath,
    source,
    autoAssignedStepIds,
  );
}

/**
 * If the element is a `procedure` and has `steps`, fill in any step
 * that lacks an explicit `id` with `{element.id}.{N}` (1-indexed). The
 * returned object is a shallow copy with a new steps array; the input
 * is not mutated. Records the element id in `autoAssignedStepIds` if
 * any step received a generated id.
 *
 * Non-procedure categories pass through unchanged.
 */
function maybeAutoAssignStepIds(
  element: unknown,
  categoryName: string,
  autoAssignedStepIds: Set<string>,
): unknown {
  if (categoryName !== 'procedure') return element;
  if (!element || typeof element !== 'object') return element;
  const elementObj = element as Record<string, unknown>;
  const steps = elementObj.steps;
  if (!Array.isArray(steps)) return element;
  const parentId = elementObj.id;
  if (typeof parentId !== 'string' || parentId.length === 0) return element;

  let anyAutoAssigned = false;
  const nextSteps = steps.map((step, idx) => {
    if (!step || typeof step !== 'object') return step;
    const stepObj = step as Record<string, unknown>;
    if (typeof stepObj.id === 'string' && stepObj.id.length > 0) {
      return step;
    }
    anyAutoAssigned = true;
    return { ...stepObj, id: `${parentId}.${idx + 1}` };
  });

  if (!anyAutoAssigned) return element;

  autoAssignedStepIds.add(parentId);
  return { ...elementObj, steps: nextSteps };
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
