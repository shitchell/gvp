/**
 * Supported field types in GVP field_schemas (DEC-3.4, DEC-10.11, D20a).
 *
 * `reference` (D20a) is structurally identical to `string` at the Zod
 * level — any qualified element ID like "procedure:S1" or "gvp:P3" is a
 * valid string — but is semantically annotated so renderers, graph
 * exporters, and validators can recognize it as an element reference
 * without sniffing the data at runtime. It is an alternative to naming
 * fields in special-case renderer branches (P14 explicit over implicit).
 */
export type FieldType = 'string' | 'number' | 'boolean' | 'list' | 'dict' | 'model' | 'datetime' | 'enum' | 'reference';

/** All supported field types as a frozen array */
export const FIELD_TYPES: readonly FieldType[] = Object.freeze([
  'string', 'number', 'boolean', 'list', 'dict', 'model', 'datetime', 'enum', 'reference',
] as const);

/** Type guard for FieldType */
export function isFieldType(value: string): value is FieldType {
  return (FIELD_TYPES as readonly string[]).includes(value);
}
