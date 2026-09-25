import { z } from 'zod';
import { categoryDefinitionSchema } from '../schema/category-definition.js';

/** Single tag definition */
const tagEntrySchema = z.object({
  description: z.string(),
});

/**
 * Tag definitions: accepts both flat format (DEC-2.14) and nested v0 format.
 * Flat: { framework: { description: ... }, tooling: { description: ... } }
 * Nested: { domains: { framework: { description: ... } }, concerns: { ... } }
 * Nested format is flattened during parsing.
 */
const tagDefinitionSchema = z.record(z.string(), z.unknown()).transform((raw) => {
  const flat: Record<string, { description: string }> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (value && typeof value === 'object' && 'description' in value) {
      // Flat format: { tagname: { description: "..." } }
      flat[key] = value as { description: string };
    } else if (value && typeof value === 'object') {
      // Nested format: { groupname: { tagname: { description: "..." }, ... } }
      for (const [innerKey, innerValue] of Object.entries(value as Record<string, unknown>)) {
        if (innerValue && typeof innerValue === 'object' && 'description' in innerValue) {
          flat[innerKey] = innerValue as { description: string };
        }
      }
    }
  }
  return flat;
});

/** Document definitions block */
const definitionsSchema = z.object({
  tags: tagDefinitionSchema.optional(),
  categories: z.record(z.string(), categoryDefinitionSchema).optional(),
}).optional();

/** Config override entry (DEC-2.4, DEC-2.13) */
export const configOverrideEntrySchema = z.object({
  mode: z.enum(['replace', 'additive']),
  value: z.unknown(),
});

/**
 * Document-declared registry block (D43's 2026-09-25 amendment, #25).
 *
 * `enabled` is a SPELLING of the one registry opt-out mechanism,
 * `registry.enabled` — the same switch a config layer sets directly and
 * `--no-registry` sets on the already-loaded config. It is consumed by
 * src/registry/record.ts, which reduces it to that switch rather than
 * reimplementing recording suppression; the delegation is what keeps
 * P11 satisfied and what makes this a third spelling rather than a
 * third mechanism (P19).
 *
 * Its SCOPE is fixed by D60: a library-declared write side effect
 * governs the DECLARING library's own records only, never the consuming
 * invocation's. So it can only ever SUPPRESS the library it is declared
 * in — `enabled: true` cannot re-enable recording that the consumer's
 * config layer or `--no-registry` turned off.
 *
 * Declared here rather than left to `meta`'s `.passthrough()` for a
 * second reason: declaring it makes `registry` a RECOGNISED namespace,
 * and R12 then requires an unknown member of it (`meta.registry.enable`)
 * to produce W019 instead of validating clean and doing nothing — which
 * is precisely the #25 failure, one level down.
 *
 * `.passthrough()`, not strict: personal:V5 — unknown fields are
 * preserved, not filtered. W019 warns about them; it does not drop them.
 */
export const documentRegistrySchema = z.object({
  enabled: z.boolean().optional(),
}).passthrough();

/** Document meta schema */
export const documentMetaSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(), // DEC-3.X: human-readable "what is this document about" string, surfaced by renderers and discoverable by hook indexers
  id_prefix: z.string().optional(), // DOM-2: per-document id prefix
  inherits: z.union([
    z.string().transform(s => [s]),  // bare string -> array
    z.array(z.string()),
    z.array(z.object({
      source: z.string(),
      as: z.string().optional(),
    })),
    z.array(z.union([
      z.string(),
      z.object({ source: z.string(), as: z.string().optional() }),
    ])),
  ]).optional(),
  scope: z.string().optional(),
  defaults: z.record(z.string(), z.unknown()).optional(),
  definitions: definitionsSchema,
  config_overrides: z.record(z.string(), configOverrideEntrySchema).optional(), // DEC-2.4, DEC-2.13
  // R9 / #16: correlation id read by the library registry
  // (src/registry/record.ts). It was always read straight through
  // `.passthrough()`; declaring it here changes nothing about how it is
  // read, and is REQUIRED now that W019 exists — an undeclared key that
  // cairn nonetheless reads would otherwise be warned about as
  // unrecognized, which is the opposite of true.
  library_id: z.string().optional(),
  registry: documentRegistrySchema.optional(), // D43 amendment, D60, #25
}).passthrough();

export type DocumentMeta = z.infer<typeof documentMetaSchema>;

/**
 * The `meta` keys cairn recognizes, derived from the schema itself so the
 * two cannot drift. `meta` stays `.passthrough()` (personal:V5), so this
 * set is the input to a DIAGNOSTIC, not to a filter.
 */
export const KNOWN_META_KEYS: ReadonlySet<string> = new Set(Object.keys(documentMetaSchema.shape));

/**
 * Recognized `meta` sub-namespaces whose members are themselves a FIXED,
 * enumerable set — the only place R12's "and its sub-keys" clause can be
 * applied without inventing an answer.
 *
 * Deliberately not every nested mapping under `meta`:
 *   - `defaults`, `definitions.tags` and `definitions.categories` are
 *     keyed by user-chosen names (field names, tag names, category
 *     names). There is no unknown member to detect.
 *   - `config_overrides` is keyed by CONFIG keys, an open set by
 *     construction — the whole point of the mechanism is that it reaches
 *     any config key.
 * `registry` is the first sub-namespace with a closed membership, and
 * closing it is what #25 asked for.
 */
const META_NAMESPACES: Readonly<Record<string, ReadonlySet<string>>> = {
  registry: new Set(Object.keys(documentRegistrySchema.shape)),
};

/**
 * Members of `meta` (and of its recognized sub-namespaces) that cairn
 * does not recognize, as dotted paths — `foo`, `registry.enable`.
 *
 * Takes the RAW meta mapping, not the parsed one: parsing is where the
 * shape is normalized, and an unknown key is by definition something the
 * parse has no opinion about.
 *
 * Surfaced as W019 UNRECOGNIZED_META_KEY by the structural pass, exactly
 * as W016 surfaces unrecognized top-level document keys. R12: preserving
 * the member and warning about it are not alternatives — preserving
 * without warning trades a data-loss failure for a no-op failure, in
 * which the user's key survives, means nothing, and nothing says so.
 *
 * Names the key and stops there (P14): no "did you mean" inference.
 */
export function findUnrecognizedMetaKeys(rawMeta: unknown): string[] {
  if (!rawMeta || typeof rawMeta !== 'object' || Array.isArray(rawMeta)) return [];
  const found: string[] = [];
  for (const [key, value] of Object.entries(rawMeta as Record<string, unknown>)) {
    if (!KNOWN_META_KEYS.has(key)) {
      found.push(key);
      continue;
    }
    const members = META_NAMESPACES[key];
    if (!members) continue;
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    for (const member of Object.keys(value as Record<string, unknown>)) {
      if (!members.has(member)) found.push(`${key}.${member}`);
    }
  }
  return found;
}
