import { z } from 'zod';
import type { Catalog } from '../catalog/catalog.js';
import { Exporter, type ExportOptions } from './base.js';

export class SqliteExporter extends Exporter {
  readonly key = 'sqlite';
  readonly name = 'SQLite';
  readonly optionsSchema = z.object({}).optional();

  export(_catalog: Catalog, _options?: ExportOptions): string {
    // Check for dependency
    try {
      require('better-sqlite3');
    } catch {
      throw new Error(
        'SQLite export requires the "better-sqlite3" package. ' +
          'Install with: npm install better-sqlite3',
      );
    }
    // Full implementation deferred — dependency not bundled by default (DEC-7.4)
    throw new Error('SQLite export not yet fully implemented');
  }
}
