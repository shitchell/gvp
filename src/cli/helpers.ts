import { loadConfig, type LoadConfigOptions } from '../config/loader.js';
import type { GVPConfig } from '../config/schema.js';
import { loadDefaults } from '../schema/defaults-loader.js';
import { CategoryRegistry } from '../model/category-registry.js';
import { parseDocument } from '../model/document-parser.js';
import { resolveInheritance, type DocumentLoader, type ResolvedInheritance } from '../inheritance/inheritance-resolver.js';
import { Catalog } from '../catalog/catalog.js';
import type { Element } from '../model/element.js';
import { setVerbosity, logv } from '../utils/logger.js';
import type { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Parse global options from a Commander command into LoadConfigOptions.
 */
export function parseConfigOptions(cmd: Command): { config: GVPConfig; configOptions: LoadConfigOptions } {
  const opts = cmd.optsWithGlobals();

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
  };

  const config = loadConfig(configOptions);

  // Apply verbose level (R9)
  setVerbosity(opts.verbose ?? 0);

  // Apply --strict flag override
  if (opts.strict) {
    (config as Record<string, unknown>).strict = true;
  }

  return { config, configOptions };
}

/**
 * Build a Catalog from the current working directory.
 */
export function buildCatalog(config: GVPConfig, cwd: string = process.cwd()): Catalog {
  const defaults = loadDefaults();
  const registry = CategoryRegistry.fromDefaults(defaults);

  // Find the library directory
  let libraryDir: string | undefined;
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

  // Load all documents in the library
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
