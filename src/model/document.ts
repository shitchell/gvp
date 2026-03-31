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

  constructor(
    meta: DocumentMeta,
    elementsByCategory: Map<string, Element[]>,
    filePath: string,
    documentPath: string,
    source: string,
  ) {
    this.meta = meta;
    this._elementsByCategory = elementsByCategory;
    this.filePath = filePath;
    this.documentPath = documentPath;
    this.source = source;
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
