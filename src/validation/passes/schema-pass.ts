import type { Catalog } from '../../catalog/catalog.js';
import type { GVPConfig } from '../../config/schema.js';
import type { Diagnostic } from '../diagnostic.js';
import { createDiagnostic } from '../diagnostic.js';

const PASS_NAME = 'schema';

/**
 * Validates element content against Zod schemas (VAL-3).
 *
 * Schema validation happens at catalog construction via Zod schemas.
 * This pass catches any elements that were loaded with passthrough
 * and might have invalid dynamic fields after merge/inheritance.
 */
export function schemaPass(catalog: Catalog, config: GVPConfig): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  for (const element of catalog.getAllElements()) {
    let schema;
    try {
      schema = catalog.registry.getElementSchema(element.categoryName, {
        defaultTimezone: config.default_timezone,
      });
    } catch {
      // Unknown category — structural pass handles this
      continue;
    }

    const result = schema.safeParse(element.data);
    if (!result.success) {
      for (const issue of result.error.issues) {
        const fieldPath = issue.path.join('.');
        diagnostics.push(createDiagnostic(
          'E004',
          'SCHEMA_VALIDATION',
          `Element ${element.toLibraryId()} field '${fieldPath}': ${issue.message}`,
          'error',
          PASS_NAME,
          {
            elementId: element.id,
            documentPath: element.documentPath,
            categoryName: element.categoryName,
            fieldName: fieldPath || undefined,
          },
        ));
      }
    }
  }

  return diagnostics;
}
