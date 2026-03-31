import { z } from 'zod';
import type { FieldSchemaEntry } from './field-schema.js';
import { checkReservedFieldCollision, reservedFieldsSchema } from './reserved-fields.js';
import { buildZodSchema } from './build-schema.js';

interface BuildOptions {
  defaultTimezone?: string;
}

/**
 * Build a complete element Zod schema: reserved fields + dynamic fields (DEC-3.7).
 *
 * 1. Checks for reserved field collisions (DEC-3.2) — throws SchemaError
 * 2. Builds dynamic schema from field_schemas
 * 3. Merges reserved + dynamic into one flat Zod object schema
 *
 * The resulting schema validates a complete element in one pass.
 */
export function buildElementSchema(
  fieldSchemas: Record<string, FieldSchemaEntry>,
  options: BuildOptions = {},
): z.ZodObject<Record<string, z.ZodType>> {
  // Step 1: Check for collisions
  checkReservedFieldCollision(fieldSchemas);

  // Step 2: Build dynamic schema
  const dynamicSchema = buildZodSchema(fieldSchemas, options);

  // Step 3: Merge reserved + dynamic (flat namespace)
  // Use .extend() to add dynamic fields onto the reserved schema
  const combined = reservedFieldsSchema.extend(dynamicSchema.shape);

  // Allow extra fields (passthrough) so unknown fields don't cause errors
  return combined.passthrough() as z.ZodObject<Record<string, z.ZodType>>;
}
