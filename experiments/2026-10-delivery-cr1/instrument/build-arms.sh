#!/usr/bin/env bash
# Build the four DELIVERY arms. This is the trial-4 build-variants.sh inverted:
# there, each arm's library differed in exactly one element; here every arm's
# library is a byte-identical copy of the real one and the arms differ only in
# how that library's text reaches the agent.
#
#   L0   ambient only — CLAUDE.md pointer + the cairn CLI. No hook. The
#        delivery every trial 1-4 ran at.
#   L1   SessionStart hook, plain stdout, payload = code-common:CR1.
#   L2   PreToolUse hook on Write|Edit, additionalContext, payload = CR1,
#        fired only when the pending write carries a credential-shaped literal.
#   L2n  the NULL arm: identical hook, identical trigger, identical framing,
#        payload = code-web:WP3 (inert for a Node CLI). Separates "a hook
#        interrupted me" from "CR1 arrived".
#
# The hook command path is left as __HOOK__ and resolved per run by
# dispatch.sh, so no arm artifact ever carries a path into this directory.
#
# usage: build-arms.sh [source-library]   (default ~/.gvp/library)
set -euo pipefail
E="$(cd "$(dirname "$0")/.." && pwd)"
SRC="${1:-$HOME/.gvp/library}"
OUT="$E/arms"
ARMS=(L0 L1 L2 L2n)

rm -rf "$OUT"
mkdir -p "$OUT"

for a in "${ARMS[@]}"; do
  mkdir -p "$OUT/$a/library"
  rsync -a \
    --exclude='.git' --exclude='.git*' --exclude='.svn' --exclude='.hg' \
    --exclude='*.orig' --exclude='*.bak' --exclude='*.swp' --exclude='*.rej' \
    --exclude='.DS_Store' \
    "$SRC/" "$OUT/$a/library/"
done

# --- payloads, extracted from each arm's OWN library copy -------------------
python3 "$E/instrument/render-payload.py" "$OUT/L1/library"  code-common:CR1 > "$OUT/L1/context.txt"
python3 "$E/instrument/render-payload.py" "$OUT/L2/library"  code-common:CR1 > "$OUT/L2/context.txt"
python3 "$E/instrument/render-payload.py" "$OUT/L2n/library" code-web:WP3    > "$OUT/L2n/context.txt"

# --- settings fragments ----------------------------------------------------
cat > "$OUT/L1/hooks.json" <<'J'
{
  "SessionStart": [
    { "hooks": [ { "type": "command", "command": "python3 __HOOK__" } ] }
  ]
}
J

cat > "$OUT/L2/hooks.json" <<'J'
{
  "PreToolUse": [
    {
      "matcher": "Write|Edit",
      "hooks": [ { "type": "command", "command": "python3 __HOOK__" } ]
    }
  ]
}
J
cp "$OUT/L2/hooks.json" "$OUT/L2n/hooks.json"

# --- verify ----------------------------------------------------------------
for a in "${ARMS[@]}"; do
  diff -rq --exclude='.git*' "$SRC" "$OUT/$a/library" >/dev/null \
    || { echo "FAIL $a: library differs from the source library" >&2; exit 1; }
done

cmp -s "$OUT/L1/context.txt" "$OUT/L2/context.txt" \
  || { echo "FAIL L1 and L2 payloads differ — timing is the only variable" >&2; exit 1; }
cmp -s "$OUT/L2/hooks.json" "$OUT/L2n/hooks.json" \
  || { echo "FAIL L2 and L2n wiring differ — payload is the only variable" >&2; exit 1; }
if cmp -s "$OUT/L2/context.txt" "$OUT/L2n/context.txt"; then
  echo "FAIL the null arm's payload is not distinct" >&2; exit 1
fi
head -1 "$OUT/L1/context.txt" > "$OUT/.framing"
for a in L2 L2n; do
  cmp -s <(head -1 "$OUT/$a/context.txt") "$OUT/.framing" \
    || { echo "FAIL $a: framing sentence differs across arms" >&2; exit 1; }
done
rm -f "$OUT/.framing"
[ -e "$OUT/L0/hooks.json" ] && { echo "FAIL L0 is not hookless" >&2; exit 1; }
[ -e "$OUT/L0/context.txt" ] && { echo "FAIL L0 carries a payload" >&2; exit 1; }

echo "built: ${ARMS[*]}"
echo "verified: all four libraries byte-identical to the source; L1/L2 payloads"
echo "          identical; L2/L2n wiring identical; framing shared; L0 bare"
