#!/usr/bin/env bash
# Build one run's world and execute it.
#
# Inherited from trial 4 unchanged: per-run working tree under mktemp (so no
# ancestor is a git work tree and siblings are scattered), per-run GVP registry
# (trial 1's open channel), per-run HOME, per-run Claude config dir, cairn
# pinned absolutely for the instrument's determinism.
#
# NEW HERE: the Claude config dir is where the independent variable lives. The
# hook script and its payload are copied into $ROOT/.cfg/hooks/ — inside the
# config dir, where a hook plausibly belongs, never into the project the run
# works in — and the hooks fragment for this arm is merged into the settings
# file with the command path resolved to the run's own copy. No arm artifact
# carries a path into the experiment directory, and L0 gets no hooks key at all.
#
# The hook's log lands at $ROOT/context.log, outside the project tree, so the
# snapshot the scorer reads cannot contain it.
#
# usage: dispatch.sh <arm> <rep>
set -euo pipefail
E="$(cd "$(dirname "$0")/.." && pwd)"
ARM="$1"; REP="$2"
MODEL="opus[1m]"

CAIRN=/home/guy/.nvm/versions/node/v22.14.0/bin/cairn
[ -x "$CAIRN" ] || { echo "pinned cairn missing: $CAIRN" >&2; exit 2; }
CAIRN_VERSION=$("$CAIRN" --version 2>&1 | tr -d '[:space:]')
[ "$CAIRN_VERSION" = "5.1.0" ] || { echo "pinned cairn is $CAIRN_VERSION, expected 5.1.0" >&2; exit 2; }
[ -d "$E/arms/$ARM" ] || { echo "no such arm: $ARM" >&2; exit 2; }

ID="r$(printf '%s%s%s%s' "$ARM" "$REP" "$RANDOM" "$(date +%s%N)" | sha256sum | cut -c1-10)"
ROOT=$(mktemp -d)
mkdir -p "$ROOT/project/.gvp" "$ROOT/.registry" "$ROOT/.home" "$ROOT/.cfg/hooks"

rsync -a "$E/arms/$ARM/library/" "$ROOT/project/.gvp/library/"
cp "$E/TASK.md" "$E/CLAUDE.md" "$ROOT/project/"

for f in .npmrc .npm .gitconfig .bashrc .profile; do
  [ -e "$HOME/$f" ] && ln -sf "$HOME/$f" "$ROOT/.home/$f"
done
ln -sf "$HOME/.claude/.credentials.json" "$ROOT/.cfg/.credentials.json"

# --- the independent variable ----------------------------------------------
HOOKS_JSON="null"
if [ -f "$E/arms/$ARM/hooks.json" ]; then
  cp "$E/instrument/hooks/context.py" "$ROOT/.cfg/hooks/context.py"
  cp "$E/arms/$ARM/context.txt"       "$ROOT/.cfg/hooks/context.txt"
  HOOKS_JSON=$(sed "s|__HOOK__|$ROOT/.cfg/hooks/context.py|g" "$E/arms/$ARM/hooks.json")
fi

MODEL="$MODEL" HOOKS_JSON="$HOOKS_JSON" python3 - "$ROOT/.cfg/settings.json" <<'PY'
import json, os, sys
settings = {
    "model": os.environ["MODEL"],
    "autoCompactEnabled": False,
    "includeCoAuthoredBy": False,
}
hooks = json.loads(os.environ["HOOKS_JSON"])
if hooks:
    settings["hooks"] = hooks
with open(sys.argv[1], "w") as fh:
    json.dump(settings, fh, indent=1, sort_keys=True)
    fh.write("\n")
PY

# Seed the isolated registry from this run's OWN library, so `cairn libs
# search` — which CLAUDE.md tells every run to use — returns this copy and
# nothing machine-wide.
( cd "$ROOT/project" && GVP_REGISTRY_ROOT="$ROOT/.registry" "$CAIRN" query --format compact >/dev/null 2>&1 ) || true

mkdir -p "$E/.manifest.d"
printf '{"variant":"%s","rep":%s,"root":"%s","model":"%s","started":"%s","cairn":"%s","cairn_version":"%s","cairn_target":"%s","hooked":%s}\n' \
  "$ARM" "$REP" "$ROOT" "$MODEL" "$(date -Is)" \
  "$CAIRN" "$CAIRN_VERSION" "$(readlink -f "$CAIRN")" \
  "$([ "$HOOKS_JSON" = "null" ] && echo false || echo true)" \
  > "$E/.manifest.d/$ID.json"
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
