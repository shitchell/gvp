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
 * This file has drifted from the binary repeatedly. Agents read the skill, not
 * `--help`, so a wrong flag table does not produce a confused human who runs
 * `--help` — it produces a failed tool call inside an agent loop, which is
 * exactly the failure mode the skill is supposed to prevent. The binary grew
 * `-d/--document`, `--field-file`, `--hops`, `--inherited` and a whole `mv`
 * command that the document never mentioned.
 *
 * Then it drifted the OTHER way. An earlier version of this comment claimed that
 * `cairn review --approve` and `cairn export --format dot` had "never existed".
 * Both exist and both work. That claim was checked against `--help`, which is
 * exactly the mistake described under "`--help` IS NOT AN ORACLE" below, and it
 * is left recorded here because the false correction did more damage than the
 * original drift: it deleted working functionality from the documentation and
 * added a test that defended the deletion.
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
 *   5. every deliberately hidden flag is documented, since `--help` will not
 *      reveal it and the document is the only place a reader can learn it.
 *
 * `--help` IS NOT AN ORACLE FOR EXISTENCE. This is the lesson of a later
 * regression, and it shaped checks 3 and 5. The document used to carry a table
 * headed "Flags this document asserts do not exist", and this test asserted
 * those flags really were absent — by looking for them in `--help`. Both of the
 * table's claims were false. `cairn review --approve` is a real, working flag
 * that `review.ts` marks `hidden` (DEC-4.5), so it is absent from `--help` and
 * present in the binary; `cairn export --format dot` is a real, working format
 * that the `--format` description string simply does not list. A help-parsing
 * absence check cannot see either, so instead of catching the false claims it
 * CONFIRMED them. The table is gone from the document and the check that read it
 * is gone from here, both replaced by the probe below.
 *
 * So there are three states, not two, and the middle one is what fooled us:
 *
 *   absent               `--help` silent, invoking it → `error: unknown option`
 *   present, documented  `--help` lists it,  invoking it → runs
 *   present, hidden      `--help` silent, invoking it → runs
 *
 * `existence()` distinguishes all three: `--help` answers "documented?", and
 * only INVOKING the flag answers "exists?".
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
  /** Everything `--help` shows the command answering to, plus the mirrored globals. */
  accepts: Set<string>;
  /** What its section must mention: its own flags, minus the globals and `--help`. */
  requires: Set<string>;
  /**
   * argv prefixes to probe when `accepts` says nothing — the command itself and
   * each of its subcommands, because a flag may live only on a subcommand
   * (`cairn libs --json` is unknown; `cairn libs list --json` works).
   */
  argvs: string[][];
}

function toSurface(options: HelpOption[], argvs: string[][]): CommandSurface {
  const accepts = new Set<string>();
  const requires = new Set<string>();
  for (const opt of options) {
    for (const t of opt.tokens) accepts.add(t);
    if (opt.long === '--help' || GLOBAL_LONGS.has(opt.long)) continue;
    for (const t of opt.tokens) requires.add(t);
  }
  return { accepts, requires, argvs };
}

function surfaceOf(name: string): CommandSurface {
  const ownHelp = help([name]);
  // A parent like `libs` or `skill` carries no behaviour of its own; its
  // section documents the subcommands, so they share one pool. Pooling also
  // means a NEW subcommand flag is caught without teaching the test the
  // command tree.
  const subs = parseSubcommands(ownHelp);
  return toSurface(
    [...parseOptions(ownHelp), ...subs.flatMap((s) => parseOptions(help([name, s])))],
    [[name], ...subs.map((s) => [name, s])],
  );
}

const surfaces = new Map<string, CommandSurface>(commandNames.map((n) => [n, surfaceOf(n)]));

// ---------------------------------------------------------------------------
// Existence by invocation
// ---------------------------------------------------------------------------

/**
 * A directory with no `.gvp/` in it or above it, and a redirected HOME, so a
 * probe cannot reach the real library, the real registry, or the real config.
 * `/etc/gvp/config.yaml` is switched off through `GVP_CONFIG_SYSTEM=''`, which
 * the loader reads as "skip that layer".
 */
const PROBE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'cairn-flag-probe-'));
const PROBE_ENV: NodeJS.ProcessEnv = {
  ...process.env,
  HOME: PROBE_DIR,
  USERPROFILE: PROBE_DIR,
  GVP_CONFIG_SYSTEM: '',
  GVP_CONFIG_GLOBAL: '',
  GVP_CONFIG_PROJECT: '',
  GVP_CONFIG_LOCAL: '',
  GVP_REGISTRY_ROOT: path.join(PROBE_DIR, 'registry'),
  CAIRN_CACHE_DIR: path.join(PROBE_DIR, 'cache'),
};

/**
 * Does `cairn <argv> <flag>` come back with Commander's unknown-option error?
 *
 * WHY THIS IS SAFE. Commander validates option NAMES while parsing argv, before
 * the action body runs, so a flag that does not exist never reaches any code
 * that could write. A flag that does exist gets past parsing and then dies at
 * library discovery, because PROBE_DIR has no library — including the one
 * invocation that would otherwise do real damage: `review <id> --approve
 * --token <hash>` stops at "No GVP library found" and stamps nothing. (That
 * command really does perform a review when it finds a library, which is
 * precisely why the probe must never run where one exists.)
 *
 * WHY `--help` IS NOT APPENDED to make it safer: it would make the probe
 * useless. `cairn review --bogusflag --help` prints help and exits 0 — help
 * short-circuits the unknown-option error, so every flag would read as present.
 *
 * WHY NOTHING ELSE IS APPENDED either: globals are mirrored onto commands but
 * NOT onto sub-subcommands, so a defensive `--no-config` would itself be an
 * unknown option to `cairn libs list` and poison the result.
 *
 * The assertion is on the specific message, naming the flag — not on failure.
 * Every cairn command fails in PROBE_DIR, so "it exited non-zero" would report
 * every flag as absent.
 */
function rejectsAsUnknown(argv: string[], flag: string): boolean {
  const r = spawnSync('node', [CLI, ...argv, flag], {
    cwd: PROBE_DIR,
    env: PROBE_ENV,
    encoding: 'utf-8',
    timeout: 20000,
  });
  return `${r.stderr}${r.stdout}`.includes(`unknown option '${flag}'`);
}

type Existence = 'absent' | 'visible' | 'hidden';

const existenceCache = new Map<string, Existence>();

/**
 * Which of the three states is this flag in, for this command? `visible` is
 * read from `--help`; the other two are told apart by invoking the flag. A
 * verdict of `absent` requires EVERY argv path to reject it, so a flag that
 * lives on one subcommand is not called absent because its siblings lack it.
 */
function existence(command: string, flag: string): Existence {
  const key = `${command} ${flag}`;
  const cached = existenceCache.get(key);
  if (cached) return cached;

  const surface = surfaces.get(command)!;
  const verdict: Existence = surface.accepts.has(flag)
    ? 'visible'
    : surface.argvs.every((argv) => rejectsAsUnknown(argv, flag))
      ? 'absent'
      : 'hidden';

  existenceCache.set(key, verdict);
  return verdict;
}

/** Does any cairn command have this flag? For prose outside a command section. */
function existsAnywhere(flag: string): boolean {
  return [...surfaces.keys()].some((c) => existence(c, flag) !== 'absent');
}

/**
 * The root program, as a pseudo-command, so `## Global Options` is checked
 * against the globals rather than against "any flag anywhere". The key cannot
 * collide with a real command name: `cairn <name>` attribution only ever
 * matches `[a-z][a-z-]*`.
 */
const ROOT = '__root__';
{
  const tokens = rootOptions.filter((o) => o.long !== '--help').flatMap((o) => o.tokens);
  surfaces.set(ROOT, { accepts: new Set(tokens), requires: new Set(tokens), argvs: [[]] });
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
 * Flags `review.ts` and friends deliberately hide from `--help`, which is the
 * one state `--help` cannot report. Listed here so check 5 can require the
 * document to cover them, and so a flag being un-hidden or dropped upstream
 * fails loudly instead of silently relaxing that requirement.
 *
 * This is the only place the test needs a hand-maintained list, and it is
 * unavoidable: you cannot discover a hidden flag by probing, because probing
 * needs a name to probe with.
 */
const KNOWN_HIDDEN: Array<{ command: string; flag: string }> = [{ command: 'review', flag: '--approve' }];

/**
 * Every skill document that talks about flags. The denial check below reads all
 * of them, not just `commands-reference.md`: the `--approve` denial was written
 * in TWO files, and the old table-driven check only covered one, so the copy in
 * `workflow-full.md` was never tested at all.
 */
const FLAG_DOCS = ['commands-reference.md', 'workflow-full.md'].map((f) =>
  path.resolve(__dirname, '../../skills/cairn', f),
);

/**
 * Sentences that assert a flag does not exist. Scanned as PROSE rather than read
 * from a dedicated table, because the claim is a claim wherever it is written,
 * and a table only catches the denials somebody remembered to tabulate.
 *
 * Both patterns are flag-first or flag-adjacent on purpose. "no `--x`" puts the
 * flag immediately after the negation; the second requires the flag to precede
 * the phrase. Prose that mentions a flag AFTER discussing non-existence in
 * general ("...a table headed \"Flags this document asserts do not exist\".
 * `cairn review --approve` exists") is therefore not a denial, which is what
 * lets the document explain its own history without tripping the check.
 */
const DENIAL_PATTERNS: RegExp[] = [
  /\bno\s+`(--[A-Za-z][\w-]*)`/gi,
  /`(--[A-Za-z][\w-]*)`[^.]{0,60}?(?:does\s+not|do\s+not|doesn't|never)\s+exist/gi,
];

/**
 * Flags a document claims are absent, with the command each denial is about.
 * Attribution reuses the `cairn <command>` rule: the last command named on the
 * line, else the enclosing `### cairn <name>` section, else every command.
 */
function parseProseDenials(file: string): Array<{ file: string; command: string | null; flag: string; line: string }> {
  const out: Array<{ file: string; command: string | null; flag: string; line: string }> = [];
  const text = fs.readFileSync(file, 'utf-8');
  let section: string | null = null;
  let inFence = false;
  for (const line of text.split('\n')) {
    if (/^```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const h = /^#{2,3}\s+cairn\s+([a-z][a-z-]*)/.exec(line);
    if (h) section = surfaces.has(h[1]!) ? h[1]! : null;
    else if (/^#{2,3}\s/.test(line)) section = null;

    for (const pattern of DENIAL_PATTERNS) {
      pattern.lastIndex = 0;
      for (const m of line.matchAll(pattern)) {
        // A denial usually names its command after the flag ("no `--approve`
        // flag on `cairn review`"), so unlike ordinary prose attribution this
        // reads the whole line: nearest command before the flag, else the first
        // one after it, else the enclosing section.
        const named = (s: string) =>
          [...s.matchAll(/cairn\s+([a-z][a-z-]*)/g)].map((x) => x[1]!).filter((c) => surfaces.has(c));
        const before = named(line.slice(0, m.index));
        const after = named(line.slice(m.index));
        out.push({ file, command: before.at(-1) ?? after.at(0) ?? section, flag: m[1]!, line: line.trim() });
      }
    }
  }
  return out;
}

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
        if (IGNORED.has(flag)) continue;
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
        // Existence is settled by INVOKING the flag, never by its absence from
        // `--help`. A hidden flag is missing from `--help` and works fine, so a
        // help-only test would report every correctly-documented hidden flag as
        // over-documented — the same unsound oracle, running backwards.
        if (command === null ? ANY_FLAG.has(flag) || existsAnywhere(flag) : existence(command, flag) !== 'absent') {
          continue;
        }
        problems.push(
          command === null
            ? `"## ${section.heading}" mentions ${flag}, which no cairn command has ` +
              `(every command rejects it with \`error: unknown option '${flag}'\`)`
            : `"## ${section.heading}" mentions ${flag} for \`cairn ${command}\`, which does not have it ` +
              `(\`cairn ${command} ${flag}\` fails with \`error: unknown option '${flag}'\`)`,
        );
      }
    }
    expect(
      [...new Set(problems)].sort(),
      'skills/cairn/commands-reference.md documents flags that do not exist. ' +
        'Either the flag was removed from the CLI and the document was not updated, or it never existed. ' +
        'Each verdict above came from running the flag, not from reading `--help`: cairn answered ' +
        '`error: unknown option`, which is conclusive. Do not "fix" this by asserting in prose that the ' +
        'flag does not exist — that is how this document acquired two false denials.',
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

  /**
   * The check that used to be wrong. It read a table and decided absence by
   * parsing `--help`, so a hidden flag looked nonexistent and the test AGREED
   * with the document's false denial instead of catching it. Absence is now
   * decided the only way it can be: by running the flag.
   */
  it('is right that the flags it denies do not exist', () => {
    const denials = FLAG_DOCS.flatMap(parseProseDenials);
    const wrong: string[] = [];
    for (const d of denials) {
      const candidates = d.command === null ? [...surfaces.keys()] : [d.command];
      const owners = candidates.filter((c) => existence(c, d.flag) !== 'absent');
      if (owners.length === 0) continue; // the denial is correct: nothing accepts it

      const spell = (c: string) => `cairn ${c === ROOT ? '' : `${c} `}${d.flag}`.replace(/\s+/g, ' ');
      const hidden = owners.filter((c) => existence(c, d.flag) === 'hidden');
      wrong.push(
        `${path.basename(d.file)} denies ${d.flag}, but ${owners.map((c) => `\`${spell(c)}\``).join(', ')} ` +
          `${owners.length > 1 ? 'are' : 'is'} accepted` +
          (hidden.length > 0
            ? ` — and it is HIDDEN from \`--help\`, which is exactly why reading help "confirmed" this denial once before`
            : '') +
          `.\n      denial: "${d.line}"`,
      );
    }
    expect(
      wrong.sort(),
      'a skill document asserts a flag does not exist, and invoking that flag proves otherwise:\n    ' +
        `${wrong.join('\n    ')}\n  ` +
        'Delete the denial and document the flag. If it is hidden from `--help`, say so and add it to ' +
        'KNOWN_HIDDEN — hidden is not absent.',
    ).toEqual([]);
  });

  /**
   * The guard on the oracle itself. If `existence()` ever stops telling these
   * three states apart, every check above silently weakens, so the states are
   * asserted directly on known examples rather than only through the document.
   */
  it('tells absent, visible and hidden apart by invocation', () => {
    // Absent: nothing in the CLI has this, and the probe says so out loud.
    expect(
      existence('review', '--flag-that-cairn-does-not-have'),
      '`cairn review --flag-that-cairn-does-not-have` should be rejected as an unknown option',
    ).toBe('absent');
    expect(existsAnywhere('--flag-that-cairn-does-not-have')).toBe(false);

    // Visible: listed by `--help`, so no probe is needed.
    expect(existence('review', '--token'), '`cairn review --help` lists --token').toBe('visible');

    // Hidden — the state that fooled us. `--help` is silent, and the flag works.
    expect(
      help(['review']).includes('--approve'),
      '`cairn review --help` is expected NOT to mention --approve (review.ts marks it hidden, DEC-4.5). ' +
        'If it now does, --approve became a visible flag: update KNOWN_HIDDEN and gvp #17.',
    ).toBe(false);
    expect(
      existence('review', '--approve'),
      '`cairn review --approve` exists — it is the flag that commits a review — and it is hidden from ' +
        '`--help`. If this reads `absent`, the probe has stopped working and the absence checks above are ' +
        'no longer sound; if it reads `visible`, the flag was un-hidden.',
    ).toBe('hidden');

    // Hidden flags must be reached only through invocation, never help parsing.
    expect(
      surfaces.get('review')!.accepts.has('--approve'),
      'help parsing must not report --approve; if it did, this test would pass for the wrong reason',
    ).toBe(false);
  });

  it('documents every flag that is hidden from `--help`', () => {
    const wrongState = KNOWN_HIDDEN.filter(({ command, flag }) => existence(command, flag) !== 'hidden').map(
      ({ command, flag }) => `cairn ${command} ${flag} is ${existence(command, flag)}, not hidden`,
    );
    expect(
      wrongState,
      'KNOWN_HIDDEN is stale: ' +
        `${wrongState.join('; ')}. A flag that became visible should be dropped from the list; ` +
        'a flag that was removed should be dropped from the list AND from commands-reference.md.',
    ).toEqual([]);

    const undocumented = KNOWN_HIDDEN.filter(({ command, flag }) => {
      const section = sections.find((s) => s.command === command);
      return !section || !mentionedFlags(section).some((f) => f.flag === flag);
    }).map(({ command, flag }) => `cairn ${command} ${flag}`);
    expect(
      undocumented,
      `these flags are hidden from \`--help\`, so commands-reference.md is the only way a reader can learn ` +
        `they exist — and it does not mention them: ${undocumented.join(', ')}. ` +
        'Document the flag in its command section. Do NOT record it as nonexistent: a hidden flag is a real ' +
        'flag, and claiming otherwise is the defect this check exists to prevent.',
    ).toEqual([]);
  });
});
