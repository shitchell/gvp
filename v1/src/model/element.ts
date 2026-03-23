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

  /** All data including reserved + dynamic fields */
  private readonly _data: Record<string, unknown>;

  constructor(
    data: Record<string, unknown>,
    categoryName: string,
    source: string,
    documentPath: string,
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
   * Within-library qualified reference (DEC-6.4, DEC-1.1c 2-segment).
   * E.g., 'values:V1'
   */
  toLibraryId(): string {
    return `${this.documentPath}:${this.id}`;
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
