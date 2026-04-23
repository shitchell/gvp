import { RefParser } from './base.js';

/**
 * Parser for Python files. Identifier = class or function (def) name.
 * Supports nested classes, async def, decorators (matched via following def),
 * and dotted paths (`ClassName.method_name`) when both names are present.
 */
export class PythonRefParser extends RefParser {
  readonly extensions = ['.py'];

  extractIdentifiers(content: string, matching?: string): Array<{ identifier: string; block: string }> {
    const patterns: Array<{ regex: RegExp; kind: 'class' | 'def' }> = [
      { regex: /^\s*class\s+(\w+)/gm, kind: 'class' },
      { regex: /^\s*(?:async\s+)?def\s+(\w+)/gm, kind: 'def' },
    ];

    const all: Array<{ identifier: string; block: string; kind: 'class' | 'def' }> = [];
    const seen = new Set<string>();

    for (const { regex, kind } of patterns) {
      let match;
      while ((match = regex.exec(content)) !== null) {
        const name = match[1]!;
        if (seen.has(name)) continue;
        seen.add(name);
        const block = extractIndentBlock(content, match.index!);
        all.push({ identifier: name, block, kind });
      }
    }

    // Dotted-path resolution: head is class-or-def, tail is def.
    if (matching && matching.includes('.')) {
      const lastDot = matching.lastIndexOf('.');
      const head = matching.substring(0, lastDot);
      const tail = matching.substring(lastDot + 1);

      const headEntry = all.find(r => r.identifier === head);
      const tailEntry = all.find(r => r.identifier === tail && r.kind === 'def');

      if (headEntry && tailEntry) {
        return [{ identifier: matching, block: tailEntry.block }];
      }
      return [];
    }

    const stripped = all.map(r => ({ identifier: r.identifier, block: r.block }));
    if (matching) {
      return stripped.filter(r => r.identifier === matching);
    }
    return stripped;
  }
}

/**
 * Extract a Python indent-based block starting at startIndex (which sits at
 * the beginning of the matched line). The block spans from the match line
 * through all subsequent non-blank lines whose indentation is strictly
 * greater than the match line's indentation, stopping before the first
 * non-blank line at the same or lesser indent. Trailing blank lines are
 * not included.
 */
function extractIndentBlock(content: string, startIndex: number): string {
  const firstLineEnd = content.indexOf('\n', startIndex);
  const firstLine = firstLineEnd === -1
    ? content.substring(startIndex)
    : content.substring(startIndex, firstLineEnd);
  const matchIndent = firstLine.match(/^(\s*)/)![1]!.length;

  if (firstLineEnd === -1) return firstLine;

  let blockEnd = firstLineEnd;
  let pos = firstLineEnd + 1;

  while (pos < content.length) {
    const lineEnd = content.indexOf('\n', pos);
    const lineEndIdx = lineEnd === -1 ? content.length : lineEnd;
    const line = content.substring(pos, lineEndIdx);

    if (line.trim() === '') {
      // blank line — included if more deeper-indent content follows
    } else {
      const indent = line.match(/^(\s*)/)![1]!.length;
      if (indent <= matchIndent) {
        break;
      }
      blockEnd = lineEndIdx;
    }

    if (lineEnd === -1) break;
    pos = lineEnd + 1;
  }

  return content.substring(startIndex, blockEnd);
}
