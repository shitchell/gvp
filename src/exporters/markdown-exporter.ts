import { z } from 'zod';
import type { Catalog } from '../catalog/catalog.js';
import { Exporter, type ExportOptions } from './base.js';

/**
 * Per-document Markdown exporter.
 * Groups elements by document and category, rendering human-readable markdown.
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
          sections.push(`### ${el.id}: ${el.name}\n`);

          if (el.status !== 'active') {
            sections.push(`**Status:** ${el.status}\n`);
          }

          // Primary field
          const primaryField = catDef.primary_field ?? 'statement';
          const primaryValue = el.get(primaryField);
          if (primaryValue) {
            sections.push(`${String(primaryValue).trim()}\n`);
          }

          // Tags
          if (el.tags.length > 0) {
            sections.push(`**Tags:** ${el.tags.join(', ')}\n`);
          }

          // Maps to
          if (el.maps_to.length > 0) {
            sections.push(`**Maps to:** ${el.maps_to.join(', ')}\n`);
          }

          // Considered alternatives (for decisions)
          const considered = el.get('considered');
          if (considered && typeof considered === 'object') {
            sections.push(`**Considered alternatives:**\n`);
            for (const [altName, altDef] of Object.entries(
              considered as Record<string, Record<string, unknown>>,
            )) {
              const displayName = altName
                .replace(/_/g, ' ')
                .replace(/\b\w/g, c => c.toUpperCase());
              const rationale = altDef?.rationale ?? '';
              sections.push(`- **${displayName}** — *${rationale}*`);
            }
            sections.push('');
          }
        }
      }
    }

    return sections.join('\n');
  }
}
