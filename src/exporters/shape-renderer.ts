import type { Element } from '../model/element.js';
import type { Catalog } from '../catalog/catalog.js';
import type { CategoryDefinition } from '../schema/category-definition.js';
import type { FieldSchemaEntry } from '../schema/field-schema.js';
import { RESERVED_FIELD_NAMES } from '../schema/reserved-fields.js';

/**
 * Shape-based markdown rendering for GVP elements (D20a, D19, P15).
 *
 * The renderer is generic over category: it iterates an element's
 * declared fields (from the category registry's merged field_schemas)
 * and dispatches each field to a handler based on its DECLARED TYPE,
 * not its name or category. Reserved fields (id, name, tags, maps_to,
 * status, priority, origin, updated_by, reviewed_by) are handled in a
 * fixed preamble section because they are structurally universal.
 * The primary_field of the category is rendered as a paragraph body
 * immediately after the header. Everything else is declared-field
 * dispatch with no category or field name branches.
 *
 * This module is intentionally standalone and not wired into the
 * markdown exporter or inspect command yet (C.1). C.2 and C.3 swap
 * those call sites to use this renderer.
 */

export interface RenderOptions {
  /** Maximum depth to expand model fields recursively. Default: 3. */
  maxModelDepth?: number;
  /** Suppress the `### id: name` heading (caller renders its own). */
  suppressHeading?: boolean;
}

const DEFAULT_MAX_MODEL_DEPTH = 3;
const PREVIEW_MAX_CHARS = 100;

/**
 * Render a single element as markdown using the shape-based rule.
 * The category definition and merged field schemas are read from the
 * catalog's registry; the element's data drives which fields are
 * emitted.
 */
export function renderElementMarkdown(
  element: Element,
  catalog: Catalog,
  options: RenderOptions = {},
): string {
  const maxDepth = options.maxModelDepth ?? DEFAULT_MAX_MODEL_DEPTH;
  const catDef = catalog.registry.getByName(element.categoryName);
  if (!catDef) return '';

  const lines: string[] = [];

  // 1. Header
  if (!options.suppressHeading) {
    lines.push(`### ${element.id}: ${element.name}`);
    lines.push('');
  }

  // 2. Reserved inline preamble (status, primary, tags, maps_to, priority)
  if (element.status !== 'active') {
    lines.push(`**Status:** ${element.status}`);
    lines.push('');
  }

  // 3. Primary field body (from the registry, not a hard-coded name)
  const primaryField = catDef.primary_field ?? 'statement';
  const primaryValue = element.get(primaryField);
  if (primaryValue !== undefined && primaryValue !== null && primaryValue !== '') {
    lines.push(String(primaryValue).trim());
    lines.push('');
  }

  // 4. Reserved list-ish fields
  if (element.tags.length > 0) {
    lines.push(`**Tags:** ${element.tags.join(', ')}`);
    lines.push('');
  }
  if (element.maps_to.length > 0) {
    lines.push(`**Maps to:** ${element.maps_to.join(', ')}`);
    lines.push('');
  }
  if (element.priority !== undefined) {
    lines.push(`**Priority:** ${element.priority}`);
    lines.push('');
  }

  // 5. Dynamic fields in declared order, dispatched by shape.
  const fieldSchemas = mergedFieldSchemasFor(catDef, catalog);
  for (const [fieldName, schema] of Object.entries(fieldSchemas)) {
    if (RESERVED_FIELD_NAMES.has(fieldName)) continue;
    if (fieldName === primaryField) continue;
    const value = element.get(fieldName);
    if (value === undefined || value === null) continue;
    if (Array.isArray(value) && value.length === 0) continue;
    if (typeof value === 'object' && !Array.isArray(value) && Object.keys(value as object).length === 0) continue;

    const rendered = renderFieldByShape(
      fieldName,
      value,
      schema,
      catalog,
      0,
      maxDepth,
    );
    if (rendered) {
      lines.push(rendered);
      lines.push('');
    }
  }

  // Trim trailing blank line for cleaner joining by callers
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();

  return lines.join('\n');
}

/**
 * Merge _all field_schemas with per-category field_schemas, preserving
 * per-category's field order on top of _all's order. This matches how
 * buildCategoryElementSchema merges them for validation but keeps the
 * original insertion order for rendering.
 */
function mergedFieldSchemasFor(
  catDef: CategoryDefinition,
  catalog: Catalog,
): Record<string, FieldSchemaEntry> {
  const allFieldSchemas = catalog.registry.allFieldSchemas;
  // Per-category wins on collision (DEC-2.8).
  return { ...allFieldSchemas, ...(catDef.field_schemas ?? {}) };
}

/**
 * Dispatch one element field to the appropriate shape handler. Returns
 * an empty string if the shape is unrenderable at the current depth or
 * the value is vacuous.
 */
function renderFieldByShape(
  fieldName: string,
  value: unknown,
  schema: FieldSchemaEntry,
  catalog: Catalog,
  depth: number,
  maxDepth: number,
): string {
  switch (schema.type) {
    case 'string':
    case 'number':
    case 'boolean':
    case 'enum':
    case 'datetime':
      return renderScalarField(fieldName, value);

    case 'reference':
      return renderReferenceField(fieldName, value, catalog);

    case 'list':
      return renderListField(fieldName, value, schema, catalog, depth, maxDepth);

    case 'dict':
      return renderDictField(fieldName, value, schema, catalog, depth, maxDepth);

    case 'model':
      return renderNestedModel(fieldName, value, schema, catalog, depth, maxDepth);

    default:
      return '';
  }
}

// -- Scalar handlers --

function renderScalarField(fieldName: string, value: unknown): string {
  return `**${titleCaseFieldName(fieldName)}:** ${String(value)}`;
}

function renderReferenceField(
  fieldName: string,
  value: unknown,
  catalog: Catalog,
): string {
  if (typeof value !== 'string') return '';
  const resolved = resolveElementRef(value, catalog);
  if (resolved) {
    return `**${titleCaseFieldName(fieldName)}:** ${value}  *(${resolved.name})*`;
  }
  return `**${titleCaseFieldName(fieldName)}:** ${value}`;
}

// -- List handlers --

function renderListField(
  fieldName: string,
  value: unknown,
  schema: FieldSchemaEntry,
  catalog: Catalog,
  depth: number,
  maxDepth: number,
): string {
  if (!Array.isArray(value) || value.length === 0) return '';
  const items = schema.items;

  // Untyped list or typed list of primitives → inline summary
  if (!items || items.type === 'string' || items.type === 'number' || items.type === 'boolean' || items.type === 'enum' || items.type === 'datetime') {
    const formatted = value.map((v) => String(v)).join(', ');
    return `**${titleCaseFieldName(fieldName)}:** ${formatted}`;
  }

  // list<reference> → subsection with each id + resolved name preview
  if (items.type === 'reference') {
    const lines: string[] = [`**${titleCaseFieldName(fieldName)}:**`];
    for (const ref of value) {
      if (typeof ref !== 'string') continue;
      const resolved = resolveElementRef(ref, catalog);
      if (resolved) {
        lines.push(`- ${ref} — *${resolved.name}*`);
      } else {
        lines.push(`- ${ref}`);
      }
    }
    return lines.join('\n');
  }

  // list<model> → numbered subsection, each model rendered as a
  // named block via the model-block handler
  if (items.type === 'model') {
    if (depth >= maxDepth) {
      return `**${titleCaseFieldName(fieldName)}:** *(${value.length} item${value.length === 1 ? '' : 's'}; nested depth limit reached)*`;
    }
    const lines: string[] = [`**${titleCaseFieldName(fieldName)}:**`, ''];
    let index = 1;
    for (const item of value) {
      if (!item || typeof item !== 'object') {
        lines.push(`${index}. ${String(item)}`);
        index++;
        continue;
      }
      lines.push(renderModelBlock(item as Record<string, unknown>, items, catalog, depth + 1, maxDepth, index));
      lines.push('');
      index++;
    }
    // Trim final blank
    while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
    return lines.join('\n');
  }

  // list<list> or list<dict> — unusual, render as fenced JSON for
  // visibility; this is a structural fallback, not a primary shape
  return renderJsonFallback(fieldName, value);
}

// -- Dict handlers --

function renderDictField(
  fieldName: string,
  value: unknown,
  schema: FieldSchemaEntry,
  catalog: Catalog,
  depth: number,
  maxDepth: number,
): string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '';
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0) return '';

  const values = schema.values;

  // dict<model> (e.g., decision.considered) → bulleted subsection
  // with each named entry rendered via the model-block handler,
  // keyed by the entry's name
  if (values && !Array.isArray(values) && values.type === 'model') {
    if (depth >= maxDepth) {
      return `**${titleCaseFieldName(fieldName)}:** *(${entries.length} entr${entries.length === 1 ? 'y' : 'ies'}; nested depth limit reached)*`;
    }
    const lines: string[] = [`**${titleCaseFieldName(fieldName)}:**`, ''];
    for (const [entryName, entryValue] of entries) {
      if (!entryValue || typeof entryValue !== 'object') continue;
      const displayName = titleCaseDictKey(entryName);
      // Render the nested model with the dict key promoted as the
      // primary label. The shared helper does the field walk.
      lines.push(
        renderNamedDictEntry(
          displayName,
          entryValue as Record<string, unknown>,
          values,
          catalog,
          depth + 1,
          maxDepth,
        ),
      );
    }
    // Trim final blank
    while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
    return lines.join('\n');
  }

  // dict<scalar> → compact inline summary
  if (values && !Array.isArray(values) && (values.type === 'string' || values.type === 'number' || values.type === 'boolean' || values.type === 'enum')) {
    const parts = entries.map(([k, v]) => `${k}=${String(v)}`).join(', ');
    return `**${titleCaseFieldName(fieldName)}:** ${parts}`;
  }

  return renderJsonFallback(fieldName, value);
}

// -- Nested model handler --

function renderNestedModel(
  fieldName: string,
  value: unknown,
  schema: FieldSchemaEntry,
  catalog: Catalog,
  depth: number,
  maxDepth: number,
): string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '';
  if (depth >= maxDepth) {
    return `**${titleCaseFieldName(fieldName)}:** *(nested depth limit reached)*`;
  }
  const lines: string[] = [`**${titleCaseFieldName(fieldName)}:**`, ''];
  const fields = schema.fields ?? {};
  for (const [subField, subSchema] of Object.entries(fields)) {
    const subValue = (value as Record<string, unknown>)[subField];
    if (subValue === undefined || subValue === null) continue;
    const rendered = renderFieldByShape(subField, subValue, subSchema, catalog, depth + 1, maxDepth);
    if (rendered) lines.push(rendered);
  }
  return lines.join('\n');
}

// -- Model-block handler (shared by list<model>) --

/**
 * Render a single model-shaped object as a named block. Used for
 * list<model> items (e.g., procedure.steps). Each model gets a
 * heading derived from its id/name fields, followed by a body
 * derived from the first scalar-ish field, followed by nested
 * renders of its other declared fields.
 */
function renderModelBlock(
  model: Record<string, unknown>,
  itemSchema: FieldSchemaEntry,
  catalog: Catalog,
  depth: number,
  maxDepth: number,
  index: number,
): string {
  const lines: string[] = [];
  const fields = itemSchema.fields ?? {};

  // Heading: prefer "id: name" > "name" > "(index)"
  const id = model.id;
  const name = model.name;
  let heading: string;
  if (typeof id === 'string' && typeof name === 'string') {
    heading = `${index}. **${id}** — ${name}`;
  } else if (typeof name === 'string') {
    heading = `${index}. ${name}`;
  } else if (typeof id === 'string') {
    heading = `${index}. **${id}**`;
  } else {
    heading = `${index}.`;
  }
  lines.push(heading);

  // Body: the first scalar field after id/name, if declared
  // (typically `description` on a step; `rationale` on a considered
  // alternative). This is shape-driven: we walk the declared fields
  // in order and pick the first string-type value.
  const bodyField = pickBodyField(fields, model);
  if (bodyField) {
    const bodyValue = model[bodyField];
    if (typeof bodyValue === 'string' && bodyValue.trim() !== '') {
      lines.push(`   ${bodyValue.trim()}`);
    }
  }

  // Remaining fields in declared order (excluding id, name, body)
  for (const [subField, subSchema] of Object.entries(fields)) {
    if (subField === 'id' || subField === 'name' || subField === bodyField) continue;
    const subValue = model[subField];
    if (subValue === undefined || subValue === null) continue;
    if (Array.isArray(subValue) && subValue.length === 0) continue;
    const rendered = renderFieldByShape(subField, subValue, subSchema, catalog, depth + 1, maxDepth);
    if (rendered) {
      lines.push(`   ${rendered.split('\n').join('\n   ')}`);
    }
  }

  return lines.join('\n');
}

/**
 * Render a single dict<model> entry (e.g., decision.considered's
 * `plain_javascript` key). The dict key is promoted to the heading,
 * the rest of the fields are rendered like a model block.
 */
function renderNamedDictEntry(
  displayName: string,
  model: Record<string, unknown>,
  itemSchema: FieldSchemaEntry,
  catalog: Catalog,
  depth: number,
  maxDepth: number,
): string {
  const fields = itemSchema.fields ?? {};
  const bodyField = pickBodyField(fields, model);
  const bodyValue = bodyField ? model[bodyField] : undefined;
  if (typeof bodyValue === 'string' && bodyValue.trim() !== '') {
    return `- **${displayName}** — *${bodyValue.trim()}*`;
  }
  // No obvious body field — render each declared sub-field
  const lines: string[] = [`- **${displayName}**`];
  for (const [subField, subSchema] of Object.entries(fields)) {
    const subValue = model[subField];
    if (subValue === undefined || subValue === null) continue;
    const rendered = renderFieldByShape(subField, subValue, subSchema, catalog, depth + 1, maxDepth);
    if (rendered) lines.push(`  ${rendered}`);
  }
  return lines.join('\n');
}

/**
 * Pick the "body" field of a model — the first declared field whose
 * type is `string` and whose value is a non-empty string, excluding
 * id/name. Returns undefined if no such field exists.
 */
function pickBodyField(
  fields: Record<string, FieldSchemaEntry>,
  model: Record<string, unknown>,
): string | undefined {
  for (const [fieldName, schema] of Object.entries(fields)) {
    if (fieldName === 'id' || fieldName === 'name') continue;
    if (schema.type !== 'string') continue;
    const value = model[fieldName];
    if (typeof value === 'string' && value.trim() !== '') {
      return fieldName;
    }
  }
  return undefined;
}

// -- Helpers --

/**
 * Convert a field name like `considered` or `steps` or `maps_to`
 * into a Title Case display label ("Considered", "Steps", "Maps To").
 * Replaces underscores and hyphens with spaces.
 */
function titleCaseFieldName(name: string): string {
  return name
    .replace(/[_-]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/**
 * Dict keys are often snake_case identifiers meant as display labels
 * (e.g., `plain_javascript` → "Plain Javascript"). Use the same
 * title-case transform but preserve intra-word capitalization on
 * fragments we do not split.
 */
function titleCaseDictKey(key: string): string {
  return titleCaseFieldName(key);
}

function resolveElementRef(ref: string, catalog: Catalog): Element | undefined {
  for (const el of catalog.getAllElements()) {
    if (el.toLibraryId() === ref || el.hashKey() === ref) return el;
  }
  return undefined;
}

function renderJsonFallback(fieldName: string, value: unknown): string {
  return `**${titleCaseFieldName(fieldName)}:**\n\n\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\``;
}

/** Truncate a string for preview contexts. */
export function truncatePreview(s: string, maxLen = PREVIEW_MAX_CHARS): string {
  const clean = s.trim().replace(/\s+/g, ' ');
  if (clean.length <= maxLen) return clean;
  return clean.slice(0, maxLen - 1) + '…';
}
