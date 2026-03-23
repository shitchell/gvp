import { RefParser } from './base.js';

/**
 * Parser for TypeScript/JavaScript files. Identifier = class/function name.
 */
export class TypeScriptRefParser extends RefParser {
  readonly extensions = ['.ts', '.tsx', '.js', '.jsx'];

  extractBlock(content: string, identifier: string): string | null {
    // Simple regex-based extraction (not a full AST parser)
    // Look for: class Foo, function foo, const foo =, export function foo
    const patterns = [
      new RegExp(`(?:export\\s+)?(?:abstract\\s+)?class\\s+${escapeRegex(identifier)}\\s*[{<(]`, 'm'),
      new RegExp(`(?:export\\s+)?(?:async\\s+)?function\\s+${escapeRegex(identifier)}\\s*[(<]`, 'm'),
      new RegExp(`(?:export\\s+)?(?:const|let|var)\\s+${escapeRegex(identifier)}\\s*[=:]`, 'm'),
    ];

    for (const pattern of patterns) {
      const match = content.match(pattern);
      if (match && match.index !== undefined) {
        // Extract from the match to the end of the block (brace matching)
        return extractBraceBlock(content, match.index);
      }
    }

    return null;
  }
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
