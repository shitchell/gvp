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

    // Tier-based rank=same grouping (R8)
    const tiers = new Map<number, string[]>();
    for (const el of elements) {
      const catDef = catalog.registry.getByName(el.categoryName);
      const exportOpts = catDef?.export_options?.dot as { tier?: number } | undefined;
      if (exportOpts?.tier !== undefined) {
        const nodeId = el.toLibraryId().replace(/:/g, '__').replace(/-/g, '_');
        if (!tiers.has(exportOpts.tier)) tiers.set(exportOpts.tier, []);
        tiers.get(exportOpts.tier)!.push(nodeId);
      }
    }
    for (const [, nodes] of [...tiers.entries()].sort((a, b) => a[0] - b[0])) {
      lines.push(`  {rank=same; ${nodes.join('; ')};}`);
    }

    // Subgraph grouping per document
    for (const doc of catalog.documents) {
      const docElements = elements.filter(e => e.documentPath === doc.documentPath);
      if (docElements.length > 0) {
        const clusterId = doc.documentPath.replace(/[^a-zA-Z0-9]/g, '_');
        lines.push(`  subgraph cluster_${clusterId} {`);
        lines.push(`    label="${doc.name}";`);
        for (const el of docElements) {
          const nodeId = el.toLibraryId().replace(/:/g, '__').replace(/-/g, '_');
          lines.push(`    ${nodeId};`);
        }
        lines.push('  }');
      }
    }

    lines.push('}');
    return lines.join('\n');
  }
}
