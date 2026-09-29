import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { computeReviewHash, validateReviewHash } from '../../src/provenance/review-hash.js';
import { isStale, getUnreviewedUpdates } from '../../src/provenance/staleness.js';
import { Element } from '../../src/model/element.js';

describe('gvp review (CMD-6)', () => {
  it('identifies stale elements', () => {
    const el = new Element({
      id: 'P1', name: 'Test', status: 'active',
      updated_by: [{ id: 'u1', date: '2026-03-20', rationale: 'changed', skip_review: false }],
      reviewed_by: [],
    }, 'principle', '@local', 'doc');
    expect(isStale(el)).toBe(true);
    expect(getUnreviewedUpdates(el)).toEqual(['u1']);
  });

  it('does not flag elements with all updates reviewed', () => {
    const el = new Element({
      id: 'P2', name: 'Reviewed', status: 'active',
      updated_by: [{ id: 'u1', date: '2026-03-20', rationale: 'changed', skip_review: false }],
      reviewed_by: [{ id: 'r1', date: '2026-03-21', updates_reviewed: ['u1'] }],
    }, 'principle', '@local', 'doc');
    expect(isStale(el)).toBe(false);
    expect(getUnreviewedUpdates(el)).toEqual([]);
  });

  it('does not flag skip_review updates as stale', () => {
    const el = new Element({
      id: 'P3', name: 'Skipped', status: 'active',
      updated_by: [{ id: 'u1', date: '2026-03-20', rationale: 'typo fix', skip_review: true }],
      reviewed_by: [],
    }, 'principle', '@local', 'doc');
    expect(isStale(el)).toBe(false);
    expect(getUnreviewedUpdates(el)).toEqual([]);
  });

  it('review hash validates correctly', () => {
    const ids = ['u1', 'u2'];
    const hash = computeReviewHash(ids);
    expect(validateReviewHash(hash, ids)).toBe(true);
    expect(validateReviewHash(hash, ['u1'])).toBe(false);
    expect(validateReviewHash('wrong', ids)).toBe(false);
  });

  it('review hash is order-independent', () => {
    const hash1 = computeReviewHash(['u1', 'u2']);
    const hash2 = computeReviewHash(['u2', 'u1']);
    expect(hash1).toBe(hash2);
  });
});

/**
 * `cairn review` end to end, against a throwaway store.
 *
 * WHY THESE ARE CLI TESTS AND NOT UNIT TESTS. Every defect they cover
 * (gvp #17, #40) was a flag that parsed, ran, exited 0 and recorded nothing —
 * or recorded the wrong person. None of it is visible below the CLI: the
 * staleness and hash helpers above were correct throughout. So each case
 * asserts BOTH the exit code and what landed in the YAML, because "exit 0 and
 * the same output as the reporting form" is exactly what a silent no-op looks
 * like from the outside.
 */
describe('cairn review — flag surface (#17, #40)', () => {
  const CLI = path.resolve(__dirname, '../../dist/cli/index.js');
  const UPDATE_ID = 'aaaaaaaa-0000-4000-8000-000000000001';
  let tmpDir: string;
  let store: string;
  let libFile: string;

  /** A store whose only decision carries one unreviewed update. */
  function createStore(opts: { withUser?: boolean } = {}): void {
    store = path.join(tmpDir, 'store');
    fs.mkdirSync(path.join(store, 'library'), { recursive: true });
    libFile = path.join(store, 'library', 'main.yaml');
    fs.writeFileSync(
      libFile,
      `meta:
  name: main
  scope: project
  registry:
    enabled: false
goals:
  - id: G1
    name: A goal
    statement: Something to achieve.
values:
  - id: V1
    name: A value
    statement: Something we care about.
decisions:
  - id: D1
    name: A decision
    rationale: Because.
    maps_to: [G1, V1]
    updated_by:
      - id: ${UPDATE_ID}
        date: '2026-01-01T00:00:00Z'
        rationale: Reworded.
`,
    );
    fs.writeFileSync(
      path.join(store, 'config.yaml'),
      opts.withUser === false
        ? 'suppress_diagnostics: []\n'
        : 'user:\n  name: "Config Owner"\n  email: "owner@example.com"\n',
    );
  }

  function runCairn(...args: string[]): { stdout: string; stderr: string; exitCode: number } {
    const r = spawnSync('node', [CLI, '--store', store, '--no-registry', ...args], {
      cwd: tmpDir,
      // Hermetic identity. These tests assert WHO a review is attributed to,
      // so every config layer outside the store is switched off — otherwise
      // the machine's own `user:` supplies an identity and the
      // no-identity-configured case silently passes for the wrong reason.
      env: {
        ...process.env,
        HOME: tmpDir,
        USERPROFILE: tmpDir,
        GVP_CONFIG_SYSTEM: '',
        GVP_CONFIG_GLOBAL: '',
        GVP_CONFIG_LOCAL: '',
        GVP_REGISTRY_ROOT: path.join(tmpDir, '.registry'),
      },
      encoding: 'utf-8',
      timeout: 15000,
    });
    return { stdout: r.stdout ?? '', stderr: r.stderr ?? '', exitCode: r.status ?? 1 };
  }

  /** The `reviewed_by` entries actually written to disk for D1. */
  function reviewsOnDisk(): Array<Record<string, unknown>> {
    const data = yaml.load(fs.readFileSync(libFile, 'utf-8')) as {
      decisions: Array<{ id: string; reviewed_by?: Array<Record<string, unknown>> }>;
    };
    return data.decisions.find((d) => d.id === 'D1')!.reviewed_by ?? [];
  }

  /** The token the reporting form prints, which `--approve` demands. */
  function token(): string {
    const r = runCairn('review', 'D1');
    expect(r.exitCode).toBe(0);
    const m = /--token ([0-9a-f]+)/.exec(r.stderr);
    expect(m, `no token in:\n${r.stderr}`).not.toBeNull();
    return m![1]!;
  }

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cairn-review-'));
    createStore();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // --- #17: --help and the command's own instruction must agree -----------

  it('lists --approve in --help, in the form the command prints', () => {
    const r = spawnSync('node', [CLI, 'review', '--help'], { cwd: tmpDir, encoding: 'utf-8' });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('--approve');
    // The closing instruction names --approve; --help must too, or the two
    // disagree and only one of them is reachable from `--help`.
    expect(runCairn('review', 'D1').stderr).toContain('--approve --token');
  });

  // --- the reporting form still reports, and still writes nothing ---------

  it('reports unreviewed updates without recording anything', () => {
    const r = runCairn('review', 'D1');
    expect(r.exitCode).toBe(0);
    expect(r.stderr).toContain(UPDATE_ID);
    expect(reviewsOnDisk()).toEqual([]);
  });

  // --- #40.2: stamping flags without --approve are refused, not ignored ---

  it('refuses --token without --approve instead of silently recording nothing', () => {
    const r = runCairn('review', 'D1', '--token', token());
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain('--token');
    expect(r.stderr).toContain('nothing would be recorded');
    expect(reviewsOnDisk()).toEqual([]);
  });

  it('refuses --note without --approve', () => {
    const r = runCairn('review', 'D1', '--note', 'looks fine');
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain('--note');
    expect(reviewsOnDisk()).toEqual([]);
  });

  it('refuses --by without --approve', () => {
    const r = runCairn('review', 'D1', '--by', 'Ada Lovelace <ada@example.com>');
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain('--by');
    expect(reviewsOnDisk()).toEqual([]);
  });

  it('names every stamping flag that was given', () => {
    const r = runCairn('review', 'D1', '--token', token(), '--note', 'x', '--by', 'A <a@b.com>');
    expect(r.exitCode).toBe(1);
    for (const flag of ['--token', '--note', '--by']) expect(r.stderr).toContain(flag);
  });

  it('refuses --approve with no element rather than listing stale elements and exiting 0', () => {
    const r = runCairn('review', '--approve', '--token', token());
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain('--approve needs the element');
    expect(reviewsOnDisk()).toEqual([]);
  });

  it('still refuses --approve without --token', () => {
    const r = runCairn('review', 'D1', '--approve');
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain('--approve requires --token');
    expect(reviewsOnDisk()).toEqual([]);
  });

  it('still refuses a token that does not match the pending updates', () => {
    const r = runCairn('review', 'D1', '--approve', '--token', 'deadbeefdeadbeef');
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain('Invalid review token');
    expect(reviewsOnDisk()).toEqual([]);
  });

  // --- the form that works --------------------------------------------------

  it('records the review, attributed to the configured user by default', () => {
    const r = runCairn('review', 'D1', '--approve', '--token', token(), '--note', 'Still correct');
    expect(r.exitCode).toBe(0);
    const reviews = reviewsOnDisk();
    expect(reviews).toHaveLength(1);
    expect(reviews[0]!.by).toEqual({ name: 'Config Owner', email: 'owner@example.com' });
    expect(reviews[0]!.updates_reviewed).toEqual([UPDATE_ID]);
    expect(reviews[0]!.note).toBe('Still correct');
    // And the element is no longer stale.
    expect(runCairn('review').stderr).toContain('No stale elements');
  });

  // --- #40.1: --by must set the reviewer, or be refused --------------------

  it('records --by as the reviewer instead of the configured user', () => {
    const r = runCairn(
      'review',
      'D1',
      '--approve',
      '--token',
      token(),
      '--by',
      'Claude (agent) <noreply@anthropic.com>',
    );
    expect(r.exitCode).toBe(0);
    // The defect this replaces: the flag was declared, never read, and the
    // review was filed under the config owner — the person who DELEGATED it.
    expect(reviewsOnDisk()[0]!.by).toEqual({
      name: 'Claude (agent)',
      email: 'noreply@anthropic.com',
    });
  });

  it('refuses a bare name, which cannot be a provenance identity', () => {
    const r = runCairn('review', 'D1', '--approve', '--token', token(), '--by', 'Claude (agent)');
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain('Name <email>');
    expect(reviewsOnDisk()).toEqual([]);
  });

  it('refuses an identity whose email is not an email', () => {
    const r = runCairn('review', 'D1', '--approve', '--token', token(), '--by', 'Claude <nope>');
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain('not a valid email address');
    expect(reviewsOnDisk()).toEqual([]);
  });

  it('accepts --by when no identity is configured at all', () => {
    createStore({ withUser: false });
    // Without --by this would be the "GVP user identity not configured" exit.
    expect(runCairn('review', 'D1', '--approve', '--token', token()).exitCode).toBe(1);
    const r = runCairn('review', 'D1', '--approve', '--token', token(), '--by', 'A B <ab@example.com>');
    expect(r.exitCode).toBe(0);
    expect(reviewsOnDisk()[0]!.by).toEqual({ name: 'A B', email: 'ab@example.com' });
  });
});
