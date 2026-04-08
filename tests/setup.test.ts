import { describe, it, expect } from 'vitest';
import { GVPError, SchemaError, InheritanceError, ConfigError, ValidationError, ProvenanceError } from '../src/errors.js';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

describe('Error Hierarchy (DEC-5.3)', () => {
  it('SchemaError extends GVPError', () => {
    const error = new SchemaError('test');
    expect(error).toBeInstanceOf(GVPError);
    expect(error).toBeInstanceOf(SchemaError);
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('SchemaError');
    expect(error.message).toBe('test');
  });

  it('InheritanceError extends GVPError', () => {
    const error = new InheritanceError('test');
    expect(error).toBeInstanceOf(GVPError);
    expect(error).toBeInstanceOf(InheritanceError);
  });

  it('ConfigError extends GVPError', () => {
    const error = new ConfigError('test');
    expect(error).toBeInstanceOf(GVPError);
    expect(error).toBeInstanceOf(ConfigError);
  });

  it('ValidationError extends GVPError', () => {
    const error = new ValidationError('test');
    expect(error).toBeInstanceOf(GVPError);
    expect(error).toBeInstanceOf(ValidationError);
  });

  it('ProvenanceError extends GVPError', () => {
    const error = new ProvenanceError('test');
    expect(error).toBeInstanceOf(GVPError);
    expect(error).toBeInstanceOf(ProvenanceError);
  });

  it('all errors can be caught as GVPError', () => {
    const errors = [
      new SchemaError('a'),
      new InheritanceError('b'),
      new ConfigError('c'),
      new ValidationError('d'),
      new ProvenanceError('e'),
    ];
    for (const error of errors) {
      expect(error).toBeInstanceOf(GVPError);
    }
  });
});

describe('Defaults (DEC-9.1-9.6, DEC-10.1)', () => {
  const defaultsPath = path.resolve(__dirname, '../src/data/defaults.yaml');
  const content = fs.readFileSync(defaultsPath, 'utf-8');
  const parsed = yaml.load(content) as Record<string, unknown>;

  it('has _all and categories sections', () => {
    expect(parsed).toHaveProperty('_all');
    expect(parsed).toHaveProperty('categories');
  });

  it('has exactly 9 core categories (DEC-9.3, D19)', () => {
    const categories = parsed.categories as Record<string, unknown>;
    expect(Object.keys(categories)).toHaveLength(9);
  });

  it('has the correct 9 categories', () => {
    const categories = parsed.categories as Record<string, unknown>;
    const expected = ['goal', 'value', 'constraint', 'principle', 'rule', 'heuristic', 'decision', 'milestone', 'procedure'];
    expect(Object.keys(categories).sort()).toEqual(expected.sort());
  });

  it('uses single-char prefixes (DEC-9.2)', () => {
    const categories = parsed.categories as Record<string, Record<string, unknown>>;
    const prefixes = Object.values(categories).map(c => c.id_prefix as string);
    // Order matches the order categories are declared in defaults.yaml.
    expect(prefixes).toEqual(['G', 'V', 'C', 'P', 'R', 'H', 'D', 'M', 'Q']);
  });

  it('constraint uses C prefix, not CON (DEC-9.2)', () => {
    const categories = parsed.categories as Record<string, Record<string, unknown>>;
    expect(categories.constraint.id_prefix).toBe('C');
  });

  it('uses "decision" not "design_choice" (DEC-9.1)', () => {
    const categories = parsed.categories as Record<string, unknown>;
    expect(categories).toHaveProperty('decision');
    expect(categories).not.toHaveProperty('design_choice');
    const decision = categories.decision as Record<string, unknown>;
    expect(decision.yaml_key).toBe('decisions');
  });

  it('has considered only on decision (DEC-9.6)', () => {
    const categories = parsed.categories as Record<string, Record<string, unknown>>;
    for (const [name, cat] of Object.entries(categories)) {
      if (name === 'decision') {
        expect(cat.field_schemas).toHaveProperty('considered');
      } else if (cat.field_schemas) {
        expect(cat.field_schemas).not.toHaveProperty('considered');
      }
    }
  });

  it('has refs in _all (DEC-10.1)', () => {
    const all = parsed._all as Record<string, Record<string, unknown>>;
    expect(all.field_schemas).toHaveProperty('refs');
  });

  it('refs uses enum type for role (DEC-10.11)', () => {
    const all = parsed._all as Record<string, Record<string, Record<string, unknown>>>;
    const refs = all.field_schemas.refs as Record<string, unknown>;
    const items = refs.items as Record<string, Record<string, Record<string, unknown>>>;
    const role = items.fields.role as Record<string, unknown>;
    expect(role.type).toBe('enum');
    expect(role.values).toEqual(['defines', 'implements', 'uses', 'extends']);
  });

  it('root categories have is_root: true and no mapping_rules (DEC-3.5)', () => {
    const categories = parsed.categories as Record<string, Record<string, unknown>>;
    const roots = ['goal', 'value', 'constraint'];
    for (const name of roots) {
      expect(categories[name].is_root).toBe(true);
      expect(categories[name].mapping_rules).toBeUndefined();
    }
  });

  it('non-root categories have mapping_rules (DEC-3.5)', () => {
    const categories = parsed.categories as Record<string, Record<string, unknown>>;
    const nonRoots = ['principle', 'rule', 'heuristic', 'decision', 'milestone'];
    for (const name of nonRoots) {
      expect(categories[name].mapping_rules).toBeDefined();
      expect(Array.isArray(categories[name].mapping_rules)).toBe(true);
    }
  });
});
