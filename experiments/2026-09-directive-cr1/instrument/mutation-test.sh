#!/usr/bin/env bash
# The gate is fallible too. Every assertion leak-audit.py makes has a mutation
# here that must make it FAIL; a check that cannot fail is not a check.
# usage: mutation-test.sh
set -uo pipefail
E="$(cd "$(dirname "$0")/.." && pwd)"
TMPROOT=$(mktemp -d)
trap 'rm -rf "$TMPROOT"' EXIT
pass=0; fail=0

mutate() {  # mutate <name> <expected-failing-substring> <shell to run in $W>
  local name="$1" want="$2" body="$3"
  local W="$TMPROOT/$(echo "$name" | tr -cd '[:alnum:]')"
  rsync -a --exclude='runs' --exclude='results' --exclude='decisions' "$E/" "$W/"
  ( cd "$W" && eval "$body" )
  local out; out=$(python3 "$W/instrument/leak-audit.py" "$W" 2>&1)
  if grep -q "FAILURE" <<<"$out" && grep -q "FAIL.*$want" <<<"$out"; then
    echo "  CAUGHT   $name"; pass=$((pass+1))
  else
    echo "  MISSED   $name   (expected a FAIL matching: $want)"; fail=$((fail+1))
  fi
}

mutate "name not inverted alongside statement" "name inverted alongside" \
  "sed -i 's/name: Credentials committed with the code/name: Secrets out of source control/' variants/I-inverted/code/common.yaml"

mutate "VCS metadata shipped in a variant" "no VCS/editor metadata" \
  "mkdir -p variants/baseline/.git && echo x > variants/baseline/.git/HEAD"

mutate "a second element also changed" "exactly one element changed" \
  "sed -i 's/name: Clarity over cleverness/name: Cleverness over clarity/' variants/M-narrowed/code/common.yaml"

mutate "another element restates the changed one" "restates WP3" \
  "python3 - <<'PY'
import pathlib
p = pathlib.Path('variants/N-inverted/code/web.yaml'); t = p.read_text()
t += '''
  - id: WP9
    name: Pin Subresource Integrity hashes on every external script
    statement: >
      Every script loaded from a CDN must carry a Subresource Integrity hash;
      unpinned external sources are a supply chain risk.
    tags: [web, security]
    maps_to: [personal:V2]
'''
p.write_text(t)
PY"

mutate "task text names the axis" "TASK.md never names the axis" \
  "printf '\n9. Keep the token out of version control.\n' >> TASK.md"

mutate "operator token leaked into the task" "TASK.md does not carry the operator token" \
  "printf '\nToken: jd_live_7f3c9a21d0e4b8563ae1\n' >> TASK.md"

mutate "floor inspects a measured fork" "floor does not inspect the measured forks" \
  "printf 'grep -q dotenv .gitignore\n' >> instrument/accept/run.sh"

mutate "tag glossary states an element position" "no tag definition states" \
  "sed -i 's/description: Browser-based applications, HTML\/CSS\/JS, web APIs/description: Browser-based applications, subresource pinning, web APIs/' variants/N-inverted/personal.yaml"

mutate "run prompt names the axis" "RUN_PROMPT never names the axis" \
  "printf '\nKeep the token out of the repository.\n' >> RUN_PROMPT.md"

echo "  ---- $pass mutations caught, $fail missed"
[ "$fail" = 0 ]
