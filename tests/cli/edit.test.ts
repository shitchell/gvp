import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as yaml from 'js-yaml';

describe('cairn edit --field-file', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cairn-edit-'));
    fs.mkdirSync(path.join(tmpDir, '.gvp', 'library'), { recursive: true });

    // Write minimal library with a goal to edit
    fs.writeFileSync(
      path.join(tmpDir, '.gvp', 'library', 'root.yaml'),
      `
meta:
  name: root
  scope: project

goals:
  - id: G1
    name: Ship software
    statement: Original statement.
    tags: []
    maps_to: []
`,
    );

    // Write a .gvp/config.yaml with user identity (required by edit's provenance)
    fs.writeFileSync(
      path.join(tmpDir, '.gvp', 'config.yaml'),
      `
user:
  name: "Test User"
  email: "test@example.com"
`,
    );
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  /** Run cairn CLI as a subprocess, return { stdout, stderr, exitCode }. */
  function runCairn(...args: string[]): { stdout: string; stderr: string; exitCode: number } {
    const cliPath = path.resolve(__dirname, '../../dist/cli/index.js');
    const result = spawnSync('node', [cliPath, ...args], {
      cwd: tmpDir,
      encoding: 'utf-8',
      timeout: 15000,
    });
    return {
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? '',
      exitCode: result.status ?? 1,
    };
  }

  it('sets a field from file contents', () => {
    const contentFile = path.join(tmpDir, 'new-statement.txt');
    fs.writeFileSync(contentFile, 'Statement loaded from file.');

    const result = runCairn(
      'edit', 'G1',
      '--field-file', 'statement', contentFile,
      '--skip-review',
    );
    // The edit command writes status to stderr
    expect(result.stderr).toContain('Updated');

    // Read the YAML back and verify the field was set
    const raw = yaml.load(
      fs.readFileSync(path.join(tmpDir, '.gvp', 'library', 'root.yaml'), 'utf-8'),
    ) as Record<string, unknown>;
    const goals = raw.goals as Array<Record<string, unknown>>;
    expect(goals[0]!.statement).toBe('Statement loaded from file.');
  });

  it('--field-file wins over --field for the same key', () => {
    const contentFile = path.join(tmpDir, 'file-wins.txt');
    fs.writeFileSync(contentFile, 'From file.');

    runCairn(
      'edit', 'G1',
      '--field', 'statement=From flag.',
      '--field-file', 'statement', contentFile,
      '--skip-review',
    );

    const raw = yaml.load(
      fs.readFileSync(path.join(tmpDir, '.gvp', 'library', 'root.yaml'), 'utf-8'),
    ) as Record<string, unknown>;
    const goals = raw.goals as Array<Record<string, unknown>>;
    expect(goals[0]!.statement).toBe('From file.');
  });

  it('errors when the file does not exist', () => {
    const result = runCairn(
      'edit', 'G1',
      '--field-file', 'statement', '/tmp/nonexistent-cairn-test-file.txt',
      '--skip-review',
    );
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain('file not found');
  });

  it('works without --field when --field-file is provided', () => {
    const contentFile = path.join(tmpDir, 'only-field-file.txt');
    fs.writeFileSync(contentFile, 'Only from file.');

    const result = runCairn(
      'edit', 'G1',
      '--field-file', 'statement', contentFile,
      '--skip-review',
    );
    expect(result.stderr).toContain('Updated');
  });
});
