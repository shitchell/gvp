import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as yaml from 'js-yaml';
import {
  upsertRegistryEntry,
  pruneStaleRegistryEntries,
  getRegistryDir,
  type RegistryEntry,
} from '../../src/config/registry.js';
import {
  runProjectPreflight,
  runRegistryPreflight,
} from '../../src/config/preflight.js';
import { configSchema } from '../../src/config/schema.js';

/**
 * Tests for the global project registry (D22):
 * opt-in cross-project discovery via ~/.gvp/registry/by-id/<uuid>.yml
 * entries. All tests use the GVP_REGISTRY_ROOT env var to redirect
 * the registry into a tmpdir, so real user state is never touched.
 *
 * Contract:
 *   - upsertRegistryEntry creates missing entries with project_id,
 *     project_name, and a single-location list
 *   - Second upsert at same path updates only last_seen
 *   - Second upsert at a different path appends to locations
 *   - pruneStaleRegistryEntries removes entries whose paths are gone
 *   - pruneStaleRegistryEntries keeps entries with at least one
 *     still-valid location and trims the gone ones
 *   - runRegistryPreflight is a no-op when registry.enabled is false
 *   - runRegistryPreflight is a no-op when there's no project_id
 *   - runRegistryPreflight upserts when enabled AND project has id
 *   - Corrupt entries are replaced, not propagated
 */
describe('Registry (D22)', () => {
  let tmpDir: string;
  let originalRegistryRoot: string | undefined;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cairn-registry-'));
    originalRegistryRoot = process.env.GVP_REGISTRY_ROOT;
    process.env.GVP_REGISTRY_ROOT = path.join(tmpDir, 'registry-root');
  });

  afterEach(() => {
    if (originalRegistryRoot === undefined) {
      delete process.env.GVP_REGISTRY_ROOT;
    } else {
      process.env.GVP_REGISTRY_ROOT = originalRegistryRoot;
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function readEntry(projectId: string): RegistryEntry {
    const entryPath = path.join(getRegistryDir(), `${projectId}.yml`);
    return yaml.load(fs.readFileSync(entryPath, 'utf-8')) as RegistryEntry;
  }

  describe('upsertRegistryEntry', () => {
    it('creates a fresh entry with project_id, name, and a single location', () => {
      const uuid = '12345678-1234-1234-1234-123456789abc';
      const projectPath = path.join(tmpDir, 'proj');
      fs.mkdirSync(projectPath, { recursive: true });

      upsertRegistryEntry(uuid, 'my-project', projectPath);

      const entry = readEntry(uuid);
      expect(entry.project_id).toBe(uuid);
      expect(entry.project_name).toBe('my-project');
      expect(entry.locations).toHaveLength(1);
      expect(entry.locations[0]!.path).toBe(projectPath);
      expect(entry.locations[0]!.last_seen).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
      );
    });

    it('updates last_seen on repeated upsert at the same path', () => {
      const uuid = '22345678-1234-1234-1234-123456789abc';
      const projectPath = path.join(tmpDir, 'proj');
      fs.mkdirSync(projectPath, { recursive: true });

      upsertRegistryEntry(uuid, 'my-project', projectPath);
      const first = readEntry(uuid);
      const firstSeen = first.locations[0]!.last_seen;

      // Force a measurable time delta — Date.now() has
      // millisecond granularity, ISO 8601 strings too, so wait
      // long enough that the second timestamp is strictly greater.
      const waitMs = 10;
      const until = Date.now() + waitMs;
      while (Date.now() < until) {
        // spin
      }

      upsertRegistryEntry(uuid, 'my-project', projectPath);
      const second = readEntry(uuid);
      expect(second.locations).toHaveLength(1);
      expect(second.locations[0]!.path).toBe(projectPath);
      expect(second.locations[0]!.last_seen >= firstSeen).toBe(true);
    });

    it('appends a new location entry when the path differs', () => {
      const uuid = '32345678-1234-1234-1234-123456789abc';
      const pathA = path.join(tmpDir, 'proj-a');
      const pathB = path.join(tmpDir, 'proj-b');
      fs.mkdirSync(pathA, { recursive: true });
      fs.mkdirSync(pathB, { recursive: true });

      upsertRegistryEntry(uuid, 'my-project', pathA);
      upsertRegistryEntry(uuid, 'my-project', pathB);

      const entry = readEntry(uuid);
      expect(entry.locations).toHaveLength(2);
      expect(entry.locations.map((l) => l.path).sort()).toEqual(
        [pathA, pathB].sort(),
      );
    });

    it('updates project_name when it changes', () => {
      const uuid = '42345678-1234-1234-1234-123456789abc';
      const projectPath = path.join(tmpDir, 'proj');
      fs.mkdirSync(projectPath, { recursive: true });

      upsertRegistryEntry(uuid, 'original-name', projectPath);
      upsertRegistryEntry(uuid, 'renamed', projectPath);

      const entry = readEntry(uuid);
      expect(entry.project_name).toBe('renamed');
    });

    it('replaces a corrupt entry rather than propagating', () => {
      const uuid = '52345678-1234-1234-1234-123456789abc';
      const projectPath = path.join(tmpDir, 'proj');
      fs.mkdirSync(projectPath, { recursive: true });

      // Write garbage YAML directly
      fs.mkdirSync(getRegistryDir(), { recursive: true });
      const entryPath = path.join(getRegistryDir(), `${uuid}.yml`);
      fs.writeFileSync(entryPath, '::: not valid yaml [ ]]]');

      // Upsert should succeed anyway
      upsertRegistryEntry(uuid, 'recovered', projectPath);

      const entry = readEntry(uuid);
      expect(entry.project_id).toBe(uuid);
      expect(entry.project_name).toBe('recovered');
      expect(entry.locations).toHaveLength(1);
    });
  });

  describe('pruneStaleRegistryEntries', () => {
    it('is a no-op when registry dir does not exist', () => {
      expect(() => pruneStaleRegistryEntries()).not.toThrow();
    });

    it('removes entries whose all locations are gone', () => {
      const uuid = '62345678-1234-1234-1234-123456789abc';
      const goneProject = path.join(tmpDir, 'was-here');
      fs.mkdirSync(goneProject, { recursive: true });

      upsertRegistryEntry(uuid, 'gone-project', goneProject);
      expect(
        fs.existsSync(path.join(getRegistryDir(), `${uuid}.yml`)),
      ).toBe(true);

      // Delete the project, then prune
      fs.rmSync(goneProject, { recursive: true, force: true });
      pruneStaleRegistryEntries();

      expect(
        fs.existsSync(path.join(getRegistryDir(), `${uuid}.yml`)),
      ).toBe(false);
    });

    it('trims stale locations but keeps entries with at least one valid', () => {
      const uuid = '72345678-1234-1234-1234-123456789abc';
      const liveProject = path.join(tmpDir, 'still-here');
      const goneProject = path.join(tmpDir, 'went-away');
      fs.mkdirSync(liveProject, { recursive: true });
      fs.mkdirSync(goneProject, { recursive: true });

      upsertRegistryEntry(uuid, 'mixed-project', liveProject);
      upsertRegistryEntry(uuid, 'mixed-project', goneProject);

      fs.rmSync(goneProject, { recursive: true, force: true });
      pruneStaleRegistryEntries();

      const entry = readEntry(uuid);
      expect(entry.locations).toHaveLength(1);
      expect(entry.locations[0]!.path).toBe(liveProject);
    });

    it('removes corrupt entries', () => {
      fs.mkdirSync(getRegistryDir(), { recursive: true });
      const entryPath = path.join(
        getRegistryDir(),
        '82345678-1234-1234-1234-123456789abc.yml',
      );
      fs.writeFileSync(entryPath, '::: garbage :: [');

      pruneStaleRegistryEntries();

      expect(fs.existsSync(entryPath)).toBe(false);
    });

    it('leaves entries alone whose locations are all still valid', () => {
      const uuid = '92345678-1234-1234-1234-123456789abc';
      const projectPath = path.join(tmpDir, 'still-here');
      fs.mkdirSync(projectPath, { recursive: true });

      upsertRegistryEntry(uuid, 'live-project', projectPath);
      const entryPath = path.join(getRegistryDir(), `${uuid}.yml`);
      const beforeMtime = fs.statSync(entryPath).mtimeMs;

      pruneStaleRegistryEntries();

      // Entry should still exist
      expect(fs.existsSync(entryPath)).toBe(true);
      // And should NOT have been rewritten (mtime unchanged)
      const afterMtime = fs.statSync(entryPath).mtimeMs;
      expect(afterMtime).toBe(beforeMtime);
    });
  });

  describe('runRegistryPreflight integration', () => {
    it('is a no-op when registry.enabled is false (the default)', () => {
      // Create a fake project
      const projectPath = path.join(tmpDir, 'proj');
      fs.mkdirSync(path.join(projectPath, '.gvp'), { recursive: true });

      // Run phase 1 (project_id backfill)
      const preflight = runProjectPreflight(projectPath);
      expect(preflight.projectId).toBeDefined();

      // Phase 2 with registry disabled: should not create the registry
      const config = configSchema.parse({}); // registry omitted → disabled
      runRegistryPreflight(preflight, config);

      expect(fs.existsSync(getRegistryDir())).toBe(false);
    });

    it('is a no-op when there is no project_id', () => {
      // No .gvp/ = no project context
      const preflight = runProjectPreflight(tmpDir);
      expect(preflight.projectId).toBeUndefined();

      const config = configSchema.parse({
        registry: { enabled: true },
      });
      runRegistryPreflight(preflight, config);

      expect(fs.existsSync(getRegistryDir())).toBe(false);
    });

    it('upserts when enabled and project has an id', () => {
      const projectPath = path.join(tmpDir, 'proj');
      fs.mkdirSync(path.join(projectPath, '.gvp'), { recursive: true });

      const preflight = runProjectPreflight(projectPath);
      expect(preflight.projectId).toBeDefined();

      const config = configSchema.parse({
        registry: { enabled: true },
      });
      runRegistryPreflight(preflight, config);

      const entryPath = path.join(
        getRegistryDir(),
        `${preflight.projectId}.yml`,
      );
      expect(fs.existsSync(entryPath)).toBe(true);

      const entry = yaml.load(
        fs.readFileSync(entryPath, 'utf-8'),
      ) as RegistryEntry;
      expect(entry.project_id).toBe(preflight.projectId);
      expect(entry.locations).toHaveLength(1);
      // Location path is the project root (parent of .gvp/), not .gvp/ itself.
      expect(entry.locations[0]!.path).toBe(projectPath);
    });

    it('derives project_name from the project directory basename', () => {
      const projectPath = path.join(tmpDir, 'my-fancy-project');
      fs.mkdirSync(path.join(projectPath, '.gvp'), { recursive: true });

      const preflight = runProjectPreflight(projectPath);
      const config = configSchema.parse({
        registry: { enabled: true },
      });
      runRegistryPreflight(preflight, config);

      const entry = yaml.load(
        fs.readFileSync(
          path.join(getRegistryDir(), `${preflight.projectId}.yml`),
          'utf-8',
        ),
      ) as RegistryEntry;
      expect(entry.project_name).toBe('my-fancy-project');
    });
  });
});
