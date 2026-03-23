import { z } from 'zod';
import type { CategoryDefinition, AllFieldSchemas, DefaultsFile } from '../schema/category-definition.js';
import type { FieldSchemaEntry } from '../schema/field-schema.js';
import { buildCategoryElementSchema } from '../schema/defaults-loader.js';

/**
 * Registry of category definitions with lookup and schema caching.
 * Built from defaults + optional user-defined categories.
 */
export class CategoryRegistry {
  private readonly _categories: Map<string, CategoryDefinition>;
  private readonly _allFieldSchemas: Record<string, FieldSchemaEntry>;
  private readonly _schemaCache: Map<string, z.ZodObject<Record<string, z.ZodType>>> = new Map();

  constructor(
    categories: Record<string, CategoryDefinition>,
    allFieldSchemas: Record<string, FieldSchemaEntry> = {},
  ) {
    this._categories = new Map(Object.entries(categories));
    this._allFieldSchemas = allFieldSchemas;
  }

  /** Create registry from a DefaultsFile (loaded defaults.yaml) */
  static fromDefaults(defaults: DefaultsFile): CategoryRegistry {
    return new CategoryRegistry(
      defaults.categories,
      defaults._all?.field_schemas ?? {},
    );
  }

  /** Get category definition by name */
  getByName(name: string): CategoryDefinition | undefined {
    return this._categories.get(name);
  }

  /** Get category by yaml_key */
  getByYamlKey(yamlKey: string): { name: string; def: CategoryDefinition } | undefined {
    for (const [name, def] of this._categories) {
      if (def.yaml_key === yamlKey) return { name, def };
    }
    return undefined;
  }

  /** Get category by id_prefix */
  getByIdPrefix(prefix: string): { name: string; def: CategoryDefinition } | undefined {
    for (const [name, def] of this._categories) {
      if (def.id_prefix === prefix) return { name, def };
    }
    return undefined;
  }

  /** Get all category names */
  get categoryNames(): string[] {
    return [...this._categories.keys()];
  }

  /** Get all yaml_keys (used by document parser to identify element sections) */
  get allYamlKeys(): string[] {
    return [...this._categories.values()].map(c => c.yaml_key);
  }

  /** Get all categories as a plain record */
  get categories(): Record<string, CategoryDefinition> {
    return Object.fromEntries(this._categories);
  }

  /** Get the _all field schemas */
  get allFieldSchemas(): Record<string, FieldSchemaEntry> {
    return this._allFieldSchemas;
  }

  /**
   * Get the element Zod schema for a category (cached).
   * Merges _all + per-category field_schemas, builds combined reserved+dynamic schema.
   */
  getElementSchema(categoryName: string, options?: { defaultTimezone?: string }): z.ZodObject<Record<string, z.ZodType>> {
    const cacheKey = `${categoryName}:${options?.defaultTimezone ?? ''}`;
    const cached = this._schemaCache.get(cacheKey);
    if (cached) return cached;

    const def = this._categories.get(categoryName);
    if (!def) {
      throw new Error(`Unknown category: '${categoryName}'`);
    }

    const schema = buildCategoryElementSchema(def, this._allFieldSchemas, options);
    this._schemaCache.set(cacheKey, schema);
    return schema;
  }

  /**
   * Create a new registry with additional user categories merged on top.
   * Per-category wins on collision (DEC-2.8, DEC-3.9).
   */
  merge(
    userCategories: Record<string, CategoryDefinition>,
    userAll?: AllFieldSchemas,
  ): CategoryRegistry {
    const mergedCategories = { ...this.categories, ...userCategories };
    const mergedAll = userAll?.field_schemas
      ? { ...this._allFieldSchemas, ...userAll.field_schemas }
      : this._allFieldSchemas;
    return new CategoryRegistry(mergedCategories, mergedAll);
  }
}
