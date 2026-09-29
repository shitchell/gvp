import { Command } from 'commander';
import * as fs from 'fs';
import * as yaml from 'js-yaml';
import { randomUUID } from 'crypto';
import { parseConfigOptions, buildCatalog, requireUserIdentity, parseIdentityArg, getLibraryOverride, getStoreOverride } from '../helpers.js';
import { isStale, getUnreviewedUpdates } from '../../provenance/staleness.js';
import { computeReviewHash, validateReviewHash } from '../../provenance/review-hash.js';

/**
 * Flags that mean something only when a review is actually being committed.
 * Given without `--approve`, each used to be accepted, ignored, and exit 0 —
 * output indistinguishable from the reporting form (#40). They are now
 * refused, in the same direction the `--approve`-without-`--token` guard
 * already pointed (personal:R2, code-common:CP12).
 */
const STAMPING_FLAGS = ['token', 'note', 'by'] as const;

export function reviewCommand(): Command {
  const cmd = new Command('review')
    .description('Review stale elements and stamp reviewed_by')
    .argument('[element]', 'Element qualified ID to review (e.g., gvp:P1)')
    // Visible since #17. It was hidden under DEC-4.5 as an anti-gaming
    // measure, but the enforcement is the token, not the concealment: no
    // review can be committed without a hash that only `cairn review
    // <element>` will print, so hiding the flag stopped nobody and left
    // `--help` contradicting the command's own closing instruction.
    .option('--approve', 'Commit the review, stamping reviewed_by (requires --token)')
    .option('--token <hash>', 'Review hash token from gvp review output')
    .option('--note <text>', 'Review note')
    .option(
      '--by <identity>',
      'Reviewer identity for this review as "Name <email>" (overrides the configured user)',
      parseIdentityArg,
    )
    .action(async (elementId?: string) => {
      try {
        const opts = cmd.opts();

        // Argument-shape checks run BEFORE the library is touched: they are
        // answerable from argv alone, and a malformed invocation should not
        // depend on finding a library to be reported.
        const given = STAMPING_FLAGS.filter((f) => opts[f] !== undefined);
        if (!opts.approve && given.length > 0) {
          const names = given.map((f) => `--${f}`).join(', ');
          console.error(
            `${names} ${given.length > 1 ? 'apply' : 'applies'} only when committing a review, ` +
              'and --approve was not given — nothing would be recorded.',
          );
          console.error('');
          console.error('To commit the review:');
          console.error(`  gvp review ${elementId ?? '<element>'} --approve --token <hash>`);
          console.error(`To see the pending updates without recording anything, drop ${names}.`);
          process.exit(1);
        }
        if (opts.approve && !elementId) {
          console.error('--approve needs the element being reviewed:');
          console.error('  gvp review <element> --approve --token <hash>');
          console.error('Run `gvp review` with no arguments to list the stale elements.');
          process.exit(1);
        }

        const { config, preflight } = parseConfigOptions(cmd);
        const catalog = buildCatalog(config, process.cwd(), getLibraryOverride(cmd), getStoreOverride(cmd), preflight);

        if (!elementId) {
          // List all stale elements
          const staleElements = catalog.getAllElements().filter(e =>
            e.status === 'active' && isStale(e)
          );

          if (staleElements.length === 0) {
            console.error('No stale elements found. All reviews are up to date.');
            process.exit(0);
          }

          console.error(`Found ${staleElements.length} stale element(s):\n`);
          for (const el of staleElements) {
            const unreviewedIds = getUnreviewedUpdates(el);
            console.error(`  ${el.toLibraryId()}  "${el.name}"  (${unreviewedIds.length} unreviewed update(s))`);
          }
          process.exit(0);
        }

        // Find the specific element
        const element = catalog.getAllElements().find(e =>
          e.toLibraryId() === elementId || e.hashKey() === elementId || e.id === elementId
        );

        if (!element) {
          console.error(`Element '${elementId}' not found`);
          process.exit(1);
        }

        const unreviewedIds = getUnreviewedUpdates(element);

        if (opts.approve) {
          // --approve mode: validate hash token (DEC-4.5)
          if (!opts.token) {
            console.error('--approve requires --token <hash>. Run `cairn review <element>` first to get the hash.');
            process.exit(1);
          }

          if (!validateReviewHash(opts.token, unreviewedIds)) {
            console.error('Invalid review token. The element may have been updated since you last reviewed it.');
            console.error('Run `cairn review ' + elementId + '` again to get a fresh token.');
            process.exit(1);
          }

          // Stamp reviewed_by. `--by` supplies the identity directly when the
          // reviewer is not the configured user — a delegated review (#40).
          // It is the same `{name, email}` shape config produces, so the
          // configured identity is only required when `--by` is absent.
          const user = (opts.by as { name: string; email: string } | undefined) ?? requireUserIdentity(config);
          const reviewEntry = {
            id: randomUUID(),
            date: new Date().toISOString(),
            by: user,
            updates_reviewed: unreviewedIds,
            note: opts.note ?? undefined,
          };

          // Find and update the YAML file
          const doc = catalog.documents.find(d =>
            d.getAllElements().some(e => e.hashKey() === element.hashKey())
          );
          if (!doc) {
            console.error('Could not find document containing this element');
            process.exit(1);
          }

          const content = fs.readFileSync(doc.filePath, 'utf-8');
          const data = yaml.load(content) as Record<string, unknown>;
          const catDef = catalog.registry.getByName(element.categoryName);
          if (!catDef) { console.error('Category not found'); process.exit(1); }

          const items = data[catDef.yaml_key] as Record<string, unknown>[];
          const target = items?.find(item => item.id === element.id);
          if (!target) { console.error('Element not found in YAML'); process.exit(1); }

          if (!target.reviewed_by) target.reviewed_by = [];
          (target.reviewed_by as unknown[]).push(reviewEntry);

          fs.writeFileSync(doc.filePath, yaml.dump(data, {
            lineWidth: -1, noRefs: true, sortKeys: false,
          }));

          console.error(`Reviewed ${element.toLibraryId()} — ${unreviewedIds.length} update(s) marked as reviewed.`);
          process.exit(0);
        }

        // Default: show element details and review hash
        console.error(`Element: ${element.toLibraryId()}  "${element.name}"`);
        console.error(`Category: ${element.categoryName}`);
        console.error(`Status: ${element.status}`);
        console.error('');

        if (unreviewedIds.length === 0) {
          console.error('This element has no unreviewed updates.');
          process.exit(0);
        }

        console.error(`Unreviewed updates: ${unreviewedIds.length}`);
        for (const uid of unreviewedIds) {
          console.error(`  - ${uid}`);
        }
        console.error('');

        // Output the review hash (DEC-4.5: discoverable at end of review output)
        const hash = computeReviewHash(unreviewedIds);
        console.error(`To approve this review:`);
        console.error(`  gvp review ${elementId} --approve --token ${hash}`);
      } catch (e) {
        console.error(`Error: ${(e as Error).message}`);
        process.exit(1);
      }
    });

  return cmd;
}
