import { describe, it, expect } from 'vitest';
import { Element } from '../../src/model/element.js';
import { matchRef, resolveRef, type AliasMap } from '../../src/refs/resolve-ref.js';

/**
 * Unit tests for the reference resolver (DEC-6.4 revised, #11).
 * Grammar: `[<alias>:]<meta.name>:<id>` short form + canonical `source:docPath:id`.
 * Path-based short refs are intentionally not resolved.
 */
function mk(id: string, source: string, documentPath: string, documentName: string): Element {
  return new Element({ id, name: `${id} name`, status: 'active' }, 'value', source, documentPath, documentName);
}

const NO_ALIAS: AliasMap = new Map();

describe('matchRef — library short address (#11)', () => {
  it('resolves bare meta.name:id', () => {
    const els = [mk('V1', '@local', 'root', 'root')];
    expect(resolveRef('root:V1', els, NO_ALIAS)).toBe(els[0]);
  });

  it('resolves by meta.name, with documentPath as a lenient fallback', () => {
    const els = [mk('CP7', '@local', 'code/common', 'code-common')];
    // meta.name form (the stable identity) resolves…
    expect(resolveRef('code-common:CP7', els, NO_ALIAS)).toBe(els[0]);
    // …and the old file-path form still resolves as a fallback (#13/path-fallback).
    expect(resolveRef('code/common:CP7', els, NO_ALIAS)).toBe(els[0]);
  });

  it('meta.name takes precedence over documentPath on collision', () => {
    // Two docs: A's meta.name equals B's documentPath ("shared").
    const a = mk('X1', '@local', 'a-path', 'shared');
    const b = mk('X1', '@local', 'shared', 'b-name');
    // "shared:X1" matches A by meta.name and B by path → name wins.
    expect(resolveRef('shared:X1', [a, b], NO_ALIAS)).toBe(a);
  });

  it('resolves the canonical source:documentPath:id escape hatch', () => {
    const els = [mk('CP7', '@local', 'code/common', 'code-common')];
    expect(resolveRef('@local:code/common:CP7', els, NO_ALIAS)).toBe(els[0]);
  });
});

describe('matchRef — alias selects the library', () => {
  const aliasMap: AliasMap = new Map([['org', '@github:company/org-gvp@v1']]);
  const local = mk('P1', '@local', 'personal', 'personal');
  const inherited = mk('V1', '@github:company/org-gvp@v1', 'values', 'values');
  const els = [local, inherited];

  it('resolves alias:meta.name:id to the aliased source', () => {
    expect(resolveRef('org:values:V1', els, aliasMap)).toBe(inherited);
  });

  it('does not resolve an unknown alias', () => {
    expect(resolveRef('nope:values:V1', els, aliasMap)).toBeUndefined();
  });
});

describe('matchRef — ambiguity + local preference', () => {
  const localP = mk('P1', '@local', 'personal', 'personal');
  const orgP = mk('P1', '@github:o/r@sha', 'personal', 'personal');
  const sharedP = mk('P1', '@gitlab:o/r@sha', 'personal', 'personal');

  it('prefers the local library when a bare name collides across libraries', () => {
    expect(resolveRef('personal:P1', [localP, orgP], NO_ALIAS)).toBe(localP);
  });

  it('reports ambiguous when a bare name matches multiple non-local libraries', () => {
    const res = matchRef('personal:P1', [orgP, sharedP], NO_ALIAS);
    expect(res.status).toBe('ambiguous');
    if (res.status === 'ambiguous') expect(res.matches).toHaveLength(2);
  });

  it('returns notfound for an unknown reference', () => {
    expect(matchRef('nope:X9', [localP], NO_ALIAS).status).toBe('notfound');
  });
});
