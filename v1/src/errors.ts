/**
 * Base error for all GVP errors.
 * Hierarchy: GVPError -> domain errors -> specific errors
 * Per DEC-5.3: catch at any granularity.
 */
export class GVPError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GVPError';
  }
}

export class SchemaError extends GVPError {
  constructor(message: string) {
    super(message);
    this.name = 'SchemaError';
  }
}

export class InheritanceError extends GVPError {
  constructor(message: string) {
    super(message);
    this.name = 'InheritanceError';
  }
}

export class ConfigError extends GVPError {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

export class ValidationError extends GVPError {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class ProvenanceError extends GVPError {
  constructor(message: string) {
    super(message);
    this.name = 'ProvenanceError';
  }
}
