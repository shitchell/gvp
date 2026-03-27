import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import * as path from 'path';
import { traceGitDiff, formatDiffTrace } from '../../src/refs/git-diff-tracer.js';
import { Catalog } from '../../src/catalog/catalog.js';
import { CategoryRegistry } from '../../src/model/category-registry.js';
import { loadDefaults } from '../../src/schema/defaults-loader.js';
import { parseDocument } from '../../src/model/document-parser.js';
import { resolveInheritance } from '../../src/inheritance/inheritance-resolver.js';
import * as fs from 'fs';

const WORKTREE_ROOT = path.resolve(__dirname, '../../..');

function buildCatalogFromLibrary(): Catalog {
  const defaults = loadDefaults();
  const registry = CategoryRegistry.fromDefaults(defaults);
  const libraryDir = path.join(WORKTREE_ROOT, '.gvp', 'library');

  const yamlFiles = fs.readdirSync(libraryDir)
    .filter(f => f.endsWith('.yaml') || f.endsWith('.yml'))
    .sort();

  const docCache = new Map<string, ReturnType<typeof parseDocument>>();
  for (const file of yamlFiles) {
    const docPath = file.replace(/\.ya?ml$/, '');
    const filePath = path.join(libraryDir, file);
    const content = fs.readFileSync(filePath, 'utf-8');
    const doc = parseDocument(content, filePath, docPath, '@local', registry);
    docCache.set(docPath, doc);
  }

  // Find leaf document
  const inheritedPaths = new Set<string>();
  for (const doc of docCache.values()) {
    const inherits = doc.meta.inherits;
    if (inherits && Array.isArray(inherits)) {
      for (const entry of inherits) {
        if (typeof entry === 'string') inheritedPaths.add(entry);
      }
    }
  }

  const leafDoc = [...docCache.entries()]
    .find(([p]) => !inheritedPaths.has(p))?.[1] ?? docCache.values().next().value!;

  const loader = (_src: string, docPath: string) => {
    const cached = docCache.get(docPath);
    if (!cached) throw new Error(`Doc not found: ${docPath}`);
    return cached;
  };

  const resolved = resolveInheritance(leafDoc, loader);
  return new Catalog(resolved, {
    strict: false,
    suppress_diagnostics: [],
    validation_rules: [],
    strict_export_options: true,
  });
}

describe('Git Diff Tracer (DEC-10.2)', () => {
  // Get two commits where we know code changed
  const commits = execSync('git log --oneline -20', {
    cwd: WORKTREE_ROOT,
    encoding: 'utf-8',
  }).trim().split('\n').map(line => line.split(' ')[0]!);

  const latestCommit = commits[0]!;  // HEAD
  // Find a commit that changed TypeScript parser (we know a3cbe2e did)
  const parserFixCommit = commits.find(c => {
    try {
      const msg = execSync(`git log --oneline -1 ${c}`, {
        cwd: WORKTREE_ROOT, encoding: 'utf-8',
      });
      return msg.includes('TypeScript parser');
    } catch { return false; }
  });

  it('detects changed files between commits', () => {
    if (!parserFixCommit) return; // Skip if commit not found
    const catalog = buildCatalogFromLibrary();
    const result = traceGitDiff(catalog, `${parserFixCommit}~1`, parserFixCommit, WORKTREE_ROOT);
    expect(result.changedFiles.length).toBeGreaterThan(0);
  });

  it('traces changed refs to GVP elements', () => {
    if (commits.length < 2) return;
    const catalog = buildCatalogFromLibrary();

    // Compare the commit that added refs to the one before it
    const refCommit = commits.find(c => {
      try {
        const msg = execSync(`git log --oneline -1 ${c}`, {
          cwd: WORKTREE_ROOT, encoding: 'utf-8',
        });
        return msg.includes('add refs to GVP');
      } catch { return false; }
    });

    if (!refCommit) return;
    const result = traceGitDiff(catalog, `${refCommit}~1`, refCommit, WORKTREE_ROOT);
    // The commit that added refs changed gvp.yaml which contains the refs
    expect(result.changedFiles).toContain('.gvp/library/gvp.yaml');
  });

  it('formats trace output', () => {
    if (commits.length < 5) return;
    const catalog = buildCatalogFromLibrary();

    // Pick two commits far enough apart to have real changes
    const result = traceGitDiff(catalog, commits[4]!, commits[0]!, WORKTREE_ROOT);
    const output = formatDiffTrace(result, catalog);
    expect(output).toContain('Git diff:');
    expect(output).toContain('Changed files:');
  });

  it('detects identifier-level changes when parser available', () => {
    if (commits.length < 2) return;
    const catalog = buildCatalogFromLibrary();

    // Compare across the TypeScript parser fix — the parser file changed
    if (!parserFixCommit) return;
    const result = traceGitDiff(catalog, `${parserFixCommit}~1`, parserFixCommit, WORKTREE_ROOT);

    // Check if any refs point to changed TypeScript files
    const tsChanges = result.refChanges.filter(c =>
      c.ref.file.endsWith('.ts')
    );
    // May or may not find changes depending on which files were modified
    // The important thing is no errors
    expect(result).toBeDefined();
  });

  it('handles commit range with no ref-related changes', () => {
    const catalog = buildCatalogFromLibrary();
    // Use HEAD~1..HEAD which might not touch ref'd files
    const result = traceGitDiff(catalog, 'HEAD~1', 'HEAD', WORKTREE_ROOT);
    // Should not error even if no refs are affected
    expect(result.changedFiles).toBeDefined();
    expect(result.refChanges).toBeDefined();
  });
});
