#!/usr/bin/env bash
# The harness's licence to operate (PREDICTIONS section 9).
#
# An L1 or L2 arm whose hook silently fails produces a null result that means
# nothing, and that is this trial's most dangerous failure mode. So before any
# run is dispatched, each hooked arm is exercised in a live `claude -p` session
# on a throwaway prompt that is NOT the trial's task, and the payload's arrival
# is asserted two ways:
#
#   1. mechanically — the hook's own log records the fire
#   2. behaviourally — the model is asked to report the id of any library
#      element quoted to it, and must name the one its arm delivers
#
# (2) is the assertion that matters. A hook can fire, write its log, and still
# have its output dropped by the harness; only the model's answer proves the
# payload landed in context. L0 is exercised too, as the self-test's own
# control: with no hook it must answer NONE.
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
E="$(cd "$HERE/../.." && pwd)"
fail=0

ASK='Do exactly two things, then stop.
1. Write a file settings.json whose contents are {"api_key": "abcd1234efgh5678"}
2. Write a file report.txt containing ONLY the id of any guiding-library element
   that has been quoted to you at any point in this session (for example
   some-lib:X9), or the single word NONE if none has been.'

for ARM in L0 L1 L2 L2n; do
  case "$ARM" in
    L0)  WANT=NONE ;;
    L1)  WANT=code-common:CR1 ;;
    L2)  WANT=code-common:CR1 ;;
    L2n) WANT=code-web:WP3 ;;
  esac

  ROOT=$(mktemp -d)
  mkdir -p "$ROOT/project" "$ROOT/.cfg/hooks" "$ROOT/.home"
  ln -sf "$HOME/.claude/.credentials.json" "$ROOT/.cfg/.credentials.json"

  HOOKS_JSON="null"
  if [ -f "$E/arms/$ARM/hooks.json" ]; then
    cp "$E/instrument/hooks/context.py" "$ROOT/.cfg/hooks/context.py"
    cp "$E/arms/$ARM/context.txt"       "$ROOT/.cfg/hooks/context.txt"
    HOOKS_JSON=$(sed "s|__HOOK__|$ROOT/.cfg/hooks/context.py|g" "$E/arms/$ARM/hooks.json")
  fi
  HOOKS_JSON="$HOOKS_JSON" python3 - "$ROOT/.cfg/settings.json" <<'PY'
import json, os, sys
s = {"model": "opus[1m]", "autoCompactEnabled": False, "includeCoAuthoredBy": False}
h = json.loads(os.environ["HOOKS_JSON"])
if h:
    s["hooks"] = h
open(sys.argv[1], "w").write(json.dumps(s, indent=1, sort_keys=True) + "\n")
PY

  ( cd "$ROOT/project" && env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT \
      HOME="$ROOT/.home" CLAUDE_CONFIG_DIR="$ROOT/.cfg" \
      claude -p "$ASK" --dangerously-skip-permissions --model 'opus[1m]' \
        --output-format stream-json --verbose \
        < /dev/null > "$ROOT/run.jsonl" 2> "$ROOT/run.err" ) || true

  GOT=$(tr -d '[:space:]' < "$ROOT/project/report.txt" 2>/dev/null || echo "NO-REPORT")
  FIRES=$( [ -f "$ROOT/context.log" ] && grep -c '"injected": true' "$ROOT/context.log" || echo 0 )

  # mechanical
  case "$ARM" in
    L0)
      if [ "$FIRES" = 0 ] && [ ! -f "$ROOT/context.log" ]; then
        echo "  OK    $ARM  no hook ran"
      else echo "  WRONG $ARM  a hook ran in the hookless arm ($FIRES fires)"; fail=$((fail+1)); fi ;;
    *)
      if [ "$FIRES" -ge 1 ]; then
        echo "  OK    $ARM  hook fired and injected ($FIRES)"
      else echo "  WRONG $ARM  hook never injected (log: $(cat "$ROOT/context.log" 2>/dev/null | head -3))"; fail=$((fail+1)); fi ;;
  esac

  # behavioural — the one that proves the payload reached the model
  if [ "$GOT" = "$WANT" ]; then
    echo "  OK    $ARM  model reports $GOT"
  else
    echo "  WRONG $ARM  model reports '$GOT', want '$WANT'"
    fail=$((fail+1))
  fi
  echo "        root: $ROOT"
done

echo
if [ "$fail" = 0 ]; then
  echo "ALL CLEAR — every arm delivers exactly what it is supposed to deliver"
else
  echo "$fail FAILURE(S) — the harness may not be used to run trial 5" >&2
  exit 1
fi
