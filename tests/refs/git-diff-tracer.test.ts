import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'child_process';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { traceGitDiff, formatDiffTrace, type DiffTraceResult } from '../../src/refs/git-diff-tracer.js';
import { Catalog } from '../../src/catalog/catalog.js';
import { CategoryRegistry } from '../../src/model/category-registry.js';
import { loadDefaults } from '../../src/schema/defaults-loader.js';
import { parseDocument } from '../../src/model/document-parser.js';
import { resolveInheritance } from '../../src/inheritance/inheritance-resolver.js';

/**
 * Tests for the git diff tracer (DEC-10.2).
 *
 * These used to run against the LIVE repository -- `git log --oneline -20`,
 * `HEAD~1..HEAD`, and "find the commit whose subject mentions X". That made
 * runtime a function of the host repo's history (a 59-file merge at HEAD took
 * 27s and blew the 20s timeout, #20) and made the assertions non-deterministic:
 * three of the five tests silently `return`ed when the commit they hunted for
 * had scrolled off the last 20, so they asserted nothing at all.
 *
 * Everything now runs against a synthetic repository built in a tmpdir with
 * known content and a known commit sequence, so runtime is constant and each
 * assertion is specific. The only live-repo test left is HEAD..HEAD, which is
 * an empty diff by construction and therefore history-independent (#20).
 */

const WORKTREE_ROOT = path.resolve(__dirname, '../..');

// ---------------------------------------------------------------------------
// Fixture repository
// ---------------------------------------------------------------------------

const LIBRARY_YAML = `meta:
  name: tracer-fixture
  scope: project

goals:
  - id: G1
    name: Correct arithmetic
    statement: The calculator must produce correct results.
    maps_to: []

values:
  - id: V1
    name: Traceability
    statement: Every code change should trace back to a goal.
    maps_to: [tracer-fixture:G1]

decisions:
  - id: D1
    name: Hand-written arithmetic helpers
    rationale: Explicit named functions are traceable; a generic evaluator is not.
    maps_to: [tracer-fixture:G1, tracer-fixture:V1]
    refs:
      - file: src/calc.ts
        identifier: add
        role: implements
      - file: src/calc.ts
        identifier: subtract
        role: implements
      - file: src/calc.ts
        identifier: multiply
        role: implements
  - id: D2
    name: Document the rounding policy
    rationale: Rounding surprises are the most common arithmetic complaint.
    maps_to: [tracer-fixture:G1, tracer-fixture:V1]
    refs:
      - file: docs/notes.md
        identifier: Rounding policy
        role: defines
  - id: D3
    name: Keep a plain-text changelog
    rationale: A .txt file has no ref parser, so it exercises whole-file comparison.
    maps_to: [tracer-fixture:G1, tracer-fixture:V1]
    refs:
      - file: CHANGELOG.txt
        identifier: whole-file
        role: defines
`;

const CALC_BASE = `export function add(a: number, b: number): number {
  return a + b;
}

export function subtract(a: number, b: number): number {
  return a - b;
}
`;

// add() reworded, subtract() byte-identical.
const CALC_ADD_MODIFIED = `export function add(a: number, b: number): number {
  const total = a + b;
  return total;
}

export function subtract(a: number, b: number): number {
  return a - b;
}
`;

// subtract() gone, multiply() introduced, add() byte-identical.
const CALC_SUB_REMOVED_MUL_ADDED = `export function add(a: number, b: number): number {
  const total = a + b;
  return total;
}

export function multiply(a: number, b: number): number {
  return a * b;
}
`;

const NOTES_BASE = `# Calculator notes

## Rounding policy

Round half away from zero.

## Overflow policy

Values are IEEE-754 doubles.
`;

// Only the "Rounding policy" block changes; "Overflow policy" is untouched.
const NOTES_ROUNDING_MODIFIED = `# Calculator notes

## Rounding policy

Round half to even (banker's rounding).

## Overflow policy

Values are IEEE-754 doubles.
`;

interface Fixture {
  root: string;
  /** Commit SHAs in creation order: c[0] is the base commit. */
  commits: string[];
}

/** Named positions in the fixture's commit sequence, for readable tests. */
const BASE = 0;
const ADD_MODIFIED = 1;
const SUB_REMOVED_MUL_ADDED = 2;
const UNREFD_FILE_ONLY = 3;
const DOCS_AND_LIBRARY = 4;

let fixture: Fixture;

function buildFixtureRepo(): Fixture {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cairn-tracerfix-'));
  const run = (args: string[]) =>
    execFileSync('git', args, { cwd: root, stdio: 'pipe', encoding: 'utf-8' });

  // Identity via -c rather than three `git config` calls: every git invocation
  // is a process spawn, and this file's runtime is almost entirely spawn cost.
  const IDENTITY = [
    '-c', 'user.email=fixture@example.invalid',
    '-c', 'user.name=Tracer Fixture',
    '-c', 'commit.gpgsign=false',
  ];

  run(['init', '--quiet', '-b', 'main']);

  const write = (rel: string, content: string) => {
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  };

  let commitCount = 0;
  const commit = (message: string) => {
    // -f: a developer's global core.excludesFile must not decide what the
    // fixture contains.
    run(['add', '-A', '-f']);
    run([...IDENTITY, 'commit', '--quiet', '-m', message]);
    commitCount++;
  };

  // BASE
  write('README.md', '# Tracer fixture\n');
  write('src/calc.ts', CALC_BASE);
  write('docs/notes.md', NOTES_BASE);
  write('CHANGELOG.txt', '0.1.0 - initial release\n');
  write('.gvp/library/fixture.yaml', LIBRARY_YAML);
  commit('base');

  // ADD_MODIFIED: one ref'd identifier changes, its file-mate does not.
  write('src/calc.ts', CALC_ADD_MODIFIED);
  commit('rework add()');

  // SUB_REMOVED_MUL_ADDED: one ref'd identifier removed, another added.
  write('src/calc.ts', CALC_SUB_REMOVED_MUL_ADDED);
  commit('drop subtract(), add multiply()');

  // UNREFD_FILE_ONLY: a real change that no ref points at.
  write('README.md', '# Tracer fixture\n\nA synthetic repository.\n');
  commit('expand README');

  // DOCS_AND_LIBRARY: markdown heading block, a file with no parser, and the
  // library document itself. The library change is a trailing comment, so the
  // parsed catalog is identical at every commit.
  write('docs/notes.md', NOTES_ROUNDING_MODIFIED);
  write('CHANGELOG.txt', '0.2.0 - banker\'s rounding\n0.1.0 - initial release\n');
  write('.gvp/library/fixture.yaml', LIBRARY_YAML + '\n# reviewed\n');
  commit('switch to banker rounding');

  // One `rev-list` instead of a `rev-parse` per commit. --reverse so index 0
  // is the base commit.
  const commits = run(['rev-list', '--reverse', 'HEAD']).trim().split('\n');
  if (commits.length !== commitCount) {
    throw new Error(`fixture: expected ${commitCount} commits, got ${commits.length}`);
  }

  return { root, commits };
}

/** Build a Catalog from every YAML document in a library directory. */
function buildCatalog(libraryDir: string): Catalog {
  const defaults = loadDefaults();
  const registry = CategoryRegistry.fromDefaults(defaults);

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

  // Find the leaf document — the one nothing else inherits from.
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

let cachedCatalog: Catalog | undefined;

function fixtureCatalog(): Catalog {
  // A Catalog is immutable after construction and traceGitDiff only reads it,
  // so one instance is safe to share across tests.
  cachedCatalog ??= buildCatalog(path.join(fixture.root, '.gvp', 'library'));
  return cachedCatalog;
}

const traceCache = new Map<string, DiffTraceResult>();

/**
 * Trace between two named positions in the fixture's commit sequence.
 *
 * Memoized per commit pair: traceGitDiff shells out once per changed ref per
 * side, and process spawns dominate this file's runtime. The result is read
 * only, never mutated, so sharing it between tests is safe.
 */
function trace(from: number, to: number): DiffTraceResult {
  const key = `${from}..${to}`;
  let result = traceCache.get(key);
  if (!result) {
    result = traceGitDiff(
      fixtureCatalog(),
      fixture.commits[from]!,
      fixture.commits[to]!,
      fixture.root,
    );
    traceCache.set(key, result);
  }
  return result;
}

beforeAll(() => {
  fixture = buildFixtureRepo();
});

afterAll(() => {
  if (!fixture) return;
  try {
    // maxRetries mirrors tests/setup.ts: a bare rmSync races git's own
    // lingering writes and leaks the directory (#19).
    fs.rmSync(fixture.root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  } catch (e) {
    // Never swallow: a leaking teardown is exactly the failure worth seeing.
    process.stderr.write(
      `test teardown: failed to remove ${fixture.root}: ${(e as Error).message}\n`,
    );
  }
});

describe('Git Diff Tracer (DEC-10.2)', () => {
  it('builds a fixture repository with the expected commit sequence', () => {
    expect(fixture.commits).toHaveLength(5);
    expect(new Set(fixture.commits).size).toBe(5);
  });

  it('detects changed files between commits', () => {
    const result = trace(BASE, ADD_MODIFIED);
    expect(result.changedFiles).toEqual(['src/calc.ts']);
    expect(result.commitA).toBe(fixture.commits[BASE]);
    expect(result.commitB).toBe(fixture.commits[ADD_MODIFIED]);
  });

  it('traces a changed ref to the GVP element that declares it', () => {
    const result = trace(BASE, ADD_MODIFIED);

    // add() changed; subtract() lives in the same changed file but is
    // byte-identical, so identifier-level comparison must exclude it.
    expect(result.refChanges).toHaveLength(1);
    const change = result.refChanges[0]!;
    expect(change.ref.file).toBe('src/calc.ts');
    expect(change.ref.identifier).toBe('add');
    expect(change.ref.role).toBe('implements');
    expect(change.changeType).toBe('modified');
    expect(change.element.id).toBe('D1');
    expect(change.blockBefore).toContain('return a + b;');
    expect(change.blockAfter).toContain('const total = a + b;');
  });

  it('detects identifier-level additions and removals', () => {
    const result = trace(ADD_MODIFIED, SUB_REMOVED_MUL_ADDED);
    expect(result.changedFiles).toEqual(['src/calc.ts']);

    const byIdentifier = new Map(
      result.refChanges.map(c => [c.ref.identifier, c]),
    );
    // add() is untouched across this pair and must not be reported.
    expect([...byIdentifier.keys()].sort()).toEqual(['multiply', 'subtract']);

    expect(byIdentifier.get('subtract')!.changeType).toBe('removed');
    expect(byIdentifier.get('subtract')!.blockAfter).toBeNull();
    expect(byIdentifier.get('multiply')!.changeType).toBe('added');
    expect(byIdentifier.get('multiply')!.blockBefore).toBeNull();
    expect(byIdentifier.get('multiply')!.blockAfter).toContain('return a * b;');
  });

  it('traces markdown headings and falls back to whole-file comparison without a parser (DEC-10.15)', () => {
    const result = trace(UNREFD_FILE_ONLY, DOCS_AND_LIBRARY);

    // The library document itself is a changed file, but no ref points at it.
    expect(result.changedFiles.sort()).toEqual([
      '.gvp/library/fixture.yaml',
      'CHANGELOG.txt',
      'docs/notes.md',
    ]);

    const md = result.refChanges.find(c => c.ref.file === 'docs/notes.md')!;
    expect(md.element.id).toBe('D2');
    expect(md.changeType).toBe('modified');
    expect(md.blockBefore).toContain('Round half away from zero.');
    expect(md.blockAfter).toContain("banker's rounding");
    // Heading-block scoping: the untouched sibling section is not included.
    expect(md.blockAfter).not.toContain('IEEE-754');

    // CHANGELOG.txt has no parser, so the whole file is the block.
    const txt = result.refChanges.find(c => c.ref.file === 'CHANGELOG.txt')!;
    expect(txt.element.id).toBe('D3');
    expect(txt.changeType).toBe('modified');
    expect(txt.blockBefore).toBe('0.1.0 - initial release\n');
    expect(txt.blockAfter).toContain('0.2.0');

    expect(result.refChanges).toHaveLength(2);
  });

  it('formats trace output', () => {
    const output = formatDiffTrace(trace(BASE, ADD_MODIFIED), fixtureCatalog());

    expect(output).toContain('Git diff:');
    expect(output).toContain(
      `Git diff: ${fixture.commits[BASE]!.substring(0, 7)}..${fixture.commits[ADD_MODIFIED]!.substring(0, 7)}`,
    );
    expect(output).toContain('Changed files: 1');
    expect(output).toContain('Traced changes: 1');
    expect(output).toContain('[~] src/calc.ts::add');
    expect(output).toContain('Role: implements');
    expect(output).toContain('Element: ');
    expect(output).toContain('D1');
    // Ancestors are walked through maps_to up to the goal and the value.
    expect(output).toContain('Traces to:');
    expect(output).toContain('G1');
    expect(output).toContain('V1');
  });

  it('marks added and removed refs with + and - in the output', () => {
    const output = formatDiffTrace(
      trace(ADD_MODIFIED, SUB_REMOVED_MUL_ADDED),
      fixtureCatalog(),
    );
    expect(output).toContain('[+] src/calc.ts::multiply');
    expect(output).toContain('[-] src/calc.ts::subtract');
  });

  it('handles a commit range with no ref-related changes', () => {
    const result = trace(SUB_REMOVED_MUL_ADDED, UNREFD_FILE_ONLY);
    expect(result.changedFiles).toEqual(['README.md']);
    expect(result.refChanges).toEqual([]);
    expect(formatDiffTrace(result, fixtureCatalog()))
      .toContain('No GVP-traced changes detected.');
  });

  it('returns an empty result for an unresolvable commit range', () => {
    const catalog = fixtureCatalog();
    const result = traceGitDiff(catalog, 'nope-a', 'nope-b', fixture.root);
    expect(result.changedFiles).toEqual([]);
    expect(result.refChanges).toEqual([]);
  });

  it('runs against this repository and its real library for an empty range', () => {
    // The one live-repo test. HEAD..HEAD is an empty diff whatever HEAD is, so
    // this stays constant-time no matter how large the last commit was (#20),
    // while still proving the tracer works against the real library shape.
    const catalog = buildCatalog(path.join(WORKTREE_ROOT, '.gvp', 'library'));
    const result = traceGitDiff(catalog, 'HEAD', 'HEAD', WORKTREE_ROOT);
    expect(result.changedFiles).toEqual([]);
    expect(result.refChanges).toEqual([]);
    expect(formatDiffTrace(result, catalog)).toContain('Changed files: 0');
  });
});
