import { z } from 'zod';
import { categoryDefinitionSchema } from '../schema/category-definition.js';

/** Single tag definition */
const tagEntrySchema = z.object({
  description: z.string(),
});

/**
 * Tag definitions: accepts both flat format (DEC-2.14) and nested v0 format.
 * Flat: { framework: { description: ... }, tooling: { description: ... } }
 * Nested: { domains: { framework: { description: ... } }, concerns: { ... } }
 * Nested format is flattened during parsing.
 */
const tagDefinitionSchema = z.record(z.string(), z.unknown()).transform((raw) => {
  const flat: Record<string, { description: string }> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (value && typeof value === 'object' && 'description' in value) {
      // Flat format: { tagname: { description: "..." } }
      flat[key] = value as { description: string };
    } else if (value && typeof value === 'object') {
      // Nested format: { groupname: { tagname: { description: "..." }, ... } }
      for (const [innerKey, innerValue] of Object.entries(value as Record<string, unknown>)) {
        if (innerValue && typeof innerValue === 'object' && 'description' in innerValue) {
          flat[innerKey] = innerValue as { description: string };
        }
      }
    }
  }
  return flat;
});

/** Document definitions block */
const definitionsSchema = z.object({
  tags: tagDefinitionSchema.optional(),
  categories: z.record(z.string(), categoryDefinitionSchema).optional(),
}).optional();

/** Config override entry (DEC-2.4, DEC-2.13) */
export const configOverrideEntrySchema = z.object({
  mode: z.enum(['replace', 'additive']),
  value: z.unknown(),
});

/** Document meta schema */
export const documentMetaSchema = z.object({
  name: z.string().optional(),
  id_prefix: z.string().optional(), // DOM-2: per-document id prefix
  inherits: z.union([
    z.string().transform(s => [s]),  // bare string -> array
    z.array(z.string()),
    z.array(z.object({
      source: z.string(),
      as: z.string().optional(),
    })),
    z.array(z.union([
      z.string(),
      z.object({ source: z.string(), as: z.string().optional() }),
    ])),
  ]).optional(),
  scope: z.string().optional(),
  defaults: z.record(z.string(), z.unknown()).optional(),
  definitions: definitionsSchema,
  config_overrides: z.record(z.string(), configOverrideEntrySchema).optional(), // DEC-2.4, DEC-2.13
}).passthrough();

export type DocumentMeta = z.infer<typeof documentMetaSchema>;
