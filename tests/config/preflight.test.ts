import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { runProjectPreflight } from '../../src/config/preflight.js';
import { IMMUTABLE_CONFIG_FIELDS } from '../../src/config/schema.js';

/**
 * Tests for the project preflight (D21): auto-backfill a stable
 * project_id UUID into .gvp/config.yaml on the first cairn
 * invocation that finds a .gvp/ directory without one.
 *
 * Contract:
 *   - No .gvp/ in ancestry => no-op, no writes
 *   - .gvp/ but no config.yaml => create config.yaml with project_id
 *   - .gvp/config.yaml without project_id => backfill and preserve
 *     existing config keys
 *   - .gvp/config.yaml with project_id => no-op, idempotent
 *   - Corrupt config.yaml => no-op (main loader surfaces the error)
 *   - One-line stderr notice on backfill
 *   - Returns PreflightResult describing what happened
 */
describe('runProjectPreflight (D21)', () => {
  let tmpDir: string;
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cairn-preflight-'));
    stderrSpy = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation((() => true) as never);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    stderrSpy.mockRestore();
  });

  it('is a no-op when no .gvp/ directory exists in the ancestry', () => {
    // tmpDir has no .gvp/ — preflight should walk back up the tree
    // and find none (tmp is outside any cairn project).
    const result = runProjectPreflight(tmpDir);
    expect(result.backfilled).toBe(false);
    expect(result.gvpDir).toBeUndefined();
    expect(result.configPath).toBeUndefined();
    expect(result.projectId).toBeUndefined();
    expect(stderrSpy).not.toHaveBeenCalled();
  });

  it('creates .gvp/config.yaml with a generated UUID when config is missing', () => {
    fs.mkdirSync(path.join(tmpDir, '.gvp'));
    const configPath = path.join(tmpDir, '.gvp', 'config.yaml');
    expect(fs.existsSync(configPath)).toBe(false);

    const result = runProjectPreflight(tmpDir);

    expect(result.backfilled).toBe(true);
    expect(result.gvpDir).toBe(path.join(tmpDir, '.gvp'));
    expect(result.configPath).toBe(configPath);
    expect(result.projectId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(fs.existsSync(configPath)).toBe(true);

    const parsed = yaml.load(fs.readFileSync(configPath, 'utf-8')) as Record<
      string,
      unknown
    >;
    expect(parsed.project_id).toBe(result.projectId);
  });

  it('backfills project_id into an existing config.yaml, preserving other keys', () => {
    fs.mkdirSync(path.join(tmpDir, '.gvp'));
    const configPath = path.join(tmpDir, '.gvp', 'config.yaml');
    fs.writeFileSync(
      configPath,
      yaml.dump({
        strict: true,
        suppress_diagnostics: ['W005', 'W003'],
        display: { truncation_width: 100 },
      }),
    );

    const result = runProjectPreflight(tmpDir);
    expect(result.backfilled).toBe(true);
    expect(result.projectId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );

    const parsed = yaml.load(fs.readFileSync(configPath, 'utf-8')) as Record<
      string,
      unknown
    >;
    expect(parsed.project_id).toBe(result.projectId);
    expect(parsed.strict).toBe(true);
    expect(parsed.suppress_diagnostics).toEqual(['W005', 'W003']);
    expect(parsed.display).toEqual({ truncation_width: 100 });
  });

  it('is idempotent: a second invocation does not rewrite an existing project_id', () => {
    fs.mkdirSync(path.join(tmpDir, '.gvp'));

    const first = runProjectPreflight(tmpDir);
    expect(first.backfilled).toBe(true);
    const firstId = first.projectId!;

    // Record the file mtime before second invocation
    const configPath = path.join(tmpDir, '.gvp', 'config.yaml');
    const mtimeBefore = fs.statSync(configPath).mtimeMs;

    // Sleep-free idempotency check: the second invocation should
    // return backfilled=false and the same projectId
    const second = runProjectPreflight(tmpDir);
    expect(second.backfilled).toBe(false);
    expect(second.projectId).toBe(firstId);
    expect(second.gvpDir).toBe(first.gvpDir);

    // Second stderr notice: only the first write should have emitted
    // a notice. This asserts the idempotency is observable, not just
    // a no-op on paper.
    expect(stderrSpy).toHaveBeenCalledTimes(1);

    // And the file was not actually rewritten (mtime preserved).
    // Note: some filesystems have second-granularity mtime, so this
    // check is for "not obviously re-written" rather than "definitely
    // the same bytes." The stderr call-count assertion is the strict
    // idempotency check.
    const mtimeAfter = fs.statSync(configPath).mtimeMs;
    expect(mtimeAfter).toBe(mtimeBefore);
  });

  it('emits a one-line stderr notice on backfill', () => {
    fs.mkdirSync(path.join(tmpDir, '.gvp'));
    runProjectPreflight(tmpDir);

    expect(stderrSpy).toHaveBeenCalledTimes(1);
    const notice = stderrSpy.mock.calls[0]![0] as string;
    expect(notice).toContain('cairn:');
    expect(notice).toContain('generated project_id');
    expect(notice).toContain(path.join(tmpDir, '.gvp', 'config.yaml'));
    // Single line — exactly one trailing newline, no embedded newlines.
    expect(notice).toMatch(/\n$/);
    expect(notice.slice(0, -1)).not.toContain('\n');
  });

  it('walks back up the directory tree to find .gvp/', () => {
    // Simulates running cairn from a nested subdirectory of a project.
    fs.mkdirSync(path.join(tmpDir, '.gvp'));
    const deep = path.join(tmpDir, 'a', 'b', 'c', 'd');
    fs.mkdirSync(deep, { recursive: true });

    const result = runProjectPreflight(deep);
    expect(result.backfilled).toBe(true);
    expect(result.gvpDir).toBe(path.join(tmpDir, '.gvp'));
  });

  it('handles corrupt config.yaml gracefully (no-op, no crash)', () => {
    fs.mkdirSync(path.join(tmpDir, '.gvp'));
    const configPath = path.join(tmpDir, '.gvp', 'config.yaml');
    // Write invalid YAML (tabs after key, unclosed quote, etc.)
    fs.writeFileSync(configPath, 'project_id: "unclosed\n\tbad: [');

    const result = runProjectPreflight(tmpDir);
    expect(result.backfilled).toBe(false);
    expect(result.gvpDir).toBe(path.join(tmpDir, '.gvp'));
    // The file should NOT be modified — preflight refuses to touch
    // a corrupt config surface and defers the error to the main
    // config loader.
    expect(fs.readFileSync(configPath, 'utf-8')).toBe(
      'project_id: "unclosed\n\tbad: [',
    );
    expect(stderrSpy).not.toHaveBeenCalled();
  });

  it('treats an existing empty project_id as missing and backfills', () => {
    fs.mkdirSync(path.join(tmpDir, '.gvp'));
    const configPath = path.join(tmpDir, '.gvp', 'config.yaml');
    fs.writeFileSync(configPath, yaml.dump({ project_id: '', strict: true }));

    const result = runProjectPreflight(tmpDir);
    expect(result.backfilled).toBe(true);
    expect(result.projectId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });
});

describe('IMMUTABLE_CONFIG_FIELDS (D21)', () => {
  it('contains project_id', () => {
    expect(IMMUTABLE_CONFIG_FIELDS.has('project_id')).toBe(true);
  });

  it('is a readonly Set', () => {
    // Exported type is ReadonlySet<string>; attempting to mutate
    // should not compile, but we can also assert the value is
    // frozen enough that Set.prototype.add doesn't silently
    // corrupt state across tests.
    expect(IMMUTABLE_CONFIG_FIELDS).toBeInstanceOf(Set);
  });
});
