import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { canonicalizeSource, entryKey, isRemoteSource, expandTilde } from './key.js';
import { upsertLibraryEntry, pruneLibraryEntries, type LibraryEntry } from './library-entry.js';
import { upsertRegistryEntry, pruneStaleRegistryEntries } from '../config/registry.js';
import { LocalSourceResolver, cachedPathFor } from '../inheritance/source-resolver.js';
import { CategoryRegistry } from '../model/category-registry.js';
import { loadDefaults } from '../schema/defaults-loader.js';
import type { CategoryDefinition } from '../schema/category-definition.js';
// The ONE YAML walker, shared with src/cli/helpers.ts (P11). It THROWS on an
// unreadable/vanished directory — deliberately kept strict, because catalog
// construction must not silently load a partial document set. record()'s
// try/catch supplies the leniency the registry side wants.
import { findYamlFiles } from '../utils/yaml-files.js';

export interface RecordArgs {
  /** The resolved root library directory. */
  libraryDir: string;
  /** Raw source strings for every external library resolved this run. */
  externalSources: string[];
  projectId: string | null;
  projectName: string | null;
  projectPath: string | null;
}

/**
 * Read one document's registry-relevant facts WITHOUT building a
 * catalog. Recording must not depend on a document parsing cleanly
 * enough to become an Element — a library with one broken document
 * should still have its other documents indexed.
 */
function factsFor(
  file: string,
  libDir: string,
  source: string,
  baseRegistry: CategoryRegistry,
): LibraryEntry | null {
  let data: Record<string, unknown>;
  try {
    const raw = yaml.load(fs.readFileSync(file, 'utf-8'));
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    data = raw as Record<string, unknown>;
  } catch {
    return null;
  }
  const meta = (data.meta ?? {}) as Record<string, unknown>;

  // Merge this document's own category definitions, mirroring
  // buildCatalog's pass 1. Without it a user-defined category is not
  // recognized, so its elements are excluded from element_counts and are
  // unsearchable -- the silent-miss failure #15 was filed about, and the
  // spec requires counts "including user-defined categories".
  const docCats = (meta.definitions as Record<string, unknown> | undefined)?.categories;
  const registry = docCats && typeof docCats === 'object'
    ? baseRegistry.merge(docCats as Record<string, CategoryDefinition>)
    : baseRegistry;

  // project_id is a fact about where the library LIVES (D48), not about
  // who read it. Derive it from the library's own .gvp/config.yaml by
  // walking up from libDir -- stamping the CONSUMING invocation's id
  // would make the same entry flip between a UUID and null depending on
  // which project resolved it, breaking byte-identity (P18, D51).
  const projectId = projectIdForLibrary(libDir);
  // Count per category, keyed by YAML KEY (plural: `principles`), not by
  // category NAME (singular: `principle`) -- defaults.yaml names
  // categories in the singular with a plural yaml_key, and the spec's
  // entry shape, `libs show`'s output, and SearchHit.category all use the
  // plural form the user actually types.
  //
  // The registry lookup is used ONLY as the is-this-a-real-category
  // filter, so an unrelated top-level list cannot become a phantom count.
  // `registry` is passed in (built once per invocation) because
  // loadDefaults() re-reads and re-validates a 240-line file on every
  // call, and this runs once per document.
  const counts: Record<string, number> = {};
  for (const [k, v] of Object.entries(data)) {
    if (k === 'meta' || !Array.isArray(v)) continue;
    if (!registry.getByYamlKey(k)) continue;
    counts[k] = v.length;
  }
  return {
    name: typeof meta.name === 'string' ? meta.name : null,
    source,
    document_path: path.relative(libDir, file).replace(/\.ya?ml$/, ''),
    file: path.relative(libDir, file),
    scope: typeof meta.scope === 'string' ? meta.scope : null,
    project_id: projectId,
    // R9 / #16: read-if-present. documentMetaSchema is .passthrough(),
    // so meta.library_id already survives parsing today.
    library_id: typeof meta.library_id === 'string' ? meta.library_id : null,
    element_counts: counts,
  };
}

/**
 * The project_id of the project that OWNS `libDir`, by walking up for a
 * `.gvp/config.yaml`. Cached per directory — this runs once per document
 * and the answer is identical for every document in a library.
 */
const projectIdCache = new Map<string, string | null>();
function projectIdForLibrary(libDir: string): string | null {
  const cached = projectIdCache.get(libDir);
  if (cached !== undefined) return cached;
  let current = path.resolve(libDir);
  let found: string | null = null;
  for (;;) {
    const cfg = path.join(current, '.gvp', 'config.yaml');
    if (fs.existsSync(cfg)) {
      try {
        const parsed = yaml.load(fs.readFileSync(cfg, 'utf-8'));
        const id = (parsed as Record<string, unknown> | null)?.project_id;
        if (typeof id === 'string' && id.length > 0) found = id;
      } catch { /* unreadable — no id */ }
      break;
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  projectIdCache.set(libDir, found);
  return found;
}

/**
 * Record every library resolved by this invocation (D40).
 *
 * Records EVERY document in each resolved library directory, not only
 * the inherited ones (D41) — a project that inherits one document from
 * a library would otherwise never index its siblings, which is where
 * reusable elements typically live.
 *
 * Never throws (D57): the index is not load-bearing for correctness.
 * Returns a warning string when something failed, for the caller to
 * emit once.
 */
export function recordLibraries(args: RecordArgs): string | undefined {
  const hashes: string[] = [];
  let failed = false;

  // Build the category registry ONCE per invocation, not per document:
  // loadDefaults() re-reads and re-zod-validates a 240-line file each call.
  const baseRegistry = CategoryRegistry.fromDefaults(loadDefaults());
  // Guard against recording one directory twice (e.g. `inherits: .`, or an
  // external source that resolves back to the root library).
  const seenSources = new Set<string>();

  const record = (dir: string, source: string): void => {
    if (seenSources.has(source)) return;
    seenSources.add(source);
    // findYamlFiles THROWS on an unreadable/vanished directory (it keeps
    // the strict behavior buildCatalog needs). Guard it here so one bad
    // source cannot abort the external sources not yet recorded.
    let files: string[];
    try {
      files = findYamlFiles(dir);
    } catch {
      failed = true;
      return;
    }
    for (const file of files) {
      // The WHOLE body is guarded, not just the write: factsFor can throw
      // (e.g. baseRegistry.merge on a malformed definitions block), and one
      // broken document must not abort the remaining documents or the
      // external sources not yet recorded.
      try {
        const facts = factsFor(file, dir, source, baseRegistry);
        if (!facts) continue;
        const key = entryKey(source, facts.document_path);
        upsertLibraryEntry(key, facts);
        hashes.push(key);
      } catch {
        failed = true;
      }
    }
  };

  try {
    record(args.libraryDir, canonicalizeSource(args.libraryDir, args.libraryDir));
    for (const src of args.externalSources) {
      const resolved = resolveIfCached(src, args.libraryDir);
      if (!resolved) continue;
      // Key local sources on the RESOLVER'S OUTPUT, not the raw string.
      // LocalSourceResolver maps `<p>`, `<p>/gvp` and `<p>/.gvp/library`
      // onto one directory -- the dual lookup D47 exists to collapse.
      // Canonicalizing the STRING leaves those as separate keys, and
      // `libs prune` would then join a source missing the `.gvp/library`
      // segment and delete live entries on every run.
      const source = isRemoteSource(src) ? src : canonicalizeSource(resolved, args.libraryDir);
      record(resolved, source);
    }
  } catch {
    failed = true;
  }

  if (args.projectId && args.projectPath && args.projectName) {
    try {
      upsertRegistryEntry(args.projectId, args.projectName, args.projectPath, hashes);
    } catch {
      failed = true;
    }
  }

  // D22's auto-prune lost its only call site when Task 10 removed
  // runRegistryPreflight from parseConfigOptions. Re-home it here so it
  // still runs -- D52's rationale assumes it does.
  //
  // Runs on EVERY invocation, deliberately. D22 records "auto-prune on
  // access", and D52's rationale explicitly rests on the prune running
  // for every user on every invocation. An hourly stamp-file gate was
  // drafted and removed: it would have changed recorded behavior without
  // amending the decision that records it. The cost is real and is noted
  // under Deferred as needing a decision, not a quiet optimization.
  try {
    pruneStaleRegistryEntries();
    pruneLibraryEntries();
  } catch {
    failed = true;
  }

  // At most ONE warning per invocation (D57), regardless of how many
  // individual writes failed.
  return failed ? 'cairn: could not update the library registry (continuing)' : undefined;
}

/**
 * Resolve a source to a directory ONLY if it is already on disk.
 *
 * MUST NOT call createSourceResolver().resolve() for remotes:
 * GitSourceResolver.resolve returns the cached path only when the cache
 * EXISTS -- otherwise it runs `git ls-remote` plus a shallow clone. That
 * would make every catalog-building command hit the network for any
 * evicted remote. cachedPathFor (Task 4) is the pure, cache-only
 * derivation.
 *
 * expandTilde matters here: sourceDocCache is keyed by the RAW source and
 * LocalSourceResolver does not expand `~`, so path.resolve would
 * otherwise yield `<baseDir>/~/lib` and silently record nothing.
 */
function resolveIfCached(source: string, baseDir: string): string | null {
  if (isRemoteSource(source)) return cachedPathFor(source);
  try {
    return new LocalSourceResolver(baseDir).resolve(expandTilde(source));
  } catch {
    return null;
  }
}
