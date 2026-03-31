import type { EmbeddingProvider } from './embedding-provider.js';
import type { Element } from '../model/element.js';

export interface SimilarityResult {
  elementA: Element;
  elementB: Element;
  similarity: number;
}

/**
 * Find potentially related but unmapped element pairs (DEC-10.9).
 * Returns pairs above the similarity threshold that aren't connected via maps_to.
 */
export async function findUnmappedRelationships(
  elements: Element[],
  provider: EmbeddingProvider,
  threshold: number = 0.7,
): Promise<SimilarityResult[]> {
  // Embed all elements
  const embeddings = new Map<string, number[]>();
  for (const el of elements) {
    const text = `${el.name} ${el.get(el.categoryName === 'decision' ? 'rationale' : 'statement') ?? ''}`;
    embeddings.set(el.hashKey(), await provider.embed(text));
  }

  // Build maps_to lookup for connected pairs
  const connected = new Set<string>();
  for (const el of elements) {
    for (const ref of el.maps_to) {
      connected.add(`${el.hashKey()}:${ref}`);
      // Also check reverse (since maps_to is directional but we want any connection)
      const target = elements.find(e => e.toLibraryId() === ref || e.hashKey() === ref);
      if (target) {
        connected.add(`${target.hashKey()}:${el.toLibraryId()}`);
      }
    }
  }

  // Compare all pairs
  const results: SimilarityResult[] = [];
  for (let i = 0; i < elements.length; i++) {
    for (let j = i + 1; j < elements.length; j++) {
      const elA = elements[i]!;
      const elB = elements[j]!;

      // Skip if already connected
      const keyAB = `${elA.hashKey()}:${elB.toLibraryId()}`;
      const keyBA = `${elB.hashKey()}:${elA.toLibraryId()}`;
      if (connected.has(keyAB) || connected.has(keyBA)) continue;

      const embA = embeddings.get(elA.hashKey());
      const embB = embeddings.get(elB.hashKey());
      if (!embA || !embB) continue;

      const sim = provider.similarity(embA, embB);
      if (sim >= threshold) {
        results.push({ elementA: elA, elementB: elB, similarity: sim });
      }
    }
  }

  return results.sort((a, b) => b.similarity - a.similarity);
}
