import { RefParser } from './base.js';

/**
 * Parser for Markdown files. Identifier = heading text (any level).
 */
export class MarkdownRefParser extends RefParser {
  readonly extensions = ['.md', '.markdown'];

  extractIdentifiers(content: string, matching?: string): Array<{ identifier: string; block: string }> {
    const results: Array<{ identifier: string; block: string }> = [];
    const lines = content.split('\n');

    // Find all headings with their positions and levels
    const headings: Array<{ text: string; level: number; lineIndex: number }> = [];
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i]!.match(/^(#{1,6})\s+(.+)$/);
      if (m) {
        headings.push({ text: m[2]!.trim(), level: m[1]!.length, lineIndex: i });
      }
    }

    for (let h = 0; h < headings.length; h++) {
      const heading = headings[h]!;

      // Skip if filtering and doesn't match
      if (matching && heading.text !== matching) continue;

      // Find end: next heading at same or higher (lower number) level
      let endLine = lines.length;
      for (let j = h + 1; j < headings.length; j++) {
        if (headings[j]!.level <= heading.level) {
          endLine = headings[j]!.lineIndex;
          break;
        }
      }

      const block = lines.slice(heading.lineIndex, endLine).join('\n');
      results.push({ identifier: heading.text, block });
    }

    return results;
  }
}
