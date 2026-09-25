import { Command } from 'commander';
import { execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { parseConfigOptions, buildCatalog, resolveDocumentFilter, getLibraryOverride, getStoreOverride } from '../helpers.js';
import {
  runValidation,
  hasErrors,
  builtinPasses,
  optionalPasses,
  applySourceScope,
  renderSourceScopeSummary,
} from '../../validation/index.js';
import type { Diagnostic, ValidationPass } from '../../validation/index.js';
import { diagnosticVisibilitySchema, type DiagnosticsConfig } from '../../config/schema.js';

/**
 * Find the git root by walking up from cwd.
 */
function findGitRoot(cwd: string): string | null {
  let current = path.resolve(cwd);
  while (true) {
    if (fs.existsSync(path.join(current, '.git'))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

/**
 * Get changed files for a given scope.
 */
function getChangedFiles(scope: string, cwd: string): string[] {
  const gitRoot = findGitRoot(cwd);
  if (!gitRoot) return [];

  let gitCmd: string;
  if (scope === 'staged') {
    gitCmd = 'git diff --cached --name-only';
  } else if (scope === 'working') {
    gitCmd = 'git diff --name-only';
  } else if (scope.includes('..')) {
    // Commit range
    gitCmd = `git diff --name-only ${scope}`;
  } else {
    return [];
  }

  try {
    const output = execSync(gitCmd, { cwd: gitRoot, encoding: 'utf-8' });
    return output.trim().split('\n').filter(f => f.length > 0);
  } catch {
    return [];
  }
}

/**
 * Check if a diagnostic is related to a set of changed files.
 * Ref-related diagnostics (W010, W011, W012) are filtered by ref file.
 * Element-related diagnostics are filtered by whether the element has refs pointing to changed files.
 * Structural/traceability diagnostics always pass through (not file-scoped).
 */
function isDiagnosticInScope(d: Diagnostic, changedSet: Set<string>): boolean {
  // Ref-specific diagnostics: filter by the ref file path
  if (d.code === 'W010' || d.code === 'W011' || d.code === 'W012') {
    return d.context.details !== undefined && changedSet.has(d.context.details.split('::')[0]!);
  }

  // Structural and traceability passes are not file-scoped — always include
  if (d.pass === 'schema' || d.pass === 'structural' || d.pass === 'traceability') {
    return true;
  }

  // For other element-related diagnostics with a details field containing a file path,
  // check if it's in the changed set
  if (d.context.details && changedSet.has(d.context.details)) {
    return true;
  }

  // Default: include (non-file-scoped diagnostics like W001, W002, W005, W006)
  return true;
}

/**
 * Resolve the per-invocation override for `diagnostics` (#29), or undefined
 * to use the config as loaded.
 *
 * A CLI override replaces the WHOLE block, `by_source` included. Layering a
 * flag on top of per-source entries would mean `--include-inherited` still
 * hid whatever `by_source` had pinned to `hide` — the opposite of what the
 * flag says, and the flag is what the summary line tells you to reach for.
 */
function resolveDiagnosticsOverride(opts: Record<string, unknown>): DiagnosticsConfig | undefined {
  if (opts.includeInherited) {
    return { inherited: 'show', by_source: {} };
  }
  if (typeof opts.inherited === 'string') {
    const parsed = diagnosticVisibilitySchema.safeParse(opts.inherited);
    if (!parsed.success) {
      throw new Error(
        `--inherited must be one of: show, count, hide (got '${opts.inherited}')`,
      );
    }
    return { inherited: parsed.data, by_source: {} };
  }
  return undefined;
}

export function validateCommand(): Command {
  const cmd = new Command('validate')
    .description('Validate the GVP library')
    .option('--scope <scope>', 'Scope validation to: staged, working, or <commit>..<commit> (DEC-10.5)')
    .option('-d, --document <name>', 'Restrict diagnostics to a single document (matched by meta.name or documentPath)')
    .option('--coverage', 'Enable the coverage pass (W012, W013)')
    .option('--passes <passes>', 'Comma-separated list of passes to run (e.g., schema,structural,semantic,coverage)')
    .option('--include-inherited', 'Show every diagnostic on inherited elements, overriding `diagnostics` config (#29)')
    .option('--inherited <mode>', 'Override `diagnostics.inherited` for this run: show | count | hide (#29)')
    .action(async () => {
      try {
        const { config, preflight } = parseConfigOptions(cmd);
        const catalog = buildCatalog(config, process.cwd(), getLibraryOverride(cmd), getStoreOverride(cmd), preflight);
        const opts = cmd.opts();

        let documentFilter: Set<string> | undefined;
        if (opts.document) {
          documentFilter = resolveDocumentFilter(catalog, opts.document as string);
          if (documentFilter.size === 0) {
            console.error(`No document matches '${opts.document}'. Check meta.name or documentPath.`);
            process.exit(1);
          }
        }

        // Build the passes map
        const allPasses = new Map<string, ValidationPass>([...builtinPasses, ...optionalPasses]);

        // Determine which pass names to run.
        // Default to builtin passes only — optional passes (like coverage) require explicit opt-in.
        let passNames: string[];
        if (opts.passes) {
          passNames = (opts.passes as string).split(',').map(s => s.trim());
        } else if (opts.coverage) {
          passNames = [...builtinPasses.keys(), 'coverage'];
        } else {
          passNames = [...builtinPasses.keys()];
        }

        const diagnostics = runValidation(catalog, config, allPasses, passNames);

        // Apply scope filtering if --scope is provided
        let filteredDiagnostics = diagnostics;
        if (opts.scope) {
          const changedFiles = getChangedFiles(opts.scope as string, process.cwd());
          const changedSet = new Set(changedFiles);
          filteredDiagnostics = diagnostics.filter(d => isDiagnosticInScope(d, changedSet));
        }

        // Apply --document filter: keep only diagnostics whose documentPath
        // context is in the allowed set. Diagnostics without a documentPath
        // context (library-wide structural checks) pass through.
        if (documentFilter) {
          const allowed = documentFilter;
          filteredDiagnostics = filteredDiagnostics.filter(d => {
            const docPath = d.context.documentPath;
            if (!docPath) return true;
            return allowed.has(docPath);
          });
        }

        // Source-scoped display (#29): withhold diagnostics on elements this
        // repo cannot edit, without losing them. Runs LAST so it composes
        // with --scope and --document rather than competing with them.
        const scoped = applySourceScope(
          filteredDiagnostics,
          catalog,
          config,
          resolveDiagnosticsOverride(opts),
        );

        // Print diagnostics to stderr (DEC-5.12)
        for (const d of scoped.shown) {
          const prefix = d.severity === 'error' ? 'ERROR' : 'WARN';
          const location = d.context.elementId
            ? `${d.context.documentPath ?? ''}:${d.context.elementId}`
            : d.context.documentPath ?? '';
          console.error(`${prefix}  ${d.code}  ${location}  ${d.description}`);
        }

        if (scoped.shown.length === 0) {
          console.error('Validation passed. Structural checks OK. Use `cairn export` for semantic review.');
        }

        // The summary always follows the detail, so a scoped-out finding is
        // the last thing you read rather than something scrolled past.
        for (const line of renderSourceScopeSummary(scoped)) {
          console.error(line);
        }

        // Exit code (DEC-5.12): 0 for success/warnings, non-zero for errors.
        // Genuine errors are never scoped out (applySourceScope), so scoping
        // can only ever drop strict-promoted warnings here — never mask a
        // real failure.
        process.exit(hasErrors(scoped.shown) ? 1 : 0);
      } catch (e) {
        console.error(`Error: ${(e as Error).message}`);
        process.exit(1);
      }
    });

  return cmd;
}
