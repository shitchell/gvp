import type { Catalog } from '../../catalog/catalog.js';
import type { GVPConfig } from '../../config/schema.js';
import type { Diagnostic } from '../diagnostic.js';

const PASS_NAME = 'schema';

/**
 * Validates element content against Zod schemas (VAL-3).
 *
 * Schema validation happens at catalog construction via Zod schemas.
 * This pass catches any elements that were loaded with passthrough
 * and might have invalid dynamic fields.
 * For now, catalog construction handles this — this pass is a placeholder
 * for additional schema-level checks in the future.
 */
export function schemaPass(_catalog: Catalog, _config: GVPConfig): Diagnostic[] {
  void PASS_NAME;
  const diagnostics: Diagnostic[] = [];
  return diagnostics;
}
