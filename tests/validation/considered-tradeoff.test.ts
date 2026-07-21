import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { buildCatalog } from '../../src/cli/helpers.js';
import { configSchema } from '../../src/config/schema.js';
import { structuralPass } from '../../src/validation/passes/structural-pass.js';
import { renderElementMarkdown } from '../../src/exporters/shape-renderer.js';

/**
 * Tradeoff links on `considered` alternatives (2026-07-21).
 * `would_have_served` and `conflicts_with` are list<reference> sub-fields of the
 * considered dict<model>. They must be validated for resolvability (E001) via the
 * generic reference walker, and rendered with resolved element names.
 */
describe('considered tradeoff links (would_have_served / conflicts_with)', () => {
  let tmpDir: string;
  const config = configSchema.parse({});

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cairn-tradeoff-'));
    fs.mkdirSync(path.join(tmpDir, '.gvp', 'library'), { recursive: true });
  });
  afterEach(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  function writeLib(considered: string): void {
    fs.writeFileSync(
      path.join(tmpDir, '.gvp', 'library', 'root.yaml'),
      `
meta:
  name: root
  scope: project
goals:
  - { id: G1, name: Ship fast, statement: velocity, tags: [], maps_to: [] }
  - { id: G2, name: AI-centric, statement: strong AI system, tags: [], maps_to: [] }
values:
  - { id: V1, name: Quality, statement: high quality, tags: [], maps_to: [] }
decisions:
  - id: D1
    name: Render with Three.js
    rationale: best balance
    tags: []
    maps_to: [root:G1, root:V1]
    considered:
${considered}
`,
    );
  }

  const e001 = (tmp: string) => {
    const catalog = buildCatalog(config, tmp);
    return structuralPass(catalog, config).filter((d) => d.code === 'E001');
  };

  it('accepts resolvable tradeoff references (no E001)', () => {
    writeLib(
      `      unreal:
        description: AAA rendering
        rationale: opaque to AI tooling
        would_have_served: [root:V1]
        conflicts_with: [root:G2]`,
    );
    expect(e001(tmpDir)).toHaveLength(0);
  });

  it('fires E001 for a broken would_have_served reference', () => {
    writeLib(
      `      unreal:
        rationale: opaque to AI tooling
        would_have_served: [root:GHOST]
        conflicts_with: [root:G2]`,
    );
    const errs = e001(tmpDir);
    expect(errs).toHaveLength(1);
    expect(errs[0]!.description).toContain('root:GHOST');
    expect(errs[0]!.description).toContain("considered.would_have_served ('unreal')");
    expect(errs[0]!.context.elementId).toBe('D1');
    expect(errs[0]!.context.details).toBe('considered:unreal');
  });

  it('fires E001 for a broken conflicts_with reference', () => {
    writeLib(
      `      unreal:
        rationale: opaque to AI tooling
        conflicts_with: [root:NOPE]`,
    );
    const errs = e001(tmpDir);
    expect(errs).toHaveLength(1);
    expect(errs[0]!.description).toContain('root:NOPE');
    expect(errs[0]!.description).toContain("considered.conflicts_with ('unreal')");
  });

  it('renders the tradeoff links with resolved element names', () => {
    writeLib(
      `      unreal:
        rationale: opaque to AI tooling
        would_have_served: [root:V1]
        conflicts_with: [root:G2]`,
    );
    const catalog = buildCatalog(config, tmpDir);
    const d1 = catalog.getAllElements().find((e) => e.id === 'D1')!;
    const md = renderElementMarkdown(d1, catalog);
    expect(md).toContain('Would have served');
    expect(md).toContain('root:V1 — *Quality*');
    expect(md).toContain('Conflicts with');
    expect(md).toContain('root:G2 — *AI-centric*');
  });
});
