#!/usr/bin/env bash
# The gate is fallible too. Every assertion leak-audit.py makes has a mutation
# here that must make it FAIL; a check that cannot fail is not a check.
#
# Trial 1's gate flagged hex digits as variant signal. Trial 2's flagged two
# runs for "reaching the gvp repository" when both had only run `npm ls -g`.
# Both were found by mutation review rather than by the gate working.
# usage: mutation-test.sh
set -uo pipefail
E="$(cd "$(dirname "$0")/.." && pwd)"
TMPROOT=$(mktemp -d)
trap 'rm -rf "$TMPROOT"' EXIT
pass=0; fail=0

mutate() {  # mutate <name> <expected-failing-substring> <shell to run in $W>
  local name="$1" want="$2" body="$3"
  local W="$TMPROOT/$(echo "$name" | tr -cd '[:alnum:]')"
  rsync -a --exclude='snapshots' --exclude='results' --exclude='decisions' "$E/" "$W/"
  ( cd "$W" && eval "$body" )
  local out; out=$(python3 "$W/instrument/leak-audit.py" "$W" 2>&1)
  if grep -q "FAILURE" <<<"$out" && grep -q "FAIL.*$want" <<<"$out"; then
    echo "  CAUGHT   $name"; pass=$((pass+1))
  else
    echo "  MISSED   $name   (expected a FAIL matching: $want)"; fail=$((fail+1))
  fi
}

echo "the unmutated instrument must pass:"
if python3 "$E/instrument/leak-audit.py" "$E" >/dev/null 2>&1; then
  echo "  OK       gate is clear before mutation"
else
  echo "  BROKEN   gate already fails — fix that before mutation-testing" >&2
  exit 1
fi
echo

# ---- checks inherited from trial 2 ---------------------------------------
mutate "VCS metadata shipped in a variant" "no VCS/editor metadata" \
  "mkdir -p variants/baseline/.git && echo x > variants/baseline/.git/HEAD"

mutate "a second element also changed" "exactly one element changed" \
  "sed -i 's/^      Prefer the simplest approach/      PREFER the simplest approach/' variants/D-decisive/personal.yaml"

mutate "more than one file differs" "only code/common.yaml differs" \
  "echo '# stray' >> variants/D-decisive/code/web.yaml"

# ---- checks new to trial 3 ------------------------------------------------
mutate "decisive arm rewrites instead of appending" "is an exact prefix" \
  "sed -i 's/If a feature is needed for stability or correctness: implement now\. //' variants/D-decisive/code/common.yaml"

mutate "decisive arm also changes the element name" "name deliberately unchanged" \
  "sed -i 's/    name: Deferral decision tree/    name: Deferral decision tree (strict)/' variants/D-decisive/code/common.yaml"

mutate "an undeclared voice appears on the axis" "no undeclared voice" \
  "python3 - <<'PY'
import pathlib
p = pathlib.Path('variants/baseline/code/testing.yaml')
t = p.read_text()
t = t.replace('principles:', '''principles:
  - id: TP99
    name: Speculative seams in test harnesses
    statement: |
      Build flex points for speculative future test backends before any concrete use case exists.
    tags:
      - code
    maps_to:
      - personal:V1
''', 1)
p.write_text(t)
PY"

mutate "the tag glossary differs between arms" "tag glossary is byte-identical" \
  "sed -i 's/          description: Naming, structure, extensibility, testability/          description: Naming, structure, testability/' variants/A-decisive/personal.yaml"

mutate "the tie-break clauses are not equally forceful" "differ by at most 4 words" \
  "sed -i 's/this principle governs: no concrete use case yet still means a seam\.)/this principle governs: no concrete use case yet still means a seam, and this holds regardless of how marginal the anticipated benefit may appear to the implementer at the time of writing, without exception.)/' variants/A-decisive/personal.yaml"

mutate "a clause abandons the shared construction" "same construction" \
  "sed -i \"s/(Where this meets personal:P21's preference for many early flex points, this tree governs:/(NOTE — overriding personal:P21 entirely:/\" variants/D-decisive/code/common.yaml"

mutate "TASK.md names a flag" "specifies no command-line flag" \
  "printf '\n10. A --json flag prints the report as JSON.\n' >> TASK.md"

mutate "TASK.md names the axis" "never names the axis under test" \
  "printf '\nDo not add speculative extension points.\n' >> TASK.md"

mutate "the floor probes a measured fork" "does not inspect the measured forks" \
  "sed -i 's|^OUT=\$(\"\$@\" \"\$FIX\" 2>&1)|OUT=\$(\"\$@\" \"\$FIX\" --json 2>\&1)|' instrument/accept/run.sh"

mutate "RUN_PROMPT invites conflict-hunting" "does not invite the run to look for tension" \
  "printf '\nNote any tension you find between elements of the library.\n' >> RUN_PROMPT.md"

mutate "an arm's validate output diverges" "validate output is byte-identical" \
  "python3 - <<'PY'
import pathlib
p = pathlib.Path('variants/A-decisive/personal.yaml')
t = p.read_text()
# drop P21's maps_to, which changes its mapping diagnostics and nothing else
t = t.replace('''  - id: P21''', '''  - id: P21
    maps_to: []''', 1)
p.write_text(t)
PY"

echo
echo "  ---- $pass caught, $fail missed"
[ "$fail" = 0 ] || { echo "A GATE CHECK CANNOT FAIL — it is not a check" >&2; exit 1; }
echo "ALL CLEAR — every gate assertion has a mutation that defeats it"
