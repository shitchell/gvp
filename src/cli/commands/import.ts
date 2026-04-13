import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { randomUUID } from 'crypto';
import { parseConfigOptions, buildCatalog, getLibraryOverride, getStoreOverride } from '../helpers.js';
import type { Catalog } from '../../catalog/catalog.js';
import type { CategoryDefinition } from '../../schema/category-definition.js';
import type { FieldSchemaEntry } from '../../schema/field-schema.js';

/** A candidate element from a patch file */
interface PatchElement {
  data: Record<string, unknown>;
  category: string;
  yamlKey: string;
  sourceFile: string;
  targetDocPath: string;
  pseudoId?: string; // The ?-prefixed ID, if candidate
}

/** Manifest file for directory-mode operations */
interface Manifest {
  delete_documents?: string[];
}

const PSEUDO_ID_RE = /^\?/;

function isPseudoId(id: string): boolean {
  return PSEUDO_ID_RE.test(id);
}

export function importCommand(): Command {
  const cmd = new Command('import')
    .description('Import elements from a patch file or directory into the library')
    .argument('<source>', 'Patch file (.yaml) or patch directory')
    .option('--into <document>', 'Target document (required for single-file mode)')
    .option('--dry-run', 'Show preview without writing')
    .option('-y, --yes', 'Skip confirmation prompt')
    .option('--confirm-delete', 'Confirm document deletions from _manifest.yaml')
    .action(async (source: string) => {
      try {
        const { config } = parseConfigOptions(cmd);
        const catalog = buildCatalog(config, process.cwd(), getLibraryOverride(cmd), getStoreOverride(cmd));
        const opts = cmd.opts();

        const resolved = path.resolve(process.cwd(), source);
        if (!fs.existsSync(resolved)) {
          console.error(`Source does not exist: ${source}`);
          process.exit(1);
        }

        const isDirectory = fs.statSync(resolved).isDirectory();

        if (isDirectory && opts.into) {
          console.error('--into cannot be used with directory mode. Each file maps by relative path.');
          process.exit(1);
        }
        if (!isDirectory && !opts.into) {
          console.error('--into is required for single-file mode. Specify the target document.');
          process.exit(1);
        }

        // Collect patch files
        const patchFiles: Array<{ filePath: string; targetDocPath: string }> = [];
        let manifest: Manifest | undefined;

        if (isDirectory) {
          // Directory mode: each .yaml file maps by relative path
          const yamlFiles = findYamlFilesRecursive(resolved);
          for (const file of yamlFiles) {
            const relPath = path.relative(resolved, file);
            const baseName = path.basename(relPath);
            if (baseName === '_manifest.yaml' || baseName === '_manifest.yml') {
              // Parse manifest
              const raw = yaml.load(fs.readFileSync(file, 'utf-8'));
              if (raw && typeof raw === 'object') {
                manifest = raw as Manifest;
              }
              continue;
            }
            const docPath = relPath.replace(/\.ya?ml$/, '');
            patchFiles.push({ filePath: file, targetDocPath: docPath });
          }
        } else {
          // Single-file mode
          const targetDoc = catalog.documents.find(d =>
            d.documentPath === opts.into || d.meta.name === opts.into
          );
          if (!targetDoc) {
            console.error(`Target document '${opts.into}' not found in the library.`);
            process.exit(1);
          }
          patchFiles.push({ filePath: resolved, targetDocPath: targetDoc.documentPath });
        }

        // Handle manifest deletions
        if (manifest?.delete_documents && manifest.delete_documents.length > 0) {
          if (!opts.confirmDelete) {
            console.error('Manifest requests document deletion:');
            for (const docPath of manifest.delete_documents) {
              console.error(`  - ${docPath}`);
            }
            console.error('\nUse --confirm-delete to proceed.');
            process.exit(1);
          }
        }

        // === PASS 1: Scan all patch files, build pseudo-ID registry ===
        const allPatchElements: PatchElement[] = [];
        const pseudoIdRegistry = new Map<string, PatchElement>(); // "?P1" -> PatchElement

        for (const { filePath, targetDocPath } of patchFiles) {
          const raw = yaml.load(fs.readFileSync(filePath, 'utf-8'));
          if (!raw || typeof raw !== 'object') continue;
          const data = raw as Record<string, unknown>;

          for (const yamlKey of Object.keys(data)) {
            if (yamlKey === 'meta') continue;
            // Look up category by yaml_key in the catalog registry
            const catLookup = catalog.registry.getByYamlKey(yamlKey);
            if (!catLookup) continue; // Skip unrecognized keys
            const { name: categoryName } = catLookup;
            const items = data[yamlKey];
            if (!Array.isArray(items)) continue;

            for (const item of items) {
              if (!item || typeof item !== 'object') continue;
              const elementData = item as Record<string, unknown>;
              const id = elementData.id as string | undefined;
              const pseudoId = (id && isPseudoId(id)) ? id : undefined;

              const pe: PatchElement = {
                data: { ...elementData },
                category: categoryName,
                yamlKey,
                sourceFile: filePath,
                targetDocPath,
                pseudoId,
              };

              allPatchElements.push(pe);

              if (pseudoId) {
                // Check for collision: same pseudo-ID used in multiple patch files
                // for the same category
                const existing = pseudoIdRegistry.get(pseudoId);
                if (existing && existing.category === pe.category) {
                  console.error(`Pseudo-ID collision: '${pseudoId}' used in multiple patch files for category '${categoryName}'`);
                  process.exit(1);
                }
                pseudoIdRegistry.set(pseudoId, pe);
              }
            }
          }
        }

        if (allPatchElements.length === 0 && !manifest?.delete_documents?.length) {
          console.error('No elements found in patch files.');
          process.exit(1);
        }

        // === PASS 2: Assign real IDs to candidates ===
        const rewriteMap = new Map<string, { realId: string; targetDocPath: string }>(); // "?P1" -> { realId: "P17", targetDocPath: "observations" }

        // Group candidates by category to assign sequential IDs
        const candidatesByCategory = new Map<string, PatchElement[]>();
        for (const pe of allPatchElements) {
          if (!pe.pseudoId) continue;
          const group = candidatesByCategory.get(pe.category) ?? [];
          group.push(pe);
          candidatesByCategory.set(pe.category, group);
        }

        for (const [categoryName, candidates] of candidatesByCategory) {
          const catDef = catalog.registry.getByName(categoryName);
          if (!catDef) continue;
          const prefix = catDef.id_prefix;

          // Find max existing ID number across the whole catalog for this category
          const existingIds = catalog.getElementsByCategory(categoryName).map(e => e.id);
          let maxNum = existingIds.reduce((max, id) => {
            const num = parseInt(id.replace(prefix, ''), 10);
            return isNaN(num) ? max : Math.max(max, num);
          }, 0);

          // Assign sequentially in declaration order
          for (const pe of candidates) {
            maxNum++;
            const realId = `${prefix}${maxNum}`;
            rewriteMap.set(pe.pseudoId!, { realId, targetDocPath: pe.targetDocPath });
            pe.data.id = realId;
          }
        }

        // === PASS 3: Rewrite references ===
        for (const pe of allPatchElements) {
          // Rewrite element-level maps_to
          rewriteReferences(pe.data, 'maps_to', rewriteMap, pe.targetDocPath);

          // Rewrite reference fields generically (R6-compliant)
          const catDef = catalog.registry.getByName(pe.category);
          if (catDef) {
            const mergedSchemas = { ...catalog.registry.allFieldSchemas, ...(catDef.field_schemas ?? {}) };
            rewriteFieldsGeneric(pe.data, mergedSchemas, rewriteMap, pe.targetDocPath);
          }
        }

        // Validate: check for unresolved pseudo-IDs in maps_to
        for (const pe of allPatchElements) {
          checkUnresolvedPseudoIds(pe.data, pe.category, catalog, rewriteMap);
        }

        // === Add provenance ===
        const now = new Date().toISOString();
        let userIdentity: { name: string; email: string } | undefined;
        if (config.user?.name && config.user?.email) {
          userIdentity = config.user;
        }
        for (const pe of allPatchElements) {
          if (!pe.pseudoId && !isNewElement(pe, catalog)) continue; // Only add origin to new/candidate elements
          const originEntry: Record<string, unknown> = {
            id: randomUUID(),
            date: now,
            note: `Imported from ${path.basename(pe.sourceFile)}`,
          };
          if (userIdentity) {
            originEntry.by = userIdentity;
          }
          // Preserve existing origin entries
          const existingOrigin = pe.data.origin;
          if (Array.isArray(existingOrigin)) {
            pe.data.origin = [...existingOrigin, originEntry];
          } else {
            pe.data.origin = [originEntry];
          }
        }

        // === PREVIEW ===
        const addElements = allPatchElements.filter(pe => pe.pseudoId || isNewElement(pe, catalog));
        const updateElements = allPatchElements.filter(pe => !pe.pseudoId && !isNewElement(pe, catalog));
        const rewriteEntries = [...rewriteMap.entries()];

        console.error('');
        if (addElements.length > 0) {
          console.error(`Adding ${addElements.length} element(s):`);
          for (const pe of addElements) {
            const origId = pe.pseudoId ?? pe.data.id;
            console.error(`  ${origId} \u2192 ${pe.data.id}  "${pe.data.name}"  (${pe.category}) \u2192 ${pe.targetDocPath}`);
          }
          console.error('');
        }
        if (updateElements.length > 0) {
          console.error(`Updating ${updateElements.length} element(s):`);
          for (const pe of updateElements) {
            console.error(`  ${pe.data.id}  "${pe.data.name}"  (${pe.category}) \u2192 ${pe.targetDocPath}`);
          }
          console.error('');
        }
        if (rewriteEntries.length > 0) {
          console.error('References rewritten:');
          for (const [pseudo, { realId, targetDocPath }] of rewriteEntries) {
            console.error(`  ${pseudo} \u2192 ${targetDocPath}:${realId}`);
          }
          console.error('');
        }
        if (manifest?.delete_documents?.length) {
          console.error('Documents to delete:');
          for (const docPath of manifest.delete_documents) {
            console.error(`  - ${docPath}`);
          }
          console.error('');
        }

        if (opts.dryRun) {
          console.error('Dry run \u2014 no changes written.');
          process.exit(0);
        }

        // Confirmation prompt (unless --yes)
        if (!opts.yes) {
          // In non-interactive mode (piped stdin), require --yes
          const isTTY = process.stdin.isTTY;
          if (!isTTY) {
            console.error('Non-interactive mode detected. Use --yes to skip confirmation.');
            process.exit(1);
          }
          const readline = await import('readline');
          const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
          const answer = await new Promise<string>(resolve => {
            rl.question('Proceed? [y/N] ', resolve);
          });
          rl.close();
          if (answer.toLowerCase() !== 'y') {
            console.error('Aborted.');
            process.exit(0);
          }
        }

        // === PASS 4: Write changes ===
        // Find the library directory from the first document's file path
        const firstDoc = catalog.documents[0];
        if (!firstDoc) {
          console.error('No documents in catalog.');
          process.exit(1);
        }
        // Derive library root: firstDoc.filePath is absolute, firstDoc.documentPath is relative
        // libraryRoot = filePath minus (documentPath + .yaml extension)
        const libraryRoot = firstDoc.filePath.replace(
          new RegExp(`${escapeRegex(firstDoc.documentPath)}\\.ya?ml$`),
          '',
        );

        // Group patch elements by target document
        const elementsByTarget = new Map<string, PatchElement[]>();
        for (const pe of allPatchElements) {
          const group = elementsByTarget.get(pe.targetDocPath) ?? [];
          group.push(pe);
          elementsByTarget.set(pe.targetDocPath, group);
        }

        for (const [targetDocPath, elements] of elementsByTarget) {
          const existingDoc = catalog.documents.find(d => d.documentPath === targetDocPath);
          const targetFile = existingDoc
            ? existingDoc.filePath
            : path.join(libraryRoot, targetDocPath + '.yaml');

          let data: Record<string, unknown>;
          if (existingDoc && fs.existsSync(targetFile)) {
            data = yaml.load(fs.readFileSync(targetFile, 'utf-8')) as Record<string, unknown> ?? {};
          } else {
            // New document
            fs.mkdirSync(path.dirname(targetFile), { recursive: true });
            data = {
              meta: { name: targetDocPath, scope: 'project' },
            };
          }

          for (const pe of elements) {
            const yamlKey = pe.yamlKey;
            if (!data[yamlKey]) data[yamlKey] = [];
            const arr = data[yamlKey] as Array<Record<string, unknown>>;

            // Check if this is an update to an existing element
            const existingIdx = arr.findIndex(item => item.id === pe.data.id);
            if (existingIdx >= 0) {
              // Merge: patch fields overwrite, unmentioned fields preserved
              arr[existingIdx] = { ...arr[existingIdx], ...pe.data };
            } else {
              // Append new element
              arr.push(pe.data);
            }
          }

          fs.writeFileSync(targetFile, yaml.dump(data, {
            lineWidth: -1,
            noRefs: true,
            sortKeys: false,
          }));
        }

        // Handle manifest deletions
        if (manifest?.delete_documents && opts.confirmDelete) {
          for (const docPath of manifest.delete_documents) {
            const doc = catalog.documents.find(d => d.documentPath === docPath);
            if (doc && fs.existsSync(doc.filePath)) {
              fs.unlinkSync(doc.filePath);
              console.error(`Deleted document: ${docPath}`);
            }
          }
        }

        console.error('Import complete.');
      } catch (e) {
        console.error(`Error: ${(e as Error).message}`);
        process.exit(1);
      }
    });

  return cmd;
}

/**
 * Rewrite pseudo-ID references in a maps_to array (or any string array field).
 */
function rewriteReferences(
  data: Record<string, unknown>,
  fieldName: string,
  rewriteMap: Map<string, { realId: string; targetDocPath: string }>,
  currentDocPath: string,
): void {
  const arr = data[fieldName];
  if (!Array.isArray(arr)) return;
  data[fieldName] = arr.map(ref => {
    if (typeof ref !== 'string') return ref;
    return rewriteRef(ref, rewriteMap, currentDocPath);
  });
}

/**
 * Rewrite a single reference string. Handles:
 * - "?G1" -> "targetDoc:G15" (bare pseudo-ID, qualified with target doc)
 * - "goals:?G1" -> "goals:G15" (qualified pseudo-ID)
 */
function rewriteRef(
  ref: string,
  rewriteMap: Map<string, { realId: string; targetDocPath: string }>,
  currentDocPath: string,
): string {
  // Check if the entire ref is a pseudo-ID: "?G1"
  if (isPseudoId(ref)) {
    const entry = rewriteMap.get(ref);
    if (!entry) return ref; // Will be caught by unresolved check
    // Qualify with target doc path if different from current
    if (entry.targetDocPath === currentDocPath) {
      return `${currentDocPath}:${entry.realId}`;
    }
    return `${entry.targetDocPath}:${entry.realId}`;
  }

  // Check for qualified pseudo-ID: "docpath:?G1"
  const colonIdx = ref.lastIndexOf(':');
  if (colonIdx > 0) {
    const elementPart = ref.substring(colonIdx + 1);
    if (isPseudoId(elementPart)) {
      const docPart = ref.substring(0, colonIdx);
      const entry = rewriteMap.get(elementPart);
      if (!entry) return ref; // Will be caught by unresolved check
      return `${docPart}:${entry.realId}`;
    }
  }

  return ref; // Real reference, no rewrite needed
}

/**
 * Generic R6-compliant rewrite of reference fields in an element's data.
 * Walks field_schemas looking for list<model> fields with maps_to sub-fields
 * and list<reference> fields.
 */
function rewriteFieldsGeneric(
  data: Record<string, unknown>,
  fieldSchemas: Record<string, FieldSchemaEntry>,
  rewriteMap: Map<string, { realId: string; targetDocPath: string }>,
  currentDocPath: string,
): void {
  for (const [fieldName, schema] of Object.entries(fieldSchemas)) {
    if (fieldName === 'maps_to') continue; // Already handled at element level
    if (schema.type === 'list' && schema.items) {
      // list<model> -- rewrite maps_to and list<reference> sub-fields in each item
      if (schema.items.type === 'model' && schema.items.fields) {
        const items = data[fieldName];
        if (!Array.isArray(items)) continue;
        for (const item of items) {
          if (!item || typeof item !== 'object') continue;
          const itemData = item as Record<string, unknown>;
          // Rewrite maps_to in model items
          if (schema.items.fields.maps_to) {
            rewriteReferences(itemData, 'maps_to', rewriteMap, currentDocPath);
          }
          // Recursively handle nested list<reference> fields in the model
          for (const [subFieldName, subSchema] of Object.entries(schema.items.fields)) {
            if (subSchema.type === 'list' && subSchema.items?.type === 'reference') {
              rewriteReferences(itemData, subFieldName, rewriteMap, currentDocPath);
            }
          }
        }
      }
      // list<reference> at element level
      if (schema.items.type === 'reference') {
        rewriteReferences(data, fieldName, rewriteMap, currentDocPath);
      }
    }
  }
}

/**
 * Check for unresolved pseudo-IDs in an element's reference fields.
 * Throws if any ?-prefixed ID remains that wasn't in the rewrite map.
 */
function checkUnresolvedPseudoIds(
  data: Record<string, unknown>,
  categoryName: string,
  catalog: Catalog,
  rewriteMap: Map<string, { realId: string; targetDocPath: string }>,
): void {
  const checkArray = (arr: unknown[], context: string) => {
    for (const item of arr) {
      if (typeof item !== 'string') continue;
      // Check bare pseudo-ID
      if (isPseudoId(item) && !rewriteMap.has(item)) {
        console.error(`Unresolved pseudo-ID '${item}' in ${context}`);
        process.exit(1);
      }
      // Check qualified pseudo-ID
      const colonIdx = item.lastIndexOf(':');
      if (colonIdx > 0) {
        const elementPart = item.substring(colonIdx + 1);
        if (isPseudoId(elementPart) && !rewriteMap.has(elementPart)) {
          console.error(`Unresolved pseudo-ID '${elementPart}' in ${context} (from reference '${item}')`);
          process.exit(1);
        }
      }
    }
  };

  // Check element-level maps_to
  if (Array.isArray(data.maps_to)) {
    checkArray(data.maps_to as unknown[], `element ${data.id} maps_to`);
  }

  // Check fields generically
  const catDef = catalog.registry.getByName(categoryName);
  if (!catDef) return;
  const mergedSchemas = { ...catalog.registry.allFieldSchemas, ...(catDef.field_schemas ?? {}) };
  for (const [fieldName, schema] of Object.entries(mergedSchemas)) {
    if (fieldName === 'maps_to') continue;
    if (schema.type === 'list' && schema.items) {
      if (schema.items.type === 'model' && schema.items.fields) {
        const items = data[fieldName];
        if (!Array.isArray(items)) continue;
        for (const item of items) {
          if (!item || typeof item !== 'object') continue;
          const itemData = item as Record<string, unknown>;
          if (Array.isArray(itemData.maps_to)) {
            checkArray(itemData.maps_to as unknown[], `element ${data.id} ${fieldName} item maps_to`);
          }
        }
      }
      if (schema.items.type === 'reference') {
        const refs = data[fieldName];
        if (Array.isArray(refs)) {
          checkArray(refs as unknown[], `element ${data.id} ${fieldName}`);
        }
      }
    }
  }
}

function isNewElement(pe: PatchElement, catalog: Catalog): boolean {
  // An element is "new" if its real ID doesn't exist in the catalog
  const existing = catalog.getAllElements().find(e =>
    e.id === pe.data.id && e.documentPath === pe.targetDocPath
  );
  return !existing;
}

function findYamlFilesRecursive(dir: string): string[] {
  const files: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isFile() && /\.ya?ml$/.test(entry.name)) {
      files.push(path.join(dir, entry.name));
    } else if (entry.isDirectory()) {
      files.push(...findYamlFilesRecursive(path.join(dir, entry.name)));
    }
  }
  return files.sort();
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
