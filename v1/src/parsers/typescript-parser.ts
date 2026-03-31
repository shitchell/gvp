import { RefParser } from './base.js';

/**
 * Parser for TypeScript/JavaScript files. Identifier = class/function name.
 */
export class TypeScriptRefParser extends RefParser {
  readonly extensions = ['.ts', '.tsx', '.js', '.jsx'];

  extractIdentifiers(content: string, matching?: string): Array<{ identifier: string; block: string }> {
    const results: Array<{ identifier: string; block: string }> = [];

    // Patterns that capture the identifier name
    const patterns = [
      /(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/gm,
      /(?:export\s+)?interface\s+(\w+)/gm,
      /(?:export\s+)?type\s+(\w+)/gm,
      /(?:export\s+)?(?:async\s+)?function\s+(\w+)/gm,
      /(?:export\s+)?(?:const|let|var)\s+(\w+)\s*[=:]/gm,
    ];

    const seen = new Set<string>(); // Avoid duplicates

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const name = match[1]!;
        if (seen.has(name)) continue;
        if (matching && name !== matching) continue;
        seen.add(name);

        const block = extractBraceBlock(content, match.index!);
        results.push({ identifier: name, block });
      }
    }

    return results;
  }
}

function extractBraceBlock(content: string, startIndex: number): string {
  let depth = 0;
  let started = false;
  let end = content.length;

  for (let i = startIndex; i < content.length; i++) {
    if (content[i] === '{') {
      depth++;
      started = true;
    } else if (content[i] === '}') {
      depth--;
      if (started && depth === 0) {
        end = i + 1;
        break;
      }
    }
  }

  return content.substring(startIndex, end);
}
