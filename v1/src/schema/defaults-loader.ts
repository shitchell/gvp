import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import * as yaml from 'js-yaml';
import { z } from 'zod';
import type { FieldSchemaEntry } from './field-schema.js';
import type { CategoryDefinition, DefaultsFile } from './category-definition.js';
import { defaultsFileSchema } from './category-definition.js';
import { buildElementSchema } from './combined-schema.js';
import { RESERVED_FIELD_NAMES } from './reserved-fields.js';

/**
 * Load and validate the built-in defaults.yaml (DEC-9.4).
 * Uses the same YAML -> Zod pipeline as user files.
 */
export function loadDefaults(): DefaultsFile {
  // Resolve path relative to this source file
  let resolvedPath: string;
  try {
    const thisDir = path.dirname(fileURLToPath(import.meta.url));
    resolvedPath = path.resolve(thisDir, '../data/defaults.yaml');
  } catch {
    // Fallback for CJS contexts where import.meta.url may not be available
    resolvedPath = path.resolve(__dirname, '../data/defaults.yaml');
  }

  const content = fs.readFileSync(resolvedPath, 'utf-8');
  const parsed = yaml.load(content);
  return defaultsFileSchema.parse(parsed);
}

/**
 * Merge _all field_schemas with per-category field_schemas (DEC-2.8).
 * Per-category fields win on collision.
 */
export function mergeAllFieldSchemas(
  allSchemas: Record<string, FieldSchemaEntry>,
  categorySchemas: Record<string, FieldSchemaEntry> | undefined,
): Record<string, FieldSchemaEntry> {
  if (!categorySchemas) {
    return { ...allSchemas };
  }
  // _all provides the base; per-category overrides on collision
  return { ...allSchemas, ...categorySchemas };
}

/**
 * Build a complete element Zod schema for a category (convenience function).
 * Merges _all + per-category field_schemas, then builds the element schema.
 */
export function buildCategoryElementSchema(
  categoryDef: CategoryDefinition,
  allFieldSchemas: Record<string, FieldSchemaEntry>,
  options?: { defaultTimezone?: string },
): z.ZodObject<Record<string, z.ZodType>> {
  const merged = mergeAllFieldSchemas(allFieldSchemas, categoryDef.field_schemas);
  // Filter out reserved fields — they are already defined by reservedFieldsSchema.
  // The _all block may declare them for documentation/dogfooding, but buildElementSchema
  // enforces that field_schemas cannot collide with reserved fields (DEC-3.2).
  const filtered: Record<string, FieldSchemaEntry> = {};
  for (const [key, value] of Object.entries(merged)) {
    if (!RESERVED_FIELD_NAMES.has(key)) {
      filtered[key] = value;
    }
  }
  return buildElementSchema(filtered, options);
}
