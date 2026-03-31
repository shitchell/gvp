import { describe, it, expect } from 'vitest';
import {
  originEntrySchema,
  updateEntrySchema,
  reviewEntrySchema,
  isStale,
  getUnreviewedUpdates,
  computeReviewHash,
  validateReviewHash,
} from '../../src/provenance/index.js';
import { Element } from '../../src/model/element.js';

/** Helper to create an Element with provenance data */
function makeElement(data: Record<string, unknown> = {}): Element {
  return new Element(
    { id: 'T1', name: 'Test', status: 'active', ...data },
    'tests',
    'local',
    'test-doc',
  );
}

describe('Provenance Schemas', () => {
  it('originEntrySchema generates UUID', () => {
    const result = originEntrySchema.parse({ date: '2026-01-01T00:00:00Z' });
    expect(result.id).toBeDefined();
    expect(result.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it('updateEntrySchema validates rationale is required', () => {
    expect(() =>
      updateEntrySchema.parse({ date: '2026-01-01T00:00:00Z' }),
    ).toThrow();
  });

  it('updateEntrySchema defaults skip_review to false', () => {
    const result = updateEntrySchema.parse({
      date: '2026-01-01T00:00:00Z',
      rationale: 'Updated wording',
    });
    expect(result.skip_review).toBe(false);
  });

  it('reviewEntrySchema validates updates_reviewed is required', () => {
    expect(() =>
      reviewEntrySchema.parse({ date: '2026-01-01T00:00:00Z' }),
    ).toThrow();
  });
});

describe('Staleness Detection', () => {
  it('isStale returns false for element with no updates', () => {
    const el = makeElement();
    expect(isStale(el)).toBe(false);
  });

  it('isStale returns true for unreviewed update', () => {
    const el = makeElement({
      updated_by: [
        { id: 'u1', date: '2026-01-01', rationale: 'change', skip_review: false },
      ],
    });
    expect(isStale(el)).toBe(true);
  });

  it('isStale returns false when all updates reviewed', () => {
    const el = makeElement({
      updated_by: [
        { id: 'u1', date: '2026-01-01', rationale: 'change', skip_review: false },
      ],
      reviewed_by: [
        { id: 'r1', date: '2026-01-02', updates_reviewed: ['u1'] },
      ],
    });
    expect(isStale(el)).toBe(false);
  });

  it('isStale ignores skip_review updates', () => {
    const el = makeElement({
      updated_by: [
        { id: 'u1', date: '2026-01-01', rationale: 'typo fix', skip_review: true },
      ],
    });
    expect(isStale(el)).toBe(false);
  });

  it('getUnreviewedUpdates returns correct IDs', () => {
    const el = makeElement({
      updated_by: [
        { id: 'u1', date: '2026-01-01', rationale: 'change1', skip_review: false },
        { id: 'u2', date: '2026-01-02', rationale: 'change2', skip_review: false },
        { id: 'u3', date: '2026-01-03', rationale: 'typo', skip_review: true },
      ],
      reviewed_by: [
        { id: 'r1', date: '2026-01-02', updates_reviewed: ['u1'] },
      ],
    });
    const unreviewed = getUnreviewedUpdates(el);
    expect(unreviewed).toEqual(['u2']);
  });
});

describe('Review Hash', () => {
  it('computeReviewHash produces consistent hash', () => {
    const hash1 = computeReviewHash(['u1', 'u2']);
    const hash2 = computeReviewHash(['u1', 'u2']);
    expect(hash1).toBe(hash2);
  });

  it('computeReviewHash is order-independent', () => {
    const hash1 = computeReviewHash(['u1', 'u2']);
    const hash2 = computeReviewHash(['u2', 'u1']);
    expect(hash1).toBe(hash2);
  });

  it('validateReviewHash returns true for matching hash', () => {
    const ids = ['u1', 'u2'];
    const hash = computeReviewHash(ids);
    expect(validateReviewHash(hash, ids)).toBe(true);
  });

  it('validateReviewHash returns false for different updates', () => {
    const hash = computeReviewHash(['u1', 'u2']);
    expect(validateReviewHash(hash, ['u1', 'u3'])).toBe(false);
  });
});
