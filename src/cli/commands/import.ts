import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { randomUUID } from 'crypto';
import { parseConfigOptions, buildCatalog, getLibraryOverride, getStoreOverride } from '../helpers.js';
import type { Catalog } from '../../catalog/catalog.js';
import { collectReferenceSites } from '../../schema/reference-sites.js';

/** A candidate element from a patch file */
interface PatchElement {
  data: Record<string, unknown>;
  category: string;
  yamlKey: string;
  sourceFile: string;
  targetDocPath: string;
  pseudoId?: string; // The ?-prefixed ID, if candidate
  /**
   * Patch-only control field (#28): meta-rationale for an UPDATE to an existing
   * element. Lands in the element's `updated_by` change record (DEC-4.7), never
   * in the element's own `rationale` field. Stripped from `data` so it is never
   * written into the document.
   */
  updateRationale?: string;
  /** Patch-only control field (#28): per-element `skip_review: true` (DEC-4.6). */
  skipReview?: boolean;
  /** The `updated_by` entry to append at write time, if this is an update. */
  updateEntry?: Record<string, unknown>;
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
    .option('--skip-review', 'Mark every update in this patch as skip-review (DEC-4.6). Still writes an updated_by entry, flagged skip_review: true — it records the stance, it does not omit provenance')
    .action(async (source: string) => {
      try {
        const { config, preflight } = parseConfigOptions(cmd);
        const catalog = buildCatalog(config, process.cwd(), getLibraryOverride(cmd), getStoreOverride(cmd), preflight);
        const opts = cmd.opts();

        const resolved = path.resolve(process.cwd(), source);
        if (!fs.existsSync(resolved)) {
          console.error(`Source does not exist: ${source}`);
          process.exit(1);
        }

        const isDirectory = fs.statSync(resolved).isDirectory();

        // Detect multi-document mode (P14: explicit flag)
        let isMultiDocument = false;
        if (!isDirectory) {
          const raw = yaml.load(fs.readFileSync(resolved, 'utf-8'));
          if (raw && typeof raw === 'object') {
            const data = raw as Record<string, unknown>;
            const meta = data.meta as Record<string, unknown> | undefined;
            if (meta?.multi_document === true) {
              isMultiDocument = true;
            }
          }
        }

        if (isDirectory && opts.into) {
          console.error('--into cannot be used with directory mode. Each file maps by relative path.');
          process.exit(1);
        }
        if (isMultiDocument && opts.into) {
          console.error('--into cannot be used with multi-document mode. Each sub-patch specifies its target document.');
          process.exit(1);
        }
        if (!isDirectory && !isMultiDocument && !opts.into) {
          console.error('--into is required for single-file mode. Specify the target document.');
          process.exit(1);
        }

        // Collect patch files
        const patchFiles: Array<{ filePath: string; targetDocPath: string }> = [];
        // Directory mode: capture each patch file's top-level meta, keyed by targetDocPath.
        // Applied only when creating a NEW document (honors scope/inherits, etc.).
        const dirPatchMeta = new Map<string, Record<string, unknown>>();
        // For multi-document mode, store pre-parsed sub-patch data
        const parsedPatches: Array<{
          data: Record<string, unknown>;
          targetDocPath: string;
          sourceFile: string;
          patchMeta?: Record<string, unknown>;
        }> = [];
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

            // Capture the patch file's top-level meta for new-document creation.
            const raw = yaml.load(fs.readFileSync(file, 'utf-8'));
            if (raw && typeof raw === 'object') {
              const meta = (raw as Record<string, unknown>).meta;
              if (meta && typeof meta === 'object') {
                dirPatchMeta.set(docPath, meta as Record<string, unknown>);
              }
            }
          }
        } else if (isMultiDocument) {
          // Multi-document mode: parse sub-patches from single file
          const raw = yaml.load(fs.readFileSync(resolved, 'utf-8'));
          if (!raw || typeof raw !== 'object') {
            console.error('Failed to parse multi-document patch file.');
            process.exit(1);
          }
          const data = raw as Record<string, unknown>;

          for (const [label, value] of Object.entries(data)) {
            if (label === 'meta') continue;
            if (!value || typeof value !== 'object') continue;
            const subPatch = value as Record<string, unknown>;

            if (!subPatch.document) {
              console.error(`Sub-patch '${label}' is missing required 'document' field.`);
              process.exit(1);
            }

            const docRef = subPatch.document as string;
            const targetDoc = catalog.documents.find(d =>
              d.documentPath === docRef || d.meta.name === docRef
            );
            if (!targetDoc) {
              console.error(`Sub-patch '${label}': target document '${docRef}' not found in the library.`);
              process.exit(1);
            }

            const patchContent = subPatch.patch as Record<string, unknown> | undefined;
            if (!patchContent || typeof patchContent !== 'object') continue;

            const patchMeta = patchContent.meta as Record<string, unknown> | undefined;

            parsedPatches.push({
              data: patchContent,
              targetDocPath: targetDoc.documentPath,
              sourceFile: resolved,
              patchMeta,
            });
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

              const data_ = { ...elementData };
              const control = takeControlFields(
                data_,
                `${path.basename(filePath)}: ${yamlKey} '${id ?? '(no id)'}'`,
              );

              const pe: PatchElement = {
                data: data_,
                category: categoryName,
                yamlKey,
                sourceFile: filePath,
                targetDocPath,
                pseudoId,
                ...control,
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

        // Multi-document mode: process pre-parsed sub-patches
        for (const { data, targetDocPath, sourceFile } of parsedPatches) {
          for (const yamlKey of Object.keys(data)) {
            if (yamlKey === 'meta') continue;
            const catLookup = catalog.registry.getByYamlKey(yamlKey);
            if (!catLookup) continue;
            const { name: categoryName } = catLookup;
            const items = data[yamlKey];
            if (!Array.isArray(items)) continue;

            for (const item of items) {
              if (!item || typeof item !== 'object') continue;
              const elementData = item as Record<string, unknown>;
              const id = elementData.id as string | undefined;
              const pseudoId = (id && isPseudoId(id)) ? id : undefined;

              const data_ = { ...elementData };
              const control = takeControlFields(
                data_,
                `${path.basename(sourceFile)}: ${yamlKey} '${id ?? '(no id)'}'`,
              );

              const pe: PatchElement = {
                data: data_,
                category: categoryName,
                yamlKey,
                sourceFile,
                targetDocPath,
                pseudoId,
                ...control,
              };

              allPatchElements.push(pe);

              if (pseudoId) {
                // Collision check for multi-doc: same ?ID + same category + same targetDocPath = error
                // Same ?ID + same category + DIFFERENT targetDocPath = fine (they get independent IDs)
                const existing = pseudoIdRegistry.get(pseudoId);
                if (existing && existing.category === pe.category && existing.targetDocPath === pe.targetDocPath) {
                  console.error(`Pseudo-ID collision: '${pseudoId}' used multiple times for category '${categoryName}' targeting document '${targetDocPath}'`);
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

        // Group candidates by (category, targetDocPath) to assign per-document sequential IDs (DEC-9.5)
        const candidatesByCategoryDoc = new Map<string, PatchElement[]>();
        for (const pe of allPatchElements) {
          if (!pe.pseudoId) continue;
          const key = `${pe.category}::${pe.targetDocPath}`;
          const group = candidatesByCategoryDoc.get(key) ?? [];
          group.push(pe);
          candidatesByCategoryDoc.set(key, group);
        }

        for (const [groupKey, candidates] of candidatesByCategoryDoc) {
          const sepIdx = groupKey.indexOf('::');
          const categoryName = groupKey.substring(0, sepIdx);
          const targetDocPath = groupKey.substring(sepIdx + 2);
          const catDef = catalog.registry.getByName(categoryName);
          if (!catDef) continue;
          const prefix = catDef.id_prefix;

          // Find max existing ID number in the TARGET DOCUMENT for this category (DEC-9.5)
          const targetDoc = catalog.documents.find(d => d.documentPath === targetDocPath);
          const existingIds = targetDoc
            ? targetDoc.getElementsByCategory(categoryName).map(e => e.id)
            : [];
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
        // Every reference-bearing site is derived from the declared field schemas
        // via the shared walker (#22) — element-level maps_to, top-level
        // list<reference>, and the list<reference> sub-fields of both list<model>
        // and dict<model> containers (procedure.steps[].maps_to,
        // decision.considered[*].would_have_served / .conflicts_with). The importer
        // keeps no field-name list of its own, so it cannot drift from the
        // validator's view of what a reference is.
        for (const pe of allPatchElements) {
          for (const site of referenceSitesFor(pe, catalog)) {
            site.owner[site.field] = site.refs.map(ref =>
              typeof ref === 'string' ? rewriteRef(ref, rewriteMap, pe.targetDocPath) : ref
            );
          }
        }

        // Validate: no `?`-reference may survive into the written library. This runs
        // BEFORE the preview, so --dry-run reports the failure instead of printing a
        // rewrite list that implies everything resolved (#22).
        const unresolved: string[] = [];
        for (const pe of allPatchElements) {
          for (const site of referenceSitesFor(pe, catalog)) {
            for (const ref of site.refs) {
              if (typeof ref !== 'string') continue;
              const pseudo = unresolvedPseudoId(ref, rewriteMap);
              if (!pseudo) continue;
              const via = pseudo === ref ? '' : ` (from reference '${ref}')`;
              unresolved.push(
                `  ${pe.targetDocPath}:${pe.data.id} ${site.location}: '${pseudo}'${via}`,
              );
            }
          }
        }
        if (unresolved.length > 0) {
          console.error('Unresolved pseudo-ID reference(s) — nothing was written:');
          for (const line of unresolved) console.error(line);
          console.error('');
          console.error('Every ?-reference must name an element defined in this patch set.');
          process.exit(1);
        }

        // === Partition: adds vs updates ===
        // `updateElements` is exactly the set that must carry `update_rationale`
        // (or `skip_review`) and exactly the set that receives an `updated_by`
        // change record (#28).
        const addElements = allPatchElements.filter(pe => pe.pseudoId || isNewElement(pe, catalog));
        const updateElements = allPatchElements.filter(pe => !pe.pseudoId && !isNewElement(pe, catalog));

        // === Review gate (#28) ===
        // Mirrors `cairn edit --rationale`: an update to an existing element must
        // say why, unless it is explicitly marked skip-review. Command-level
        // --skip-review covers the whole patch; per-element `skip_review: true`
        // covers one element, so a patch of mechanical updates plus one
        // substantive change is not all-or-nothing.
        if (!opts.skipReview) {
          const missing = updateElements.filter(pe => !pe.skipReview && !pe.updateRationale);
          if (missing.length > 0) {
            console.error('Updates to existing elements require an update_rationale — nothing was written:');
            for (const pe of missing) {
              console.error(`  ${pe.targetDocPath}:${pe.data.id}  "${displayName(pe, catalog)}"  (${pe.category})`);
            }
            console.error('');
            console.error('Add `update_rationale: <why this changed>` to each element above,');
            console.error('or `skip_review: true` on the ones that need no review,');
            console.error('or pass --skip-review to mark the whole patch skip-review.');
            process.exit(1);
          }
        }

        // `update_rationale` is meaningless on an element the import is creating —
        // a new element records its provenance in `origin`. Surface rather than
        // swallow: a real ID that silently became an "add" is usually a typo.
        for (const pe of addElements) {
          if (pe.updateRationale === undefined && pe.skipReview === undefined) continue;
          console.error(
            `Note: ${pe.targetDocPath}:${pe.data.id} is being ADDED, not updated — ` +
            `its update_rationale/skip_review is ignored (new elements record provenance in origin).`,
          );
        }

        // === Add provenance ===
        const now = new Date().toISOString();
        let userIdentity: { name: string; email: string } | undefined;
        if (config.user?.name && config.user?.email) {
          userIdentity = config.user;
        }
        for (const pe of addElements) {
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

        // Updated elements get an `updated_by` change record (DEC-4.7), always —
        // including under --skip-review, which records the stance `skip_review: true`
        // rather than omitting provenance (DEC-4.6). Mirrors edit.ts:98-104.
        for (const pe of updateElements) {
          const skipReview = pe.skipReview === true || opts.skipReview === true;
          const updateEntry: Record<string, unknown> = {
            id: randomUUID(),
            date: now,
            rationale: pe.updateRationale ?? 'skip-review update',
          };
          if (userIdentity) {
            updateEntry.by = userIdentity;
          }
          if (skipReview) updateEntry.skip_review = true;
          pe.updateEntry = updateEntry;
        }

        // === PREVIEW ===
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
            const skipLabel = pe.updateEntry?.skip_review === true ? ' [skip-review]' : '';
            console.error(`  ${pe.data.id}  "${displayName(pe, catalog)}"  (${pe.category}) \u2192 ${pe.targetDocPath}${skipLabel}`);
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
            // Honor the patch file's top-level meta (e.g. scope, inherits) when creating
            // the document, rather than force-stamping scope: project. Reserved control
            // keys used to drive the import (import, multi_document) are stripped so they
            // don't leak into the persisted document meta.
            const providedMeta = stripImportControlKeys(dirPatchMeta.get(targetDocPath));
            const newMeta: Record<string, unknown> = {
              name: targetDocPath,
              scope: 'project',
              ...providedMeta,
            };
            data = { meta: newMeta };
          }

          for (const pe of elements) {
            const yamlKey = pe.yamlKey;
            if (!data[yamlKey]) data[yamlKey] = [];
            const arr = data[yamlKey] as Array<Record<string, unknown>>;

            // Check if this is an update to an existing element
            const existingIdx = arr.findIndex(item => item.id === pe.data.id);
            if (existingIdx >= 0) {
              // Merge: patch fields overwrite, unmentioned fields preserved
              const prior = arr[existingIdx]!;
              const merged: Record<string, unknown> = { ...prior, ...pe.data };
              if (pe.updateEntry) {
                // Append to the history ON DISK (DEC-4.7 is append-only). A patch
                // that carries its own `updated_by` replaces the list as any other
                // field would; otherwise the document's existing entries are kept.
                const base = Array.isArray(pe.data.updated_by)
                  ? pe.data.updated_by
                  : (Array.isArray(prior.updated_by) ? prior.updated_by : []);
                merged.updated_by = [...base, pe.updateEntry];
              }
              arr[existingIdx] = merged;
            } else {
              // Append new element
              arr.push(pe.data);
            }
          }

          // Multi-document mode: merge patch.meta into target document meta
          for (const pp of parsedPatches) {
            if (pp.targetDocPath === targetDocPath && pp.patchMeta) {
              const currentMeta = (data.meta ?? {}) as Record<string, unknown>;
              data.meta = { ...currentMeta, ...pp.patchMeta };
            }
          }

          fs.writeFileSync(targetFile, yaml.dump(data, {
            lineWidth: -1,
            noRefs: true,
            sortKeys: false,
          }));
        }

        // Multi-document mode: handle sub-patches that only have meta (no elements)
        for (const pp of parsedPatches) {
          if (!pp.patchMeta) continue;
          if (elementsByTarget.has(pp.targetDocPath)) continue; // Already handled above

          const existingDoc = catalog.documents.find(d => d.documentPath === pp.targetDocPath);
          if (!existingDoc || !fs.existsSync(existingDoc.filePath)) continue;

          const fileData = yaml.load(fs.readFileSync(existingDoc.filePath, 'utf-8')) as Record<string, unknown> ?? {};
          const currentMeta = (fileData.meta ?? {}) as Record<string, unknown>;
          fileData.meta = { ...currentMeta, ...pp.patchMeta };

          fs.writeFileSync(existingDoc.filePath, yaml.dump(fileData, {
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
 * Every reference-bearing array in a patch element, derived from its category's
 * declared field schemas. Single source of truth shared with the validator's
 * E001 walk — see src/schema/reference-sites.ts.
 */
function referenceSitesFor(pe: PatchElement, catalog: Catalog) {
  const catDef = catalog.registry.getByName(pe.category);
  const mergedSchemas = {
    ...catalog.registry.allFieldSchemas,
    ...(catDef?.field_schemas ?? {}),
  };
  return collectReferenceSites(pe.data, mergedSchemas);
}

/**
 * If `ref` still names an unresolved pseudo-ID, return that pseudo-ID.
 * Handles the bare (`?g_streaks`) and qualified (`docpath:?g_streaks`) forms.
 */
function unresolvedPseudoId(
  ref: string,
  rewriteMap: Map<string, { realId: string; targetDocPath: string }>,
): string | undefined {
  if (isPseudoId(ref) && !rewriteMap.has(ref)) return ref;
  const colonIdx = ref.lastIndexOf(':');
  if (colonIdx > 0) {
    const elementPart = ref.substring(colonIdx + 1);
    if (isPseudoId(elementPart) && !rewriteMap.has(elementPart)) return elementPart;
  }
  return undefined;
}

/**
 * Patch-only control keys (#28). They configure the import's review gate and
 * provenance write; they are never element fields, so they are lifted off the
 * element data during the scan and never reach the document.
 *
 * `update_rationale` is deliberately NOT `rationale`: a decision's primary field
 * is `rationale` (src/data/defaults.yaml), so the two would collide in the same
 * mapping. `update_` also matches the existing provenance vocabulary
 * (`updated_by`, updateEntry) rather than naming the field after whichever
 * command happens to write it.
 *
 * Lifts them off an element's data (mutating it) and returns them. Exits on a
 * wrong-typed value rather than silently ignoring it — a mistyped rationale
 * must not be mistaken for an absent one.
 */
function takeControlFields(
  data: Record<string, unknown>,
  context: string,
): { updateRationale?: string; skipReview?: boolean } {
  const out: { updateRationale?: string; skipReview?: boolean } = {};

  if ('update_rationale' in data) {
    const value = data.update_rationale;
    delete data.update_rationale;
    if (typeof value !== 'string' || value.trim().length === 0) {
      console.error(`${context}: 'update_rationale' must be a non-empty string.`);
      process.exit(1);
    }
    out.updateRationale = value;
  }

  if ('skip_review' in data) {
    const value = data.skip_review;
    delete data.skip_review;
    if (typeof value !== 'boolean') {
      console.error(`${context}: 'skip_review' must be true or false.`);
      process.exit(1);
    }
    out.skipReview = value;
  }

  return out;
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
 * Name to show for a patch element. A partial update legitimately omits `name`
 * (only the changed fields need to be listed), so fall back to the name the
 * element already carries in the library rather than printing "undefined".
 */
function displayName(pe: PatchElement, catalog: Catalog): string {
  if (typeof pe.data.name === 'string') return pe.data.name;
  const existing = catalog.getAllElements().find(e =>
    e.id === pe.data.id && e.documentPath === pe.targetDocPath
  );
  return existing?.name ?? '';
}

function isNewElement(pe: PatchElement, catalog: Catalog): boolean {
  // An element is "new" if its real ID doesn't exist in the catalog
  const existing = catalog.getAllElements().find(e =>
    e.id === pe.data.id && e.documentPath === pe.targetDocPath
  );
  return !existing;
}

/** Reserved meta keys that drive the import flow and must not persist into a document. */
const IMPORT_CONTROL_META_KEYS = new Set(['import', 'multi_document']);

/**
 * Return a copy of a patch file's top-level meta with reserved import-control keys removed.
 * Returns an empty object if no meta was provided.
 */
function stripImportControlKeys(
  meta: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (!meta) return {};
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(meta)) {
    if (IMPORT_CONTROL_META_KEYS.has(key)) continue;
    out[key] = value;
  }
  return out;
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
