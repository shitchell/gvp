import { z } from 'zod';
import type { Catalog } from '../catalog/catalog.js';
import { Exporter, type ExportOptions } from './base.js';

export class DotExporter extends Exporter {
  readonly key = 'dot';
  readonly name = 'Graphviz DOT';
  readonly optionsSchema = z
    .object({
      tier: z.number().optional(),
    })
    .optional();

  export(catalog: Catalog, options?: ExportOptions): string {
    const includeDeprecated = options?.includeDeprecated ?? false;
    const elements = catalog
      .getAllElements()
      .filter((e) => includeDeprecated || e.status === 'active');

    // Generate DOT format (basic implementation — PNG rendering deferred until WASM dep available)
    const lines: string[] = ['digraph gvp {', '  rankdir=BT;'];

    // Nodes
    for (const el of elements) {
      const nodeId = el.toLibraryId().replace(/:/g, '__').replace(/-/g, '_');
      const catDef = catalog.registry.getByName(el.categoryName);
      const color = catDef?.color ?? '#CCCCCC';
      lines.push(
        `  ${nodeId} [label="${el.id}: ${el.name}" style=filled fillcolor="${color}"];`,
      );
    }

    // Edges
    for (const el of elements) {
      const fromId = el.toLibraryId().replace(/:/g, '__').replace(/-/g, '_');
      for (const ref of el.maps_to) {
        const target = elements.find(
          (e) => e.toLibraryId() === ref || e.hashKey() === ref,
        );
        if (target) {
          const toId = target
            .toLibraryId()
            .replace(/:/g, '__')
            .replace(/-/g, '_');
          lines.push(`  ${fromId} -> ${toId};`);
        }
      }
    }

    lines.push('}');
    return lines.join('\n');
  }
}
