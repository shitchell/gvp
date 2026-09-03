import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { writeFileAtomic } from '../../src/registry/atomic.js';

describe('writeFileAtomic', () => {
  let dir: string;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atomic-')); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  it('writes content to the target path', () => {
    const target = path.join(dir, 'a.yml');
    writeFileAtomic(target, 'hello');
    expect(fs.readFileSync(target, 'utf-8')).toBe('hello');
  });

  it('replaces existing content', () => {
    const target = path.join(dir, 'a.yml');
    fs.writeFileSync(target, 'old');
    writeFileAtomic(target, 'new');
    expect(fs.readFileSync(target, 'utf-8')).toBe('new');
  });

  it('leaves no temp files behind on success', () => {
    writeFileAtomic(path.join(dir, 'a.yml'), 'x');
    expect(fs.readdirSync(dir)).toEqual(['a.yml']);
  });

  it('creates the parent directory when missing', () => {
    const target = path.join(dir, 'nested', 'a.yml');
    writeFileAtomic(target, 'x');
    expect(fs.readFileSync(target, 'utf-8')).toBe('x');
  });

  it('cleans up the temp file when rename fails', () => {
    // target is a directory -> rename fails
    const target = path.join(dir, 'adir');
    fs.mkdirSync(target);
    expect(() => writeFileAtomic(target, 'x')).toThrow();
    const leftovers = fs.readdirSync(dir).filter((f) => f !== 'adir');
    expect(leftovers).toEqual([]);
  });
});
