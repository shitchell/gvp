#!/usr/bin/env node
// Reads the manifest and the scored rows; prints the results table. The
// orchestrator reads this, not twelve reports (protocol section 1).
import fs from 'node:fs';
import path from 'node:path';

const E = path.resolve(process.argv[2] ?? path.join(path.dirname(new URL(import.meta.url).pathname), '..'));
const man = JSON.parse(fs.readFileSync(path.join(E, 'MANIFEST.json'), 'utf8'));
const ARMS = ['baseline', 'N-inverted', 'M-narrowed', 'I-inverted'];

const rows = [];
for (const [id, m] of Object.entries(man)) {
  const rp = path.join(E, 'results', `${id}.json`);
  if (!fs.existsSync(rp)) continue;
  const r = JSON.parse(fs.readFileSync(rp, 'utf8'));
  const fp = path.join(E, 'results', `${id}.floor.txt`);
  const floor = fs.existsSync(fp) ? (fs.readFileSync(fp, 'utf8').match(/(\d+) passed, (\d+) failed/) ?? []) : [];
  rows.push({
    id,
    arm: m.variant,
    rep: m.rep,
    ...r.forks,
    cited: r.cited.CR1,
    citedWP3: r.cited.WP3,
    objected: r.objected,
    floor: floor[1] ? `${floor[1]}/${Number(floor[1]) + Number(floor[2])}` : '—',
    tokenAt: (r.evidence.tokenLocations ?? []).map((t) => `${t.path}${t.ignored ? ' [ignored]' : ''}`).join(', ') || '—',
  });
}
rows.sort((a, b) => ARMS.indexOf(a.arm) - ARMS.indexOf(b.arm) || a.rep - b.rep);

const w = (s, n) => String(s).padEnd(n);
console.log(
  w('arm', 13) + w('rep', 4) + w('fork P', 17) + w('fork Q', 11) + w('R', 6) + w('cite CR1', 10) + w('obj', 6) + w('floor', 7) + 'token at',
);
console.log('-'.repeat(120));
for (const r of rows) {
  console.log(
    w(r.arm, 13) + w(r.rep, 4) + w(r.P, 17) + w(r.Q, 11) + w(r.R, 6) + w(r.cited, 10) + w(r.objected, 6) + w(r.floor, 7) + r.tokenAt,
  );
}

console.log('\nper-arm summary');
for (const a of ARMS) {
  const rs = rows.filter((r) => r.arm === a);
  if (!rs.length) continue;
  const tally = (k) =>
    Object.entries(
      rs.reduce((m, r) => ((m[r[k]] = (m[r[k]] ?? 0) + 1), m), {}),
    )
      .map(([v, n]) => `${v}×${n}`)
      .join(' ');
  console.log(
    `  ${w(a, 13)} P: ${w(tally('P'), 26)} Q: ${w(tally('Q'), 20)} R: ${w(tally('R'), 14)} cited CR1: ${rs.filter((r) => r.cited).length}/${rs.length}`,
  );
}
