import { describe, it, expect } from 'vitest';
import * as fs from 'fs';

/**
 * D56 is a decision about DOCUMENTED SEMANTICS, so its implementation is
 * prose. These tests are the only thing that keeps that prose honest.
 *
 * They deliberately assert on meaning-bearing phrases rather than exact
 * wording — a README can be reworded freely, but it must not stop saying
 * that deletion is safe AND that rebuilding is lossy. D22 argued
 * "registry, not cache" precisely because "cache" implies the tool
 * rebuilds; #15 required "always safe to delete". Both halves are true and
 * the docs must carry both, or the next reader inherits one of them.
 */
describe('registry documentation (D56)', () => {
  const readme = () => fs.readFileSync('README.md', 'utf-8');

  it('documents the registry location and the enumerate command', () => {
    const r = readme();
    expect(r).toMatch(/~\/\.gvp\/registry/);
    expect(r).toMatch(/cairn libs list/);
    expect(r).toMatch(/GVP_REGISTRY_ROOT/);
  });

  it('states BOTH halves — deleting is safe, rebuilding is lossy (D56)', () => {
    const r = readme().toLowerCase();
    expect(r).toMatch(/safe to delete/);
    expect(r).toMatch(/not automatic|lossy|only when cairn next/);
  });

  it('documents the opt-out', () => {
    expect(readme()).toMatch(/--no-registry|registry\.enabled/);
  });

  it('names both opt-out surfaces, and no third one', () => {
    // D43 names exactly two. An env var was drafted and deliberately
    // removed during planning; documenting a third surface would put the
    // docs ahead of the decision.
    const r = readme();
    expect(r).toMatch(/registry\.enabled: false/);
    expect(r).toMatch(/--no-registry/);
    expect(r).not.toMatch(/GVP_NO_REGISTRY/);
  });

  it('says search covers decision rationale, not just names and statements', () => {
    // The failure #15 was filed about: a search that cannot match a
    // decision's rationale cannot find the content that went missing.
    expect(readme().toLowerCase()).toMatch(/rationale/);
  });
});
