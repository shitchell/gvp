#!/usr/bin/env bash
# Build one run's world and execute it.
#
# Each run gets its OWN: working tree (under mktemp, so siblings are scattered
# through /tmp and no ancestor is a git work tree), GVP registry, HOME, and
# Claude config dir. The registry isolation is the channel trial 1 left open —
# `cairn libs search` returned the machine-wide, untampered element text.
#
# usage: dispatch.sh <variant> <rep>
set -euo pipefail
E="$(cd "$(dirname "$0")/.." && pwd)"
VARIANT="$1"; REP="$2"
MODEL="opus[1m]"

ID="r$(printf '%s%s%s%s' "$VARIANT" "$REP" "$RANDOM" "$(date +%s%N)" | sha256sum | cut -c1-10)"
ROOT=$(mktemp -d)
mkdir -p "$ROOT/project/.gvp" "$ROOT/.registry" "$ROOT/.home" "$ROOT/.cfg"

rsync -a "$E/variants/$VARIANT/" "$ROOT/project/.gvp/library/"
cp "$E/TASK.md" "$E/CLAUDE.md" "$ROOT/project/"

# A per-run HOME so anything the tool persists under ~ is the run's alone, and
# so no sibling run's configuration is visible. A per-run Claude config dir so
# no hooks, plugins or global CLAUDE.md differ from run to run.
for f in .npmrc .npm .gitconfig .bashrc .profile; do
  [ -e "$HOME/$f" ] && ln -sf "$HOME/$f" "$ROOT/.home/$f"
done
ln -sf "$HOME/.claude/.credentials.json" "$ROOT/.cfg/.credentials.json"
printf '{"model":"%s","autoCompactEnabled":false,"includeCoAuthoredBy":false}\n' "$MODEL" \
  > "$ROOT/.cfg/settings.json"

# Seed the isolated registry from this run's OWN library, so `cairn libs
# search` — which CLAUDE.md tells every run to use — returns this variant's
# text and nothing else.
( cd "$ROOT/project" && GVP_REGISTRY_ROOT="$ROOT/.registry" cairn query --format compact >/dev/null 2>&1 ) || true

mkdir -p "$E/.manifest.d"
printf '{"variant":"%s","rep":%s,"root":"%s","model":"%s","started":"%s"}\n' \
  "$VARIANT" "$REP" "$ROOT" "$MODEL" "$(date -Is)" > "$E/.manifest.d/$ID.json"
echo "$ID $ROOT"

cd "$ROOT/project"
env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT \
  HOME="$ROOT/.home" \
  CLAUDE_CONFIG_DIR="$ROOT/.cfg" \
  GVP_REGISTRY_ROOT="$ROOT/.registry" \
  claude -p "$(cat "$E/RUN_PROMPT.md")" \
    --dangerously-skip-permissions \
    --model "$MODEL" \
    --output-format stream-json --verbose \
    < /dev/null > "$ROOT/run.jsonl" 2> "$ROOT/run.err" || echo "run exited $?" >> "$ROOT/run.err"

echo "done $ID"
