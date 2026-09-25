import { describe, it, expect } from 'vitest';
import { Catalog } from '../../src/catalog/catalog.js';
import { Document } from '../../src/model/document.js';
import { Element } from '../../src/model/element.js';
import type { DocumentMeta } from '../../src/model/document-meta.js';
import type { ResolvedInheritance } from '../../src/inheritance/inheritance-resolver.js';
import type { GVPConfig } from '../../src/config/schema.js';
import type { CategoryDefinition } from '../../src/schema/category-definition.js';
import { traceabilityPass } from '../../src/validation/passes/traceability-pass.js';
import { semanticPass } from '../../src/validation/passes/semantic-pass.js';
import { coveragePass } from '../../src/validation/passes/coverage-pass.js';

/**
 * #27 / DEC-2.12 — "overriding a definition doesn't retroactively change the
 * meaning of ancestor elements."
 *
 * Every fixture here declares DIFFERENT `meta.definitions.categories` in an
 * ancestor library and in its descendant, because that is the only shape in
 * which the defect is observable. No library in this repo (nor in gvp-docs)
 * declares category definitions today, so the pre-existing suite resolves every
 * source to `src/data/defaults.yaml` verbatim and cannot catch a regression
 * here — these fixtures are the whole safety net.
 *
 * Both directions are covered on purpose:
 *   - descendant TIGHTENS  → ancestor elements that were valid stay valid
 *   - descendant LOOSENS   → ancestor elements violating the ancestor's
 *                            stricter rule are still reported
 */

const config: GVPConfig = {
  strict: false,
  suppress_diagnostics: [],
  strict_export_options: true,
  validation_rules: [],
};

type ElSpec = { categoryName: string; data: Record<string, unknown> };

interface DocSpec {
  /** Library the document belongs to, e.g. '@org'. */
  source: string;
  /** meta.name — also how refs address it (`<meta.name>:<id>`, #11). */
  name: string;
  /** Sources this document inherits (object-form = whole external library). */
  inherits?: string[];
  definitions?: DocumentMeta['definitions'];
  elements?: ElSpec[];
}

/**
 * Build a catalog from several libraries. `docs` must be in DFS order,
 * ancestors first — the same order `resolveInheritance` produces.
 */
function makeCatalog(docs: DocSpec[]): Catalog {
  const documents = docs.map(spec => {
    const meta: DocumentMeta = {
      name: spec.name,
      ...(spec.inherits ? { inherits: spec.inherits.map(source => ({ source })) } : {}),
      ...(spec.definitions ? { definitions: spec.definitions } : {}),
    };
    const byCat = new Map<string, Element[]>();
    for (const e of spec.elements ?? []) {
      const el = new Element(
        { status: 'active', ...e.data },
        e.categoryName,
        spec.source,
        spec.name,
      );
      const list = byCat.get(e.categoryName) ?? [];
      list.push(el);
      byCat.set(e.categoryName, list);
    }
    return new Document(meta, byCat, `/${spec.source}/${spec.name}.yaml`, spec.name, spec.source);
  });

  const resolved = { orderedDocuments: documents, sccs: [] } as ResolvedInheritance;
  return new Catalog(resolved, config);
}

const ids = (
  ds: Array<{ code: string; context: { elementId?: string } }>,
  code: string,
): string[] => ds.filter(d => d.code === code).map(d => d.context.elementId!);

/** A `decision` definition identical to the default but for its mapping_rules. */
function decisionWith(mapping_rules: string[][]): CategoryDefinition {
  return {
    yaml_key: 'decisions',
    id_prefix: 'D',
    primary_field: 'rationale',
    mapping_rules,
  };
}

const LOOSE = [['goal']];
const TIGHT = [['goal', 'value']];

// ---------------------------------------------------------------------------
// mapping_rules
// ---------------------------------------------------------------------------

describe('#27 mapping_rules resolve per element source (DEC-2.12)', () => {
  it('descendant TIGHTENS: the ancestor decision that was valid stays valid', () => {
    const ds = traceabilityPass(makeCatalog([
      {
        source: '@org',
        name: 'org-lib',
        definitions: { categories: { decision: decisionWith(LOOSE) } },
        elements: [
          { categoryName: 'goal', data: { id: 'OG1', name: 'Org goal', statement: 'x' } },
          { categoryName: 'decision', data: { id: 'OD1', name: 'Org decision', rationale: 'x', maps_to: ['org-lib:OG1'] } },
        ],
      },
      {
        source: '@local',
        name: 'main',
        inherits: ['@org'],
        definitions: { categories: { decision: decisionWith(TIGHT) } },
        elements: [
          { categoryName: 'goal', data: { id: 'G1', name: 'Local goal', statement: 'x' } },
          { categoryName: 'decision', data: { id: 'D1', name: 'Local decision', rationale: 'x', maps_to: ['main:G1'] } },
        ],
      },
    ]), config);

    // OD1 satisfies @org's [[goal]] — the rules it was authored under.
    expect(ids(ds, 'W003')).not.toContain('OD1');
    // D1 violates @local's own [[goal, value]].
    expect(ids(ds, 'W003')).toContain('D1');
  });

  it('descendant LOOSENS: the ancestor decision violating the ancestor rule is still reported', () => {
    const ds = traceabilityPass(makeCatalog([
      {
        source: '@org',
        name: 'org-lib',
        definitions: { categories: { decision: decisionWith(TIGHT) } },
        elements: [
          { categoryName: 'goal', data: { id: 'OG1', name: 'Org goal', statement: 'x' } },
          { categoryName: 'decision', data: { id: 'OD1', name: 'Org decision', rationale: 'x', maps_to: ['org-lib:OG1'] } },
        ],
      },
      {
        source: '@local',
        name: 'main',
        inherits: ['@org'],
        definitions: { categories: { decision: decisionWith(LOOSE) } },
        elements: [
          { categoryName: 'goal', data: { id: 'G1', name: 'Local goal', statement: 'x' } },
          { categoryName: 'decision', data: { id: 'D1', name: 'Local decision', rationale: 'x', maps_to: ['main:G1'] } },
        ],
      },
    ]), config);

    // The loosening does NOT silently stop enforcing @org's stricter contract.
    expect(ids(ds, 'W003')).toContain('OD1');
    expect(ids(ds, 'W003')).not.toContain('D1');
  });

  it('a sibling library that tightens does not reach across into another branch', () => {
    // @b and @a are unrelated: both inherited by @local, neither inherits the
    // other. @a is merged last, so the flat registry says TIGHT — but @a's
    // tightening must not govern @b's elements.
    const ds = traceabilityPass(makeCatalog([
      {
        source: '@b',
        name: 'b-lib',
        definitions: { categories: { decision: decisionWith(LOOSE) } },
        elements: [
          { categoryName: 'goal', data: { id: 'BG1', name: 'B goal', statement: 'x' } },
          { categoryName: 'decision', data: { id: 'BD1', name: 'B decision', rationale: 'x', maps_to: ['b-lib:BG1'] } },
        ],
      },
      {
        source: '@a',
        name: 'a-lib',
        definitions: { categories: { decision: decisionWith(TIGHT) } },
        elements: [
          { categoryName: 'goal', data: { id: 'AG1', name: 'A goal', statement: 'x' } },
          { categoryName: 'value', data: { id: 'AV1', name: 'A value', statement: 'x' } },
          { categoryName: 'decision', data: { id: 'AD1', name: 'A decision', rationale: 'x', maps_to: ['a-lib:AG1', 'a-lib:AV1'] } },
        ],
      },
      { source: '@local', name: 'main', inherits: ['@b', '@a'] },
    ]), config);

    expect(ids(ds, 'W003')).not.toContain('BD1');
    expect(ids(ds, 'W003')).not.toContain('AD1');
  });

  it("a library's snapshot covers ALL of its documents, not just the first one seen", () => {
    // @org's tightening lives in its SECOND document, while the element it
    // governs lives in the first. @local then loosens, so the flat merged
    // registry says LOOSE and would let OD1 through.
    const ds = traceabilityPass(makeCatalog([
      {
        source: '@org',
        name: 'org-elements',
        elements: [
          { categoryName: 'goal', data: { id: 'OG1', name: 'Org goal', statement: 'x' } },
          { categoryName: 'decision', data: { id: 'OD1', name: 'Org decision', rationale: 'x', maps_to: ['org-elements:OG1'] } },
        ],
      },
      {
        source: '@org',
        name: 'org-defs',
        definitions: { categories: { decision: decisionWith(TIGHT) } },
      },
      {
        source: '@local',
        name: 'main',
        inherits: ['@org'],
        definitions: { categories: { decision: decisionWith(LOOSE) } },
      },
    ]), config);

    expect(ids(ds, 'W003')).toContain('OD1');
  });

  it('JUDGEMENT CALL: a local element with no local definition is governed by the INHERITED one', () => {
    // @local declares nothing; @org tightens. The local decision is judged under
    // @org's stricter rule, not the built-in default — a library sees its own
    // definitions layered over its ancestors'. (Descendants and siblings stay
    // invisible; only upstream is inherited.)
    //
    // This pins the CHOICE, not the bug: it also passes against the flat
    // registry. It fails the moment someone reads DEC-2.12 as "a library is
    // governed only by what it declares itself, defaults otherwise".
    const ds = traceabilityPass(makeCatalog([
      {
        source: '@org',
        name: 'org-lib',
        definitions: { categories: { decision: decisionWith([['goal', 'value']]) } },
      },
      {
        source: '@local',
        name: 'main',
        inherits: ['@org'],
        elements: [
          { categoryName: 'goal', data: { id: 'G1', name: 'Local goal', statement: 'x' } },
          { categoryName: 'constraint', data: { id: 'C1', name: 'Local constraint', impact: 'x' } },
          // Satisfies the DEFAULT rules ([constraint] is a default AND-group)
          // but not @org's, which drops every group but [goal, value].
          { categoryName: 'decision', data: { id: 'D1', name: 'Local decision', rationale: 'x', maps_to: ['main:C1'] } },
        ],
      },
    ]), config);

    expect(ids(ds, 'W003')).toContain('D1');
  });
});

// ---------------------------------------------------------------------------
// is_root
// ---------------------------------------------------------------------------

describe('#27 is_root resolves per element source (DEC-2.12)', () => {
  // Definitions merge key-wise: a key the override omits is INHERITED, so
  // turning a flag off downstream means writing `false`, not dropping the key —
  // and likewise `mapping_rules: []` rather than omitting them, since post-merge
  // validation requires roots to carry none and non-roots to carry some.
  const principleRoot: CategoryDefinition = {
    yaml_key: 'principles',
    id_prefix: 'P',
    primary_field: 'statement',
    is_root: true,
    mapping_rules: [],
  };
  const principleNonRoot: CategoryDefinition = {
    yaml_key: 'principles',
    id_prefix: 'P',
    primary_field: 'statement',
    is_root: false,
    mapping_rules: [['goal']],
  };

  it('descendant demotes a root: the ancestor element stays exempt from W001', () => {
    const ds = semanticPass(makeCatalog([
      {
        source: '@org',
        name: 'org-lib',
        definitions: { categories: { principle: principleRoot } },
        elements: [
          { categoryName: 'principle', data: { id: 'OP1', name: 'Org principle', statement: 'x', maps_to: [] } },
        ],
      },
      {
        source: '@local',
        name: 'main',
        inherits: ['@org'],
        definitions: { categories: { principle: principleNonRoot } },
        elements: [
          { categoryName: 'principle', data: { id: 'P1', name: 'Local principle', statement: 'x', maps_to: [] } },
        ],
      },
    ]), config);

    expect(ids(ds, 'W001')).not.toContain('OP1'); // root under @org
    expect(ids(ds, 'W001')).toContain('P1'); // non-root under @local
  });

  it('descendant promotes to root: the ancestor element still has to anchor', () => {
    const ds = semanticPass(makeCatalog([
      {
        source: '@org',
        name: 'org-lib',
        definitions: { categories: { principle: principleNonRoot } },
        elements: [
          { categoryName: 'principle', data: { id: 'OP1', name: 'Org principle', statement: 'x', maps_to: [] } },
        ],
      },
      {
        source: '@local',
        name: 'main',
        inherits: ['@org'],
        definitions: { categories: { principle: principleRoot } },
        elements: [
          { categoryName: 'principle', data: { id: 'P1', name: 'Local principle', statement: 'x', maps_to: [] } },
        ],
      },
    ]), config);

    expect(ids(ds, 'W001')).toContain('OP1'); // still non-root under @org
    expect(ids(ds, 'W001')).not.toContain('P1'); // root under @local
  });

  it('W014 asks each walked node whether IT is a root, using that node\'s library', () => {
    // D1 (local) anchors to an @org principle. @org calls `principle` a root, so
    // the trace terminates there even though @local does not.
    const ds = traceabilityPass(makeCatalog([
      {
        source: '@org',
        name: 'org-lib',
        definitions: { categories: { principle: principleRoot } },
        elements: [
          { categoryName: 'principle', data: { id: 'OP1', name: 'Org principle', statement: 'x', maps_to: [] } },
        ],
      },
      {
        source: '@local',
        name: 'main',
        inherits: ['@org'],
        definitions: { categories: { principle: principleNonRoot } },
        elements: [
          { categoryName: 'principle', data: { id: 'P1', name: 'Local principle', statement: 'x', maps_to: [] } },
          { categoryName: 'decision', data: { id: 'D1', name: 'Anchored to org', rationale: 'x', maps_to: ['org-lib:OP1'] } },
          { categoryName: 'decision', data: { id: 'D2', name: 'Anchored locally', rationale: 'x', maps_to: ['main:P1'] } },
        ],
      },
    ]), config);

    expect(ids(ds, 'W014')).not.toContain('D1');
    expect(ids(ds, 'W014')).toContain('D2');
  });
});

// ---------------------------------------------------------------------------
// requires_decision (W018)
// ---------------------------------------------------------------------------

describe('#27 requires_decision resolves per element source (DEC-2.12)', () => {
  const goalRequiring: CategoryDefinition = {
    yaml_key: 'goals',
    id_prefix: 'G',
    primary_field: 'statement',
    is_root: true,
    requires_decision: true,
  };
  // Flags merge key-wise — `false`, not an omitted key, turns one off.
  const goalNotRequiring: CategoryDefinition = {
    yaml_key: 'goals',
    id_prefix: 'G',
    primary_field: 'statement',
    is_root: true,
    requires_decision: false,
  };

  it('descendant drops requires_decision: the ancestor root is still expected to be actioned', () => {
    const ds = coveragePass(makeCatalog([
      {
        source: '@org',
        name: 'org-lib',
        definitions: { categories: { goal: goalRequiring } },
        elements: [
          { categoryName: 'goal', data: { id: 'OG1', name: 'Org goal', statement: 'x' } },
        ],
      },
      {
        source: '@local',
        name: 'main',
        inherits: ['@org'],
        definitions: { categories: { goal: goalNotRequiring } },
        elements: [
          { categoryName: 'goal', data: { id: 'G1', name: 'Local goal', statement: 'x' } },
        ],
      },
    ]), config);

    expect(ids(ds, 'W018')).toContain('OG1');
    expect(ids(ds, 'W018')).not.toContain('G1');
  });

  it('descendant adds requires_decision: the ancestor root is not retroactively in breach', () => {
    const ds = coveragePass(makeCatalog([
      {
        source: '@org',
        name: 'org-lib',
        definitions: { categories: { goal: goalNotRequiring } },
        elements: [
          { categoryName: 'goal', data: { id: 'OG1', name: 'Org goal', statement: 'x' } },
        ],
      },
      {
        source: '@local',
        name: 'main',
        inherits: ['@org'],
        definitions: { categories: { goal: goalRequiring } },
        elements: [
          { categoryName: 'goal', data: { id: 'G1', name: 'Local goal', statement: 'x' } },
        ],
      },
    ]), config);

    expect(ids(ds, 'W018')).not.toContain('OG1');
    expect(ids(ds, 'W018')).toContain('G1');
  });
});

// ---------------------------------------------------------------------------
// is_value_anchor (W017)
// ---------------------------------------------------------------------------

describe('#27 is_value_anchor resolves per element source (DEC-2.12)', () => {
  const principleAnchor: CategoryDefinition = {
    yaml_key: 'principles',
    id_prefix: 'P',
    primary_field: 'statement',
    is_root: true,
    is_value_anchor: true,
  };
  // Flags merge key-wise — `false`, not an omitted key, turns one off.
  const principlePlain: CategoryDefinition = {
    yaml_key: 'principles',
    id_prefix: 'P',
    primary_field: 'statement',
    is_root: true,
    is_value_anchor: false,
  };

  it('ancestor designates its own value anchor; a descendant dropping the flag does not un-anchor it', () => {
    const ds = traceabilityPass(makeCatalog([
      {
        source: '@org',
        name: 'org-lib',
        definitions: { categories: { principle: principleAnchor } },
        elements: [
          { categoryName: 'principle', data: { id: 'OP1', name: 'Org principle', statement: 'x', maps_to: [] } },
          { categoryName: 'decision', data: { id: 'OD1', name: 'Org decision', rationale: 'x', maps_to: ['org-lib:OP1'] } },
        ],
      },
      {
        source: '@local',
        name: 'main',
        inherits: ['@org'],
        definitions: { categories: { principle: principlePlain } },
        elements: [
          { categoryName: 'principle', data: { id: 'P1', name: 'Local principle', statement: 'x', maps_to: [] } },
          { categoryName: 'decision', data: { id: 'D1', name: 'Local decision', rationale: 'x', maps_to: ['main:P1'] } },
        ],
      },
    ]), config);

    // OD1 reaches @org's OP1, an anchor under @org's own definition.
    expect(ids(ds, 'W017')).not.toContain('OD1');
    // D1 reaches only @local's P1, which @local does not call an anchor.
    expect(ids(ds, 'W017')).toContain('D1');
  });

  it('a descendant element reaching an ancestor anchor is anchored — the walked node answers for itself', () => {
    const ds = traceabilityPass(makeCatalog([
      {
        source: '@org',
        name: 'org-lib',
        definitions: { categories: { principle: principleAnchor } },
        elements: [
          { categoryName: 'principle', data: { id: 'OP1', name: 'Org principle', statement: 'x', maps_to: [] } },
        ],
      },
      {
        source: '@local',
        name: 'main',
        inherits: ['@org'],
        definitions: { categories: { principle: principlePlain } },
        elements: [
          { categoryName: 'decision', data: { id: 'D1', name: 'Local decision', rationale: 'x', maps_to: ['org-lib:OP1'] } },
        ],
      },
    ]), config);

    expect(ids(ds, 'W017')).not.toContain('D1');
  });
});

// ---------------------------------------------------------------------------
// the snapshot plumbing itself
// ---------------------------------------------------------------------------

describe('#27 Catalog.getRegistryForSource (DEC-2.12)', () => {
  const catalog = (): Catalog => makeCatalog([
    {
      source: '@org',
      name: 'org-lib',
      definitions: { categories: { decision: decisionWith(LOOSE) } },
      elements: [{ categoryName: 'goal', data: { id: 'OG1', name: 'g', statement: 'x' } }],
    },
    {
      source: '@local',
      name: 'main',
      inherits: ['@org'],
      definitions: { categories: { decision: decisionWith(TIGHT) } },
      elements: [{ categoryName: 'goal', data: { id: 'G1', name: 'g', statement: 'x' } }],
    },
  ]);

  it('gives each library its own view, while catalog.registry stays the flat merged one', () => {
    const c = catalog();
    expect(c.getRegistryForSource('@org').getByName('decision')?.mapping_rules).toEqual(LOOSE);
    expect(c.getRegistryForSource('@local').getByName('decision')?.mapping_rules).toEqual(TIGHT);
    // DEC-2.1 descendant-wins merged view — unchanged, still the right answer
    // for library-wide questions with no owning element.
    expect(c.registry.getByName('decision')?.mapping_rules).toEqual(TIGHT);
  });

  it('memoizes per source rather than per element', () => {
    const c = catalog();
    expect(c.getRegistryForSource('@org')).toBe(c.getRegistryForSource('@org'));
  });

  it('falls back to the merged registry for an unknown source', () => {
    const c = catalog();
    expect(c.getRegistryForSource('@nope')).toBe(c.registry);
  });

  it('categoryFor keys off the element, not the category name alone', () => {
    const c = catalog();
    const org = c.getAllElements().find(e => e.id === 'OG1')!;
    const local = c.getAllElements().find(e => e.id === 'G1')!;
    expect(c.categoryFor(org)).toBe(c.getRegistryForSource('@org').getByName('goal'));
    expect(c.categoryFor(local)).toBe(c.getRegistryForSource('@local').getByName('goal'));
  });
});
