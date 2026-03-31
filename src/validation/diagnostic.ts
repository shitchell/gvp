export type DiagnosticSeverity = 'error' | 'warning';

export interface DiagnosticContext {
  elementId?: string;
  documentPath?: string;
  categoryName?: string;
  fieldName?: string;
  details?: string;
}

/**
 * A validation finding (DEC-5.4).
 * Used for both errors and warnings from validation passes.
 */
export interface Diagnostic {
  code: string;          // Stable code (e.g., W001, E001)
  name: string;          // Human-readable name
  description: string;   // Explanation
  severity: DiagnosticSeverity;
  pass: string;          // Which pass produced it
  context: DiagnosticContext;
}

/** Create a diagnostic */
export function createDiagnostic(
  code: string,
  name: string,
  description: string,
  severity: DiagnosticSeverity,
  pass: string,
  context: DiagnosticContext = {},
): Diagnostic {
  return { code, name, description, severity, pass, context };
}
