import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { randomUUID } from 'crypto';
import { parseConfigOptions, buildCatalog, getLibraryOverride, getStoreOverride } from '../helpers.js';
import type { Catalog } from '../../catalog/catalog.js';
import type { Document } from '../../model/document.js';
import type { FieldSchemaEntry } from '../../schema/field-schema.js';
import type { GVPConfig } from '../../config/schema.js';

/**
 * `cairn mv` — move an element between documents (Mode A) or rename a
 * document (Mode B), rewriting every inbound qualified reference
 * library-wide so the library keeps passing `cairn validate --strict`.
 *
 * Safety-critical: a missed reference silently corrupts decision
 * traceability. Every mutation is computed in memory, previewed, and only
 * then written. `--dry-run` writes nothing.
 *
 * Mode A:  cairn mv <doc:ID> <targetDoc>     (first arg contains a colon)
 * Mode B:  cairn mv --doc <oldName> <newName>
 *          cairn mv <oldName> <newName>      (first arg has no colon)
 */
export function mvCommand(): Command {
  const cmd = new Command('mv')
    .description('Move an element between documents, or rename a document, rewriting references library-wide')
    .argument('<source>', 'Element to move (doc:ID) or document to rename (name)')
    .argument('<target>', 'Target document (move) or new document name (rename)')
    .option('--doc', 'Force document-rename mode (Mode B)')
    .option('--dry-run', 'Show preview without writing')
    .option('-y, --yes', 'Skip confirmation prompt')
    .action(async (source: string, target: string) => {
      try {
        const { config } = parseConfigOptions(cmd);
        const catalog = buildCatalog(config, process.cwd(), getLibraryOverride(cmd), getStoreOverride(cmd));
        const opts = cmd.opts();

        // Mode detection: an explicit --doc flag, or a source without a colon,
        // means document-rename. A source with a colon is an element move.
        const isRename = Boolean(opts.doc) || !source.includes(':');

        if (isRename) {
          await runRename(catalog, config, source, target, opts);
        } else {
          await runMove(catalog, config, source, target, opts);
        }
      } catch (e) {
        console.error(`Error: ${(e as Error).message}`);
        process.exit(1);
      }
    });

  return cmd;
}

interface CliOpts {
  dryRun?: boolean;
  yes?: boolean;
}

/** A single reference rewrite: oldRef -> newRef (both `doc:ID`). */
type RefRewrite = { from: string; to: string };

// ---------------------------------------------------------------------------
// Mode A: element move
// ---------------------------------------------------------------------------

async function runMove(
  catalog: Catalog,
  config: GVPConfig,
  source: string,
  targetDocArg: string,
  opts: CliOpts,
): Promise<void> {
  const colonIdx = source.indexOf(':');
  const sourceDocName = source.substring(0, colonIdx);
  const oldId = source.substring(colonIdx + 1);

  const sourceDoc = findDoc(catalog, sourceDocName);
  if (!sourceDoc) {
    console.error(`Source document '${sourceDocName}' not found in the library.`);
    process.exit(1);
  }
  const targetDoc = findDoc(catalog, targetDocArg);
  if (!targetDoc) {
    console.error(`Target document '${targetDocArg}' not found in the library.`);
    process.exit(1);
  }
  if (sourceDoc.documentPath === targetDoc.documentPath) {
    console.error(`Source and target documents are the same ('${sourceDoc.name}'). Nothing to move.`);
    process.exit(1);
  }

  // Locate the element + its category in the source document.
  const located = locateElement(catalog, sourceDoc, oldId);
  if (!located) {
    console.error(`Element '${oldId}' not found in document '${sourceDoc.name}'.`);
    process.exit(1);
  }
  const { categoryName, yamlKey, idPrefix } = located;

  // Determine the new local ID in the target (DEC-9.5): keep if free, else max+1.
  const targetExistingIds = new Set(
    targetDoc.getElementsByCategory(categoryName).map(e => e.id),
  );
  let newId = oldId;
  let reassigned = false;
  if (targetExistingIds.has(oldId)) {
    const maxNum = [...targetExistingIds].reduce((max, id) => {
      const num = parseInt(id.replace(idPrefix, ''), 10);
      return isNaN(num) ? max : Math.max(max, num);
    }, 0);
    newId = `${idPrefix}${maxNum + 1}`;
    reassigned = true;
  }

  // References on disk are written using documentPath (the on-disk reference
  // prefix), which by library convention equals meta.name. Key all rewrites on
  // documentPath so they resolve regardless of any name/path divergence.
  const sourceDocPath = sourceDoc.documentPath;
  const targetDocPath = targetDoc.documentPath;
  const targetDocName = targetDoc.name;
  const oldRef = `${sourceDocPath}:${oldId}`;
  const newRef = `${targetDocPath}:${newId}`;

  // Illegal-direction guard: a reference must flow descendant -> ancestor.
  // After the move, every inbound ref `referrerDoc -> newRef(targetDoc)` must
  // be legal: referrerDoc must be a descendant of (or equal to) targetDoc.
  // Equivalently, the move is refused if any referrer is an ANCESTOR of the
  // target document (that would be a parent -> child reference).
  const ancestorsOf = buildAncestorMap(catalog);
  const inboundReferrers = findInboundReferrers(catalog, oldRef, oldId, sourceDoc);
  for (const referrerPath of inboundReferrers) {
    if (referrerPath === targetDoc.documentPath) continue; // same doc, fine
    // referrerPath references the target. Legal iff target is an ancestor of
    // referrer (referrer is downstream). Illegal iff referrer is an ancestor
    // of target.
    const refAncestors = ancestorsOf.get(referrerPath) ?? new Set<string>();
    const targetAncestors = ancestorsOf.get(targetDoc.documentPath) ?? new Set<string>();
    const targetIsAncestorOfReferrer = refAncestors.has(targetDoc.documentPath);
    const referrerIsAncestorOfTarget = targetAncestors.has(referrerPath);
    if (referrerIsAncestorOfTarget && !targetIsAncestorOfReferrer) {
      const referrerName = docNameByPath(catalog, referrerPath);
      console.error(
        `Refusing move: it would create an illegal parent -> child reference. ` +
        `Document '${referrerName}' is an ancestor of the target '${targetDocName}', ` +
        `but references the moved element. Inheritance references must flow child -> parent.`,
      );
      process.exit(1);
    }
  }

  // Build the rewrite: every inbound `oldRef` -> `newRef`.
  const inboundRewrite: RefRewrite[] = [{ from: oldRef, to: newRef }];

  // === Compute the moved element's new data (outbound re-qualification) ===
  const elementData = deepClone(located.data);
  elementData.id = newId;

  // Outbound: same-doc references inside the moved element must stay pinned to
  // the SOURCE document. Bare refs (e.g. `G1`) and refs qualified to the source
  // doc (`sourceDoc:G1`) both mean "the source doc's element"; after the move
  // they must be `sourceDoc:G1`. Fully-qualified refs to OTHER docs are
  // untouched. We requalify by rewriting every reference field of the moved
  // element with a source-doc-aware resolver.
  requalifyOutbound(elementData, catalog, categoryName, sourceDocPath);

  // Stamp the move into provenance (preserve existing origin entries).
  stampOrigin(elementData, config, `Moved from ${sourceDoc.name} to ${targetDocName}`);

  // === Preview ===
  console.error('');
  console.error(`Move: ${oldRef}  ->  ${newRef}  (${categoryName})`);
  if (reassigned) {
    console.error(`  ID reassigned per DEC-9.5: '${oldId}' was taken in '${targetDocName}', using '${newId}'.`);
  }
  console.error('');
  console.error('Inbound references rewritten (library-wide):');
  console.error(`  ${oldRef}  ->  ${newRef}`);
  console.error('');

  if (opts.dryRun) {
    console.error('Dry run — no changes written.');
    process.exit(0);
  }

  if (!(await confirm(opts))) {
    console.error('Aborted.');
    process.exit(0);
  }

  // === Write ===
  // 1. Remove element from source file.
  mutateDocFile(sourceDoc.filePath, (data) => {
    const arr = data[yamlKey] as Array<Record<string, unknown>> | undefined;
    if (Array.isArray(arr)) {
      data[yamlKey] = arr.filter(e => e.id !== oldId);
    }
  });

  // 2. Add element to target file.
  mutateDocFile(targetDoc.filePath, (data) => {
    if (!Array.isArray(data[yamlKey])) data[yamlKey] = [];
    (data[yamlKey] as Array<Record<string, unknown>>).push(elementData);
  });

  // 3. Rewrite inbound references in EVERY document file (incl. source/target,
  //    which we just touched — re-read them fresh).
  rewriteLibraryRefs(catalog, inboundRewrite);

  console.error('Move complete.');
}

// ---------------------------------------------------------------------------
// Mode B: document rename
// ---------------------------------------------------------------------------

async function runRename(
  catalog: Catalog,
  _config: GVPConfig,
  oldName: string,
  newName: string,
  opts: CliOpts,
): Promise<void> {
  const doc = findDoc(catalog, oldName);
  if (!doc) {
    console.error(`Document '${oldName}' not found in the library.`);
    process.exit(1);
  }
  const oldDocName = doc.name;
  if (oldDocName === newName) {
    console.error(`Document is already named '${newName}'. Nothing to do.`);
    process.exit(1);
  }
  // Guard against name collision with another document.
  const collision = catalog.documents.find(
    d => d.documentPath !== doc.documentPath && d.name === newName,
  );
  if (collision) {
    console.error(`Cannot rename to '${newName}': another document already uses that name (${collision.documentPath}).`);
    process.exit(1);
  }

  // References resolve by documentPath (filename), and the library convention
  // is documentPath === meta.name. The new documentPath keeps the old
  // directory placement but takes the new name as its basename, so e.g.
  // `implementations/v0` renamed to `core` becomes `implementations/core`.
  const oldDocPath = doc.documentPath;
  const lastSlash = oldDocPath.lastIndexOf('/');
  const dirPrefix = lastSlash >= 0 ? oldDocPath.substring(0, lastSlash + 1) : '';
  const newDocPath = `${dirPrefix}${newName}`;

  // Verify the new file path is free.
  const newFilePath = doc.filePath.substring(0, doc.filePath.length - (oldDocPath.length + path.extname(doc.filePath).length)) +
    newDocPath + path.extname(doc.filePath);
  if (fs.existsSync(newFilePath)) {
    console.error(`Cannot rename: target file already exists: ${newFilePath}`);
    process.exit(1);
  }

  // Build rewrites: every `<oldDocPath>:X` -> `<newDocPath>:X`, for every
  // element in the renamed doc. References are written using documentPath, so
  // we key the rewrite on documentPath (the actual on-disk reference prefix).
  // This covers cross-doc inbound refs AND within-doc fully-qualified refs.
  const rewrites: RefRewrite[] = [];
  for (const el of doc.getAllElements()) {
    rewrites.push({ from: `${oldDocPath}:${el.id}`, to: `${newDocPath}:${el.id}` });
  }

  // === Preview ===
  console.error('');
  console.error(`Rename document: '${oldDocName}' -> '${newName}'  (meta.name + file)`);
  if (oldDocPath !== newDocPath) {
    console.error(`  File: ${oldDocPath}.yaml -> ${newDocPath}.yaml`);
  }
  console.error('');
  console.error(`Re-qualifying ${rewrites.length} element reference prefix(es) library-wide:`);
  console.error(`  ${oldDocPath}:*  ->  ${newDocPath}:*`);
  const inheritsUpdates = catalog.documents.filter(d => documentInheritsName(d, oldDocName, oldDocPath));
  if (inheritsUpdates.length > 0) {
    console.error('');
    console.error('Documents whose `inherits` reference will be updated:');
    for (const d of inheritsUpdates) console.error(`  ${d.name} (${d.documentPath})`);
  }
  console.error('');

  if (opts.dryRun) {
    console.error('Dry run — no changes written.');
    process.exit(0);
  }

  if (!(await confirm(opts))) {
    console.error('Aborted.');
    process.exit(0);
  }

  // === Write ===
  // 1. Update meta.name on the renamed document (still at its old file path).
  mutateDocFile(doc.filePath, (data) => {
    const meta = (data.meta ?? {}) as Record<string, unknown>;
    meta.name = newName;
    data.meta = meta;
  });

  // 2. Update any other document's `inherits` entry that pointed at the old
  //    name or docPath (string-form inherits reference parents by name/docPath).
  for (const d of catalog.documents) {
    if (d.documentPath === oldDocPath) continue;
    if (!documentInheritsName(d, oldDocName, oldDocPath)) continue;
    mutateDocFile(d.filePath, (data) => {
      const meta = (data.meta ?? {}) as Record<string, unknown>;
      const inherits = meta.inherits;
      if (Array.isArray(inherits)) {
        meta.inherits = inherits.map(entry => {
          if (typeof entry === 'string' && (entry === oldDocName || entry === oldDocPath)) {
            return newName;
          }
          return entry;
        });
        data.meta = meta;
      }
    });
  }

  // 3. Rewrite all qualified references library-wide (content rewrite; done
  //    before the file rename so the catalog's recorded file paths still exist).
  rewriteLibraryRefs(catalog, rewrites);

  // 4. Rename the file so the new documentPath matches the new name and the
  //    rewritten references resolve.
  if (newFilePath !== doc.filePath) {
    fs.renameSync(doc.filePath, newFilePath);
  }

  console.error('Rename complete.');
}

// ---------------------------------------------------------------------------
// Reference rewriting
// ---------------------------------------------------------------------------

/**
 * Apply a set of `from -> to` reference rewrites across EVERY YAML document
 * file in the library. Re-reads each file from disk (so it composes with
 * earlier element add/remove writes) and walks every element-reference field
 * (top-level `maps_to`, `list<reference>` fields, and nested step-level
 * `maps_to` / `list<reference>` sub-fields) per the category field schemas.
 */
function rewriteLibraryRefs(catalog: Catalog, rewrites: RefRewrite[]): void {
  if (rewrites.length === 0) return;
  const rewriteMap = new Map(rewrites.map(r => [r.from, r.to]));

  // Only rewrite documents belonging to THIS library (local source); external
  // inherited sources are read-only and live outside this library's files.
  const localSource = catalog.config.source ?? '@local';
  const localFiles = new Set<string>();
  for (const doc of catalog.documents) {
    if (doc.source === localSource || doc.source === '@local') {
      localFiles.add(doc.filePath);
    }
  }

  for (const filePath of localFiles) {
    mutateDocFile(filePath, (data) => {
      for (const [yamlKey, value] of Object.entries(data)) {
        if (yamlKey === 'meta') continue;
        const catLookup = catalog.registry.getByYamlKey(yamlKey);
        if (!catLookup) continue;
        if (!Array.isArray(value)) continue;
        const mergedSchemas = mergedFieldSchemas(catalog, catLookup.name);
        for (const item of value) {
          if (!item || typeof item !== 'object') continue;
          rewriteElementRefs(item as Record<string, unknown>, mergedSchemas, rewriteMap);
        }
      }
    });
  }
}

/**
 * Rewrite every element-reference field of a single element object in place,
 * using a real-qualified-ID rewrite map. Mirrors import.ts's generic
 * field-schema walk, but rewrites REAL `doc:ID` references (not pseudo-IDs).
 */
function rewriteElementRefs(
  data: Record<string, unknown>,
  fieldSchemas: Record<string, FieldSchemaEntry>,
  rewriteMap: Map<string, string>,
): void {
  // Top-level maps_to (implicit list<reference>).
  rewriteRefArray(data, 'maps_to', rewriteMap);

  for (const [fieldName, schema] of Object.entries(fieldSchemas)) {
    if (fieldName === 'maps_to') continue;
    if (schema.type !== 'list' || !schema.items) continue;

    // list<reference> at element level.
    if (schema.items.type === 'reference') {
      rewriteRefArray(data, fieldName, rewriteMap);
      continue;
    }

    // list<model>: rewrite maps_to and nested list<reference> sub-fields.
    if (schema.items.type === 'model' && schema.items.fields) {
      const items = data[fieldName];
      if (!Array.isArray(items)) continue;
      for (const item of items) {
        if (!item || typeof item !== 'object') continue;
        const itemData = item as Record<string, unknown>;
        if (schema.items.fields.maps_to) {
          rewriteRefArray(itemData, 'maps_to', rewriteMap);
        }
        for (const [subFieldName, subSchema] of Object.entries(schema.items.fields)) {
          if (subSchema.type === 'list' && subSchema.items?.type === 'reference') {
            rewriteRefArray(itemData, subFieldName, rewriteMap);
          }
        }
      }
    }
  }
}

/** Rewrite each string in a reference array field via the rewrite map. */
function rewriteRefArray(
  data: Record<string, unknown>,
  fieldName: string,
  rewriteMap: Map<string, string>,
): void {
  const arr = data[fieldName];
  if (!Array.isArray(arr)) return;
  data[fieldName] = arr.map(ref => (typeof ref === 'string' && rewriteMap.has(ref) ? rewriteMap.get(ref)! : ref));
}

/**
 * Re-qualify the moved element's same-document outbound references to the
 * SOURCE document. A reference that resolves to the source document — whether
 * bare (`G1`) or already source-qualified (`sourceDoc:G1`) — becomes
 * `sourceDoc:G1`. References to OTHER documents are untouched.
 */
function requalifyOutbound(
  data: Record<string, unknown>,
  catalog: Catalog,
  categoryName: string,
  sourceDocName: string,
): void {
  // A bare ref `X` (no colon) means "source doc's X". A `sourceDoc:X` ref also
  // means the source doc. Both must end up `sourceDoc:X`. We never touch refs
  // qualified to a different doc.
  const requalify = (ref: unknown): unknown => {
    if (typeof ref !== 'string') return ref;
    if (!ref.includes(':')) {
      // Bare same-doc ref.
      return `${sourceDocName}:${ref}`;
    }
    // Already qualified — leave it. (Source-qualified refs are already correct.)
    return ref;
  };

  const mergedSchemas = mergedFieldSchemas(catalog, categoryName);

  // Top-level maps_to.
  if (Array.isArray(data.maps_to)) {
    data.maps_to = (data.maps_to as unknown[]).map(requalify);
  }
  for (const [fieldName, schema] of Object.entries(mergedSchemas)) {
    if (fieldName === 'maps_to') continue;
    if (schema.type !== 'list' || !schema.items) continue;
    if (schema.items.type === 'reference') {
      if (Array.isArray(data[fieldName])) {
        data[fieldName] = (data[fieldName] as unknown[]).map(requalify);
      }
      continue;
    }
    if (schema.items.type === 'model' && schema.items.fields) {
      const items = data[fieldName];
      if (!Array.isArray(items)) continue;
      for (const item of items) {
        if (!item || typeof item !== 'object') continue;
        const itemData = item as Record<string, unknown>;
        if (schema.items.fields.maps_to && Array.isArray(itemData.maps_to)) {
          itemData.maps_to = (itemData.maps_to as unknown[]).map(requalify);
        }
        for (const [subFieldName, subSchema] of Object.entries(schema.items.fields)) {
          if (subSchema.type === 'list' && subSchema.items?.type === 'reference' && Array.isArray(itemData[subFieldName])) {
            itemData[subFieldName] = (itemData[subFieldName] as unknown[]).map(requalify);
          }
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Inheritance-direction analysis
// ---------------------------------------------------------------------------

/**
 * Build, for each documentPath, the set of its ancestor documentPaths
 * (documents it inherits from, transitively). Ancestors are referenced in
 * `meta.inherits` by name or docPath.
 */
function buildAncestorMap(catalog: Catalog): Map<string, Set<string>> {
  // Direct parents per doc.
  const directParents = new Map<string, Set<string>>();
  const byNameOrPath = new Map<string, string>(); // name|docPath -> docPath
  for (const d of catalog.documents) {
    byNameOrPath.set(d.documentPath, d.documentPath);
    if (d.meta.name) byNameOrPath.set(d.meta.name, d.documentPath);
  }
  for (const d of catalog.documents) {
    const parents = new Set<string>();
    const inherits = d.meta.inherits;
    if (Array.isArray(inherits)) {
      for (const entry of inherits) {
        if (typeof entry === 'string') {
          const p = byNameOrPath.get(entry);
          if (p) parents.add(p);
        }
      }
    }
    directParents.set(d.documentPath, parents);
  }
  // Transitive closure.
  const ancestors = new Map<string, Set<string>>();
  const resolve = (docPath: string, seen: Set<string>): Set<string> => {
    if (ancestors.has(docPath)) return ancestors.get(docPath)!;
    if (seen.has(docPath)) return new Set();
    seen.add(docPath);
    const acc = new Set<string>();
    for (const p of directParents.get(docPath) ?? []) {
      acc.add(p);
      for (const a of resolve(p, seen)) acc.add(a);
    }
    ancestors.set(docPath, acc);
    return acc;
  };
  for (const d of catalog.documents) resolve(d.documentPath, new Set());
  return ancestors;
}

/**
 * Find the documentPaths of all elements that reference the given element
 * (by its qualified `oldRef`). Scans every element-reference field.
 */
function findInboundReferrers(
  catalog: Catalog,
  oldRef: string,
  oldId: string,
  sourceDoc: Document,
): Set<string> {
  const referrers = new Set<string>();
  for (const doc of catalog.documents) {
    for (const el of doc.getAllElements()) {
      const refs = collectAllRefs(el.data, mergedFieldSchemas(catalog, el.categoryName));
      for (const ref of refs) {
        // A same-doc bare ref in the source doc to this element also counts.
        const matchesQualified = ref === oldRef;
        const matchesBareSameDoc = doc.documentPath === sourceDoc.documentPath && ref === oldId;
        if (matchesQualified || matchesBareSameDoc) {
          referrers.add(doc.documentPath);
        }
      }
    }
  }
  return referrers;
}

/** Collect every element-reference string from an element's data. */
function collectAllRefs(
  data: Record<string, unknown>,
  fieldSchemas: Record<string, FieldSchemaEntry>,
): string[] {
  const out: string[] = [];
  const push = (arr: unknown) => {
    if (Array.isArray(arr)) for (const r of arr) if (typeof r === 'string') out.push(r);
  };
  push(data.maps_to);
  for (const [fieldName, schema] of Object.entries(fieldSchemas)) {
    if (fieldName === 'maps_to') continue;
    if (schema.type !== 'list' || !schema.items) continue;
    if (schema.items.type === 'reference') {
      push(data[fieldName]);
    } else if (schema.items.type === 'model' && schema.items.fields) {
      const items = data[fieldName];
      if (!Array.isArray(items)) continue;
      for (const item of items) {
        if (!item || typeof item !== 'object') continue;
        const itemData = item as Record<string, unknown>;
        push(itemData.maps_to);
        for (const [subFieldName, subSchema] of Object.entries(schema.items.fields)) {
          if (subSchema.type === 'list' && subSchema.items?.type === 'reference') {
            push(itemData[subFieldName]);
          }
        }
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function findDoc(catalog: Catalog, nameOrPath: string): Document | undefined {
  return catalog.documents.find(d => d.meta.name === nameOrPath || d.documentPath === nameOrPath);
}

function docNameByPath(catalog: Catalog, docPath: string): string {
  return catalog.documents.find(d => d.documentPath === docPath)?.name ?? docPath;
}

function documentInheritsName(doc: Document, oldName: string, oldDocPath: string): boolean {
  const inherits = doc.meta.inherits;
  if (!Array.isArray(inherits)) return false;
  return inherits.some(entry => typeof entry === 'string' && (entry === oldName || entry === oldDocPath));
}

function locateElement(
  catalog: Catalog,
  doc: Document,
  id: string,
): { categoryName: string; yamlKey: string; idPrefix: string; data: Record<string, unknown> } | undefined {
  for (const el of doc.getAllElements()) {
    if (el.id !== id) continue;
    const catDef = catalog.registry.getByName(el.categoryName);
    if (!catDef) continue;
    return { categoryName: el.categoryName, yamlKey: catDef.yaml_key, idPrefix: catDef.id_prefix, data: el.data };
  }
  return undefined;
}

function mergedFieldSchemas(catalog: Catalog, categoryName: string): Record<string, FieldSchemaEntry> {
  const catDef = catalog.registry.getByName(categoryName);
  return { ...catalog.registry.allFieldSchemas, ...(catDef?.field_schemas ?? {}) };
}

/** Read a YAML doc file, mutate its parsed data, write it back. */
function mutateDocFile(filePath: string, mutate: (data: Record<string, unknown>) => void): void {
  const data = (yaml.load(fs.readFileSync(filePath, 'utf-8')) as Record<string, unknown>) ?? {};
  mutate(data);
  fs.writeFileSync(filePath, yaml.dump(data, { lineWidth: -1, noRefs: true, sortKeys: false }));
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function stampOrigin(
  data: Record<string, unknown>,
  config: GVPConfig,
  note: string,
): void {
  const entry: Record<string, unknown> = { id: randomUUID(), date: new Date().toISOString(), note };
  if (config.user?.name && config.user?.email) {
    entry.by = { name: config.user.name, email: config.user.email };
  }
  const existing = data.origin;
  data.origin = Array.isArray(existing) ? [...existing, entry] : [entry];
}

async function confirm(opts: CliOpts): Promise<boolean> {
  if (opts.yes) return true;
  const isTTY = process.stdin.isTTY;
  if (!isTTY) {
    console.error('Non-interactive mode detected. Use --yes to skip confirmation.');
    process.exit(1);
  }
  const readline = await import('readline');
  const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
  const answer = await new Promise<string>(resolve => rl.question('Proceed? [y/N] ', resolve));
  rl.close();
  return answer.toLowerCase() === 'y';
}
