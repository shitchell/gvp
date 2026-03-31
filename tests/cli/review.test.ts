import { describe, it, expect } from 'vitest';
import { computeReviewHash, validateReviewHash } from '../../src/provenance/review-hash.js';
import { isStale, getUnreviewedUpdates } from '../../src/provenance/staleness.js';
import { Element } from '../../src/model/element.js';

describe('gvp review (CMD-6)', () => {
  it('identifies stale elements', () => {
    const el = new Element({
      id: 'P1', name: 'Test', status: 'active',
      updated_by: [{ id: 'u1', date: '2026-03-20', rationale: 'changed', skip_review: false }],
      reviewed_by: [],
    }, 'principle', '@local', 'doc');
    expect(isStale(el)).toBe(true);
    expect(getUnreviewedUpdates(el)).toEqual(['u1']);
  });

  it('does not flag elements with all updates reviewed', () => {
    const el = new Element({
      id: 'P2', name: 'Reviewed', status: 'active',
      updated_by: [{ id: 'u1', date: '2026-03-20', rationale: 'changed', skip_review: false }],
      reviewed_by: [{ id: 'r1', date: '2026-03-21', updates_reviewed: ['u1'] }],
    }, 'principle', '@local', 'doc');
    expect(isStale(el)).toBe(false);
    expect(getUnreviewedUpdates(el)).toEqual([]);
  });

  it('does not flag skip_review updates as stale', () => {
    const el = new Element({
      id: 'P3', name: 'Skipped', status: 'active',
      updated_by: [{ id: 'u1', date: '2026-03-20', rationale: 'typo fix', skip_review: true }],
      reviewed_by: [],
    }, 'principle', '@local', 'doc');
    expect(isStale(el)).toBe(false);
    expect(getUnreviewedUpdates(el)).toEqual([]);
  });

  it('review hash validates correctly', () => {
    const ids = ['u1', 'u2'];
    const hash = computeReviewHash(ids);
    expect(validateReviewHash(hash, ids)).toBe(true);
    expect(validateReviewHash(hash, ['u1'])).toBe(false);
    expect(validateReviewHash('wrong', ids)).toBe(false);
  });

  it('review hash is order-independent', () => {
    const hash1 = computeReviewHash(['u1', 'u2']);
    const hash2 = computeReviewHash(['u2', 'u1']);
    expect(hash1).toBe(hash2);
  });
});
