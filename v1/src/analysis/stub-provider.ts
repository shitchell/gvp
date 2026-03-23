import { EmbeddingProvider } from './embedding-provider.js';

/**
 * Stub embedding provider for alpha.
 * Uses simple bag-of-words hashing -- not production quality,
 * but exercises the interface for testing.
 */
export class StubEmbeddingProvider extends EmbeddingProvider {
  readonly name = 'stub';
  private readonly dimensions = 64;

  async embed(text: string): Promise<number[]> {
    // Simple deterministic hash-based embedding for testing
    const words = text.toLowerCase().split(/\W+/).filter(w => w.length > 0);
    const vector = new Array(this.dimensions).fill(0) as number[];
    for (const word of words) {
      for (let i = 0; i < word.length; i++) {
        const idx = (word.charCodeAt(i) * (i + 1)) % this.dimensions;
        vector[idx] += 1;
      }
    }
    // Normalize
    const norm = Math.sqrt(vector.reduce((s: number, v: number) => s + v * v, 0));
    if (norm > 0) {
      for (let i = 0; i < vector.length; i++) {
        vector[i] /= norm;
      }
    }
    return vector;
  }
}
