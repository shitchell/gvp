import type { Catalog } from '../catalog/catalog.js';
import type { Element } from '../model/element.js';

/**
 * Inputs a listing reads. The caller (`cairn query`) has already applied
 * every element-level filter it supports; `elements` is that survivor set,
 * and it is the ONLY basis a listing may use for counting.
 *
 * `documentFilter` is the resolved `--document` selector (documentPaths), or
 * undefined for "every document in the catalog". It restricts which ROWS
 * appear; the element filters only change the COUNTS on those rows.
 */
export interface ListingOptions {
  elements: Element[];
  documentFilter?: Set<string>;
}

/**
 * A listing enumerates a KIND OF THING IN THE RESOLVED CATALOG (D61).
 *
 * The distinction against an Exporter is deliberate and is the whole reason
 * this is a separate abstraction rather than another `--format`: an exporter
 * chooses HOW to render the catalog's elements; a listing chooses WHAT to
 * enumerate. Conflating the two — `--format documents` — would put a
 * selector in the renderer slot, which personal:P3 ("separate what from how
 * at every layer") forbids.
 *
 * `rows()` is the stable machine-readable answer (D54: the consumer is an
 * agent-facing ruleset, so the JSON schema is the contract). `renderText()`
 * is a human convenience over exactly those rows, never a second derivation
 * — a text view computed independently could disagree with the JSON, and
 * two answers to one question is the V10 failure this split avoids.
 */
export abstract class Listing {
  /** The word the user types after `--list`. */
  abstract readonly key: string;
  /** Human label for error messages and help text. */
  abstract readonly name: string;
  /** One line describing what this listing enumerates. */
  abstract readonly description: string;

  abstract rows(catalog: Catalog, options: ListingOptions): Record<string, unknown>[];

  abstract renderText(rows: Record<string, unknown>[]): string;
}
