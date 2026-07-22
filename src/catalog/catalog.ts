import type { Document } from '../model/document.js';
import type { Element } from '../model/element.js';
import type { ResolvedInheritance } from '../inheritance/inheritance-resolver.js';
import type { GVPConfig } from '../config/schema.js';
import { CategoryRegistry } from '../model/category-registry.js';
import { CatalogError } from '../errors.js';
import { loadDefaults } from '../schema/defaults-loader.js';
import {
  mergeDefinitions,
  type MergedDefinitions,
  type SourceDefinitionSnapshot,
} from './category-merger.js';
import { validateMergedCategories } from './post-merge-validation.js';
import {
  Graph,
  buildAncestorsGraph,
  buildDescendantsGraph,
} from '../model/graph.js';
import { matchRef, resolveRef, LOCAL_SOURCE, type RefMatch, type AliasMap } from '../refs/resolve-ref.js';
import { buildAliasMap } from '../inheritance/alias-resolver.js';

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
  /**
   * Document-local alias scopes (D39): docKey → that document's OWN `as:`
   * aliases. Aliases are `import as` sugar, private to the declaring document —
   * NOT inherited by importers — so resolution is scoped per source document.
   */
  private readonly _aliasScopesByDoc: Map<string, AliasMap>;
  /** Union of the local (`@local`) project's aliases — used for CLI-typed refs
   * that have no source element (e.g. `cairn inspect me:X`). */
  private readonly _localAliasUnion: AliasMap;

  constructor(resolvedInheritance: ResolvedInheritance, config: GVPConfig) {
    this._config = config;
    this._documents = resolvedInheritance.orderedDocuments;

    // Build per-document alias scopes (own-only) and the local-project union.
    this._aliasScopesByDoc = new Map();
    const localUnion: AliasMap = new Map();
    for (const doc of this._documents) {
      const own = buildAliasMap(doc.meta); // own `as:` declarations only
      this._aliasScopesByDoc.set(`${doc.source}:${doc.documentPath}`, own);
      if (doc.source === LOCAL_SOURCE) {
        for (const [alias, src] of own) localUnion.set(alias, src);
      }
    }
    this._localAliasUnion = localUnion;

    // Step 0: Apply config_overrides from documents (DEC-2.4, DEC-2.13)
    // Iterate in DFS order (ancestors first = ancestor-wins)
    const appliedOverrides = new Set<string>();
    for (const doc of this._documents) {
      const overrides = doc.meta.config_overrides;
      if (!overrides) continue;
      for (const [key, override] of Object.entries(overrides)) {
        // DEC-4.8: user identity is personal, excluded from config_overrides
        if (key === 'user') continue;
        if (override.mode === 'replace') {
          // Ancestor-wins: only set if not already set by an earlier ancestor
          if (!appliedOverrides.has(key)) {
            (this._config as Record<string, unknown>)[key] = override.value;
            appliedOverrides.add(key);
          }
        } else if (override.mode === 'additive') {
          // Accumulate: arrays concatenated, ancestor first
          const existing = (this._config as Record<string, unknown>)[key];
          if (Array.isArray(existing) && Array.isArray(override.value)) {
            (this._config as Record<string, unknown>)[key] = [...existing, ...override.value];
          } else {
            (this._config as Record<string, unknown>)[key] = override.value;
          }
        }
      }
    }

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
    let totalDocElements = 0;
    for (const doc of this._documents) {
      for (const element of doc.getAllElements()) {
        this._elements.set(element.hashKey(), element);
        const catElements = this._elementsByCategory.get(element.categoryName) ?? [];
        catElements.push(element);
        this._elementsByCategory.set(element.categoryName, catElements);
        totalDocElements++;
      }
    }

    // Invariant guard — no silent element drops (P13). If documents contain more
    // elements than the index, something was silently overwritten (e.g. duplicate
    // hashKeys across documents). This is an internal bug, not a user diagnostic —
    // it is deliberately NOT an E-code (E006 is the DUPLICATE_DOCUMENT_NAME
    // diagnostic).
    if (this._elements.size !== totalDocElements) {
      throw new CatalogError(
        `CATALOG_ELEMENT_DROP: documents contain ${totalDocElements} elements but catalog indexed ${this._elements.size}. This is a bug — elements were silently lost during catalog construction.`,
      );
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

  /**
   * The alias scope for a reference: the source element's document-local aliases
   * (D39), or the local-project union for CLI-typed refs with no source element.
   */
  private aliasScopeFor(fromElement?: Element): AliasMap {
    if (!fromElement) return this._localAliasUnion;
    return this._aliasScopesByDoc.get(`${fromElement.source}:${fromElement.documentPath}`) ?? new Map();
  }

  /**
   * Resolve a reference string to an element (DEC-6.4 revised, #11; D39).
   * Accepts `[<alias>:]<meta.name>:<id>` (path as fallback) and the canonical
   * `source:documentPath:id`. `fromElement` scopes the alias to that element's
   * document (aliases are `import as` — document-local, not inherited). Returns
   * undefined if not found or ambiguous — use resolveRefResult to distinguish.
   */
  resolveRef(ref: string, fromElement?: Element): Element | undefined {
    return resolveRef(ref, this.getAllElements(), this.aliasScopeFor(fromElement));
  }

  /** Resolve a reference with a discriminated result (ok | ambiguous | notfound). */
  resolveRefResult(ref: string, fromElement?: Element): RefMatch {
    return matchRef(ref, this.getAllElements(), this.aliasScopeFor(fromElement));
  }

  /** Get merged tag definitions */
  getTags(): Record<string, { description: string }> {
    return this._mergedDefinitions.tags;
  }

  /** Get per-source definition snapshot (DEC-2.12) */
  getSourceSnapshot(source: string): SourceDefinitionSnapshot | undefined {
    return this._mergedDefinitions.sourceSnapshots.get(source);
  }

  /** Build ancestors graph for an element (DEC-6.1, DEC-6.5) */
  ancestors(element: Element): Graph {
    return buildAncestorsGraph(element, (ref, from) => this.resolveRef(ref, from));
  }

  /** Build descendants graph for an element (DEC-6.1, DEC-6.5) */
  descendants(element: Element): Graph {
    return buildDescendantsGraph(element, this.getAllElements(), (ref, from) => this.resolveRef(ref, from));
  }
}
