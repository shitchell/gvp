/**
 * A single GVP element (DEC-6.2, DEC-6.3, DEC-6.4).
 *
 * Identity: (source, documentPath, id)
 * Equality: equals() compares identity tuple
 * String reps: toString(), toLibraryId(), toCanonicalId()
 */
export class Element {
  readonly id: string;
  readonly name: string;
  readonly status: string;
  readonly tags: string[];
  readonly maps_to: string[];
  readonly priority: number | undefined;
  readonly categoryName: string;
  readonly source: string;
  readonly documentPath: string;
  /**
   * The document's stable identity (meta.name), used for the library short
   * address `meta.name:id`. Falls back to documentPath when unknown (e.g. tests
   * constructing Elements directly). Identity/hashKey key on documentPath, not
   * this — reorganizing files changes documentPath but not documentName.
   */
  readonly documentName: string;

  /** All data including reserved + dynamic fields */
  private readonly _data: Record<string, unknown>;

  constructor(
    data: Record<string, unknown>,
    categoryName: string,
    source: string,
    documentPath: string,
    documentName?: string,
  ) {
    this.id = data.id as string;
    this.name = data.name as string;
    this.status = (data.status as string) ?? 'active';
    this.tags = (data.tags as string[]) ?? [];
    this.maps_to = (data.maps_to as string[]) ?? [];
    this.priority = data.priority as number | undefined;
    this.categoryName = categoryName;
    this.source = source;
    this.documentPath = documentPath;
    this.documentName = documentName ?? documentPath;
    this._data = data;
  }

  /** Get a dynamic field value by name */
  get(fieldName: string): unknown {
    return this._data[fieldName];
  }

  /** Get all data as a plain record */
  get data(): Record<string, unknown> {
    return { ...this._data };
  }

  /**
   * Human-readable display form (DEC-6.4).
   * E.g., 'V1: "Alignment"'
   */
  toString(): string {
    return `${this.id}: "${this.name}"`;
  }

  /**
   * Library short address (DEC-6.4, revised): `<meta.name>:<id>` (2-segment).
   * meta.name (not documentPath) so the address is stable across file reorg.
   * E.g., 'values:V1'. Disambiguate across inherited libraries with the
   * `as:` alias prefix (`org:values:V1`), resolved by Catalog.resolveRef.
   */
  toLibraryId(): string {
    return `${this.documentName}:${this.id}`;
  }

  /**
   * Fully qualified canonical ID (DEC-6.4, DEC-1.1b).
   * E.g., '@github:company/org-gvp:values:V1'
   */
  toCanonicalId(): string {
    return `${this.source}:${this.documentPath}:${this.id}`;
  }

  /**
   * Stable hash key for use as Map key (DEC-6.2).
   * Based on (source, documentPath, id) tuple.
   */
  hashKey(): string {
    return `${this.source}:${this.documentPath}:${this.id}`;
  }

  /**
   * Identity equality (DEC-6.2, DEC-6.3).
   * Based on (source, documentPath, id). Priority does NOT affect equality.
   */
  equals(other: Element): boolean {
    return (
      this.source === other.source &&
      this.documentPath === other.documentPath &&
      this.id === other.id
    );
  }
}
