import { z } from 'zod';
import type { Catalog } from '../catalog/catalog.js';
import { Exporter, type ExportOptions } from './base.js';

/**
 * Compact exporter — one line per element (ticket 016).
 *
 * Format:
 *   - **<qualified_id>: <name>** — <primary_field collapsed to one line>
 *
 * Primary field is read from the category definition's `primary_field`
 * property in the registry (R6: no category-name branching).
 * Elements are grouped by category with ## headers.
 */
export class CompactExporter extends Exporter {
  readonly key = 'compact';
  readonly name = 'Compact';
  readonly optionsSchema = z.object({}).optional();

  export(catalog: Catalog, options?: ExportOptions): string {
    const includeDeprecated = options?.includeDeprecated ?? false;
    const documentFilter = options?.documentFilter;

    let elements = catalog.getAllElements();
    if (!includeDeprecated) {
      elements = elements.filter(e => e.status === 'active');
    }
    if (documentFilter) {
      elements = elements.filter(e => documentFilter.has(e.documentPath));
    }

    // Group by category
    const byCategory = new Map<string, typeof elements>();
    for (const el of elements) {
      const group = byCategory.get(el.categoryName) ?? [];
      group.push(el);
      byCategory.set(el.categoryName, group);
    }

    const lines: string[] = [];
    for (const [categoryName, categoryElements] of byCategory) {
      const catDef = catalog.registry.getByName(categoryName);
      const displayName = catDef?.display_label ?? titleCase(categoryName);
      lines.push(`## ${displayName}s`);
      lines.push('');
      for (const el of categoryElements) {
        lines.push(renderCompactLine(el, catDef?.primary_field, catalog));
      }
      lines.push('');
    }

    // Trim trailing blank line
    while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
    return lines.join('\n') + '\n';
  }
}

/**
 * Render a single element as a compact one-liner.
 * Exported for reuse by the query command's inline compact format.
 */
export function renderCompactLine(
  element: { toLibraryId(): string; name: string; get(field: string): unknown },
  primaryField: string | undefined,
  _catalog?: unknown,
): string {
  const field = primaryField ?? 'statement';
  const rawValue = element.get(field);
  if (rawValue !== undefined && rawValue !== null && String(rawValue).trim() !== '') {
    const collapsed = collapseWhitespace(String(rawValue));
    return `- **${element.toLibraryId()}: ${element.name}** — ${collapsed}`;
  }
  return `- **${element.toLibraryId()}: ${element.name}**`;
}

/** Collapse all whitespace (newlines, tabs, multiple spaces) to single spaces. */
function collapseWhitespace(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
