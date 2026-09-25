import type { DocumentMeta } from './document-meta.js';
import type { Element } from './element.js';
import type { CategoryDefinition } from '../schema/category-definition.js';

/**
 * A loaded GVP YAML document.
 */
export class Document {
  readonly meta: DocumentMeta;
  readonly filePath: string;
  readonly documentPath: string; // relative path without extension
  readonly source: string;
  private readonly _elementsByCategory: Map<string, Element[]>;
  /**
   * Set of element ids whose list<model> items had at least one item
   * missing an explicit `id` at parse time and received auto-assigned
   * ids. Read by the semantic pass to emit W015 AUTO_ASSIGNED_STEP_ID
   * warnings. This metadata does NOT flow through JSON exports (it's
   * carried on the Document, not in element data).
   */
  private readonly _autoAssignedStepIds: Set<string>;
  /**
   * Top-level YAML keys that were present in the document but did not
   * match `meta` or any known category `yaml_key` at parse time.
   * Surfaced by the structural pass as W016 UNRECOGNIZED_YAML_KEY.
   */
  readonly unrecognizedKeys: string[];
  /**
   * Members of the `meta` block (and of its recognized sub-namespaces,
   * e.g. `registry.*`) that cairn does not recognize, as dotted paths.
   * Surfaced by the structural pass as W019 UNRECOGNIZED_META_KEY.
   *
   * Mirrors `unrecognizedKeys` one level down: `meta` is `.passthrough()`
   * and stays that way (personal:V5), so the keys are PRESERVED on
   * `this.meta` as well as reported here (R12 — both, not either).
   */
  readonly unrecognizedMetaKeys: string[];

  constructor(
    meta: DocumentMeta,
    elementsByCategory: Map<string, Element[]>,
    filePath: string,
    documentPath: string,
    source: string,
    autoAssignedStepIds: Set<string> = new Set(),
    unrecognizedKeys: string[] = [],
    unrecognizedMetaKeys: string[] = [],
  ) {
    this.meta = meta;
    this._elementsByCategory = elementsByCategory;
    this.filePath = filePath;
    this.documentPath = documentPath;
    this.source = source;
    this._autoAssignedStepIds = new Set(autoAssignedStepIds);
    this.unrecognizedKeys = [...unrecognizedKeys];
    this.unrecognizedMetaKeys = [...unrecognizedMetaKeys];
  }

  /**
   * Did the given element have any list<model> item ids auto-assigned at
   * parse time? Returns true if the user authored list items without
   * explicit ids and the parser filled them in sequentially.
   */
  hasAutoAssignedStepIds(elementId: string): boolean {
    return this._autoAssignedStepIds.has(elementId);
  }

  /** Get elements for a specific category */
  getElementsByCategory(categoryName: string): Element[] {
    return this._elementsByCategory.get(categoryName) ?? [];
  }

  /** Get all elements across all categories */
  getAllElements(): Element[] {
    const all: Element[] = [];
    for (const elements of this._elementsByCategory.values()) {
      all.push(...elements);
    }
    return all;
  }

  /** Get tag definitions from meta.definitions.tags */
  getTagDefinitions(): Record<string, { description: string }> {
    return this.meta.definitions?.tags ?? {};
  }

  /** Get user-defined category definitions from meta.definitions.categories */
  getCategoryDefinitions(): Record<string, CategoryDefinition> {
    return (this.meta.definitions?.categories ?? {}) as Record<string, CategoryDefinition>;
  }

  /** Get document name (from meta.name, falls back to documentPath) */
  get name(): string {
    return this.meta.name ?? this.documentPath;
  }
}
