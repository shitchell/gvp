import { RefParser } from './base.js';

/**
 * Parser for Markdown files. Identifier = heading text (any level).
 */
export class MarkdownRefParser extends RefParser {
  readonly extensions = ['.md', '.markdown'];

  extractBlock(content: string, identifier: string): string | null {
    const lines = content.split('\n');
    let capturing = false;
    let captureLevel = 0;
    const block: string[] = [];

    for (const line of lines) {
      const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
      if (headingMatch) {
        const level = headingMatch[1]!.length;
        const text = headingMatch[2]!.trim();

        if (capturing) {
          // Stop if we hit a heading at same or higher level
          if (level <= captureLevel) break;
        }

        if (text === identifier) {
          capturing = true;
          captureLevel = level;
          block.push(line);
          continue;
        }
      }

      if (capturing) {
        block.push(line);
      }
    }

    return block.length > 0 ? block.join('\n') : null;
  }
}
