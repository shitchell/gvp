import { z } from 'zod';
import type { FieldSchemaEntry } from './field-schema.js';
import { createDatetimeSchema } from './datetime.js';
import { SchemaError } from '../errors.js';

interface BuildOptions {
  defaultTimezone?: string;
}

/**
 * Convert a single FieldSchemaEntry into a Zod schema.
 * Handles all 8 types recursively (DEC-3.1, DEC-3.4, DEC-3.10, DEC-3.12, DEC-10.11).
 */
function fieldEntryToZod(entry: FieldSchemaEntry, options: BuildOptions): z.ZodType {
  let schema: z.ZodType;

  switch (entry.type) {
    case 'string':
      schema = z.string();
      break;

    case 'number':
      schema = z.number();
      break;

    case 'boolean':
      schema = z.boolean();
      break;

    case 'datetime':
      schema = createDatetimeSchema(options.defaultTimezone);
      break;

    case 'enum': {
      const values = entry.values;
      if (!Array.isArray(values) || values.length === 0) {
        throw new SchemaError(
          `Enum field requires a non-empty 'values' array of strings`
        );
      }
      schema = z.enum(values as [string, ...string[]]);
      break;
    }

    case 'list': {
      const itemSchema = entry.items
        ? fieldEntryToZod(entry.items, options)
        : z.unknown();
      schema = z.array(itemSchema);
      break;
    }

    case 'dict': {
      const valueSchema = entry.values && !Array.isArray(entry.values)
        ? fieldEntryToZod(entry.values, options)
        : z.unknown();
      schema = z.record(z.string(), valueSchema);
      break;
    }

    case 'model': {
      if (!entry.fields) {
        throw new SchemaError(
          `Model field requires a 'fields' definition`
        );
      }
      const shape: Record<string, z.ZodType> = {};
      for (const [key, fieldEntry] of Object.entries(entry.fields)) {
        let fieldSchema = fieldEntryToZod(fieldEntry, options);
        if (!fieldEntry.required) {
          fieldSchema = fieldSchema.optional();
        }
        shape[key] = fieldSchema;
      }
      schema = z.object(shape);
      break;
    }

    default:
      throw new SchemaError(`Unknown field type: '${entry.type}'`);
  }

  return schema;
}

/**
 * Build a Zod object schema from a field_schemas definition (DEC-3.1).
 * This is the TypeScript equivalent of Pydantic's create_model().
 *
 * Each field in fieldSchemas becomes a property on the resulting Zod object schema.
 * Fields are optional unless `required: true`.
 */
export function buildZodSchema(
  fieldSchemas: Record<string, FieldSchemaEntry>,
  options: BuildOptions = {},
): z.ZodObject<Record<string, z.ZodType>> {
  const shape: Record<string, z.ZodType> = {};

  for (const [key, entry] of Object.entries(fieldSchemas)) {
    let fieldSchema = fieldEntryToZod(entry, options);
    if (!entry.required) {
      fieldSchema = fieldSchema.optional();
    }
    shape[key] = fieldSchema;
  }

  return z.object(shape);
}
