/**
 * Abstract base class for reference parsers (DEC-10.3).
 * Parses format-specific identifiers within files.
 */
export abstract class RefParser {
  /** File extensions this parser handles */
  abstract readonly extensions: string[];

  /**
   * Extract the content block for an identifier from file content.
   * Returns null if the identifier is not found.
   */
  abstract extractBlock(content: string, identifier: string): string | null;

  /**
   * Check if this parser handles a given file extension.
   */
  handles(extension: string): boolean {
    return this.extensions.includes(extension.toLowerCase());
  }
}
