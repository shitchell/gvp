import { describe, it, expect, afterEach } from 'vitest';
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as yaml from 'js-yaml';

describe('gvp add (CMD-4)', () => {
  describe('nextId generation', () => {
    function nextId(prefix: string, existingIds: string[]): string {
      const maxNum = existingIds.reduce((max, id) => {
        const num = parseInt(id.replace(prefix, ''), 10);
        return isNaN(num) ? max : Math.max(max, num);
      }, 0);
      return `${prefix}${maxNum + 1}`;
    }

    it('generates correct sequential ID from contiguous set', () => {
      expect(nextId('G', ['G1', 'G2', 'G3'])).toBe('G4');
    });

    it('skips gaps and uses max+1 (DEC-9.5)', () => {
      // Gap at 3,4 — should still produce G6, not fill gaps
      expect(nextId('G', ['G1', 'G2', 'G5'])).toBe('G6');
    });

    it('handles empty list', () => {
      expect(nextId('V', [])).toBe('V1');
    });

    it('ignores non-numeric IDs', () => {
      expect(nextId('D', ['D1', 'Dfoo', 'D3'])).toBe('D4');
    });

    it('works with multi-char prefix', () => {
      expect(nextId('DEC-', ['DEC-1', 'DEC-2'])).toBe('DEC-3');
    });
  });

  describe('field parsing', () => {
    function parseField(entry: string): { key: string; value: unknown } | null {
      const eqIdx = entry.indexOf('=');
      if (eqIdx <= 0) return null;
      const key = entry.substring(0, eqIdx);
      const rawValue = entry.substring(eqIdx + 1);
      let value: unknown;
      try { value = JSON.parse(rawValue); } catch { value = rawValue; }
      return { key, value };
    }

    it('parses simple string field', () => {
      expect(parseField('description=A cool goal')).toEqual({
        key: 'description',
        value: 'A cool goal',
      });
    });

    it('parses JSON array field', () => {
      expect(parseField('tags=["alpha","beta"]')).toEqual({
        key: 'tags',
        value: ['alpha', 'beta'],
      });
    });

    it('parses numeric field', () => {
      expect(parseField('priority=3')).toEqual({
        key: 'priority',
        value: 3,
      });
    });

    it('handles value with equals sign', () => {
      expect(parseField('description=x=y')).toEqual({
        key: 'description',
        value: 'x=y',
      });
    });

    it('rejects entry with no key', () => {
      expect(parseField('=value')).toBeNull();
    });
  });

  // === DEC-9.5: Per-document per-category ID scoping (ticket 019) ===

  describe('per-document ID scoping (DEC-9.5, CLI)', () => {
    let tmpDir: string;

    afterEach(() => {
      if (tmpDir) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

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

    // 22. Multi-doc: cairn add assigns per-doc ID
    it('assigns per-document ID when adding to doc with lower max', () => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cairn-add-'));
      fs.mkdirSync(path.join(tmpDir, '.gvp', 'library'), { recursive: true });

      // main.yaml has G1-G3
      fs.writeFileSync(
        path.join(tmpDir, '.gvp', 'library', 'main.yaml'),
        `
meta:
  name: main
  scope: project

goals:
  - id: G1
    name: Goal one
    statement: Existing.
    tags: []
    maps_to: []
  - id: G2
    name: Goal two
    statement: Existing.
    tags: []
    maps_to: []
  - id: G3
    name: Goal three
    statement: Existing.
    tags: []
    maps_to: []
`,
      );

      // other.yaml has G10-G14
      fs.writeFileSync(
        path.join(tmpDir, '.gvp', 'library', 'other.yaml'),
        `
meta:
  name: other
  scope: project

goals:
  - id: G10
    name: Goal ten
    statement: Existing.
    tags: []
    maps_to: []
  - id: G11
    name: Goal eleven
    statement: Existing.
    tags: []
    maps_to: []
  - id: G12
    name: Goal twelve
    statement: Existing.
    tags: []
    maps_to: []
  - id: G13
    name: Goal thirteen
    statement: Existing.
    tags: []
    maps_to: []
  - id: G14
    name: Goal fourteen
    statement: Existing.
    tags: []
    maps_to: []
`,
      );

      // Config with user identity
      fs.writeFileSync(
        path.join(tmpDir, '.gvp', 'config.yaml'),
        `
user:
  name: "Test User"
  email: "test@example.com"
`,
      );

      const result = runCairn('add', 'goal', 'New goal', '--document', 'main');
      expect(result.exitCode).toBe(0);
      // stdout should be G4, not G15
      expect(result.stdout.trim()).toBe('G4');
    });
  });
});
