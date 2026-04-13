import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { buildCatalog } from '../../src/cli/helpers.js';
import { configSchema } from '../../src/config/schema.js';
import { CompactExporter, renderCompactLine } from '../../src/exporters/compact-exporter.js';

/**
 * Tests for --format compact on query and export (ticket 016).
 *
 * The compact format renders each element as a single line:
 *   - **<qualified_id>: <name>** — <primary_field collapsed to one line>
 *
 * Primary field is read generically from the category registry (R6).
 */
describe('compact format', () => {
  let tmpDir: string;
  const defaultConfig = configSchema.parse({});

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cairn-compact-'));
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

  it('renders rules with statement as primary field', () => {
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
rules:
  - id: R1
    name: No deletion
    statement: Elements are never removed.
    tags: []
    maps_to: [main:G1, main:V1]
`);
    const catalog = buildCatalog(defaultConfig, tmpDir);
    const exporter = new CompactExporter();
    const output = exporter.export(catalog);
    expect(output).toContain('- **main:R1: No deletion** — Elements are never removed.');
  });

  it('renders constraints with impact as primary field (not statement)', () => {
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
constraints:
  - id: C1
    name: Budget limit
    impact: We cannot exceed $10k per quarter.
    tags: []
    maps_to: []
`);
    const catalog = buildCatalog(defaultConfig, tmpDir);
    const exporter = new CompactExporter();
    const output = exporter.export(catalog);
    expect(output).toContain('- **main:C1: Budget limit** — We cannot exceed $10k per quarter.');
    // Must NOT contain 'statement' content (constraints use impact, not statement)
    expect(output).not.toContain('statement');
  });

  it('collapses multi-line primary field to one line', () => {
    writeLib('main.yaml', `
meta:
  name: main
  scope: project
goals:
  - id: G1
    name: Multi-line goal
    statement: |
      First line of the statement.

      Second paragraph after a blank line.
      Third line in the same paragraph.
    tags: []
    maps_to: []
`);
    const catalog = buildCatalog(defaultConfig, tmpDir);
    const exporter = new CompactExporter();
    const output = exporter.export(catalog);
    // All newlines collapsed to single spaces
    expect(output).toContain('- **main:G1: Multi-line goal** — First line of the statement. Second paragraph after a blank line. Third line in the same paragraph.');
    // No literal newlines within the element line
    const g1Line = output.split('\n').find(l => l.includes('main:G1'));
    expect(g1Line).toBeDefined();
    expect(g1Line).not.toContain('\n');
  });

  it('omits trailing dash when primary field is empty', () => {
    writeLib('main.yaml', `
meta:
  name: main
  scope: project
goals:
  - id: G1
    name: Empty goal
    tags: []
    maps_to: []
`);
    const catalog = buildCatalog(defaultConfig, tmpDir);
    const exporter = new CompactExporter();
    const output = exporter.export(catalog);
    expect(output).toContain('- **main:G1: Empty goal**');
    // No trailing " — " with nothing after it
    expect(output).not.toMatch(/\*\* —\s*$/m);
  });

  it('groups elements by category with ## headers in export', () => {
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
    const exporter = new CompactExporter();
    const output = exporter.export(catalog);
    expect(output).toContain('## Goals');
    expect(output).toContain('## Values');
  });

  it('renderCompactLine works standalone with primary_field override', () => {
    const mockElement = {
      toLibraryId: () => 'test:D1',
      name: 'Test decision',
      get: (field: string) => field === 'rationale' ? 'Because\nreasons.' : undefined,
    };
    const line = renderCompactLine(mockElement, 'rationale');
    expect(line).toBe('- **test:D1: Test decision** — Because reasons.');
  });
});
