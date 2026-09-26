import { describe, it, expect } from 'vitest';
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/**
 * `skills/cairn/commands-reference.md` vs. `cairn <command> --help`.
 *
 * WHY THIS TEST EXISTS
 *
 * This file has drifted from the binary twice. The 2026-06-22 copy documented
 * `cairn review D1 --approve --token <hash>` and `cairn export --format dot`;
 * neither flag nor format has ever existed. Agents read the skill, not
 * `--help`, so a wrong flag table does not produce a confused human who runs
 * `--help` — it produces a failed tool call inside an agent loop, which is
 * exactly the failure mode the skill is supposed to prevent. Meanwhile the
 * binary grew `-d/--document`, `--field-file`, `--hops`, `--inherited` and a
 * whole `mv` command that the document never mentioned.
 *
 * Prose review does not catch this: the two artifacts are only compared when
 * somebody happens to look. So the comparison is mechanical (personal:P7 — a
 * process needs an enforcement mechanism; code-common:CP10).
 *
 * WHAT IT CHECKS, in both directions
 *
 *   1. every command in `cairn --help` has a `### cairn <name>` section;
 *   2. UNDOCUMENTED — every command-specific flag in `cairn <cmd> --help`
 *      appears somewhere in that command's section;
 *   3. OVER-DOCUMENTED — every flag mentioned in a section is one the command
 *      actually accepts;
 *   4. the `## Global Options` table matches the root program's options exactly;
 *   5. the flags the document explicitly says do NOT exist really do not.
 *
 * WHY IT SHELLS OUT rather than importing the Commander program: `cairn <cmd>
 * --help` is what a maintainer would run to check the document by hand, and
 * `src/cli/index.ts` parses argv at import time. Reading help text also pins
 * the text a user sees, not an internal object that happens to feed it.
 *
 * HOW ATTRIBUTION WORKS. A section may legitimately name another command's
 * flag ("`cairn edit --field-file` reads it from a file", inside the `add`
 * section). So a flag is attributed to the last `cairn <command>` named on the
 * same line, falling back to the section's own command. The cross-reference is
 * still checked — against the command it names. That keeps prose natural
 * without weakening check 3 to "exists somewhere".
 */

const CLI = path.resolve(__dirname, '../../dist/cli/index.js');
const DOC = path.resolve(__dirname, '../../skills/cairn/commands-reference.md');

/** `--help` needs no library and must not be influenced by one. */
function help(args: string[]): string {
  const r = spawnSync('node', [CLI, ...args, '--help'], {
    cwd: os.tmpdir(),
    encoding: 'utf-8',
    timeout: 20000,
  });
  if (r.status !== 0 || !r.stdout) {
    throw new Error(`\`cairn ${args.join(' ')} --help\` failed (status ${r.status}): ${r.stderr}`);
  }
  return r.stdout;
}

/** One option as `--help` prints it: every spelling it answers to. */
interface HelpOption {
  long: string;
  tokens: string[];
}

/**
 * Parse the `Options:` block. An option line is indented exactly two spaces
 * and starts with a dash; a wrapped description is indented to the padding
 * column, which is always deeper. The flags half is separated from the
 * description by two or more spaces — so a description that itself names a
 * flag (`--field-file key path`) cannot be mistaken for one.
 */
function parseOptions(helpText: string): HelpOption[] {
  const out: HelpOption[] = [];
  let inOptions = false;
  for (const line of helpText.split('\n')) {
    if (/^Options:/.test(line)) {
      inOptions = true;
      continue;
    }
    if (/^\S/.test(line)) {
      inOptions = false;
      continue;
    }
    if (!inOptions) continue;
    const m = /^ {2}(-\S.*)$/.exec(line);
    if (!m) continue;
    const flagsPart = m[1]!.split(/\s{2,}/)[0]!;
    const tokens = [...flagsPart.matchAll(/--?[A-Za-z][\w-]*/g)].map((x) => x[0]);
    const long = tokens.find((t) => t.startsWith('--'));
    if (!long) continue;
    out.push({ long, tokens });
  }
  return out;
}

/** Subcommand names from a parent's `Commands:` block, `help` excluded. */
function parseSubcommands(helpText: string): string[] {
  const out: string[] = [];
  let inCommands = false;
  for (const line of helpText.split('\n')) {
    if (/^Commands:/.test(line)) {
      inCommands = true;
      continue;
    }
    if (/^\S/.test(line)) {
      inCommands = false;
      continue;
    }
    if (!inCommands) continue;
    const m = /^ {2}([a-z][a-z-]*)\b/.exec(line);
    if (m && m[1] !== 'help') out.push(m[1]!);
  }
  return out;
}

const rootHelp = help([]);
const rootOptions = parseOptions(rootHelp);
const commandNames = parseSubcommands(rootHelp);

/**
 * Longs that every subcommand mirrors (see `mirrorGlobalOptions`). They are
 * documented once, under `## Global Options`, so a command section is not
 * required to repeat them — but is still allowed to mention them.
 */
const GLOBAL_LONGS = new Set(rootOptions.map((o) => o.long));

interface CommandSurface {
  /** Everything the command answers to, its own flags and the mirrored globals. */
  accepts: Set<string>;
  /** What its section must mention: its own flags, minus the globals and `--help`. */
  requires: Set<string>;
}

function toSurface(options: HelpOption[]): CommandSurface {
  const accepts = new Set<string>();
  const requires = new Set<string>();
  for (const opt of options) {
    for (const t of opt.tokens) accepts.add(t);
    if (opt.long === '--help' || GLOBAL_LONGS.has(opt.long)) continue;
    for (const t of opt.tokens) requires.add(t);
  }
  return { accepts, requires };
}

function surfaceOf(name: string): CommandSurface {
  const ownHelp = help([name]);
  // A parent like `libs` or `skill` carries no behaviour of its own; its
  // section documents the subcommands, so they share one pool. Pooling also
  // means a NEW subcommand flag is caught without teaching the test the
  // command tree.
  const subs = parseSubcommands(ownHelp);
  return toSurface([...parseOptions(ownHelp), ...subs.flatMap((s) => parseOptions(help([name, s])))]);
}

const surfaces = new Map<string, CommandSurface>(commandNames.map((n) => [n, surfaceOf(n)]));

/**
 * The root program, as a pseudo-command, so `## Global Options` is checked
 * against the globals rather than against "any flag anywhere". The key cannot
 * collide with a real command name: `cairn <name>` attribution only ever
 * matches `[a-z][a-z-]*`.
 */
const ROOT = '__root__';
{
  const tokens = rootOptions.filter((o) => o.long !== '--help').flatMap((o) => o.tokens);
  surfaces.set(ROOT, { accepts: new Set(tokens), requires: new Set(tokens) });
}

/** Any flag the CLI has anywhere — the acceptance set for non-command prose. */
const ANY_FLAG = new Set<string>([
  ...rootOptions.flatMap((o) => o.tokens),
  ...[...surfaces.values()].flatMap((s) => [...s.accepts]),
]);

// ---------------------------------------------------------------------------
// The document
// ---------------------------------------------------------------------------

const docText = fs.readFileSync(DOC, 'utf-8');

interface DocSection {
  heading: string;
  /** The command this section documents, if it is a `### cairn <name>` section. */
  command: string | null;
  lines: string[];
}

/**
 * Only `##` and `###` open a section; `####` and deeper stay inside the
 * command section they were written under (the `add` section's list-field
 * subsection is about `add`, and must be checked as such).
 */
function parseSections(md: string): DocSection[] {
  const sections: DocSection[] = [];
  let current: DocSection = { heading: '(preamble)', command: null, lines: [] };
  let inFence = false;
  for (const line of md.split('\n')) {
    if (/^```/.test(line)) inFence = !inFence;
    const h = inFence ? null : /^(#{2,3})\s+(.*)$/.exec(line);
    if (h) {
      sections.push(current);
      const heading = h[2]!.trim();
      const cmd = /^cairn\s+([a-z][a-z-]*)/.exec(heading);
      const command = cmd && surfaces.has(cmd[1]!) ? cmd[1]! : /^Global Options$/i.test(heading) ? ROOT : null;
      current = { heading, command, lines: [] };
      continue;
    }
    current.lines.push(line);
  }
  sections.push(current);
  return sections;
}

const sections = parseSections(docText);

/**
 * Flags the document explicitly denies, parsed from the "Flags this document
 * asserts do not exist" table. Exempt from the over-documented check (the
 * denial has to be able to name the flag) and asserted absent below.
 */
function parseDenials(): Array<{ command: string; flag: string }> {
  const section = sections.find((s) => /asserts do not exist/i.test(s.heading));
  if (!section) return [];
  const out: Array<{ command: string; flag: string }> = [];
  for (const line of section.lines) {
    const m = /^\|\s*`([a-z][a-z-]*)`\s*\|\s*`(--[\w-]+)`\s*\|/.exec(line);
    if (m) out.push({ command: m[1]!, flag: m[2]! });
  }
  return out;
}

const denials = parseDenials();
const DENIED_FLAGS = new Set(denials.map((d) => d.flag));

/** Universal; never worth a table row. */
const IGNORED = new Set(['--help', '-h']);

const TOKEN = /cairn\s+([a-z][a-z-]*)|(--[A-Za-z][\w-]*)|(?<![-\w])(-[A-Za-z])(?![\w-])/g;

/**
 * A command line belonging to some OTHER program. `npm install -g` and
 * `ln -s "$(cairn skill path)"` both appear in this document, and `-g` / `-s`
 * are npm's and ln's, not cairn's. The rule is positional and needs no list of
 * program names: if a code span or fenced line STARTS with a bare word that is
 * not `cairn`/`gvp`, every flag in it belongs to that word.
 */
function isForeignInvocation(chunk: string): boolean {
  const first = chunk.trim().split(/\s+/)[0] ?? '';
  return /^[A-Za-z][\w.-]*$/.test(first) && first !== 'cairn' && first !== 'gvp';
}

/**
 * Split a line into chunks: inline-code spans and the prose between them, in
 * order. A fenced line is one code chunk in its entirety. Chunking exists only
 * so `isForeignInvocation` can be asked of code, and never of prose — prose
 * starting with an ordinary word ("reads it from a file") is not an invocation
 * of a program called `reads`.
 */
function chunksOf(line: string, fenced: boolean): Array<{ text: string; code: boolean }> {
  if (fenced) return [{ text: line, code: true }];
  return line.split('`').map((text, i) => ({ text, code: i % 2 === 1 }));
}

/**
 * Every flag token in a section, paired with the command it is attributed to.
 * `cairn <name>` earlier on the same line re-points attribution, so a
 * deliberate cross-reference is checked against the command it names rather
 * than the section it sits in. A `cairn`-prefixed word that is not a command
 * leaves attribution alone, so "cairn preserves whatever you put there" does
 * not silently retarget the checks.
 */
function mentionedFlags(section: DocSection): Array<{ flag: string; command: string | null }> {
  const found: Array<{ flag: string; command: string | null }> = [];
  let inFence = false;
  for (const line of section.lines) {
    if (/^```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    let attributed = section.command;
    for (const chunk of chunksOf(line, inFence)) {
      const foreign = chunk.code && isForeignInvocation(chunk.text);
      for (const m of chunk.text.matchAll(TOKEN)) {
        if (m[1] !== undefined) {
          if (surfaces.has(m[1])) attributed = m[1];
          continue;
        }
        if (foreign) continue;
        const flag = m[2] ?? m[3]!;
        if (IGNORED.has(flag) || DENIED_FLAGS.has(flag)) continue;
        found.push({ flag, command: attributed });
      }
    }
  }
  return found;
}

// ---------------------------------------------------------------------------
// The checks. Each failure names the command and the specific flag: a message
// that says only "the document is out of date" costs the reader the whole diff
// again, which is how it went un-fixed twice.
// ---------------------------------------------------------------------------

describe('commands-reference.md matches `cairn <command> --help`', () => {
  it('has a section for every command the CLI exposes', () => {
    const documented = new Set(sections.map((s) => s.command).filter((c): c is string => c !== null));
    const missing = commandNames.filter((c) => !documented.has(c));
    expect(
      missing,
      `commands-reference.md has no "### cairn <name>" section for: ${missing.join(', ')}. ` +
        'Every command in `cairn --help` needs one; an undocumented command is invisible to an agent.',
    ).toEqual([]);
  });

  it.each(commandNames)('documents every flag of `cairn %s`', (name) => {
    const surface = surfaces.get(name)!;
    const section = sections.find((s) => s.command === name);
    expect(section, `no "### cairn ${name}" section in commands-reference.md`).toBeDefined();

    const mentioned = new Set(mentionedFlags(section!).map((f) => f.flag));
    const undocumented = [...surface.requires].filter((f) => !mentioned.has(f)).sort();
    expect(
      undocumented,
      `\`cairn ${name} --help\` accepts ${undocumented.join(', ')}, and the ` +
        `"### cairn ${name}" section of skills/cairn/commands-reference.md never mentions ` +
        `${undocumented.length === 1 ? 'it' : 'them'}. Add ${undocumented.length === 1 ? 'it' : 'them'} ` +
        'to that section\'s flag table.',
    ).toEqual([]);
  });

  it('mentions no flag that the named command does not accept', () => {
    const problems: string[] = [];
    for (const section of sections) {
      for (const { flag, command } of mentionedFlags(section)) {
        const accepts = command === null ? ANY_FLAG : surfaces.get(command)!.accepts;
        if (accepts.has(flag)) continue;
        problems.push(
          command === null
            ? `"## ${section.heading}" mentions ${flag}, which no cairn command accepts`
            : `"## ${section.heading}" mentions ${flag} for \`cairn ${command}\`, which does not accept it ` +
              `(\`cairn ${command} --help\` does not list it)`,
        );
      }
    }
    expect(
      [...new Set(problems)].sort(),
      'skills/cairn/commands-reference.md documents flags that do not exist. ' +
        'Either the flag was removed from the CLI and the document was not updated, or it never existed. ' +
        'If the document means to say a flag is ABSENT, add it to the ' +
        '"Flags this document asserts do not exist" table instead of only asserting it in prose.',
    ).toEqual([]);
  });

  it('has a Global Options table that matches the root program exactly', () => {
    const section = sections.find((s) => /^Global Options$/i.test(s.heading));
    expect(section, 'commands-reference.md has no "## Global Options" section').toBeDefined();

    const mentioned = new Set(mentionedFlags(section!).map((f) => f.flag));
    const expected = rootOptions
      .filter((o) => o.long !== '--help')
      .flatMap((o) => o.tokens)
      .filter((t) => !IGNORED.has(t));

    const missing = [...new Set(expected)].filter((t) => !mentioned.has(t)).sort();
    expect(
      missing,
      `\`cairn --help\` lists global ${missing.join(', ')}, absent from the "## Global Options" table. ` +
        'A global that is documented nowhere is worse than a missing command flag: nothing else covers it.',
    ).toEqual([]);

    // The reverse direction is covered by the over-documented check above,
    // which treats this section's default attribution as the root program.
  });

  it('is right that the flags it denies do not exist', () => {
    expect(denials.length, 'the denial table was not parsed — did its shape change?').toBeGreaterThan(0);
    const wrong = denials
      .filter((d) => surfaces.get(d.command)?.accepts.has(d.flag))
      .map((d) => `cairn ${d.command} ${d.flag}`);
    expect(
      wrong,
      `commands-reference.md states these flags do not exist, but the CLI now accepts them: ${wrong.join(', ')}. ` +
        'Remove the row and document the flag properly.',
    ).toEqual([]);
  });
});
