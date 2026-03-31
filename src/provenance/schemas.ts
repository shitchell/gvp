import { z } from 'zod';
import { randomUUID } from 'crypto';
import { userIdentitySchema } from '../config/schema.js';

/** Origin entry schema (DEC-4.7: creation record) */
export const originEntrySchema = z.object({
  id: z.string().default(() => randomUUID()),
  date: z.string(), // ISO 8601 datetime
  by: userIdentitySchema.optional(),
});

/** Update entry schema (DEC-4.7: change record) */
export const updateEntrySchema = z.object({
  id: z.string().default(() => randomUUID()),
  date: z.string(),
  by: userIdentitySchema.optional(),
  rationale: z.string(),
  skip_review: z.boolean().optional().default(false),
});

/** Review entry schema (DEC-4.7: review record) */
export const reviewEntrySchema = z.object({
  id: z.string().default(() => randomUUID()),
  date: z.string(),
  by: userIdentitySchema.optional(),
  updates_reviewed: z.array(z.string()), // UUIDs of update entries
  note: z.string().optional(),
});

export type OriginEntry = z.infer<typeof originEntrySchema>;
export type UpdateEntry = z.infer<typeof updateEntrySchema>;
export type ReviewEntry = z.infer<typeof reviewEntrySchema>;
