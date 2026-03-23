import type { Exporter } from './base.js';
import { JsonExporter } from './json-exporter.js';
import { CsvExporter } from './csv-exporter.js';
import { MarkdownExporter } from './markdown-exporter.js';

/** Built-in exporter registry */
export function createExporterRegistry(): Map<string, Exporter> {
  const registry = new Map<string, Exporter>();
  const exporters = [new JsonExporter(), new CsvExporter(), new MarkdownExporter()];
  for (const exp of exporters) {
    registry.set(exp.key, exp);
  }
  return registry;
}
