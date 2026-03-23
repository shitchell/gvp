import { z } from 'zod';
import type { Catalog } from '../catalog/catalog.js';

export interface ExportOptions {
  outputDir?: string;
  includeDeprecated?: boolean;
}

/**
 * Abstract base class for exporters (DEC-7.8).
 * Each exporter declares key, name, optionsSchema, and export().
 */
export abstract class Exporter {
  abstract readonly key: string;
  abstract readonly name: string;
  abstract readonly optionsSchema: z.ZodType;

  abstract export(catalog: Catalog, options?: ExportOptions): string;
}
