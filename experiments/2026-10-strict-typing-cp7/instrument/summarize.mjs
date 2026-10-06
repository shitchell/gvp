#!/usr/bin/env node
// Reads the manifest and the scored rows; prints the results table. The
// orchestrator reads this, not fifteen reports (protocol section 1).
// Forks reported per run, never pooled.
import fs from "node:fs";
import path from "node:path";

const E = path.resolve(
  process.argv[2] ?? path.join(path.dirname(new URL(import.meta.url).pathname), ".."),
);
const man = JSON.parse(fs.readFileSync(path.join(E, "MANIFEST.json"), "utf8"));
const ARMS = ["baseline", "N-inverted", "M-narrowed", "I-lone", "I-quiet"];

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
    T1: `${r.forks.T1.level} (${(r.forks.T1.rate ?? 0).toFixed(2)})`,
    T2: `${r.forks.T2.level} (${r.forks.T2.count})`,
    T3: r.forks.T3.level,
    T4exp: r.forks.T4.exported_counts,
    T4int: r.forks.T4.internal_counts,
    cp7: r.cited.anchor.length > 0 ? "y" : "-",
    butt: r.cited.buttresses.length,
    confl: r.conflict_statements.length,
    floor: floor[1] ? `${floor[1]}/${Number(floor[1]) + Number(floor[2])}` : "—",
  });
}
rows.sort((a, b) => ARMS.indexOf(a.arm) - ARMS.indexOf(b.arm) || a.rep - b.rep);

const w = (s, n) => String(s).padEnd(n);
console.log(
  w("arm", 12) + w("rep", 4) + w("T1 ret-ann", 14) + w("T2 models", 13) + w("T3 checker", 11) +
  w("T4 exp", 9) + w("T4 int", 9) + w("CP7", 5) + w("butt", 6) + w("confl", 7) + "floor",
);
console.log("-".repeat(104));
for (const r of rows)
  console.log(
    w(r.arm, 12) + w(r.rep, 4) + w(r.T1, 14) + w(r.T2, 13) + w(r.T3, 11) +
    w(r.T4exp, 9) + w(r.T4int, 9) + w(r.cp7, 5) + w(r.butt, 6) + w(r.confl, 7) + r.floor,
  );

console.log("\nper-arm levels (tallies, NOT rates)");
for (const a of ARMS) {
  const rs = rows.filter((r) => r.arm === a);
  if (!rs.length) continue;
  const tally = (k) =>
    Object.entries(rs.reduce((m, r) => ((m[r[k].split(" ")[0]] = (m[r[k].split(" ")[0]] ?? 0) + 1), m), {}))
      .map(([v, n]) => `${v}×${n}`).join(" ");
  console.log(`  ${w(a, 12)} T1: ${w(tally("T1"), 18)} T2: ${w(tally("T2"), 18)} T3: ${tally("T3")}`);
}
