import type { FieldSchemaEntry } from './field-schema.js';

/**
 * ONE place that answers "where does an element hold element references?".
 *
 * Both the importer (which rewrites pseudo-IDs into real IDs) and the
 * structural validator (which reports E001 BROKEN_REFERENCE) need that answer,
 * and #22 is what happens when each maintains its own walker: the validator
 * learned about `considered.would_have_served` / `.conflicts_with` when the
 * tradeoff links shipped in 1.2.0, the importer never did, and unresolved
 * `?`-refs were written to disk and only surfaced on the next `validate`.
 *
 * The answer is derived entirely from the declared field schemas (R6) — there
 * is no list of field names anywhere in here. A new reference-bearing field
 * added to `field_schemas` is picked up by every consumer at once, and a new
 * *container shape* (something other than list<model> / dict<model>) is a
 * change to this file alone rather than to N walkers.
 *
 * Covered shapes:
 *   - the reserved element-level `maps_to` (not declared in field_schemas)
 *   - top-level `list<reference>`            (e.g. procedure.related)
 *   - `list<model>` → `list<reference>` sub-field  (e.g. procedure.steps[].maps_to)
 *   - `dict<model>` → `list<reference>` sub-field  (e.g. decision.considered[*].would_have_served)
 */

/** One array of element references found inside an element's raw data. */
export interface ReferenceSite {
  /** The record that owns the array — mutate `owner[field]` to rewrite in place. */
  owner: Record<string, unknown>;
  /** Key on `owner` holding the reference array. */
  field: string;
  /** Current contents of the array. Entries are not guaranteed to be strings. */
  refs: unknown[];
  /**
   * Human-readable locator, e.g. `maps_to`, `related`,
   * `considered.would_have_served ('Stored streak counter')`.
   * Phrased to match the validator's E001 message.
   */
  location: string;
  /**
   * Stable machine locator for diagnostics (`details`), e.g. `considered:Stored
   * streak counter` or `steps:S1.2`. Undefined for the reserved element-level
   * `maps_to`, which the validator reports without a details key.
   */
  detailsKey?: string;
}

/**
 * Enumerate every reference-bearing array in one element's raw data.
 *
 * @param data          The element's raw record (a parsed YAML mapping).
 * @param fieldSchemas  Merged field schemas for the element's category
 *                      (global `allFieldSchemas` + the category's own).
 */
export function collectReferenceSites(
  data: Record<string, unknown>,
  fieldSchemas: Record<string, FieldSchemaEntry>,
): ReferenceSite[] {
  const sites: ReferenceSite[] = [];

  const pushArray = (
    owner: Record<string, unknown>,
    field: string,
    location: string,
    detailsKey?: string,
  ): void => {
    const value = owner[field];
    if (!Array.isArray(value)) return;
    sites.push({ owner, field, refs: value, location, detailsKey });
  };

  // Reserved element-level maps_to. It is structural (DEC-3.2) and therefore
  // never appears in field_schemas, so it cannot be discovered by the walk below.
  pushArray(data, 'maps_to', 'maps_to');

  // Every list<reference> sub-field of one contained model instance.
  const pushModelSites = (
    model: unknown,
    modelSchema: FieldSchemaEntry,
    containerField: string,
    ownerLabel: string,
  ): void => {
    if (!model || typeof model !== 'object' || Array.isArray(model)) return;
    if (!modelSchema.fields) return;
    const rec = model as Record<string, unknown>;
    for (const [subName, subSchema] of Object.entries(modelSchema.fields)) {
      if (subSchema.type !== 'list' || subSchema.items?.type !== 'reference') continue;
      pushArray(
        rec,
        subName,
        `${containerField}.${subName} ('${ownerLabel}')`,
        `${containerField}:${ownerLabel}`,
      );
    }
  };

  for (const [fieldName, schema] of Object.entries(fieldSchemas)) {
    // `maps_to` is reserved and already handled; a schema may not redefine it
    // (checkReservedFieldCollision), but guard anyway so it is never doubled.
    if (fieldName === 'maps_to') continue;

    // Top-level list<reference>
    if (schema.type === 'list' && schema.items?.type === 'reference') {
      pushArray(data, fieldName, fieldName, fieldName);
      continue;
    }

    // list<model> container → each item's list<reference> sub-fields
    if (schema.type === 'list' && schema.items?.type === 'model') {
      const items = data[fieldName];
      if (!Array.isArray(items)) continue;
      items.forEach((item, i) => {
        const rec = (item && typeof item === 'object') ? (item as Record<string, unknown>) : undefined;
        const label = (rec?.id as string) ?? (rec?.name as string) ?? String(i + 1);
        pushModelSites(item, schema.items as FieldSchemaEntry, fieldName, label);
      });
      continue;
    }

    // dict<model> container → each value's list<reference> sub-fields, keyed by
    // the dict key (e.g. the considered alternative's name).
    if (schema.type === 'dict' && schema.values && !Array.isArray(schema.values) && schema.values.type === 'model') {
      const dict = data[fieldName];
      if (!dict || typeof dict !== 'object' || Array.isArray(dict)) continue;
      for (const [key, val] of Object.entries(dict as Record<string, unknown>)) {
        pushModelSites(val, schema.values as FieldSchemaEntry, fieldName, key);
      }
      continue;
    }
  }

  return sites;
}

/**
 * Every reference-bearing *path* declared by a set of field schemas, regardless
 * of whether an element populates it — e.g. `maps_to`, `related`,
 * `steps[].maps_to`, `considered{}.conflicts_with`.
 *
 * Exists so a test can assert that `collectReferenceSites` reaches every
 * `list<reference>` the schemas declare: if someone introduces a container
 * shape the walker does not understand, the two disagree and the test fails
 * rather than the bug shipping. This is the guard that keeps #22 from recurring
 * under a different field name.
 */
export function declaredReferencePaths(
  fieldSchemas: Record<string, FieldSchemaEntry>,
): string[] {
  const paths: string[] = ['maps_to'];

  const walk = (schema: FieldSchemaEntry, prefix: string): void => {
    if (schema.type === 'list' && schema.items) {
      if (schema.items.type === 'reference') {
        paths.push(prefix);
        return;
      }
      walkContainer(schema.items, `${prefix}[]`);
      return;
    }
    if (schema.type === 'dict' && schema.values && !Array.isArray(schema.values)) {
      walkContainer(schema.values, `${prefix}{}`);
      return;
    }
  };

  const walkContainer = (schema: FieldSchemaEntry, prefix: string): void => {
    if (schema.type !== 'model' || !schema.fields) return;
    for (const [subName, subSchema] of Object.entries(schema.fields)) {
      walk(subSchema, `${prefix}.${subName}`);
    }
  };

  for (const [fieldName, schema] of Object.entries(fieldSchemas)) {
    if (fieldName === 'maps_to') continue;
    walk(schema, fieldName);
  }

  return paths;
}
