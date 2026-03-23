import type { Catalog } from '../../catalog/catalog.js';
import type { GVPConfig } from '../../config/schema.js';
import type { Diagnostic } from '../diagnostic.js';

const PASS_NAME = 'user_rules';

/**
 * User-defined validation rules (VAL-6, DEC-5.2, DEC-5.10).
 * User diagnostic codes use U prefix (DEC-5.10).
 *
 * For now, this is a placeholder — the rule engine will be implemented
 * when we have a clear rule definition format.
 */
export function userRulesPass(_catalog: Catalog, _config: GVPConfig): Diagnostic[] {
  void PASS_NAME;
  const diagnostics: Diagnostic[] = [];
  return diagnostics;
}
