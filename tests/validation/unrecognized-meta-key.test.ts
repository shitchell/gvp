import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { buildCatalog } from '../../src/cli/helpers.js';
import { configSchema } from '../../src/config/schema.js';
import { runValidation, builtinPasses } from '../../src/validation/index.js';
import type { ValidationPass } from '../../src/validation/index.js';

/**
 * W019 UNRECOGNIZED_META_KEY (#25, R12).
 *
 * R12: "a recognised namespace accepts unknown members only with a
 * diagnostic. Passthrough preserves; it does not excuse silence."
 * W016 had done exactly this for a document's TOP-LEVEL keys since long
 * before R12 was written; `meta` was simply never covered, which is why
 * `meta.registry.enabled: false` validated clean and did nothing at all.
 *
 * The two halves are asserted together throughout: the key must be
 * PRESERVED on the parsed meta (personal:V5 — unknown fields are
 * preserved, not filtered) AND reported. Either alone is a failure mode:
 * dropping it loses data, reporting nothing leaves the user with a key
 * that survives, means nothing, and nothing says so.
 */
describe('W019 UNRECOGNIZED_META_KEY (#25, R12)', () => {
  let tmpDir: string;
  const defaultConfig = configSchema.parse({});
  const allPasses = new Map<string, ValidationPass>([...builtinPasses]);
  const passNames = [...builtinPasses.keys()];

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cairn-w019-'));
    fs.mkdirSync(path.join(tmpDir, '.gvp', 'library'), { recursive: true });
  });
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeLib(metaExtra: string): void {
    fs.writeFileSync(path.join(tmpDir, '.gvp', 'library', 'main.yaml'), `
meta:
  name: main
  scope: project
${metaExtra}
goals:
  - id: G1
    name: Goal
    statement: goal
    tags: []
    maps_to: []
`);
  }

  function w019(metaExtra: string) {
    writeLib(metaExtra);
    const catalog = buildCatalog(defaultConfig, tmpDir);
    const diagnostics = runValidation(catalog, defaultConfig, allPasses, passNames);
    return { catalog, diagnostics: diagnostics.filter((d) => d.code === 'W019') };
  }

  it('warns on an unrecognized top-level meta key, and preserves it', () => {
    const { catalog, diagnostics } = w019('  totally_unknown: kept\n');
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]!.description).toContain('totally_unknown');
    expect(diagnostics[0]!.severity).toBe('warning');
    // Both halves, not either (R12).
    expect((catalog.documents[0]!.meta as Record<string, unknown>).totally_unknown).toBe('kept');
  });

  it('warns on an unrecognized member of a recognized namespace (meta.registry.*)', () => {
    // The #25 failure one level down, and the reason `registry` had to be
    // DECLARED rather than left to passthrough: a one-letter-off key that
    // validates clean and does nothing is the same no-op failure.
    const { diagnostics } = w019('  registry:\n    enable: false\n');
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]!.description).toContain('registry.enable');
  });

  it('is silent on every key cairn actually recognizes', () => {
    const { diagnostics } = w019(`  description: A document
  id_prefix: M
  library_id: some-library
  defaults:
    tags: []
  definitions:
    tags:
      framework:
        description: t
  config_overrides:
    priority:
      mode: replace
      value:
        definitions: ancestor
  registry:
    enabled: true
`);
    expect(diagnostics).toEqual([]);
  });

  it('does not warn on meta.library_id, which cairn reads (R9 / #16)', () => {
    // A key cairn READS through passthrough must not be reported as
    // unrecognized — that would be the opposite of true, and would push
    // users to delete a field the registry depends on.
    const { diagnostics } = w019('  library_id: abc-123\n');
    expect(diagnostics).toEqual([]);
  });

  it('does not reach into open-membership mappings under meta', () => {
    // `defaults` is keyed by FIELD names, `definitions.tags` by TAG names,
    // `config_overrides` by CONFIG keys. All three are open by
    // construction — there is no unknown member to detect, and inventing
    // one would make W019 fire on correct documents.
    const { diagnostics } = w019(`  defaults:
    anything_at_all: x
  config_overrides:
    suppress_diagnostics:
      mode: additive
      value: [W005]
`);
    expect(diagnostics).toEqual([]);
  });

  it('names the key and nothing else — no "did you mean" (P14)', () => {
    const { diagnostics } = w019('  registery:\n    enabled: false\n');
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]!.description).toContain('registery');
    expect(diagnostics[0]!.description.toLowerCase()).not.toMatch(/did you mean|perhaps|similar/);
  });

  it('stays suppressible by code (D7) — the explicit escape hatch, not silence', () => {
    // R12 keeps the escape hatch explicit precisely so a deliberately
    // unrecognized key (a downstream tool's annotation riding on `meta`'s
    // passthrough) does not have to be bought with a silent diagnostic.
    writeLib('  vendor_annotation: kept-on-purpose\n');
    const config = configSchema.parse({ suppress_diagnostics: ['W019'] });
    const catalog = buildCatalog(config, tmpDir);
    const diagnostics = runValidation(catalog, config, allPasses, passNames);
    expect(diagnostics.filter((d) => d.code === 'W019')).toEqual([]);
    // Still preserved — suppressing the diagnostic does not filter the key.
    expect((catalog.documents[0]!.meta as Record<string, unknown>).vendor_annotation)
      .toBe('kept-on-purpose');
  });
});
