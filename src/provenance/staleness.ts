import type { Element } from '../model/element.js';
import type { UpdateEntry, ReviewEntry } from './schemas.js';

/**
 * Check if an element is stale (DEC-4.7).
 * An element is stale if it has any non-skip-review update whose ID
 * does not appear in any review's updates_reviewed list.
 */
export function isStale(element: Element): boolean {
  const updatedBy = (element.get('updated_by') ?? []) as UpdateEntry[];
  const reviewedBy = (element.get('reviewed_by') ?? []) as ReviewEntry[];

  // Get all reviewed update IDs across all reviews
  const reviewedUpdateIds = new Set<string>();
  for (const review of reviewedBy) {
    if (review.updates_reviewed) {
      for (const id of review.updates_reviewed) {
        reviewedUpdateIds.add(id);
      }
    }
  }

  // Check if any non-skip-review update is unreviewed
  for (const update of updatedBy) {
    if (update.skip_review) continue;
    if (!reviewedUpdateIds.has(update.id)) {
      return true; // This update hasn't been reviewed
    }
  }

  return false;
}

/**
 * Get the list of unreviewed update IDs for an element.
 */
export function getUnreviewedUpdates(element: Element): string[] {
  const updatedBy = (element.get('updated_by') ?? []) as UpdateEntry[];
  const reviewedBy = (element.get('reviewed_by') ?? []) as ReviewEntry[];

  const reviewedUpdateIds = new Set<string>();
  for (const review of reviewedBy) {
    if (review.updates_reviewed) {
      for (const id of review.updates_reviewed) {
        reviewedUpdateIds.add(id);
      }
    }
  }

  return updatedBy
    .filter(u => !u.skip_review && !reviewedUpdateIds.has(u.id))
    .map(u => u.id);
}
