import { Command } from 'commander';
import { execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { parseConfigOptions, buildCatalog } from '../helpers.js';
import { runValidation, hasErrors, builtinPasses, optionalPasses } from '../../validation/index.js';
import type { Diagnostic, ValidationPass } from '../../validation/index.js';

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

export function validateCommand(): Command {
  const cmd = new Command('validate')
    .description('Validate the GVP library')
    .option('--scope <scope>', 'Scope validation to: staged, working, or <commit>..<commit> (DEC-10.5)')
    .option('--coverage', 'Enable the coverage pass (W012, W013)')
    .option('--passes <passes>', 'Comma-separated list of passes to run (e.g., schema,structural,semantic,coverage)')
    .action(async () => {
      try {
        const { config } = parseConfigOptions(cmd);
        const catalog = buildCatalog(config);
        const opts = cmd.opts();

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

        // Print diagnostics to stderr (DEC-5.12)
        for (const d of filteredDiagnostics) {
          const prefix = d.severity === 'error' ? 'ERROR' : 'WARN';
          const location = d.context.elementId
            ? `${d.context.documentPath ?? ''}:${d.context.elementId}`
            : d.context.documentPath ?? '';
          console.error(`${prefix}  ${d.code}  ${location}  ${d.description}`);
        }

        if (filteredDiagnostics.length === 0) {
          console.error('Validation passed. Structural checks OK. Use `cairn export` for semantic review.');
        }

        // Exit code (DEC-5.12): 0 for success/warnings, non-zero for errors
        process.exit(hasErrors(filteredDiagnostics) ? 1 : 0);
      } catch (e) {
        console.error(`Error: ${(e as Error).message}`);
        process.exit(1);
      }
    });

  return cmd;
}
