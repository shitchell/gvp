import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import { getRegistryRoot, getProjectsDir, getLibrariesDir } from '../../src/registry/paths.js';

describe('registry paths', () => {
  let original: string | undefined;
  beforeEach(() => { original = process.env.GVP_REGISTRY_ROOT; });
  afterEach(() => {
    if (original === undefined) delete process.env.GVP_REGISTRY_ROOT;
    else process.env.GVP_REGISTRY_ROOT = original;
  });

  it('honors GVP_REGISTRY_ROOT as the ROOT, not the by-id dir', () => {
    process.env.GVP_REGISTRY_ROOT = '/tmp/reg';
    expect(getRegistryRoot()).toBe('/tmp/reg');
    expect(getProjectsDir()).toBe(path.join('/tmp/reg', 'by-id'));
    expect(getLibrariesDir()).toBe(path.join('/tmp/reg', 'libraries'));
  });

  it('defaults to ~/.gvp/registry when unset', () => {
    delete process.env.GVP_REGISTRY_ROOT;
    const home = process.env.HOME || process.env.USERPROFILE || '';
    expect(getRegistryRoot()).toBe(path.join(home, '.gvp', 'registry'));
  });

  it('treats an empty GVP_REGISTRY_ROOT as unset', () => {
    process.env.GVP_REGISTRY_ROOT = '';
    const home = process.env.HOME || process.env.USERPROFILE || '';
    expect(getRegistryRoot()).toBe(path.join(home, '.gvp', 'registry'));
  });
});
