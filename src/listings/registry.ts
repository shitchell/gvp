import type { Listing } from './base.js';
import { DocumentsListing } from './documents-listing.js';

/**
 * Built-in listing registry — the vocabulary `--list <type>` accepts.
 *
 * Shaped after createExporterRegistry() on purpose (gvp:P15, dogfood your
 * own abstractions): the set of listable kinds is DATA that the CLI looks
 * up, not a switch in the command. Adding `--list tags` or `--list sources`
 * later is a new class plus one line here, with no change to query.ts and
 * no new flag (personal:P8).
 */
export function createListingRegistry(): Map<string, Listing> {
  const registry = new Map<string, Listing>();
  for (const listing of [new DocumentsListing()]) {
    registry.set(listing.key, listing);
  }
  return registry;
}
