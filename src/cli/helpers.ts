import { loadConfig, type LoadConfigOptions } from '../config/loader.js';
import type { GVPConfig } from '../config/schema.js';
import { loadDefaults } from '../schema/defaults-loader.js';
import { CategoryRegistry } from '../model/category-registry.js';
import { parseDocument } from '../model/document-parser.js';
import { resolveInheritance, type DocumentLoader } from '../inheritance/inheritance-resolver.js';
import { Catalog } from '../catalog/catalog.js';
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
    const gvpDir = path.join(current, 'gvp');
    if (fs.existsSync(gvpDir) && fs.statSync(gvpDir).isDirectory()) {
      libraryDir = gvpDir;
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
  for (const file of yamlFiles) {
    const docPath = path.relative(libraryDir!, file).replace(/\.ya?ml$/, '');
    const doc = loadDocumentFile(file, docPath, source, registry);
    docCache.set(docPath, doc);
  }

  const loader: DocumentLoader = (_src, docPath) => {
    const cached = docCache.get(docPath);
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

  // Find leaf documents (ones not inherited by any other document)
  const inheritedDocPaths = new Set<string>();
  for (const doc of docCache.values()) {
    const inherits = doc.meta.inherits;
    if (inherits && Array.isArray(inherits)) {
      for (const entry of inherits) {
        if (typeof entry === 'string') {
          inheritedDocPaths.add(entry);
        }
      }
    }
  }

  // Use the deepest leaf as the entry point (it will pull in all ancestors)
  const leafDocs = [...docCache.entries()]
    .filter(([docPath]) => !inheritedDocPaths.has(docPath))
    .map(([, doc]) => doc);

  logv(`Found ${yamlFiles.length} documents`);

  const entryDoc = leafDocs[0] ?? docCache.values().next().value!;
  const resolved = resolveInheritance(entryDoc, loader);
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
