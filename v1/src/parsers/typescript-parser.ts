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

    // Destructured imports/requires (T4)
    const destructuredPattern = /(?:const|let|var)\s*\{([^}]+)\}\s*=\s*require/gm;

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

    // Extract destructured names from require statements
    {
      let match;
      while ((match = destructuredPattern.exec(content)) !== null) {
        const names = match[1]!.split(',').map(s => s.trim().split(/\s+as\s+/).pop()!.trim()).filter(Boolean);
        for (const name of names) {
          if (seen.has(name)) continue;
          if (matching && name !== matching) continue;
          seen.add(name);
          // Use the full require statement as the block
          const lineStart = content.lastIndexOf('\n', match.index!) + 1;
          const lineEnd = content.indexOf('\n', match.index! + match[0].length);
          const block = content.substring(lineStart, lineEnd === -1 ? content.length : lineEnd);
          results.push({ identifier: name, block });
        }
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
