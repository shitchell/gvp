# Library Registry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use cairn-sdd (recommended) or cairn-executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a machine-global index of every GVP library cairn resolves, plus `cairn libs list/show/search/forget/prune`, so an agent starting a new project can discover guiding elements that already exist upstream.

**Architecture:** A new `src/registry/` module owns both registry keyspaces. Library facts (idempotent across writers) go to `~/.gvp/registry/libraries/<hash>.yml`; the usage edge (per-writer) is merged into D22's existing `by-id/<project_id>.yml`. All writes are atomic temp+rename. Recording hooks a single call at the end of `buildCatalog()`; reading inverts the usage edge at query time.

**Tech Stack:** TypeScript (ESM, strict), zod for config schema, js-yaml, commander for CLI, vitest for tests. No new dependencies.

**Design source of truth:** `docs/plans/2026-09-03-library-registry-design.md`
**Guiding elements:** `G11`, `P18`, `C2`, `R9`, `D40`–`D58` in `.gvp/library/gvp.yaml`

---

## File Structure

**Create:**
- `src/registry/paths.ts` — registry root + per-keyspace path accessors [D52 support, fixes `GVP_REGISTRY_ROOT` conflation]
- `src/registry/atomic.ts` — atomic write helper [D52]
- `src/registry/key.ts` — entry key derivation and source canonicalization [D46, D47, D49]
- `src/registry/library-entry.ts` — `LibraryEntry` type, upsert, prune [D45, D48, D50, D51, D55]
- `src/registry/usage-edge.ts` — project-side usage edge merge [D53]
- `src/registry/record.ts` — `recordLibraries` orchestration [D40, D41, D57, D58]
- `src/utils/yaml-files.ts` — shared recursive YAML walk, moved out of `helpers.ts` [P11]
- `src/registry/query.ts` — read side: load, invert, search [D50, D53, D54]
- `src/cli/commands/libs.ts` — the `libs` command family [D54, D55]

**Modify:**
- `src/config/schema.ts` — flip default; object-level `.default({ enabled: true })` [D43, D44]
- `src/config/registry.ts` — use `paths.ts`, atomic writes [D52]
- `src/inheritance/source-resolver.ts` — export a pure, cache-only `cachedPathFor` [D54]
- `vitest.config.ts` — add `globalSetup` isolating `GVP_REGISTRY_ROOT` for the whole suite
- `tests/setup.ts` — the globalSetup file (created; not collected as a test)
- `src/cli/helpers.ts` — return `PreflightResult`, call `recordLibraries` [D42]
- `src/cli/index.ts` — register `libs`, add `--no-registry` [D43, D54]
- `tests/config/registry.test.ts` — rewrite the default-off test [D43]

> `src/config/preflight.ts` — `runRegistryPreflight` keeps its behavior but gains a try/catch (Task 2 Step 6) and stops being called from `parseConfigOptions` (Task 10). Its prune is re-homed into `recordLibraries` (Task 9).

---

## Phase 1 — Foundation

### Task 1: Split registry path accessors

The existing `getRegistryDir()` returns `path.join(override, 'by-id')`, conflating the registry root with the `by-id` keyspace. The library keyspace needs a sibling, so the root must be addressable.

**Files:**
- Create: `src/registry/paths.ts`
- Test: `tests/registry/paths.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/registry/paths.test.ts`
Expected: FAIL — `Cannot find module '../../src/registry/paths.js'`

- [ ] **Step 3: Write the implementation**

```typescript
import * as path from 'path';

/**
 * Registry root. Honors GVP_REGISTRY_ROOT (D22), which addresses the
 * ROOT rather than the by-id keyspace — the original getRegistryDir()
 * conflated the two, which blocked adding a sibling keyspace.
 */
export function getRegistryRoot(): string {
  const override = process.env.GVP_REGISTRY_ROOT;
  if (override && override.length > 0) return override;
  const home = process.env.HOME || process.env.USERPROFILE || '';
  return path.join(home, '.gvp', 'registry');
}

/** Project entries keyspace (D22). */
export function getProjectsDir(): string {
  return path.join(getRegistryRoot(), 'by-id');
}

/** Library entries keyspace (D40, D51). */
export function getLibrariesDir(): string {
  return path.join(getRegistryRoot(), 'libraries');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/registry/paths.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Point the existing registry at the new accessor**

In `src/config/registry.ts`, replace the body of `getRegistryDir()` so the two agree and `GVP_REGISTRY_ROOT` keeps working for existing callers:

```typescript
import { getProjectsDir } from '../registry/paths.js';

/** @deprecated Use getProjectsDir() from ../registry/paths.js. */
export function getRegistryDir(): string {
  return getProjectsDir();
}
```

- [ ] **Step 6: Run the full registry suite**

Run: `npx vitest run tests/config/registry.test.ts`
Expected: PASS — behavior is unchanged for existing callers

- [ ] **Step 7: Commit**

```bash
git add src/registry/paths.ts tests/registry/paths.test.ts src/config/registry.ts
git commit -m "refactor: split registry root from by-id keyspace [D52]"
```

---

### Task 2: Atomic registry writes [D52]

Bare `fs.writeFileSync` is `O_TRUNC` + write, so a concurrent reader can observe a truncated file. Combined with a prune that unlinks unparseable entries, that is a data-loss path — and D43 makes the prune run for every user on every invocation.

**Files:**
- Create: `src/registry/atomic.ts`
- Test: `tests/registry/atomic.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { writeFileAtomic } from '../../src/registry/atomic.js';

describe('writeFileAtomic', () => {
  let dir: string;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atomic-')); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  it('writes content to the target path', () => {
    const target = path.join(dir, 'a.yml');
    writeFileAtomic(target, 'hello');
    expect(fs.readFileSync(target, 'utf-8')).toBe('hello');
  });

  it('replaces existing content', () => {
    const target = path.join(dir, 'a.yml');
    fs.writeFileSync(target, 'old');
    writeFileAtomic(target, 'new');
    expect(fs.readFileSync(target, 'utf-8')).toBe('new');
  });

  it('leaves no temp files behind on success', () => {
    writeFileAtomic(path.join(dir, 'a.yml'), 'x');
    expect(fs.readdirSync(dir)).toEqual(['a.yml']);
  });

  it('creates the parent directory when missing', () => {
    const target = path.join(dir, 'nested', 'a.yml');
    writeFileAtomic(target, 'x');
    expect(fs.readFileSync(target, 'utf-8')).toBe('x');
  });

  it('cleans up the temp file when rename fails', () => {
    // target is a directory -> rename fails
    const target = path.join(dir, 'adir');
    fs.mkdirSync(target);
    expect(() => writeFileAtomic(target, 'x')).toThrow();
    const leftovers = fs.readdirSync(dir).filter((f) => f !== 'adir');
    expect(leftovers).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/registry/atomic.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```typescript
import * as fs from 'fs';
import * as path from 'path';

let counter = 0;

/**
 * Write `content` to `target` atomically (D52).
 *
 * Writes to a temp file in the SAME directory (rename is only atomic
 * within a filesystem) and renames over the target. A concurrent reader
 * therefore sees either the old file or the new one, never a truncated
 * one — which matters because pruneStale* unlinks entries it cannot
 * parse, turning a torn read into deletion.
 *
 * Throws on failure; callers in the registry path wrap in try/catch per
 * D57 (recording failure never fails the command).
 */
export function writeFileAtomic(target: string, content: string): void {
  const dir = path.dirname(target);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(dir, `.${path.basename(target)}.${process.pid}.${counter++}.tmp`);
  try {
    fs.writeFileSync(tmp, content);
    fs.renameSync(tmp, target);
  } catch (err) {
    try { fs.unlinkSync(tmp); } catch { /* already gone */ }
    throw err;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/registry/atomic.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Convert the existing project-entry write**

In `src/config/registry.ts`, `upsertRegistryEntry` currently ends with a bare `fs.writeFileSync`. Replace it — this file has the same defect today and is about to be written far more often:

```typescript
import { writeFileAtomic } from '../registry/atomic.js';

// ... inside upsertRegistryEntry, replacing the final try/catch write:
  try {
    writeFileAtomic(entryPath, yaml.dump(entry, { lineWidth: 120, noRefs: true }));
  } catch {
    // Signal failure so recordLibraries can emit D57's single warning.
    // Swallowing here would make the failure invisible to the caller and
    // silently preserve D22's warn-about-nothing behavior.
    throw new Error('registry write failed');
  }
```

- [ ] **Step 6: Remove the swallowing mkdir early-return, and guard the existing caller**

`upsertRegistryEntry` now throws so `recordLibraries` can emit D57's single warning — but its FIRST statement still swallows the most likely failure of all:

```typescript
  // DELETE this block. writeFileAtomic already does the mkdir and will
  // throw uniformly; returning here means a read-only $HOME produces no
  // write AND no warning, which is the D22 behavior D57 amends.
  try {
    fs.mkdirSync(registryDir, { recursive: true });
  } catch {
    return;
  }
```

`runRegistryPreflight` (`src/config/preflight.ts:178`) calls `upsertRegistryEntry` **unguarded** and stays wired into `parseConfigOptions` until Task 10. With the default flipped in Task 3, a write failure would crash *every* cairn command in the intermediate commits — a D57 violation shipped between tasks. Guard it now:

```typescript
  try {
    upsertRegistryEntry(preflightResult.projectId, projectName, projectPath);
    pruneStaleRegistryEntries();
  } catch {
    // D57: registry failure never fails the command.
  }
```

- [ ] **Step 7: Convert the prune's rewrite path too**

`pruneStaleRegistryEntries` also rewrites entries (trimming dead locations) via a bare `fs.writeFileSync` at `src/config/registry.ts:210`. D52 says **all** registry writes are atomic — leaving this one is the same defect in the same file:

```typescript
    // was: fs.writeFileSync(entryPath, yaml.dump(...))
    writeFileAtomic(entryPath, yaml.dump(entry, { lineWidth: 120, noRefs: true }));
```

Verify with `grep -n "fs.writeFileSync" src/config/registry.ts` — expected: no matches.

- [ ] **Step 8: Run the registry suite**

Run: `npx vitest run tests/config/registry.test.ts tests/registry/`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add src/registry/atomic.ts tests/registry/atomic.test.ts src/config/registry.ts src/config/preflight.ts
git commit -m "fix: atomic registry writes to close the torn-read deletion path [D52]"
```

---

### Task 3: Flip the registry default and add the opt-out [D43, D44]

Two independent changes are required, and doing only the obvious one is a silent no-op: the `registry` object itself is `.optional()`, so omitting the key yields `undefined` and `config.registry?.enabled` stays falsy regardless of the inner default.

**Files:**
- Modify: `src/config/schema.ts`
- Modify: `tests/config/registry.test.ts:228`
- Test: `tests/config/registry-default.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { configSchema } from '../../src/config/schema.js';

describe('registry default (D43)', () => {
  it('is enabled when the config omits the registry key entirely', () => {
    const cfg = configSchema.parse({});
    expect(cfg.registry?.enabled).toBe(true);
  });

  it('is enabled when registry is present but empty', () => {
    const cfg = configSchema.parse({ registry: {} });
    expect(cfg.registry?.enabled).toBe(true);
  });

  it('honors an explicit opt-out', () => {
    const cfg = configSchema.parse({ registry: { enabled: false } });
    expect(cfg.registry?.enabled).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/config/registry-default.test.ts`
Expected: FAIL — first two assertions get `false`/`undefined`

- [ ] **Step 3: Change the schema**

In `src/config/schema.ts`, replace the registry block and its comment:

```typescript
  // Global registry (D22, amended by D43/D44): cross-project and
  // cross-library discovery via ~/.gvp/registry/. ON by default —
  // the opt-in default was falsified by evidence (the flag was set
  // nowhere and the registry did not exist ~5 months after D22).
  // Opt out with `registry.enabled: false` or `--no-registry`.
  // NOTE: the OBJECT-level default is load-bearing, and it must carry
  // `enabled` explicitly. Without an object default, omitting
  // `registry:` yields undefined and the inner default never applies.
  // And under zod 4 (this repo pins ^4.3.6) `.default({})` SHORT-CIRCUITS
  // -- it returns the default without parsing it, so the inner
  // `.default(true)` still never runs. Verified against zod 4.3.6:
  //   .default({})             + omit -> { registry: {} }           WRONG
  //   .default({enabled:true}) + omit -> { registry:{enabled:true} } RIGHT
  registry: z
    .object({
      enabled: z.boolean().optional().default(true),
    })
    .optional()
    .default({ enabled: true }),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/config/registry-default.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Rewrite the now-inverted D22 test**

`tests/config/registry.test.ts:228` is titled *"is a no-op when registry.enabled is false (the default)"* and asserts the registry dir does not exist. Replace that test with its inverse:

```typescript
    it('upserts by default now that registry.enabled defaults to true (D43)', () => {
      // Mirror the existing tests in this file: a real project dir with a
      // .gvp/, or runProjectPreflight returns no projectId and
      // runRegistryPreflight no-ops for the WRONG reason.
      const projectPath = path.join(tmpDir, 'proj-default-on');
      fs.mkdirSync(path.join(projectPath, '.gvp'), { recursive: true });
      const config = configSchema.parse({});
      const preflight = runProjectPreflight(projectPath);
      expect(preflight.projectId).toBeDefined();
      runRegistryPreflight(preflight, config);
      expect(fs.existsSync(getRegistryDir())).toBe(true);
    });

    it('is a no-op when registry.enabled is explicitly false', () => {
      const projectPath = path.join(tmpDir, 'proj-opt-out');
      fs.mkdirSync(path.join(projectPath, '.gvp'), { recursive: true });
      const config = configSchema.parse({ registry: { enabled: false } });
      const preflight = runProjectPreflight(projectPath);
      expect(preflight.projectId).toBeDefined();
      runRegistryPreflight(preflight, config);
      expect(fs.existsSync(getRegistryDir())).toBe(false);
    });
```

- [ ] **Step 6: Verify the opt-out survives config layering**

`mergeConfigs` (`src/config/loader.ts:132`) puts `registry` in the "closer scope wins" branch — it replaces the whole object per layer rather than merging into it, and `configSchema.parse` runs once *after* the merge. So a project config containing `registry: {}` discards a global `registry.enabled: false`, and the inner default re-enables recording. Pre-existing behavior, but D43 promises the opt-out works "in any config layer", so the flip makes it load-bearing for the first time.

```typescript
it('a global opt-out survives a project layer that mentions registry (D43)', () => {
  const merged = mergeConfigs({ registry: { enabled: false } }, { registry: {} });
  expect(configSchema.parse(merged).registry?.enabled).toBe(false);
});
```

If it fails, deep-merge `registry` in `mergeConfigs` rather than weakening the test.

- [ ] **Step 7: Isolate the registry for the whole test suite**

Flipping the default makes ~80 `buildCatalog` calls across `tests/cli/`, `tests/validation/`, and `tests/exporters/` write into the developer's **real** `~/.gvp/registry/`, indexing throwaway tmp fixtures. Nothing fails, so the next step will not catch it. Only `tests/config/registry.test.ts` sets `GVP_REGISTRY_ROOT` today.

and register it in `vitest.config.ts` by **adding one line** — do not replace the file. `globals: true` and especially `testTimeout: 20000` must survive; the existing comment explains that 5s flakes for the git-shelling and remote-probing tests, and ~80 tests are about to do extra registry I/O:

```typescript
    testTimeout: 20000,
    globalSetup: ['./tests/setup.ts'],   // <- ADD THIS LINE ONLY
```

Use `globalSetup` rather than `setupFiles`: `setupFiles` runs once per test FILE, so with the default forks pool a recycled worker accumulates one `process.on('exit')` listener per file (Node warns at 11) and creates ~55 temp roots per run. `globalSetup` runs once and supports a teardown return.

`tests/setup.ts` becomes:

```typescript
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// One registry root per RUN, so no test can touch the developer's real
// ~/.gvp/registry. Individual tests may still override it.
export default function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cairn-test-registry-'));
  process.env.GVP_REGISTRY_ROOT = root;
  return () => {
    try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* best effort */ }
  };
}
```

Verify: `node -e "console.log(require('fs').existsSync(require('os').homedir()+'/.gvp/registry'))"` before and after a full run — the answer must not change.

- [ ] **Step 8: Run the full suite to catch other default-off assumptions**

Run: `npx vitest run`
Expected: PASS. Any other failure here is a test that silently depended on the registry never being written — fix it the same way, do not disable it.

- [ ] **Step 9: Update the stale opt-in docblocks**

Two docblocks still describe the feature as opt-in and will mislead the next reader:

- `src/config/registry.ts:11-14` — "When the `registry.enabled: true` config flag is set…"
- `src/config/preflight.ts` (the `runRegistryPreflight` docblock, ~line 144) — "Opt-in: this function is a no-op unless `config.registry?.enabled` is explicitly true."

Rewrite both for the amended behavior: on by default, opt out via `registry.enabled: false` or `--no-registry`, per D43 and the D22 amendment.

- [ ] **Step 10: Commit**

```bash
git add src/config/schema.ts src/config/loader.ts src/config/registry.ts src/config/preflight.ts tests/config/registry.test.ts tests/config/registry-default.test.ts tests/setup.ts vitest.config.ts
git commit -m "feat!: registry recording defaults on with opt-out [D43, D44]"
```

---

## Phase 2 — Recording

### Task 4: Entry key derivation and source canonicalization [D46, D47, D49]

For local libraries the key is the **resolved absolute filesystem path**; for remote it is the `@provider:path@commitish` source spec, because for a remote the filesystem path is a cache location rather than an identity.

**Files:**
- Create: `src/registry/key.ts`
- Test: `tests/registry/key.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { isRemoteSource, canonicalizeSource, entryKey, parseSource } from '../../src/registry/key.js';
import { LocalSourceResolver } from '../../src/inheritance/source-resolver.js';

describe('registry key (D46, D47)', () => {
  let dir: string;
  beforeEach(() => { dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'key-'))); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  it('classifies sources by the @ prefix, with @local local', () => {
    expect(isRemoteSource('@github:a/b@v1')).toBe(true);
    expect(isRemoteSource('@local')).toBe(false);
    expect(isRemoteSource('/abs/path')).toBe(false);
  });

  it('derives kind and ref from the source rather than storing them (D50)', () => {
    expect(parseSource('@github:a/b@v1.2.0')).toEqual({ kind: 'remote', ref: 'v1.2.0' });
    expect(parseSource('/abs/path')).toEqual({ kind: 'local', ref: null });
  });

  it('canonicalizes a local source to its realpath', () => {
    const real = path.join(dir, 'lib');
    fs.mkdirSync(real);
    const link = path.join(dir, 'link');
    fs.symlinkSync(real, link);
    expect(canonicalizeSource(link, dir)).toBe(real);
    expect(canonicalizeSource(real, dir)).toBe(canonicalizeSource(link, dir));
  });

  it('collapses relative and absolute forms onto the same key', () => {
    const real = path.join(dir, 'lib');
    fs.mkdirSync(real);
    expect(canonicalizeSource('./lib', dir)).toBe(real);
    expect(canonicalizeSource(real, dir)).toBe(real);
  });

  it('collapses the tilde form onto the same key', () => {
    // The spec names this case: expandTilde runs in the CLI before
    // resolve, but sourceDocCache is keyed by the RAW string and
    // path.resolve does not expand `~`.
    //
    // The directory MUST be under $HOME — os.tmpdir() is not on Linux or
    // macOS, so guarding on `path.relative` would silently skip the
    // assertion and the test would pass green with zero coverage.
    const underHome = fs.realpathSync(
      fs.mkdtempSync(path.join(os.homedir(), '.cairn-key-test-')));
    try {
      const rel = path.relative(os.homedir(), underHome);
      expect(canonicalizeSource(`~/${rel}`, '/nonexistent')).toBe(underHome);
    } finally {
      fs.rmSync(underHome, { recursive: true, force: true });
    }
  });

  it('collapses the dual-lookup forms onto one key', () => {
    // <p> and <p>/.gvp/library name ONE library. Recording keys on the
    // RESOLVER'S output, so both must agree.
    const proj = path.join(dir, 'proj');
    fs.mkdirSync(path.join(proj, '.gvp', 'library'), { recursive: true });
    const resolver = new LocalSourceResolver(dir);
    expect(canonicalizeSource(resolver.resolve(proj), dir))
      .toBe(canonicalizeSource(resolver.resolve(path.join(proj, '.gvp', 'library')), dir));
  });

  it('never lets a free-form config.source value become a key', () => {
    // Two unrelated projects both setting `source: mylib` must not
    // collide: recording keys on the resolved dir, never config.source.
    const a = path.join(dir, 'a'); const b = path.join(dir, 'b');
    fs.mkdirSync(a); fs.mkdirSync(b);
    expect(entryKey(canonicalizeSource(a, dir), 'x'))
      .not.toBe(entryKey(canonicalizeSource(b, dir), 'x'));
  });

  it('leaves remote sources verbatim', () => {
    expect(canonicalizeSource('@github:a/b@v1', dir)).toBe('@github:a/b@v1');
  });

  it('produces a stable 16-hex key from source and document path', () => {
    const k = entryKey('/abs/lib', 'code/common');
    expect(k).toMatch(/^[0-9a-f]{16}$/);
    expect(entryKey('/abs/lib', 'code/common')).toBe(k);
    expect(entryKey('/abs/lib', 'code/other')).not.toBe(k);
  });

  it('does not collide across sources that share a document path', () => {
    expect(entryKey('/a', 'personal')).not.toBe(entryKey('/b', 'personal'));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/registry/key.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```typescript
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createHash } from 'crypto';

/**
 * Is this source a remote spec? Mirrors createSourceResolver's dispatch
 * (src/inheritance/source-resolver.ts) — an `@` prefix means remote,
 * except `@local` which is the local library itself.
 */
export function isRemoteSource(source: string): boolean {
  return source.startsWith('@') && source !== '@local';
}

/**
 * The remote source grammar: `@<provider>:<path>@<commitish>`.
 *
 * Exported and reused by cachedPathFor (Task 5) and GitSourceResolver so
 * there is exactly ONE definition — three copies had accumulated, the same
 * P11 duplication Task 5 consolidated cacheKey and findLibraryDir for.
 * Update GitSourceResolver.resolve to use this too.
 */
export const REMOTE_SOURCE_RE = /^@(\w+):(.+?)@(.+)$/;

/**
 * Derive kind and ref from a source string (D50 — neither is stored).
 * The remote grammar is exactly `@<provider>:<path>@<commitish>`.
 */
export function parseSource(source: string): { kind: 'local' | 'remote'; ref: string | null } {
  if (!isRemoteSource(source)) return { kind: 'local', ref: null };
  const m = REMOTE_SOURCE_RE.exec(source);
  return { kind: 'remote', ref: m ? (m[3] as string) : null };
}

export function expandTilde(p: string): string {
  if (p === '~') return os.homedir();
  if (p.startsWith('~/')) return path.join(os.homedir(), p.slice(2));
  return p;
}

/**
 * Canonicalize a source for keying (D47).
 *
 * Local: expand `~`, resolve against `baseDir`, then realpath. Resolving
 * is precisely the step that collapses the dual lookup, the tilde form,
 * a relative form, and symlink aliases onto one identity — which is why
 * local libraries are keyed by resolved path rather than by the source
 * string the caller happened to type.
 *
 * `config.source` is deliberately NOT accepted here: it is a free-form
 * string, and two unrelated projects setting the same value would
 * otherwise collide on one key and overwrite each other. Callers pass
 * the RESOLVED library directory.
 *
 * Remote: already canonical (the ref is part of the string); verbatim.
 */
export function canonicalizeSource(source: string, baseDir: string): string {
  if (isRemoteSource(source)) return source;
  const abs = path.resolve(baseDir, expandTilde(source));
  try {
    return fs.realpathSync(abs);
  } catch {
    return abs; // not on disk (e.g. evicted); absolute is the best we can do
  }
}

/**
 * Entry key: first 16 hex of SHA-256 over source + NUL + documentPath.
 * The NUL separator prevents ('/a/b', 'c') colliding with ('/a', 'b/c').
 */
export function entryKey(canonicalSource: string, documentPath: string): string {
  return createHash('sha256')
    .update(canonicalSource)
    .update('\0')
    .update(documentPath)
    .digest('hex')
    .slice(0, 16);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/registry/key.test.ts`
Expected: PASS (10 tests)

- [ ] **Step 5: Commit**

```bash
git add src/registry/key.ts tests/registry/key.test.ts
git commit -m "feat: registry entry key derivation and source canonicalization [D46, D47]"
```

---

### Task 5: Pure cache-only remote path derivation [D54]

`GitSourceResolver.resolve` returns the cached path **only if the cache exists** — otherwise it runs `git ls-remote` and a shallow clone (`src/inheritance/source-resolver.ts:186-222`). The registry must never trigger that: recording would hit the network on every command, and `libs search` would become N clones, which D54 explicitly rejects.

**Files:**
- Modify: `src/inheritance/source-resolver.ts`
- Test: `tests/inheritance/cached-path.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { cachedPathFor } from '../../src/inheritance/source-resolver.js';

describe('cachedPathFor (D54)', () => {
  let cache: string;
  const key = path.join('github', 'shitchell--gvp-docs', 'v0.7.0');

  beforeEach(() => {
    cache = fs.mkdtempSync(path.join(os.tmpdir(), 'cache-'));
  });
  afterEach(() => fs.rmSync(cache, { recursive: true, force: true }));

  it('returns null for an uncached remote WITHOUT touching the network', () => {
    expect(cachedPathFor('@github:shitchell/gvp-docs@v0.7.0', cache)).toBeNull();
  });

  it('returns the repo root when the cache exists with no gvp/ subdir', () => {
    const dir = path.join(cache, key);
    fs.mkdirSync(dir, { recursive: true });
    expect(cachedPathFor('@github:shitchell/gvp-docs@v0.7.0', cache)).toBe(dir);
  });

  it('applies the dual lookup, preferring gvp/', () => {
    const dir = path.join(cache, key);
    fs.mkdirSync(path.join(dir, 'gvp'), { recursive: true });
    fs.mkdirSync(path.join(dir, '.gvp', 'library'), { recursive: true });
    expect(cachedPathFor('@github:shitchell/gvp-docs@v0.7.0', cache)).toBe(path.join(dir, 'gvp'));
  });

  it('falls back to .gvp/library when gvp/ is absent', () => {
    const dir = path.join(cache, key);
    fs.mkdirSync(path.join(dir, '.gvp', 'library'), { recursive: true });
    expect(cachedPathFor('@github:shitchell/gvp-docs@v0.7.0', cache)).toBe(path.join(dir, '.gvp', 'library'));
  });

  it('returns null for a malformed source', () => {
    expect(cachedPathFor('@github:no-commitish', cache)).toBeNull();
    expect(cachedPathFor('/a/local/path', cache)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/inheritance/cached-path.test.ts`
Expected: FAIL — `cachedPathFor` is not exported

- [ ] **Step 3: Extract the shared pieces and export the pure derivation**

`GitSourceResolver` currently holds `findLibraryDir` as a private method and derives `cacheKey` inline at `:184-186`. Lift both to module scope so the resolver and the new function share one implementation (no duplicated derivation to drift):

```typescript
/**
 * Dual lookup within a resolved repo directory (DEC-1.2, DEC-1.10):
 * gvp/ wins over .gvp/library/, falling back to the repo root.
 * Lifted from GitSourceResolver so cachedPathFor can share it.
 */
export function findLibraryDirIn(repoDir: string): string {
  const gvpDir = path.join(repoDir, 'gvp');
  if (fs.existsSync(gvpDir) && fs.statSync(gvpDir).isDirectory()) return gvpDir;
  const dotGvpLibrary = path.join(repoDir, '.gvp', 'library');
  if (fs.existsSync(dotGvpLibrary) && fs.statSync(dotGvpLibrary).isDirectory()) return dotGvpLibrary;
  return repoDir;
}

/** Cache key for a parsed remote source. Single source of truth. */
export function remoteCacheKey(provider: string, repoPath: string, commitish: string): string {
  return `${provider}/${repoPath.replace(/\//g, '--')}/${commitish}`;
}

/**
 * The cached library directory for a remote source, or null if it is
 * not on disk. PURE — never performs network I/O, never clones. This is
 * what the registry uses; calling GitSourceResolver.resolve instead
 * would fetch (D54).
 */
export function cachedPathFor(source: string, cacheDir: string = defaultCacheDir()): string | null {
  // Reuses the single grammar definition exported from registry/key.ts.
  const m = REMOTE_SOURCE_RE.exec(source);
  if (!m) return null;
  const dir = path.join(cacheDir, remoteCacheKey(m[1] as string, m[2] as string, m[3] as string));
  if (!fs.existsSync(dir)) return null;
  return findLibraryDirIn(dir);
}
```

Then replace `GitSourceResolver`'s private `findLibraryDir` body with a call to `findLibraryDirIn(repoDir)` and its inline `cacheKey` with `remoteCacheKey(...)`, so there is exactly one derivation.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/inheritance/`
Expected: PASS — including the existing `source-resolver.test.ts`, unchanged

- [ ] **Step 5: Commit**

```bash
git add src/inheritance/source-resolver.ts tests/inheritance/cached-path.test.ts
git commit -m "feat: pure cache-only remote path derivation, no network I/O [D54]"
```

---

### Task 6: Library entry upsert and prune [D45, D48, D50, D51, D55]

Library facts only — **no timestamps**. A single per-writer field would make concurrent writes non-identical and void the no-lock argument (P18).

**Files:**
- Create: `src/registry/library-entry.ts`
- Test: `tests/registry/library-entry.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { upsertLibraryEntry, readLibraryEntry, type LibraryEntry } from '../../src/registry/library-entry.js';
import { getLibrariesDir } from '../../src/registry/paths.js';

const base = (): LibraryEntry => ({
  name: 'code-common',
  source: '/abs/lib',
  document_path: 'code/common',
  file: 'code/common.yaml',
  scope: 'universal',
  project_id: null,
  library_id: null,
  element_counts: { principles: 15, rules: 2 },
});

describe('library entry (D51)', () => {
  let tmp: string, orig: string | undefined;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lib-'));
    orig = process.env.GVP_REGISTRY_ROOT;
    process.env.GVP_REGISTRY_ROOT = tmp;
  });
  afterEach(() => {
    if (orig === undefined) delete process.env.GVP_REGISTRY_ROOT; else process.env.GVP_REGISTRY_ROOT = orig;
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('writes an entry that round-trips', () => {
    upsertLibraryEntry('deadbeefdeadbeef', base());
    expect(readLibraryEntry('deadbeefdeadbeef')).toEqual(base());
  });

  it('carries NO timestamps — they would void idempotence (P18)', () => {
    upsertLibraryEntry('deadbeefdeadbeef', base());
    const raw = fs.readFileSync(path.join(getLibrariesDir(), 'deadbeefdeadbeef.yml'), 'utf-8');
    expect(raw).not.toMatch(/first_seen|last_seen|timestamp/);
  });

  it('is byte-identical across repeated writes of the same facts', () => {
    upsertLibraryEntry('k', base());
    const a = fs.readFileSync(path.join(getLibrariesDir(), 'k.yml'), 'utf-8');
    upsertLibraryEntry('k', base());
    const b = fs.readFileSync(path.join(getLibrariesDir(), 'k.yml'), 'utf-8');
    expect(b).toBe(a);
  });

  it('last-write-wins when the library content changed', () => {
    upsertLibraryEntry('k', base());
    const changed = { ...base(), element_counts: { principles: 16, rules: 2 } };
    upsertLibraryEntry('k', changed);
    expect(readLibraryEntry('k')?.element_counts.principles).toBe(16);
  });

  it('returns null for a missing or corrupt entry rather than throwing', () => {
    expect(readLibraryEntry('nope')).toBeNull();
    fs.mkdirSync(getLibrariesDir(), { recursive: true });
    fs.writeFileSync(path.join(getLibrariesDir(), 'bad.yml'), '::: not yaml');
    expect(readLibraryEntry('bad')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/registry/library-entry.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```typescript
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { getLibrariesDir } from './paths.js';
import { writeFileAtomic } from './atomic.js';

/**
 * Facts about one library DOCUMENT (D45 — the document, not the
 * directory, is the unit, because references resolve as
 * `<meta.name>:<id>` and a document-level hit is directly citable).
 *
 * Deliberately contains NO timestamps. Every field here is derived
 * purely from the library's current content, so two writers observing
 * the same library state produce identical bytes and a lost update is a
 * no-op (P18, D51). Adding a timestamp would silently void that.
 * Timestamps live on the usage edge — see usage-edge.ts (D53).
 */
export interface LibraryEntry {
  /** meta.name — correlation only, NOT unique, may be absent (D48). */
  name: string | null;
  /** inherits: grammar. Canonical resolved path for local; spec for remote (D47, D49). */
  source: string;
  /** Extension-less relative path — cairn's internal document identity. */
  document_path: string;
  /** Actual filename; .yaml vs .yml is not derivable from document_path. */
  file: string;
  /** meta.scope when declared. */
  scope: string | null;
  /** Correlation when the library sits in a project with a D21 id (D48). */
  project_id: string | null;
  /** Correlation; read-if-present from meta.library_id, see #16 / R9 (D48). */
  library_id: string | null;
  /** Per category, including user-defined categories. */
  element_counts: Record<string, number>;
}

function entryPath(key: string): string {
  return path.join(getLibrariesDir(), `${key}.yml`);
}

/**
 * Write library facts for `key`. Last-write-wins: when two writers
 * observed different library states, the later observation is the
 * fresher one and should win (D51).
 *
 * `sortKeys` matters — it makes output byte-stable across writers
 * regardless of object construction order, which is what the
 * idempotence argument rests on.
 */
export function upsertLibraryEntry(key: string, entry: LibraryEntry): void {
  const dumped = yaml.dump(entry, { lineWidth: 120, noRefs: true, sortKeys: true });
  // Read-compare-skip. Every cairn command would otherwise rewrite every
  // library entry, which is pure churn -- and skipping when the bytes
  // already match STRENGTHENS the P18 argument rather than weakening it:
  // the common concurrent case becomes no write at all.
  try {
    if (fs.readFileSync(entryPath(key), 'utf-8') === dumped) return;
  } catch { /* missing or unreadable — fall through and write */ }
  writeFileAtomic(entryPath(key), dumped);
}

/** Read one entry. Returns null when missing or unparseable. */
export function readLibraryEntry(key: string): LibraryEntry | null {
  try {
    const parsed = yaml.load(fs.readFileSync(entryPath(key), 'utf-8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const e = parsed as Partial<LibraryEntry>;
    // Validate/normalize EVERY field a consumer dereferences. `libs list`
    // reduces over element_counts, `show` iterates it, `search` joins
    // `file` -- a parseable-but-incomplete entry throws a TypeError in all
    // three, and pruneLibraryEntries only deletes UNparseable entries, so
    // that state is reachable and sticky.
    if (typeof e.source !== 'string') return null;
    if (typeof e.document_path !== 'string') return null;
    if (typeof e.file !== 'string') return null;
    const counts = e.element_counts;
    e.element_counts = counts && typeof counts === 'object' && !Array.isArray(counts) ? counts : {};
    if (typeof e.name !== 'string') e.name = null;
    if (typeof e.scope !== 'string') e.scope = null;
    if (typeof e.project_id !== 'string') e.project_id = null;
    if (typeof e.library_id !== 'string') e.library_id = null;
    return e as LibraryEntry;
  } catch {
    return null;
  }
}

/** All entry keys currently on disk. */
export function listLibraryKeys(): string[] {
  try {
    return fs.readdirSync(getLibrariesDir())
      .filter((f) => f.endsWith('.yml'))
      .map((f) => f.slice(0, -4));
  } catch {
    return [];
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/registry/library-entry.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Add document-level prune to the same module [D55]**

`recordLibraries` (Task 9) calls this, so it must exist here rather than in a later task. D22's prune is directory-level; for library entries that is too coarse — deleting one document inside a live library would orphan its entry forever.

Write the failing test first, in `tests/registry/prune.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { pruneLibraryEntries, upsertLibraryEntry, listLibraryKeys } from '../../src/registry/library-entry.js';

describe('library prune (D55)', () => {
  let tmp: string, lib: string, orig: string | undefined;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pr-'));
    orig = process.env.GVP_REGISTRY_ROOT;
    process.env.GVP_REGISTRY_ROOT = tmp;
    lib = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'pl-')));
    fs.writeFileSync(path.join(lib, 'a.yaml'), 'meta:\n  name: a\n');
    fs.writeFileSync(path.join(lib, 'b.yaml'), 'meta:\n  name: b\n');
    const base = { scope: null, project_id: null, library_id: null, element_counts: {} };
    upsertLibraryEntry('ka', { ...base, name: 'a', source: lib, document_path: 'a', file: 'a.yaml' } as any);
    upsertLibraryEntry('kb', { ...base, name: 'b', source: lib, document_path: 'b', file: 'b.yaml' } as any);
    upsertLibraryEntry('kr', { ...base, name: 'r', source: '@github:x/y@v1', document_path: 'r', file: 'r.yaml' } as any);
  });
  afterEach(() => {
    if (orig === undefined) delete process.env.GVP_REGISTRY_ROOT; else process.env.GVP_REGISTRY_ROOT = orig;
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.rmSync(lib, { recursive: true, force: true });
  });

  it('drops a deleted document but keeps its live siblings', () => {
    fs.unlinkSync(path.join(lib, 'a.yaml'));
    pruneLibraryEntries();
    expect(listLibraryKeys().sort()).toEqual(['kb', 'kr']);
  });

  it('retains remote entries even when uncached (D55)', () => {
    pruneLibraryEntries();
    expect(listLibraryKeys()).toContain('kr');
  });

  it('drops nothing when everything is present', () => {
    pruneLibraryEntries();
    expect(listLibraryKeys().sort()).toEqual(['ka', 'kb', 'kr']);
  });
});
```


- [ ] **Step 6: Run it to verify it fails**

Run: `npx vitest run tests/registry/prune.test.ts`
Expected: FAIL — `pruneLibraryEntries` is not exported

- [ ] **Step 7: Implement it**

Append to `src/registry/library-entry.ts`:

```typescript
import { isRemoteSource } from './key.js';

/**
 * Prune library entries (D55).
 *
 * Local entries are dropped when THE DOCUMENT FILE is gone — not when
 * the library directory is gone. D22's directory-level prune would
 * orphan a deleted document's entry forever while its siblings stayed
 * live.
 *
 * Remote entries are NEVER dropped here: an evicted cache is still
 * re-fetchable while the ref is served, and forgetting it discards
 * exactly what the index exists to hold. `cairn libs prune --remote`
 * is the explicit opt-in.
 */
export function pruneLibraryEntries(): void {
  for (const key of listLibraryKeys()) {
    const e = readLibraryEntry(key);
    if (!e) {
      // Unparseable — but only remove it if we can also confirm it is
      // not a torn read in progress. Atomic writes (D52) mean a
      // well-formed writer never produces one, so this is safe.
      try { fs.unlinkSync(path.join(getLibrariesDir(), `${key}.yml`)); } catch { /* gone */ }
      continue;
    }
    if (isRemoteSource(e.source)) continue;
    if (!fs.existsSync(path.join(e.source, e.file))) {
      try { fs.unlinkSync(path.join(getLibrariesDir(), `${key}.yml`)); } catch { /* gone */ }
    }
  }
}
```


- [ ] **Step 8: Run tests to verify they pass**

Run: `npx vitest run tests/registry/prune.test.ts tests/registry/library-entry.test.ts`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add src/registry/library-entry.ts tests/registry/library-entry.test.ts tests/registry/prune.test.ts
git commit -m "feat: library entry storage and document-level prune [D51, D55]"
```

---

### Task 7: Usage edge merge [D53]

D22 gives **no cross-project collision** — one file per project UUID. It does *not* give freedom from same-project concurrency, which `C2` declares normal. So the append is a **merge**, not a blind rewrite: a lost update then costs a stale timestamp rather than a dropped edge.

**Files:**
- Create: `src/registry/usage-edge.ts`
- Test: `tests/registry/usage-edge.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { mergeUsageEdges, type UsageEdge } from '../../src/registry/usage-edge.js';

describe('usage edge merge (D53)', () => {
  let tmp: string, orig: string | undefined;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'edge-'));
    orig = process.env.GVP_REGISTRY_ROOT;
    process.env.GVP_REGISTRY_ROOT = tmp;
  });
  afterEach(() => {
    if (orig === undefined) delete process.env.GVP_REGISTRY_ROOT; else process.env.GVP_REGISTRY_ROOT = orig;
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('adds new edges', () => {
    const out = mergeUsageEdges([], ['a', 'b'], '2026-01-02T00:00:00Z');
    expect(out.map((e) => e.hash).sort()).toEqual(['a', 'b']);
    expect(out[0]!.first_seen).toBe('2026-01-02T00:00:00Z');
  });

  it('preserves the earliest first_seen and takes the latest last_seen', () => {
    const existing: UsageEdge[] = [
      { hash: 'a', first_seen: '2026-01-01T00:00:00Z', last_seen: '2026-01-01T00:00:00Z' },
    ];
    const out = mergeUsageEdges(existing, ['a'], '2026-06-01T00:00:00Z');
    expect(out[0]!.first_seen).toBe('2026-01-01T00:00:00Z');
    expect(out[0]!.last_seen).toBe('2026-06-01T00:00:00Z');
  });

  it('never drops an edge it was not told about — the concurrency property', () => {
    const existing: UsageEdge[] = [
      { hash: 'other-session', first_seen: '2026-01-01T00:00:00Z', last_seen: '2026-01-01T00:00:00Z' },
    ];
    const out = mergeUsageEdges(existing, ['mine'], '2026-06-01T00:00:00Z');
    expect(out.map((e) => e.hash).sort()).toEqual(['mine', 'other-session']);
  });

  it('does not move last_seen backwards', () => {
    const existing: UsageEdge[] = [
      { hash: 'a', first_seen: '2026-01-01T00:00:00Z', last_seen: '2026-06-01T00:00:00Z' },
    ];
    const out = mergeUsageEdges(existing, ['a'], '2026-03-01T00:00:00Z');
    expect(out[0]!.last_seen).toBe('2026-06-01T00:00:00Z');
  });

  it('is deterministic in ordering', () => {
    const a = mergeUsageEdges([], ['b', 'a'], 'T');
    const b = mergeUsageEdges([], ['a', 'b'], 'T');
    expect(a).toEqual(b);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/registry/usage-edge.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```typescript
/**
 * One project-to-library edge (D53). Timestamps live HERE, not on the
 * library entry, because writers differ and the library entry's
 * idempotence must be preserved (P18, D51).
 */
export interface UsageEdge {
  hash: string;
  first_seen: string;
  last_seen: string;
}

/**
 * Merge freshly-observed library keys into a project's existing edges.
 *
 * Union by hash, min first_seen, max last_seen — never a blind rewrite.
 * D22 gives no CROSS-PROJECT collision (one file per project UUID), but
 * C2 says parallel sessions in ONE project are normal, and those do
 * contend on that file. Merging means the worst case is a stale
 * timestamp rather than a dropped edge.
 *
 * Result is sorted by hash so output is deterministic.
 */
export function mergeUsageEdges(
  existing: UsageEdge[],
  observedHashes: string[],
  now: string,
): UsageEdge[] {
  const byHash = new Map<string, UsageEdge>();
  for (const e of existing) {
    if (e && typeof e.hash === 'string') byHash.set(e.hash, { ...e });
  }
  for (const hash of observedHashes) {
    const prior = byHash.get(hash);
    if (!prior) {
      byHash.set(hash, { hash, first_seen: now, last_seen: now });
    } else {
      byHash.set(hash, {
        hash,
        first_seen: prior.first_seen < now ? prior.first_seen : now,
        last_seen: prior.last_seen > now ? prior.last_seen : now,
      });
    }
  }
  return [...byHash.values()].sort((a, b) => a.hash.localeCompare(b.hash));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/registry/usage-edge.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/registry/usage-edge.ts tests/registry/usage-edge.test.ts
git commit -m "feat: usage edge merge semantics for same-project concurrency [D53]"
```

---

### Task 8: Extend project entry upsert to carry the usage edge [D53]

Fold the D22 location upsert and the usage-edge merge into **one** write. Left separate, each invocation would write the project file twice with a prune between them, doubling the torn-read window.

**Files:**
- Modify: `src/config/registry.ts`
- Test: `tests/registry/project-edge.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { upsertRegistryEntry } from '../../src/config/registry.js';
import { getProjectsDir } from '../../src/registry/paths.js';

describe('project entry with usage edge (D53)', () => {
  let tmp: string, orig: string | undefined, proj: string;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'proj-'));
    orig = process.env.GVP_REGISTRY_ROOT;
    process.env.GVP_REGISTRY_ROOT = tmp;
    proj = fs.mkdtempSync(path.join(os.tmpdir(), 'p-'));
  });
  afterEach(() => {
    if (orig === undefined) delete process.env.GVP_REGISTRY_ROOT; else process.env.GVP_REGISTRY_ROOT = orig;
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.rmSync(proj, { recursive: true, force: true });
  });

  const read = (id: string) =>
    yaml.load(fs.readFileSync(path.join(getProjectsDir(), `${id}.yml`), 'utf-8')) as any;

  it('writes libraries alongside locations in ONE call', () => {
    upsertRegistryEntry('id-1', 'proj', proj, ['aaa', 'bbb']);
    const e = read('id-1');
    expect(e.locations).toHaveLength(1);
    expect(e.libraries.map((l: any) => l.hash).sort()).toEqual(['aaa', 'bbb']);
  });

  it('merges rather than replaces on a second call', () => {
    upsertRegistryEntry('id-1', 'proj', proj, ['aaa']);
    upsertRegistryEntry('id-1', 'proj', proj, ['bbb']);
    const e = read('id-1');
    expect(e.libraries.map((l: any) => l.hash).sort()).toEqual(['aaa', 'bbb']);
  });

  it('omitting hashes leaves existing edges untouched (D58)', () => {
    upsertRegistryEntry('id-1', 'proj', proj, ['aaa']);
    upsertRegistryEntry('id-1', 'proj', proj);
    expect(read('id-1').libraries.map((l: any) => l.hash)).toEqual(['aaa']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/registry/project-edge.test.ts`
Expected: FAIL — `upsertRegistryEntry` takes 3 args

- [ ] **Step 3: Extend the signature and merge**

In `src/config/registry.ts`, add the field to `RegistryEntry`, take an optional fourth argument, and merge before the single atomic write:

```typescript
import { mergeUsageEdges, type UsageEdge } from '../registry/usage-edge.js';

export interface RegistryEntry {
  project_id: string;
  project_name: string;
  locations: RegistryLocation[];
  /** Usage edge (D53) — which library entries this project resolved. */
  libraries?: UsageEdge[];
}

export function upsertRegistryEntry(
  projectId: string,
  projectName: string,
  projectPath: string,
  observedLibraryHashes?: string[],
): void {
  // ... existing read + location upsert, unchanged, then BEFORE the write:

  if (observedLibraryHashes !== undefined) {
    entry.libraries = mergeUsageEdges(
      Array.isArray(entry.libraries) ? entry.libraries : [],
      observedLibraryHashes,
      now,
    );
  } else if (!Array.isArray(entry.libraries)) {
    delete entry.libraries;
  }

  // ... single writeFileAtomic call, unchanged
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/registry/project-edge.test.ts tests/config/registry.test.ts`
Expected: PASS — the D22 tests are unaffected because the argument is optional

- [ ] **Step 5: Commit**

```bash
git add src/config/registry.ts tests/registry/project-edge.test.ts
git commit -m "feat: carry the usage edge in project entries, single write [D53]"
```

---

### Task 9: recordLibraries orchestration [D40, D41, D57, D58]

**Files:**
- Create: `src/registry/record.ts`
- Test: `tests/registry/record.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { recordLibraries } from '../../src/registry/record.js';
import { listLibraryKeys, readLibraryEntry } from '../../src/registry/library-entry.js';
import { getLibrariesDir } from '../../src/registry/paths.js';

function makeLib(dir: string): void {
  fs.mkdirSync(path.join(dir, 'code'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'personal.yaml'),
    'meta:\n  name: personal\n  scope: universal\nprinciples:\n  - id: P1\n    name: One\n    statement: x\n');
  fs.writeFileSync(path.join(dir, 'code', 'common.yaml'),
    'meta:\n  name: code-common\nrules:\n  - id: R1\n    name: Two\n    statement: y\n');
}

describe('recordLibraries (D40, D41, D57, D58)', () => {
  let tmp: string, lib: string, orig: string | undefined;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rec-'));
    orig = process.env.GVP_REGISTRY_ROOT;
    process.env.GVP_REGISTRY_ROOT = tmp;
    lib = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'lib-')));
    makeLib(lib);
  });
  afterEach(() => {
    if (orig === undefined) delete process.env.GVP_REGISTRY_ROOT; else process.env.GVP_REGISTRY_ROOT = orig;
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.rmSync(lib, { recursive: true, force: true });
  });

  it('records EVERY document in the directory, not only inherited ones (D41)', () => {
    recordLibraries({ libraryDir: lib, externalSources: [], projectId: null, projectName: null, projectPath: null });
    const names = listLibraryKeys().map((k) => readLibraryEntry(k)!.name).sort();
    expect(names).toEqual(['code-common', 'personal']);
  });

  it('captures scope, filename, and per-category element counts', () => {
    recordLibraries({ libraryDir: lib, externalSources: [], projectId: null, projectName: null, projectPath: null });
    const e = listLibraryKeys().map((k) => readLibraryEntry(k)!).find((x) => x.name === 'personal')!;
    expect(e.scope).toBe('universal');
    expect(e.file).toBe('personal.yaml');
    expect(e.document_path).toBe('personal');
    expect(e.element_counts).toEqual({ principles: 1 });
  });

  it('records library facts with no project context, skipping the edge (D58)', () => {
    recordLibraries({ libraryDir: lib, externalSources: [], projectId: null, projectName: null, projectPath: null });
    expect(listLibraryKeys()).toHaveLength(2);
  });

  it('never throws when the registry is unwritable (D57)', () => {
    process.env.GVP_REGISTRY_ROOT = '/proc/nonexistent-registry';
    expect(() =>
      recordLibraries({ libraryDir: lib, externalSources: [], projectId: null, projectName: null, projectPath: null }),
    ).not.toThrow();
  });

  it('is idempotent — a second run rewrites identical bytes', () => {
    const args = { libraryDir: lib, externalSources: [], projectId: null, projectName: null, projectPath: null };
    recordLibraries(args);
    const snap = listLibraryKeys().map((k) => fs.readFileSync(path.join(getLibrariesDir(), `${k}.yml`), 'utf-8'));
    recordLibraries(args);
    const snap2 = listLibraryKeys().map((k) => fs.readFileSync(path.join(getLibrariesDir(), `${k}.yml`), 'utf-8'));
    expect(snap2).toEqual(snap);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/registry/record.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```typescript
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { canonicalizeSource, entryKey, isRemoteSource, expandTilde } from './key.js';
import { upsertLibraryEntry, pruneLibraryEntries, type LibraryEntry } from './library-entry.js';
import { upsertRegistryEntry, pruneStaleRegistryEntries } from '../config/registry.js';
import { LocalSourceResolver, cachedPathFor } from '../inheritance/source-resolver.js';
import { CategoryRegistry } from '../model/category-registry.js';
import { loadDefaults } from '../schema/defaults-loader.js';
import type { CategoryDefinition } from '../schema/category-definition.js';

export interface RecordArgs {
  /** The resolved root library directory. */
  libraryDir: string;
  /** Raw source strings for every external library resolved this run. */
  externalSources: string[];
  projectId: string | null;
  projectName: string | null;
  projectPath: string | null;
}

/**
 * NOTE: `src/cli/helpers.ts` already has a private `findYamlFiles`.
 * Do NOT copy it — two walkers would drift (P11). In this task:
 *   1. move helpers.ts's `findYamlFiles` into `src/utils/yaml-files.ts`
 *      exporting `findYamlFiles(dir: string): string[]`,
 *   2. have helpers.ts import it from there,
 *   3. import it here.
 * Keep the EXISTING throwing behavior — do NOT make it swallow. Recording
 * wants leniency but catalog construction does not, and silently loading a
 * partial document set would be worse than failing. record()'s per-file
 * try/catch and recordLibraries' outer try supply the leniency on this side.
 */
import { findYamlFiles } from '../utils/yaml-files.js';

/**
 * Read one document's registry-relevant facts WITHOUT building a
 * catalog. Recording must not depend on a document parsing cleanly
 * enough to become an Element — a library with one broken document
 * should still have its other documents indexed.
 */
function factsFor(
  file: string,
  libDir: string,
  source: string,
  baseRegistry: CategoryRegistry,
): LibraryEntry | null {
  let data: Record<string, unknown>;
  try {
    const raw = yaml.load(fs.readFileSync(file, 'utf-8'));
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    data = raw as Record<string, unknown>;
  } catch {
    return null;
  }
  const meta = (data.meta ?? {}) as Record<string, unknown>;

  // Merge this document's own category definitions, mirroring
  // buildCatalog's pass 1. Without it a user-defined category is not
  // recognized, so its elements are excluded from element_counts and are
  // unsearchable -- the silent-miss failure #15 was filed about, and the
  // spec requires counts "including user-defined categories".
  const docCats = (meta.definitions as Record<string, unknown> | undefined)?.categories;
  const registry = docCats && typeof docCats === 'object'
    ? baseRegistry.merge(docCats as Record<string, CategoryDefinition>)
    : baseRegistry;

  // project_id is a fact about where the library LIVES (D48), not about
  // who read it. Derive it from the library's own .gvp/config.yaml by
  // walking up from libDir -- stamping the CONSUMING invocation's id
  // would make the same entry flip between a UUID and null depending on
  // which project resolved it, breaking byte-identity (P18, D51).
  const projectId = projectIdForLibrary(libDir);
  // Count per category, keyed by YAML KEY (plural: `principles`), not by
  // category NAME (singular: `principle`) -- defaults.yaml names
  // categories in the singular with a plural yaml_key, and the spec's
  // entry shape, `libs show`'s output, and SearchHit.category all use the
  // plural form the user actually types.
  //
  // The registry lookup is used ONLY as the is-this-a-real-category
  // filter, so an unrelated top-level list cannot become a phantom count.
  // `registry` is passed in (built once per invocation) because
  // loadDefaults() re-reads and re-validates a 240-line file on every
  // call, and this runs once per document.
  const counts: Record<string, number> = {};
  for (const [k, v] of Object.entries(data)) {
    if (k === 'meta' || !Array.isArray(v)) continue;
    if (!registry.getByYamlKey(k)) continue;
    counts[k] = v.length;
  }
  return {
    name: typeof meta.name === 'string' ? meta.name : null,
    source,
    document_path: path.relative(libDir, file).replace(/\.ya?ml$/, ''),
    file: path.relative(libDir, file),
    scope: typeof meta.scope === 'string' ? meta.scope : null,
    project_id: projectId,
    // R9 / #16: read-if-present. documentMetaSchema is .passthrough(),
    // so meta.library_id already survives parsing today.
    library_id: typeof meta.library_id === 'string' ? meta.library_id : null,
    element_counts: counts,
  };
}

/**
 * The project_id of the project that OWNS `libDir`, by walking up for a
 * `.gvp/config.yaml`. Cached per directory — this runs once per document
 * and the answer is identical for every document in a library.
 */
const projectIdCache = new Map<string, string | null>();
function projectIdForLibrary(libDir: string): string | null {
  const cached = projectIdCache.get(libDir);
  if (cached !== undefined) return cached;
  let current = path.resolve(libDir);
  let found: string | null = null;
  for (;;) {
    const cfg = path.join(current, '.gvp', 'config.yaml');
    if (fs.existsSync(cfg)) {
      try {
        const parsed = yaml.load(fs.readFileSync(cfg, 'utf-8'));
        const id = (parsed as Record<string, unknown> | null)?.project_id;
        if (typeof id === 'string' && id.length > 0) found = id;
      } catch { /* unreadable — no id */ }
      break;
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  projectIdCache.set(libDir, found);
  return found;
}

/**
 * Record every library resolved by this invocation (D40).
 *
 * Records EVERY document in each resolved library directory, not only
 * the inherited ones (D41) — a project that inherits one document from
 * a library would otherwise never index its siblings, which is where
 * reusable elements typically live.
 *
 * Never throws (D57): the index is not load-bearing for correctness.
 * Returns a warning string when something failed, for the caller to
 * emit once.
 */
export function recordLibraries(args: RecordArgs): string | undefined {
  const hashes: string[] = [];
  let failed = false;

  // Build the category registry ONCE per invocation, not per document:
  // loadDefaults() re-reads and re-zod-validates a 240-line file each call.
  const baseRegistry = CategoryRegistry.fromDefaults(loadDefaults());
  // Guard against recording one directory twice (e.g. `inherits: .`, or an
  // external source that resolves back to the root library).
  const seenSources = new Set<string>();

  const record = (dir: string, source: string): void => {
    if (seenSources.has(source)) return;
    seenSources.add(source);
    // findYamlFiles THROWS on an unreadable/vanished directory (it keeps
    // the strict behavior buildCatalog needs). Guard it here so one bad
    // source cannot abort the external sources not yet recorded.
    let files: string[];
    try {
      files = findYamlFiles(dir);
    } catch {
      failed = true;
      return;
    }
    for (const file of files) {
      // The WHOLE body is guarded, not just the write: factsFor can throw
      // (e.g. baseRegistry.merge on a malformed definitions block), and one
      // broken document must not abort the remaining documents or the
      // external sources not yet recorded.
      try {
        const facts = factsFor(file, dir, source, baseRegistry);
        if (!facts) continue;
        const key = entryKey(source, facts.document_path);
        upsertLibraryEntry(key, facts);
        hashes.push(key);
      } catch {
        failed = true;
      }
    }
  };

  try {
    record(args.libraryDir, canonicalizeSource(args.libraryDir, args.libraryDir));
    for (const src of args.externalSources) {
      const resolved = resolveIfCached(src, args.libraryDir);
      if (!resolved) continue;
      // Key local sources on the RESOLVER'S OUTPUT, not the raw string.
      // LocalSourceResolver maps `<p>`, `<p>/gvp` and `<p>/.gvp/library`
      // onto one directory -- the dual lookup D47 exists to collapse.
      // Canonicalizing the STRING leaves those as separate keys, and
      // `libs prune` would then join a source missing the `.gvp/library`
      // segment and delete live entries on every run.
      const source = isRemoteSource(src) ? src : canonicalizeSource(resolved, args.libraryDir);
      record(resolved, source);
    }
  } catch {
    failed = true;
  }

  if (args.projectId && args.projectPath && args.projectName) {
    try {
      upsertRegistryEntry(args.projectId, args.projectName, args.projectPath, hashes);
    } catch {
      failed = true;
    }
  }

  // D22's auto-prune lost its only call site when Task 10 removed
  // runRegistryPreflight from parseConfigOptions. Re-home it here so it
  // still runs -- D52's rationale assumes it does.
  //
  // Runs on EVERY invocation, deliberately. D22 records "auto-prune on
  // access", and D52's rationale explicitly rests on the prune running
  // for every user on every invocation. An hourly stamp-file gate was
  // drafted and removed: it would have changed recorded behavior without
  // amending the decision that records it. The cost is real and is noted
  // under Deferred as needing a decision, not a quiet optimization.
  try {
    pruneStaleRegistryEntries();
    pruneLibraryEntries();
  } catch {
    failed = true;
  }

  // At most ONE warning per invocation (D57), regardless of how many
  // individual writes failed.
  return failed ? 'cairn: could not update the library registry (continuing)' : undefined;
}

/**
 * Resolve a source to a directory ONLY if it is already on disk.
 *
 * MUST NOT call createSourceResolver().resolve() for remotes:
 * GitSourceResolver.resolve returns the cached path only when the cache
 * EXISTS -- otherwise it runs `git ls-remote` plus a shallow clone. That
 * would make every catalog-building command hit the network for any
 * evicted remote. cachedPathFor (Task 5) is the pure, cache-only
 * derivation.
 *
 * expandTilde matters here: sourceDocCache is keyed by the RAW source and
 * LocalSourceResolver does not expand `~`, so path.resolve would
 * otherwise yield `<baseDir>/~/lib` and silently record nothing.
 */
function resolveIfCached(source: string, baseDir: string): string | null {
  if (isRemoteSource(source)) return cachedPathFor(source);
  try {
    return new LocalSourceResolver(baseDir).resolve(expandTilde(source));
  } catch {
    return null;
  }
}
```

> `expandTilde` and `isRemoteSource` are exported from `src/registry/key.ts` in Task 4.
>
> Also delete `src/cli/helpers.ts`'s private `expandTilde` (`helpers.ts:429`) and import the exported one — otherwise there are two copies of the same logic, the P11 duplication this plan already avoided for `findYamlFiles`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/registry/record.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/registry/record.ts src/utils/yaml-files.ts src/cli/helpers.ts tests/registry/record.test.ts
git commit -m "feat: recordLibraries orchestration [D40, D41, D57, D58]"
```

---

### Task 10: Wire recording into the CLI [D42, D43]

`buildCatalog` is the choke point for library **loading** but does not hold project identity — `parseConfigOptions` consumes the `PreflightResult` and discards it.

**Files:**
- Modify: `src/cli/helpers.ts:39-91`, `:132-137`
- Modify: `src/cli/index.ts`
- Test: `tests/registry/wiring.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { parseConfigOptions } from '../../src/cli/helpers.js';

describe('recording wiring (D42)', () => {
  let proj: string, orig: string | undefined, tmp: string;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'reg-'));
    orig = process.env.GVP_REGISTRY_ROOT;
    process.env.GVP_REGISTRY_ROOT = tmp;
    proj = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'w-')));
    fs.mkdirSync(path.join(proj, '.gvp', 'library'), { recursive: true });
    fs.writeFileSync(path.join(proj, '.gvp', 'library', 'x.yaml'), 'meta:\n  name: x\n');
  });
  afterEach(() => {
    if (orig === undefined) delete process.env.GVP_REGISTRY_ROOT; else process.env.GVP_REGISTRY_ROOT = orig;
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.rmSync(proj, { recursive: true, force: true });
  });

  it('surfaces a PreflightResult carrying gvpDir and projectId', () => {
    const cmd = new Command();
    // parseConfigOptions calls optsWithGlobals(), not opts().
    cmd.optsWithGlobals = () => ({}) as never;
    const prev = process.cwd();
    process.chdir(proj);
    try {
      const { preflight } = parseConfigOptions(cmd);
      expect(preflight.gvpDir).toBe(path.join(proj, '.gvp'));
      expect(typeof preflight.projectId).toBe('string');
    } finally {
      process.chdir(prev);
    }
  });

  it('does not write the registry during config parsing — that moved post-catalog (D53)', () => {
    const cmd = new Command();
    cmd.optsWithGlobals = () => ({}) as never;
    const prev = process.cwd();
    process.chdir(proj);
    try {
      parseConfigOptions(cmd);
      expect(fs.existsSync(path.join(tmp, 'by-id'))).toBe(false);
    } finally {
      process.chdir(prev);
    }
  });
});
```

- [ ] **Step 2: Update imports in `src/cli/helpers.ts`**

The file imports `runProjectPreflight, runRegistryPreflight` but not the `PreflightResult` type, which the new signatures need in two places. `runRegistryPreflight` also becomes unused here (its prune moved into `recordLibraries` in Task 9):

```typescript
import { runProjectPreflight, type PreflightResult } from '../config/preflight.js';
import { recordLibraries } from '../registry/record.js';
```

- [ ] **Step 3: Change `parseConfigOptions` to return the preflight**

```typescript
export function parseConfigOptions(cmd: Command): {
  config: GVPConfig;
  configOptions: LoadConfigOptions;
  preflight: PreflightResult;
} {
  // ... unchanged body ...
  // REMOVE the runRegistryPreflight(preflight, config) call at line 88 —
  // it now happens once, after catalog construction (D53).
  return { config, configOptions, preflight };
}
```

- [ ] **Step 4: Add the recording hook to `buildCatalog`**

Add an optional parameter and call `recordLibraries` just before returning the catalog:

```typescript
export function buildCatalog(
  config: GVPConfig,
  cwd: string = process.cwd(),
  libraryOverride?: string,
  storeOverride?: string,
  preflight?: PreflightResult,
): Catalog {
  // ... unchanged through catalog construction ...
  const catalog = new Catalog(resolved, config);
  logv(`Catalog built: ${catalog.getAllElements().length} elements`);

  if (config.registry?.enabled !== false) {
    const warning = recordLibraries({
      libraryDir: libraryDir!,
      externalSources: [...sourceDocCache.keys()],
      projectId: preflight?.projectId ?? null,
      projectName: preflight?.gvpDir ? path.basename(path.dirname(preflight.gvpDir)) : null,
      projectPath: preflight?.gvpDir ? path.dirname(preflight.gvpDir) : null,
    });
    if (warning) process.stderr.write(warning + '\n');
  }

  return catalog;
}
```

- [ ] **Step 5: Add the `--no-registry` flag**

In `src/cli/index.ts`, add to the program options and translate it to the env var the helper reads:

```typescript
  .option('--no-registry', 'Skip registry recording for this invocation (D43)')
```

`parseConfigOptions` already reads global options via `cmd.optsWithGlobals()`, so route the flag through the **config** rather than the environment — the spec names exactly two opt-out surfaces, and an env var would be an undocumented third:

```typescript
  // in parseConfigOptions: `const config = loadConfig(...)` at
  // src/cli/helpers.ts:75 must become `let config` — reassigning a const
  // is TS2588. (Line 82 nearby MUTATES rather than reassigns, so the file
  // gives no hint that this is needed.)
  let config = loadConfig(configOptions);
  ...
  if (opts.registry === false) {
    config = { ...config, registry: { ...config.registry, enabled: false } };
  }
```

`buildCatalog` then needs no env check: `config.registry?.enabled !== false` covers both surfaces.

- [ ] **Step 6: Update every `buildCatalog` call site**

All 11 commands call `buildCatalog(config, process.cwd(), getLibraryOverride(cmd), getStoreOverride(cmd))`. Update each to destructure and pass the preflight:

```typescript
const { config, preflight } = parseConfigOptions(cmd);
const catalog = buildCatalog(config, process.cwd(), getLibraryOverride(cmd), getStoreOverride(cmd), preflight);
```

Files: `add.ts`, `analyze.ts`, `diff.ts`, `edit.ts`, `export.ts`, `import.ts`, `inspect.ts`, `mv.ts`, `query.ts`, `review.ts`, `validate.ts`.

- [ ] **Step 7: Build and run the full suite**

Run: `npm run build && npx vitest run`
Expected: PASS, zero TypeScript errors

- [ ] **Step 8: Commit**

```bash
git add src/cli/ tests/registry/wiring.test.ts
git commit -m "feat: wire library recording into catalog construction [D42, D43]"
```

---

## Phase 3 — Read side and CLI

### Task 11: Registry query and inversion [D50, D53]

**Files:**
- Create: `src/registry/query.ts`
- Test: `tests/registry/query.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { loadAllLibraries, invertUsage } from '../../src/registry/query.js';
import { upsertLibraryEntry } from '../../src/registry/library-entry.js';
import { getProjectsDir } from '../../src/registry/paths.js';

describe('registry query (D50, D53)', () => {
  let tmp: string, orig: string | undefined;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'q-'));
    orig = process.env.GVP_REGISTRY_ROOT;
    process.env.GVP_REGISTRY_ROOT = tmp;
  });
  afterEach(() => {
    if (orig === undefined) delete process.env.GVP_REGISTRY_ROOT; else process.env.GVP_REGISTRY_ROOT = orig;
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  const entry = (over: Record<string, unknown> = {}) => ({
    name: 'personal', source: '/abs/lib', document_path: 'personal', file: 'personal.yaml',
    scope: null, project_id: null, library_id: null, element_counts: { values: 3 }, ...over,
  }) as any;

  it('derives kind and ref rather than reading stored fields (D50)', () => {
    upsertLibraryEntry('k1', entry());
    upsertLibraryEntry('k2', entry({ source: '@github:a/b@v0.7.0' }));
    const libs = loadAllLibraries();
    expect(libs.find((l) => l.key === 'k1')!.kind).toBe('local');
    expect(libs.find((l) => l.key === 'k2')!.kind).toBe('remote');
    expect(libs.find((l) => l.key === 'k2')!.ref).toBe('v0.7.0');
  });

  it('inverts the usage edge into seen_from with min/max timestamps', () => {
    fs.mkdirSync(getProjectsDir(), { recursive: true });
    fs.writeFileSync(path.join(getProjectsDir(), 'p1.yml'), yaml.dump({
      project_id: 'p1', project_name: 'one', locations: [{ path: '/p/one', last_seen: 'T' }],
      libraries: [{ hash: 'k1', first_seen: '2026-01-01T00:00:00Z', last_seen: '2026-02-01T00:00:00Z' }],
    }));
    fs.writeFileSync(path.join(getProjectsDir(), 'p2.yml'), yaml.dump({
      project_id: 'p2', project_name: 'two', locations: [{ path: '/p/two', last_seen: 'T' }],
      libraries: [{ hash: 'k1', first_seen: '2025-06-01T00:00:00Z', last_seen: '2026-09-01T00:00:00Z' }],
    }));
    const usage = invertUsage();
    expect(usage.get('k1')!.seen_from.sort()).toEqual(['/p/one', '/p/two']);
    expect(usage.get('k1')!.first_seen).toBe('2025-06-01T00:00:00Z');
    expect(usage.get('k1')!.last_seen).toBe('2026-09-01T00:00:00Z');
  });

  it('marks a remote whose cache is gone as not cached', () => {
    upsertLibraryEntry('k2', entry({ source: '@github:a/b@v0.7.0' }));
    expect(loadAllLibraries().find((l) => l.key === 'k2')!.cached).toBe(false);
  });

  it('skips corrupt project entries instead of throwing', () => {
    fs.mkdirSync(getProjectsDir(), { recursive: true });
    fs.writeFileSync(path.join(getProjectsDir(), 'bad.yml'), '::: nope');
    expect(() => invertUsage()).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/registry/query.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```typescript
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { getProjectsDir } from './paths.js';
import { listLibraryKeys, readLibraryEntry, type LibraryEntry } from './library-entry.js';
import { parseSource, isRemoteSource } from './key.js';
import { cachedPathFor } from '../inheritance/source-resolver.js';

export interface LibraryView extends LibraryEntry {
  key: string;
  /** Derived from source, never stored (D50). */
  kind: 'local' | 'remote';
  ref: string | null;
  /** Is the content available on disk right now? */
  cached: boolean;
}

export interface UsageView {
  seen_from: string[];
  first_seen: string | null;
  last_seen: string | null;
}

/**
 * Resolve an entry's on-disk directory with NO network I/O. Uses
 * cachedPathFor rather than the resolver: calling
 * GitSourceResolver.resolve on an evicted remote would clone it, which
 * is exactly what D54 rejects ("search would silently become N network
 * clones").
 */
function cachedDir(entry: LibraryEntry): string | null {
  if (!isRemoteSource(entry.source)) {
    return fs.existsSync(entry.source) ? entry.source : null;
  }
  return cachedPathFor(entry.source);
}

export function loadAllLibraries(): LibraryView[] {
  const out: LibraryView[] = [];
  for (const key of listLibraryKeys()) {
    const e = readLibraryEntry(key);
    if (!e) continue;
    const { kind, ref } = parseSource(e.source);
    out.push({ ...e, key, kind, ref, cached: cachedDir(e) !== null });
  }
  return out;
}

/** Invert the project-side usage edge into per-library usage (D53). */
export function invertUsage(): Map<string, UsageView> {
  const usage = new Map<string, UsageView>();
  let files: string[];
  try {
    files = fs.readdirSync(getProjectsDir()).filter((f) => f.endsWith('.yml'));
  } catch {
    return usage;
  }
  for (const f of files) {
    let entry: any;
    try {
      entry = yaml.load(fs.readFileSync(path.join(getProjectsDir(), f), 'utf-8'));
    } catch {
      continue;
    }
    if (!entry || typeof entry !== 'object' || !Array.isArray(entry.libraries)) continue;
    const paths: string[] = Array.isArray(entry.locations)
      ? entry.locations.map((l: any) => l?.path).filter((p: unknown) => typeof p === 'string')
      : [];
    for (const edge of entry.libraries) {
      if (!edge || typeof edge.hash !== 'string') continue;
      const prior = usage.get(edge.hash) ?? { seen_from: [], first_seen: null, last_seen: null };
      for (const p of paths) if (!prior.seen_from.includes(p)) prior.seen_from.push(p);
      if (!prior.first_seen || (edge.first_seen && edge.first_seen < prior.first_seen)) {
        prior.first_seen = edge.first_seen ?? prior.first_seen;
      }
      if (!prior.last_seen || (edge.last_seen && edge.last_seen > prior.last_seen)) {
        prior.last_seen = edge.last_seen ?? prior.last_seen;
      }
      usage.set(edge.hash, prior);
    }
  }
  return usage;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/registry/query.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/registry/query.ts tests/registry/query.test.ts
git commit -m "feat: registry query with derived kind/ref and usage inversion [D50, D53]"
```

---

### Task 12: Schema-dispatched search [D54, R6]

`search` must **not** match "names and statements". Decisions carry `rationale`; constraints carry `impact`. Hard-coding those names would ship a search structurally unable to match a decision — the exact content the motivating incident was about — and would violate `R6`.

**Files:**
- Modify: `src/registry/query.ts`
- Test: `tests/registry/search.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { searchLibraries, searchLibrariesWithSkips } from '../../src/registry/query.js';
import { upsertLibraryEntry } from '../../src/registry/library-entry.js';

describe('libs search (D54, R6)', () => {
  let tmp: string, lib: string, orig: string | undefined;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 's-'));
    orig = process.env.GVP_REGISTRY_ROOT;
    process.env.GVP_REGISTRY_ROOT = tmp;
    lib = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sl-')));
    fs.writeFileSync(path.join(lib, 'p.yaml'),
      'meta:\n  name: personal\n' +
      'principles:\n  - id: P17\n    name: Build a tentative flex point\n    statement: seam uncertain\n' +
      'decisions:\n  - id: D1\n    name: Pick a thing\n    rationale: the flex point argument\n');
    upsertLibraryEntry('k', {
      name: 'personal', source: lib, document_path: 'p', file: 'p.yaml', scope: null,
      project_id: null, library_id: null, element_counts: { principles: 1, decisions: 1 },
    });
  });
  afterEach(() => {
    if (orig === undefined) delete process.env.GVP_REGISTRY_ROOT; else process.env.GVP_REGISTRY_ROOT = orig;
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.rmSync(lib, { recursive: true, force: true });
  });

  it('matches element names', () => {
    expect(searchLibraries('tentative').map((r) => r.id)).toContain('P17');
  });

  it('matches a DECISION rationale — the incident case', () => {
    const ids = searchLibraries('flex point argument').map((r) => r.id);
    expect(ids).toContain('D1');
  });

  it('matches a principle statement', () => {
    expect(searchLibraries('seam uncertain').map((r) => r.id)).toContain('P17');
  });

  it('is case-insensitive', () => {
    expect(searchLibraries('TENTATIVE').map((r) => r.id)).toContain('P17');
  });

  it('reports uncached remotes rather than silently skipping them', () => {
    upsertLibraryEntry('r', {
      name: 'up', source: '@github:a/b@v1', document_path: 'x', file: 'x.yaml', scope: null,
      project_id: null, library_id: null, element_counts: {},
    });
    const { skipped } = searchLibrariesWithSkips('tentative');
    expect(skipped).toContain('@github:a/b@v1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/registry/search.test.ts`
Expected: FAIL — `searchLibraries` not exported

- [ ] **Step 3: Write the implementation**

Append to `src/registry/query.ts`, and add `createSourceResolver` to the existing `source-resolver.js` import at the top — it is needed only by `--fetch`, so importing it in Task 11 would leave a dead import at that commit:

```typescript
import { createSourceResolver } from '../inheritance/source-resolver.js';
import { CategoryRegistry } from '../model/category-registry.js';
import { loadDefaults } from '../schema/defaults-loader.js';
import type { CategoryDefinition } from '../schema/category-definition.js';

export interface SearchHit {
  key: string;
  library: string | null;
  document_path: string;
  category: string;
  id: string;
  name: string;
  field: string;
  excerpt: string;
}

/**
 * Search element names and each category's PRIMARY FIELD across every
 * known library (D54).
 *
 * The primary field is resolved from the category schema, never
 * hard-coded (R6): decisions carry `rationale`, constraints carry
 * `impact`, principles carry `statement`. Hard-coding "statement" would
 * make it impossible to match a decision — precisely the content the
 * motivating incident was about.
 *
 * Uncached remotes are SKIPPED and NAMED, never silently dropped, and
 * never fetched: resolving one would trigger network I/O inside a read
 * command. `--fetch` opts in at the CLI layer.
 */
export function searchLibrariesWithSkips(
  query: string,
  opts: { fetch?: boolean } = {},
): { results: SearchHit[]; skipped: string[]; missingLocal: string[] } {
  const needle = query.toLowerCase();
  const baseRegistry = CategoryRegistry.fromDefaults(loadDefaults());
  const results: SearchHit[] = [];
  const skipped: string[] = [];
  const missingLocal: string[] = [];

  for (const lib of loadAllLibraries()) {
    // Cache-only by default. cachedPathFor NEVER performs network I/O
    // (Task 5) -- calling the resolver here would clone.
    let dir = cachedDir(lib);
    if (!dir && lib.kind === 'local') {
      // A local library whose directory is gone is NOT an uncached remote
      // and is never eligible for --fetch: D54's skip/fetch policy is
      // about remotes. The next prune removes this entry.
      missingLocal.push(lib.source);
      continue;
    }
    if (!dir) {
      if (!opts.fetch) { skipped.push(lib.source); continue; }
      // --fetch: network I/O is explicitly opted into.
      try {
        dir = createSourceResolver(process.cwd()).resolve(lib.source);
      } catch {
        skipped.push(lib.source);
        continue;
      }
    }
    const file = path.join(dir, lib.file);
    let data: Record<string, unknown>;
    try {
      const raw = yaml.load(fs.readFileSync(file, 'utf-8'));
      if (!raw || typeof raw !== 'object') continue;
      data = raw as Record<string, unknown>;
    } catch { continue; }

    // Merge the document's own category definitions, as buildCatalog's
    // pass 1 does. Without this, elements in a user-defined category are
    // unsearchable -- the silent-miss failure #15 was filed about.
    const docCats = ((data.meta as Record<string, unknown> | undefined)?.definitions as
      Record<string, unknown> | undefined)?.categories;
    const registry = docCats && typeof docCats === 'object'
      ? baseRegistry.merge(docCats as Record<string, CategoryDefinition>)
      : baseRegistry;

    for (const [yamlKey, list] of Object.entries(data)) {
      if (yamlKey === 'meta' || !Array.isArray(list)) continue;
      const catDef = registry.getByYamlKey(yamlKey);
      // getByYamlKey returns { name, def } -- the CategoryDefinition is
      // `.def`. Getting this wrong makes EVERY category fall back to one
      // built-in's field name, so decisions (rationale) and constraints
      // (impact) become unsearchable -- the failure D54 exists to prevent.
      // When primary_field is absent we search `name` only rather than
      // guessing a field name, per R6.
      const primary = catDef?.def.primary_field;
      const fields = primary ? ['name', primary] : ['name'];
      for (const el of list) {
        if (!el || typeof el !== 'object') continue;
        const e = el as Record<string, unknown>;
        for (const field of fields) {
          const val = e[field];
          if (typeof val !== 'string' || !val.toLowerCase().includes(needle)) continue;
          results.push({
            key: lib.key,
            library: lib.name,
            document_path: lib.document_path,
            category: yamlKey,
            id: String(e.id ?? '?'),
            name: String(e.name ?? ''),
            field,
            excerpt: val.slice(0, 160),
          });
          break;
        }
      }
    }
  }
  return { results, skipped, missingLocal };
}

export function searchLibraries(query: string, opts: { fetch?: boolean } = {}): SearchHit[] {
  return searchLibrariesWithSkips(query, opts).results;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/registry/search.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/registry/query.ts tests/registry/search.test.ts
git commit -m "feat: schema-dispatched search across known libraries [D54, R6]"
```

---

### Task 13: The `cairn libs` command family [D54, D55]

**Files:**
- Create: `src/cli/commands/libs.ts`
- Modify: `src/cli/index.ts`
- Test: `tests/cli/libs.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { libsCommand } from '../../src/cli/commands/libs.js';

describe('cairn libs (D54)', () => {
  it('registers list, show, search, forget, and prune', () => {
    const names = libsCommand().commands.map((c) => c.name()).sort();
    expect(names).toEqual(['forget', 'list', 'prune', 'search', 'show']);
  });

  it('exposes --json on list, show, and search', () => {
    const cmd = libsCommand();
    for (const sub of ['list', 'show', 'search']) {
      const c = cmd.commands.find((x) => x.name() === sub)!;
      expect(c.options.some((o) => o.long === '--json')).toBe(true);
    }
  });

  it('exposes --kind and --scope on list', () => {
    const list = libsCommand().commands.find((c) => c.name() === 'list')!;
    const longs = list.options.map((o) => o.long);
    expect(longs).toContain('--kind');
    expect(longs).toContain('--scope');
  });

  it('exposes --fetch on search', () => {
    const s = libsCommand().commands.find((c) => c.name() === 'search')!;
    expect(s.options.some((o) => o.long === '--fetch')).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/cli/libs.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the command**

```typescript
import { Command } from 'commander';
import { loadAllLibraries, invertUsage, searchLibrariesWithSkips } from '../../registry/query.js';
import { listLibraryKeys, readLibraryEntry, pruneLibraryEntries } from '../../registry/library-entry.js';
import { getLibrariesDir } from '../../registry/paths.js';
import * as fs from 'fs';
import * as path from 'path';

export function libsCommand(): Command {
  const cmd = new Command('libs').description('Inspect the registry of GVP libraries cairn has resolved');

  cmd.command('list')
    .description('Enumerate every known library document')
    .option('--kind <kind>', 'Filter by kind (local|remote)')
    .option('--scope <scope>', 'Filter by meta.scope')
    .option('--json', 'Machine-readable output')
    .action((opts) => {
      let libs = loadAllLibraries();
      if (opts.kind) libs = libs.filter((l) => l.kind === opts.kind);
      if (opts.scope) libs = libs.filter((l) => l.scope === opts.scope);
      if (opts.json) { console.log(JSON.stringify(libs, null, 2)); return; }
      if (libs.length === 0) { console.log('No libraries recorded yet.'); return; }
      for (const l of libs.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))) {
        const total = Object.values(l.element_counts).reduce((a, b) => a + b, 0);
        const mark = l.cached ? '' : ' (not cached)';
        console.log(`${(l.name ?? '(unnamed)').padEnd(22)} ${l.kind.padEnd(6)} ${String(total).padStart(4)}  ${l.source}${mark}`);
      }
    });

  cmd.command('show')
    .description('Show one library document, including which projects have used it')
    .argument('<selector>', 'meta.name, or <source>:<document_path> to disambiguate')
    .option('--json', 'Machine-readable output')
    .action((selector: string, opts) => {
      const usage = invertUsage();
      let matches = loadAllLibraries().filter((l) => l.name === selector);
      if (matches.length === 0) {
        matches = loadAllLibraries().filter((l) => `${l.source}:${l.document_path}` === selector);
      }
      if (matches.length === 0) { console.error(`No library matches '${selector}'.`); process.exit(1); }
      // Names are explicitly NOT unique (D46) — never silently first-match.
      if (matches.length > 1 && !opts.json) {
        console.error(`'${selector}' is ambiguous — ${matches.length} matches. Disambiguate with <source>:<document_path>:`);
        for (const m of matches) console.error(`  ${m.source}:${m.document_path}`);
        process.exit(1);
      }
      const out = matches.map((m) => ({ ...m, usage: usage.get(m.key) ?? { seen_from: [], first_seen: null, last_seen: null } }));
      if (opts.json) { console.log(JSON.stringify(out, null, 2)); return; }
      const m = out[0]!;
      console.log(`${m.name ?? '(unnamed)'}  [${m.kind}${m.cached ? '' : ', not cached'}]`);
      console.log(`  source:   ${m.source}`);
      console.log(`  file:     ${m.file}`);
      if (m.ref) console.log(`  ref:      ${m.ref}`);
      if (m.scope) console.log(`  scope:    ${m.scope}`);
      console.log(`  elements: ${Object.entries(m.element_counts).map(([k, v]) => `${k}=${v}`).join(' ') || '(none)'}`);
      if (m.usage.first_seen) console.log(`  first seen: ${m.usage.first_seen}`);
      if (m.usage.last_seen) console.log(`  last seen:  ${m.usage.last_seen}`);
      console.log(`  seen from:`);
      for (const p of m.usage.seen_from) console.log(`    ${p}`);
    });

  cmd.command('search')
    .description('Search element names and primary fields across all known libraries')
    .argument('<query>')
    .option('--fetch', 'Fetch uncached remote libraries (performs network I/O)')
    .option('--json', 'Machine-readable output')
    .action((query: string, opts) => {
      const { results, skipped, missingLocal } = searchLibrariesWithSkips(query, { fetch: Boolean(opts.fetch) });
      if (opts.json) { console.log(JSON.stringify({ results, skipped, missingLocal }, null, 2)); return; }
      for (const r of results) {
        console.log(`${r.library ?? '(unnamed)'}:${r.id}  [${r.category}/${r.field}]  ${r.name}`);
        console.log(`    ${r.excerpt}`);
      }
      if (results.length === 0) console.log('No matches.');
      // Never silently miss — naming skips is the point (D54).
      for (const s of skipped) {
        console.error(opts.fetch
          ? `cairn: could not fetch remote ${s}`
          : `cairn: skipped uncached remote ${s} (use --fetch to include)`);
      }
      for (const s of missingLocal) {
        console.error(`cairn: local library no longer on disk, skipped: ${s}`);
      }
    });

  cmd.command('forget')
    .description('Remove one library entry from the registry')
    .argument('<selector>', '<source>:<document_path>')
    .action((selector: string) => {
      let removed = 0;
      for (const key of listLibraryKeys()) {
        const e = readLibraryEntry(key);
        if (!e) continue;
        // Match ONLY the unambiguous selector. `name` is explicitly not
        // unique (D46), so matching it would silently delete every entry
        // sharing a name -- `show` refuses to guess, and so must this.
        if (`${e.source}:${e.document_path}` === selector) {
          // A concurrent prune runs on every cairn invocation (C2), so the
          // file may already be gone.
          try { fs.unlinkSync(path.join(getLibrariesDir(), `${key}.yml`)); removed++; } catch { /* gone */ }
        }
      }
      console.log(`Removed ${removed} entr${removed === 1 ? 'y' : 'ies'}.`);
    });

  cmd.command('prune')
    .description('Drop local entries whose document is gone; optionally drop uncached remotes')
    .option('--remote', 'Also drop remote entries that are no longer cached')
    .action((opts) => {
      // Delegate the local half to the ONE implementation (Task 6).
      // Duplicating it here would be the redundant-mechanism smell P11
      // exists to catch, and the two copies would drift.
      const before = listLibraryKeys().length;
      pruneLibraryEntries();
      let removed = before - listLibraryKeys().length;
      if (opts.remote) {
        // Remote eviction is opt-in only (D55): an uncached remote is
        // still re-fetchable, so it is never dropped automatically.
        for (const lib of loadAllLibraries()) {
          if (lib.kind === 'remote' && !lib.cached) {
            try { fs.unlinkSync(path.join(getLibrariesDir(), `${lib.key}.yml`)); removed++; } catch { /* gone */ }
          }
        }
      }
      console.log(`Pruned ${removed} entr${removed === 1 ? 'y' : 'ies'}.`);
    });

  return cmd;
}
```

- [ ] **Step 4: Register the command**

In `src/cli/index.ts`:

```typescript
import { libsCommand } from './commands/libs.js';
// ...
program.addCommand(libsCommand());
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run build && npx vitest run tests/cli/libs.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 6: Commit**

```bash
git add src/cli/commands/libs.ts src/cli/index.ts tests/cli/libs.test.ts
git commit -m "feat: cairn libs list/show/search/forget/prune [D54, D55]"
```

---

### Task 14: Concurrency and end-to-end verification [P18, C2, D52]

**Files:**
- Test: `tests/registry/concurrency.test.ts`
- Test: `tests/registry/e2e.test.ts`

- [ ] **Step 1: Write the concurrency test**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { spawn } from 'child_process';
import * as yaml from 'js-yaml';
import { upsertLibraryEntry, readLibraryEntry } from '../../src/registry/library-entry.js';
import { getLibrariesDir } from '../../src/registry/paths.js';

// Requires a fresh `npm run build` — these spawn real node processes
// against dist/.
function assertBuilt(): void {
  if (!fs.existsSync(path.resolve('dist/registry/library-entry.js'))) {
    throw new Error('dist/ missing — run `npm run build` first');
  }
}

describe('registry concurrency (C2, P18, D52)', () => {
  let tmp: string, orig: string | undefined;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-'));
    orig = process.env.GVP_REGISTRY_ROOT;
    process.env.GVP_REGISTRY_ROOT = tmp;
  });
  afterEach(() => {
    if (orig === undefined) delete process.env.GVP_REGISTRY_ROOT; else process.env.GVP_REGISTRY_ROOT = orig;
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  // A REMOTE source: pruneLibraryEntries never removes remote entries
  // (D55), so in the prune-race test below only a torn read could delete
  // it -- which is exactly the D52 failure being hunted.
  const entry = () => ({
    name: 'x', source: '@github:a/b@v1', document_path: 'd', file: 'd.yaml', scope: null,
    project_id: null, library_id: null, element_counts: { values: 1 },
  }) as any;

  // NOTE: in-process Promise.resolve().then(...) proves NOTHING here —
  // each callback runs a synchronous fs sequence to completion, so there
  // is no interleaving and the assertions pass trivially. Real
  // concurrency requires real processes.
  it('concurrent PROCESSES leave exactly one valid entry', () => {
    assertBuilt();
    const script = path.join(os.tmpdir(), `w-${process.pid}.mjs`);
    fs.writeFileSync(script, `
      import { upsertLibraryEntry } from '${path.resolve('dist/registry/library-entry.js')}';
      const base = ${JSON.stringify(entry())};
      // Each iteration writes DISTINCT bytes. Identical payloads would hit
      // upsertLibraryEntry's read-compare-skip and turn this into a
      // tautology -- after the first write there is nothing left to tear,
      // so it would pass even without atomic writes.
      for (let i = 0; i < 200; i++) {
        upsertLibraryEntry('k', { ...base, element_counts: { values: i } });
      }
    `);
    const procs = Array.from({ length: 8 }, () =>
      spawn(process.execPath, [script], { env: { ...process.env, GVP_REGISTRY_ROOT: tmp } }));
    return Promise.all(procs.map((p) => new Promise((res) => p.on('exit', res)))).then(() => {
      fs.unlinkSync(script);
      const files = fs.readdirSync(getLibrariesDir());
      expect(files.filter((f) => f.endsWith('.tmp'))).toEqual([]);
      expect(files).toEqual(['k.yml']);
      // NOTE: this asserts only on the FINAL state, after every writer
      // has exited, so it passes with or without atomic writes. It guards
      // against leftover temp files and lost entries, not against torn
      // reads -- the concurrent-reader test below is what discriminates.
      const final = readLibraryEntry('k');
      expect(final).not.toBeNull();
      expect(final!.source).toBe('@github:a/b@v1');
      expect(final!.document_path).toBe('d');
      expect(Object.keys(final!.element_counts)).toEqual(['values']);
    });
  }, 30_000);

  it('two concurrent same-project runs both retain their usage edges', () => {
    assertBuilt();
    // D53's merge property: a blind rewrite would drop one side's edge.
    const script = path.join(os.tmpdir(), `e-${process.pid}.mjs`);
    fs.writeFileSync(script, `
      import { upsertRegistryEntry } from '${path.resolve('dist/config/registry.js')}';
      const which = process.argv[2];
      for (let i = 0; i < 100; i++) upsertRegistryEntry('pid-1', 'proj', '/tmp/proj', [which]);
    `);
    const procs = ['aaa', 'bbb'].map((w) =>
      spawn(process.execPath, [script, w], { env: { ...process.env, GVP_REGISTRY_ROOT: tmp } }));
    return Promise.all(procs.map((p) => new Promise((res) => p.on('exit', res)))).then(() => {
      fs.unlinkSync(script);
      const entry: any = yaml.load(fs.readFileSync(path.join(tmp, 'by-id', 'pid-1.yml'), 'utf-8'));
      expect(entry.libraries.map((l: any) => l.hash).sort()).toEqual(['aaa', 'bbb']);
    });
  }, 30_000);

  it('a concurrent PRUNE never deletes a live entry (the D52 data-loss path)', () => {
    assertBuilt();
    // D52's actual argument: a torn read makes pruneLibraryEntries unlink
    // a LIVE entry, because it deletes anything it cannot parse. Nothing
    // else in this suite exercises that path.
    const w = path.join(os.tmpdir(), `wp-${process.pid}.mjs`);
    const pr = path.join(os.tmpdir(), `pp-${process.pid}.mjs`);
    fs.writeFileSync(w, `
      import { upsertLibraryEntry } from '${path.resolve('dist/registry/library-entry.js')}';
      const base = ${JSON.stringify(entry())};
      for (let i = 0; i < 400; i++) upsertLibraryEntry('k', { ...base, element_counts: { values: i } });
    `);
    fs.writeFileSync(pr, `
      import { pruneLibraryEntries } from '${path.resolve('dist/registry/library-entry.js')}';
      for (let i = 0; i < 400; i++) pruneLibraryEntries();
    `);
    const procs = [
      ...Array.from({ length: 3 }, () => spawn(process.execPath, [w], { env: { ...process.env, GVP_REGISTRY_ROOT: tmp } })),
      spawn(process.execPath, [pr], { env: { ...process.env, GVP_REGISTRY_ROOT: tmp } }),
    ];
    return Promise.all(procs.map((p) => new Promise((res) => p.on('exit', res)))).then(() => {
      fs.unlinkSync(w); fs.unlinkSync(pr);
      // The entry's source is /abs, which does not exist, so a
      // LOCAL-kind prune would legitimately remove it -- use a remote
      // source here so only a TORN READ could cause deletion.
      expect(readLibraryEntry('k')).not.toBeNull();
    });
  }, 30_000);

  it('a concurrent reader never observes a partial file', () => {
    assertBuilt();
    const script = path.join(os.tmpdir(), `w2-${process.pid}.mjs`);
    fs.writeFileSync(script, `
      import { upsertLibraryEntry } from '${path.resolve('dist/registry/library-entry.js')}';
      const base = ${JSON.stringify(entry())};
      // Distinct bytes per iteration -- see the note in the test above.
      for (let i = 0; i < 400; i++) {
        upsertLibraryEntry('k', { ...base, element_counts: { values: i } });
      }
    `);
    const procs = Array.from({ length: 4 }, () =>
      spawn(process.execPath, [script], { env: { ...process.env, GVP_REGISTRY_ROOT: tmp } }));
    let bad = 0, reads = 0;
    const done = Promise.all(procs.map((p) => new Promise((res) => p.on('exit', res))));
    const poll = setInterval(() => {
      // THE DISCRIMINATOR: an entry that EXISTS but does not parse.
      //
      // Counting null as acceptable is what made an earlier version of
      // this test unable to fail. `sortKeys: true` sorts `source` last in
      // the dumped YAML, so every truncated read is missing it and
      // readLibraryEntry returns null -- converting the exact failure this
      // test hunts into a pass. Non-atomic writes also cannot produce a
      // "blended" record, because O_TRUNC prevents old bytes surviving.
      //
      // Measured: with a bare writeFileSync this counter lands in the
      // 10-22 range per run; with temp+rename it is 0.
      if (!fs.existsSync(path.join(getLibrariesDir(), 'k.yml'))) return;
      reads++;
      const e = readLibraryEntry('k');
      if (e === null) { bad++; return; }
      if (e.source !== '@github:a/b@v1' || e.document_path !== 'd'
          || typeof e.element_counts?.values !== 'number') bad++;
    }, 1);
    return done.then(() => {
      clearInterval(poll);
      fs.unlinkSync(script);
      expect(reads).toBeGreaterThan(0);
      expect(bad).toBe(0);
    });
  }, 30_000);
});
```

- [ ] **Step 2: Add a separate test for the skip behavior**

Read-compare-skip deserves its own assertion, kept away from the
concurrency tests so it cannot mask them:

```typescript
  it('skips the write when the bytes are already identical', () => {
    upsertLibraryEntry('k', entry());
    const before = fs.statSync(path.join(getLibrariesDir(), 'k.yml')).mtimeMs;
    upsertLibraryEntry('k', entry());
    expect(fs.statSync(path.join(getLibrariesDir(), 'k.yml')).mtimeMs).toBe(before);
  });
```

- [ ] **Step 3: Run it**

Run: `npm run build && npx vitest run tests/registry/concurrency.test.ts`
Expected: PASS (4 tests)

The build is REQUIRED — the test spawns real node processes against
`dist/registry/library-entry.js`, which does not exist until `src/registry/`
has been compiled. Without it all 8 children fail to import and the failure
looks like an atomicity bug.

- [ ] **Step 4: Write the end-to-end test**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const CLI = path.resolve('dist/cli/index.js');

// `vitest run` alone would silently test a stale dist/. Fail loudly.
function assertFreshBuild(): void {
  if (!fs.existsSync(CLI)) throw new Error('dist/ missing — run `npm run build` first');
  const built = fs.statSync(CLI).mtimeMs;
  // NOTE: `recursive: true` requires Node >= 18.17. On 18.0-18.16 it
  // silently returns only top-level entries, so this would see just
  // src/*.ts. package.json declares engines >= 18.0.0.
  const newest = fs.readdirSync('src', { recursive: true, encoding: 'utf-8' })
    .filter((f) => typeof f === 'string' && f.endsWith('.ts'))
    .map((f) => fs.statSync(path.join('src', f)).mtimeMs)
    .reduce((a, b) => Math.max(a, b), 0);
  if (newest > built) throw new Error('dist/ is older than src/ — run `npm run build` first');
}

function run(args: string[], cwd: string, root: string): string {
  return execFileSync('node', [CLI, ...args], {
    cwd, encoding: 'utf-8', env: { ...process.env, GVP_REGISTRY_ROOT: root },
  });
}

describe('libs end-to-end', () => {
  let proj: string, root: string;
  beforeEach(() => {
    assertFreshBuild();
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-reg-'));
    proj = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-p-')));
    const lib = path.join(proj, '.gvp', 'library');
    fs.mkdirSync(lib, { recursive: true });
    fs.writeFileSync(path.join(lib, 'main.yaml'),
      'meta:\n  name: e2elib\n' +
      'goals:\n  - id: G1\n    name: A goal\n    statement: g\n' +
      'values:\n  - id: V1\n    name: A value\n    statement: v\n' +
      'decisions:\n  - id: D1\n    name: A choice\n' +
      '    rationale: chosen for the zebra property\n' +
      '    maps_to:\n      - e2elib:G1\n      - e2elib:V1\n');
  });
  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(proj, { recursive: true, force: true });
  });

  it('validate populates the registry and list reports the document', () => {
    run(['validate'], proj, root);
    const libs = JSON.parse(run(['libs', 'list', '--json'], proj, root));
    expect(libs.map((l: any) => l.name)).toContain('e2elib');
    expect(libs.find((l: any) => l.name === 'e2elib').kind).toBe('local');
  });

  it('search matches a DECISION rationale — the incident case', () => {
    run(['validate'], proj, root);
    const { results } = JSON.parse(run(['libs', 'search', 'zebra property', '--json'], proj, root));
    expect(results.map((r: any) => r.id)).toContain('D1');
    expect(results.find((r: any) => r.id === 'D1').field).toBe('rationale');
  });

  it('show reports which projects have used the library', () => {
    run(['validate'], proj, root);
    const out = JSON.parse(run(['libs', 'show', 'e2elib', '--json'], proj, root));
    expect(out[0].usage.seen_from).toContain(proj);
  });

  it('records a remote @github: source end-to-end', () => {
    // Seed the cache directly so no network I/O occurs, then inherit it.
    // The spec's end-to-end item requires BOTH a local library and a
    // remote @github: source to appear in `libs list`.
    // There is no cacheDir override on the CLI path, so this necessarily
    // touches the real cache. Fail loudly rather than overwrite if
    // something is already there (a crashed earlier run, or a real entry).
    const cacheRoot = path.join(os.homedir(), '.cache', 'cairn', 'sources', 'github', 'e2e--fixture');
    if (fs.existsSync(cacheRoot)) {
      throw new Error(`${cacheRoot} already exists — remove it before running this test`);
    }
    const cached = path.join(cacheRoot, 'v1.0.0');
    fs.mkdirSync(cached, { recursive: true });
    fs.writeFileSync(path.join(cached, 'up.yaml'),
      'meta:\n  name: e2eup\nvalues:\n  - id: V1\n    name: Up\n    statement: u\n');
    try {
      const main = path.join(proj, '.gvp', 'library', 'main.yaml');
      fs.writeFileSync(main, fs.readFileSync(main, 'utf-8').replace(
        'meta:\n  name: e2elib\n',
        'meta:\n  name: e2elib\n  inherits:\n    - source: "@github:e2e/fixture@v1.0.0"\n'));
      run(['validate'], proj, root);
      const libs = JSON.parse(run(['libs', 'list', '--json'], proj, root));
      const remote = libs.find((l: any) => l.name === 'e2eup');
      expect(remote).toBeDefined();
      expect(remote.kind).toBe('remote');
      expect(remote.ref).toBe('v1.0.0');
      expect(libs.find((l: any) => l.name === 'e2elib')).toBeDefined();
    } finally {
      fs.rmSync(cacheRoot, { recursive: true, force: true });
    }
  });

  it('an unwritable registry leaves exit code and stdout unchanged (D57)', () => {
    // The D57 guarantee exercised through the real CLI, not through
    // recordLibraries in isolation.
    const unwritable = path.join(root, 'blocked');
    fs.mkdirSync(unwritable);
    fs.chmodSync(unwritable, 0o500);
    try {
      const out = run(['validate'], proj, unwritable); // must not throw
      expect(typeof out).toBe('string');
    } finally {
      fs.chmodSync(unwritable, 0o700);
    }
  });

  it('--no-registry writes nothing', () => {
    const clean = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-clean-'));
    run(['--no-registry', 'validate'], proj, clean);
    expect(fs.existsSync(path.join(clean, 'libraries'))).toBe(false);
    fs.rmSync(clean, { recursive: true, force: true });
  });
});
```

- [ ] **Step 5: Run the full suite and build**

Run: `npm run build && npx vitest run`
Expected: PASS, zero TypeScript errors

- [ ] **Step 6: Make `npm test` build first**

`assertBuilt()` and `assertFreshBuild()` throw when `dist/` is missing or stale, but `package.json` still has `"test": "vitest run"` — so a fresh clone's `npm test` now errors. Change it:

```json
    "test": "npm run build && vitest run",
```

Verify: `rm -rf dist && npm test` completes rather than throwing.

- [ ] **Step 7: Add refs to the guiding elements**

Every decision D40–D58 needs `refs` pointing at its implementation, so `cairn validate --coverage` passes. Use `cairn edit`, never direct YAML edits.

Run: `node dist/cli/index.js validate --coverage`
Expected: no `W013` for D40–D58

- [ ] **Step 8: Commit**

```bash
git add tests/registry/ package.json .gvp/library/gvp.yaml
git commit -m "test: concurrency and end-to-end coverage; add refs to D40-D58 [P18, C2, D52]"
```

---

### Task 15: Document the registry's delete-and-rebuild semantics [D56]

D22 argued "registry, not cache" because "cache" implies the tool will rebuild. #15 requires "always safe to delete and rebuild." Both are right about different halves, and the documentation must state both rather than collapse to either label.

**Files:**
- Modify: `README.md`
- Test: `tests/registry/docs.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';

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
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/registry/docs.test.ts`
Expected: FAIL — README has no registry section

- [ ] **Step 3: Add the README section**

```markdown
## Library registry

Cairn records every library it resolves into `~/.gvp/registry/`
(override with `GVP_REGISTRY_ROOT`), so a new project can discover
guiding elements that already exist instead of re-deriving them.

    cairn libs list                  # everything cairn has seen
    cairn libs search "flex point"   # across every known library
    cairn libs show personal         # detail + which projects use it

Recording is on by default. Opt out with `registry.enabled: false` in
any config layer, or `--no-registry` for one invocation. Recording
never changes a command's exit code or output; on failure it warns once
to stderr and carries on.

**Deleting the registry is safe — but rebuilding it is lossy.** Nothing
breaks if you `rm -rf ~/.gvp/registry`, and cairn will not complain.
But it does not rebuild itself: each library reappears only when cairn
next resolves it, so a library you have not touched since deleting is
simply absent until you work in a project that uses it.
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/registry/docs.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add README.md tests/registry/docs.test.ts
git commit -m "docs: registry location, commands, and delete-vs-rebuild semantics [D56]"
```

---

## Post-implementation: the #15 handoff comment

**Do not do this until the feature is merged and working.** #15's author has a monitor polling that ticket, and the comment triggers a downstream `ai-infra` rule. Posting it early points agents at a path that does not exist.

- [ ] Verify `cairn libs list` works on a real machine with a populated registry
- [ ] Comment on #15:

> Landed. Registry root: `~/.gvp/registry/` (override with `GVP_REGISTRY_ROOT`).
> Library entries in `libraries/`, project entries in `by-id/`.
> Enumerate: `cairn libs list` (`--json`, `--kind`, `--scope`)
> Search: `cairn libs search "<query>"` — matches element names and each category's primary field, so decision rationale is searchable.
> Detail: `cairn libs show <name>` — includes which projects have used it.
> Recording is on by default; opt out with `registry.enabled: false` or `--no-registry`.
>
> Note on the priority order in the issue: tiers 1 (personal), 3 (similar projects), and 4 (cherry-pick) are served. **Tier 2 (organization-scoped) is not** — cairn has no org-scope concept; `--scope` filters an arbitrary user-supplied `meta.scope` string. That gap is tracked separately.

---

## Deferred / not in this plan

- **#16 portable library UUID** — `R9` is recorded but not enforceable; `library_id` is read-if-present only.
- **Organization-scoped libraries** — no cairn concept exists (see #15 comment above).
- **Caching remote library content** for offline enumeration — #15 ranks it below the index.
- **Throttling the prune.** Both prunes read and yaml-parse every entry on every invocation, and D55's unbounded remote retention makes that cost grow. A stamp-file gate was drafted and dropped: D22 records "auto-prune on access" and D52's rationale depends on it running every time, so changing the cadence needs a decision amendment rather than a quiet optimization. Revisit once real registries are large enough to measure.
