/**
 * Abstract base class for reference parsers (DEC-10.3).
 * One core method: extractIdentifiers. extractBlock is a convenience wrapper.
 */
export abstract class RefParser {
  abstract readonly extensions: string[];

  /**
   * Core method: extract identifiers from file content.
   * Each result has an identifier name and its content block.
   *
   * @param content - File content to parse
   * @param matching - Optional filter string. When provided, only return
   *   identifiers that match (exact match). When omitted, return ALL
   *   identifiers found in the file.
   */
  abstract extractIdentifiers(content: string, matching?: string): Array<{
    identifier: string;
    block: string;
  }>;

  /**
   * Convenience: extract a single content block by exact identifier name.
   * Returns null if not found or if multiple matches (ambiguous).
   */
  extractBlock(content: string, identifier: string): string | null {
    const results = this.extractIdentifiers(content, identifier);
    return results.length === 1 ? results[0]!.block : null;
  }

  /** Check if this parser handles a given file extension. */
  handles(extension: string): boolean {
    return this.extensions.includes(extension.toLowerCase());
  }
}
