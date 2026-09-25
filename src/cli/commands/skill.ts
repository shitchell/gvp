import { Command } from 'commander';
import * as path from 'path';
import {
  DEFAULT_DEST_DISPLAY,
  SKILL_NAME,
  getDefaultDestDir,
  getPackagedVersion,
  getSkillSourceDir,
  listSkillFiles,
} from '../../skill/paths.js';
import { inspectDest, requiresForce, type DestState } from '../../skill/manifest.js';
import { planInstall, performInstall, type InstallPlan } from '../../skill/install.js';

/**
 * `cairn skill` — get the packaged agent skill onto disk (#1, #14 item 3).
 *
 * Until this existed a consumer had no route to the skill at all: it was not
 * in the published tarball and no command emitted it, so every project that
 * adopted cairn re-derived the same usage knowledge by hitting it in the
 * wild. Shipping the skill WITH the tool is also what keeps it from drifting
 * from the schema — `status` answers "which version is installed" without a
 * network call, which is the whole mechanism #14 asked for.
 *
 * Shaped after `libs` (D54): a noun group with sub-actions, every read
 * subcommand carrying `--json`, because the downstream consumer is an agent
 * (G7) and a human table parsed by regex defeats the purpose.
 *
 * Explicit invocation only — never a postinstall hook. postinstall is
 * unreliable under `--ignore-scripts`, and writing into a user's
 * `~/.claude/skills/` because they installed a CLI is exactly the
 * auto-activation personal:V4 refuses.
 */
export function skillCommand(): Command {
  const cmd = new Command('skill').description(
    'Install, locate, and check the agent skill shipped with cairn',
  );

  cmd
    .command('install')
    .description('Copy the packaged skill into a skills directory')
    .option('--dest <path>', `Destination directory (default: ${DEFAULT_DEST_DISPLAY})`)
    .option('-y, --yes', 'Skip confirmation prompt')
    .option('--force', 'Overwrite a locally modified skill (backs it up first)')
    .option('--dry-run', 'Show what would happen without writing')
    .option('--json', 'Machine-readable output')
    .action(async (opts: { dest?: string; yes?: boolean; force?: boolean; dryRun?: boolean; json?: boolean }) => {
      try {
        await runInstall(opts);
      } catch (e) {
        console.error(`Error: ${(e as Error).message}`);
        process.exit(1);
      }
    });

  cmd
    .command('path')
    .description('Print the packaged skill directory, for symlinking or copying by hand')
    .option('--json', 'Machine-readable output')
    .action((opts: { json?: boolean }) => {
      try {
        const dir = getSkillSourceDir();
        if (opts.json) {
          console.log(
            JSON.stringify(
              { skill: SKILL_NAME, version: getPackagedVersion(), path: dir, files: listSkillFiles(dir) },
              null,
              2,
            ),
          );
          return;
        }
        // Bare path, nothing else: the point of this subcommand is that
        // `ln -s "$(cairn skill path)" .claude/skills/cairn` works, so any
        // decoration on stdout would break its only real use.
        console.log(dir);
      } catch (e) {
        console.error(`Error: ${(e as Error).message}`);
        process.exit(1);
      }
    });

  cmd
    .command('status')
    .description('Report the installed skill version against the packaged one')
    .option('--dest <path>', `Destination directory to check (default: ${DEFAULT_DEST_DISPLAY})`)
    .option('--json', 'Machine-readable output')
    .action((opts: { dest?: string; json?: boolean }) => {
      try {
        runStatus(opts);
      } catch (e) {
        console.error(`Error: ${(e as Error).message}`);
        process.exit(1);
      }
    });

  return cmd;
}

// ---------------------------------------------------------------------------
// install
// ---------------------------------------------------------------------------

async function runInstall(opts: {
  dest?: string;
  yes?: boolean;
  force?: boolean;
  dryRun?: boolean;
  json?: boolean;
}): Promise<void> {
  const sourceDir = getSkillSourceDir();
  const version = getPackagedVersion();
  const destDir = path.resolve(opts.dest ?? getDefaultDestDir());
  const plan = planInstall(sourceDir, destDir, version);
  const state = plan.inspection.state;

  // Under --json stdout carries one object and nothing else, so the preview
  // narrative moves to stderr (DEC-5.12).
  const say = opts.json ? (s: string) => console.error(s) : (s: string) => console.log(s);

  describePlan(plan, say);

  if (opts.dryRun) {
    if (opts.json) console.log(JSON.stringify(planJson(plan, 'dry-run'), null, 2));
    return;
  }

  // The refusal comes BEFORE the TTY check on purpose: a locally modified
  // skill is refused "even interactively", so the message a CI job sees
  // names the authorization it actually lacks (--force) rather than the
  // prompt it happens not to have (--yes).
  if (requiresForce(state) && !opts.force) {
    console.error('');
    console.error(refusalMessage(plan));
    process.exit(1);
  }

  // Two distinct authorizations, deliberately not collapsed: --yes says
  // "do not ask me", --force says "overwrite my edits". A CI job wanting
  // only the first must not silently get the second (personal:V5).
  const needsBackup = requiresForce(state);

  if (!opts.yes) {
    if (!process.stdin.isTTY) {
      console.error('');
      console.error('Non-interactive mode detected. Use --yes to skip confirmation.');
      process.exit(1);
    }
    const readline = await import('readline');
    const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
    const answer = await new Promise<string>((resolve) => rl.question(`Install into ${destDir}? [y/N] `, resolve));
    rl.close();
    if (answer.trim().toLowerCase() !== 'y') {
      console.error('Aborted. Nothing was written.');
      process.exit(1);
    }
  }

  const result = performInstall(plan, { backup: needsBackup });

  if (opts.json) {
    console.log(
      JSON.stringify({ ...planJson(plan, 'installed'), written: result.written, pruned: result.pruned, backup: result.backupDir }, null, 2),
    );
    return;
  }
  if (result.backupDir) console.log(`Backed up the previous copy to ${result.backupDir}`);
  console.log(
    `Installed ${SKILL_NAME} skill ${version} (${result.written} file${result.written === 1 ? '' : 's'}) into ${destDir}`,
  );
  if (result.pruned > 0) {
    console.log(`Removed ${result.pruned} file${result.pruned === 1 ? '' : 's'} no longer part of the skill.`);
  }
}

function describePlan(plan: InstallPlan, say: (s: string) => void): void {
  const state = plan.inspection.state;
  say(`source:      ${plan.sourceDir}  (${plan.version})`);
  say(`destination: ${plan.destDir}`);
  switch (state) {
    case 'absent':
      say(`state:       not installed — ${plan.write.length} file(s) will be written`);
      break;
    case 'unmodified':
      say(
        `state:       installed from ${plan.installedVersion ?? 'unknown'}, unmodified — this is an update to ${plan.version}`,
      );
      break;
    case 'modified':
      say(`state:       installed from ${plan.installedVersion ?? 'unknown'}, LOCALLY MODIFIED`);
      for (const f of plan.inspection.changed) say(`  edited:    ${f}`);
      for (const f of plan.inspection.removed) say(`  removed:   ${f}`);
      break;
    case 'unmanaged':
      say(`state:       files present but no install manifest — provenance unknown`);
      for (const f of plan.inspection.untracked) say(`  present:   ${f}`);
      break;
  }
  if (plan.prune.length > 0) {
    say(`  will delete (from the previous version, unmodified):`);
    for (const f of plan.prune) say(`    ${f}`);
  }
  if (plan.keptStale.length > 0) {
    say(`  kept (from a previous version, but you edited them):`);
    for (const f of plan.keptStale) say(`    ${f}`);
  }
  if (plan.inspection.untracked.length > 0 && state !== 'unmanaged') {
    say(`  left alone (not ours):`);
    for (const f of plan.inspection.untracked) say(`    ${f}`);
  }
}

function refusalMessage(plan: InstallPlan): string {
  const lines: string[] = [];
  if (plan.inspection.state === 'unmanaged') {
    lines.push(
      `Refusing to overwrite ${plan.destDir}: it contains files but no install manifest, so cairn cannot tell whether they are yours.`,
    );
  } else {
    const n = plan.inspection.changed.length + plan.inspection.removed.length;
    lines.push(
      `Refusing to overwrite ${plan.destDir}: ${n} file${n === 1 ? ' has' : 's have'} been modified since install.`,
    );
  }
  lines.push('Pass --force to overwrite anyway (the current contents are backed up first),');
  lines.push(`or --dest <path> to install somewhere else.`);
  return lines.join('\n');
}

function planJson(plan: InstallPlan, outcome: string): Record<string, unknown> {
  return {
    outcome,
    skill: SKILL_NAME,
    source: plan.sourceDir,
    dest: plan.destDir,
    packaged_version: plan.version,
    installed_version: plan.installedVersion,
    state: plan.inspection.state,
    files: plan.write,
    overwrite: plan.overwrite,
    prune: plan.prune,
    kept_stale: plan.keptStale,
    changed: plan.inspection.changed,
    removed: plan.inspection.removed,
    untracked: plan.inspection.untracked,
  };
}

// ---------------------------------------------------------------------------
// status
// ---------------------------------------------------------------------------

function runStatus(opts: { dest?: string; json?: boolean }): void {
  const sourceDir = getSkillSourceDir();
  const version = getPackagedVersion();
  const destDir = path.resolve(opts.dest ?? getDefaultDestDir());
  const inspection = inspectDest(destDir);
  const installedVersion = inspection.manifest?.source_version ?? null;
  // No network call and no auto-check: `status` compares what is on disk
  // against what this package ships, and answers only when asked. An
  // automatic update check would reintroduce exactly the auto-activation
  // personal:V4 refuses.
  const upToDate = inspection.state !== 'absent' && installedVersion === version;

  if (opts.json) {
    console.log(
      JSON.stringify(
        {
          skill: SKILL_NAME,
          packaged_version: version,
          packaged_path: sourceDir,
          dest: destDir,
          state: inspection.state,
          installed_version: installedVersion,
          installed_at: inspection.manifest?.installed_at ?? null,
          up_to_date: upToDate,
          changed: inspection.changed,
          removed: inspection.removed,
          untracked: inspection.untracked,
        },
        null,
        2,
      ),
    );
    return;
  }

  console.log(`skill:     ${SKILL_NAME}`);
  console.log(`packaged:  ${version}  (${sourceDir})`);
  console.log(`dest:      ${destDir}`);
  console.log(`state:     ${describeState(inspection.state)}`);

  if (inspection.state === 'absent') {
    console.log(`Not installed. Run \`cairn skill install\` to install ${version}.`);
    return;
  }
  if (inspection.state === 'unmanaged') {
    console.log(
      'No install manifest here, so the installed version is unknown. `cairn skill install --force` will back it up and install ' +
        `${version}.`,
    );
    return;
  }
  console.log(
    upToDate
      ? `Installed from ${installedVersion}, which is current.`
      : `Installed from ${installedVersion}, current is ${version} — run \`cairn skill install\` to update.`,
  );
  for (const f of inspection.changed) console.log(`  edited:  ${f}`);
  for (const f of inspection.removed) console.log(`  removed: ${f}`);
  if (inspection.state === 'modified') {
    console.log('Locally modified — an update requires --force, and backs the current copy up first.');
  }
}

function describeState(state: DestState): string {
  switch (state) {
    case 'absent':
      return 'not installed';
    case 'unmodified':
      return 'installed, unmodified';
    case 'modified':
      return 'installed, locally modified';
    case 'unmanaged':
      return 'files present, no manifest';
  }
}
