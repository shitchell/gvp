#!/usr/bin/env bash
# Mutation-test the acceptance floor. Each mutation injects one defect into the
# reference `tally` and names the floor check that must catch it. A mutation
# that survives means the floor does not actually assert the requirement it
# claims to — which is how trial 1's defect 1 and trial 2's defect 2 both got
# through.
#
# usage: floor-mutations.sh
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
FLOOR="$HERE/../accept/run.sh"
REF=$(mktemp -d)
trap 'rm -rf "$REF"' EXIT
cp "$HERE/tally.mjs" "$REF/"

# mutation            | requirement it breaks
MUTATIONS="
count-header        | 2 — the header row is not data
naive-split         | 7 — a quoted comma does not separate fields
ragged-is-failure   | 6 — a ragged row still counts and its file still succeeds
abort-on-failure    | 5 — a failure does not stop the run
all-files           | 1 — files that are not *.csv are left alone
no-summary          | 8 — a final summary line reports the counts
noisy-empty         | 9 — an empty directory produces only the summary line
"

echo "baseline (unmutated reference) must pass:"
if MUT= bash "$FLOOR" "$REF" node tally.mjs >/dev/null 2>&1; then
  echo "  OK    reference passes the floor"
else
  echo "  BROKEN  reference fails its own floor — fix the floor or the reference" >&2
  exit 1
fi

echo
survivors=0
printf '%-20s %-6s %s\n' MUTATION VERDICT "REQUIREMENT"
while IFS='|' read -r mut req; do
  mut=$(tr -d '[:space:]' <<<"$mut"); [ -z "$mut" ] && continue
  req=$(sed 's/^ *//' <<<"$req")
  out=$(MUT="$mut" bash "$FLOOR" "$REF" node tally.mjs 2>&1)
  if grep -q '^  FAIL' <<<"$out"; then
    caught=$(grep -c '^  FAIL' <<<"$out")
    printf '%-20s %-6s %s (caught by %s check(s))\n' "$mut" CAUGHT "$req" "$caught"
  else
    printf '%-20s %-6s %s\n' "$mut" SURVIVED "$req"
    survivors=$((survivors + 1))
  fi
done <<<"$MUTATIONS"

echo
if [ "$survivors" = 0 ]; then
  echo "ALL CLEAR — every mutation is caught; the floor asserts each requirement it names"
else
  echo "$survivors MUTATION(S) SURVIVED — the floor does not assert what it claims" >&2
  exit 1
fi
