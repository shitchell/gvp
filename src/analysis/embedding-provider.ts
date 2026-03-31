/**
 * Abstract embedding provider interface (DEC-10.8).
 * Plugin point for different embedding backends.
 */
export abstract class EmbeddingProvider {
  abstract readonly name: string;

  /** Generate an embedding vector for text */
  abstract embed(text: string): Promise<number[]>;

  /** Compute similarity between two vectors (0-1, higher = more similar) */
  similarity(a: number[], b: number[]): number {
    // Default: cosine similarity
    if (a.length !== b.length || a.length === 0) return 0;
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i]! * b[i]!;
      normA += a[i]! * a[i]!;
      normB += b[i]! * b[i]!;
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom === 0 ? 0 : dot / denom;
  }
}
