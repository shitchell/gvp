// GVP v1 - Goals, Values, and Principles framework
export const VERSION = '1.0.0';

export { GVPError, SchemaError, InheritanceError, ConfigError, ValidationError, ProvenanceError, SourceResolutionError } from './errors.js';
export * from './schema/index.js';
export * from './config/index.js';
export * from './model/index.js';
export * from './inheritance/index.js';
