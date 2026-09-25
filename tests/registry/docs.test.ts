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

  it('documents one opt-out MECHANISM, and only spellings D43 admits', () => {
    // This test used to assert "exactly two surfaces". D43's 2026-09-25
    // amendment corrected the unit: there has only ever been ONE mechanism,
    // `registry.enabled`, and each named surface is a SPELLING that sets it
    // (a config layer sets it directly; `--no-registry` is applied by
    // parseConfigOptions to the already-loaded config). Counting spellings
    // meant the count had to be broken to admit any new one, including a
    // spelling that strengthens the guarantee — so it now counts mechanisms
    // and enumerates the admitted spellings.
    //
    // The original comment's intent is preserved verbatim in force: an env
    // var was drafted and deliberately removed during planning, and
    // documenting a spelling the decision has not admitted would still put
    // the docs ahead of the decision. That is now enforced by an explicit
    // allow-list rather than by a number.
    const r = readme();

    // Spellings D43 admits AND that have shipped — the README must carry
    // each one, and each must reduce to `registry.enabled`.
    const SHIPPED_SPELLINGS = [
      /registry\.enabled: false/, // config layer
      /--no-registry/, // single invocation
      /meta\.registry\.enabled: false/, // library-scoped declaration (#25)
    ];
    for (const spelling of SHIPPED_SPELLINGS) expect(r).toMatch(spelling);

    // Spellings D43 has never admitted, in any form.
    const UNADMITTED_SPELLINGS = [/GVP_NO_REGISTRY/, /GVP_REGISTRY_DISABLED/];
    for (const spelling of UNADMITTED_SPELLINGS) expect(r).not.toMatch(spelling);
  });

  it('documents the library-scoped spelling WITH its scope (D60)', () => {
    // Documenting `meta.registry.enabled` without saying whose records it
    // governs invites the unscoped reading D60 exists to forbid — that an
    // inherited library switches off its consumer's registry. The spelling
    // and its scope ship together or the docs mislead.
    const r = readme().toLowerCase();
    expect(r).toMatch(/inherit/);
    expect(r).toMatch(/only suppress|cannot re-enable|will not re-enable/);
  });

  it('says search covers decision rationale, not just names and statements', () => {
    // The failure #15 was filed about: a search that cannot match a
    // decision's rationale cannot find the content that went missing.
    expect(readme().toLowerCase()).toMatch(/rationale/);
  });
});
