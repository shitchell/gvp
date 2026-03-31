import { z } from 'zod';

/** User identity for provenance (DEC-4.3) */
export const userIdentitySchema = z.object({
  name: z.string(),
  email: z.string().email(),
});

/** GVP config schema */
export const configSchema = z.object({
  // User identity (DEC-4.3, DEC-4.8: personal only, excluded from config_overrides)
  user: userIdentitySchema.optional(),

  // Validation settings
  strict: z.boolean().optional().default(false),
  suppress_diagnostics: z.array(z.string()).optional().default([]),

  // Display settings (DEC-8.3: magic numbers as config)
  display: z
    .object({
      truncation_width: z.number().optional(),
    })
    .optional(),

  // Timezone (DEC-3.4: config -> system -> UTC fallback)
  default_timezone: z.string().optional(),

  // Export options strictness (DEC-3.8)
  strict_export_options: z.boolean().optional().default(true),

  // Source identity for local library (DEC-6.6)
  source: z.string().optional(),

  // Coverage settings (W012 exclusions)
  coverage: z
    .object({
      exclude: z.array(z.string()).optional().default([]),
    })
    .optional(),

  // Validation rules (VAL-6: user-defined)
  validation_rules: z.array(z.unknown()).optional().default([]),

  // Priority direction (DEC-2.1)
  priority: z
    .object({
      elements: z.enum(['ancestor', 'descendant']).optional().default('ancestor'),
      definitions: z.enum(['ancestor', 'descendant']).optional().default('descendant'),
    })
    .optional(),
}).passthrough(); // Allow unknown keys for forward compat

export type GVPConfig = z.infer<typeof configSchema>;
