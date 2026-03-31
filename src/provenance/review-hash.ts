import { createHash } from 'crypto';

/**
 * Compute a review hash from pending update IDs (DEC-4.5).
 * The hash encodes which updates were shown during review.
 * Used for --approve token validation.
 */
export function computeReviewHash(updateIds: string[]): string {
  const sorted = [...updateIds].sort();
  const data = sorted.join(':');
  return createHash('sha256').update(data).digest('hex').substring(0, 16);
}

/**
 * Validate a review hash against pending update IDs.
 */
export function validateReviewHash(hash: string, updateIds: string[]): boolean {
  return computeReviewHash(updateIds) === hash;
}
