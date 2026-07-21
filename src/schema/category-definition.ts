import { z } from 'zod';
import type { FieldSchemaEntry } from './field-schema.js';
import { fieldSchemaEntrySchema } from './field-schema.js';

/**
 * Category definition from defaults.yaml or user library (DOM-5).
 */
export interface CategoryDefinition {
  yaml_key: string;
  id_prefix: string;
  primary_field?: string;
  display_label?: string;
  color?: string;
  is_root?: boolean;
  /**
   * When true, a root of this category is an "actionable point-root": top-side
   * coverage (W018) expects at least one Decision to trace to it. Non-root
   * categories ignore this flag. `value` and `exclusion` deliberately omit it —
   * a value is a direction (not a point) and an exclusion is already its own
   * resolution. Drives W018 generically so no category names are hard-coded (R6).
   */
  requires_decision?: boolean;
  /**
   * Marks the "value axis" — a directional root (not a point) that derived
   * elements should trace to. Drives the soft, transitive value-anchor check
   * (W017) generically, so no category name is hard-coded (R6). Only `value`
   * carries this by default; a user library may designate its own.
   */
  is_value_anchor?: boolean;
  mapping_rules?: string[][];
  field_schemas?: Record<string, FieldSchemaEntry>;
  export_options?: Record<string, unknown>;
}

/** Zod schema for category definitions */
export const categoryDefinitionSchema: z.ZodType<CategoryDefinition> = z.object({
  yaml_key: z.string(),
  id_prefix: z.string(),
  primary_field: z.string().optional(),
  display_label: z.string().optional(),
  color: z.string().optional(),
  is_root: z.boolean().optional(),
  requires_decision: z.boolean().optional(),
  is_value_anchor: z.boolean().optional(),
  mapping_rules: z.array(z.array(z.string())).optional(),
  field_schemas: z.record(z.string(), fieldSchemaEntrySchema).optional(),
  export_options: z.record(z.string(), z.unknown()).optional(),
});

/**
 * The _all block that applies field_schemas to all categories.
 */
export interface AllFieldSchemas {
  field_schemas?: Record<string, FieldSchemaEntry>;
}

export const allFieldSchemasSchema = z.object({
  field_schemas: z.record(z.string(), fieldSchemaEntrySchema).optional(),
});

/**
 * The full defaults.yaml file structure.
 */
export interface DefaultsFile {
  _all?: AllFieldSchemas;
  categories: Record<string, CategoryDefinition>;
}

export const defaultsFileSchema = z.object({
  _all: allFieldSchemasSchema.optional(),
  categories: z.record(z.string(), categoryDefinitionSchema),
});
