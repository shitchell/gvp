import { z } from 'zod';
import type { Catalog } from '../catalog/catalog.js';
import { Exporter, type ExportOptions } from './base.js';
import { RESERVED_FIELD_NAMES } from '../schema/reserved-fields.js';

/**
 * CSV exporter with reserved fields fixed + dynamic fields appended (DEC-7.3).
 */
export class CsvExporter extends Exporter {
  readonly key = 'csv';
  readonly name = 'CSV';
  readonly optionsSchema = z.object({}).optional();

  export(catalog: Catalog, options?: ExportOptions): string {
    const includeDeprecated = options?.includeDeprecated ?? false;
    const documentFilter = options?.documentFilter;
    const elements = catalog.getAllElements()
      .filter(e => includeDeprecated || e.status !== 'deprecated')
      .filter(e => !documentFilter || documentFilter.has(e.documentPath));

    if (elements.length === 0) return '';

    // Fixed columns: reserved fields in stable order
    const fixedColumns = [
      'qualified_id', 'id', 'document', 'category',
      'name', 'status', 'tags', 'maps_to', 'priority',
    ];

    // Dynamic columns: collect all unique dynamic field names across all elements
    const dynamicColumns = new Set<string>();
    for (const el of elements) {
      for (const key of Object.keys(el.data)) {
        if (!RESERVED_FIELD_NAMES.has(key) && !fixedColumns.includes(key)) {
          dynamicColumns.add(key);
        }
      }
    }
    const sortedDynamic = [...dynamicColumns].sort();
    const allColumns = [...fixedColumns, ...sortedDynamic];

    // Header row
    const rows: string[] = [allColumns.join(',')];

    // Data rows
    for (const el of elements) {
      const values = allColumns.map(col => {
        let val: unknown;
        switch (col) {
          case 'qualified_id': val = el.toLibraryId(); break;
          case 'document': val = el.documentPath; break;
          case 'category': val = el.categoryName; break;
          case 'tags': val = el.tags.join(';'); break;
          case 'maps_to': val = el.maps_to.join(';'); break;
          default: val = el.data[col] ?? el.get(col) ?? '';
        }
        return csvEscape(val);
      });
      rows.push(values.join(','));
    }

    return rows.join('\n');
  }
}

function csvEscape(value: unknown): string {
  if (value === undefined || value === null) return '';
  const str = typeof value === 'object' ? JSON.stringify(value) : String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}
