import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { Catalog } from '../../src/catalog/catalog.js';
import { Document } from '../../src/model/document.js';
import { Element } from '../../src/model/element.js';
import type { DocumentMeta } from '../../src/model/document-meta.js';
import type { ResolvedInheritance } from '../../src/inheritance/inheritance-resolver.js';
import type { GVPConfig } from '../../src/config/schema.js';
import { traceabilityPass } from '../../src/validation/passes/traceability-pass.js';
import { coveragePass } from '../../src/validation/passes/coverage-pass.js';

const config: GVPConfig = {
  strict: false,
  suppress_diagnostics: [],
  strict_export_options: true,
  validation_rules: [],
};

type ElSpec = { categoryName: string; data: Record<string, unknown> };

function makeCatalog(elements: ElSpec[], docName = 'main'): Catalog {
  const meta: DocumentMeta = { name: docName };
  const byCat = new Map<string, Element[]>();
  for (const e of elements) {
    const el = new Element(
      { status: 'active', ...e.data },
      e.categoryName,
      '@local',
      docName,
    );
    const list = byCat.get(e.categoryName) ?? [];
    list.push(el);
    byCat.set(e.categoryName, list);
  }
  const doc = new Document(meta, byCat, `/${docName}.yaml`, docName, '@local');
  const resolved: ResolvedInheritance = {
    orderedDocuments: [doc],
    aliasMap: new Map(),
    sccs: [],
  };
  return new Catalog(resolved, config);
}

const codes = (ds: { code: string; context: { elementId?: string } }[], code: string) =>
  ds.filter(d => d.code === code).map(d => d.context.elementId);

// A value anchor reused across mapping tests.
const V1: ElSpec = { categoryName: 'value', data: { id: 'V1', name: 'Legitimacy', maps_to: [] } };

describe('#6 mapping_rules generalization — any non-value root satisfies W003', () => {
  it('a decision mapping only to a user_requirement does not trip W003 (the #7 wrinkle)', () => {
    const ds = traceabilityPass(makeCatalog([
      { categoryName: 'user_requirement', data: { id: 'U1', name: 'Guest play', maps_to: [] } },
      { categoryName: 'decision', data: { id: 'D1', name: 'Ship guest-first', rationale: 'x', maps_to: ['main:U1'] } },
    ]), config);
    expect(codes(ds, 'W003')).not.toContain('D1');
  });

  it('a decision mapping only to an exclusion does not trip W003', () => {
    const ds = traceabilityPass(makeCatalog([
      { categoryName: 'exclusion', data: { id: 'X1', name: 'No accounts', maps_to: [] } },
      { categoryName: 'decision', data: { id: 'D1', name: 'Decline accounts', rationale: 'x', maps_to: ['main:X1'] } },
    ]), config);
    expect(codes(ds, 'W003')).not.toContain('D1');
  });

  it('a decision mapping only to a constraint does not trip W003', () => {
    const ds = traceabilityPass(makeCatalog([
      { categoryName: 'constraint', data: { id: 'C1', name: 'Budget', impact: 'x', maps_to: [] } },
      { categoryName: 'decision', data: { id: 'D1', name: 'Cut scope', rationale: 'x', maps_to: ['main:C1'] } },
    ]), config);
    expect(codes(ds, 'W003')).not.toContain('D1');
  });

  it('the legacy [goal, value] pair still satisfies (backward compatible)', () => {
    const ds = traceabilityPass(makeCatalog([
      { categoryName: 'goal', data: { id: 'G1', name: 'G', statement: 'x', maps_to: [] } },
      V1,
      { categoryName: 'decision', data: { id: 'D1', name: 'D', rationale: 'x', maps_to: ['main:G1', 'main:V1'] } },
    ]), config);
    expect(codes(ds, 'W003')).not.toContain('D1');
  });
});

describe('#6 W016 — soft, transitive value anchor', () => {
  it('fires when no value is reachable (decision anchored only to an exclusion)', () => {
    const ds = traceabilityPass(makeCatalog([
      { categoryName: 'exclusion', data: { id: 'X1', name: 'No accounts', maps_to: [] } },
      { categoryName: 'decision', data: { id: 'D1', name: 'Decline', rationale: 'x', maps_to: ['main:X1'] } },
    ]), config);
    expect(codes(ds, 'W016')).toContain('D1');
  });

  it('is silent when a value is reachable transitively through a requirement', () => {
    const ds = traceabilityPass(makeCatalog([
      V1,
      { categoryName: 'user_requirement', data: { id: 'U1', name: 'U', maps_to: ['main:V1'] } },
      { categoryName: 'decision', data: { id: 'D1', name: 'D', rationale: 'x', maps_to: ['main:U1'] } },
    ]), config);
    expect(codes(ds, 'W016')).not.toContain('D1');
  });

  it('is a warning, not an error', () => {
    const ds = traceabilityPass(makeCatalog([
      { categoryName: 'exclusion', data: { id: 'X1', name: 'X', maps_to: [] } },
      { categoryName: 'decision', data: { id: 'D1', name: 'D', rationale: 'x', maps_to: ['main:X1'] } },
    ]), config);
    expect(ds.find(d => d.code === 'W016')?.severity).toBe('warning');
  });
});

describe('#8 W013 — disposition scopes the decision-no-refs check', () => {
  const base = (disposition?: string): ElSpec[] => [
    { categoryName: 'goal', data: { id: 'G1', name: 'G', statement: 'x', maps_to: [] } },
    V1,
    { categoryName: 'decision', data: {
      id: 'D1', name: 'D', rationale: 'x', maps_to: ['main:G1', 'main:V1'],
      ...(disposition ? { disposition } : {}),
    } },
  ];

  it('fires for an accepted decision with no refs', () => {
    expect(codes(coveragePass(makeCatalog(base('accepted')), config), 'W013')).toContain('D1');
  });

  it('fires when disposition is absent (defaults to accepted)', () => {
    expect(codes(coveragePass(makeCatalog(base()), config), 'W013')).toContain('D1');
  });

  it('is exempt for a declined decision', () => {
    expect(codes(coveragePass(makeCatalog(base('declined')), config), 'W013')).not.toContain('D1');
  });

  it('is exempt for a deferred decision', () => {
    expect(codes(coveragePass(makeCatalog(base('deferred')), config), 'W013')).not.toContain('D1');
  });
});

describe('#8 W017 — top-side root coverage via requires_decision flag', () => {
  it('fires for a goal with no decision tracing to it', () => {
    const ds = coveragePass(makeCatalog([
      { categoryName: 'goal', data: { id: 'G1', name: 'G', statement: 'x', maps_to: [] } },
    ]), config);
    expect(codes(ds, 'W017')).toContain('G1');
  });

  it('is silent for a goal with a decision tracing to it (transitively)', () => {
    const ds = coveragePass(makeCatalog([
      { categoryName: 'goal', data: { id: 'G1', name: 'G', statement: 'x', maps_to: [] } },
      V1,
      { categoryName: 'rule', data: { id: 'R1', name: 'R', statement: 'x', maps_to: ['main:G1', 'main:V1'] } },
      { categoryName: 'decision', data: { id: 'D1', name: 'D', rationale: 'x', maps_to: ['main:R1'], refs: [{ file: 'a', identifier: 'b', role: 'implements' }] } },
    ]), config);
    expect(codes(ds, 'W017')).not.toContain('G1');
  });

  it('fires for a user_requirement with no decision, silent once one traces to it', () => {
    const uncovered = coveragePass(makeCatalog([
      { categoryName: 'user_requirement', data: { id: 'U1', name: 'U', maps_to: [] } },
    ]), config);
    expect(codes(uncovered, 'W017')).toContain('U1');

    const covered = coveragePass(makeCatalog([
      { categoryName: 'user_requirement', data: { id: 'U1', name: 'U', maps_to: [] } },
      { categoryName: 'decision', data: { id: 'D1', name: 'D', rationale: 'x', maps_to: ['main:U1'] } },
    ]), config);
    expect(codes(covered, 'W017')).not.toContain('U1');
  });

  it('exempts exclusion (self-satisfies) and value (a direction, not a point)', () => {
    const ds = coveragePass(makeCatalog([
      { categoryName: 'exclusion', data: { id: 'X1', name: 'X', maps_to: [] } },
      { categoryName: 'value', data: { id: 'V9', name: 'V', maps_to: [] } },
    ]), config);
    expect(codes(ds, 'W017')).not.toContain('X1');
    expect(codes(ds, 'W017')).not.toContain('V9');
  });
});

describe('R6 source-grep — new passes dispatch on schema flags, not category names', () => {
  const stripComments = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const read = (rel: string) =>
    stripComments(fs.readFileSync(path.resolve(__dirname, rel), 'utf-8'));

  const NON_DECISION_CATEGORY = /['"](goal|value|constraint|exclusion|user_requirement|milestone|principle|rule|heuristic|procedure)['"]/;

  it('traceability-pass.ts hard-codes no category names (uses is_root / is_value_anchor)', () => {
    const code = read('../../src/validation/passes/traceability-pass.ts');
    expect(code).not.toMatch(NON_DECISION_CATEGORY);
    expect(code).not.toMatch(/categoryName\s*===\s*['"]/);
  });

  it('coverage-pass.ts hard-codes no category name except the authorized `decision` (D33)', () => {
    const code = read('../../src/validation/passes/coverage-pass.ts');
    // The only permitted category literal is 'decision' — the coverage pass is
    // decision-centric by charter, blessed by the scoped R6 exception.
    expect(code).not.toMatch(NON_DECISION_CATEGORY);
  });
});
