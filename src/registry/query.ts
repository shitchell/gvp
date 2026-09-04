import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { getProjectsDir } from './paths.js';
import { listLibraryKeys, readLibraryEntry, type LibraryEntry } from './library-entry.js';
import { parseSource, isRemoteSource } from './key.js';
import { cachedPathFor, createSourceResolver } from '../inheritance/source-resolver.js';
import { CategoryRegistry } from '../model/category-registry.js';
import { loadDefaults } from '../schema/defaults-loader.js';
import type { CategoryDefinition } from '../schema/category-definition.js';

export interface LibraryView extends LibraryEntry {
  key: string;
  /** Derived from source, never stored (D50). */
  kind: 'local' | 'remote';
  ref: string | null;
  /** Is the content available on disk right now? */
  cached: boolean;
}

export interface UsageView {
  seen_from: string[];
  first_seen: string | null;
  last_seen: string | null;
}

/**
 * Resolve an entry's on-disk directory with NO network I/O. Uses
 * cachedPathFor rather than the resolver: calling
 * GitSourceResolver.resolve on an evicted remote would clone it, which
 * is exactly what D54 rejects ("search would silently become N network
 * clones").
 */
function cachedDir(entry: LibraryEntry): string | null {
  if (!isRemoteSource(entry.source)) {
    return fs.existsSync(entry.source) ? entry.source : null;
  }
  return cachedPathFor(entry.source);
}

export function loadAllLibraries(): LibraryView[] {
  const out: LibraryView[] = [];
  for (const key of listLibraryKeys()) {
    const e = readLibraryEntry(key);
    if (!e) continue;
    const { kind, ref } = parseSource(e.source);
    out.push({ ...e, key, kind, ref, cached: cachedDir(e) !== null });
  }
  return out;
}

/** Invert the project-side usage edge into per-library usage (D53). */
// NOTE: timestamps are compared with string < / >. That is correct ONLY
// because every writer emits `new Date().toISOString()`, which is always
// UTC with a `Z` suffix and fixed width -- lexical order equals chronological
// order. A writer that ever emitted an offset form (`+02:00`) would silently
// misorder first_seen/last_seen here with no error. If that becomes possible,
// switch to Date.parse comparison.
export function invertUsage(): Map<string, UsageView> {
  const usage = new Map<string, UsageView>();
  let files: string[];
  try {
    files = fs.readdirSync(getProjectsDir()).filter((f) => f.endsWith('.yml'));
  } catch {
    return usage;
  }
  for (const f of files) {
    let entry: unknown;
    try {
      entry = yaml.load(fs.readFileSync(path.join(getProjectsDir(), f), 'utf-8'));
    } catch {
      // One corrupt project entry must not blind the whole inversion --
      // the remaining entries are still authoritative.
      continue;
    }
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const rec = entry as Record<string, unknown>;
    if (!Array.isArray(rec.libraries)) continue;
    const paths: string[] = Array.isArray(rec.locations)
      ? (rec.locations as unknown[])
          .map((l) => (l && typeof l === 'object' ? (l as Record<string, unknown>).path : undefined))
          .filter((p): p is string => typeof p === 'string')
      : [];
    for (const raw of rec.libraries as unknown[]) {
      if (!raw || typeof raw !== 'object') continue;
      const edge = raw as Record<string, unknown>;
      if (typeof edge.hash !== 'string') continue;
      const first = typeof edge.first_seen === 'string' ? edge.first_seen : null;
      const last = typeof edge.last_seen === 'string' ? edge.last_seen : null;
      const prior = usage.get(edge.hash) ?? { seen_from: [], first_seen: null, last_seen: null };
      for (const p of paths) if (!prior.seen_from.includes(p)) prior.seen_from.push(p);
      if (first && (!prior.first_seen || first < prior.first_seen)) prior.first_seen = first;
      if (last && (!prior.last_seen || last > prior.last_seen)) prior.last_seen = last;
      usage.set(edge.hash, prior);
    }
  }
  return usage;
}

export interface SearchHit {
  key: string;
  library: string | null;
  document_path: string;
  category: string;
  id: string;
  name: string;
  field: string;
  excerpt: string;
}

/**
 * Search element names and each category's PRIMARY FIELD across every
 * known library (D54).
 *
 * The primary field is resolved from the category schema, never
 * hard-coded (R6): decisions carry `rationale`, constraints carry
 * `impact`, principles carry `statement`. Hard-coding "statement" would
 * make it impossible to match a decision — precisely the content the
 * motivating incident was about.
 *
 * Uncached remotes are SKIPPED and NAMED, never silently dropped, and
 * never fetched: resolving one would trigger network I/O inside a read
 * command. `--fetch` opts in at the CLI layer.
 */
export function searchLibrariesWithSkips(
  query: string,
  opts: { fetch?: boolean } = {},
): { results: SearchHit[]; skipped: string[]; missingLocal: string[]; unreadable: string[] } {
  const needle = query.toLowerCase();
  const baseRegistry = CategoryRegistry.fromDefaults(loadDefaults());
  const results: SearchHit[] = [];
  const skipped: string[] = [];
  const missingLocal: string[] = [];
  const unreadable: string[] = [];

  for (const lib of loadAllLibraries()) {
    // Cache-only by default. cachedPathFor NEVER performs network I/O
    // (Task 4) -- calling the resolver here would clone.
    let dir = cachedDir(lib);
    if (!dir && lib.kind === 'local') {
      // A local library whose directory is gone is NOT an uncached remote
      // and is never eligible for --fetch: D54's skip/fetch policy is
      // about remotes. The next prune removes this entry.
      missingLocal.push(lib.source);
      continue;
    }
    if (!dir) {
      if (!opts.fetch) { skipped.push(lib.source); continue; }
      // --fetch: network I/O is explicitly opted into.
      try {
        dir = createSourceResolver(process.cwd()).resolve(lib.source);
      } catch {
        skipped.push(lib.source);
        continue;
      }
    }
    const file = path.join(dir, lib.file);
    let data: Record<string, unknown>;
    try {
      const raw = yaml.load(fs.readFileSync(file, 'utf-8'));
      if (!raw || typeof raw !== 'object') { unreadable.push(file); continue; }
      data = raw as Record<string, unknown>;
    } catch {
      // A library directory that exists but whose document is gone or
      // unparseable would otherwise be a SILENT miss -- D54's point is
      // that every skip is named.
      unreadable.push(file);
      continue;
    }

    // Merge the document's own category definitions, as buildCatalog's
    // pass 1 does. Without this, elements in a user-defined category are
    // unsearchable -- the silent-miss failure #15 was filed about.
    const docCats = ((data.meta as Record<string, unknown> | undefined)?.definitions as
      Record<string, unknown> | undefined)?.categories;
    const registry = docCats && typeof docCats === 'object'
      ? baseRegistry.merge(docCats as Record<string, CategoryDefinition>)
      : baseRegistry;

    for (const [yamlKey, list] of Object.entries(data)) {
      if (yamlKey === 'meta' || !Array.isArray(list)) continue;
      const catDef = registry.getByYamlKey(yamlKey);
      // getByYamlKey returns { name, def } -- the CategoryDefinition is
      // `.def`. Getting this wrong makes EVERY category fall back to one
      // built-in's field name, so decisions (rationale) and constraints
      // (impact) become unsearchable -- the failure D54 exists to prevent.
      // When primary_field is absent we search `name` only rather than
      // guessing a field name, per R6.
      const primary = catDef?.def.primary_field;
      const fields = primary ? ['name', primary] : ['name'];
      for (const el of list) {
        if (!el || typeof el !== 'object') continue;
        const e = el as Record<string, unknown>;
        for (const field of fields) {
          const val = e[field];
          if (typeof val !== 'string' || !val.toLowerCase().includes(needle)) continue;
          results.push({
            key: lib.key,
            library: lib.name,
            document_path: lib.document_path,
            category: yamlKey,
            id: String(e.id ?? '?'),
            name: String(e.name ?? ''),
            field,
            excerpt: val.slice(0, 160),
          });
          break;
        }
      }
    }
  }
  // Dedupe the skip buckets. They are pushed per DOCUMENT, so a deleted
  // library holding N documents emitted N identical lines -- four in a real
  // run. Deduping here rather than at the print layer keeps the human output
  // and the --json payload in agreement (P9).
  return {
    results,
    skipped: [...new Set(skipped)],
    missingLocal: [...new Set(missingLocal)],
    unreadable: [...new Set(unreadable)],
  };
}

export function searchLibraries(query: string, opts: { fetch?: boolean } = {}): SearchHit[] {
  return searchLibrariesWithSkips(query, opts).results;
}
