#!/usr/bin/env bash
# Assemble the manifest, then for each finished run: snapshot, score, floor.
#
# Order matters, for a different reason than in trial 2. There the floor drove
# the tool with --url/--token and a tool that wrongly persisted an override
# would have rewritten the file fork P measured. Here BOTH the scorer and the
# floor execute the tool, so the snapshot is taken first and all file-based
# evidence (S3, citations) is read from that pristine copy, while the
# invocation probes run in the live project where node_modules exists.
#
# Probes and the floor are driven against temp fixtures, never the project, so
# neither can disturb the other.
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
  cp "$P/DECISIONS.md" "decisions/$VARIANT-rep$REP-$ID.md"

  # Pick the documented entry point; record which one was used, so a run scored
  # through an unexpected entry point is visible rather than silent.
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

  node instrument/score.mjs "snapshots/$ID" "$ID" > "results/$ID.json" 2> "results/$ID.score.err"
  bash instrument/accept/run.sh "$P" $CMD > "results/$ID.floor.txt" 2>&1

  LEVELS=$(python3 -c "
import json,sys
try:
    d=json.load(open('results/$ID.json'))
    f=d['forks']
    t4=f['T4']
    print(f\"T1={f['T1']['level']:<5} T2={f['T2']['level']:<8} T3={f['T3']['level']:<8} T4 exp={t4['exported_counts']:<7} int={t4['internal_counts']:<7} cites CP7={len(d['cited']['anchor'])>0}\")
except Exception as e:
    print('UNSCORED', e)
")
  echo "$ID $VARIANT rep$REP  floor: $(tail -1 "results/$ID.floor.txt" | sed 's/.*---- //')  $LEVELS"
done < <(python3 -c "
import json
m = json.load(open('MANIFEST.json'))
for k, v in sorted(m.items()):
    print(k, v['root'], v['variant'], v['rep'])
")

echo
echo "REMINDER (protocol section 6, required step): read each run's"
echo "decisions/*.md against its results/*.json row before summarising any arm."
echo "Three of trial 2's seven defects were found that way and no other way."
