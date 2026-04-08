import { z } from 'zod';
import type { Catalog } from '../catalog/catalog.js';
import { Exporter, type ExportOptions } from './base.js';
import { renderElementMarkdown } from './shape-renderer.js';

/**
 * Per-document Markdown exporter.
 *
 * Groups elements by document and category. Per-element rendering is
 * delegated to the shape-based renderer (D20a, C.1) so the exporter
 * itself contains zero category-specific or field-name-specific
 * branches: it walks documents → categories → elements, and asks the
 * shape renderer to format each element.
 */
export class MarkdownExporter extends Exporter {
  readonly key = 'markdown';
  readonly name = 'Markdown';
  readonly optionsSchema = z.object({}).optional();

  export(catalog: Catalog, options?: ExportOptions): string {
    const includeDeprecated = options?.includeDeprecated ?? false;
    const documentFilter = options?.documentFilter;
    const sections: string[] = [];

    const docs = documentFilter
      ? catalog.documents.filter(d => documentFilter.has(d.documentPath))
      : catalog.documents;

    for (const doc of docs) {
      sections.push(`# ${doc.name}\n`);

      for (const catName of catalog.registry.categoryNames) {
        const catDef = catalog.registry.getByName(catName);
        if (!catDef) continue;

        const elements = doc.getElementsByCategory(catName)
          .filter(e => includeDeprecated || e.status !== 'deprecated');
        if (elements.length === 0) continue;

        const displayLabel = catDef.display_label ??
          catName.charAt(0).toUpperCase() + catName.slice(1) + 's';
        sections.push(`## ${displayLabel}\n`);

        for (const el of elements) {
          sections.push(renderElementMarkdown(el, catalog));
          sections.push('');
        }
      }
    }

    return sections.join('\n');
  }
}
