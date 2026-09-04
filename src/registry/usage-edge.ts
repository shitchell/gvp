/**
 * One project-to-library edge (D53). Timestamps live HERE, not on the
 * library entry, because writers differ and the library entry's
 * idempotence must be preserved (P18, D51).
 */
export interface UsageEdge {
  hash: string;
  first_seen: string;
  last_seen: string;
}

/**
 * Merge freshly-observed library keys into a project's existing edges.
 *
 * Union by hash, min first_seen, max last_seen — never a blind rewrite.
 * D22 gives no CROSS-PROJECT collision (one file per project UUID), but
 * C2 says parallel sessions in ONE project are normal, and those do
 * contend on that file. Merging means the worst case is a stale
 * timestamp rather than a dropped edge.
 *
 * Result is sorted by hash so output is deterministic.
 */
export function mergeUsageEdges(
  existing: UsageEdge[],
  observedHashes: string[],
  now: string,
): UsageEdge[] {
  const byHash = new Map<string, UsageEdge>();
  for (const e of existing) {
    if (e && typeof e.hash === 'string') byHash.set(e.hash, { ...e });
  }
  for (const hash of observedHashes) {
    const prior = byHash.get(hash);
    if (!prior) {
      byHash.set(hash, { hash, first_seen: now, last_seen: now });
    } else {
      byHash.set(hash, {
        hash,
        first_seen: prior.first_seen < now ? prior.first_seen : now,
        last_seen: prior.last_seen > now ? prior.last_seen : now,
      });
    }
  }
  return [...byHash.values()].sort((a, b) => a.hash.localeCompare(b.hash));
}
