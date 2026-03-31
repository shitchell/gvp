import type { ValidationPass } from '../runner.js';
import { schemaPass } from './schema-pass.js';
import { structuralPass } from './structural-pass.js';
import { traceabilityPass } from './traceability-pass.js';
import { semanticPass } from './semantic-pass.js';
import { userRulesPass } from './user-rules-pass.js';
import { coveragePass } from './coverage-pass.js';

/** Built-in validation passes in canonical order (DEC-5.9) */
export const builtinPasses: Map<string, ValidationPass> = new Map([
  ['schema', schemaPass],
  ['structural', structuralPass],
  ['traceability', traceabilityPass],
  ['semantic', semanticPass],
  ['user_rules', userRulesPass],
]);

/** Optional passes that only run when explicitly requested */
export const optionalPasses: Map<string, ValidationPass> = new Map([
  ['coverage', coveragePass],
]);
