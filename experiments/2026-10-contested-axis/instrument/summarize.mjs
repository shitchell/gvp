#!/usr/bin/env node
// Reads the manifest and the scored rows; prints the results table. The
// orchestrator reads this, not twelve reports (protocol section 1).
//
// Forks are reported PER RUN and never pooled into a rate — trial 1's defect 5
// was averaging over forks that were not independent. The per-arm block below
// tallies levels, which is not the same thing as a rate.
//
// `conflict_statements` is printed as the number of recorded sentences, and the
// sentences themselves must be read from results/*.json. It is evidence, not a
// score: trial 2's defect 6 was a lexical proxy reported as "four of twelve"
// when it supported no count at all.
import fs from "node:fs";
import path from "node:path";

const E = path.resolve(
  process.argv[2] ?? path.join(path.dirname(new URL(import.meta.url).pathname), ".."),
);
const man = JSON.parse(fs.readFileSync(path.join(E, "MANIFEST.json"), "utf8"));
const ARMS = ["baseline", "N-inverted", "D-decisive", "A-decisive"];

const rows = [];
for (const [id, m] of Object.entries(man)) {
  const rp = path.join(E, "results", `${id}.json`);
  if (!fs.existsSync(rp)) continue;
  const r = JSON.parse(fs.readFileSync(rp, "utf8"));
  const fp = path.join(E, "results", `${id}.floor.txt`);
  const floor = fs.existsSync(fp)
    ? (fs.readFileSync(fp, "utf8").match(/(\d+) passed, (\d+) failed/) ?? [])
    : [];
  rows.push({
    id,
    arm: m.variant,
    rep: m.rep,
    S1: r.forks.S1.level,
    S2: r.forks.S2.level,
    S3: r.forks.S3.level,
    seams: r.cited.axis.toward_seams.length,
    defer: r.cited.axis.toward_deferral.length,
    med: r.cited.axis.mediating.length,
    conflict: r.conflict_statements.length,
    floor: floor[1] ? `${floor[1]}/${Number(floor[1]) + Number(floor[2])}` : "—",
  });
}
rows.sort((a, b) => ARMS.indexOf(a.arm) - ARMS.indexOf(b.arm) || a.rep - b.rep);

const w = (s, n) => String(s).padEnd(n);
console.log(
  w("arm", 13) +
    w("rep", 4) +
    w("S1 output", 13) +
    w("S2 input", 13) +
    w("S3", 9) +
    w("cited→seam", 11) +
    w("→defer", 8) +
    w("→med", 6) +
    w("conflict", 9) +
    "floor",
);
console.log("-".repeat(104));
for (const r of rows) {
  console.log(
    w(r.arm, 13) +
      w(r.rep, 4) +
      w(r.S1, 13) +
      w(r.S2, 13) +
      w(r.S3, 9) +
      w(r.seams, 11) +
      w(r.defer, 8) +
      w(r.med, 6) +
      w(r.conflict, 9) +
      r.floor,
  );
}

console.log("\nper-arm levels (tallies, NOT rates)");
for (const a of ARMS) {
  const rs = rows.filter((r) => r.arm === a);
  if (!rs.length) continue;
  const tally = (k) =>
    Object.entries(rs.reduce((m, r) => ((m[r[k]] = (m[r[k]] ?? 0) + 1), m), {}))
      .map(([v, n]) => `${v}×${n}`)
      .join(" ");
  console.log(
    `  ${w(a, 13)} S1: ${w(tally("S1"), 24)} S2: ${w(tally("S2"), 24)} S3: ${w(tally("S3"), 16)}`,
  );
}

// Prediction 1 is about whether baseline is INCONSISTENT across its reps, so it
// is read off directly rather than left to the eye.
const bl = rows.filter((r) => r.arm === "baseline");
if (bl.length > 1) {
  const uniform = ["S1", "S2"].every((k) => new Set(bl.map((r) => r[k])).size === 1);
  console.log(
    `\nprediction 1 (baseline is inconsistent on S1 or S2): ${
      uniform ? "FALSIFIED — all baseline reps agree" : "HELD — baseline reps disagree"
    }`,
  );
}

const withConflict = rows.filter((r) => r.arm === "baseline" && r.conflict > 0).length;
console.log(
  `prediction 2 (at most 1 baseline rep names the library as self-contradictory): ` +
    `${withConflict} of ${bl.length} recorded a tension sentence — READ THE SENTENCES in ` +
    `results/*.json before treating this as a verdict; the matcher is lexical`,
);
