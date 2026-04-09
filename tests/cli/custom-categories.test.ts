import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { buildCatalog } from '../../src/cli/helpers.js';
import { configSchema } from '../../src/config/schema.js';
import {
  runValidation,
  builtinPasses,
} from '../../src/validation/index.js';
import type { ValidationPass } from '../../src/validation/index.js';

/**
 * Tests for custom category support in buildCatalog's two-pass parsing.
 *
 * Covers:
 *   - Custom category elements are loaded via the two-pass registry
 *   - Child documents use categories defined only in a parent
 *   - Unrecognized YAML keys produce W016
 *   - Built-in-only libraries work unchanged (no regression)
 *   - Custom categories with field_schemas validate elements correctly
 *
 * Fixture pattern follows tests/cli/procedure.test.ts — a tempdir
 * with a .gvp/library/ containing the documents under test, built via
 * buildCatalog() from the real CLI entry point.
 */
describe('custom categories (two-pass parsing)', () => {
  let tmpDir: string;
  const defaultConfig = configSchema.parse({});
  const allPasses = new Map<string, ValidationPass>([...builtinPasses]);
  const passNames = [...builtinPasses.keys()];

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cairn-custom-cat-'));
    fs.mkdirSync(path.join(tmpDir, '.gvp', 'library'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeLib(relPath: string, content: string): void {
    const full = path.join(tmpDir, '.gvp', 'library', relPath);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }

  it('loads elements from a custom category defined in meta.definitions.categories', () => {
    writeLib('main.yaml', `
meta:
  name: main
  scope: project
  definitions:
    categories:
      observation:
        yaml_key: observations
        id_prefix: OBS
        is_root: true
        primary_field: statement

goals:
  - id: G1
    name: Smoke goal
    statement: smoke
    tags: []
    maps_to: []

observations:
  - id: OBS1
    name: First observation
    statement: Something we noticed.
    tags: []
    maps_to: []
`);
    const catalog = buildCatalog(defaultConfig, tmpDir);
    const obs = catalog.getAllElements().filter(e => e.categoryName === 'observation');
    expect(obs).toHaveLength(1);
    expect(obs[0]!.id).toBe('OBS1');
    expect(obs[0]!.name).toBe('First observation');
    expect(obs[0]!.get('statement')).toBe('Something we noticed.');
  });

  it('child document uses custom category defined only in parent', () => {
    writeLib('parent.yaml', `
meta:
  name: parent
  scope: project
  definitions:
    categories:
      observation:
        yaml_key: observations
        id_prefix: OBS
        is_root: true
        primary_field: statement

goals:
  - id: G1
    name: Goal
    statement: goal
    tags: []
    maps_to: []

values:
  - id: V1
    name: Value
    statement: value
    tags: []
    maps_to: [parent:G1]
`);

    writeLib('child.yaml', `
meta:
  name: child
  scope: project
  inherits: [parent]

observations:
  - id: OBS1
    name: Child observation
    statement: Defined only in child, category from parent.
    tags: []
    maps_to: [parent:G1]
`);
    const catalog = buildCatalog(defaultConfig, tmpDir);
    const obs = catalog.getAllElements().filter(e => e.categoryName === 'observation');
    expect(obs).toHaveLength(1);
    expect(obs[0]!.id).toBe('OBS1');
  });

  it('emits W016 for unrecognized top-level YAML keys', () => {
    writeLib('main.yaml', `
meta:
  name: main
  scope: project

goals:
  - id: G1
    name: Goal
    statement: goal
    tags: []
    maps_to: []

bogus_section:
  - id: X1
    name: This is not a category
`);
    const catalog = buildCatalog(defaultConfig, tmpDir);
    const diagnostics = runValidation(catalog, defaultConfig, allPasses, passNames);
    const w016 = diagnostics.filter(d => d.code === 'W016');
    expect(w016).toHaveLength(1);
    expect(w016[0]!.description).toContain('bogus_section');
  });

  it('built-in-only libraries parse normally (no regression)', () => {
    writeLib('main.yaml', `
meta:
  name: main
  scope: project

goals:
  - id: G1
    name: Goal
    statement: goal
    tags: []
    maps_to: []

values:
  - id: V1
    name: Value
    statement: value
    tags: []
    maps_to: [main:G1]
`);
    const catalog = buildCatalog(defaultConfig, tmpDir);
    expect(catalog.getAllElements()).toHaveLength(2);
    const diagnostics = runValidation(catalog, defaultConfig, allPasses, passNames);
    const w016 = diagnostics.filter(d => d.code === 'W016');
    expect(w016).toHaveLength(0);
  });

  it('custom category with field_schemas validates elements correctly', () => {
    writeLib('main.yaml', `
meta:
  name: main
  scope: project
  definitions:
    categories:
      observation:
        yaml_key: observations
        id_prefix: OBS
        is_root: true
        primary_field: statement
        field_schemas:
          severity:
            type: enum
            values: ["low", "medium", "high"]
            required: false

goals:
  - id: G1
    name: Goal
    statement: goal
    tags: []
    maps_to: []

observations:
  - id: OBS1
    name: Severity observation
    statement: Something important.
    severity: high
    tags: []
    maps_to: []
`);
    const catalog = buildCatalog(defaultConfig, tmpDir);
    const obs = catalog.getAllElements().filter(e => e.categoryName === 'observation');
    expect(obs).toHaveLength(1);
    expect(obs[0]!.get('severity')).toBe('high');
  });
});
