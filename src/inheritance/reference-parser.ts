/**
 * Parsed element reference (DEC-1.1c).
 * Segment count determines scope:
 * - 1 segment: element only (same document)
 * - 2 segments: document:element (same library)
 * - 3 segments: source:document:element (cross-library)
 */
export interface ElementReference {
  source?: string;
  document?: string;
  element: string;
  segmentCount: 1 | 2 | 3;
}

/**
 * Parse an element reference string.
 *
 * The colon `:` is the delimiter. Split into at most 3 parts.
 * A segment containing `/` is a document path, not a source+document split.
 *
 * Examples:
 *   "V1"              -> { element: "V1", segmentCount: 1 }
 *   "values:V1"       -> { document: "values", element: "V1", segmentCount: 2 }
 *   "org:values:V1"   -> { source: "org", document: "values", element: "V1", segmentCount: 3 }
 *   "@github:foo/bar:values:V1" -> { source: "@github:foo/bar", document: "values", element: "V1", segmentCount: 3 }
 */
export function parseReference(ref: string): ElementReference {
  // Handle @source: prefixes that contain colons (e.g., @github:foo/bar)
  // Pattern: @provider:path is always a source prefix
  let source: string | undefined;
  let remainder = ref;

  if (ref.startsWith('@')) {
    // Find the source boundary: @provider:path is the source
    // The source ends at the colon that separates it from the document
    // @github:foo/bar:values:V1 -> source=@github:foo/bar, rest=values:V1
    // Strategy: @provider:path where path contains / — everything up to the colon
    // after which the next segment does NOT contain /
    const parts = ref.split(':');
    // Build source from the front, stopping when we hit a segment that looks like a document:element
    let sourceEnd = 1; // At least @provider
    for (let i = 1; i < parts.length; i++) {
      if (parts[i]!.includes('/')) {
        sourceEnd = i + 1; // This segment is part of the source path
      } else {
        break;
      }
    }

    if (sourceEnd < parts.length) {
      source = parts.slice(0, sourceEnd).join(':');
      remainder = parts.slice(sourceEnd).join(':');
    } else {
      // Entire string is a source with no document:element
      return { element: ref, segmentCount: 1 };
    }
  }

  // Split remainder into segments
  // For non-@ references, we can have up to 3 colon-separated segments:
  //   element | document:element | source:document:element
  // For @ references, source is already extracted, so remainder is:
  //   element | document:element
  const parts = remainder.split(':');

  if (source) {
    // Source already extracted from @ prefix
    if (parts.length === 1) {
      // source:element (unusual but valid)
      return { source, element: parts[0]!, segmentCount: 3 };
    }
    // source:document:element — document may contain colons (unlikely but safe)
    const element = parts[parts.length - 1]!;
    const document = parts.slice(0, -1).join(':');
    return { source, document, element, segmentCount: 3 };
  }

  // No @ prefix: split into 1, 2, or 3 segments
  if (parts.length === 1) {
    return { element: parts[0]!, segmentCount: 1 };
  }

  if (parts.length === 2) {
    return { document: parts[0]!, element: parts[1]!, segmentCount: 2 };
  }

  // 3+ segments: first is source, last is element, middle is document
  const element = parts[parts.length - 1]!;
  const src = parts[0]!;
  const document = parts.slice(1, -1).join(':');
  return { source: src, document, element, segmentCount: 3 };
}
