#!/usr/bin/env bash
# The scorer's licence to operate (PREDICTIONS section 4): it must reproduce
# the measured prior on trial 3's twelve roots — T1 high, T2 present, T3
# present, 12/12 — and separate the flip side on synthetic known-answer
# projects, before it may score a single trial-4 run.
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
E="$(cd "$HERE/../.." && pwd)"
SCORE="$HERE/../score.mjs"
T3="$E/../2026-10-contested-axis/MANIFEST.json"
fail=0

echo "== part 1: the twelve trial-3 roots must all read high/present/present =="
while read -r ID ROOT VARIANT REP; do
  P="$ROOT/project"
  [ -d "$P" ] || { echo "  SKIP $ID — root gone"; continue; }
  row=$(node "$SCORE" "$P" "$ID" 2>/dev/null)
  read -r l1 l2 l3 r4i <<<"$(node -e '
    const d=JSON.parse(require("fs").readFileSync(0,"utf8"));
    const f=d.forks;
    console.log(f.T1.level, f.T2.level, f.T3.level, f.T4.internal_counts);' <<<"$row")"
  if [ "$l1" = high ] && [ "$l2" = present ] && [ "$l3" = present ]; then
    printf '  OK    %-12s %-4s T1=high T2=present T3=present  internal=%s\n' "$VARIANT" "rep$REP" "$r4i"
  else
    printf '  WRONG %-12s %-4s T1=%s T2=%s T3=%s\n' "$VARIANT" "rep$REP" "$l1" "$l2" "$l3"
    fail=$((fail+1))
  fi
done < <(python3 -c "
import json
m = json.load(open('$T3'))
for k, v in sorted(m.items(), key=lambda x:(x[1]['variant'],x[1]['rep'])):
    print(k, v['root'], v['variant'], v['rep'])
")

echo
echo "== part 2: synthetic known-answer projects =="
W=$(mktemp -d); trap 'rm -rf "$W"' EXIT

# inferred-style: no annotations, no named types, no tsconfig, no tsc script
mkdir -p "$W/inferred/src"
cat > "$W/inferred/src/index.ts" <<'TS'
export function tally(dir: string) {
  const rows = [1, 2, 3].map((n) => n * 2);
  return { dir, rows };
}
function helper(x: number) {
  return x + 1;
}
export const fmt = (xs: number[]) => xs.join(",");
TS
printf '{"name":"x","scripts":{"start":"npx tsx src/index.ts"}}\n' > "$W/inferred/package.json"

# boundary-style (M's predicted shape): exported annotated, internal not
mkdir -p "$W/boundary/src"
cat > "$W/boundary/src/index.ts" <<'TS'
export interface Row { name: string; n: number }
export type Report = Row[];
export function tally(dir: string): Report {
  return [walk(dir)];
}
export const fmt = (r: Report): string => r.map(render).join("\n");
function walk(dir: string) {
  return { name: dir, n: 1 };
}
const render = (r: Row) => `${r.name} ${r.n}`;
TS
printf '{"name":"x","scripts":{"typecheck":"tsc --noEmit"}}\n' > "$W/boundary/package.json"
printf '{"compilerOptions":{"strict":true}}\n' > "$W/boundary/tsconfig.json"

chk() { # name field want
  local name=$1 expr=$2 want=$3
  got=$(node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8')); console.log($expr);" <<<"$row")
  if [ "$got" = "$want" ]; then echo "  OK    $name = $got";
  else echo "  WRONG $name = $got (want $want)"; fail=$((fail+1)); fi
}

row=$(node "$SCORE" "$W/inferred" synth-inferred 2>/dev/null)
chk "inferred T1" 'd.forks.T1.level' low
chk "inferred T2" 'd.forks.T2.level' absent
chk "inferred T3" 'd.forks.T3.level' absent

row=$(node "$SCORE" "$W/boundary" synth-boundary 2>/dev/null)
chk "boundary T2" 'd.forks.T2.level' present
chk "boundary T3" 'd.forks.T3.level' present
chk "boundary exported rate" 'd.forks.T4.exported_rate' 1
chk "boundary internal rate" 'd.forks.T4.internal_rate' 0

echo
if [ "$fail" = 0 ]; then echo "ALL CLEAR — the scorer reproduces the prior and separates the flip side"; else echo "$fail FAILURE(S) — the scorer may not score trial 4" >&2; exit 1; fi
