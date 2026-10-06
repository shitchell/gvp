#!/usr/bin/env bash
# The gate is fallible too. Every assertion leak-audit.py makes has a mutation
# here that must make it FAIL; a check that cannot fail is not a check (TH2,
# which this trial's own lab distilled from this very practice).
# usage: mutation-test.sh   (external machine-level checks skipped via env)
set -uo pipefail
E="$(cd "$(dirname "$0")/.." && pwd)"
TMPROOT=$(mktemp -d)
trap 'rm -rf "$TMPROOT"' EXIT
pass=0; fail=0

mutate() {  # mutate <name> <expected-failing-substring> <shell to run in $W>
  local name="$1" want="$2" body="$3"
  # The sandbox mirrors enough of experiments/ that the gate's CROSS-TRIAL
  # constants (trial 3's TASK/RUN_PROMPT, ../tasks/) exist — otherwise those
  # byte-identity checks silently skip in the sandbox and a mutation against
  # them reads as MISSED-by-skip: the exact unfalsifiable-check failure TH2
  # names.
  local ROOT="$TMPROOT/$(echo "$name" | tr -cd '[:alnum:]')"
  local W="$ROOT/2026-10-strict-typing-cp7"
  mkdir -p "$ROOT/2026-10-contested-axis" "$ROOT/tasks"
  cp "$E/../2026-10-contested-axis/TASK.md" "$E/../2026-10-contested-axis/RUN_PROMPT.md" "$ROOT/2026-10-contested-axis/"
  cp "$E/../tasks/csv-tally.md" "$ROOT/tasks/"
  rsync -a --exclude='snapshots' --exclude='results' --exclude='decisions' "$E/" "$W/"
  ( cd "$W" && eval "$body" )
  local out; out=$(LEAK_AUDIT_SKIP_EXTERNAL=1 python3 "$W/instrument/leak-audit.py" "$W" 2>&1)
  if grep -q "FAILURE" <<<"$out" && grep -q "FAIL.*$want" <<<"$out"; then
    echo "  CAUGHT   $name"; pass=$((pass+1))
  else
    echo "  MISSED   $name   (expected a FAIL matching: $want)"; fail=$((fail+1))
  fi
}

echo "the unmutated instrument must pass:"
if LEAK_AUDIT_SKIP_EXTERNAL=1 python3 "$E/instrument/leak-audit.py" "$E" >/dev/null 2>&1; then
  echo "  OK       gate is clear before mutation"
else
  echo "  BROKEN   gate already fails — fix that first" >&2; exit 1
fi
echo

mutate "VCS metadata shipped in a variant" "no VCS/editor metadata" \
  "mkdir -p variants/baseline/.git && echo x > variants/baseline/.git/HEAD"

mutate "I-lone name not inverted" "name inverted alongside" \
  "sed -i 's/    name: Inferred typing/    name: Strict typing/' variants/I-lone/code/common.yaml"

mutate "M-narrowed name changed" "name deliberately unchanged" \
  "sed -i '0,/    name: Strict typing/s//    name: Boundary typing/' variants/M-narrowed/code/common.yaml"

mutate "a second element changed in a single-element arm" "exactly one element changed" \
  "sed -i 's/^      Prefer the simplest approach/      PREFER the simplest approach/' variants/I-lone/personal.yaml"

mutate "more than the declared file differs" "only code/web.yaml differs" \
  "echo '# stray' >> variants/N-inverted/code/realtime.yaml"

mutate "I-quiet: a sixth element changed" "exactly the five declared elements" \
  "sed -i 's/^      Code should be obvious, not impressive\./      Code should be OBVIOUS, not impressive./' variants/I-quiet/code/common.yaml && sed -i 's/Centralize shared logic/Centralise shared logic/' variants/I-quiet/code/common.yaml"

mutate "I-quiet: a quiet swap reverted (R1 says Typecheck again)" "removed" \
  "sed -i 's/Checks must pass\./Typecheck must pass./' variants/I-quiet/personal.yaml"

mutate "I-quiet: swap text smuggles an axis stem" "introduces no axis stem" \
  "python3 - <<'P2'
import pathlib, re
p = pathlib.Path('variants/I-quiet/code/common.yaml'); t = p.read_text()
t = t.replace('hard requirements such as deployment targets', 'hard requirements such as TypeScript builds')
p.write_text(t)
p2 = pathlib.Path('instrument/leak-audit.py'); g = p2.read_text()
g = g.replace('\"hard requirements such as deployment targets\",', '\"hard requirements such as TypeScript builds\",')
p2.write_text(g)
P2"

mutate "a buttress stem survives into I-quiet" "strong-stem matches are exactly the declared set" \
  "sed -i 's/Example: enforce a formatter in a pre-commit hook/Example: enforce strict type checking in a pre-commit hook/' variants/I-quiet/code/common.yaml && python3 - <<'P2'
import pathlib
p = pathlib.Path('instrument/leak-audit.py'); g = p.read_text()
g = g.replace('''    (
        \"code/common.yaml\",
        \"Example: enforce strict type checking in a pre-commit hook\",
        \"Example: enforce a formatter in a pre-commit hook\",
    ),
''', '')
p.write_text(g)
P2"

mutate "tag glossary tampered in one arm" "tag glossary byte-identical" \
  "sed -i 's/          description: Naming, structure, extensibility, testability/          description: Naming, structure, testability/' variants/M-narrowed/personal.yaml"

mutate "an arm's validate output diverges" "validate output byte-identical" \
  "python3 - <<'P2'
import pathlib
p = pathlib.Path('variants/M-narrowed/code/common.yaml'); t = p.read_text()
t = t.replace('''  - id: CP7
    name: Strict typing''', '''  - id: CP7
    name: Strict typing
    maps_to: []''', 1)
p.write_text(t)
P2"

mutate "TASK.md drifts from the trial-3 constant" "byte-identical to trial 3" \
  "printf '\n10. Keep the code tidy.\n' >> TASK.md"

# All three copies of the task (this trial's, trial 3's, tasks/) get the same
# edit so the byte-identity constant still PASSES and only the axis-word check
# can catch it. Singular "interface": the plural slips \binterface\b, which
# was this mutation's first lesson.
mutate "TASK.md names the axis outside the whitelisted line" "never names the axis" \
  "python3 - <<'P2'
import pathlib
for f in ('TASK.md', '../2026-10-contested-axis/TASK.md', '../tasks/csv-tally.md'):
    p = pathlib.Path(f)
    p.write_text(p.read_text().replace('Write it however you judge best.', 'Write it however you judge best, behind a clean interface.'))
P2"

mutate "TASK.md gains a flag" "no command-line flag" \
  "python3 - <<'P2'
import pathlib
p = pathlib.Path('TASK.md'); t = p.read_text() + '\n10. A --quiet flag suppresses the summary.\n'
p.write_text(t)
pathlib.Path('../tasks/csv-tally.md').write_text(t)
P2"

mutate "RUN_PROMPT invites tension-hunting" "does not invite tension-hunting" \
  "python3 - <<'P2'
import pathlib
for f in ('RUN_PROMPT.md', '../2026-10-contested-axis/RUN_PROMPT.md'):
    p = pathlib.Path(f); p.write_text(p.read_text() + '\nNote any tension between library elements.\n')
P2"

mutate "the floor probes a measured fork" "does not inspect the measured forks" \
  "sed -i 's|^OUT=\$(\"\$@\" \"\$FIX\" 2>&1)|OUT=\$(\"\$@\" \"\$FIX\" 2>\&1); grep -q tsconfig .|' instrument/accept/run.sh"

echo
echo "  ---- $pass caught, $fail missed"
[ "$fail" = 0 ] || { echo "A GATE CHECK CANNOT FAIL — it is not a check" >&2; exit 1; }
echo "ALL CLEAR — every gate assertion has a mutation that defeats it"
