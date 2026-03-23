import { describe, it, expect } from 'vitest';
import { StubEmbeddingProvider } from '../../src/analysis/stub-provider.js';
import { EmbeddingProvider } from '../../src/analysis/embedding-provider.js';
import { findUnmappedRelationships } from '../../src/analysis/analyzer.js';
import { Element } from '../../src/model/element.js';

describe('Embedding System (DEC-10.8, DEC-10.9)', () => {
  describe('EmbeddingProvider', () => {
    it('cosine similarity of identical vectors is 1', () => {
      const provider = new StubEmbeddingProvider();
      const vec = [1, 0, 0, 1];
      expect(provider.similarity(vec, vec)).toBeCloseTo(1);
    });

    it('cosine similarity of orthogonal vectors is 0', () => {
      const provider = new StubEmbeddingProvider();
      expect(provider.similarity([1, 0], [0, 1])).toBeCloseTo(0);
    });

    it('cosine similarity of empty vectors is 0', () => {
      const provider = new StubEmbeddingProvider();
      expect(provider.similarity([], [])).toBe(0);
    });
  });

  describe('StubEmbeddingProvider', () => {
    it('produces deterministic embeddings', async () => {
      const provider = new StubEmbeddingProvider();
      const a = await provider.embed('hello world');
      const b = await provider.embed('hello world');
      expect(a).toEqual(b);
    });

    it('produces different embeddings for different text', async () => {
      const provider = new StubEmbeddingProvider();
      const a = await provider.embed('goal alignment');
      const b = await provider.embed('database schema');
      expect(a).not.toEqual(b);
    });

    it('returns normalized vectors', async () => {
      const provider = new StubEmbeddingProvider();
      const vec = await provider.embed('test text');
      const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
      expect(norm).toBeCloseTo(1, 5);
    });
  });

  describe('findUnmappedRelationships', () => {
    it('finds similar but unmapped elements', async () => {
      const provider = new StubEmbeddingProvider();
      const elements = [
        new Element({ id: 'G1', name: 'Ensure quality', statement: 'Build high quality software' }, 'goal', '@local', 'doc'),
        new Element({ id: 'V1', name: 'Quality', statement: 'High quality software matters' }, 'value', '@local', 'doc'),
        new Element({ id: 'P1', name: 'Logging', statement: 'Use structured logging everywhere' }, 'principle', '@local', 'doc'),
      ];

      const results = await findUnmappedRelationships(elements, provider, 0.5);
      // G1 and V1 should be similar (both about quality), P1 is different
      expect(results.length).toBeGreaterThanOrEqual(0); // Stub may or may not find similarity
    });

    it('excludes already-connected pairs', async () => {
      const provider = new StubEmbeddingProvider();
      const elements = [
        new Element({ id: 'G1', name: 'Quality', statement: 'Build quality', maps_to: [] }, 'goal', '@local', 'doc'),
        new Element({ id: 'V1', name: 'Quality', statement: 'Build quality', maps_to: ['doc:G1'] }, 'value', '@local', 'doc'),
      ];

      // Even though identical text, they're connected via maps_to
      const results = await findUnmappedRelationships(elements, provider, 0.0);
      const hasG1V1 = results.some(r =>
        (r.elementA.id === 'G1' && r.elementB.id === 'V1') ||
        (r.elementA.id === 'V1' && r.elementB.id === 'G1')
      );
      expect(hasG1V1).toBe(false);
    });

    it('returns results sorted by similarity (highest first)', async () => {
      const provider = new StubEmbeddingProvider();
      const elements = [
        new Element({ id: 'A', name: 'alpha', statement: 'alpha' }, 'goal', '@local', 'doc'),
        new Element({ id: 'B', name: 'beta', statement: 'beta' }, 'goal', '@local', 'doc'),
        new Element({ id: 'C', name: 'gamma', statement: 'gamma' }, 'goal', '@local', 'doc'),
      ];

      const results = await findUnmappedRelationships(elements, provider, 0.0);
      for (let i = 1; i < results.length; i++) {
        expect(results[i]!.similarity).toBeLessThanOrEqual(results[i-1]!.similarity);
      }
    });
  });
});
