import type { CategoryDefinition } from '../schema/category-definition.js';
import { checkReservedFieldCollision } from '../schema/reserved-fields.js';
import {
  DuplicateIdPrefixError,
  DuplicateYamlKeyError,
  InvalidMappingRuleRefError,
  CatalogError,
} from '../errors.js';

/**
 * Run post-merge validation on a set of category definitions (DEC-3.6).
 * All checks are per-library. Throws on first error (DEC-5.7: fail-fast).
 */
export function validateMergedCategories(
  categories: Record<string, CategoryDefinition>,
  context: string = 'catalog',
): void {
  const entries = Object.entries(categories);

  // 1. id_prefix uniqueness
  const prefixes = new Map<string, string>();
  for (const [name, def] of entries) {
    const existing = prefixes.get(def.id_prefix);
    if (existing) {
      throw new DuplicateIdPrefixError(
        `Duplicate id_prefix '${def.id_prefix}' in ${context}: used by both '${existing}' and '${name}'`,
      );
    }
    prefixes.set(def.id_prefix, name);
  }

  // 2. yaml_key uniqueness
  const yamlKeys = new Map<string, string>();
  for (const [name, def] of entries) {
    const existing = yamlKeys.get(def.yaml_key);
    if (existing) {
      throw new DuplicateYamlKeyError(
        `Duplicate yaml_key '${def.yaml_key}' in ${context}: used by both '${existing}' and '${name}'`,
      );
    }
    yamlKeys.set(def.yaml_key, name);
  }

  // 3. mapping_rules references exist
  const categoryNames = new Set(entries.map(([name]) => name));
  for (const [name, def] of entries) {
    if (!def.mapping_rules) continue;
    for (const ruleGroup of def.mapping_rules) {
      for (const ref of ruleGroup) {
        if (!categoryNames.has(ref)) {
          throw new InvalidMappingRuleRefError(
            `Category '${name}' references unknown category '${ref}' in mapping_rules in ${context}`,
          );
        }
      }
    }
  }

  // 4. Reserved field collisions in field_schemas
  for (const [, def] of entries) {
    if (def.field_schemas) {
      checkReservedFieldCollision(def.field_schemas);
    }
  }

  // 5. Root categories must NOT have mapping_rules (DEC-3.5)
  for (const [name, def] of entries) {
    if (def.is_root && def.mapping_rules && def.mapping_rules.length > 0) {
      throw new CatalogError(
        `Root category '${name}' must not have mapping_rules in ${context}`,
      );
    }
  }

  // 6. Non-root categories MUST have mapping_rules (DEC-3.5)
  for (const [name, def] of entries) {
    if (!def.is_root && (!def.mapping_rules || def.mapping_rules.length === 0)) {
      throw new CatalogError(
        `Non-root category '${name}' must have mapping_rules in ${context}`,
      );
    }
  }
}
