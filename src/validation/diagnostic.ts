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
  /**
   * Set by runValidation when `strict: true` promoted this from a warning
   * (#29). Source-scoping needs the severity the PASS assigned, not the
   * severity strict mode rewrote it to: without this, `strict` would make
   * every inherited warning an error and silently turn the whole
   * source-scoping feature inert exactly for the users who need it most.
   */
  strictPromoted?: boolean;
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
