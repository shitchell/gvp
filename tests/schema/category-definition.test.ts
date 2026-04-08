import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import {
  categoryDefinitionSchema,
  defaultsFileSchema,
  type CategoryDefinition,
  type DefaultsFile,
} from '../../src/schema/category-definition.js';

describe('CategoryDefinition (DOM-5, DEC-3.5)', () => {
  it('validates minimal category definition', () => {
    const def = { yaml_key: 'goals', id_prefix: 'G' };
    const result = categoryDefinitionSchema.parse(def);
    expect(result.yaml_key).toBe('goals');
    expect(result.id_prefix).toBe('G');
  });

  it('validates full category definition', () => {
    const def = {
      yaml_key: 'decisions',
      id_prefix: 'D',
      primary_field: 'rationale',
      display_label: 'Decisions',
      color: '#795548',
      is_root: false,
      mapping_rules: [['goal', 'value']],
      field_schemas: {
        considered: {
          type: 'dict',
          required: false,
          values: {
            type: 'model',
            fields: {
              rationale: { type: 'string', required: true },
            },
          },
        },
      },
      export_options: { dot: { tier: 3 } },
    };
    expect(() => categoryDefinitionSchema.parse(def)).not.toThrow();
  });

  it('rejects missing yaml_key', () => {
    expect(() => categoryDefinitionSchema.parse({ id_prefix: 'G' })).toThrow();
  });

  it('rejects missing id_prefix', () => {
    expect(() => categoryDefinitionSchema.parse({ yaml_key: 'goals' })).toThrow();
  });

  it('validates mapping_rules as array of arrays', () => {
    const def = {
      yaml_key: 'heuristics',
      id_prefix: 'H',
      mapping_rules: [['goal', 'value'], ['principle'], ['rule']],
    };
    const result = categoryDefinitionSchema.parse(def);
    expect(result.mapping_rules).toEqual([['goal', 'value'], ['principle'], ['rule']]);
  });
});

describe('DefaultsFile schema', () => {
  it('validates the actual defaults.yaml file', () => {
    const defaultsPath = path.resolve(__dirname, '../../src/data/defaults.yaml');
    const content = fs.readFileSync(defaultsPath, 'utf-8');
    const parsed = yaml.load(content) as Record<string, unknown>;

    const result = defaultsFileSchema.parse(parsed);
    expect(Object.keys(result.categories)).toHaveLength(9);
    expect(result._all?.field_schemas).toHaveProperty('priority');
    expect(result._all?.field_schemas).toHaveProperty('refs');
  });

  it('validates a minimal defaults file', () => {
    const minimal = {
      categories: {
        goal: { yaml_key: 'goals', id_prefix: 'G' },
      },
    };
    expect(() => defaultsFileSchema.parse(minimal)).not.toThrow();
  });

  it('validates _all block with field_schemas', () => {
    const withAll = {
      _all: {
        field_schemas: {
          priority: { type: 'number', required: false },
        },
      },
      categories: {
        goal: { yaml_key: 'goals', id_prefix: 'G' },
      },
    };
    expect(() => defaultsFileSchema.parse(withAll)).not.toThrow();
  });
});
