import { describe, it, expect } from 'vitest';
import { Catalog } from '../../src/catalog/catalog.js';
import { Document } from '../../src/model/document.js';
import { Element } from '../../src/model/element.js';
import type { DocumentMeta } from '../../src/model/document-meta.js';
import type { ResolvedInheritance } from '../../src/inheritance/inheritance-resolver.js';
import type { GVPConfig } from '../../src/config/schema.js';
import type { CategoryDefinition } from '../../src/schema/category-definition.js';
import {
  createDiagnostic,
  runValidation,
  hasErrors,
  builtinPasses,
} from '../../src/validation/index.js';
import type { Diagnostic, ValidationPass } from '../../src/validation/index.js';
import { structuralPass } from '../../src/validation/passes/structural-pass.js';
import { semanticPass } from '../../src/validation/passes/semantic-pass.js';

/** Default minimal config */
const defaultConfig: GVPConfig = {
  strict: false,
  suppress_diagnostics: [],
  strict_export_options: true,
  validation_rules: [],
};

/** Helper: create a Document with optional elements and definitions */
function makeDoc(
  documentPath: string,
  opts: {
    source?: string;
    inherits?: DocumentMeta['inherits'];
    elements?: Array<{ categoryName: string; data: Record<string, unknown> }>;
    definitions?: DocumentMeta['definitions'];
  } = {},
): Document {
  const source = opts.source ?? '@local';
  const meta: DocumentMeta = {
    name: documentPath,
    ...(opts.inherits ? { inherits: opts.inherits } : {}),
    ...(opts.definitions ? { definitions: opts.definitions } : {}),
  };

  const elementsByCategory = new Map<string, Element[]>();
  if (opts.elements) {
    for (const el of opts.elements) {
      const element = new Element(el.data, el.categoryName, source, documentPath);
      const existing = elementsByCategory.get(el.categoryName) ?? [];
      existing.push(element);
      elementsByCategory.set(el.categoryName, existing);
    }
  }

  return new Document(
    meta,
    elementsByCategory,
    `/${documentPath}.yaml`,
    documentPath,
    source,
  );
}

/** Helper: build ResolvedInheritance for a single document (no inheritance) */
function singleDocResolved(doc: Document): ResolvedInheritance {
  return {
    orderedDocuments: [doc],
    aliasMap: new Map(),
    sccs: [],
  };
}

/** Helper: build ResolvedInheritance for multiple documents */
function multiDocResolved(docs: Document[]): ResolvedInheritance {
  return {
    orderedDocuments: docs,
    aliasMap: new Map(),
    sccs: [],
  };
}

/** Helper: build a Catalog from documents */
function makeCatalog(docs: Document[], config: GVPConfig = defaultConfig): Catalog {
  if (docs.length === 1) {
    return new Catalog(singleDocResolved(docs[0]!), config);
  }
  return new Catalog(multiDocResolved(docs), config);
}

describe('Diagnostic creation', () => {
  it('creates a diagnostic with all fields', () => {
    const d = createDiagnostic(
      'W001',
      'EMPTY_DOCUMENT',
      'Document has no active elements',
      'warning',
      'semantic',
      { documentPath: 'main' },
    );
    expect(d.code).toBe('W001');
    expect(d.name).toBe('EMPTY_DOCUMENT');
    expect(d.description).toBe('Document has no active elements');
    expect(d.severity).toBe('warning');
    expect(d.pass).toBe('semantic');
    expect(d.context.documentPath).toBe('main');
  });

  it('defaults context to empty object', () => {
    const d = createDiagnostic('E001', 'TEST', 'desc', 'error', 'structural');
    expect(d.context).toEqual({});
  });
});

describe('runValidation', () => {
  it('collects diagnostics from all passes', () => {
    const pass1: ValidationPass = () => [
      createDiagnostic('W001', 'A', 'a', 'warning', 'p1'),
    ];
    const pass2: ValidationPass = () => [
      createDiagnostic('E001', 'B', 'b', 'error', 'p2'),
    ];
    const passes = new Map<string, ValidationPass>([
      ['p1', pass1],
      ['p2', pass2],
    ]);

    const doc = makeDoc('main', {
      elements: [
        { categoryName: 'goal', data: { id: 'G1', name: 'G', status: 'active' } },
      ],
    });
    const catalog = makeCatalog([doc]);
    const results = runValidation(catalog, defaultConfig, passes);

    expect(results).toHaveLength(2);
    expect(results[0]!.code).toBe('W001');
    expect(results[1]!.code).toBe('E001');
  });

  it('suppresses matching diagnostic codes (exact-match, DEC-5.11)', () => {
    const pass1: ValidationPass = () => [
      createDiagnostic('W001', 'A', 'a', 'warning', 'p1'),
      createDiagnostic('W002', 'B', 'b', 'warning', 'p1'),
    ];
    const passes = new Map<string, ValidationPass>([['p1', pass1]]);

    const doc = makeDoc('main', {
      elements: [
        { categoryName: 'goal', data: { id: 'G1', name: 'G', status: 'active' } },
      ],
    });
    const catalog = makeCatalog([doc]);
    const config: GVPConfig = {
      ...defaultConfig,
      suppress_diagnostics: ['W001'],
    };
    const results = runValidation(catalog, config, passes);

    expect(results).toHaveLength(1);
    expect(results[0]!.code).toBe('W002');
  });

  it('strict mode promotes warnings to errors', () => {
    const pass1: ValidationPass = () => [
      createDiagnostic('W001', 'A', 'a', 'warning', 'p1'),
      createDiagnostic('E001', 'B', 'b', 'error', 'p1'),
    ];
    const passes = new Map<string, ValidationPass>([['p1', pass1]]);

    const doc = makeDoc('main', {
      elements: [
        { categoryName: 'goal', data: { id: 'G1', name: 'G', status: 'active' } },
      ],
    });
    const catalog = makeCatalog([doc]);
    const config: GVPConfig = { ...defaultConfig, strict: true };
    const results = runValidation(catalog, config, passes);

    expect(results).toHaveLength(2);
    expect(results[0]!.severity).toBe('error'); // promoted
    expect(results[1]!.severity).toBe('error'); // already error
  });

  it('suppression wins over strict mode (DEC-5.8)', () => {
    const pass1: ValidationPass = () => [
      createDiagnostic('W001', 'A', 'a', 'warning', 'p1'),
      createDiagnostic('W002', 'B', 'b', 'warning', 'p1'),
    ];
    const passes = new Map<string, ValidationPass>([['p1', pass1]]);

    const doc = makeDoc('main', {
      elements: [
        { categoryName: 'goal', data: { id: 'G1', name: 'G', status: 'active' } },
      ],
    });
    const catalog = makeCatalog([doc]);
    const config: GVPConfig = {
      ...defaultConfig,
      strict: true,
      suppress_diagnostics: ['W001'],
    };
    const results = runValidation(catalog, config, passes);

    // W001 suppressed (even though strict would promote it), W002 promoted
    expect(results).toHaveLength(1);
    expect(results[0]!.code).toBe('W002');
    expect(results[0]!.severity).toBe('error');
  });

  it('runs only selected passes by name', () => {
    const pass1: ValidationPass = () => [
      createDiagnostic('W001', 'A', 'a', 'warning', 'p1'),
    ];
    const pass2: ValidationPass = () => [
      createDiagnostic('E001', 'B', 'b', 'error', 'p2'),
    ];
    const passes = new Map<string, ValidationPass>([
      ['p1', pass1],
      ['p2', pass2],
    ]);

    const doc = makeDoc('main', {
      elements: [
        { categoryName: 'goal', data: { id: 'G1', name: 'G', status: 'active' } },
      ],
    });
    const catalog = makeCatalog([doc]);
    const results = runValidation(catalog, defaultConfig, passes, ['p2']);

    expect(results).toHaveLength(1);
    expect(results[0]!.code).toBe('E001');
  });
});

describe('hasErrors', () => {
  it('returns true when errors present', () => {
    const diagnostics: Diagnostic[] = [
      createDiagnostic('E001', 'A', 'a', 'error', 'p1'),
    ];
    expect(hasErrors(diagnostics)).toBe(true);
  });

  it('returns false for warnings only', () => {
    const diagnostics: Diagnostic[] = [
      createDiagnostic('W001', 'A', 'a', 'warning', 'p1'),
    ];
    expect(hasErrors(diagnostics)).toBe(false);
  });

  it('returns false for empty list', () => {
    expect(hasErrors([])).toBe(false);
  });
});

describe('structuralPass', () => {
  it('catches broken maps_to references (E001)', () => {
    const doc = makeDoc('main', {
      elements: [
        { categoryName: 'goal', data: { id: 'G1', name: 'Goal', status: 'active' } },
        {
          categoryName: 'value',
          data: {
            id: 'V1',
            name: 'Value',
            status: 'active',
            maps_to: ['main:G1', 'main:NONEXISTENT'],
          },
        },
      ],
    });
    const catalog = makeCatalog([doc]);
    const results = structuralPass(catalog, defaultConfig);

    expect(results).toHaveLength(1);
    expect(results[0]!.code).toBe('E001');
    expect(results[0]!.severity).toBe('error');
    expect(results[0]!.description).toContain('NONEXISTENT');
  });

  it('passes when all references are valid', () => {
    const doc = makeDoc('main', {
      elements: [
        { categoryName: 'goal', data: { id: 'G1', name: 'Goal', status: 'active' } },
        {
          categoryName: 'value',
          data: {
            id: 'V1',
            name: 'Value',
            status: 'active',
            maps_to: ['main:G1'],
          },
        },
      ],
    });
    const catalog = makeCatalog([doc]);
    const results = structuralPass(catalog, defaultConfig);

    expect(results).toHaveLength(0);
  });
});

describe('semanticPass', () => {
  it('catches empty documents (W001)', () => {
    const doc = makeDoc('empty');
    const catalog = makeCatalog([doc]);
    const results = semanticPass(catalog, defaultConfig);

    const w001 = results.filter(d => d.code === 'W001');
    expect(w001).toHaveLength(1);
    expect(w001[0]!.context.documentPath).toBe('empty');
  });

  it('does not fire W001 for documents with active elements', () => {
    const doc = makeDoc('main', {
      elements: [
        { categoryName: 'goal', data: { id: 'G1', name: 'Goal', status: 'active' } },
      ],
    });
    const catalog = makeCatalog([doc]);
    const results = semanticPass(catalog, defaultConfig);

    const w001 = results.filter(d => d.code === 'W001');
    expect(w001).toHaveLength(0);
  });

  it('catches self-document-only mapping (W005)', () => {
    const doc = makeDoc('main', {
      elements: [
        { categoryName: 'goal', data: { id: 'G1', name: 'Goal', status: 'active' } },
        {
          categoryName: 'principle',
          data: {
            id: 'P1',
            name: 'Principle',
            status: 'active',
            maps_to: ['main:G1'],
          },
        },
      ],
    });
    const catalog = makeCatalog([doc]);
    const results = semanticPass(catalog, defaultConfig);

    const w005 = results.filter(d => d.code === 'W005');
    expect(w005).toHaveLength(1);
    expect(w005[0]!.context.elementId).toBe('P1');
  });

  it('does not fire W005 for root elements', () => {
    const doc = makeDoc('main', {
      elements: [
        {
          categoryName: 'goal',
          data: {
            id: 'G1',
            name: 'Goal',
            status: 'active',
            maps_to: ['main:G2'],
          },
        },
        { categoryName: 'goal', data: { id: 'G2', name: 'Goal 2', status: 'active' } },
      ],
    });
    const catalog = makeCatalog([doc]);
    const results = semanticPass(catalog, defaultConfig);

    const w005 = results.filter(d => d.code === 'W005');
    expect(w005).toHaveLength(0);
  });

  it('does not fire W005 for elements with no maps_to', () => {
    const doc = makeDoc('main', {
      elements: [
        { categoryName: 'principle', data: { id: 'P1', name: 'Principle', status: 'active' } },
      ],
    });
    const catalog = makeCatalog([doc]);
    const results = semanticPass(catalog, defaultConfig);

    const w005 = results.filter(d => d.code === 'W005');
    expect(w005).toHaveLength(0);
  });
});

describe('builtinPasses', () => {
  it('has 5 canonical passes in order (DEC-5.9)', () => {
    const names = [...builtinPasses.keys()];
    expect(names).toEqual(['schema', 'structural', 'traceability', 'semantic', 'user_rules']);
  });
});
