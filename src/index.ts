// GVP v1 - Goals, Values, and Principles framework
// Kept in sync with package.json by hand. It had been stale since 1.1.0.
export const VERSION = '3.1.0';

export { GVPError, SchemaError, InheritanceError, ConfigError, ValidationError, ProvenanceError, SourceResolutionError, CatalogError, DuplicateIdPrefixError, DuplicateYamlKeyError, InvalidMappingRuleRefError, CircularInheritanceError, MissingMappingRulesError } from './errors.js';
export * from './schema/index.js';
export * from './config/index.js';
export * from './model/index.js';
export * from './inheritance/index.js';
export * from './catalog/index.js';
export * from './validation/index.js';
export * from './provenance/index.js';
export * from './exporters/index.js';
export * from './listings/index.js';
export * from './parsers/index.js';
export * from './analysis/index.js';
