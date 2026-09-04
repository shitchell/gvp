import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import { getRegistryRoot, getProjectsDir, getLibrariesDir } from '../../src/registry/paths.js';

describe('registry paths', () => {
  let original: string | undefined;
  let originalHome: string | undefined;
  beforeEach(() => {
    original = process.env.GVP_REGISTRY_ROOT;
    originalHome = process.env.HOME;
    // Pin HOME so the default-branch assertions state the INTENT rather
    // than restating the implementation's own expression — otherwise they
    // degenerate to a tautology wherever HOME and USERPROFILE are unset.
    process.env.HOME = '/home/testuser';
  });
  afterEach(() => {
    if (original === undefined) delete process.env.GVP_REGISTRY_ROOT;
    else process.env.GVP_REGISTRY_ROOT = original;
    if (originalHome === undefined) delete process.env.HOME;
    else process.env.HOME = originalHome;
  });

  it('honors GVP_REGISTRY_ROOT as the ROOT, not the by-id dir', () => {
    process.env.GVP_REGISTRY_ROOT = '/tmp/reg';
    expect(getRegistryRoot()).toBe('/tmp/reg');
    expect(getProjectsDir()).toBe(path.join('/tmp/reg', 'by-id'));
    expect(getLibrariesDir()).toBe(path.join('/tmp/reg', 'libraries'));
  });

  it('defaults to ~/.gvp/registry when unset', () => {
    delete process.env.GVP_REGISTRY_ROOT;
    expect(getRegistryRoot()).toBe('/home/testuser/.gvp/registry');
  });

  it('treats an empty GVP_REGISTRY_ROOT as unset', () => {
    process.env.GVP_REGISTRY_ROOT = '';
    expect(getRegistryRoot()).toBe('/home/testuser/.gvp/registry');
  });

  it('never yields a relative path when HOME is unset', () => {
    // `|| ''` would make path.join return `.gvp/registry`, so recording
    // would write into the cwd. D43 makes this reachable on every call.
    delete process.env.GVP_REGISTRY_ROOT;
    delete process.env.HOME;
    expect(path.isAbsolute(getRegistryRoot())).toBe(true);
  });

  it('normalizes a trailing slash in the override', () => {
    process.env.GVP_REGISTRY_ROOT = '/tmp/reg/';
    expect(getRegistryRoot()).toBe('/tmp/reg');
    expect(path.dirname(getProjectsDir())).toBe(getRegistryRoot());
  });

  // An assertion used to sit here pinning the deprecated src/config/registry
  // alias equal to getProjectsDir() through the mid-plan migration. Task 14
  // deleted that alias and moved every caller onto getProjectsDir(), so the
  // assertion had nothing left to guard.
});
