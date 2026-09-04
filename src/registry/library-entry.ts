import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { getLibrariesDir } from './paths.js';
import { writeFileAtomic } from './atomic.js';
import { isRemoteSource } from './key.js';

/**
 * Facts about one library DOCUMENT (D45 — the document, not the
 * directory, is the unit, because references resolve as
 * `<meta.name>:<id>` and a document-level hit is directly citable).
 *
 * Deliberately contains NO timestamps. Every field here is derived
 * purely from the library's current content, so two writers observing
 * the same library state produce identical bytes and a lost update is a
 * no-op (P18, D51). Adding a timestamp would silently void that.
 * Timestamps live on the usage edge — see usage-edge.ts (D53).
 */
export interface LibraryEntry {
  /** meta.name — correlation only, NOT unique, may be absent (D48). */
  name: string | null;
  /** inherits: grammar. Canonical resolved path for local; spec for remote (D47, D49). */
  source: string;
  /** Extension-less relative path — cairn's internal document identity. */
  document_path: string;
  /** Actual filename; .yaml vs .yml is not derivable from document_path. */
  file: string;
  /** meta.scope when declared. */
  scope: string | null;
  /** Correlation when the library sits in a project with a D21 id (D48). */
  project_id: string | null;
  /** Correlation; read-if-present from meta.library_id, see #16 / R9 (D48). */
  library_id: string | null;
  /** Per category, including user-defined categories. */
  element_counts: Record<string, number>;
}

function entryPath(key: string): string {
  return path.join(getLibrariesDir(), `${key}.yml`);
}

/**
 * Write library facts for `key`. Last-write-wins: when two writers
 * observed different library states, the later observation is the
 * fresher one and should win (D51).
 *
 * `sortKeys` matters — it makes output byte-stable across writers
 * regardless of object construction order, which is what the
 * idempotence argument rests on.
 */
export function upsertLibraryEntry(key: string, entry: LibraryEntry): void {
  const dumped = yaml.dump(entry, { lineWidth: 120, noRefs: true, sortKeys: true });
  // Read-compare-skip. Every cairn command would otherwise rewrite every
  // library entry, which is pure churn -- and skipping when the bytes
  // already match STRENGTHENS the P18 argument rather than weakening it:
  // the common concurrent case becomes no write at all.
  try {
    if (fs.readFileSync(entryPath(key), 'utf-8') === dumped) return;
  } catch { /* missing or unreadable — fall through and write */ }
  writeFileAtomic(entryPath(key), dumped);
}

/** Read one entry. Returns null when missing or unparseable. */
export function readLibraryEntry(key: string): LibraryEntry | null {
  try {
    const parsed = yaml.load(fs.readFileSync(entryPath(key), 'utf-8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const e = parsed as Partial<LibraryEntry>;
    // Validate/normalize EVERY field a consumer dereferences. `libs list`
    // reduces over element_counts, `show` iterates it, `search` joins
    // `file` -- a parseable-but-incomplete entry throws a TypeError in all
    // three, and pruneLibraryEntries only deletes UNparseable entries, so
    // that state is reachable and sticky.
    if (typeof e.source !== 'string') return null;
    if (typeof e.document_path !== 'string') return null;
    if (typeof e.file !== 'string') return null;
    const counts: unknown = e.element_counts;
    e.element_counts =
      counts && typeof counts === 'object' && !Array.isArray(counts)
        ? (counts as Record<string, number>)
        : {};
    if (typeof e.name !== 'string') e.name = null;
    if (typeof e.scope !== 'string') e.scope = null;
    if (typeof e.project_id !== 'string') e.project_id = null;
    if (typeof e.library_id !== 'string') e.library_id = null;
    return e as LibraryEntry;
  } catch {
    return null;
  }
}

/** All entry keys currently on disk. */
export function listLibraryKeys(): string[] {
  try {
    return fs.readdirSync(getLibrariesDir())
      .filter((f) => f.endsWith('.yml'))
      .map((f) => f.slice(0, -4));
  } catch {
    return [];
  }
}

/**
 * Prune library entries (D55).
 *
 * Local entries are dropped when THE DOCUMENT FILE is gone — not when
 * the library directory is gone. D22's directory-level prune would
 * orphan a deleted document's entry forever while its siblings stayed
 * live.
 *
 * Remote entries are NEVER dropped here: an evicted cache is still
 * re-fetchable while the ref is served, and forgetting it discards
 * exactly what the index exists to hold. `cairn libs prune --remote`
 * is the explicit opt-in.
 */
export function pruneLibraryEntries(): void {
  for (const key of listLibraryKeys()) {
    const e = readLibraryEntry(key);
    if (!e) {
      // Unparseable — but only remove it if we can also confirm it is
      // not a torn read in progress. Atomic writes (D52) mean a
      // well-formed writer never produces one, so this is safe.
      try { fs.unlinkSync(entryPath(key)); } catch { /* gone */ }
      continue;
    }
    if (isRemoteSource(e.source)) continue;
    if (!fs.existsSync(path.join(e.source, e.file))) {
      try { fs.unlinkSync(entryPath(key)); } catch { /* gone */ }
    }
  }
}
