import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  resolveInheritance,
  type DocumentLoader,
  type SourceLoader,
} from '../../src/inheritance/inheritance-resolver.js';
import { parseDocument } from '../../src/model/document-parser.js';
import { CategoryRegistry } from '../../src/model/category-registry.js';
import { loadDefaults } from '../../src/schema/defaults-loader.js';
import { createSourceResolver } from '../../src/inheritance/source-resolver.js';
import { InheritanceError } from '../../src/errors.js';

const registry = CategoryRegistry.fromDefaults(loadDefaults());

/**
 * These tests cover object-form `inherits` that names an EXTERNAL source
 * library by local filesystem path (the `align` -> `~/.gvp` use case).
 */
describe('external-source inheritance (object-form, local path)', () => {
  const projectYaml = `
meta:
  name: project
  inherits:
    - source: SOURCE_PLACEHOLDER
      as: personal

decisions:
  - id: D1
    name: Use the personal library
    rationale: Reuse cross-project values.
    tags: []
    maps_to: [personal:V2, code/common:CP7]
`;

  // A personal-style source library: top-level personal.yaml + nested code/common.yaml
  const personalYaml = `
meta:
  name: personal

values:
  - id: V1
    name: Simplicity
    statement: Keep it simple.
    tags: []
    maps_to: []
  - id: V2
    name: Transparency
    statement: Be honest about trade-offs.
    tags: []
    maps_to: []
`;

  const codeCommonYaml = `
meta:
  name: code-common

principles:
  - id: CP7
    name: Fail loudly
    statement: Errors should be visible.
    tags: []
    maps_to: [personal:V2]
`;

  function makeSourceLib(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cairn-src-'));
    const lib = path.join(dir, '.gvp', 'library');
    fs.mkdirSync(path.join(lib, 'code'), { recursive: true });
    fs.writeFileSync(path.join(lib, 'personal.yaml'), personalYaml);
    fs.writeFileSync(path.join(lib, 'code', 'common.yaml'), codeCommonYaml);
    return dir;
  }

  /** Build a sourceLoader that loads every doc from a resolved source library. */
  function makeSourceLoader(libraryDir: string): SourceLoader {
    const resolver = createSourceResolver(libraryDir);
    return (source: string): ReturnType<typeof parseDocument>[] => {
      const resolved = resolver.resolve(source);
      const docs: ReturnType<typeof parseDocument>[] = [];
      const walk = (dir: string): void => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) walk(full);
          else if (/\.ya?ml$/.test(entry.name)) {
            const docPath = path.relative(resolved, full).replace(/\.ya?ml$/, '');
            const content = fs.readFileSync(full, 'utf-8');
            docs.push(parseDocument(content, full, docPath, source, registry));
          }
        }
      };
      walk(resolved);
      return docs;
    };
  }

  const failLoader: DocumentLoader = (_s, p) => {
    throw new Error(`Unexpected local load of '${p}'`);
  };

  it('loads ALL documents from a local-path source and orders them before the entry doc', () => {
    const srcRoot = makeSourceLib();
    const source = srcRoot; // bare local path
    const projectDoc = parseDocument(
      projectYaml.replace('SOURCE_PLACEHOLDER', source),
      '/project.yaml',
      'project',
      '@local',
      registry,
    );

    const result = resolveInheritance(projectDoc, failLoader, makeSourceLoader(srcRoot));
    const paths = result.orderedDocuments.map((d) => d.documentPath);

    expect(paths).toContain('personal');
    expect(paths).toContain('code/common');
    // entry doc last
    expect(paths[paths.length - 1]).toBe('project');
  });

  it('cross-source refs resolve by document:element (personal:V2, code/common:CP7)', () => {
    const srcRoot = makeSourceLib();
    const projectDoc = parseDocument(
      projectYaml.replace('SOURCE_PLACEHOLDER', srcRoot),
      '/project.yaml',
      'project',
      '@local',
      registry,
    );

    const result = resolveInheritance(projectDoc, failLoader, makeSourceLoader(srcRoot));
    const byLibId = new Map(
      result.orderedDocuments.flatMap((d) => d.getAllElements()).map((e) => [e.toLibraryId(), e]),
    );

    expect(byLibId.get('personal:V2')?.name).toBe('Transparency');
    expect(byLibId.get('code/common:CP7')?.name).toBe('Fail loudly');
  });

  it('records the alias from the `as` field', () => {
    const srcRoot = makeSourceLib();
    const projectDoc = parseDocument(
      projectYaml.replace('SOURCE_PLACEHOLDER', srcRoot),
      '/project.yaml',
      'project',
      '@local',
      registry,
    );
    const result = resolveInheritance(projectDoc, failLoader, makeSourceLoader(srcRoot));
    expect(result.aliasMap.get('personal')).toBe(srcRoot);
  });

  it('errors when the source path cannot be resolved', () => {
    const projectDoc = parseDocument(
      projectYaml.replace('SOURCE_PLACEHOLDER', '/no/such/cairn/source/xyz'),
      '/project.yaml',
      'project',
      '@local',
      registry,
    );
    expect(() =>
      resolveInheritance(projectDoc, failLoader, makeSourceLoader('/no/such/cairn/source/xyz')),
    ).toThrow(InheritanceError);
  });

  it('without a sourceLoader, object-form is skipped (no crash, no source docs)', () => {
    const srcRoot = makeSourceLib();
    const projectDoc = parseDocument(
      projectYaml.replace('SOURCE_PLACEHOLDER', srcRoot),
      '/project.yaml',
      'project',
      '@local',
      registry,
    );
    const result = resolveInheritance(projectDoc, failLoader); // no sourceLoader
    expect(result.orderedDocuments.map((d) => d.documentPath)).toEqual(['project']);
  });
});
