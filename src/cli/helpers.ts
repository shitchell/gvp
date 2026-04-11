import { loadConfig, type LoadConfigOptions } from '../config/loader.js';
import type { GVPConfig } from '../config/schema.js';
import { runProjectPreflight, runRegistryPreflight } from '../config/preflight.js';
import { loadDefaults } from '../schema/defaults-loader.js';
import { CategoryRegistry } from '../model/category-registry.js';
import { parseDocument } from '../model/document-parser.js';
import { documentMetaSchema } from '../model/document-meta.js';
import { resolveInheritance, type DocumentLoader, type ResolvedInheritance } from '../inheritance/inheritance-resolver.js';
import { Catalog } from '../catalog/catalog.js';
import type { Element } from '../model/element.js';
import type { CategoryDefinition } from '../schema/category-definition.js';
import type { FieldSchemaEntry } from '../schema/field-schema.js';
import { setVerbosity, logv } from '../utils/logger.js';
import type { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

/**
 * Parse global options from a Commander command into LoadConfigOptions.
 *
 * Also runs the project preflight (D21): the first cairn command
 * in a library lacking a project_id auto-generates and persists one
 * to .gvp/config.yaml. Preflight runs BEFORE loadConfig so the
 * backfilled value is visible to this invocation's loaded config.
 * Preflight is a no-op when no .gvp/ directory exists in the
 * ancestry (e.g., when the user is running cairn outside any
 * project) or when the project_id is already present.
 *
 * Preflight runs regardless of --no-config and --library. The
 * rationale: identity is about the current working directory's
 * project, not about which config or library the invocation is
 * reading. Someone using `--library <elsewhere>` to peek at
 * another library from inside their project still wants their own
 * project identified. Preflight's walk-back always starts from cwd.
 */
export function parseConfigOptions(cmd: Command): { config: GVPConfig; configOptions: LoadConfigOptions } {
  const opts = cmd.optsWithGlobals();

  // Resolve --store path if provided
  const storeOverride = typeof opts.store === 'string' ? opts.store : undefined;
  let storePath: string | undefined;
  if (storeOverride !== undefined) {
    storePath = path.resolve(process.cwd(), storeOverride);
    if (!fs.existsSync(storePath)) {
      console.error(`Store directory does not exist: ${storeOverride}`);
      process.exit(1);
    }
    const gvpDir = path.join(storePath, '.gvp');
    if (!fs.existsSync(gvpDir)) {
      console.error(`Store directory has no .gvp/ subdirectory: ${storeOverride}`);
      process.exit(1);
    }
  }

  // Phase 1 of preflight: project_id identity backfill. Runs BEFORE
  // loadConfig so a freshly backfilled project_id is visible to the
  // config we're about to load. Target store path if set, otherwise CWD.
  const preflight = runProjectPreflight(storePath ?? process.cwd());

  const inlineOverrides: Record<string, string> = {};
  if (opts.override) {
    for (const entry of opts.override as string[]) {
      const eqIdx = entry.indexOf('=');
      if (eqIdx > 0) {
        inlineOverrides[entry.substring(0, eqIdx)] = entry.substring(eqIdx + 1);
      }
    }
  }

  const configOptions: LoadConfigOptions = {
    configPath: opts.config === false ? undefined : opts.config as string | undefined,
    noConfig: opts.config === false,
    inlineOverrides: Object.keys(inlineOverrides).length > 0 ? inlineOverrides : undefined,
    storePath,
  };

  const config = loadConfig(configOptions);

  // Apply verbose level (R9)
  setVerbosity(opts.verbose ?? 0);

  // Apply --strict flag override
  if (opts.strict) {
    (config as Record<string, unknown>).strict = true;
  }

  // Phase 2 of preflight: registry upsert. Runs AFTER loadConfig so
  // we can check the merged `registry.enabled` flag. Opt-in: no-op
  // unless the user explicitly enables the registry in their config.
  runRegistryPreflight(preflight, config);

  return { config, configOptions };
}

/**
 * Read the `--library <path>` global option from a command and return
 * it as a string, or undefined if not set. This is the input to
 * `buildCatalog`'s `libraryOverride` parameter. Centralized so every
 * subcommand reads the same option name consistently and future
 * changes to the option shape touch one place.
 */
export function getLibraryOverride(cmd: Command): string | undefined {
  const value = cmd.optsWithGlobals().library;
  return typeof value === 'string' ? value : undefined;
}

/**
 * Read the `--store <path>` global option from a command and return
 * it as a string, or undefined if not set. This is the input to
 * `buildCatalog`'s `storeOverride` parameter. Centralized so every
 * subcommand reads the same option name consistently.
 */
export function getStoreOverride(cmd: Command): string | undefined {
  const value = cmd.optsWithGlobals().store;
  return typeof value === 'string' ? value : undefined;
}

/**
 * Build a Catalog from the current working directory, or from an
 * explicit library path override.
 *
 * When `libraryOverride` is provided, walk-back discovery is SKIPPED
 * entirely and `libraryOverride` is used as the library directory
 * directly. The path points AT the library (the directory containing
 * YAML documents), NOT at a project root that contains a `.gvp/library/`
 * child. Relative paths are resolved against `cwd`.
 *
 * This is the mechanism behind the `--library <path>` CLI flag: it
 * lets operators switch between multiple non-inherited libraries in a
 * single shell without `cd`-ing between directories, and it composes
 * cleanly with the existing `--config` flag because the two axes
 * (library discovery vs config discovery) are orthogonal.
 */
export function buildCatalog(
  config: GVPConfig,
  cwd: string = process.cwd(),
  libraryOverride?: string,
  storeOverride?: string,
): Catalog {
  const defaults = loadDefaults();
  let registry = CategoryRegistry.fromDefaults(defaults);

  // Resolve the library directory.
  // If --library was passed, use it directly (no walk-back).
  // If --store was passed without --library, derive library from store.
  // Otherwise, walk backwards from cwd looking for .gvp/library/.
  let libraryDir: string | undefined;
  if (libraryOverride !== undefined) {
    // --library: use directly (existing behavior, unchanged)
    const resolved = path.resolve(cwd, libraryOverride);
    if (!fs.existsSync(resolved)) {
      console.error(`Library directory does not exist: ${libraryOverride}`);
      process.exit(1);
    }
    const stat = fs.statSync(resolved);
    if (!stat.isDirectory()) {
      console.error(`Library path is not a directory: ${libraryOverride}`);
      process.exit(1);
    }
    libraryDir = resolved;
  } else if (storeOverride !== undefined) {
    // --store without --library: derive library from store path
    const resolved = path.resolve(cwd, storeOverride);
    const storeLib = path.join(resolved, '.gvp', 'library');
    if (!fs.existsSync(storeLib)) {
      console.error(`Store has no library directory: ${path.join(storeOverride, '.gvp', 'library')}`);
      process.exit(1);
    }
    libraryDir = storeLib;
  } else {
    // Walk backwards from cwd (existing behavior, unchanged)
    let current = path.resolve(cwd);
    while (true) {
      const gvpLib = path.join(current, '.gvp', 'library');
      if (fs.existsSync(gvpLib)) {
        libraryDir = gvpLib;
        break;
      }
      const parent = path.dirname(current);
      if (parent === current) break;
      current = parent;
    }
  }

  if (!libraryDir) {
    console.error('No GVP library found. Initialize with `cairn init` or create a .gvp/library/ directory.');
    process.exit(1);
  }

  logv(`Loading library from ${libraryDir}`);

  const source = config.source ?? '@local';

  // Load all YAML files in the library directory
  const yamlFiles = findYamlFiles(libraryDir);
  if (yamlFiles.length === 0) {
    console.error(`No YAML files found in ${libraryDir}`);
    process.exit(1);
  }

  // Pass 1: Collect custom category definitions from all documents so that
  // pass 2 parsing can recognize their yaml_keys. Without this, elements
  // under custom yaml_keys are silently skipped because the defaults-only
  // registry doesn't know about them.
  const collectedCategories: Record<string, CategoryDefinition> = {};
  const collectedAllSchemas: Record<string, FieldSchemaEntry> = {};
  for (const file of yamlFiles) {
    try {
      const raw = yaml.load(fs.readFileSync(file, 'utf-8'));
      if (!raw || typeof raw !== 'object') continue;
      const data = raw as Record<string, unknown>;
      const meta = documentMetaSchema.parse(data.meta ?? {});
      const cats = meta.definitions?.categories;
      if (cats) {
        for (const [name, def] of Object.entries(cats)) {
          // Simple last-wins accumulation; authoritative merge happens in Catalog constructor
          collectedCategories[name] = def as CategoryDefinition;
        }
      }
      // Collect _all.field_schemas (same access pattern as category-merger.ts:78-88)
      const allBlock = (meta.definitions as Record<string, unknown> | undefined)?._all;
      if (allBlock && typeof allBlock === 'object' && 'field_schemas' in allBlock) {
        const schemas = (allBlock as { field_schemas?: Record<string, FieldSchemaEntry> }).field_schemas;
        if (schemas) {
          Object.assign(collectedAllSchemas, schemas);
        }
      }
    } catch {
      // Pass 1 errors are non-fatal — pass 2 will surface them properly
      continue;
    }
  }

  // Build full registry with custom categories for pass 2 parsing
  if (Object.keys(collectedCategories).length > 0 || Object.keys(collectedAllSchemas).length > 0) {
    const userAll = Object.keys(collectedAllSchemas).length > 0
      ? { field_schemas: collectedAllSchemas }
      : undefined;
    registry = registry.merge(collectedCategories, userAll);
  }

  // Pass 2: Load all documents with the full registry
  const docCache = new Map<string, ReturnType<typeof loadDocumentFile>>();
  // Index documents by meta.name so `inherits:` can reference them by name
  // even when meta.name differs from the filesystem-relative docPath (e.g.
  // a doc at code/common.yaml with meta.name: code-common).
  const nameIndex = new Map<string, ReturnType<typeof loadDocumentFile>>();
  for (const file of yamlFiles) {
    const docPath = path.relative(libraryDir!, file).replace(/\.ya?ml$/, '');
    const doc = loadDocumentFile(file, docPath, source, registry);
    docCache.set(docPath, doc);
    if (doc.meta.name && !nameIndex.has(doc.meta.name)) {
      nameIndex.set(doc.meta.name, doc);
    }
  }

  const loader: DocumentLoader = (_src, docPath) => {
    // Cache lookup: try docPath first (existing behavior), then meta.name.
    const cached = docCache.get(docPath) ?? nameIndex.get(docPath);
    if (cached) return cached;
    const filePath = path.join(libraryDir!, docPath + '.yaml');
    if (!fs.existsSync(filePath)) {
      const ymlPath = path.join(libraryDir!, docPath + '.yml');
      if (fs.existsSync(ymlPath)) {
        return loadDocumentFile(ymlPath, docPath, source, registry);
      }
      throw new Error(`Document not found: ${filePath}`);
    }
    return loadDocumentFile(filePath, docPath, source, registry);
  };

  // Find leaf documents (ones not inherited by any other document).
  // Inherits entries may reference parents by docPath OR by meta.name, so
  // normalize each entry to its canonical docPath before tracking it.
  const inheritedDocPaths = new Set<string>();
  for (const doc of docCache.values()) {
    const inherits = doc.meta.inherits;
    if (inherits && Array.isArray(inherits)) {
      for (const entry of inherits) {
        if (typeof entry === 'string') {
          const parentDoc = docCache.get(entry) ?? nameIndex.get(entry);
          if (parentDoc) {
            inheritedDocPaths.add(parentDoc.documentPath);
          } else {
            // Unknown reference — record it literally so leaf detection
            // still excludes it; resolveInheritance will surface the
            // missing-document error with full context.
            inheritedDocPaths.add(entry);
          }
        }
      }
    }
  }

  // Find leaf documents (ones not inherited by any other document)
  const leafDocs = [...docCache.entries()]
    .filter(([docPath]) => !inheritedDocPaths.has(docPath))
    .map(([, doc]) => doc);

  logv(`Found ${yamlFiles.length} documents, ${leafDocs.length} leaves`);

  // Resolve all leaf documents and merge their inheritance trees
  const allOrderedDocs: ResolvedInheritance['orderedDocuments'] = [];
  const seen = new Set<string>();
  let mergedAliasMap: ResolvedInheritance['aliasMap'] = new Map();
  let mergedSccs: ResolvedInheritance['sccs'] = [];

  const entries = leafDocs.length > 0 ? leafDocs : [docCache.values().next().value!];
  for (const leaf of entries) {
    const resolved = resolveInheritance(leaf, loader);
    for (const doc of resolved.orderedDocuments) {
      const key = `${doc.source}:${doc.documentPath}`;
      if (!seen.has(key)) {
        seen.add(key);
        allOrderedDocs.push(doc);
      }
    }
    mergedAliasMap = resolved.aliasMap;
    mergedSccs.push(...resolved.sccs);
  }

  const resolved: ResolvedInheritance = { orderedDocuments: allOrderedDocs, aliasMap: mergedAliasMap, sccs: mergedSccs };
  const catalog = new Catalog(resolved, config);
  logv(`Catalog built: ${catalog.getAllElements().length} elements`);
  return catalog;
}

/**
 * Require user identity for provenance operations (DEC-4.3, DEC-4.8).
 * Exits with an error if user identity is not configured.
 */
export function requireUserIdentity(config: GVPConfig): { name: string; email: string } {
  if (!config.user || !config.user.name || !config.user.email) {
    console.error('Error: GVP user identity not configured (DEC-4.3).');
    console.error('');
    console.error('Set your identity in .gvp.yaml or .gvp/config.yaml:');
    console.error('');
    console.error('  user:');
    console.error('    name: "Your Name"');
    console.error('    email: "you@example.com"');
    process.exit(1);
  }
  return config.user;
}

/**
 * Resolve a `--document <filter>` CLI argument to the set of documentPaths
 * it matches. A document matches if the filter equals either its `meta.name`
 * or its filesystem-relative `documentPath` (exact match, no substring or
 * prefix fuzziness — P14 explicit over implicit).
 *
 * Returns an empty set if the filter does not match any document. Callers
 * should surface an error in that case so the user sees the typo rather
 * than silently getting zero results.
 */
export function resolveDocumentFilter(
  catalog: Catalog,
  filter: string,
): Set<string> {
  const paths = new Set<string>();
  for (const doc of catalog.documents) {
    if (doc.meta.name === filter || doc.documentPath === filter) {
      paths.add(doc.documentPath);
    }
  }
  return paths;
}

/**
 * Filter an element list to those belonging to documents matched by the
 * given `--document` filter. If the filter matches nothing, the empty list
 * is returned (the caller should have already detected the zero-match case
 * via resolveDocumentFilter for error reporting).
 */
export function filterElementsByDocument(
  elements: Element[],
  allowedDocPaths: Set<string>,
): Element[] {
  return elements.filter((e) => allowedDocPaths.has(e.documentPath));
}

function loadDocumentFile(filePath: string, docPath: string, source: string, registry: CategoryRegistry) {
  const content = fs.readFileSync(filePath, 'utf-8');
  return parseDocument(content, filePath, docPath, source, registry);
}

function findYamlFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isFile() && /\.ya?ml$/.test(entry.name)) {
      files.push(path.join(dir, entry.name));
    } else if (entry.isDirectory()) {
      files.push(...findYamlFiles(path.join(dir, entry.name)));
    }
  }
  return files.sort();
}
