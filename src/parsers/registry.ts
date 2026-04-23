import type { RefParser } from './base.js';
import { MarkdownRefParser } from './markdown-parser.js';
import { PythonRefParser } from './python-parser.js';
import { TypeScriptRefParser } from './typescript-parser.js';
import { YamlRefParser } from './yaml-parser.js';

/**
 * Create the built-in ref parser registry (DEC-10.3).
 */
export function createRefParserRegistry(): RefParser[] {
  return [
    new MarkdownRefParser(),
    new PythonRefParser(),
    new TypeScriptRefParser(),
    new YamlRefParser(),
  ];
}

/**
 * Find a parser that handles the given file extension.
 * Returns undefined for unknown extensions (graceful degradation, DEC-10.15).
 */
export function findParser(extension: string, parsers: RefParser[]): RefParser | undefined {
  return parsers.find(p => p.handles(extension));
}
