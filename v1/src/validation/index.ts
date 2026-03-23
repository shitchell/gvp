export type { Diagnostic, DiagnosticSeverity, DiagnosticContext } from './diagnostic.js';
export { createDiagnostic } from './diagnostic.js';
export type { ValidationPass } from './runner.js';
export { runValidation, hasErrors } from './runner.js';
export { builtinPasses } from './passes/index.js';
