import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/**
 * Global option placement (#21).
 *
 * `--override` used to be declared variadic (`-c, --override <key=value...>`).
 * A variadic option swallows every following token until the next
 * option-like one — including the SUBCOMMAND NAME — so
 * `cairn -c strict=true query --category decision` failed with
 * `error: unknown option '--category'`: `query` had been eaten, and
 * `--category` was therefore evaluated at program level.
 *
 * The fix is three-part:
 *   1. `--override` is repeatable, not variadic (`-c a=1 -c b=2`).
 *   2. `.enablePositionalOptions()` so `-c` means `--override` before the
 *      subcommand and `--category` after it.
 *   3. An override lacking `=` is an error rather than a silent no-op.
 *
 * (2) changes how Commander splits argv at the subcommand boundary, so
 * this file also pins the behaviour that change could plausibly have
 * broken: global options written AFTER the subcommand, which is the form
 * used throughout README.md, docs/ and examples/ (`cairn validate
 * --strict`, `cairn query --library X --category principle`).
 */
describe('global option placement (#21)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cairn-globalopts-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  /**
   * A library with one goal, one value and one decision, so `--category`
   * filtering has something to actually narrow down: an unfiltered query
   * returns 3 elements, `--category decision` returns 1. A filter that is
   * silently dropped is therefore visible as a count, not just as an exit
   * code.
   *
   * It validates clean but WARNS: being a single document, V1 and D1 map
   * only within their own document (W005). That is deliberate — it gives
   * `--strict` and `-c strict=true` an observable effect (exit 0 becomes
   * exit 1), which is how the trailing-override test proves the override
   * was applied rather than merely parsed.
   */
  function createLibrary(): string {
    const libDir = path.join(tmpDir, 'lib');
    fs.mkdirSync(libDir, { recursive: true });
    fs.writeFileSync(
      path.join(libDir, 'main.yaml'),
      `
meta:
  name: main
  scope: project
goals:
  - id: G1
    name: Ship it
    statement: Ship the thing.
    tags: []
    maps_to: []
values:
  - id: V1
    name: Care
    statement: Care about it.
    tags: []
    maps_to: [main:G1]
decisions:
  - id: D1
    name: Use YAML
    rationale: We use YAML.
    disposition: accepted
    tags: []
    maps_to: [main:G1, main:V1]
    refs:
      - file: README.md
        identifier: main
        role: implements
`,
    );
    return libDir;
  }

  function runCairn(...args: string[]): { stdout: string; stderr: string; exitCode: number } {
    const cliPath = path.resolve(__dirname, '../../dist/cli/index.js');
    const result = spawnSync('node', [cliPath, ...args], {
      cwd: tmpDir,
      // Per-suite registry root — see tests/cli/store-flag.test.ts for why
      // the subprocess must not inherit the shared globalSetup root.
      env: { ...process.env, GVP_REGISTRY_ROOT: path.join(tmpDir, '.registry') },
      encoding: 'utf-8',
      timeout: 15000,
    });
    return {
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? '',
      exitCode: result.status ?? 1,
    };
  }

  /** Count elements in `--format compact` output (one element per line). */
  function compactCount(stdout: string): number {
    return stdout.split('\n').filter(l => l.trim().length > 0).length;
  }

  describe('--override no longer swallows the subcommand', () => {
    it('accepts -c <override> before the subcommand and still sees the subcommand options', () => {
      const lib = createLibrary();
      const r = runCairn('--library', lib, '-c', 'strict=true', 'query', '--category', 'decision', '--format', 'compact');
      expect(r.stderr).not.toContain('unknown option');
      expect(r.exitCode).toBe(0);
      expect(compactCount(r.stdout)).toBe(1);
    });

    it('behaves identically for the long form (the bug was never about the short flag)', () => {
      const lib = createLibrary();
      const r = runCairn('--library', lib, '--override', 'strict=true', 'query', '--category', 'decision', '--format', 'compact');
      expect(r.stderr).not.toContain('unknown option');
      expect(r.exitCode).toBe(0);
      expect(compactCount(r.stdout)).toBe(1);
    });

    it('is repeatable rather than variadic: -c a=1 -c b=2', () => {
      const lib = createLibrary();
      const r = runCairn(
        '--library', lib,
        '-c', 'strict=false',
        '-c', 'source=@local',
        'query', '--format', 'compact',
      );
      expect(r.stderr).not.toContain('unknown option');
      expect(r.exitCode).toBe(0);
      expect(compactCount(r.stdout)).toBe(3);
    });

    it('rejects the old variadic spelling instead of eating the subcommand', () => {
      const lib = createLibrary();
      // `-c a=1 b=2` used to be the documented multi-override form AND the
      // mechanism that ate subcommands. `b=2` is now a stray operand, which
      // Commander reports rather than silently absorbing.
      const r = runCairn('--library', lib, '-c', 'strict=false', 'source=@local', 'query');
      expect(r.exitCode).not.toBe(0);
    });
  });

  describe('-c disambiguates by position', () => {
    it('binds -c to --category AFTER the subcommand', () => {
      const lib = createLibrary();
      const r = runCairn('--library', lib, 'query', '-c', 'decision', '--format', 'compact');
      expect(r.exitCode).toBe(0);
      expect(compactCount(r.stdout)).toBe(1);
      expect(r.stdout).toContain('D1');
    });

    it('binds -c to --override BEFORE the subcommand', () => {
      const lib = createLibrary();
      // `strict=true` promotes warnings to errors. This library has a goal
      // nothing maps to it from another document, so the run is still clean;
      // what matters is that the override was PARSED as an override and not
      // mistaken for a category filter (which would have returned 0 rows).
      const r = runCairn('--library', lib, '-c', 'source=@local', 'query', '--format', 'compact');
      expect(r.exitCode).toBe(0);
      expect(compactCount(r.stdout)).toBe(3);
    });

    it('accepts both in one invocation, each binding by position', () => {
      const lib = createLibrary();
      const r = runCairn('--library', lib, '-c', 'source=@local', 'query', '-c', 'value', '--format', 'compact');
      expect(r.exitCode).toBe(0);
      expect(compactCount(r.stdout)).toBe(1);
      expect(r.stdout).toContain('V1');
    });

    it('advertises -c as --category in `query --help`, matching what it does', () => {
      const r = runCairn('query', '--help');
      expect(r.stdout).toContain('-c, --category');
      // The mirrored global is long-only on `query`, precisely because `-c`
      // is taken there.
      expect(r.stdout).not.toContain('-c, --override');
    });
  });

  describe('malformed overrides are rejected (not silently dropped)', () => {
    it('errors when an override has no `=`', () => {
      const lib = createLibrary();
      const r = runCairn('--library', lib, '-c', 'garbagekey', 'query', '--format', 'compact');
      expect(r.exitCode).not.toBe(0);
      expect(r.stderr).toContain('key=value');
      expect(r.stderr).toContain('garbagekey');
    });

    it('errors when an override has an empty key', () => {
      const lib = createLibrary();
      const r = runCairn('--library', lib, '-c', '=novalue', 'query');
      expect(r.exitCode).not.toBe(0);
      expect(r.stderr).toContain('key=value');
    });

    it('accepts an empty VALUE — `key=` is a deliberate blank, not a typo', () => {
      const lib = createLibrary();
      const r = runCairn('--library', lib, '-c', 'source=', 'query', '--format', 'compact');
      expect(r.exitCode).toBe(0);
    });

    it('does not swallow the malformed value into an unfiltered result set', () => {
      // The regression that caused a false bug report: `-c garbagekey`
      // returned EVERY element with exit 0, which reads as "the filter
      // matched everything".
      const lib = createLibrary();
      const r = runCairn('--library', lib, '-c', 'garbagekey', 'query', '--format', 'compact');
      expect(compactCount(r.stdout)).toBe(0);
    });
  });

  describe('global options still work AFTER the subcommand', () => {
    // Every one of these forms appears in README.md, docs/ or examples/.
    // `.enablePositionalOptions()` would have broken all of them on its
    // own; the global options are mirrored onto each subcommand so both
    // placements keep working.

    it('cairn query --library X --category Y', () => {
      const lib = createLibrary();
      const r = runCairn('query', '--library', lib, '--category', 'decision', '--format', 'compact');
      expect(r.stderr).not.toContain('unknown option');
      expect(r.exitCode).toBe(0);
      expect(compactCount(r.stdout)).toBe(1);
    });

    it('cairn validate --library X --strict — and the flag takes effect', () => {
      const lib = createLibrary();
      const r = runCairn('validate', '--library', lib, '--strict');
      expect(r.stderr).not.toContain('unknown option');
      // W005 promoted to an error, so a run that is otherwise clean fails.
      expect(r.exitCode).not.toBe(0);
    });

    it('cairn validate --library X --no-registry (negated global after the subcommand)', () => {
      const lib = createLibrary();
      const r = runCairn('validate', '--library', lib, '--no-registry');
      expect(r.stderr).not.toContain('unknown option');
      // --no-registry must actually take effect, not just parse: the
      // registry root stays empty.
      expect(fs.existsSync(path.join(tmpDir, '.registry'))).toBe(false);
    });

    it('cairn query --library X --override key=value (long-only mirror)', () => {
      const lib = createLibrary();
      const r = runCairn('query', '--library', lib, '--override', 'source=@local', '--format', 'compact');
      expect(r.stderr).not.toContain('unknown option');
      expect(r.exitCode).toBe(0);
      expect(compactCount(r.stdout)).toBe(3);
    });

    it('rejects a malformed override in the trailing position too', () => {
      const lib = createLibrary();
      const r = runCairn('query', '--library', lib, '--override', 'garbagekey');
      expect(r.exitCode).not.toBe(0);
      expect(r.stderr).toContain('key=value');
    });

    it('cairn inspect --library X <id> --trace (global before a positional argument)', () => {
      const lib = createLibrary();
      const r = runCairn('inspect', '--library', lib, 'main:D1', '--trace');
      expect(r.stderr).not.toContain('unknown option');
      expect(r.exitCode).toBe(0);
    });

    it('APPLIES a trailing override, not merely parses it', () => {
      // The sharpest check that hoisting works. `strict=true` promotes W005
      // ("maps only to elements within its own document", which V1 and D1
      // both trigger here) to an error, so the exit code flips. If the
      // trailing value were dropped on the way to loadConfig, this would
      // parse cleanly and exit 0 — indistinguishable from an override that
      // never arrived.
      const lib = createLibrary();
      expect(runCairn('validate', '--library', lib).exitCode).toBe(0);
      expect(runCairn('validate', '--library', lib, '--override', 'strict=true').exitCode).not.toBe(0);
      expect(runCairn('--library', lib, '-c', 'strict=true', 'validate').exitCode).not.toBe(0);
    });

    it('counts -vv identically in either position', () => {
      const lib = createLibrary();
      const before = runCairn('-vv', '--library', lib, 'query', '--format', 'compact');
      const after = runCairn('query', '--library', lib, '-vv', '--format', 'compact');
      // The mirrored --verbose carries no default, so its counter starts
      // from undefined rather than from the program's 0. Both must still
      // reach level 2.
      expect(after.stderr).toBe(before.stderr);
    });

    it('lists the mirrored globals in subcommand help, since they are accepted there', () => {
      const r = runCairn('validate', '--help');
      expect(r.stdout).toContain('--library');
      expect(r.stdout).toContain('--override');
    });
  });
});
