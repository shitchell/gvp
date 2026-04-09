import type { Element } from '../model/element.js';
import type { Catalog } from '../catalog/catalog.js';
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
  // Two loops: first _all field_schemas (universal fields like
  // summary), then per-category field_schemas. _all fields render
  // first because they tend to be high-level metadata (summary)
  // that should appear before category-specific structure (steps,
  // considered). Both skip reserved fields (handled in the
  // preamble) and the primary field (rendered as body above).
  const allFieldSchemas = catalog.registry.allFieldSchemas;
  const allFieldNames = new Set(Object.keys(allFieldSchemas));
  const perCategoryFieldSchemas = catDef.field_schemas ?? {};

  // 5a. Universal fields from _all.field_schemas (e.g., summary)
  for (const [fieldName, schema] of Object.entries(allFieldSchemas)) {
    if (RESERVED_FIELD_NAMES.has(fieldName)) continue;
    if (fieldName === primaryField) continue;
    const value = element.get(fieldName);
    if (value === undefined || value === null) continue;
    if (Array.isArray(value) && value.length === 0) continue;
    if (typeof value === 'object' && !Array.isArray(value) && Object.keys(value as object).length === 0) continue;

    const rendered = renderFieldByShape(
      displayLabel(fieldName, schema),
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

  // 5b. Per-category fields (skip _all fields — rendered in 5a)
  for (const [fieldName, schema] of Object.entries(perCategoryFieldSchemas)) {
    if (RESERVED_FIELD_NAMES.has(fieldName)) continue;
    if (allFieldNames.has(fieldName)) continue;
    if (fieldName === primaryField) continue;
    const value = element.get(fieldName);
    if (value === undefined || value === null) continue;
    if (Array.isArray(value) && value.length === 0) continue;
    if (typeof value === 'object' && !Array.isArray(value) && Object.keys(value as object).length === 0) continue;

    const rendered = renderFieldByShape(
      displayLabel(fieldName, schema),
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
 * Dispatch one element field to the appropriate shape handler.
 * `label` is the resolved display label (already takes display_name
 * into account, falling back to the title-cased field name).
 * Returns an empty string if the shape is unrenderable at the current
 * depth or the value is vacuous.
 */
function renderFieldByShape(
  label: string,
  value: unknown,
  schema: FieldSchemaEntry,
  catalog: Catalog,
  depth: number,
  maxDepth: number,
): string {
  switch (schema.type) {
    case 'string':
      return renderStringField(label, value);

    case 'number':
    case 'boolean':
    case 'enum':
    case 'datetime':
      return renderScalarField(label, value);

    case 'reference':
      return renderReferenceField(label, value, catalog);

    case 'list':
      return renderListField(label, value, schema, catalog, depth, maxDepth);

    case 'dict':
      return renderDictField(label, value, schema, catalog, depth, maxDepth);

    case 'model':
      return renderNestedModel(label, value, schema, catalog, depth, maxDepth);

    default:
      return '';
  }
}

// -- Scalar handlers --

/**
 * Resolve the display label for a field. Prefers `display_name` from
 * the schema if set, otherwise title-cases the raw field name. Lets
 * libraries override pretty labels (e.g., decision.considered ->
 * "Considered alternatives") without any field-name branches in the
 * renderer.
 */
function displayLabel(fieldName: string, schema: FieldSchemaEntry): string {
  if (schema.display_name && schema.display_name.length > 0) {
    return schema.display_name;
  }
  return titleCaseFieldName(fieldName);
}

function renderScalarField(label: string, value: unknown): string {
  return `**${label}:** ${String(value)}`;
}

function renderStringField(label: string, value: unknown): string {
  const text = String(value);
  return `**${label}:**\n\n${text}`;
}

function renderReferenceField(
  label: string,
  value: unknown,
  catalog: Catalog,
): string {
  if (typeof value !== 'string') return '';
  const resolved = resolveElementRef(value, catalog);
  if (resolved) {
    return `**${label}:** ${value}  *(${resolved.name})*`;
  }
  return `**${label}:** ${value}`;
}

// -- List handlers --

function renderListField(
  label: string,
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
    return `**${label}:** ${formatted}`;
  }

  // list<reference> → subsection with each id + resolved name preview
  if (items.type === 'reference') {
    const lines: string[] = [`**${label}:**`];
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
      return `**${label}:** *(${value.length} item${value.length === 1 ? '' : 's'}; nested depth limit reached)*`;
    }
    const lines: string[] = [`**${label}:**`, ''];
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
  return renderJsonFallback(label, value);
}

// -- Dict handlers --

function renderDictField(
  label: string,
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
      return `**${label}:** *(${entries.length} entr${entries.length === 1 ? 'y' : 'ies'}; nested depth limit reached)*`;
    }
    const lines: string[] = [`**${label}:**`, ''];
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
    return `**${label}:** ${parts}`;
  }

  return renderJsonFallback(label, value);
}

// -- Nested model handler --

function renderNestedModel(
  label: string,
  value: unknown,
  schema: FieldSchemaEntry,
  catalog: Catalog,
  depth: number,
  maxDepth: number,
): string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '';
  if (depth >= maxDepth) {
    return `**${label}:** *(nested depth limit reached)*`;
  }
  const lines: string[] = [`**${label}:**`, ''];
  const fields = schema.fields ?? {};
  for (const [subField, subSchema] of Object.entries(fields)) {
    const subValue = (value as Record<string, unknown>)[subField];
    if (subValue === undefined || subValue === null) continue;
    const rendered = renderFieldByShape(displayLabel(subField, subSchema), subValue, subSchema, catalog, depth + 1, maxDepth);
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

  // Continuation indent matches the visual width of the list marker
  // (`${index}. `) — 3 for indices 1-9, 4 for 10-99, etc. Per
  // CommonMark, continuation content inside a list item must be
  // indented at least this much or it escapes the item.
  const indent = ' '.repeat(`${index}. `.length);

  // Body: the first scalar field after id/name, if declared
  // (typically `description` on a step; `rationale` on a considered
  // alternative). This is shape-driven: we walk the declared fields
  // in order and pick the first string-type value.
  //
  // Multi-line bodies (block scalars, embedded code fences,
  // paragraph breaks) must have the continuation indent applied to
  // EVERY line, not just the first — otherwise subsequent lines at
  // column 0 break out of the list item per CommonMark, and nested
  // code fences' closing markers end up escaping the item entirely.
  const bodyField = pickBodyField(fields, model);
  if (bodyField) {
    const bodyValue = model[bodyField];
    if (typeof bodyValue === 'string' && bodyValue.trim() !== '') {
      lines.push(indentContinuation(bodyValue.trim(), indent));
    }
  }

  // Remaining fields in declared order (excluding id, name, body).
  // Each emitted field is preceded by a blank continuation-indented
  // line so that CommonMark treats consecutive labeled fields as
  // separate paragraphs rather than one run-on block.
  for (const [subField, subSchema] of Object.entries(fields)) {
    if (subField === 'id' || subField === 'name' || subField === bodyField) continue;
    const subValue = model[subField];
    if (subValue === undefined || subValue === null) continue;
    if (Array.isArray(subValue) && subValue.length === 0) continue;
    const rendered = renderFieldByShape(displayLabel(subField, subSchema), subValue, subSchema, catalog, depth + 1, maxDepth);
    if (rendered) {
      lines.push(indent); // blank continuation-indented separator line
      lines.push(indentContinuation(rendered, indent));
    }
  }

  return lines.join('\n');
}

/**
 * Prefix every line of `text` with `indent`, so that multi-line
 * content (paragraphs, code fences, nested lists) preserves the
 * caller's indentation on continuation lines. Used by
 * renderModelBlock so a step body with embedded paragraphs or a
 * code fence stays inside its list item per CommonMark, rather
 * than having subsequent lines flush-left at column 0 and
 * escaping the list.
 */
function indentContinuation(text: string, indent: string): string {
  return indent + text.split('\n').join('\n' + indent);
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
    const rendered = renderFieldByShape(displayLabel(subField, subSchema), subValue, subSchema, catalog, depth + 1, maxDepth);
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

function renderJsonFallback(label: string, value: unknown): string {
  return `**${label}:**\n\n\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\``;
}

/** Truncate a string for preview contexts. */
export function truncatePreview(s: string, maxLen = PREVIEW_MAX_CHARS): string {
  const clean = s.trim().replace(/\s+/g, ' ');
  if (clean.length <= maxLen) return clean;
  return clean.slice(0, maxLen - 1) + '…';
}
