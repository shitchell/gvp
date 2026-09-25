import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { listSkillFiles } from './paths.js';

/**
 * The install manifest — the whole reason `skill install` can be safe.
 *
 * Without it there are only two observable states, "a directory is there"
 * and "it isn't", and every install is a blind overwrite. personal:V5
 * (never silently discard, overwrite, or strand user data) rules that out,
 * and personal:R2 requires the destructive case be recognised rather than
 * assumed away. Recording the source version plus a checksum per file makes
 * three states distinguishable — absent, unmodified since install, and
 * locally modified — and only the middle one is safe to replace freely.
 *
 * The manifest lives INSIDE the destination directory. Keeping it in a
 * central location (say `~/.gvp/`) would strand it the moment someone
 * installs to a project-local `--dest` and then moves or copies that
 * project: the files would travel and their provenance would not, and an
 * install with no provenance has to be treated as modified.
 */

/** Dot-prefixed so listSkillFiles() never counts it as skill content. */
export const MANIFEST_FILENAME = '.cairn-skill.json';

/** Dot-prefixed for the same reason, and so agents scanning a skills */
/** directory do not pick a stale backup up as a second skill. */
export const BACKUP_DIRNAME = '.backups';

export interface SkillManifest {
  /** Bumped only if this file's shape changes incompatibly. */
  manifest_version: 1;
  /** Which skill was installed here. */
  skill: string;
  /** The cairn version the files were copied from. */
  source_version: string;
  /** ISO timestamp of the write. */
  installed_at: string;
  /** relative POSIX path -> sha256 of the bytes written. */
  files: Record<string, string>;
}

export type DestState =
  /** Nothing installed here. */
  | 'absent'
  /** Files present, but no manifest — provenance unknown. */
  | 'unmanaged'
  /** Files present and byte-identical to what we recorded writing. */
  | 'unmodified'
  /** At least one recorded file was edited or deleted. */
  | 'modified';

export interface DestInspection {
  dir: string;
  state: DestState;
  manifest: SkillManifest | null;
  /** Recorded files whose bytes no longer match. */
  changed: string[];
  /** Recorded files that are no longer on disk. */
  removed: string[];
  /** Files present in the directory that the manifest does not claim. */
  untracked: string[];
}

export function sha256(buf: Buffer | string): string {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

export function hashFile(file: string): string {
  return sha256(fs.readFileSync(file));
}

/** Checksums for the named files under `dir`. */
export function hashFiles(dir: string, relPaths: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rel of relPaths) {
    out[rel] = hashFile(path.join(dir, rel));
  }
  return out;
}

export function manifestPath(destDir: string): string {
  return path.join(destDir, MANIFEST_FILENAME);
}

/**
 * Read the manifest, or null if it is absent OR unreadable.
 *
 * A corrupt manifest is deliberately indistinguishable from a missing one:
 * both mean "we cannot prove what is on disk is ours", and inspect() maps
 * that to `unmanaged`, which requires --force. Trusting a half-parsed
 * manifest is the only way this design could lose an edit.
 */
export function readManifest(destDir: string): SkillManifest | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(manifestPath(destDir), 'utf-8')) as Partial<SkillManifest>;
    if (parsed.manifest_version !== 1) return null;
    if (typeof parsed.source_version !== 'string') return null;
    if (typeof parsed.files !== 'object' || parsed.files === null) return null;
    return {
      manifest_version: 1,
      skill: typeof parsed.skill === 'string' ? parsed.skill : 'cairn',
      source_version: parsed.source_version,
      installed_at: typeof parsed.installed_at === 'string' ? parsed.installed_at : '',
      files: parsed.files as Record<string, string>,
    };
  } catch {
    return null;
  }
}

export function writeManifest(destDir: string, manifest: SkillManifest): void {
  fs.writeFileSync(manifestPath(destDir), `${JSON.stringify(manifest, null, 2)}\n`, 'utf-8');
}

/**
 * Build a manifest over EXACTLY the files this install wrote.
 *
 * Deliberately not "everything now in the directory": hashing the whole tree
 * would adopt a user's own file into the manifest, and an adopted file is a
 * file a later update believes it owns and may prune. The manifest records
 * what we put there, nothing else.
 */
export function buildManifest(
  destDir: string,
  sourceVersion: string,
  skill: string,
  writtenFiles: string[],
): SkillManifest {
  return {
    manifest_version: 1,
    skill,
    source_version: sourceVersion,
    installed_at: new Date().toISOString(),
    files: hashFiles(destDir, [...writtenFiles].sort()),
  };
}

/**
 * Classify what is at `destDir`.
 *
 * `untracked` files are REPORTED but never make the state `modified`, and
 * are never deleted: the install only ever writes paths it is about to
 * record, so a note a user dropped beside the skill is not at risk and
 * should not cost them a --force.
 *
 * A recorded file that was DELETED does count as modified. Silently
 * resurrecting a document someone deliberately removed is the "strand"
 * half of personal:V5, and --force plus a backup is the honest way to do
 * it anyway.
 */
export function inspectDest(destDir: string): DestInspection {
  const base: DestInspection = { dir: destDir, state: 'absent', manifest: null, changed: [], removed: [], untracked: [] };
  if (!fs.existsSync(destDir)) return base;

  const present = listSkillFiles(destDir);
  const manifest = readManifest(destDir);
  if (present.length === 0 && manifest === null) return base;

  if (manifest === null) {
    return { ...base, state: 'unmanaged', untracked: present };
  }

  const recorded = Object.keys(manifest.files).sort();
  const changed: string[] = [];
  const removed: string[] = [];
  for (const rel of recorded) {
    const abs = path.join(destDir, rel);
    if (!fs.existsSync(abs)) {
      removed.push(rel);
      continue;
    }
    if (hashFile(abs) !== manifest.files[rel]) changed.push(rel);
  }
  const recordedSet = new Set(recorded);
  const untracked = present.filter((p) => !recordedSet.has(p));

  return {
    dir: destDir,
    state: changed.length > 0 || removed.length > 0 ? 'modified' : 'unmodified',
    manifest,
    changed,
    removed,
    untracked,
  };
}

/** True when the state forbids overwriting without explicit authorization. */
export function requiresForce(state: DestState): boolean {
  return state === 'modified' || state === 'unmanaged';
}
