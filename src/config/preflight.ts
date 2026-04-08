import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { randomUUID } from 'crypto';

/**
 * Project preflight — runs before every catalog-building cairn
 * invocation to ensure the current project has a stable identity
 * and to serve as the insertion point for additional per-invocation
 * side effects (registry upsert for feature 2, etc.).
 *
 * The preflight walks back from cwd looking for a `.gvp/` directory
 * (the parent of `.gvp/library/`). If found and the project lacks
 * a `project_id` in `.gvp/config.yaml`, it generates a UUID and
 * writes the config file (creating it if necessary). If no `.gvp/`
 * is found, preflight is a no-op — there's no project context to
 * identify.
 *
 * Rationale captured in D21 of the cairn library:
 * - Auto-backfill on first invocation beats an explicit migration
 *   command for discoverability.
 * - .gvp/config.yaml is the identity home (not meta.project_id in
 *   a document, not .gvp/.uuid as a sidecar) because it's already
 *   a structured, validated config surface.
 * - Immutability enforced via IMMUTABLE_CONFIG_FIELDS in edit paths.
 * - The one-time write is a qualitatively different side effect
 *   from "every command writes to a registry cache" — it happens
 *   exactly once per project ever, not on every invocation.
 * - A one-line stderr notice makes the write visible without
 *   being noisy.
 *
 * NOTE: preflight does NOT walk from a `--library <override>` path.
 * It always walks from cwd. If the user invokes cairn from inside
 * project A while passing `--library ~/.cwork/pm/gvp/` to read the
 * PM library, preflight backfills A's identity, not the PM library's.
 * This matches the intuition that "project identity" tracks the
 * directory you're working in, not whichever library you happen to
 * be reading at the moment.
 */

export interface PreflightResult {
  /** The .gvp/ directory that was found (or undefined if none). */
  gvpDir?: string;
  /** The config.yaml path inside .gvp/. Undefined if no gvpDir. */
  configPath?: string;
  /** The project_id after preflight (either pre-existing or newly assigned). */
  projectId?: string;
  /** True if this invocation performed a write. False if the project_id already existed. */
  backfilled: boolean;
}

/**
 * Walk back from cwd looking for a .gvp/ directory. Returns the
 * path to the first .gvp/ directory found, or undefined if none
 * exists anywhere in the ancestor chain. Symmetric with how
 * discoverConfigPaths and buildCatalog walk back for .gvp/library/.
 */
function findGvpDir(cwd: string): string | undefined {
  let current = path.resolve(cwd);
  while (true) {
    const candidate = path.join(current, '.gvp');
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      return candidate;
    }
    const parent = path.dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

/**
 * Run the project preflight from cwd. Idempotent: returns the
 * current project_id without writing if one already exists.
 * Writes `.gvp/config.yaml` with a generated UUID only when the
 * file is missing or exists but lacks a project_id.
 *
 * Returns a PreflightResult describing what was found and whether
 * a write occurred, so callers (tests, CLI verbosity flags) can
 * report on the behavior.
 */
export function runProjectPreflight(cwd: string = process.cwd()): PreflightResult {
  const gvpDir = findGvpDir(cwd);
  if (!gvpDir) {
    return { backfilled: false };
  }

  const configPath = path.join(gvpDir, 'config.yaml');
  let existingConfig: Record<string, unknown> = {};

  if (fs.existsSync(configPath)) {
    try {
      const content = fs.readFileSync(configPath, 'utf-8');
      const parsed = yaml.load(content);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        existingConfig = parsed as Record<string, unknown>;
      }
    } catch {
      // Corrupt or unreadable config — leave it alone. The main
      // config loader will surface the error during the actual
      // cairn command. Preflight only writes to a clean surface.
      return { gvpDir, configPath, backfilled: false };
    }
  }

  // If a project_id already exists, preflight is a no-op.
  const existing = existingConfig.project_id;
  if (typeof existing === 'string' && existing.length > 0) {
    return {
      gvpDir,
      configPath,
      projectId: existing,
      backfilled: false,
    };
  }

  // Generate and write. Uses crypto.randomUUID() which produces a
  // valid UUIDv4 per RFC 4122. The configSchema validates any UUID
  // version on read, so v4 is a fine default.
  const newId = randomUUID();
  const updated: Record<string, unknown> = {
    project_id: newId,
    ...existingConfig,
  };

  const yamlContent = yaml.dump(updated, { lineWidth: 120, noRefs: true });
  fs.writeFileSync(configPath, yamlContent);

  // One-line stderr notice — loud enough to see in CI logs,
  // quiet enough to not be noisy on interactive runs.
  process.stderr.write(
    `cairn: generated project_id ${newId} and wrote it to ${configPath}\n`,
  );

  return {
    gvpDir,
    configPath,
    projectId: newId,
    backfilled: true,
  };
}
