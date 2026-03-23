import { z } from 'zod';
import { SchemaError } from '../errors.js';
import type { FieldSchemaEntry } from './field-schema.js';

/**
 * Reserved field names that cannot be redefined by field_schemas (DEC-3.2).
 * These are structural fields owned by GVP core.
 */
export const RESERVED_FIELD_NAMES: ReadonlySet<string> = new Set([
  'id', 'name', 'status', 'tags', 'maps_to',
  'origin', 'updated_by', 'reviewed_by', 'priority',
]);

/** Check if a field name is reserved */
export function isReservedField(name: string): boolean {
  return RESERVED_FIELD_NAMES.has(name);
}

/**
 * Throw SchemaError if any field_schemas key collides with a reserved field (DEC-3.2).
 * Called during catalog construction.
 */
export function checkReservedFieldCollision(
  fieldSchemas: Record<string, FieldSchemaEntry>,
): void {
  for (const key of Object.keys(fieldSchemas)) {
    if (RESERVED_FIELD_NAMES.has(key)) {
      throw new SchemaError(
        `Field '${key}' is reserved and cannot be redefined in field_schemas. ` +
        `Reserved fields: ${[...RESERVED_FIELD_NAMES].join(', ')}`
      );
    }
  }
}

/**
 * Zod schema for reserved/structural fields on every element (DEC-3.2, DEC-3.7).
 * Provenance fields use z.unknown() as placeholders — refined in Phase 9.
 */
export const reservedFieldsSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: z.string().default('active'),
  tags: z.array(z.string()).optional().default([]),
  maps_to: z.array(z.string()).optional().default([]),
  origin: z.array(z.unknown()).optional(),
  updated_by: z.array(z.unknown()).optional(),
  reviewed_by: z.array(z.unknown()).optional(),
  priority: z.number().optional(),
});

/** Type inferred from the reserved fields schema */
export type ReservedFields = z.infer<typeof reservedFieldsSchema>;
