#!/usr/bin/env bash
# Assemble the manifest, then for each finished run: snapshot, score, floor.
#
# Order matters. The snapshot is taken and scored BEFORE the acceptance floor
# runs, because the floor drives the tool with --url/--token and a tool that
# wrongly persisted an override would rewrite the very file fork P measures.
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

while read -r ID ROOT VARIANT REP; do
  P="$ROOT/project"
  [ -f "$P/DECISIONS.md" ] || { echo "SKIP $ID ($VARIANT rep$REP) — no DECISIONS.md"; continue; }

  rm -rf "snapshots/$ID"
  rsync -a --exclude='node_modules' --exclude='.gvp' "$P/" "snapshots/$ID/"
  node instrument/score.mjs "snapshots/$ID" "$ROOT/.home" "$ID" > "results/$ID.json"
  cp "$P/DECISIONS.md" "decisions/$VARIANT-rep$REP-$ID.md"

  # pick the documented entry point; record which one was used
  CMD=""
  for c in "src/index.ts" "src/cli.ts" "src/main.ts" "index.ts"; do
    [ -f "$P/$c" ] && { CMD="npx tsx $c"; break; }
  done
  if [ -z "$CMD" ]; then CMD="npm start --"; fi
  echo "$CMD" > "results/$ID.cmd"
  bash instrument/accept/run.sh "$P" $CMD > "results/$ID.floor.txt" 2>&1
  echo "$ID $VARIANT rep$REP  floor: $(tail -1 "results/$ID.floor.txt" | sed 's/.*---- //')"
done < <(python3 -c "
import json
m = json.load(open('MANIFEST.json'))
for k, v in sorted(m.items()):
    print(k, v['root'], v['variant'], v['rep'])
")
