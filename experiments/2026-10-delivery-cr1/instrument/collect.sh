#!/usr/bin/env bash
# Assemble the manifest, then for each finished run: snapshot, score, floor.
#
# Snapshot first, then score from the pristine copy, then run the floor in the
# live project (trial 4's ordering — the floor executes the tool, and all
# file-based evidence must be read from bytes the floor cannot disturb). The
# floor drives temp fixtures, never the project.
#
# The hook's log lives OUTSIDE the project tree, so it survives the snapshot
# untouched and is passed to the scorer separately — that cross-reference is
# what separates a detector miss from a delivered-and-ignored element.
#
# usage: collect.sh
set -uo pipefail
E="$(cd "$(dirname "$0")/.." && pwd)"
cd "$E"

python3 - <<'PY'
import json, pathlib
E = pathlib.Path('.')
man = {p.stem: json.loads(p.read_text()) for p in sorted((E / '.manifest.d').glob('*.json'))}
(E / 'MANIFEST.json').write_text(json.dumps(man, indent=1, sort_keys=True) + '\n')
print(f'manifest: {len(man)} runs')
PY

mkdir -p results decisions snapshots

while read -r ID ROOT ARM REP; do
  P="$ROOT/project"
  [ -f "$P/DECISIONS.md" ] || { echo "SKIP $ID ($ARM rep$REP) — no DECISIONS.md"; continue; }

  rm -rf "snapshots/$ID"
  rsync -a --exclude='node_modules' --exclude='.gvp' "$P/" "snapshots/$ID/"
  cp "$P/DECISIONS.md" "decisions/$ARM-rep$REP-$ID.md"
  [ -f "$ROOT/context.log" ] && cp "$ROOT/context.log" "results/$ID.hooks.jsonl"

  CMD=""
  for c in "src/index.ts" "src/cli.ts" "src/main.ts" "index.ts" "src/index.mjs" "src/index.js"; do
    if [ -f "$P/$c" ]; then
      case "$c" in
        *.ts) CMD="npx tsx $c" ;;
        *)    CMD="node $c" ;;
      esac
      break
    fi
  done
  [ -z "$CMD" ] && CMD="npm start --"
  echo "$CMD" > "results/$ID.cmd"

  node instrument/score.mjs "snapshots/$ID" "$ID" "$ROOT/context.log" \
    > "results/$ID.json" 2> "results/$ID.score.err"
  bash instrument/accept/run.sh "$P" $CMD > "results/$ID.floor.txt" 2>&1

  SITES=$(python3 -c "
import json
try:
    d=json.load(open('results/$ID.json'))
    f=d['forks']; dl=d.get('delivery') or {}
    print(f\"S1={f['S1']['level']:<8} S2={f['S2']['level']:<8} S3={f['S3']['level']:<8} \"
          f\"S4={f['S4']['level']:<19} inj={dl.get('injections','-')}/{dl.get('invocations','-')} \"
          f\"cites CR1={d['cited']['CR1']}\")
except Exception as e:
    print('UNSCORED', e)
")
  echo "$ID $ARM rep$REP  floor: $(tail -1 "results/$ID.floor.txt" | sed 's/.*---- //')  $SITES"
done < <(python3 -c "
import json
m = json.load(open('MANIFEST.json'))
for k, v in sorted(m.items()):
    print(k, v['root'], v['variant'], v['rep'])
")

echo
echo "REMINDER (protocol section 6, required step): read each run's"
echo "decisions/*.md against its results/*.json row before summarising any arm."
echo "Trial 4's three false compliance claims were found this way and no other —"
echo "and every one of them would have read as 'the library is working'."
