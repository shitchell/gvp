import { RefParser } from './base.js';

/**
 * Parser for YAML files. Identifier = top-level key.
 */
export class YamlRefParser extends RefParser {
  readonly extensions = ['.yaml', '.yml'];

  extractIdentifiers(content: string, matching?: string): Array<{ identifier: string; block: string }> {
    const results: Array<{ identifier: string; block: string }> = [];
    const lines = content.split('\n');

    // Find all top-level keys (no indentation)
    const topKeys: Array<{ name: string; lineIndex: number }> = [];
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i]!.match(/^(\w[\w-]*)\s*:/);
      if (m) {
        topKeys.push({ name: m[1]!, lineIndex: i });
      }
    }

    for (let k = 0; k < topKeys.length; k++) {
      const key = topKeys[k]!;
      if (matching && key.name !== matching) continue;

      // Block extends to next top-level key or end of file
      const endLine = k + 1 < topKeys.length ? topKeys[k + 1]!.lineIndex : lines.length;
      const block = lines.slice(key.lineIndex, endLine).join('\n');
      results.push({ identifier: key.name, block });
    }

    return results;
  }
}
