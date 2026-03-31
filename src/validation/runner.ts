import type { Catalog } from '../catalog/catalog.js';
import type { GVPConfig } from '../config/schema.js';
import type { Diagnostic } from './diagnostic.js';

/** A validation pass function */
export type ValidationPass = (catalog: Catalog, config: GVPConfig) => Diagnostic[];

/**
 * Run validation passes and apply suppression + strict mode (DEC-5.1, DEC-5.8).
 *
 * Processing order (DEC-5.8):
 * 1. Passes produce Diagnostics
 * 2. Suppressed codes are removed (exact-match, DEC-5.11)
 * 3. Strict mode promotes remaining warnings to errors
 */
export function runValidation(
  catalog: Catalog,
  config: GVPConfig,
  passes: Map<string, ValidationPass>,
  passNames?: string[],
): Diagnostic[] {
  // Determine which passes to run
  const names = passNames ?? [...passes.keys()];

  // Step 1: Collect diagnostics from all passes
  let diagnostics: Diagnostic[] = [];
  for (const name of names) {
    const pass = passes.get(name);
    if (pass) {
      diagnostics.push(...pass(catalog, config));
    }
  }

  // Step 2: Remove suppressed codes (DEC-5.8: suppression wins over strict)
  const suppressed = new Set(config.suppress_diagnostics ?? []);
  diagnostics = diagnostics.filter(d => !suppressed.has(d.code));

  // Step 3: Strict mode promotes warnings to errors
  if (config.strict) {
    diagnostics = diagnostics.map(d =>
      d.severity === 'warning' ? { ...d, severity: 'error' as const } : d,
    );
  }

  return diagnostics;
}

/** Check if any diagnostics are errors */
export function hasErrors(diagnostics: Diagnostic[]): boolean {
  return diagnostics.some(d => d.severity === 'error');
}
