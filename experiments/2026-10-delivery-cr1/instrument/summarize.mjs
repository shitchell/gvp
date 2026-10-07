#!/usr/bin/env node
// The results table, per arm and PER SITE. Never a pooled compliance rate
// (trial 1 defect 5) — trial 2 pooled its sites into one fork label and lost
// the one observation this trial exists to follow up.
//
// The `hook` column is the column that keeps the trial honest: it says, for the
// sites that ended up holding the live token, whether the hook ever bound on the
// write that put it there. "detector-miss" and "fired" support completely
// different conclusions.
//
// usage: summarize.mjs
import fs from 'node:fs';

const man = JSON.parse(fs.readFileSync('MANIFEST.json', 'utf8'));
const ARMS = ['L0', 'L1', 'L2', 'L2n'];
const SITES = ['S1', 'S2', 'S3', 'S4'];

const rows = Object.entries(man)
  .map(([id, m]) => {
    const p = `results/${id}.json`;
    if (!fs.existsSync(p)) return null;
    const d = JSON.parse(fs.readFileSync(p, 'utf8'));
    const floorFile = `results/${id}.floor.txt`;
    const floor = fs.existsSync(floorFile)
      ? (fs.readFileSync(floorFile, 'utf8').trim().split('\n').pop().match(/(\d+) passed, (\d+) failed/) ?? [])
      : [];
    return { id, arm: m.variant, rep: m.rep, d, floor: floor.length ? `${floor[1]}/${+floor[1] + +floor[2]}` : '?' };
  })
  .filter(Boolean)
  .sort((a, b) => ARMS.indexOf(a.arm) - ARMS.indexOf(b.arm) || a.rep - b.rep);

const pad = (s, n) => String(s).padEnd(n);
console.log(
  pad('arm', 5) + pad('rep', 4) + SITES.map((s) => pad(s, 20)).join('') +
    pad('inj/inv', 9) + pad('CR1', 5) + pad('WP3', 5) + pad('floor', 7) + 'hooks at token sites',
);
console.log('-'.repeat(150));
for (const r of rows) {
  const dl = r.d.delivery;
  const hooks = (r.d.evidence.tokenLocations ?? [])
    .map((l) => `${l.site}:${l.hook ?? 'n/a'}`)
    .join(' ');
  console.log(
    pad(r.arm, 5) +
      pad(r.rep, 4) +
      SITES.map((s) => pad(r.d.forks[s].level, 20)).join('') +
      pad(dl ? `${dl.injections}/${dl.invocations}` : '-', 9) +
      pad(r.d.cited.CR1 ? 'yes' : 'no', 5) +
      pad(r.d.cited.WP3 ? 'yes' : 'no', 5) +
      pad(r.floor, 7) +
      hooks,
  );
}

console.log('\ncompliance per site, per arm (the only table the decision rule reads):');
console.log(pad('arm', 5) + SITES.map((s) => pad(s, 10)).join('') + 'n');
for (const arm of ARMS) {
  const mine = rows.filter((r) => r.arm === arm);
  if (!mine.length) continue;
  console.log(
    pad(arm, 5) +
      SITES.map((s) => pad(`${mine.filter((r) => r.d.forks[s].compliant).length}/${mine.length}`, 10)).join('') +
      mine.length,
  );
}

const missed = rows.flatMap((r) =>
  (r.d.evidence.tokenLocations ?? [])
    .filter((l) => l.hook === 'detector-miss')
    .map((l) => `${r.arm} rep${r.rep} ${l.path}`),
);
if (missed.length) {
  console.log(
    `\nDETECTOR MISSES (${missed.length}) — L2 never bound at these sites, so they say\n` +
      'nothing about whether bind-time delivery steers:\n  ' + missed.join('\n  '),
  );
}
