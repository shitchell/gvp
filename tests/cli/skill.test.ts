import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  SKILL_NAME,
  findDefaultDestDir,
  findPackageRoot,
  getDefaultDestDir,
  getPackagedVersion,
  getSkillSourceDir,
  listSkillFiles,
} from '../../src/skill/paths.js';
import {
  MANIFEST_FILENAME,
  BACKUP_DIRNAME,
  buildManifest,
  inspectDest,
  readManifest,
  requiresForce,
  writeManifest,
} from '../../src/skill/manifest.js';
import { backupDest, performInstall, planInstall } from '../../src/skill/install.js';
import { skillCommand } from '../../src/cli/commands/skill.js';

/**
 * `cairn skill` (#1, #14 item 3).
 *
 * The contracts pinned here are the ones whose failure mode is SILENT or
 * DESTRUCTIVE:
 *   - the packaged skill directory resolves from BOTH a source checkout and
 *     an installed `node_modules` layout. `dist/` and `src/` currently sit
 *     the same distance below the root, so `__dirname` arithmetic would pass
 *     in CI and break only in a consumer's install.
 *   - `--yes` and `--force` are NOT interchangeable. A CI job that skipped
 *     the prompt must not thereby destroy a user's local edits (personal:V5).
 *   - a locally modified skill is refused even with a TTY attached, and
 *     `--force` backs the current copy up BEFORE overwriting (personal:R2).
 *   - files the user added beside the skill are never adopted into the
 *     manifest and never pruned.
 */

// The prompt is the one branch a piped-stdin child process cannot reach, so
// it is exercised in-process with readline stubbed.
const hoisted = vi.hoisted(() => ({ answer: 'y', questions: [] as string[] }));
vi.mock('readline', () => {
  const createInterface = (): { question: (q: string, cb: (a: string) => void) => void; close: () => void } => ({
    question: (q: string, cb: (a: string) => void) => {
      hoisted.questions.push(q);
      cb(hoisted.answer);
    },
    close: () => {},
  });
  return { createInterface, default: { createInterface } };
});

let tmp: string;

beforeEach(() => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'cairn-skill-')));
  hoisted.answer = 'y';
  hoisted.questions = [];
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
  vi.restoreAllMocks();
});

/**
 * A throwaway skill source tree, so tests do not depend on the real docs.
 * Each call gets its OWN directory: an update test needs the old source and
 * the new source to differ, and reusing one directory silently made them the
 * same tree (the prune assertions passed vacuously).
 */
let sourceSeq = 0;
function fakeSource(files: Record<string, string>): string {
  const dir = path.join(tmp, `source-${++sourceSeq}`);
  for (const [rel, body] of Object.entries(files)) {
    const abs = path.join(dir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, body);
  }
  return dir;
}

const BASE_SOURCE = { 'SKILL.md': '# skill\n', 'workflow.md': 'flow\n', 'ref/schema.md': 'schema\n' };

// ---------------------------------------------------------------------------
// Packaged-path resolution
// ---------------------------------------------------------------------------

describe('packaged skill path resolution', () => {
  it('resolves the real packaged directory from the source checkout', () => {
    const dir = getSkillSourceDir();
    expect(fs.existsSync(path.join(dir, 'SKILL.md'))).toBe(true);
    expect(path.basename(dir)).toBe(SKILL_NAME);
    expect(getPackagedVersion()).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('lists skill files as sorted relative POSIX paths, skipping dot entries', () => {
    const dir = fakeSource({ ...BASE_SOURCE, [MANIFEST_FILENAME]: '{}', '.backups/old/SKILL.md': 'old' });
    expect(listSkillFiles(dir)).toEqual(['SKILL.md', 'ref/schema.md', 'workflow.md']);
  });

  it('finds the package root inside node_modules, not the consumer above it', () => {
    // The layout an installed copy actually has: a consumer package.json
    // sits ABOVE ours. Walking up for "the nearest package.json" would stop
    // at the wrong one; walking up for OUR name cannot.
    const consumer = path.join(tmp, 'consumer');
    const pkg = path.join(consumer, 'node_modules', '@principled', 'cairn');
    fs.mkdirSync(path.join(pkg, 'dist', 'skill'), { recursive: true });
    fs.mkdirSync(path.join(pkg, 'skills', SKILL_NAME), { recursive: true });
    fs.writeFileSync(path.join(consumer, 'package.json'), '{"name":"consumer","version":"1.0.0"}');
    fs.writeFileSync(path.join(pkg, 'package.json'), '{"name":"@principled/cairn","version":"9.9.9"}');
    fs.writeFileSync(path.join(pkg, 'skills', SKILL_NAME, 'SKILL.md'), '# x');

    expect(findPackageRoot(path.join(pkg, 'dist', 'skill'))).toBe(pkg);
  });

  it('falls back to the nearest ancestor that actually holds the skill', () => {
    // No package.json names us anywhere — a vendored or renamed copy. The
    // artifact is still the answer.
    const root = path.join(tmp, 'vendored');
    fs.mkdirSync(path.join(root, 'lib', 'deep'), { recursive: true });
    fs.mkdirSync(path.join(root, 'skills', SKILL_NAME), { recursive: true });
    fs.writeFileSync(path.join(root, 'skills', SKILL_NAME, 'SKILL.md'), '# x');
    expect(findPackageRoot(path.join(root, 'lib', 'deep'))).toBe(root);
  });

  it('never mistakes some other package.json for ours', () => {
    // The nearest-package.json heuristic would return `consumer` here and
    // then read a skills directory that does not exist. Identity, not
    // proximity, is what makes the resolution safe.
    const consumer = path.join(tmp, 'other');
    fs.mkdirSync(path.join(consumer, 'sub'), { recursive: true });
    fs.writeFileSync(path.join(consumer, 'package.json'), '{"name":"some-consumer","version":"1.0.0"}');
    expect(findPackageRoot(path.join(consumer, 'sub'))).not.toBe(consumer);
  });

  it('defaults the destination under HOME, and refuses a relative one', () => {
    const prior = process.env.HOME;
    try {
      process.env.HOME = path.join(tmp, 'home');
      expect(getDefaultDestDir()).toBe(path.join(tmp, 'home', '.claude', 'skills', 'cairn'));

      // With no home, path.join('') would yield the RELATIVE path
      // `.claude/skills/cairn` and strand the skill in the cwd. There is no
      // correct default here, so there must not be one.
      process.env.HOME = '';
      expect(findDefaultDestDir()).toBeNull();
      expect(() => getDefaultDestDir()).toThrow(/--dest/);
    } finally {
      if (prior === undefined) delete process.env.HOME;
      else process.env.HOME = prior;
    }
  });
});

// ---------------------------------------------------------------------------
// Manifest states
// ---------------------------------------------------------------------------

describe('install-state detection', () => {
  function install(source: string, version = '1.0.0'): string {
    const dest = path.join(tmp, 'dest');
    performInstall(planInstall(source, dest, version));
    return dest;
  }

  it('an absent destination is absent, and an empty one too', () => {
    expect(inspectDest(path.join(tmp, 'nope')).state).toBe('absent');
    fs.mkdirSync(path.join(tmp, 'empty'));
    expect(inspectDest(path.join(tmp, 'empty')).state).toBe('absent');
  });

  it('a fresh install is unmodified and records the source version', () => {
    const dest = install(fakeSource(BASE_SOURCE), '3.1.0');
    const got = inspectDest(dest);
    expect(got.state).toBe('unmodified');
    expect(got.manifest?.source_version).toBe('3.1.0');
    expect(Object.keys(got.manifest!.files).sort()).toEqual(['SKILL.md', 'ref/schema.md', 'workflow.md']);
    expect(requiresForce(got.state)).toBe(false);
  });

  it('an edited file makes the install modified', () => {
    const dest = install(fakeSource(BASE_SOURCE));
    fs.appendFileSync(path.join(dest, 'workflow.md'), 'my notes\n');
    const got = inspectDest(dest);
    expect(got.state).toBe('modified');
    expect(got.changed).toEqual(['workflow.md']);
    expect(requiresForce(got.state)).toBe(true);
  });

  it('a deleted file makes the install modified rather than silently returning', () => {
    const dest = install(fakeSource(BASE_SOURCE));
    fs.unlinkSync(path.join(dest, 'ref/schema.md'));
    const got = inspectDest(dest);
    expect(got.state).toBe('modified');
    expect(got.removed).toEqual(['ref/schema.md']);
  });

  it('files with no manifest are unmanaged — provenance unknown, force required', () => {
    const dest = path.join(tmp, 'hand-rolled');
    fs.mkdirSync(dest, { recursive: true });
    fs.writeFileSync(path.join(dest, 'SKILL.md'), 'hand written');
    const got = inspectDest(dest);
    expect(got.state).toBe('unmanaged');
    expect(got.untracked).toEqual(['SKILL.md']);
    expect(requiresForce(got.state)).toBe(true);
  });

  it('a corrupt manifest is treated as no manifest, never as proof of ownership', () => {
    const dest = install(fakeSource(BASE_SOURCE));
    fs.writeFileSync(path.join(dest, MANIFEST_FILENAME), '{ not json');
    expect(readManifest(dest)).toBeNull();
    expect(inspectDest(dest).state).toBe('unmanaged');
  });

  it("a user's own file beside the skill is reported but costs no --force", () => {
    const dest = install(fakeSource(BASE_SOURCE));
    fs.writeFileSync(path.join(dest, 'my-notes.md'), 'mine');
    const got = inspectDest(dest);
    expect(got.state).toBe('unmodified');
    expect(got.untracked).toEqual(['my-notes.md']);
  });

  it('the manifest records only what was written, so a user file is never adopted', () => {
    const dest = install(fakeSource(BASE_SOURCE));
    fs.writeFileSync(path.join(dest, 'my-notes.md'), 'mine');
    performInstall(planInstall(fakeSource(BASE_SOURCE), dest, '1.0.1'));
    expect(Object.keys(readManifest(dest)!.files)).not.toContain('my-notes.md');
    expect(fs.existsSync(path.join(dest, 'my-notes.md'))).toBe(true);
  });

  it('the backup directory does not count as skill content', () => {
    const dest = install(fakeSource(BASE_SOURCE));
    backupDest(dest);
    expect(inspectDest(dest).state).toBe('unmodified');
    expect(inspectDest(dest).untracked).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Update planning: prune vs keep
// ---------------------------------------------------------------------------

describe('updating over a previous install', () => {
  it('deletes a previous version file that is gone from the source and unmodified', () => {
    const dest = path.join(tmp, 'dest');
    performInstall(planInstall(fakeSource({ ...BASE_SOURCE, 'retired.md': 'old\n' }), dest, '1.0.0'));
    const plan = planInstall(fakeSource(BASE_SOURCE), dest, '2.0.0');
    expect(plan.prune).toEqual(['retired.md']);
    performInstall(plan);
    expect(fs.existsSync(path.join(dest, 'retired.md'))).toBe(false);
    expect(readManifest(dest)!.source_version).toBe('2.0.0');
  });

  it('keeps a retired file the user edited, instead of discarding their work', () => {
    const dest = path.join(tmp, 'dest');
    performInstall(planInstall(fakeSource({ ...BASE_SOURCE, 'retired.md': 'old\n' }), dest, '1.0.0'));
    fs.writeFileSync(path.join(dest, 'retired.md'), 'my rewrite\n');
    const plan = planInstall(fakeSource(BASE_SOURCE), dest, '2.0.0');
    expect(plan.prune).toEqual([]);
    expect(plan.keptStale).toEqual(['retired.md']);
    performInstall(plan);
    expect(fs.readFileSync(path.join(dest, 'retired.md'), 'utf-8')).toBe('my rewrite\n');
  });

  it('backs up content and manifest, but not previous backups', () => {
    const dest = path.join(tmp, 'dest');
    performInstall(planInstall(fakeSource(BASE_SOURCE), dest, '1.0.0'));
    fs.writeFileSync(path.join(dest, 'SKILL.md'), 'edited\n');
    const first = backupDest(dest);
    expect(fs.readFileSync(path.join(first, 'SKILL.md'), 'utf-8')).toBe('edited\n');
    expect(fs.existsSync(path.join(first, MANIFEST_FILENAME))).toBe(true);
    expect(fs.existsSync(path.join(first, 'ref', 'schema.md'))).toBe(true);

    const second = backupDest(dest);
    expect(second).not.toBe(first);
    expect(fs.existsSync(path.join(second, BACKUP_DIRNAME))).toBe(false);
  });

  it('writes the backup before touching anything, and the backup holds the edit', () => {
    const dest = path.join(tmp, 'dest');
    performInstall(planInstall(fakeSource(BASE_SOURCE), dest, '1.0.0'));
    fs.writeFileSync(path.join(dest, 'SKILL.md'), 'MY EDIT\n');
    const result = performInstall(planInstall(fakeSource(BASE_SOURCE), dest, '2.0.0'), { backup: true });
    expect(result.backupDir).not.toBeNull();
    expect(fs.readFileSync(path.join(result.backupDir!, 'SKILL.md'), 'utf-8')).toBe('MY EDIT\n');
    expect(fs.readFileSync(path.join(dest, 'SKILL.md'), 'utf-8')).toBe('# skill\n');
  });

  it('a manifest naming a file that vanished does not abort the update', () => {
    const dest = path.join(tmp, 'dest');
    performInstall(planInstall(fakeSource({ ...BASE_SOURCE, 'retired.md': 'old\n' }), dest, '1.0.0'));
    fs.unlinkSync(path.join(dest, 'retired.md'));
    const plan = planInstall(fakeSource(BASE_SOURCE), dest, '2.0.0');
    expect(plan.prune).toEqual([]);
    expect(() => performInstall(plan)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Interactive behaviour (in-process; a piped child never has a TTY)
// ---------------------------------------------------------------------------

describe('confirmation prompt', () => {
  let logs: string[];
  let errs: string[];
  let priorTTY: boolean | undefined;
  let exitCodes: number[];

  class Exited extends Error {
    constructor(readonly code: number) {
      super(`exit ${code}`);
    }
  }

  beforeEach(() => {
    logs = [];
    errs = [];
    exitCodes = [];
    vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => void logs.push(a.join(' ')));
    vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => void errs.push(a.join(' ')));
    vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      exitCodes.push(code ?? 0);
      throw new Exited(code ?? 0);
    }) as never);
    priorTTY = process.stdin.isTTY;
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });
  });

  afterEach(() => {
    Object.defineProperty(process.stdin, 'isTTY', { value: priorTTY, configurable: true });
  });

  /**
   * The FIRST recorded exit is the answer. The action wrapper catches and
   * re-exits, which a real process never sees because the first exit already
   * ended it.
   */
  async function run(...argv: string[]): Promise<number> {
    exitCodes = [];
    try {
      await skillCommand().parseAsync(argv, { from: 'user' });
    } catch (e) {
      if (!(e instanceof Exited)) throw e;
    }
    return exitCodes[0] ?? 0;
  }

  it('asks before writing, naming the destination', async () => {
    const dest = path.join(tmp, 'dest');
    hoisted.answer = 'y';
    expect(await run('install', '--dest', dest)).toBe(0);
    expect(hoisted.questions.join('')).toContain(dest);
    expect(fs.existsSync(path.join(dest, 'SKILL.md'))).toBe(true);
  });

  it('writes nothing when the answer is no', async () => {
    const dest = path.join(tmp, 'dest');
    hoisted.answer = 'n';
    expect(await run('install', '--dest', dest)).toBe(1);
    expect(fs.existsSync(dest)).toBe(false);
    expect(errs.join('\n')).toContain('Nothing was written');
  });

  it('refuses a locally modified skill even with a TTY attached', async () => {
    const dest = path.join(tmp, 'dest');
    await run('install', '--dest', dest, '--yes');
    fs.appendFileSync(path.join(dest, 'SKILL.md'), 'MY EDIT\n');
    hoisted.answer = 'y';
    hoisted.questions = [];

    expect(await run('install', '--dest', dest)).toBe(1);
    // The prompt is never even reached: the refusal is about authorization,
    // not about whether someone is watching.
    expect(hoisted.questions).toEqual([]);
    expect(errs.join('\n')).toContain('--force');
    expect(fs.readFileSync(path.join(dest, 'SKILL.md'), 'utf-8')).toContain('MY EDIT');
  });

  it('--force still asks: it authorizes the overwrite, not the silence', async () => {
    const dest = path.join(tmp, 'dest');
    await run('install', '--dest', dest, '--yes');
    fs.appendFileSync(path.join(dest, 'SKILL.md'), 'MY EDIT\n');
    hoisted.answer = 'n';
    hoisted.questions = [];

    expect(await run('install', '--dest', dest, '--force')).toBe(1);
    expect(hoisted.questions.length).toBe(1);
    expect(fs.readFileSync(path.join(dest, 'SKILL.md'), 'utf-8')).toContain('MY EDIT');
  });

  it('--dry-run previews and writes nothing, prompt included', async () => {
    const dest = path.join(tmp, 'dest');
    expect(await run('install', '--dest', dest, '--dry-run')).toBe(0);
    expect(fs.existsSync(dest)).toBe(false);
    expect(hoisted.questions).toEqual([]);
    expect(logs.join('\n')).toContain('not installed');
  });
});

// ---------------------------------------------------------------------------
// End-to-end against the built CLI — exit codes are the contract
// ---------------------------------------------------------------------------

describe('skill end-to-end (built CLI)', () => {
  const CLI = path.resolve(__dirname, '../../dist/cli/index.js');

  function cli(args: string[]): { status: number | null; stdout: string; stderr: string } {
    // stdin is a pipe, so process.stdin.isTTY is undefined — this is the
    // headless case by construction, which is exactly what CI looks like.
    const r = spawnSync('node', [CLI, 'skill', ...args], {
      cwd: tmp,
      env: { ...process.env, HOME: path.join(tmp, 'home') },
      encoding: 'utf-8',
      timeout: 20000,
    });
    return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
  }

  const dest = (): string => path.join(tmp, 'dest');

  it('path prints an existing directory and nothing else on stdout', () => {
    const r = cli(['path']);
    expect(r.status).toBe(0);
    const printed = r.stdout.trim();
    expect(fs.existsSync(path.join(printed, 'SKILL.md'))).toBe(true);
    expect(printed.split('\n').length).toBe(1);
  });

  it('path --json carries the version and the file list', () => {
    const r = cli(['path', '--json']);
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout) as { version: string; path: string; files: string[] };
    expect(parsed.files).toContain('SKILL.md');
    expect(parsed.version).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('a fresh install writes the packaged files plus a manifest', () => {
    const r = cli(['install', '--dest', dest(), '--yes']);
    expect(r.status).toBe(0);
    const packaged = listSkillFiles(getSkillSourceDir());
    expect(listSkillFiles(dest())).toEqual(packaged);
    expect(readManifest(dest())!.source_version).toBe(getPackagedVersion());
  });

  it('headless without --yes refuses, names --yes, and writes nothing', () => {
    const r = cli(['install', '--dest', dest()]);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('--yes');
    expect(fs.existsSync(dest())).toBe(false);
  });

  it('updating an unmodified install needs no --force and leaves no backup', () => {
    expect(cli(['install', '--dest', dest(), '--yes']).status).toBe(0);
    const r = cli(['install', '--dest', dest(), '--yes']);
    expect(r.status).toBe(0);
    expect(fs.existsSync(path.join(dest(), BACKUP_DIRNAME))).toBe(false);
  });

  it('a modified install is refused, and --yes alone does not authorize it', () => {
    cli(['install', '--dest', dest(), '--yes']);
    fs.appendFileSync(path.join(dest(), 'SKILL.md'), '\nMY EDIT\n');

    const r = cli(['install', '--dest', dest(), '--yes']);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('--force');
    // The whole point of splitting the flags: --yes did not destroy this.
    expect(fs.readFileSync(path.join(dest(), 'SKILL.md'), 'utf-8')).toContain('MY EDIT');
  });

  it('--force without --yes is still refused headlessly, naming --yes', () => {
    cli(['install', '--dest', dest(), '--yes']);
    fs.appendFileSync(path.join(dest(), 'SKILL.md'), '\nMY EDIT\n');

    const r = cli(['install', '--dest', dest(), '--force']);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('--yes');
    expect(fs.readFileSync(path.join(dest(), 'SKILL.md'), 'utf-8')).toContain('MY EDIT');
  });

  it('--force --yes backs the edited copy up before overwriting it', () => {
    cli(['install', '--dest', dest(), '--yes']);
    fs.appendFileSync(path.join(dest(), 'SKILL.md'), '\nMY EDIT\n');

    const r = cli(['install', '--dest', dest(), '--force', '--yes']);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('Backed up');

    const backups = fs.readdirSync(path.join(dest(), BACKUP_DIRNAME));
    expect(backups.length).toBe(1);
    const saved = fs.readFileSync(path.join(dest(), BACKUP_DIRNAME, backups[0]!, 'SKILL.md'), 'utf-8');
    expect(saved).toContain('MY EDIT');
    expect(fs.readFileSync(path.join(dest(), 'SKILL.md'), 'utf-8')).not.toContain('MY EDIT');
    expect(inspectDest(dest()).state).toBe('unmodified');
  });

  it('--dry-run reports the plan and writes nothing', () => {
    const r = cli(['install', '--dest', dest(), '--dry-run']);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('not installed');
    expect(fs.existsSync(dest())).toBe(false);
  });

  it('install --json puts one object on stdout and the narrative on stderr', () => {
    const r = cli(['install', '--dest', dest(), '--yes', '--json']);
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout) as { outcome: string; state: string; written: number };
    expect(parsed.outcome).toBe('installed');
    expect(parsed.state).toBe('absent');
    expect(parsed.written).toBeGreaterThan(0);
    expect(r.stderr).toContain('destination:');
  });

  it('status reports version skew without any network call', () => {
    cli(['install', '--dest', dest(), '--yes']);
    // Pretend the install came from an older cairn. This is the exact
    // drift #14 was filed about, and the only signal is local.
    const m = readManifest(dest())!;
    writeManifest(dest(), { ...m, source_version: '0.0.1' });

    const human = cli(['status', '--dest', dest()]);
    expect(human.status).toBe(0);
    expect(human.stdout).toContain(`Installed from 0.0.1, current is ${getPackagedVersion()}`);

    const json = cli(['status', '--dest', dest(), '--json']);
    const parsed = JSON.parse(json.stdout) as { up_to_date: boolean; installed_version: string; state: string };
    expect(parsed.up_to_date).toBe(false);
    expect(parsed.installed_version).toBe('0.0.1');
    expect(parsed.state).toBe('unmodified');
  });

  it('status on an absent destination says so instead of failing', () => {
    const r = cli(['status', '--dest', dest()]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('not installed');
    const parsed = JSON.parse(cli(['status', '--dest', dest(), '--json']).stdout) as {
      state: string;
      installed_version: string | null;
      up_to_date: boolean;
    };
    expect(parsed.state).toBe('absent');
    expect(parsed.installed_version).toBeNull();
    expect(parsed.up_to_date).toBe(false);
  });

  it('with no --dest, the default lands under HOME and is never written implicitly', () => {
    const home = path.join(tmp, 'home');
    // Nothing has run an install yet, so the default location must be empty.
    expect(fs.existsSync(path.join(home, '.claude', 'skills', 'cairn'))).toBe(false);
    const r = cli(['status']);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain(path.join(home, '.claude', 'skills', 'cairn'));
    expect(fs.existsSync(path.join(home, '.claude'))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Manifest construction
// ---------------------------------------------------------------------------

describe('manifest file', () => {
  it('round-trips and rejects a manifest from an incompatible future shape', () => {
    const dest = path.join(tmp, 'dest');
    fs.mkdirSync(dest, { recursive: true });
    fs.writeFileSync(path.join(dest, 'SKILL.md'), 'body');
    const m = buildManifest(dest, '3.2.0', SKILL_NAME, ['SKILL.md']);
    writeManifest(dest, m);
    expect(readManifest(dest)).toEqual(m);

    fs.writeFileSync(path.join(dest, MANIFEST_FILENAME), JSON.stringify({ ...m, manifest_version: 2 }));
    expect(readManifest(dest)).toBeNull();
  });
});
