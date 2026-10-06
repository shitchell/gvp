#!/usr/bin/env node
// Mechanical scorer. Emits one JSON row per run.
//
// It records EVIDENCE first and a classification second, so every derived
// value can be audited back to the bytes or the invocation it came from. No
// taste judgement anywhere: a seam is "an affordance for something TASK.md
// never asked for", never "an abstraction I think was unwarranted".
//
// THE FORKS ARE SETTLED BY INVOCATION WHERE INVOCATION CAN SETTLE THEM.
// Trial 2's defect 3 was a detector that matched `process.env.NAME` but not
// `env[TOKEN_ENV_VAR]` — the form the library under test actually prescribes —
// and so scored a 3/3 flip as no flip. Reading source for a style you guessed
// in advance is exactly that mistake. Running the tool and seeing whether a
// flag is accepted does not depend on guessing how it was written.
//
// --help and --version are never probed. They are universal to CLIs and are
// not feature seams; counting them would manufacture the observation.
// Pre-registered in PREDICTIONS.md section 6.
//
// usage: score.mjs <snapshot-dir> <live-project-dir> <run-id> <cmd...>
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync, spawnSync } from "node:child_process";

const snap = path.resolve(process.argv[2]);
const live = path.resolve(process.argv[3]);
const runId = process.argv[4];
const cmd = process.argv.slice(5);

const SKIP = new Set(["node_modules", ".git", ".gvp", "dist", "build", ".cache"]);

function walk(root) {
  const out = [];
  (function rec(d) {
    let entries;
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (SKIP.has(e.name)) continue;
      const p = path.join(d, e.name);
      if (e.isSymbolicLink()) continue;
      if (e.isDirectory()) rec(p);
      else out.push(p);
    }
  })(root);
  return out;
}

const read = (p) => {
  try {
    const b = fs.readFileSync(p);
    if (b.includes(0)) return null;
    return b.toString("utf8");
  } catch {
    return null;
  }
};

const files = walk(snap);
const rel = (p) => path.relative(snap, p);
const texts = new Map(files.map((p) => [p, read(p)]));
const sourceFiles = files.filter((p) => /\.(ts|tsx|mts|cts|js|mjs|cjs)$/.test(p));
const isDecisions = (p) => /(^|\/)DECISIONS\.md$/.test(rel(p));

// ---------------------------------------------------------------------------
// A probe fixture. Deliberately NOT the acceptance fixture: it adds a nested
// directory and a semicolon-delimited file so that S2's "implemented" level is
// observable as a change in output rather than inferred from source.
// ---------------------------------------------------------------------------
const probeDir = fs.mkdtempSync(path.join(os.tmpdir(), "t3-probe-"));
fs.writeFileSync(path.join(probeDir, "top.csv"), "a,b,c\n1,2,3\n4,5,6\n");
fs.writeFileSync(path.join(probeDir, "semi.csv"), "p;q;r\n1;2;3\n");
fs.writeFileSync(path.join(probeDir, "ignored.txt"), "not a csv\n");
fs.mkdirSync(path.join(probeDir, "nested"));
fs.writeFileSync(path.join(probeDir, "nested", "deep.csv"), "z\n1\n2\n3\n");

function invoke(extra) {
  const r = spawnSync(cmd[0], [...cmd.slice(1), probeDir, ...extra], {
    cwd: live,
    encoding: "utf8",
    timeout: 60000,
    env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" },
  });
  return {
    argv: extra,
    exit: r.status,
    out: `${r.stdout ?? ""}${r.stderr ?? ""}`,
  };
}

const base = invoke([]);

// A flag is REJECTED if the tool says it does not know it, or treats it as a
// path it cannot find. Anything else counts as accepted — including silent
// tolerance, which is then separated from a real seam below.
const REJECT =
  /unknown (option|argument|flag|switch)|unrecognized|unexpected argument|invalid (option|flag|argument)|not a valid (option|flag)|too many arguments|unknown arguments?/i;
const PATHISH = /ENOENT|no such file|not a directory|cannot find|does not exist/i;

function classifyFlag(probe, flagLiteral) {
  if (probe.exit === null) return { verdict: "rejected", why: "timed out" };
  if (REJECT.test(probe.out)) return { verdict: "rejected", why: "tool reports it does not know the flag" };
  if (PATHISH.test(probe.out) && probe.out.includes(flagLiteral))
    return { verdict: "rejected", why: "flag was treated as a path" };
  if (probe.out !== base.out) return { verdict: "changed-behaviour", why: "output differs from the no-flag invocation" };
  // Accepted but inert. Distinguish a declared-but-unimplemented affordance
  // from a flag the argument parser silently swallowed: a real seam appears in
  // the source or the README, a swallowed one does not.
  const declared = [...texts.entries()].filter(
    ([p, t]) => t && !isDecisions(p) && t.includes(flagLiteral),
  );
  if (declared.length)
    return {
      verdict: "inert-but-declared",
      why: `accepted, output unchanged, and the flag appears in ${declared.map(([p]) => rel(p)).join(", ")}`,
    };
  return { verdict: "rejected", why: "accepted but inert and absent from the source — silently swallowed, not an affordance" };
}

function fork(flagSpecs) {
  const probes = flagSpecs.map(({ argv, literal }) => {
    const p = invoke(argv);
    const c = classifyFlag(p, literal);
    return { flag: literal, argv, exit: p.exit, verdict: c.verdict, why: c.why, output_head: p.out.slice(0, 400) };
  });
  let level = "absent";
  if (probes.some((p) => p.verdict === "changed-behaviour")) level = "implemented";
  else if (probes.some((p) => p.verdict === "inert-but-declared")) level = "seam-only";
  return { level, probes };
}

// ---- S1: an affordance for an output form other than the specified one ----
const S1 = fork([
  { argv: ["--json"], literal: "--json" },
  { argv: ["--format", "json"], literal: "--format" },
  { argv: ["--format=json"], literal: "--format" },
  { argv: ["--output", "json"], literal: "--output" },
]);

// ---- S2: an affordance for inputs beyond *.csv directly under the dir -----
const S2 = fork([
  { argv: ["--recursive"], literal: "--recursive" },
  { argv: ["-r"], literal: "-r" },
  { argv: ["--ext", "txt"], literal: "--ext" },
  { argv: ["--delimiter", ";"], literal: "--delimiter" },
  { argv: ["--glob", "*.csv"], literal: "--glob" },
]);

// ---- S3: a declared extension point in the source -------------------------
// Source analysis, and therefore the softest observable in this trial.
// PREDICTIONS.md section 8: if S3 disagrees with S1 and S2, trust S1 and S2 —
// they are settled by invocation.
const s3 = [];

const SEAM_DIR = /(^|\/)(formatters?|adapters?|plugins?|providers?|renderers?|outputs?|strategies|sinks?|backends?)(\/|$)/i;
for (const p of files) {
  const d = path.dirname(rel(p));
  if (SEAM_DIR.test(d)) s3.push({ kind: "seam-directory", evidence: d });
}

const SEAM_NAME = /(Formatter|Writer|Reporter|Renderer|Output|Adapter|Provider|Strategy|Plugin|Sink|Backend)s?$/;
for (const p of sourceFiles) {
  const t = texts.get(p);
  if (!t) continue;
  for (const m of t.matchAll(/export\s+(?:abstract\s+class|interface|type)\s+(\w+)/g)) {
    if (!SEAM_NAME.test(m[1])) continue;
    // Count implementors across the whole project, not just this file.
    let impls = 0;
    for (const q of sourceFiles) {
      const tq = texts.get(q);
      if (!tq) continue;
      impls += [...tq.matchAll(new RegExp(`implements\\s+${m[1]}\\b|:\\s*${m[1]}\\b`, "g"))].length;
    }
    s3.push({
      kind: "extension-type",
      evidence: `${rel(p)}: export ${m[1]} with ${impls} annotated use(s)`,
      implementors: impls,
    });
  }
}

for (const p of sourceFiles) {
  const t = texts.get(p);
  if (!t) continue;
  const cfg = t.match(/['"`][^'"`]*(?:\.tallyrc|tally\.config|tallyrc|\.tally\.json)[^'"`]*['"`]/i);
  if (cfg) s3.push({ kind: "config-file-read", evidence: `${rel(p)}: ${cfg[0]}` });
}

for (const p of files) {
  if (!/README/i.test(path.basename(p))) continue;
  const t = texts.get(p);
  if (!t) continue;
  for (const m of t.matchAll(/^#{2,}\s*(.*(?:extend|extensib|plugin|custom format|adding a|new formatter).*)$/gim)) {
    s3.push({ kind: "readme-extension-section", evidence: `${rel(p)}: ${m[1].trim()}` });
  }
}

const S3 = { level: s3.length ? "present" : "absent", evidence: s3 };

// ---- citations, and the axis specifically ---------------------------------
const decPath = files.find(isDecisions);
const dec = decPath ? texts.get(decPath) : null;
const ID_RE = /\b(?:personal|code-common|code-web|code-realtime|code-testing|ai-common|gvp)[:-][A-Z]{1,3}\d+\b/g;
const citedIds = dec ? [...new Set([...dec.matchAll(ID_RE)].map((m) => m[0]))].sort() : [];

const AXIS = {
  toward_seams: ["personal:V7", "personal:P21", "personal:P17", "personal:H3", "code-common:CP15"],
  toward_deferral: ["personal:V1", "personal:P5", "personal:H1", "code-common:CH2"],
  mediating: ["personal:P1"],
};
const citedAxis = Object.fromEntries(
  Object.entries(AXIS).map(([side, ids]) => [side, ids.filter((id) => citedIds.includes(id))]),
);

// ---- conflict awareness: EVIDENCE ONLY, never a rate ----------------------
// Trial 2's defect 6 was a `but`/`however` regex reported as "four of twelve".
// This records the matching sentences verbatim and classifies nothing. The
// finding must quote these, not count them. PREDICTIONS.md section 5,
// prediction 2 is read by a human from this list.
const conflictSentences = [];
if (dec) {
  const sentences = dec.split(/(?<=[.!?])\s+|\n/).map((s) => s.trim()).filter(Boolean);
  const TENSION =
    /\b(tension|contradict\w*|conflict\w*|at odds|disagree\w*|pulls? in|opposite direction|competing|cuts? both ways|in opposition|inconsisten\w*)\b/i;
  for (const s of sentences) {
    if (!TENSION.test(s)) continue;
    // Only keep it if the sentence is about the library, not about the code.
    if (!/\b(element|library|gvp|principle|heuristic|value|guidance|P21|CH2|V1|V7|P1|P5|P17|H1|H3|CP15)\b/i.test(s)) continue;
    conflictSentences.push({ sentence: s.slice(0, 400), matched: s.match(TENSION)[0] });
  }
}

console.log(
  JSON.stringify(
    {
      run: runId,
      cmd: cmd.join(" "),
      base_invocation: { exit: base.exit, output_head: base.out.slice(0, 400) },
      forks: { S1, S2, S3 },
      cited: {
        any: citedIds.length > 0,
        ids: citedIds,
        axis: citedAxis,
        axis_total:
          citedAxis.toward_seams.length + citedAxis.toward_deferral.length + citedAxis.mediating.length,
      },
      conflict_statements: conflictSentences,
      files: files.length,
      source_files: sourceFiles.length,
    },
    null,
    1,
  ),
);

fs.rmSync(probeDir, { recursive: true, force: true });
