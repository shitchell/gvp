/** Supported field types in GVP field_schemas (DEC-3.4, DEC-10.11) */
export type FieldType = 'string' | 'number' | 'boolean' | 'list' | 'dict' | 'model' | 'datetime' | 'enum';

/** All supported field types as a frozen array */
export const FIELD_TYPES: readonly FieldType[] = Object.freeze([
  'string', 'number', 'boolean', 'list', 'dict', 'model', 'datetime', 'enum',
] as const);

/** Type guard for FieldType */
export function isFieldType(value: string): value is FieldType {
  return (FIELD_TYPES as readonly string[]).includes(value);
}
