#!/usr/bin/env node
// Mechanical scorer for trial 4. Emits one JSON row per run.
//
// ALL FORKS ARE STATIC — no invocation needed (trial 3's probes existed
// because its forks were behavioural; these are properties of the artifact).
// Evidence first, classification second: every level carries the counts and
// per-file breakdown it came from.
//
// THE AST, NOT REGEX. Trial 2 defect 3 and trial 3 defects 1-2 were all
// pattern lists standing in for semantic questions. "Does this function
// carry a return annotation" is a property of the syntax tree; the
// `typescript` package answers it exactly for every style a run might write.
//
// VALIDATION PRECONDITION (PREDICTIONS section 4): before scoring any
// trial-4 run, this scorer must reproduce the prior table on trial 3's
// twelve roots — T1 high, T2 present, T3 present, 12/12. See
// selftest/validate-scorer.sh.
//
// usage: score.mjs <snapshot-or-project-dir> <run-id>
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

// Resolved from the gvp repo's own node_modules (the scorer runs from inside
// the repo); version recorded in the output row for reproducibility.
const require = createRequire(import.meta.url);
const ts = require("typescript");

const root = path.resolve(process.argv[2]);
const runId = process.argv[3] ?? path.basename(root);

const SKIP = new Set(["node_modules", ".git", ".gvp", "dist", "build", ".cache", "coverage"]);

function walk(d, out = []) {
  let entries;
  try {
    entries = fs.readdirSync(d, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (SKIP.has(e.name)) continue;
    const p = path.join(d, e.name);
    if (e.isSymbolicLink()) continue;
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const files = walk(root);
const rel = (p) => path.relative(root, p);
const tsFiles = files.filter((p) => /\.(ts|mts|cts|tsx)$/.test(p) && !p.endsWith(".d.ts"));

// ---------------------------------------------------------------------------
// AST walk: functions (declarations, arrows, function expressions, methods),
// whether each carries an explicit return annotation, and whether it is
// exported from its module (directly, or via an exported variable statement).
// Named type declarations (interface + type alias) are counted alongside.
// ---------------------------------------------------------------------------
const fnRows = [];
let typeDecls = [];

for (const f of tsFiles) {
  const src = ts.createSourceFile(f, fs.readFileSync(f, "utf8"), ts.ScriptTarget.Latest, true);

  const isExported = (node) => {
    // direct `export function f`
    if (ts.canHaveModifiers(node) && ts.getModifiers(node)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword))
      return true;
    // `export const f = () => ...` — the arrow's exportedness lives on the
    // enclosing variable statement
    let a = node.parent;
    while (a) {
      if (ts.isVariableStatement(a))
        return ts.getModifiers(a)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ?? false;
      if (ts.isSourceFile(a) || ts.isBlock(a)) return false;
      a = a.parent;
    }
    return false;
  };

  const visit = (node) => {
    if (
      ts.isFunctionDeclaration(node) ||
      ts.isArrowFunction(node) ||
      ts.isFunctionExpression(node) ||
      ts.isMethodDeclaration(node)
    ) {
      // Skip trivially-bodiless overload signatures
      if (node.body || ts.isArrowFunction(node)) {
        const name =
          node.name?.getText(src) ??
          (ts.isVariableDeclaration(node.parent) ? node.parent.name.getText(src) : "(anonymous)");
        fnRows.push({
          file: rel(f),
          name,
          kind: ts.SyntaxKind[node.kind],
          exported: isExported(ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node) ? node : node),
          returnAnnotated: Boolean(node.type),
          line: src.getLineAndCharacterOfPosition(node.getStart(src)).line + 1,
        });
      }
    }
    if (ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) {
      typeDecls.push({ file: rel(f), name: node.name.getText(src), kind: ts.SyntaxKind[node.kind] });
    }
    ts.forEachChild(node, visit);
  };
  visit(src);
}

// Arrow functions used as inline callbacks (arguments to calls) are excluded
// from T1: their return types are contextually typed and annotating them is
// unidiomatic in EVERY style, so they measure nothing. An arrow bound to a
// variable/property keeps counting.
const counted = fnRows.filter((r) => r.kind !== "ArrowFunction" || r.name !== "(anonymous)");

const rate = (rows) => (rows.length ? rows.filter((r) => r.returnAnnotated).length / rows.length : null);
const t1All = rate(counted);
const exported = counted.filter((r) => r.exported);
const internal = counted.filter((r) => !r.exported);

const level1 = t1All === null ? "unmeasurable" : t1All >= 0.8 ? "high" : t1All <= 0.2 ? "low" : "mid";
const level2 = typeDecls.length >= 2 ? "present" : "absent";

// ---- T3: checker affordance ------------------------------------------------
function readJsonish(p) {
  try {
    // tsconfig allows comments; strip line/block comments crudely but safely
    const raw = fs.readFileSync(p, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
const tsconfigPath = files.find((p) => path.basename(p) === "tsconfig.json");
const tsconfig = tsconfigPath ? readJsonish(tsconfigPath) : null;
const strictOn = Boolean(tsconfig?.compilerOptions?.strict);
const pkgPath = files.find((p) => rel(p) === "package.json");
const pkg = pkgPath ? readJsonish(pkgPath) : null;
const scripts = Object.entries(pkg?.scripts ?? {});
const tscScript = scripts.find(([, v]) => /\btsc\b|typecheck|type-check/.test(v));
const level3 = strictOn && tscScript ? "present" : strictOn || tscScript ? "partial" : "absent";

// ---- citations + contradiction sentences (evidence only) -------------------
const decPath = files.find((p) => /(^|\/)DECISIONS\.md$/.test(rel(p)));
const dec = decPath ? fs.readFileSync(decPath, "utf8") : null;
const ID_RE = /\b(?:personal|code-common|code-web|code-realtime|code-testing|ai-common|gvp)[:-][A-Z]{1,3}\d+\b/g;
const citedIds = dec ? [...new Set([...dec.matchAll(ID_RE)].map((m) => m[0]))].sort() : [];
const AXIS_IDS = {
  anchor: ["code-common:CP7"],
  buttresses: ["code-common:CP2", "code-common:CP10", "code-common:CP16", "personal:R1"],
};
const conflictSentences = [];
if (dec) {
  const TENSION =
    /\b(tension|contradict\w*|conflict\w*|at odds|disagree\w*|inconsisten\w*|opposite|both directions|cuts? both ways|altered|tampered|modified)\b/i;
  for (const s of dec.split(/(?<=[.!?])\s+|\n/).map((x) => x.trim()).filter(Boolean)) {
    if (!TENSION.test(s)) continue;
    if (!/\b(CP7|CP2|CP10|CP16|R1|typ(e|ing)|element|library|gvp)\b/i.test(s)) continue;
    conflictSentences.push({ sentence: s.slice(0, 400), matched: s.match(TENSION)[0] });
  }
}

console.log(
  JSON.stringify(
    {
      run: runId,
      typescript_version: ts.version,
      forks: {
        T1: {
          level: level1,
          rate: t1All,
          annotated: counted.filter((r) => r.returnAnnotated).length,
          total: counted.length,
          functions: counted,
        },
        T2: { level: level2, count: typeDecls.length, decls: typeDecls },
        T3: {
          level: level3,
          strict: strictOn,
          tsconfig: tsconfigPath ? rel(tsconfigPath) : null,
          script: tscScript ? { [tscScript[0]]: tscScript[1] } : null,
        },
        T4: {
          exported_rate: rate(exported),
          internal_rate: rate(internal),
          exported_counts: `${exported.filter((r) => r.returnAnnotated).length}/${exported.length}`,
          internal_counts: `${internal.filter((r) => r.returnAnnotated).length}/${internal.length}`,
        },
      },
      cited: {
        any: citedIds.length > 0,
        ids: citedIds,
        anchor: AXIS_IDS.anchor.filter((i) => citedIds.includes(i)),
        buttresses: AXIS_IDS.buttresses.filter((i) => citedIds.includes(i)),
      },
      conflict_statements: conflictSentences,
      ts_files: tsFiles.length,
    },
    null,
    1,
  ),
);
