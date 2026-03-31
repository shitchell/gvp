import { z } from 'zod';
import type { FieldType } from './types.js';
import { FIELD_TYPES } from './types.js';

/**
 * A field schema entry from field_schemas definitions.
 * Per DEC-3.3b, DEC-3.10, DEC-3.12, DEC-10.11.
 */
export interface FieldSchemaEntry {
  type: FieldType;
  required?: boolean;
  display_name?: string;
  /** For 'list' type — element schema (DEC-3.10) */
  items?: FieldSchemaEntry;
  /** For 'dict' type — value schema (DEC-3.10). For 'enum' type — allowed values (DEC-10.11). */
  values?: FieldSchemaEntry | string[];
  /** For 'model' type — nested field definitions (DEC-3.12) */
  fields?: Record<string, FieldSchemaEntry>;
}

/**
 * Recursive Zod schema that validates raw YAML field_schemas entries
 * into FieldSchemaEntry objects.
 */
export const fieldSchemaEntrySchema: z.ZodType<FieldSchemaEntry> = z.lazy(() =>
  z.object({
    type: z.enum(FIELD_TYPES as unknown as [string, ...string[]]) as unknown as z.ZodType<FieldType>,
    required: z.boolean().optional(),
    display_name: z.string().optional(),
    items: fieldSchemaEntrySchema.optional(),
    values: z.union([
      z.array(z.string()),       // enum values
      fieldSchemaEntrySchema,    // dict value schema
    ]).optional(),
    fields: z.record(z.string(), fieldSchemaEntrySchema).optional(),
  })
);
