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
   * Set of element ids whose procedure `steps` had at least one step
   * missing an explicit `id` at parse time and received auto-assigned
   * step ids. Read by the semantic pass to emit W015
   * AUTO_ASSIGNED_STEP_ID warnings. This metadata does NOT flow through
   * JSON exports (it's carried on the Document, not in element data).
   */
  private readonly _autoAssignedStepIds: Set<string>;

  constructor(
    meta: DocumentMeta,
    elementsByCategory: Map<string, Element[]>,
    filePath: string,
    documentPath: string,
    source: string,
    autoAssignedStepIds: Set<string> = new Set(),
  ) {
    this.meta = meta;
    this._elementsByCategory = elementsByCategory;
    this.filePath = filePath;
    this.documentPath = documentPath;
    this.source = source;
    this._autoAssignedStepIds = new Set(autoAssignedStepIds);
  }

  /**
   * Did the given procedure element have any step ids auto-assigned at
   * parse time? Returns true if the user authored steps without explicit
   * ids and the parser filled them in sequentially.
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
