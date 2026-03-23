import { loadConfig, type LoadConfigOptions } from '../config/loader.js';
import type { GVPConfig } from '../config/schema.js';
import { loadDefaults } from '../schema/defaults-loader.js';
import { CategoryRegistry } from '../model/category-registry.js';
import { parseDocument } from '../model/document-parser.js';
import { resolveInheritance, type DocumentLoader } from '../inheritance/inheritance-resolver.js';
import { Catalog } from '../catalog/catalog.js';
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
    console.error('No GVP library found. Initialize with `gvp init` or create a .gvp/library/ directory.');
    process.exit(1);
  }

  const source = config.source ?? '@local';

  // Load all YAML files in the library directory
  const yamlFiles = findYamlFiles(libraryDir);
  if (yamlFiles.length === 0) {
    console.error(`No YAML files found in ${libraryDir}`);
    process.exit(1);
  }

  // Parse the first document as the entry point, resolve inheritance
  const entryFile = yamlFiles[0]!;
  const entryDocPath = path.relative(libraryDir, entryFile).replace(/\.ya?ml$/, '');
  const entryDoc = loadDocumentFile(entryFile, entryDocPath, source, registry);

  const loader: DocumentLoader = (_src, docPath) => {
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

  const resolved = resolveInheritance(entryDoc, loader);
  return new Catalog(resolved, config);
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
