import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('R6 source-grep: no hard-coded field/category names in generic code', () => {
  function stripComments(src: string): string {
    return src
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
  }

  it('structural-pass.ts has no hard-coded field or category names', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '../../src/validation/passes/structural-pass.ts'),
      'utf-8',
    );
    const code = stripComments(src);
    expect(code).not.toMatch(/['"]steps['"]/);
    expect(code).not.toMatch(/['"]related['"]/);
    expect(code).not.toMatch(/['"]procedure['"]/);
    expect(code).not.toMatch(/categoryName\s*===\s*['"]/);
  });

  it('semantic-pass.ts has no hard-coded field or category names', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '../../src/validation/passes/semantic-pass.ts'),
      'utf-8',
    );
    const code = stripComments(src);
    expect(code).not.toMatch(/['"]steps['"]/);
    expect(code).not.toMatch(/['"]related['"]/);
    expect(code).not.toMatch(/['"]procedure['"]/);
    expect(code).not.toMatch(/categoryName\s*===\s*['"]/);
  });

  it('document-parser.ts has no hard-coded field or category names', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '../../src/model/document-parser.ts'),
      'utf-8',
    );
    const code = stripComments(src);
    expect(code).not.toMatch(/['"]steps['"]/);
    expect(code).not.toMatch(/['"]related['"]/);
    expect(code).not.toMatch(/['"]procedure['"]/);
    expect(code).not.toMatch(/categoryName\s*===\s*['"]/);
  });
});
