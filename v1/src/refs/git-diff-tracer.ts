import { execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import type { Element } from '../model/element.js';
import type { Catalog } from '../catalog/catalog.js';
import { createRefParserRegistry, findParser } from '../parsers/registry.js';
import type { RefParser } from '../parsers/base.js';

export interface RefChange {
  element: Element;
  ref: { file: string; identifier: string; role: string };
  changeType: 'modified' | 'removed' | 'added';
  /** Lines of the identifier block at commit A (null if added) */
  blockBefore: string | null;
  /** Lines of the identifier block at commit B (null if removed) */
  blockAfter: string | null;
}

export interface DiffTraceResult {
  commitA: string;
  commitB: string;
  changedFiles: string[];
  refChanges: RefChange[];
}

/**
 * Get the list of files changed between two commits.
 */
function getChangedFiles(commitA: string, commitB: string, cwd: string): string[] {
  try {
    const output = execSync(
      `git diff --name-only ${commitA} ${commitB}`,
      { cwd, encoding: 'utf-8' }
    );
    return output.trim().split('\n').filter(f => f.length > 0);
  } catch {
    return [];
  }
}

/**
 * Get file content at a specific commit.
 */
function getFileAtCommit(filePath: string, commit: string, cwd: string): string | null {
  try {
    return execSync(
      `git show ${commit}:${filePath}`,
      { cwd, encoding: 'utf-8' }
    );
  } catch {
    return null; // File doesn't exist at this commit
  }
}

/**
 * Trace changes between two commits back to GVP decisions via refs.
 *
 * 1. Get changed files between commitA and commitB
 * 2. Find all elements with refs pointing to changed files
 * 3. For each matching ref, extract the identifier block at both commits
 * 4. Compare — report if the identifier changed, was added, or was removed
 */
export function traceGitDiff(
  catalog: Catalog,
  commitA: string,
  commitB: string,
  cwd: string,
): DiffTraceResult {
  const parsers = createRefParserRegistry();
  const changedFiles = getChangedFiles(commitA, commitB, cwd);

  // Build a set of changed file paths for quick lookup
  const changedSet = new Set(changedFiles);

  // Find all elements with refs pointing to changed files
  const refChanges: RefChange[] = [];

  for (const element of catalog.getAllElements()) {
    const refs = element.get('refs') as Array<{ file: string; identifier: string; role: string }> | undefined;
    if (!refs || !Array.isArray(refs)) continue;

    for (const ref of refs) {
      if (!changedSet.has(ref.file)) continue;

      // This ref points to a changed file — check the identifier
      const ext = path.extname(ref.file);
      const parser = findParser(ext, parsers);

      const contentBefore = getFileAtCommit(ref.file, commitA, cwd);
      const contentAfter = getFileAtCommit(ref.file, commitB, cwd);

      let blockBefore: string | null = null;
      let blockAfter: string | null = null;

      if (parser) {
        if (contentBefore) blockBefore = parser.extractBlock(contentBefore, ref.identifier);
        if (contentAfter) blockAfter = parser.extractBlock(contentAfter, ref.identifier);
      } else {
        // No parser — use file-level comparison (DEC-10.15)
        blockBefore = contentBefore;
        blockAfter = contentAfter;
      }

      let changeType: RefChange['changeType'];
      if (!blockBefore && blockAfter) {
        changeType = 'added';
      } else if (blockBefore && !blockAfter) {
        changeType = 'removed';
      } else if (blockBefore !== blockAfter) {
        changeType = 'modified';
      } else {
        continue; // No change to this identifier
      }

      refChanges.push({
        element,
        ref,
        changeType,
        blockBefore,
        blockAfter,
      });
    }
  }

  return { commitA, commitB, changedFiles, refChanges };
}

/**
 * Format a DiffTraceResult for display.
 */
export function formatDiffTrace(result: DiffTraceResult, catalog: Catalog): string {
  const lines: string[] = [];
  lines.push(`Git diff: ${result.commitA.substring(0, 7)}..${result.commitB.substring(0, 7)}`);
  lines.push(`Changed files: ${result.changedFiles.length}`);
  lines.push('');

  if (result.refChanges.length === 0) {
    lines.push('No GVP-traced changes detected.');
    return lines.join('\n');
  }

  lines.push(`Traced changes: ${result.refChanges.length}`);
  lines.push('');

  for (const change of result.refChanges) {
    const icon = change.changeType === 'modified' ? '~' :
                 change.changeType === 'added' ? '+' :
                 '-';

    lines.push(`[${icon}] ${change.ref.file}::${change.ref.identifier}`);
    lines.push(`    Role: ${change.ref.role}`);
    lines.push(`    Element: ${change.element.toString()} (${change.element.categoryName})`);

    // Trace the element upward through maps_to
    const ancestors = traceAncestors(change.element, catalog);
    if (ancestors.length > 0) {
      lines.push(`    Traces to:`);
      for (const ancestor of ancestors) {
        lines.push(`      → ${ancestor.toString()} (${ancestor.categoryName})`);
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Simple ancestor tracing — follow maps_to to find goals/values.
 */
function traceAncestors(element: Element, catalog: Catalog): Element[] {
  const visited = new Set<string>();
  const ancestors: Element[] = [];

  function walk(el: Element) {
    for (const ref of el.maps_to) {
      const target = catalog.getAllElements().find(e =>
        e.toLibraryId() === ref || e.hashKey() === ref
      );
      if (target && !visited.has(target.hashKey())) {
        visited.add(target.hashKey());
        ancestors.push(target);
        walk(target);
      }
    }
  }

  walk(element);
  return ancestors;
}
