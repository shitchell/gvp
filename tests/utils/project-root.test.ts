import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { findProjectRoot } from '../../src/utils/project-root.js';
import type { Catalog } from '../../src/catalog/catalog.js';

/**
 * Regression: findProjectRoot must walk up from the ENTRY (leaf) document, not
 * documents[0]. With external/path inheritance, documents[0] is a deepest
 * inherited ancestor living outside the project (e.g. ~/.gvp/library), and
 * walking up from there mis-roots at $HOME (which contains a .gvp).
 */
describe('findProjectRoot (entry-document rooting)', () => {
  let tmpHome: string;
  let projRoot: string;
  let ancestorDocPath: string;
  let entryDocPath: string;

  beforeAll(() => {
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'gvp-root-'));
    // Inherited ancestor library lives directly under tmpHome (tmpHome has a .gvp)
    fs.mkdirSync(path.join(tmpHome, '.gvp', 'library'), { recursive: true });
    ancestorDocPath = path.join(tmpHome, '.gvp', 'library', 'personal.yaml');
    fs.writeFileSync(ancestorDocPath, 'meta:\n  name: personal\n');
    // Project lives under tmpHome/projects/proj (proj has its own .gvp)
    projRoot = path.join(tmpHome, 'projects', 'proj');
    fs.mkdirSync(path.join(projRoot, '.gvp', 'library'), { recursive: true });
    entryDocPath = path.join(projRoot, '.gvp', 'library', 'align.yaml');
    fs.writeFileSync(entryDocPath, 'meta:\n  name: align\n');
  });

  afterAll(() => {
    fs.rmSync(tmpHome, { recursive: true, force: true });
  });

  const mockCatalog = (filePaths: string[]): Catalog =>
    ({ documents: filePaths.map((filePath) => ({ filePath })) } as unknown as Catalog);

  it('roots at the project, not the inherited ancestor under $HOME', () => {
    // ancestors-first DFS order: inherited ancestor first, entry doc last
    const catalog = mockCatalog([ancestorDocPath, entryDocPath]);
    expect(findProjectRoot(catalog)).toBe(projRoot);
  });

  it('works for a single-document (no inheritance) catalog', () => {
    const catalog = mockCatalog([entryDocPath]);
    expect(findProjectRoot(catalog)).toBe(projRoot);
  });

  it('returns null for an empty catalog', () => {
    expect(findProjectRoot(mockCatalog([]))).toBeNull();
  });
});
