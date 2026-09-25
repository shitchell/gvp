import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { fileURLToPath } from 'url';

/**
 * Locating the packaged skill directory (#1, #14 item 3).
 *
 * The problem this file exists to solve: `skills/` lives at the REPO root,
 * not under `dist/`, so the layout differs between a dev checkout and an
 * installed package. Today the two happen to agree — `src/skill/` and
 * `dist/skill/` are both exactly two levels below the root — so
 * `__dirname/../../skills/cairn` would work in both. That agreement is a
 * coincidence of the current `outDir`/`rootDir` pair, not a guarantee: a
 * bundler, a nested `outDir`, or moving this file one directory deeper
 * silently breaks it, and it breaks at RUNTIME in a consumer's install
 * rather than in CI. So resolve by SEARCH instead of by arithmetic —
 * walk up until a package root identifies itself.
 */

/** The one skill this package ships. */
export const SKILL_NAME = 'cairn';

/** Package identity used to recognise our own root while walking up. */
const PACKAGE_NAME = '@principled/cairn';

/** Path, relative to the package root, of the skill source directory. */
const SKILL_RELATIVE_DIR = path.join('skills', SKILL_NAME);

/** The file every valid skill directory must contain. */
const SKILL_ENTRY_FILE = 'SKILL.md';

function thisDir(): string {
  try {
    return path.dirname(fileURLToPath(import.meta.url));
  } catch {
    // CJS contexts where import.meta.url is unavailable — same fallback
    // src/schema/defaults-loader.ts uses (P11).
    return __dirname;
  }
}

/** Every ancestor directory of `start`, innermost first, including `start`. */
function ancestors(start: string): string[] {
  const out: string[] = [];
  let dir = path.resolve(start);
  for (;;) {
    out.push(dir);
    const parent = path.dirname(dir);
    if (parent === dir) return out;
    dir = parent;
  }
}

function readPackageName(dir: string): string | null {
  try {
    const raw = fs.readFileSync(path.join(dir, 'package.json'), 'utf-8');
    const parsed = JSON.parse(raw) as { name?: unknown };
    return typeof parsed.name === 'string' ? parsed.name : null;
  } catch {
    return null;
  }
}

function readPackageVersion(dir: string): string | null {
  try {
    const raw = fs.readFileSync(path.join(dir, 'package.json'), 'utf-8');
    const parsed = JSON.parse(raw) as { version?: unknown };
    return typeof parsed.version === 'string' ? parsed.version : null;
  } catch {
    return null;
  }
}

function hasSkillDir(dir: string): boolean {
  return fs.existsSync(path.join(dir, SKILL_RELATIVE_DIR, SKILL_ENTRY_FILE));
}

/**
 * The root of THIS package — the checkout root when running from source or
 * from `dist/`, and `node_modules/@principled/cairn` when installed.
 *
 * Two probes, in order:
 *   1. the nearest ancestor whose package.json names this package. Precise:
 *      a consumer's own package.json higher up cannot match, and a nested
 *      `dist/` or bundler output still lands inside it.
 *   2. the nearest ancestor that actually contains `skills/cairn/SKILL.md`.
 *      Covers a rename or a vendored copy, where identity is unavailable but
 *      the artifact is right there.
 */
export function findPackageRoot(from: string = thisDir()): string | null {
  const chain = ancestors(from);
  for (const dir of chain) {
    if (readPackageName(dir) === PACKAGE_NAME) return dir;
  }
  for (const dir of chain) {
    if (hasSkillDir(dir)) return dir;
  }
  return null;
}

/** The version of the packaged skill: the package's own version. */
export function getPackagedVersion(): string {
  const root = findPackageRoot();
  return (root && readPackageVersion(root)) ?? 'unknown';
}

/**
 * Absolute path to the packaged skill source directory.
 * Throws rather than returning a guess: every caller writes files relative
 * to this, and a wrong-but-plausible path is how you copy nothing into the
 * right place, or something into the wrong one.
 */
export function getSkillSourceDir(): string {
  const root = findPackageRoot();
  if (root === null) {
    throw new Error(
      `Could not locate the ${PACKAGE_NAME} package root from ${thisDir()}. ` +
        `The packaged skill directory (${SKILL_RELATIVE_DIR}) is missing — this install looks incomplete.`,
    );
  }
  const dir = path.join(root, SKILL_RELATIVE_DIR);
  if (!fs.existsSync(path.join(dir, SKILL_ENTRY_FILE))) {
    throw new Error(
      `Packaged skill directory not found at ${dir}. ` +
        `If this is an installed copy, the package was published without 'skills/' in its "files" list.`,
    );
  }
  return dir;
}

/** Human-facing spelling of the default destination, for help text. */
export const DEFAULT_DEST_DISPLAY = `~/.claude/skills/${SKILL_NAME}`;

/**
 * Default install destination, or null when there is no home directory to
 * anchor it to.
 *
 * `~/.claude/skills/cairn/` is a DEFAULT, not a hardcoded target: the command
 * is named `skill`, not `claude-skill`, so `--dest` must be able to point
 * anywhere — including a project-local `.claude/skills/cairn`, which is why
 * no separate `--project` flag exists.
 *
 * Returning null rather than a best guess is the point. With HOME unset or
 * empty — systemd units, cron, some CI images — os.homedir() can yield the
 * empty string, and path.join('') produces the RELATIVE path
 * `.claude/skills/cairn`. That would write the skill into whatever directory
 * the process happened to be in, which is the "strand user data" half of
 * personal:V5: files land somewhere nobody will look for them and the real
 * destination stays empty. There is no correct default in that case, so the
 * caller must be told to pass --dest instead of being handed a path.
 */
export function findDefaultDestDir(): string | null {
  const home = process.env.HOME || process.env.USERPROFILE || os.homedir();
  if (!home || home.length === 0) return null;
  return path.join(home, '.claude', 'skills', SKILL_NAME);
}

/** As findDefaultDestDir, but throws the explanation rather than returning null. */
export function getDefaultDestDir(): string {
  const dir = findDefaultDestDir();
  if (dir === null) {
    throw new Error(
      'No home directory could be determined (HOME is unset or empty), so there is no default ' +
        'install destination. Pass --dest <path>.',
    );
  }
  return dir;
}

/**
 * Every file in a skill directory, as POSIX-separated relative paths, sorted.
 *
 * Dot-prefixed entries are skipped at every level. That is what keeps the
 * manifest (`.cairn-skill.json`) and the backup directory (`.backups/`) out
 * of the content set — they describe the install, they are not part of it,
 * and a manifest that listed itself could never verify.
 */
export function listSkillFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (abs: string, rel: string): void => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(abs, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const childAbs = path.join(abs, entry.name);
      const childRel = rel === '' ? entry.name : `${rel}/${entry.name}`;
      if (entry.isDirectory()) {
        walk(childAbs, childRel);
      } else if (entry.isFile()) {
        out.push(childRel);
      }
    }
  };
  walk(dir, '');
  return out.sort();
}
