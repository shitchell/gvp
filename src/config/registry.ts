import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { getProjectsDir } from '../registry/paths.js';
import { writeFileAtomic } from '../registry/atomic.js';

/**
 * Global project registry (D22, amended by D43/D44) — cross-project
 * discovery via per-UUID metadata files at
 * `~/.gvp/registry/by-id/<uuid>.yml`.
 *
 * Recording is ON by default. The preflight upserts the current
 * project's entry with its current path and a fresh timestamp on
 * every cairn invocation. Consumers can then walk the registry
 * directory to discover what projects exist, correlate by UUID, and
 * check last-seen timestamps for staleness. Opt out with
 * `registry.enabled: false` in any config layer, or `--no-registry`.
 *
 * Rationale captured in D22 of the cairn library:
 * - Write side effects on read commands: D22 originally justified
 *   these by the explicit opt-in. D43 falsified that default (the
 *   flag was set nowhere and the registry did not exist ~5 months
 *   later) and flipped it. D43 records the trade explicitly rather
 *   than dissolving it: of D22's three objections, the CI-sandbox
 *   half is answered by D57's resilience, while multi-user
 *   environments and auditability are ACCEPTED COSTS of the flip —
 *   not harms that were argued away.
 * - "Registry" naming, not "cache" — the data is persistent state,
 *   not regenerable.
 * - ~/.gvp/registry/ chosen over XDG for simplicity and to match
 *   the existing ~/.gvp/ convention. If a strict XDG user wants
 *   $XDG_STATE_HOME support later, it's a surface-level addition.
 * - Auto-prune on access: if a registry entry's recorded path no
 *   longer exists on disk, remove the entry silently. Simpler than
 *   a separate prune command.
 * - Schema kept minimal — project_id, project_name, locations
 *   (list of path + last_seen tuples). Future fields can be added
 *   additively without breaking older readers.
 */

export interface RegistryLocation {
  path: string;
  last_seen: string; // ISO 8601
}

export interface RegistryEntry {
  project_id: string;
  project_name: string;
  locations: RegistryLocation[];
}

/** @deprecated Use getProjectsDir() from ../registry/paths.js. */
export function getRegistryDir(): string {
  return getProjectsDir();
}

/**
 * Upsert the current project's registry entry. Creates the entry
 * if it doesn't exist, updates the timestamp and path-list if it
 * does. THROWS if the write fails (e.g., read-only home directory
 * in a sandboxed environment) so the caller can surface D57's single
 * warning; the caller must catch, because registry recording is
 * non-load-bearing for correctness and never fails the command.
 *
 * The `projectPath` is the filesystem location of the project's
 * `.gvp/` parent directory (NOT the .gvp/ itself — we track the
 * project root so consumers can `cd` into it).
 */
export function upsertRegistryEntry(
  projectId: string,
  projectName: string,
  projectPath: string,
): void {
  const registryDir = getProjectsDir();
  const entryPath = path.join(registryDir, `${projectId}.yml`);

  // No mkdir early-return here: writeFileAtomic does the mkdir and throws
  // uniformly. Returning early meant a read-only $HOME produced no write AND
  // no warning — the D22 behavior that D57 amends.
  const now = new Date().toISOString();

  let entry: RegistryEntry = {
    project_id: projectId,
    project_name: projectName,
    locations: [],
  };

  if (fs.existsSync(entryPath)) {
    try {
      const parsed = yaml.load(fs.readFileSync(entryPath, 'utf-8'));
      // Only trust parsed content if it has the expected shape.
      // js-yaml is permissive enough to return partial objects from
      // garbage input (e.g., `::: foo` parses as `{"::": "foo"}`),
      // so we check project_id presence as the shape signal.
      if (
        parsed &&
        typeof parsed === 'object' &&
        !Array.isArray(parsed) &&
        typeof (parsed as Record<string, unknown>).project_id === 'string'
      ) {
        entry = parsed as RegistryEntry;
      }
      // Else: treat as corrupt, keep the fresh entry initialized above
    } catch {
      // Parse threw — keep the fresh entry
    }
  }

  // Always write the canonical project_id and project_name, in case
  // the existing entry had a stale name or the caller changed it.
  entry.project_id = projectId;
  entry.project_name = projectName;

  // Ensure locations is a list even if the parsed form was malformed
  if (!Array.isArray(entry.locations)) {
    entry.locations = [];
  }

  // Find existing location by path; update its last_seen, or append new one
  const existing = entry.locations.find((loc) => loc.path === projectPath);
  if (existing) {
    existing.last_seen = now;
  } else {
    entry.locations.push({ path: projectPath, last_seen: now });
  }

  try {
    writeFileAtomic(entryPath, yaml.dump(entry, { lineWidth: 120, noRefs: true }));
  } catch (err) {
    // Signal failure so recordLibraries (Task 9) can emit D57's single
    // warning -- no caller emits one YET, so as of this commit the net
    // behavior is still a silent skip. Preserve `cause`: a warning reading
    // "registry write failed" with no errno cannot distinguish EROFS
    // (read-only home) from ENOSPC (full disk) from EACCES, which are three
    // different user actions.
    throw new Error('registry write failed', { cause: err });
  }
}

/**
 * Walk the registry directory and remove any entry whose recorded
 * locations are ALL gone from disk. Called on-demand by the preflight
 * to keep the registry tidy without a separate `cairn registry prune`
 * command. Entries with at least one still-valid location are kept,
 * with the gone locations trimmed.
 *
 * No-op if the registry directory doesn't exist yet.
 */
export function pruneStaleRegistryEntries(): void {
  const registryDir = getProjectsDir();
  if (!fs.existsSync(registryDir)) return;

  let files: string[];
  try {
    files = fs.readdirSync(registryDir);
  } catch {
    return;
  }

  const now = Date.now();
  for (const file of files) {
    // Sweep orphaned temp files. A crash between writeFileSync and
    // renameSync leaves one behind, and the very `.yml` filter below that
    // keeps them SAFE from deletion also makes them immortal -- nothing
    // else in the codebase removes them. The age bound is what makes this
    // safe: no live write takes an hour.
    if (file.endsWith('.tmp')) {
      try {
        if (now - fs.statSync(path.join(registryDir, file)).mtimeMs > 60 * 60 * 1000) {
          fs.unlinkSync(path.join(registryDir, file));
        }
      } catch {
        // Raced with another sweeper, or unreadable — leave it.
      }
      continue;
    }
    if (!file.endsWith('.yml')) continue;
    const entryPath = path.join(registryDir, file);

    // Read and PARSE are separated deliberately. Sharing one try means a
    // transient EIO, an EACCES on a root-owned entry, or ENFILE under load
    // is indistinguishable from corrupt YAML -- and the catch DELETES. That
    // is the same data-loss shape D52 closes for torn reads, with an fs
    // error as the tearer instead of a concurrent writer.
    let raw: string;
    try {
      raw = fs.readFileSync(entryPath, 'utf-8');
    } catch {
      continue; // Cannot read it => cannot judge it => must not delete it.
    }

    let entry: RegistryEntry;
    try {
      const parsed = yaml.load(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        // Genuinely corrupt content — remove it
        fs.unlinkSync(entryPath);
        continue;
      }
      entry = parsed as RegistryEntry;
    } catch {
      // Genuinely unparseable — remove it
      try {
        fs.unlinkSync(entryPath);
      } catch {
        // ignore
      }
      continue;
    }

    if (!Array.isArray(entry.locations)) {
      try {
        fs.unlinkSync(entryPath);
      } catch {
        // ignore
      }
      continue;
    }

    // Filter out locations whose paths no longer exist
    const liveLocations = entry.locations.filter((loc) => {
      if (!loc || typeof loc.path !== 'string') return false;
      return fs.existsSync(loc.path);
    });

    if (liveLocations.length === 0) {
      // All locations gone — remove the whole entry
      try {
        fs.unlinkSync(entryPath);
      } catch {
        // ignore
      }
    } else if (liveLocations.length !== entry.locations.length) {
      // Some locations pruned — rewrite the entry
      entry.locations = liveLocations;
      try {
        writeFileAtomic(entryPath, yaml.dump(entry, { lineWidth: 120, noRefs: true }));
      } catch {
        // ignore
      }
    }
    // Else: all locations still valid, leave as-is
  }
}
