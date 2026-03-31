import { describe, it, expect } from 'vitest';
import { buildAliasMap, resolveAlias, type AliasMap } from '../../src/inheritance/alias-resolver.js';
import type { DocumentMeta } from '../../src/model/document-meta.js';

describe('Alias Resolver (DEC-1.1a)', () => {
  describe('buildAliasMap', () => {
    it('returns empty map for no inherits', () => {
      const meta: DocumentMeta = {};
      const aliases = buildAliasMap(meta);
      expect(aliases.size).toBe(0);
    });

    it('returns empty map for string-only inherits', () => {
      const meta: DocumentMeta = { inherits: ['parent-doc'] };
      const aliases = buildAliasMap(meta);
      expect(aliases.size).toBe(0);
    });

    it('extracts aliases from object-form inherits', () => {
      const meta: DocumentMeta = {
        inherits: [
          { source: '@github:company/org-gvp', as: 'org' },
        ],
      };
      const aliases = buildAliasMap(meta);
      expect(aliases.get('org')).toBe('@github:company/org-gvp');
    });

    it('handles mixed string and object inherits', () => {
      const meta: DocumentMeta = {
        inherits: [
          'local-doc',
          { source: '@github:company/org-gvp', as: 'org' },
          { source: '@github:personal/my-gvp', as: 'personal' },
        ],
      };
      const aliases = buildAliasMap(meta);
      expect(aliases.size).toBe(2);
      expect(aliases.get('org')).toBe('@github:company/org-gvp');
      expect(aliases.get('personal')).toBe('@github:personal/my-gvp');
    });

    it('inherits parent aliases', () => {
      const parentAliases: AliasMap = new Map([
        ['org', '@github:company/org-gvp'],
      ]);
      const meta: DocumentMeta = {};
      const aliases = buildAliasMap(meta, parentAliases);
      expect(aliases.get('org')).toBe('@github:company/org-gvp');
    });

    it('descendant wins on conflict (DEC-1.1a)', () => {
      const parentAliases: AliasMap = new Map([
        ['org', '@github:company/old-gvp'],
      ]);
      const meta: DocumentMeta = {
        inherits: [
          { source: '@github:company/new-gvp', as: 'org' },
        ],
      };
      const aliases = buildAliasMap(meta, parentAliases);
      expect(aliases.get('org')).toBe('@github:company/new-gvp');
    });

    it('preserves non-conflicting parent aliases', () => {
      const parentAliases: AliasMap = new Map([
        ['org', '@github:company/org-gvp'],
      ]);
      const meta: DocumentMeta = {
        inherits: [
          { source: '@github:personal/my-gvp', as: 'personal' },
        ],
      };
      const aliases = buildAliasMap(meta, parentAliases);
      expect(aliases.get('org')).toBe('@github:company/org-gvp');
      expect(aliases.get('personal')).toBe('@github:personal/my-gvp');
    });

    it('skips object entries without as field', () => {
      const meta: DocumentMeta = {
        inherits: [
          { source: '@github:company/org-gvp' },
        ],
      };
      const aliases = buildAliasMap(meta);
      expect(aliases.size).toBe(0);
    });
  });

  describe('resolveAlias', () => {
    const aliases: AliasMap = new Map([
      ['org', '@github:company/org-gvp'],
      ['personal', '@github:me/my-gvp'],
    ]);

    it('resolves known alias', () => {
      expect(resolveAlias('org', aliases)).toBe('@github:company/org-gvp');
    });

    it('returns source as-is for unknown alias', () => {
      expect(resolveAlias('@github:other/repo', aliases)).toBe('@github:other/repo');
    });

    it('returns source as-is for empty alias map', () => {
      expect(resolveAlias('org', new Map())).toBe('org');
    });
  });
});
