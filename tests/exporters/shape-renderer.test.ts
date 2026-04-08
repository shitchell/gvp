import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { buildCatalog } from '../../src/cli/helpers.js';
import { configSchema } from '../../src/config/schema.js';
import { renderElementMarkdown } from '../../src/exporters/shape-renderer.js';

/**
 * C.1 tests for the shape-based renderer. These tests exercise the
 * new module in isolation — it is NOT yet wired into the markdown
 * exporter or inspect command (that happens in C.2 and C.3).
 *
 * The renderer is generic over category: no test should check a
 * category-specific behavior that couldn't be expressed in terms of
 * declared field shapes. Every test here describes a shape, not a
 * category.
 */
describe('shape-renderer', () => {
  let tmpDir: string;
  const defaultConfig = configSchema.parse({});

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cairn-shape-'));
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

  function writeRoot(): void {
    writeLib(
      'root.yaml',
      `
meta:
  name: demo
  scope: project
goals:
  - id: G1
    name: Ship software
    statement: Deliver software that works.
    tags: []
    maps_to: []
values:
  - id: V1
    name: Simplicity
    statement: Keep it simple.
    tags: [core]
    maps_to: [root:G1]
`,
    );
  }

  describe('header and primary field', () => {
    it('renders id, name, and primary field body', () => {
      writeRoot();
      const catalog = buildCatalog(defaultConfig, tmpDir);
      const g1 = catalog.getAllElements().find((e) => e.id === 'G1')!;
      const md = renderElementMarkdown(g1, catalog);
      expect(md).toContain('### G1: Ship software');
      expect(md).toContain('Deliver software that works.');
    });

    it('can suppress the heading via options', () => {
      writeRoot();
      const catalog = buildCatalog(defaultConfig, tmpDir);
      const g1 = catalog.getAllElements().find((e) => e.id === 'G1')!;
      const md = renderElementMarkdown(g1, catalog, { suppressHeading: true });
      expect(md).not.toContain('### G1: Ship software');
      expect(md).toContain('Deliver software that works.');
    });

    it('reads primary_field from the category registry, not a hard-coded name', () => {
      writeRoot();
      const catalog = buildCatalog(defaultConfig, tmpDir);
      // value's primary_field is `statement` per defaults.yaml, same
      // as goal — but the renderer should work for any category
      // whose primary_field is different. This test just confirms the
      // lookup path works via the registry.
      const v1 = catalog.getAllElements().find((e) => e.id === 'V1')!;
      const md = renderElementMarkdown(v1, catalog);
      expect(md).toContain('Keep it simple.');
    });
  });

  describe('reserved inline fields', () => {
    it('renders tags and maps_to', () => {
      writeRoot();
      const catalog = buildCatalog(defaultConfig, tmpDir);
      const v1 = catalog.getAllElements().find((e) => e.id === 'V1')!;
      const md = renderElementMarkdown(v1, catalog);
      expect(md).toContain('**Tags:** core');
      expect(md).toContain('**Maps to:** root:G1');
    });

    it('omits empty tags and empty maps_to', () => {
      writeRoot();
      const catalog = buildCatalog(defaultConfig, tmpDir);
      const g1 = catalog.getAllElements().find((e) => e.id === 'G1')!;
      const md = renderElementMarkdown(g1, catalog);
      expect(md).not.toContain('**Tags:**');
      expect(md).not.toContain('**Maps to:**');
    });

    it('renders status only when not active', () => {
      writeLib(
        'root.yaml',
        `
meta:
  name: demo
  scope: project
goals:
  - id: G1
    name: Active goal
    statement: Active.
    tags: []
    maps_to: []
  - id: G2
    name: Deprecated goal
    status: deprecated
    statement: Old.
    tags: []
    maps_to: []
`,
      );
      const catalog = buildCatalog(defaultConfig, tmpDir);
      const g1 = catalog.getAllElements().find((e) => e.id === 'G1')!;
      const g2 = catalog.getAllElements().find((e) => e.id === 'G2')!;
      expect(renderElementMarkdown(g1, catalog)).not.toContain('**Status:**');
      expect(renderElementMarkdown(g2, catalog)).toContain('**Status:** deprecated');
    });
  });

  describe('dict<model> shape (considered alternatives)', () => {
    it('renders decision.considered as a bulleted subsection without category-specific code', () => {
      writeRoot();
      writeLib(
        'decisions.yaml',
        `
meta:
  name: dec
  scope: project
decisions:
  - id: D1
    name: Use TypeScript
    rationale: Type safety matters.
    tags: []
    maps_to: [root:G1, root:V1]
    considered:
      plain_javascript:
        rationale: Faster but less safe
      rust_wasm:
        rationale: Too complex
`,
      );
      const catalog = buildCatalog(defaultConfig, tmpDir);
      const d1 = catalog.getAllElements().find((e) => e.id === 'D1')!;
      const md = renderElementMarkdown(d1, catalog);
      // The decision category's considered field has
      // display_name: "Considered alternatives" in defaults.yaml,
      // so the renderer uses that label. This is generic — any
      // field with display_name set gets the override; no
      // field-name branching in the renderer.
      expect(md).toContain('**Considered alternatives:**');
      expect(md).toContain('Plain Javascript');
      expect(md).toContain('Faster but less safe');
      expect(md).toContain('Rust Wasm');
      expect(md).toContain('Too complex');
    });
  });

  describe('list<model> shape (procedure steps)', () => {
    it('renders procedure.steps as a numbered subsection with step content', () => {
      writeRoot();
      writeLib(
        'guides.yaml',
        `
meta:
  name: guides
  scope: project
procedures:
  - id: S1
    name: Writing a test
    description: How to write a test.
    tags: []
    maps_to: [root:G1, root:V1]
    steps:
      - id: S1.1
        name: Read the profile
        description: Open the relevant profile file.
      - id: S1.2
        name: Inspect the DOM
        description: Use playlite to see what's there.
      - id: S1.3
        name: Write the test body
        description: Use app helpers, not raw selectors.
`,
      );
      const catalog = buildCatalog(defaultConfig, tmpDir);
      const s1 = catalog.getAllElements().find((e) => e.id === 'S1')!;
      const md = renderElementMarkdown(s1, catalog);
      expect(md).toContain('**Steps:**');
      // Each step should appear with its id, name, and description.
      expect(md).toContain('**S1.1**');
      expect(md).toContain('Read the profile');
      expect(md).toContain('Open the relevant profile file.');
      expect(md).toContain('**S1.2**');
      expect(md).toContain('Inspect the DOM');
      expect(md).toContain('**S1.3**');
      expect(md).toContain('Write the test body');
    });

    it('renders numbered 1. 2. 3. in declaration order', () => {
      writeRoot();
      writeLib(
        'guides.yaml',
        `
meta:
  name: guides
  scope: project
procedures:
  - id: S1
    name: Ordered
    description: Numbered.
    tags: []
    maps_to: [root:G1, root:V1]
    steps:
      - id: S1.1
        name: alpha
      - id: S1.2
        name: beta
      - id: S1.3
        name: gamma
`,
      );
      const catalog = buildCatalog(defaultConfig, tmpDir);
      const s1 = catalog.getAllElements().find((e) => e.id === 'S1')!;
      const md = renderElementMarkdown(s1, catalog);
      const alphaIdx = md.indexOf('1. **S1.1**');
      const betaIdx = md.indexOf('2. **S1.2**');
      const gammaIdx = md.indexOf('3. **S1.3**');
      expect(alphaIdx).toBeGreaterThan(-1);
      expect(betaIdx).toBeGreaterThan(alphaIdx);
      expect(gammaIdx).toBeGreaterThan(betaIdx);
    });
  });

  describe('list<reference> shape (procedure related)', () => {
    it('renders references with resolved element names', () => {
      writeRoot();
      writeLib(
        'guides.yaml',
        `
meta:
  name: guides
  scope: project
procedures:
  - id: S1
    name: With related
    description: Has related refs.
    tags: []
    maps_to: [root:G1, root:V1]
    related:
      - root:G1
      - root:V1
`,
      );
      const catalog = buildCatalog(defaultConfig, tmpDir);
      const s1 = catalog.getAllElements().find((e) => e.id === 'S1')!;
      const md = renderElementMarkdown(s1, catalog);
      expect(md).toContain('**Related:**');
      expect(md).toContain('root:G1');
      expect(md).toContain('Ship software');
      expect(md).toContain('root:V1');
      expect(md).toContain('Simplicity');
    });

    it('falls back to the bare id when the reference does not resolve', () => {
      // Note: the catalog's structural pass will flag this as E001;
      // the shape renderer is defensive and still prints the id.
      writeRoot();
      writeLib(
        'guides.yaml',
        `
meta:
  name: guides
  scope: project
procedures:
  - id: S1
    name: With broken related
    description: Broken.
    tags: []
    maps_to: [root:G1, root:V1]
    related:
      - root:NOPE
`,
      );
      const catalog = buildCatalog(defaultConfig, tmpDir);
      const s1 = catalog.getAllElements().find((e) => e.id === 'S1')!;
      const md = renderElementMarkdown(s1, catalog);
      expect(md).toContain('root:NOPE');
    });
  });

  describe('generic dispatch — no category-specific branches', () => {
    it('the renderer never hard-codes the word "considered" or "steps"', () => {
      // Read the source of shape-renderer.ts and assert that no
      // declared-field names appear in the code. This guards against
      // regressions where someone re-introduces a category branch.
      const src = fs.readFileSync(
        path.resolve(__dirname, '../../src/exporters/shape-renderer.ts'),
        'utf-8',
      );
      // Strip line comments and block comments to exclude documentation
      // references to field names.
      const codeOnly = src
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
      expect(codeOnly).not.toMatch(/['"]considered['"]/);
      expect(codeOnly).not.toMatch(/['"]steps['"]/);
      expect(codeOnly).not.toMatch(/['"]when['"]/);
      expect(codeOnly).not.toMatch(/['"]related['"]/);
      expect(codeOnly).not.toMatch(/categoryName\s*===\s*['"]/);
      expect(codeOnly).not.toMatch(/category\.name\s*===\s*['"]/);
    });
  });
});
