import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { libsCommand } from '../../src/cli/commands/libs.js';
import { upsertLibraryEntry, listLibraryKeys } from '../../src/registry/library-entry.js';
import { canonicalizeSource, entryKey } from '../../src/registry/key.js';
import { getLibrariesDir, getProjectsDir } from '../../src/registry/paths.js';

// Real fs throughout; individual tests override ONE function to stage the
// concurrent-deletion race (C2). `vi.spyOn(fs, ...)` cannot do this — an ESM
// namespace object is not configurable.
vi.mock('fs', { spy: true });
const realUnlink = (await vi.importActual<typeof fs>('fs')).unlinkSync;

/**
 * `cairn libs` (D54, D55) — the user-facing surface over the registry.
 *
 * The contracts pinned here are the ones whose failure mode is SILENT:
 *   - `show` REFUSES an ambiguous name instead of first-matching. meta.name
 *     is explicitly not unique (D46), and silently picking one would
 *     contradict how this same library treats ambiguous references (R8).
 *   - `forget` matches ONLY `<source>:<document_path>`, never a name, so it
 *     cannot delete every entry that happens to share a name.
 *   - `prune` DELEGATES its local half to pruneLibraryEntries (P11), and
 *     never drops a remote without the explicit `--remote` opt-in (D55).
 *   - every search skip bucket reaches stderr — a silent miss is the
 *     failure this command was filed for.
 */

const DOC = [
  'meta:',
  '  name: alpha',
  '  scope: project',
  'goals:',
  '  - id: G1',
  '    name: Ship the thing',
  '    statement: Deliver working software.',
  'decisions:',
  '  - id: D1',
  '    name: Use YAML',
  '    rationale: Chosen because a hand-editable format keeps the barrier low.',
  '',
].join('\n');

let tmp: string;
let priorRoot: string | undefined;
let logs: string[];
let errs: string[];

/** Seed a real on-disk library directory plus its registry entry. */
function seedLocal(
  dirName: string,
  opts: { name?: string | null; scope?: string | null; doc?: string; file?: string; write?: boolean } = {},
): { dir: string; key: string } {
  const dir = path.join(tmp, dirName);
  const file = opts.file ?? 'main.yaml';
  if (opts.write !== false) {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, file), opts.doc ?? DOC);
  }
  const source = canonicalizeSource(dir, tmp);
  const key = entryKey(source, 'main');
  upsertLibraryEntry(key, {
    name: opts.name === undefined ? 'alpha' : opts.name,
    source,
    document_path: 'main',
    file,
    scope: opts.scope === undefined ? 'project' : opts.scope,
    project_id: null,
    library_id: null,
    // Deliberately asymmetric: sum (3) differs from category count (2), so
    // a `list` that printed the number of CATEGORIES is distinguishable.
    element_counts: { goals: 1, decisions: 2 },
  });
  return { dir, key };
}

/** Seed a remote entry whose cache is NOT populated. */
function seedUncachedRemote(source = '@github:acme/lib@v1.0.0', name = 'remotelib'): string {
  const key = entryKey(source, 'main');
  upsertLibraryEntry(key, {
    name,
    source,
    document_path: 'main',
    file: 'main.yaml',
    scope: 'org',
    project_id: null,
    library_id: null,
    element_counts: { goals: 2 },
  });
  return key;
}

function seedProjectEntry(id: string, projectPath: string, hashes: string[]): void {
  fs.mkdirSync(getProjectsDir(), { recursive: true });
  fs.writeFileSync(
    path.join(getProjectsDir(), `${id}.yml`),
    yaml.dump({
      locations: [{ path: projectPath }],
      libraries: hashes.map((h) => ({
        hash: h,
        first_seen: '2026-01-01T00:00:00.000Z',
        last_seen: '2026-02-02T00:00:00.000Z',
      })),
    }),
  );
}

/** Run a subcommand in-process, capturing stdout/stderr and any exit. */
async function run(...argv: string[]): Promise<void> {
  await libsCommand().parseAsync(argv, { from: 'user' });
}

const out = (): string => logs.join('\n');
const err = (): string => errs.join('\n');

/**
 * Simulate the C2 race: a concurrent prune removes the entry file between
 * the listing and our unlink, so unlink sees ENOENT. The file really is
 * deleted first, so the post-condition is the same one a real race leaves.
 */
function raceUnlink(): void {
  vi.mocked(fs.unlinkSync).mockImplementation((p: fs.PathLike) => {
    // realUnlink, not fs.rmSync: rmSync calls unlinkSync internally, and
    // the mocked one would recurse.
    try {
      realUnlink(p);
    } catch {
      /* already gone */
    }
    throw Object.assign(new Error(`ENOENT: no such file, unlink '${String(p)}'`), { code: 'ENOENT' });
  });
}

beforeEach(() => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'cairn-libs-')));
  priorRoot = process.env.GVP_REGISTRY_ROOT;
  process.env.GVP_REGISTRY_ROOT = path.join(tmp, '.registry');
  fs.mkdirSync(getLibrariesDir(), { recursive: true });
  logs = [];
  errs = [];
  vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => { logs.push(a.join(' ')); });
  vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => { errs.push(a.join(' ')); });
  vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    throw new Error(`EXIT:${code ?? 0}`);
  }) as never);
});

afterEach(() => {
  // The module auto-spy is not tracked by restoreAllMocks, so a leaked
  // raceUnlink would silently break every later prune/forget test.
  vi.mocked(fs.unlinkSync).mockRestore();
  vi.restoreAllMocks();
  if (priorRoot === undefined) delete process.env.GVP_REGISTRY_ROOT;
  else process.env.GVP_REGISTRY_ROOT = priorRoot;
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('cairn libs (D54)', () => {
  it('registers list, show, search, forget, and prune', () => {
    const names = libsCommand().commands.map((c) => c.name()).sort();
    expect(names).toEqual(['forget', 'list', 'prune', 'search', 'show']);
  });

  it('exposes --json on list, show, and search', () => {
    const cmd = libsCommand();
    for (const sub of ['list', 'show', 'search']) {
      const c = cmd.commands.find((x) => x.name() === sub)!;
      expect(c.options.some((o) => o.long === '--json')).toBe(true);
    }
  });

  it('exposes --kind and --scope on list', () => {
    const list = libsCommand().commands.find((c) => c.name() === 'list')!;
    const longs = list.options.map((o) => o.long);
    expect(longs).toContain('--kind');
    expect(longs).toContain('--scope');
  });

  it('exposes --fetch on search', () => {
    const s = libsCommand().commands.find((c) => c.name() === 'search')!;
    expect(s.options.some((o) => o.long === '--fetch')).toBe(true);
  });
});

describe('libs list', () => {
  it('lists every recorded document with kind, count, and source', async () => {
    const a = seedLocal('libA');
    seedUncachedRemote();
    await run('list');
    expect(out()).toContain('alpha');
    expect(out()).toContain(a.dir);
    expect(out()).toContain('remotelib');
    expect(out()).toContain('local');
    expect(out()).toContain('remote');
    // Total element count is the SUM over categories (1 goal + 2 decisions),
    // not the number of categories.
    expect(out()).toMatch(/alpha\s+local\s+3\s/);
  });

  it('marks an uncached remote as not cached', async () => {
    seedUncachedRemote();
    await run('list');
    expect(out()).toContain('(not cached)');
  });

  it('says so when nothing is recorded', async () => {
    await run('list');
    expect(out()).toContain('No libraries recorded yet.');
  });

  it('distinguishes an empty registry from an empty filter', async () => {
    seedLocal('libA');
    await run('list', '--kind', 'remote');
    expect(out()).toContain('No libraries match those filters.');
    // Claiming nothing is recorded while a local entry exists is a false
    // statement about system state.
    expect(out()).not.toContain('No libraries recorded yet.');
  });

  it('--json emits the derived kind/cached/key fields', async () => {
    seedLocal('libA');
    seedUncachedRemote();
    await run('list', '--json');
    const parsed = JSON.parse(out()) as Array<Record<string, unknown>>;
    expect(parsed).toHaveLength(2);
    const remote = parsed.find((p) => p.kind === 'remote')!;
    expect(remote.cached).toBe(false);
    expect(remote.ref).toBe('v1.0.0');
    expect(typeof remote.key).toBe('string');
    const local = parsed.find((p) => p.kind === 'local')!;
    expect(local.cached).toBe(true);
  });

  it('--kind filters', async () => {
    seedLocal('libA');
    seedUncachedRemote();
    await run('list', '--kind', 'remote', '--json');
    const parsed = JSON.parse(out()) as Array<Record<string, unknown>>;
    expect(parsed).toHaveLength(1);
    expect(parsed[0]!.name).toBe('remotelib');
  });

  it('--scope filters', async () => {
    seedLocal('libA');
    seedUncachedRemote();
    await run('list', '--scope', 'project', '--json');
    const parsed = JSON.parse(out()) as Array<Record<string, unknown>>;
    expect(parsed).toHaveLength(1);
    expect(parsed[0]!.scope).toBe('project');
  });
});

describe('libs show', () => {
  it('shows an unambiguous name with its usage edge', async () => {
    const a = seedLocal('libA');
    seedProjectEntry('11111111-1111-4111-8111-111111111111', '/home/dev/proj', [a.key]);
    await run('show', 'alpha');
    expect(out()).toContain('alpha');
    expect(out()).toContain(a.dir);
    expect(out()).toContain('goals=1');
    expect(out()).toContain('/home/dev/proj');
    expect(out()).toContain('2026-01-01T00:00:00.000Z');
    expect(out()).toContain('2026-02-02T00:00:00.000Z');
  });

  it('REFUSES an ambiguous name, naming every candidate, and exits non-zero', async () => {
    const a = seedLocal('libA');
    const b = seedLocal('libB');
    await expect(run('show', 'alpha')).rejects.toThrow('EXIT:1');
    expect(err()).toContain('ambiguous');
    expect(err()).toContain(`${a.dir}:main`);
    expect(err()).toContain(`${b.dir}:main`);
    // Refusing means printing NO library detail — a first-match would have
    // rendered one document's body to stdout.
    expect(out()).toBe('');
  });

  it('--json on an ambiguous name carries every candidate and still exits non-zero', async () => {
    seedLocal('libA');
    seedLocal('libB');
    await expect(run('show', 'alpha', '--json')).rejects.toThrow('EXIT:1');
    const parsed = JSON.parse(out()) as unknown[];
    expect(parsed).toHaveLength(2);
  });

  it('resolves <source>:<document_path> even when the name is ambiguous', async () => {
    const a = seedLocal('libA');
    seedLocal('libB');
    await run('show', `${a.dir}:main`);
    expect(out()).toContain(a.dir);
    expect(err()).toBe('');
  });

  it('exits non-zero when nothing matches', async () => {
    seedLocal('libA');
    await expect(run('show', 'nope')).rejects.toThrow('EXIT:1');
    expect(err()).toContain('No library matches');
  });

  it('--json includes the usage edge', async () => {
    const a = seedLocal('libA');
    seedProjectEntry('22222222-2222-4222-8222-222222222222', '/home/dev/other', [a.key]);
    await run('show', 'alpha', '--json');
    const parsed = JSON.parse(out()) as Array<{ usage: { seen_from: string[]; last_seen: string } }>;
    expect(parsed[0]!.usage.seen_from).toEqual(['/home/dev/other']);
    expect(parsed[0]!.usage.last_seen).toBe('2026-02-02T00:00:00.000Z');
  });
});

describe('libs search', () => {
  it('matches element names and each category primary field', async () => {
    seedLocal('libA');
    await run('search', 'hand-editable');
    expect(out()).toContain('D1');
    expect(out()).toContain('decisions/rationale');
  });

  it('reports uncached remotes on stderr with --fetch guidance', async () => {
    seedLocal('libA');
    seedUncachedRemote();
    await run('search', 'Ship');
    expect(err()).toContain('skipped uncached remote @github:acme/lib@v1.0.0');
    expect(err()).toContain('--fetch');
  });

  it('reports a local library that is gone from disk, without --fetch guidance', async () => {
    const gone = seedLocal('libGone', { write: false });
    await run('search', 'Ship');
    expect(err()).toContain('no longer on disk');
    expect(err()).toContain(gone.dir);
    // --fetch is a REMOTE policy; offering it for a deleted local path
    // would be advice that cannot work.
    expect(err()).not.toContain('--fetch');
  });

  it('reports an unreadable document, without --fetch guidance', async () => {
    const bad = seedLocal('libBad');
    fs.unlinkSync(path.join(bad.dir, 'main.yaml'));
    await run('search', 'Ship');
    expect(err()).toContain('could not read document');
    expect(err()).toContain(bad.dir);
    expect(err()).not.toContain('--fetch');
  });

  it('changes the remote message under --fetch when the fetch fails', async () => {
    // No commit-ish: GitSourceResolver rejects it before any network I/O,
    // so this exercises the --fetch branch without touching the network.
    seedUncachedRemote('@github:acme/lib', 'bad-remote');
    await run('search', 'Ship', '--fetch');
    expect(err()).toContain('could not fetch remote @github:acme/lib');
    expect(err()).not.toContain('use --fetch');
  });

  it('says so when there are no matches', async () => {
    seedLocal('libA');
    await run('search', 'zzzznotpresent');
    expect(out()).toContain('No matches.');
  });

  it('--json carries results and all three skip buckets', async () => {
    seedLocal('libA');
    seedUncachedRemote();
    seedLocal('libGone', { write: false });
    const bad = seedLocal('libBad');
    fs.unlinkSync(path.join(bad.dir, 'main.yaml'));
    await run('search', 'Ship', '--json');
    const parsed = JSON.parse(out()) as {
      results: unknown[];
      skipped: string[];
      missingLocal: string[];
      unreadable: string[];
    };
    expect(parsed.results.length).toBeGreaterThan(0);
    expect(parsed.skipped).toHaveLength(1);
    expect(parsed.missingLocal).toHaveLength(1);
    expect(parsed.unreadable).toHaveLength(1);
    // JSON mode is for machines: the buckets are IN the payload, so nothing
    // needs to be scraped off stderr.
    expect(err()).toBe('');
  });
});

describe('libs forget', () => {
  it('removes exactly the entry named by <source>:<document_path>', async () => {
    const a = seedLocal('libA');
    const b = seedLocal('libB');
    await run('forget', `${a.dir}:main`);
    expect(out()).toContain('Removed 1 entry.');
    expect(listLibraryKeys().sort()).toEqual([b.key]);
  });

  it('NEVER matches a bare name — names are not unique (D46)', async () => {
    const a = seedLocal('libA');
    const b = seedLocal('libB');
    await run('forget', 'alpha');
    expect(out()).toContain('Removed 0 entries.');
    expect(listLibraryKeys().sort()).toEqual([a.key, b.key].sort());
  });

  it('is a no-op for an unknown selector', async () => {
    const a = seedLocal('libA');
    await run('forget', '/nowhere:main');
    expect(out()).toContain('Removed 0 entries.');
    expect(listLibraryKeys()).toEqual([a.key]);
  });

  it('survives the entry file vanishing underneath it (C2)', async () => {
    const a = seedLocal('libA');
    raceUnlink();
    await expect(run('forget', `${a.dir}:main`)).resolves.toBeUndefined();
    expect(listLibraryKeys()).toEqual([]);
  });
});

describe('libs prune', () => {
  it('drops a local entry whose DOCUMENT is gone while its directory remains', async () => {
    // The delegated semantics (pruneLibraryEntries): document-level, not
    // directory-level. A local reimplementation of the directory check
    // would leave this entry orphaned forever.
    const a = seedLocal('libA');
    const b = seedLocal('libB');
    fs.unlinkSync(path.join(a.dir, 'main.yaml'));
    await run('prune');
    expect(out()).toContain('Pruned 1 entry.');
    expect(listLibraryKeys()).toEqual([b.key]);
  });

  it('drops an unparseable entry', async () => {
    seedLocal('libA');
    fs.writeFileSync(path.join(getLibrariesDir(), 'garbage.yml'), 'this: [is: not: valid');
    await run('prune');
    expect(out()).toContain('Pruned 1 entry.');
    expect(listLibraryKeys()).not.toContain('garbage');
  });

  it('leaves an uncached remote ALONE without --remote (D55)', async () => {
    const remoteKey = seedUncachedRemote();
    const gone = seedLocal('libGone', { write: false });
    await run('prune');
    expect(out()).toContain('Pruned 1 entry.');
    expect(listLibraryKeys()).toEqual([remoteKey]);
    expect(listLibraryKeys()).not.toContain(gone.key);
  });

  it('--remote is the explicit opt-in that drops it', async () => {
    seedUncachedRemote();
    const a = seedLocal('libA');
    await run('prune', '--remote');
    expect(out()).toContain('Pruned 1 entry.');
    expect(listLibraryKeys()).toEqual([a.key]);
  });

  it('counts both halves when --remote is given', async () => {
    seedUncachedRemote();
    seedLocal('libGone', { write: false });
    await run('prune', '--remote');
    expect(out()).toContain('Pruned 2 entries.');
    expect(listLibraryKeys()).toEqual([]);
  });

  it('reports nothing pruned when everything is live', async () => {
    seedLocal('libA');
    await run('prune');
    expect(out()).toContain('Pruned 0 entries.');
  });

  it('survives a remote entry file vanishing underneath --remote (C2)', async () => {
    seedUncachedRemote();
    raceUnlink();
    await expect(run('prune', '--remote')).resolves.toBeUndefined();
    expect(listLibraryKeys()).toEqual([]);
  });
});

/**
 * End-to-end against the built CLI. Exit codes are the contract `show`'s
 * refusal rests on, and an in-process `process.exit` spy cannot prove the
 * real process actually exits non-zero. Requires `npm run build`.
 */
describe('libs end-to-end (built CLI)', () => {
  const CLI = path.resolve(__dirname, '../../dist/cli/index.js');

  function cli(args: string[]): { status: number | null; stdout: string; stderr: string } {
    const r = spawnSync('node', [CLI, 'libs', ...args], {
      cwd: tmp,
      env: { ...process.env, GVP_REGISTRY_ROOT: path.join(tmp, '.registry') },
      encoding: 'utf-8',
      timeout: 20000,
    });
    return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
  }

  it('libs list --json exits 0 and emits parseable JSON', () => {
    seedLocal('libA');
    const r = cli(['list', '--json']);
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout) as Array<{ name: string }>;
    expect(parsed[0]!.name).toBe('alpha');
  });

  it('libs show exits 1 on an ambiguous name', () => {
    seedLocal('libA');
    seedLocal('libB');
    const r = cli(['show', 'alpha']);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('ambiguous');
    expect(r.stdout).toBe('');
  });
});
