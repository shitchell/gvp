import type { Document } from '../model/document.js';
import type { Element } from '../model/element.js';
import type { ResolvedInheritance } from '../inheritance/inheritance-resolver.js';
import type { GVPConfig } from '../config/schema.js';
import { CategoryRegistry } from '../model/category-registry.js';
import { loadDefaults } from '../schema/defaults-loader.js';
import {
  mergeDefinitions,
  type MergedDefinitions,
  type LibraryDefinitionSnapshot,
} from './category-merger.js';
import { validateMergedCategories } from './post-merge-validation.js';
import {
  Graph,
  buildAncestorsGraph,
  buildDescendantsGraph,
} from '../model/graph.js';

/**
 * The assembled, validated, queryable GVP catalog (DEC-5.7: construction fails fast).
 * Immutable after construction.
 */
export class Catalog {
  private readonly _config: GVPConfig;
  private readonly _registry: CategoryRegistry;
  private readonly _documents: Document[];
  private readonly _elements: Map<string, Element>; // hashKey -> Element
  private readonly _elementsByCategory: Map<string, Element[]>;
  private readonly _mergedDefinitions: MergedDefinitions;

  constructor(resolvedInheritance: ResolvedInheritance, config: GVPConfig) {
    this._config = config;
    this._documents = resolvedInheritance.orderedDocuments;

    // Step 1: Merge definitions across documents
    const defDirection = config.priority?.definitions ?? 'descendant';
    this._mergedDefinitions = mergeDefinitions(this._documents, defDirection);

    // Step 2: Build registry from defaults + merged user definitions
    const defaults = loadDefaults();
    let registry = CategoryRegistry.fromDefaults(defaults);
    if (Object.keys(this._mergedDefinitions.categories).length > 0 ||
        Object.keys(this._mergedDefinitions.allFieldSchemas).length > 0) {
      const userAll = Object.keys(this._mergedDefinitions.allFieldSchemas).length > 0
        ? { field_schemas: this._mergedDefinitions.allFieldSchemas }
        : undefined;
      registry = registry.merge(this._mergedDefinitions.categories, userAll);
    }
    this._registry = registry;

    // Step 3: Post-merge validation (DEC-3.6, DEC-5.7: throws on error)
    validateMergedCategories(registry.categories);

    // Step 4: Index all elements
    this._elements = new Map();
    this._elementsByCategory = new Map();
    for (const doc of this._documents) {
      for (const element of doc.getAllElements()) {
        this._elements.set(element.hashKey(), element);
        const catElements = this._elementsByCategory.get(element.categoryName) ?? [];
        catElements.push(element);
        this._elementsByCategory.set(element.categoryName, catElements);
      }
    }
  }

  get config(): GVPConfig {
    return this._config;
  }
  get registry(): CategoryRegistry {
    return this._registry;
  }
  get documents(): Document[] {
    return [...this._documents];
  }

  /** Get all elements across all documents */
  getAllElements(): Element[] {
    return [...this._elements.values()];
  }

  /** Get elements by category name */
  getElementsByCategory(categoryName: string): Element[] {
    return [...(this._elementsByCategory.get(categoryName) ?? [])];
  }

  /** Get element by hash key (source:documentPath:id) */
  getElement(hashKey: string): Element | undefined {
    return this._elements.get(hashKey);
  }

  /** Get merged tag definitions */
  getTags(): Record<string, { description: string }> {
    return this._mergedDefinitions.tags;
  }

  /** Get per-library definition snapshot (DEC-2.12) */
  getLibrarySnapshot(source: string): LibraryDefinitionSnapshot | undefined {
    return this._mergedDefinitions.librarySnapshots.get(source);
  }

  /** Build ancestors graph for an element (DEC-6.1, DEC-6.5) */
  ancestors(element: Element): Graph {
    return buildAncestorsGraph(element, (ref) => {
      return this.getAllElements().find(
        (e) => e.toLibraryId() === ref || e.hashKey() === ref,
      );
    });
  }

  /** Build descendants graph for an element (DEC-6.1, DEC-6.5) */
  descendants(element: Element): Graph {
    return buildDescendantsGraph(element, this.getAllElements());
  }
}
