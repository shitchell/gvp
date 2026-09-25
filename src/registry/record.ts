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
  registry: CategoryRegistry,
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

  // `registry` is already merged LIBRARY-WIDE by the caller (see
  // collectLibraryCategories). Merging only this document's own
  // definitions was the original implementation and was WRONG: the
  // natural GVP shape is a base document declaring a category and
  // children populating it, so per-document merging left every such
  // element uncounted and unsearchable -- silently, with empty skip
  // buckets, while name search kept working so the feature looked alive.
  // That is the exact silent-miss failure #15 was filed about.

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
 * The `registry.enabled` value a single document declares ABOUT ITS OWN
 * LIBRARY, or undefined when it declares nothing (#25).
 *
 * Both admitted library-scoped spellings reduce here to the one switch
 * D43 names, `registry.enabled` — that reduction IS the delegation P19
 * requires, and it is why this is a spelling rather than a second
 * mechanism. Nothing below reimplements recording suppression; the
 * caller applies the same `!== false` gate src/cli/helpers.ts applies to
 * the invocation's config.
 *
 *   meta.registry.enabled: false               <- the named affordance
 *   meta.config_overrides.registry:            <- the general mechanism
 *     mode: replace
 *     value: { enabled: false }
 *
 * The named spelling wins when a document carries both, because it is
 * the one that says only what it means.
 *
 * Read from raw YAML rather than from a parsed Document for the same
 * reason factsFor is: recording must not depend on a document parsing
 * cleanly enough to become an Element. A library whose one broken
 * document says "do not record me" must still not be recorded.
 */
function declaredRegistryEnabled(meta: Record<string, unknown>): boolean | undefined {
  const named = meta.registry;
  if (named && typeof named === 'object' && !Array.isArray(named)) {
    const enabled = (named as Record<string, unknown>).enabled;
    if (typeof enabled === 'boolean') return enabled;
  }
  const overrides = meta.config_overrides;
  if (overrides && typeof overrides === 'object' && !Array.isArray(overrides)) {
    const entry = (overrides as Record<string, unknown>).registry;
    if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
      const value = (entry as Record<string, unknown>).value;
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        const enabled = (value as Record<string, unknown>).enabled;
        if (typeof enabled === 'boolean') return enabled;
      }
    }
  }
  return undefined;
}

/**
 * Does this library declare itself not-for-registry? (D43, D60, #25)
 *
 * LIBRARY-WIDE, like collectLibraryCategories and for the same reason:
 * the natural GVP shape is a base document that sibling documents
 * extend, so a per-document reading would record the siblings of the
 * document that opted out — a partial, silent miss of exactly the kind
 * #15 was filed about.
 *
 * ANY document declaring `false` opts the whole library out, and a
 * sibling's `true` does not overturn it. An opt-out is a claim that this
 * library is throwaway; the quieter answer wins, matching the `!== false`
 * gate on the invocation's config, where only an explicit opt-out skips.
 *
 * The asymmetry is deliberate and is D60's: a library-scoped declaration
 * can only SUPPRESS its own entries. `enabled: true` cannot re-enable
 * recording that the consumer's config layer or `--no-registry` turned
 * off, because by then this function is never reached — a library
 * acquiring the right to write on its consumer's machine is the exact
 * authority D60 denies it.
 *
 * Costs one extra read of each document's YAML, alongside the reads
 * collectLibraryCategories and factsFor already make. Kept as its own
 * pass rather than folded into either: the answer must be known BEFORE
 * any entry is written, and merging it into the category scan would put
 * two unrelated decisions in one loop.
 */
function libraryOptsOut(files: string[]): boolean {
  for (const file of files) {
    let meta: Record<string, unknown>;
    try {
      const raw = yaml.load(fs.readFileSync(file, 'utf-8'));
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
      const m = (raw as Record<string, unknown>).meta;
      if (!m || typeof m !== 'object' || Array.isArray(m)) continue;
      meta = m as Record<string, unknown>;
    } catch {
      continue;
    }
    if (declaredRegistryEnabled(meta) === false) return true;
  }
  return false;
}

/**
 * The project_id of the project that OWNS `libDir`, by walking up for a
 * `.gvp/config.yaml`. Cached per directory — this runs once per document
 * and the answer is identical for every document in a library.
 */
// Memoization is PER-INVOCATION, not process-lifetime. Task 10 wires
// recordLibraries in after the D21 preflight, which BACKFILLS a project_id
// into .gvp/config.yaml -- so a cache that outlived one call could serve a
// stale `null` for a library whose id was created moments earlier. Not
// reachable through a single CLI invocation, but tests call recordLibraries
// repeatedly in one process against freshly-created fixtures, which is
// exactly that shape. Cleared at the top of recordLibraries.
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
 * Collect category definitions across EVERY document in a library, exactly
 * as buildCatalog's pass 1 does before parsing any document.
 *
 * This must be library-wide, not per-document: a base document commonly
 * declares a category that sibling documents populate, and a per-document
 * merge leaves those elements invisible to element_counts and to search.
 */
export function collectLibraryCategories(
  base: CategoryRegistry,
  files: string[],
): CategoryRegistry {
  const collected: Record<string, CategoryDefinition> = {};
  for (const file of files) {
    try {
      const raw = yaml.load(fs.readFileSync(file, 'utf-8'));
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
      const meta = ((raw as Record<string, unknown>).meta ?? {}) as Record<string, unknown>;
      const cats = (meta.definitions as Record<string, unknown> | undefined)?.categories;
      if (cats && typeof cats === 'object' && !Array.isArray(cats)) {
        Object.assign(collected, cats as Record<string, CategoryDefinition>);
      }
    } catch {
      // Unparseable document — pass 2 reports it; it defines no categories.
    }
  }
  return Object.keys(collected).length > 0 ? base.merge(collected) : base;
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
  projectIdCache.clear();
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
    // The library's own declaration about itself, honored HERE — inside
    // the per-library record — rather than at the invocation gate in
    // src/cli/helpers.ts. That placement is the whole of D60: the
    // declaration suppresses the DECLARING library's entries and reaches
    // nothing else, so an inherited library can no longer switch off its
    // consumer's registry, including the consumer's own entries, which
    // it has no view of and no stake in.
    //
    // It is also what answers #25's other half — recording depending on
    // how the library is addressed. Every addressing path (`--store`,
    // `--library`, cwd discovery) arrives at this same function, so the
    // declaration is honored identically on all of them.
    //
    // Only LIBRARY entries (D40/D45) are suppressed. The project
    // keyspace (D22, `by-id`) is a record of the PROJECT, not of the
    // library, and D60 scopes a library's declaration to "that library's
    // own records". Suppressing the project entry from a library
    // document would also misfire under `--library <someone else's lib>`,
    // where the library that opted out is not the invoking project's at
    // all — which is the very shape of over-reach D60 forbids. The
    // opted-out library's keys are simply absent from the `hashes` this
    // invocation reports for the project.
    if (libraryOptsOut(files)) return;
    // One merged registry per LIBRARY, not per document (see
    // collectLibraryCategories). Built here so a base document's category
    // is recognized in the siblings that populate it.
    const registry = collectLibraryCategories(baseRegistry, files);
    for (const file of files) {
      // The WHOLE body is guarded, not just the write: factsFor can throw
      // (e.g. baseRegistry.merge on a malformed definitions block), and one
      // broken document must not abort the remaining documents or the
      // external sources not yet recorded.
      try {
        const facts = factsFor(file, dir, source, registry);
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

  // D22's auto-prune lost its only call site when Task 10 deleted the
  // registry preflight from parseConfigOptions. Re-homed here so it still
  // runs -- D52's rationale assumes it does.
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
