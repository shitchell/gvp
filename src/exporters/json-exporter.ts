import { z } from 'zod';
import type { Catalog } from '../catalog/catalog.js';
import { Exporter, type ExportOptions } from './base.js';

/**
 * Lossless JSON exporter (DEC-7.7, DEC-7.10).
 * Includes all documents, elements, categories, and tags.
 */
export class JsonExporter extends Exporter {
  readonly key = 'json';
  readonly name = 'JSON';
  readonly optionsSchema = z.object({}).optional();

  export(catalog: Catalog, options?: ExportOptions): string {
    const includeDeprecated = options?.includeDeprecated ?? false;

    const output = {
      documents: catalog.documents.map(doc => ({
        name: doc.name,
        documentPath: doc.documentPath,
        source: doc.source,
        meta: {
          ...doc.meta,
          // Ensure lossless fields are always present (DEC-7.10)
          inherits: doc.meta.inherits ?? null,
          defaults: doc.meta.defaults ?? null,
          definitions: doc.meta.definitions ?? null,
          scope: doc.meta.scope ?? null,
        },
        elements: doc.getAllElements()
          .filter(e => includeDeprecated || e.status !== 'deprecated')
          .map(e => ({
            ...e.data,
            _category: e.categoryName,
            _libraryId: e.toLibraryId(),
            _canonicalId: e.toCanonicalId(),
          })),
      })),
      categories: catalog.registry.categories,
      tags: catalog.getTags(),
    };

    return JSON.stringify(output, null, 2);
  }
}
