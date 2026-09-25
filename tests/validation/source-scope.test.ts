import { describe, it, expect } from 'vitest';
import { Catalog } from '../../src/catalog/catalog.js';
import { Document } from '../../src/model/document.js';
import { Element } from '../../src/model/element.js';
import type { DocumentMeta } from '../../src/model/document-meta.js';
import type { ResolvedInheritance } from '../../src/inheritance/inheritance-resolver.js';
import { configSchema, type GVPConfig } from '../../src/config/schema.js';
import { createDiagnostic, runValidation } from '../../src/validation/index.js';
import type { Diagnostic, ValidationPass } from '../../src/validation/index.js';
import {
  applySourceScope,
  renderSourceScopeSummary,
  resolveSourceVisibility,
  bareSourceName,
} from '../../src/validation/source-scope.js';

/**
 * Source-scoped diagnostic display (#29).
 *
 * The problem: a project inheriting a library gets that library's
 * diagnostics reported against it. They are the upstream author's defects,
 * unfixable from the consuming repo, and they bury local signal (47 of them
 * against 94 local ones, measured in #29).
 *
 * The constraint that shapes the tests: `hide` must still leave a trace.
 * A blanket `suppress_diagnostics` left none, and that is how 23 instances
 * of one authoring habit accreted unseen in gvp-docs for three months. So
 * "hide emits nothing at all" is a REGRESSION, not an optimisation, and
 * there is a test asserting exactly that.
 */

const LOCAL = '@local';
const UPSTREAM = '@github:shitchell/gvp-docs@v0.7.0';
const OTHER = '@github:shitchell/other-lib@v1.0.0';

function baseConfig(overrides: Record<string, unknown> = {}): GVPConfig {
  return configSchema.parse(overrides);
}

function makeDoc(
  documentPath: string,
  source: string,
  elementIds: string[] = [],
): Document {
  const meta: DocumentMeta = { name: documentPath };
  const elementsByCategory = new Map<string, Element[]>();
  const els = elementIds.map(
    (id) => new Element({ id, name: id, status: 'active' }, 'goal', source, documentPath),
  );
  if (els.length > 0) elementsByCategory.set('goal', els);
  return new Document(meta, elementsByCategory, `/${documentPath}.yaml`, documentPath, source);
}

function makeCatalog(docs: Document[], config: GVPConfig = baseConfig()): Catalog {
  const resolved: ResolvedInheritance = {
    orderedDocuments: docs,
    aliasMap: new Map(),
    sccs: [],
  };
  return new Catalog(resolved, config);
}

function warn(code: string, documentPath: string, elementId?: string): Diagnostic {
  return createDiagnostic(code, code, `${code} on ${documentPath}`, 'warning', 'semantic', {
    documentPath,
    ...(elementId ? { elementId } : {}),
  });
}

function err(code: string, documentPath: string): Diagnostic {
  return createDiagnostic(code, code, `${code} on ${documentPath}`, 'error', 'structural', {
    documentPath,
  });
}

/** The measured shape from #29: one local doc, one inherited source. */
function inheritedFixture() {
  return makeCatalog([
    makeDoc('gvp', LOCAL, ['G1']),
    makeDoc('personal', UPSTREAM, ['P11']),
    makeDoc('code/web', UPSTREAM, ['CW1']),
  ]);
}

describe('bareSourceName', () => {
  it('strips the commit-ish from a remote source', () => {
    expect(bareSourceName('@github:shitchell/gvp-docs@v0.7.0')).toBe(
      '@github:shitchell/gvp-docs',
    );
    expect(bareSourceName('@gitlab:org/sub/repo@abc1234')).toBe('@gitlab:org/sub/repo');
  });

  it('returns undefined for non-remote sources (nothing to strip)', () => {
    expect(bareSourceName('@local')).toBeUndefined();
    expect(bareSourceName('../sibling-lib')).toBeUndefined();
    expect(bareSourceName('/abs/path/to/lib')).toBeUndefined();
  });
});

describe('resolveSourceVisibility', () => {
  const cfg = (o: Record<string, unknown>) => baseConfig({ diagnostics: o }).diagnostics;

  it('defaults local to show and inherited to count', () => {
    const c = cfg({});
    expect(resolveSourceVisibility(LOCAL, LOCAL, c)).toBe('show');
    expect(resolveSourceVisibility(UPSTREAM, LOCAL, c)).toBe('count');
  });

  it('`inherited` never reaches the local library', () => {
    const c = cfg({ inherited: 'hide' });
    expect(resolveSourceVisibility(LOCAL, LOCAL, c)).toBe('show');
    expect(resolveSourceVisibility(UPSTREAM, LOCAL, c)).toBe('hide');
  });

  it('honours a custom config.source as local', () => {
    const c = cfg({ inherited: 'hide' });
    expect(resolveSourceVisibility('@github:me/mine@v1', '@github:me/mine@v1', c)).toBe('show');
  });

  it('by_source beats the blanket inherited setting', () => {
    const c = cfg({ inherited: 'hide', by_source: { [UPSTREAM]: 'show' } });
    expect(resolveSourceVisibility(UPSTREAM, LOCAL, c)).toBe('show');
    expect(resolveSourceVisibility(OTHER, LOCAL, c)).toBe('hide');
  });

  it('a version-stripped by_source key survives a pin bump', () => {
    const c = cfg({ by_source: { '@github:shitchell/gvp-docs': 'hide' } });
    expect(resolveSourceVisibility(UPSTREAM, LOCAL, c)).toBe('hide');
    expect(resolveSourceVisibility('@github:shitchell/gvp-docs@v9.9.9', LOCAL, c)).toBe('hide');
  });

  it('an exact key beats the version-stripped one', () => {
    const c = cfg({
      by_source: {
        '@github:shitchell/gvp-docs': 'hide',
        [UPSTREAM]: 'count',
      },
    });
    expect(resolveSourceVisibility(UPSTREAM, LOCAL, c)).toBe('count');
  });

  it('by_source can scope the local library when named explicitly', () => {
    const c = cfg({ by_source: { [LOCAL]: 'count' } });
    expect(resolveSourceVisibility(LOCAL, LOCAL, c)).toBe('count');
  });
});

describe('applySourceScope — the three states', () => {
  const diagnostics = [
    warn('W005', 'gvp', 'G1'),
    warn('W005', 'personal', 'P11'),
    warn('W005', 'personal', 'P11'),
    warn('W003', 'code/web', 'CW1'),
  ];

  it('show: every diagnostic is printed, nothing is summarised', () => {
    const r = applySourceScope(
      diagnostics,
      inheritedFixture(),
      baseConfig({ diagnostics: { inherited: 'show' } }),
    );
    expect(r.shown).toHaveLength(4);
    expect(r.counted).toHaveLength(0);
    expect(r.hiddenSources).toHaveLength(0);
    expect(renderSourceScopeSummary(r)).toEqual([]);
  });

  it('count: local shown, inherited rolled up with codes and totals', () => {
    const r = applySourceScope(diagnostics, inheritedFixture(), baseConfig());
    expect(r.shown).toHaveLength(1);
    expect(r.shown[0]!.context.documentPath).toBe('gvp');
    expect(r.counted).toHaveLength(1);
    expect(r.counted[0]).toMatchObject({
      source: UPSTREAM,
      errors: 0,
      warnings: 3,
      byCode: [
        ['W005', 2],
        ['W003', 1],
      ],
    });
    expect(renderSourceScopeSummary(r)).toEqual([
      `  3 further warnings from ${UPSTREAM} (W005 ×2, W003 ×1)`,
      '  → --include-inherited to show',
    ]);
  });

  it('hide: no codes, no counts — but a trace line survives', () => {
    const r = applySourceScope(
      diagnostics,
      inheritedFixture(),
      baseConfig({ diagnostics: { inherited: 'hide' } }),
    );
    expect(r.shown).toHaveLength(1);
    expect(r.counted).toHaveLength(0);
    expect(r.hiddenSources).toEqual([UPSTREAM]);

    const lines = renderSourceScopeSummary(r);
    // The load-bearing assertion of this whole feature (gvp:P9 — hide what
    // is not needed, never LOSE it). If this ever renders [] the feature has
    // degraded into suppress_diagnostics.
    expect(lines.length).toBeGreaterThan(0);
    expect(lines[0]).toBe('  1 source fully hidden');
    // ...and it leaks neither codes nor diagnostic counts.
    expect(lines.join('\n')).not.toMatch(/W\d{3}/);
    expect(lines.join('\n')).not.toMatch(/\d+ (further )?(warning|error)/);
  });

  it('hide leaves no trace when nothing was actually withheld', () => {
    const r = applySourceScope(
      [warn('W005', 'gvp', 'G1')],
      inheritedFixture(),
      baseConfig({ diagnostics: { inherited: 'hide' } }),
    );
    expect(r.hiddenSources).toEqual([]);
    expect(renderSourceScopeSummary(r)).toEqual([]);
  });

  it('counts sources separately and pluralises the hide trace', () => {
    const catalog = makeCatalog([
      makeDoc('gvp', LOCAL, ['G1']),
      makeDoc('personal', UPSTREAM, ['P11']),
      makeDoc('other', OTHER, ['O1']),
    ]);
    const r = applySourceScope(
      [warn('W005', 'personal', 'P11'), warn('W003', 'other', 'O1')],
      catalog,
      baseConfig({ diagnostics: { inherited: 'hide' } }),
    );
    expect(r.hiddenSources).toEqual([UPSTREAM, OTHER].sort());
    expect(renderSourceScopeSummary(r)[0]).toBe('  2 sources fully hidden');
  });

  it('per-source config mixes states in one run', () => {
    const catalog = makeCatalog([
      makeDoc('gvp', LOCAL, ['G1']),
      makeDoc('personal', UPSTREAM, ['P11']),
      makeDoc('other', OTHER, ['O1']),
    ]);
    const r = applySourceScope(
      [
        warn('W005', 'gvp', 'G1'),
        warn('W005', 'personal', 'P11'),
        warn('W003', 'other', 'O1'),
      ],
      catalog,
      baseConfig({
        diagnostics: { inherited: 'count', by_source: { [OTHER]: 'hide' } },
      }),
    );
    expect(r.shown).toHaveLength(1);
    expect(r.counted.map((c) => c.source)).toEqual([UPSTREAM]);
    expect(r.hiddenSources).toEqual([OTHER]);
    expect(renderSourceScopeSummary(r)).toEqual([
      `  1 further warning from ${UPSTREAM} (W005 ×1)`,
      '  1 source fully hidden',
      '  → --include-inherited to show',
    ]);
  });
});

describe('applySourceScope — what is never scoped', () => {
  it('a local-only project is untouched in every state', () => {
    const catalog = makeCatalog([makeDoc('gvp', LOCAL, ['G1']), makeDoc('v0', LOCAL, ['V1'])]);
    const ds = [warn('W005', 'gvp', 'G1'), warn('W003', 'v0', 'V1'), err('E001', 'gvp')];
    for (const mode of ['show', 'count', 'hide'] as const) {
      const r = applySourceScope(ds, catalog, baseConfig({ diagnostics: { inherited: mode } }));
      expect(r.shown).toEqual(ds);
      expect(r.counted).toEqual([]);
      expect(r.hiddenSources).toEqual([]);
      expect(renderSourceScopeSummary(r)).toEqual([]);
    }
  });

  it('genuine errors on inherited elements are always shown', () => {
    const r = applySourceScope(
      [err('E001', 'personal'), warn('W005', 'personal', 'P11')],
      inheritedFixture(),
      baseConfig({ diagnostics: { inherited: 'hide' } }),
    );
    expect(r.shown).toHaveLength(1);
    expect(r.shown[0]!.code).toBe('E001');
    expect(r.hiddenSources).toEqual([UPSTREAM]);
  });

  it('library-wide diagnostics with no documentPath are always shown', () => {
    const d = createDiagnostic('W900', 'X', 'library-wide', 'warning', 'structural', {});
    const r = applySourceScope(
      [d],
      inheritedFixture(),
      baseConfig({ diagnostics: { inherited: 'hide' } }),
    );
    expect(r.shown).toEqual([d]);
    expect(r.hiddenSources).toEqual([]);
  });

  it('an unresolvable documentPath is shown rather than guessed at', () => {
    const r = applySourceScope(
      [warn('W005', 'does-not-exist', 'X1')],
      inheritedFixture(),
      baseConfig({ diagnostics: { inherited: 'hide' } }),
    );
    expect(r.shown).toHaveLength(1);
    expect(r.hiddenSources).toEqual([]);
  });
});

describe('applySourceScope — documentPath collisions across sources', () => {
  /**
   * documentPath is not globally unique (element identity is
   * source:documentPath:id). Two libraries may both hold a `shared` doc.
   */
  const catalog = makeCatalog([
    makeDoc('shared', LOCAL, ['A1']),
    makeDoc('shared', UPSTREAM, ['B1']),
  ]);
  const cfg = baseConfig({ diagnostics: { inherited: 'hide' } });

  it('disambiguates a collided documentPath via elementId', () => {
    const r = applySourceScope(
      [warn('W005', 'shared', 'A1'), warn('W005', 'shared', 'B1')],
      catalog,
      cfg,
    );
    expect(r.shown).toHaveLength(1);
    expect(r.shown[0]!.context.elementId).toBe('A1');
    expect(r.hiddenSources).toEqual([UPSTREAM]);
  });

  it('shows the diagnostic when elementId cannot settle it', () => {
    const r = applySourceScope([warn('W005', 'shared')], catalog, cfg);
    expect(r.shown).toHaveLength(1);
    expect(r.hiddenSources).toEqual([]);
  });

  it('shows the diagnostic when the elementId itself collides', () => {
    const clash = makeCatalog([
      makeDoc('shared', LOCAL, ['X1']),
      makeDoc('shared', UPSTREAM, ['X1']),
    ]);
    const r = applySourceScope([warn('W005', 'shared', 'X1')], clash, cfg);
    expect(r.shown).toHaveLength(1);
    expect(r.hiddenSources).toEqual([]);
  });
});

describe('applySourceScope — strict mode', () => {
  /**
   * `strict: true` rewrites every warning to an error before validate sees
   * it. Without the `strictPromoted` stamp, source scoping would go inert
   * for exactly the users who opted into the loudest setting.
   */
  const passes = new Map<string, ValidationPass>([
    [
      'p',
      () => [warn('W005', 'gvp', 'G1'), warn('W005', 'personal', 'P11'), err('E001', 'personal')],
    ],
  ]);

  it('scopes strict-promoted warnings but not genuine errors', () => {
    const config = baseConfig({ strict: true, diagnostics: { inherited: 'count' } });
    const catalog = inheritedFixture();
    const diagnostics = runValidation(catalog, config, passes, ['p']);
    expect(diagnostics.every((d) => d.severity === 'error')).toBe(true);

    const r = applySourceScope(diagnostics, catalog, config);
    expect(r.shown.map((d) => d.code).sort()).toEqual(['E001', 'W005']);
    expect(r.shown.find((d) => d.code === 'W005')!.context.documentPath).toBe('gvp');
    expect(r.counted).toHaveLength(1);
    expect(r.counted[0]).toMatchObject({ source: UPSTREAM, errors: 1, warnings: 0 });
    expect(renderSourceScopeSummary(r)[0]).toBe(
      `  1 further error from ${UPSTREAM} (W005 ×1)`,
    );
  });

  it('runValidation stamps promoted warnings and leaves real errors alone', () => {
    const config = baseConfig({ strict: true });
    const ds = runValidation(inheritedFixture(), config, passes, ['p']);
    expect(ds.filter((d) => d.strictPromoted === true)).toHaveLength(2);
    expect(ds.find((d) => d.code === 'E001')!.strictPromoted).toBeUndefined();
  });

  it('leaves the stamp off entirely when strict is false', () => {
    const ds = runValidation(inheritedFixture(), baseConfig(), passes, ['p']);
    expect(ds.some((d) => d.strictPromoted)).toBe(false);
  });
});

describe('applySourceScope — override', () => {
  it('an explicit override replaces the config block wholesale', () => {
    const config = baseConfig({
      diagnostics: { inherited: 'count', by_source: { [UPSTREAM]: 'hide' } },
    });
    const r = applySourceScope(
      [warn('W005', 'personal', 'P11')],
      inheritedFixture(),
      config,
      { inherited: 'show', by_source: {} },
    );
    expect(r.shown).toHaveLength(1);
    expect(r.hiddenSources).toEqual([]);
  });
});
