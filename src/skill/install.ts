import * as fs from 'fs';
import * as path from 'path';
import { listSkillFiles, SKILL_NAME } from './paths.js';
import {
  BACKUP_DIRNAME,
  buildManifest,
  hashFile,
  inspectDest,
  writeManifest,
  type DestInspection,
} from './manifest.js';

/**
 * Install planning and execution.
 *
 * Everything destructive is decided HERE, before a byte is written, so the
 * confirmation prompt describes the change that will actually happen rather
 * than a summary assembled separately from the code that performs it. The
 * `mv` command already works this way — compute in memory, preview, then
 * write — and a plan/perform split is the only way `--dry-run` and the
 * prompt can be trusted to agree with the result (P11).
 */

export interface InstallPlan {
  sourceDir: string;
  destDir: string;
  /** Version of the packaged skill being installed. */
  version: string;
  /** Version recorded by a previous install here, if any. */
  installedVersion: string | null;
  inspection: DestInspection;
  /** Relative paths that will be written. */
  write: string[];
  /** Subset of `write` that already exists at the destination. */
  overwrite: string[];
  /**
   * Files a previous install wrote, absent from this version's source, and
   * still byte-identical to what we recorded. Deleted, because leaving a
   * document from an older skill behind is drift an agent will happily read.
   */
  prune: string[];
  /**
   * The same, except the user edited them. Never deleted — that is the
   * `discard` half of personal:V5 — only reported.
   */
  keptStale: string[];
  /** True when this plan would overwrite or delete anything. */
  destructive: boolean;
}

export function planInstall(sourceDir: string, destDir: string, version: string): InstallPlan {
  const inspection = inspectDest(destDir);
  const sourceFiles = listSkillFiles(sourceDir);
  const sourceSet = new Set(sourceFiles);

  const overwrite = sourceFiles.filter((rel) => fs.existsSync(path.join(destDir, rel)));

  const prune: string[] = [];
  const keptStale: string[] = [];
  if (inspection.manifest) {
    for (const [rel, recordedHash] of Object.entries(inspection.manifest.files)) {
      if (sourceSet.has(rel)) continue;
      const abs = path.join(destDir, rel);
      if (!fs.existsSync(abs)) continue;
      if (hashFile(abs) === recordedHash) prune.push(rel);
      else keptStale.push(rel);
    }
  }

  return {
    sourceDir,
    destDir,
    version,
    installedVersion: inspection.manifest?.source_version ?? null,
    inspection,
    write: sourceFiles,
    overwrite,
    prune: prune.sort(),
    keptStale: keptStale.sort(),
    destructive: overwrite.length > 0 || prune.length > 0,
  };
}

export interface InstallResult {
  written: number;
  pruned: number;
  backupDir: string | null;
}

/**
 * Copy the current destination aside before it is overwritten.
 *
 * The backup goes to `<dest>/.backups/<timestamp>/`, not to a sibling like
 * `<dest>.bak`. A sibling of `~/.claude/skills/cairn/` is another directory
 * inside `~/.claude/skills/` containing a SKILL.md, which is exactly what a
 * skill loader scans for — the backup would come back as a second, stale
 * copy of the skill. A dot-prefixed subdirectory is skipped by both that
 * scan and by listSkillFiles(), so it cannot be mistaken for content or
 * recorded into the next manifest.
 */
export function backupDest(destDir: string): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const root = path.join(destDir, BACKUP_DIRNAME);
  let target = path.join(root, stamp);
  let n = 1;
  while (fs.existsSync(target)) target = path.join(root, `${stamp}-${n++}`);
  fs.mkdirSync(target, { recursive: true });

  for (const entry of fs.readdirSync(destDir, { withFileTypes: true })) {
    if (entry.name === BACKUP_DIRNAME) continue;
    const from = path.join(destDir, entry.name);
    const to = path.join(target, entry.name);
    if (entry.isDirectory()) fs.cpSync(from, to, { recursive: true });
    else if (entry.isFile()) fs.copyFileSync(from, to);
  }
  return target;
}

export function performInstall(plan: InstallPlan, opts: { backup: boolean } = { backup: false }): InstallResult {
  let backupDir: string | null = null;
  // Back up FIRST. If the copy fails we have not touched anything yet, so
  // the failure costs an error message rather than the user's edits.
  if (opts.backup && fs.existsSync(plan.destDir)) {
    backupDir = backupDest(plan.destDir);
  }

  fs.mkdirSync(plan.destDir, { recursive: true });
  for (const rel of plan.write) {
    const to = path.join(plan.destDir, rel);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(path.join(plan.sourceDir, rel), to);
  }
  for (const rel of plan.prune) {
    try {
      fs.unlinkSync(path.join(plan.destDir, rel));
    } catch {
      /* already gone */
    }
  }

  // Record only what we wrote. Files the user left in the directory stay
  // untracked, so no later update believes it owns them.
  writeManifest(plan.destDir, buildManifest(plan.destDir, plan.version, SKILL_NAME, plan.write));
  return { written: plan.write.length, pruned: plan.prune.length, backupDir };
}
