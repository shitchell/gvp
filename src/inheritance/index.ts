export type { ElementReference } from './reference-parser.js';
export { parseReference } from './reference-parser.js';
export type { SourceResolver } from './source-resolver.js';
export { LocalSourceResolver, GitSourceResolver, createSourceResolver } from './source-resolver.js';
export type { AliasMap } from './alias-resolver.js';
export { buildAliasMap, resolveAlias } from './alias-resolver.js';
export type { DocumentLoader, ResolvedInheritance } from './inheritance-resolver.js';
export { resolveInheritance } from './inheritance-resolver.js';
