import { RefParser } from './base.js';

/**
 * Parser for YAML files. Identifier = top-level key.
 */
export class YamlRefParser extends RefParser {
  readonly extensions = ['.yaml', '.yml'];

  extractBlock(content: string, identifier: string): string | null {
    const lines = content.split('\n');
    const block: string[] = [];
    let capturing = false;

    for (const line of lines) {
      // Check for top-level key (no indentation)
      const keyMatch = line.match(/^(\w[\w-]*)\s*:/);
      if (keyMatch) {
        if (capturing) break; // Hit next top-level key
        if (keyMatch[1] === identifier) {
          capturing = true;
          block.push(line);
          continue;
        }
      }

      if (capturing) {
        // Still in the block (indented or blank lines)
        if (line.trim() === '' || /^\s/.test(line)) {
          block.push(line);
        } else {
          break; // Non-indented, non-blank = new top-level key
        }
      }
    }

    return block.length > 0 ? block.join('\n') : null;
  }
}
