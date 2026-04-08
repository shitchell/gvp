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
 * Phase B tests: the `procedure` category.
 *
 * Covers the full parse + validate pipeline for procedures:
 *   - procedure category is loaded from defaults.yaml
 *   - step ids are auto-assigned when missing, with W015 emitted
 *   - explicit step ids pass through unchanged (R1 preservation)
 *   - step.maps_to contributes E001 when references are broken
 *   - step.refs contributes W010 when files are missing
 *   - duplicate explicit step ids produce E005
 *   - `when` and `related` fields round-trip cleanly
 *
 * Fixture pattern follows tests/cli/document-filter.test.ts — a tempdir
 * with a .gvp/library/ containing the documents under test, built via
 * buildCatalog() from the real CLI entry point.
 */
describe('procedure category (Phase B)', () => {
  let tmpDir: string;
  const defaultConfig = configSchema.parse({});
  const allPasses = new Map<string, ValidationPass>([...builtinPasses]);
  const passNames = [...builtinPasses.keys()];

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cairn-procedure-'));
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

  /** Minimal root doc providing G1 + V1 so procedures can map cleanly. */
  function writeRootDoc(): void {
    writeLib(
      'root.yaml',
      `
meta:
  name: root
  scope: project

goals:
  - id: G1
    name: Ship good software
    statement: Deliver software that works.
    tags: []
    maps_to: []

values:
  - id: V1
    name: Clarity
    statement: Code should be clear.
    tags: []
    maps_to: [root:G1]
`,
    );
  }

  describe('category registration', () => {
    it('procedure is a loaded category with yaml_key procedures', () => {
      writeRootDoc();
      writeLib(
        'guides.yaml',
        `
meta:
  name: guides
  scope: project

procedures:
  - id: Q1
    name: Example procedure
    description: A minimal procedure.
    tags: []
    maps_to: [root:G1, root:V1]
`,
      );
      const catalog = buildCatalog(defaultConfig, tmpDir);
      const procs = catalog
        .getAllElements()
        .filter((e) => e.categoryName === 'procedure');
      expect(procs).toHaveLength(1);
      expect(procs[0]!.id).toBe('Q1');
      expect(procs[0]!.name).toBe('Example procedure');
    });

    it('procedure primary field is description', () => {
      writeRootDoc();
      writeLib(
        'guides.yaml',
        `
meta:
  name: guides
  scope: project

procedures:
  - id: Q1
    name: Example
    description: The description text.
    tags: []
    maps_to: [root:G1, root:V1]
`,
      );
      const catalog = buildCatalog(defaultConfig, tmpDir);
      const el = catalog.getAllElements().find((e) => e.id === 'Q1')!;
      const catDef = catalog.registry.getByName('procedure');
      expect(catDef?.primary_field).toBe('description');
      expect(el.get('description')).toBe('The description text.');
    });
  });

  describe('step id auto-assignment', () => {
    it('assigns dotted ids to steps without explicit ids', () => {
      writeRootDoc();
      writeLib(
        'guides.yaml',
        `
meta:
  name: guides
  scope: project

procedures:
  - id: Q1
    name: With unnamed steps
    description: Procedure with steps lacking ids.
    tags: []
    maps_to: [root:G1, root:V1]
    steps:
      - name: First step
      - name: Second step
      - name: Third step
`,
      );
      const catalog = buildCatalog(defaultConfig, tmpDir);
      const el = catalog.getAllElements().find((e) => e.id === 'Q1')!;
      const steps = el.get('steps') as Array<Record<string, unknown>>;
      expect(steps[0]!.id).toBe('Q1.1');
      expect(steps[1]!.id).toBe('Q1.2');
      expect(steps[2]!.id).toBe('Q1.3');
    });

    it('preserves explicit step ids without renumbering', () => {
      writeRootDoc();
      writeLib(
        'guides.yaml',
        `
meta:
  name: guides
  scope: project

procedures:
  - id: Q1
    name: With explicit step ids
    description: R1 preservation — survivor keeps original slot.
    tags: []
    maps_to: [root:G1, root:V1]
    steps:
      - id: Q1.1
        name: First step
      - id: Q1.3
        name: Third step (second was deleted)
`,
      );
      const catalog = buildCatalog(defaultConfig, tmpDir);
      const el = catalog.getAllElements().find((e) => e.id === 'Q1')!;
      const steps = el.get('steps') as Array<Record<string, unknown>>;
      expect(steps[0]!.id).toBe('Q1.1');
      expect(steps[1]!.id).toBe('Q1.3');
    });

    it('mixes explicit and implicit ids: only the missing ones get filled', () => {
      writeRootDoc();
      writeLib(
        'guides.yaml',
        `
meta:
  name: guides
  scope: project

procedures:
  - id: Q1
    name: Mixed
    description: First step has explicit id, others do not.
    tags: []
    maps_to: [root:G1, root:V1]
    steps:
      - id: custom-first
        name: First
      - name: Second
      - name: Third
`,
      );
      const catalog = buildCatalog(defaultConfig, tmpDir);
      const el = catalog.getAllElements().find((e) => e.id === 'Q1')!;
      const steps = el.get('steps') as Array<Record<string, unknown>>;
      expect(steps[0]!.id).toBe('custom-first');
      // Note: auto-assigned slots use list position, so index-1 and
      // index-2 become Q1.2 and Q1.3 (the R1 warning W015 nudges
      // users to persist these).
      expect(steps[1]!.id).toBe('Q1.2');
      expect(steps[2]!.id).toBe('Q1.3');
    });
  });

  describe('W015 AUTO_ASSIGNED_STEP_ID', () => {
    it('fires when any step id was auto-assigned', () => {
      writeRootDoc();
      writeLib(
        'guides.yaml',
        `
meta:
  name: guides
  scope: project

procedures:
  - id: Q1
    name: Auto-numbered
    description: Auto.
    tags: []
    maps_to: [root:G1, root:V1]
    steps:
      - name: one
      - name: two
`,
      );
      const catalog = buildCatalog(defaultConfig, tmpDir);
      const diagnostics = runValidation(
        catalog,
        defaultConfig,
        allPasses,
        passNames,
      );
      const w015 = diagnostics.filter((d) => d.code === 'W015');
      expect(w015).toHaveLength(1);
      expect(w015[0]!.context.elementId).toBe('Q1');
    });

    it('does NOT fire when all step ids are explicit', () => {
      writeRootDoc();
      writeLib(
        'guides.yaml',
        `
meta:
  name: guides
  scope: project

procedures:
  - id: Q1
    name: All explicit
    description: All persisted.
    tags: []
    maps_to: [root:G1, root:V1]
    steps:
      - id: Q1.1
        name: one
      - id: Q1.2
        name: two
`,
      );
      const catalog = buildCatalog(defaultConfig, tmpDir);
      const diagnostics = runValidation(
        catalog,
        defaultConfig,
        allPasses,
        passNames,
      );
      const w015 = diagnostics.filter((d) => d.code === 'W015');
      expect(w015).toHaveLength(0);
    });
  });

  describe('step maps_to broken reference (E001)', () => {
    it('fires when a step references an unknown element', () => {
      writeRootDoc();
      writeLib(
        'guides.yaml',
        `
meta:
  name: guides
  scope: project

procedures:
  - id: Q1
    name: With a typo
    description: One step has a broken reference.
    tags: []
    maps_to: [root:G1, root:V1]
    steps:
      - id: Q1.1
        name: Good step
        maps_to: [root:V1]
      - id: Q1.2
        name: Bad step
        maps_to: [root:V99]
`,
      );
      const catalog = buildCatalog(defaultConfig, tmpDir);
      const diagnostics = runValidation(
        catalog,
        defaultConfig,
        allPasses,
        passNames,
      );
      const e001 = diagnostics.filter(
        (d) => d.code === 'E001' && d.description.includes('V99'),
      );
      expect(e001).toHaveLength(1);
      expect(e001[0]!.context.elementId).toBe('Q1');
      expect(e001[0]!.context.details).toBe('step:Q1.2');
    });
  });

  describe('E005 DUPLICATE_STEP_ID', () => {
    it('fires when two steps share the same explicit id', () => {
      writeRootDoc();
      writeLib(
        'guides.yaml',
        `
meta:
  name: guides
  scope: project

procedures:
  - id: Q1
    name: With duplicate step ids
    description: dup.
    tags: []
    maps_to: [root:G1, root:V1]
    steps:
      - id: Q1.1
        name: First
      - id: Q1.1
        name: Also first (BAD)
`,
      );
      const catalog = buildCatalog(defaultConfig, tmpDir);
      const diagnostics = runValidation(
        catalog,
        defaultConfig,
        allPasses,
        passNames,
      );
      const e005 = diagnostics.filter((d) => d.code === 'E005');
      expect(e005).toHaveLength(1);
      expect(e005[0]!.description).toContain('Q1.1');
    });

    it('does NOT fire for auto-assigned step ids (unique by construction)', () => {
      writeRootDoc();
      writeLib(
        'guides.yaml',
        `
meta:
  name: guides
  scope: project

procedures:
  - id: Q1
    name: Auto-numbered
    description: Auto.
    tags: []
    maps_to: [root:G1, root:V1]
    steps:
      - name: one
      - name: two
      - name: three
`,
      );
      const catalog = buildCatalog(defaultConfig, tmpDir);
      const diagnostics = runValidation(
        catalog,
        defaultConfig,
        allPasses,
        passNames,
      );
      const e005 = diagnostics.filter((d) => d.code === 'E005');
      expect(e005).toHaveLength(0);
    });
  });

  describe('related field', () => {
    it('fires E001 when a related entry does not resolve', () => {
      writeRootDoc();
      writeLib(
        'guides.yaml',
        `
meta:
  name: guides
  scope: project

procedures:
  - id: Q1
    name: With broken related
    description: broken.
    tags: []
    maps_to: [root:G1, root:V1]
    related:
      - root:V1
      - root:V99
`,
      );
      const catalog = buildCatalog(defaultConfig, tmpDir);
      const diagnostics = runValidation(
        catalog,
        defaultConfig,
        allPasses,
        passNames,
      );
      const e001 = diagnostics.filter(
        (d) => d.code === 'E001' && d.description.includes('related'),
      );
      expect(e001).toHaveLength(1);
    });
  });

  describe('when field', () => {
    it('round-trips on the procedure element', () => {
      writeRootDoc();
      writeLib(
        'guides.yaml',
        `
meta:
  name: guides
  scope: project

procedures:
  - id: Q1
    name: With when
    description: Has when.
    when: Starting a new test or migrating a v1 test
    tags: []
    maps_to: [root:G1, root:V1]
`,
      );
      const catalog = buildCatalog(defaultConfig, tmpDir);
      const el = catalog.getAllElements().find((e) => e.id === 'Q1')!;
      expect(el.get('when')).toBe(
        'Starting a new test or migrating a v1 test',
      );
    });
  });
});
