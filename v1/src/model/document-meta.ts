import { z } from 'zod';
import { categoryDefinitionSchema } from '../schema/category-definition.js';

/** Tag definition: flat map of tag name to description (DEC-2.14) */
const tagDefinitionSchema = z.record(z.string(), z.object({
  description: z.string(),
}));

/** Document definitions block */
const definitionsSchema = z.object({
  tags: tagDefinitionSchema.optional(),
  categories: z.record(z.string(), categoryDefinitionSchema).optional(),
}).optional();

/** Document meta schema */
export const documentMetaSchema = z.object({
  name: z.string().optional(),
  inherits: z.union([
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
}).passthrough();

export type DocumentMeta = z.infer<typeof documentMetaSchema>;
