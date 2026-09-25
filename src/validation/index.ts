export type { Diagnostic, DiagnosticSeverity, DiagnosticContext } from './diagnostic.js';
export { createDiagnostic } from './diagnostic.js';
export type { ValidationPass } from './runner.js';
export { runValidation, hasErrors } from './runner.js';
export { builtinPasses, optionalPasses } from './passes/index.js';
export type { CountedSource, SourceScopeResult } from './source-scope.js';
export {
  applySourceScope,
  renderSourceScopeSummary,
  resolveSourceVisibility,
  buildDiagnosticSourceResolver,
  bareSourceName,
} from './source-scope.js';
