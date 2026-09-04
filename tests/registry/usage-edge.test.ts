import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { mergeUsageEdges, type UsageEdge } from '../../src/registry/usage-edge.js';

describe('usage edge merge (D53)', () => {
  let tmp: string, orig: string | undefined;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'edge-'));
    orig = process.env.GVP_REGISTRY_ROOT;
    process.env.GVP_REGISTRY_ROOT = tmp;
  });
  afterEach(() => {
    if (orig === undefined) delete process.env.GVP_REGISTRY_ROOT; else process.env.GVP_REGISTRY_ROOT = orig;
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('adds new edges', () => {
    const out = mergeUsageEdges([], ['a', 'b'], '2026-01-02T00:00:00Z');
    expect(out.map((e) => e.hash).sort()).toEqual(['a', 'b']);
    expect(out[0]!.first_seen).toBe('2026-01-02T00:00:00Z');
  });

  it('preserves the earliest first_seen and takes the latest last_seen', () => {
    const existing: UsageEdge[] = [
      { hash: 'a', first_seen: '2026-01-01T00:00:00Z', last_seen: '2026-01-01T00:00:00Z' },
    ];
    const out = mergeUsageEdges(existing, ['a'], '2026-06-01T00:00:00Z');
    expect(out[0]!.first_seen).toBe('2026-01-01T00:00:00Z');
    expect(out[0]!.last_seen).toBe('2026-06-01T00:00:00Z');
  });

  it('never drops an edge it was not told about — the concurrency property', () => {
    const existing: UsageEdge[] = [
      { hash: 'other-session', first_seen: '2026-01-01T00:00:00Z', last_seen: '2026-01-01T00:00:00Z' },
    ];
    const out = mergeUsageEdges(existing, ['mine'], '2026-06-01T00:00:00Z');
    expect(out.map((e) => e.hash).sort()).toEqual(['mine', 'other-session']);
  });

  it('does not move last_seen backwards', () => {
    const existing: UsageEdge[] = [
      { hash: 'a', first_seen: '2026-01-01T00:00:00Z', last_seen: '2026-06-01T00:00:00Z' },
    ];
    const out = mergeUsageEdges(existing, ['a'], '2026-03-01T00:00:00Z');
    expect(out[0]!.last_seen).toBe('2026-06-01T00:00:00Z');
  });

  it('is deterministic in ordering', () => {
    const a = mergeUsageEdges([], ['b', 'a'], 'T');
    const b = mergeUsageEdges([], ['a', 'b'], 'T');
    expect(a).toEqual(b);
  });
});
