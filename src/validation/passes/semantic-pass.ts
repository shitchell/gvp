import type { Catalog } from '../../catalog/catalog.js';
import type { GVPConfig } from '../../config/schema.js';
import type { Diagnostic } from '../diagnostic.js';
import { createDiagnostic } from '../diagnostic.js';
import { isStale } from '../../provenance/staleness.js';
import { createRefParserRegistry, findParser } from '../../parsers/registry.js';
import { findProjectRoot } from '../../utils/project-root.js';
import * as fs from 'fs';
import * as path from 'path';

const PASS_NAME = 'semantic';

/**
 * Semantic warnings W001-W006 (VAL-4).
 */
export function semanticPass(catalog: Catalog, _config: GVPConfig): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  // Build lookup for resolving maps_to references
  const elementLookup = new Map<string, import('../../model/element.js').Element>();
  for (const el of catalog.getAllElements()) {
    elementLookup.set(el.toLibraryId(), el);
    elementLookup.set(el.hashKey(), el);
  }

  // W001: Empty maps_to on non-root active element (VAL-4)
  for (const element of catalog.getAllElements()) {
    if (element.status !== 'active') continue;
    if (element.maps_to.length > 0) continue;

    const catDef = catalog.registry.getByName(element.categoryName);
    if (!catDef || catDef.is_root) continue;

    // Non-root active element with no maps_to
    diagnostics.push(createDiagnostic(
      'W001',
      'EMPTY_MAPS_TO',
      `Element ${element.toLibraryId()} is a non-root active element with no maps_to references`,
      'warning',
      PASS_NAME,
      { elementId: element.id, documentPath: element.documentPath, categoryName: element.categoryName },
    ));
  }

  // W002: Empty document (no active elements)
  for (const doc of catalog.documents) {
    const activeElements = doc.getAllElements().filter(e => e.status === 'active');
    if (activeElements.length === 0) {
      diagnostics.push(createDiagnostic(
        'W002',
        'EMPTY_DOCUMENT',
        `Document '${doc.name}' contains no active elements`,
        'warning',
        PASS_NAME,
        { documentPath: doc.documentPath },
      ));
    }
  }

  // W005: Self-document-only mapping (DEC-5.5: always fires, suppress via diagnostic system)
  for (const element of catalog.getAllElements()) {
    if (element.status !== 'active') continue;
    if (element.maps_to.length === 0) continue;

    const catDef = catalog.registry.getByName(element.categoryName);
    if (catDef?.is_root) continue;

    const allSelfDocument = element.maps_to.every(ref => {
      const target = elementLookup.get(ref);
      return target && target.documentPath === element.documentPath;
    });

    if (allSelfDocument) {
      diagnostics.push(createDiagnostic(
        'W005',
        'SELF_DOCUMENT_MAPPING',
        `Element ${element.toLibraryId()} maps only to elements within its own document`,
        'warning',
        PASS_NAME,
        { elementId: element.id, documentPath: element.documentPath },
      ));
    }
  }

  // W006: Staleness — element has unreviewed non-skip-review updates (DEC-4.7)
  for (const element of catalog.getAllElements()) {
    if (element.status !== 'active') continue;

    if (isStale(element)) {
      diagnostics.push(createDiagnostic(
        'W006',
        'STALE_ELEMENT',
        `Element ${element.toLibraryId()} has unreviewed updates`,
        'warning',
        PASS_NAME,
        { elementId: element.id, documentPath: element.documentPath },
      ));
    }
  }

  // W004: Orphan element — truly isolated (no incoming AND no outgoing edges)
  {
    // Build a set of all elements that are targets of some maps_to
    const mappedToSet = new Set<string>();
    for (const el of catalog.getAllElements()) {
      for (const ref of el.maps_to) {
        mappedToSet.add(ref);
      }
    }

    for (const element of catalog.getAllElements()) {
      if (element.status !== 'active') continue;
      const catDef = catalog.registry.getByName(element.categoryName);
      if (!catDef || catDef.is_root) continue;

      const libId = element.toLibraryId();
      const hKey = element.hashKey();
      const hasIncoming = mappedToSet.has(libId) || mappedToSet.has(hKey);
      const hasOutgoing = element.maps_to.length > 0;

      // Only flag if truly isolated — no edges in either direction
      if (!hasIncoming && !hasOutgoing) {
        diagnostics.push(createDiagnostic(
          'W004',
          'ORPHAN_ELEMENT',
          `Element ${libId} is isolated — nothing maps to it and it maps to nothing`,
          'warning',
          PASS_NAME,
          { elementId: element.id, documentPath: element.documentPath, categoryName: element.categoryName },
        ));
      }
    }
  }

  // W010/W011: Ref file/identifier validation (DEC-10.5).
  // Also applies to procedure step refs — same structural rules, no
  // new relationship type (D19).
  // Determine project root by walking up from first document's filePath looking for .git/
  const projectRoot = findProjectRoot(catalog);
  if (projectRoot) {
    const parsers = createRefParserRegistry();

    const checkRef = (
      element: import('../../model/element.js').Element,
      ref: { file: string; identifier: string; role: string },
      stepId?: string,
    ): void => {
      const absPath = path.resolve(projectRoot, ref.file);
      const refOwnerLabel = stepId
        ? `${element.toLibraryId()} step '${stepId}'`
        : `Element ${element.toLibraryId()}`;

      // W010: Ref file does not exist on disk
      if (!fs.existsSync(absPath)) {
        diagnostics.push(createDiagnostic(
          'W010',
          'REF_FILE_MISSING',
          `${refOwnerLabel} ref file does not exist: ${ref.file}`,
          'warning',
          PASS_NAME,
          {
            elementId: element.id,
            documentPath: element.documentPath,
            details: ref.file,
          },
        ));
        return;
      }

      // W011: Ref identifier not found in file
      if (ref.identifier) {
        const ext = path.extname(ref.file);
        const parser = findParser(ext, parsers);
        if (parser) {
          try {
            const content = fs.readFileSync(absPath, 'utf-8');
            const block = parser.extractBlock(content, ref.identifier);
            if (block === null) {
              diagnostics.push(createDiagnostic(
                'W011',
                'REF_IDENTIFIER_MISSING',
                `${refOwnerLabel} ref identifier not found in ${ref.file}: ${ref.identifier}`,
                'warning',
                PASS_NAME,
                {
                  elementId: element.id,
                  documentPath: element.documentPath,
                  details: `${ref.file}::${ref.identifier}`,
                },
              ));
            }
          } catch {
            // File read error — skip silently (W010 would have caught non-existent files)
          }
        }
      }
    };

    for (const element of catalog.getAllElements()) {
      // Element-level refs
      const refs = element.get('refs') as Array<{ file: string; identifier: string; role: string }> | undefined;
      if (Array.isArray(refs)) {
        for (const ref of refs) {
          checkRef(element, ref);
        }
      }

      // Generic: check refs inside any list<model> field whose items have a refs sub-field
      const catDefRefs = catalog.registry.getByName(element.categoryName);
      if (catDefRefs) {
        const mergedSchemasRefs = { ...catalog.registry.allFieldSchemas, ...(catDefRefs.field_schemas ?? {}) };
        for (const [fieldName, schema] of Object.entries(mergedSchemasRefs)) {
          if (schema.type !== 'list' || !schema.items || schema.items.type !== 'model') continue;
          if (!schema.items.fields?.refs) continue;
          const items = element.get(fieldName) as Array<Record<string, unknown>> | undefined;
          if (!Array.isArray(items)) continue;
          for (const item of items) {
            if (!item || typeof item !== 'object') continue;
            const itemRefs = item.refs;
            if (!Array.isArray(itemRefs)) continue;
            const itemLabel = (item.id as string) ?? (item.name as string) ?? '?';
            for (const ref of itemRefs) {
              if (!ref || typeof ref !== 'object') continue;
              checkRef(
                element,
                ref as { file: string; identifier: string; role: string },
                itemLabel,
              );
            }
          }
        }
      }
    }
  }

  // W015: Auto-assigned item ids in list<model> fields. Emitted by the
  // semantic pass when the parser filled in missing item ids at load
  // time. The warning tells the user that R1 preservation across item
  // deletions requires persisting explicit ids — auto-numbering based
  // on list position will silently renumber surviving items if one is
  // removed without persisted ids.
  for (const doc of catalog.documents) {
    for (const element of doc.getAllElements()) {
      if (doc.hasAutoAssignedStepIds(element.id)) {
        diagnostics.push(createDiagnostic(
          'W015',
          'AUTO_ASSIGNED_STEP_ID',
          `Element ${element.toLibraryId()} has list items without explicit ids; auto-numbered at load time. Persist explicit ids (e.g., '${element.id}.1', '${element.id}.2', ...) to preserve R1 across deletions`,
          'warning',
          PASS_NAME,
          { elementId: element.id, documentPath: element.documentPath },
        ));
      }
    }
  }

  return diagnostics;
}

