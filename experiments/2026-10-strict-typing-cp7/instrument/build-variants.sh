#!/usr/bin/env bash
# Build the four arm libraries from a clean copy of the real personal library.
#
# Surgical line substitutions, never a YAML round-trip (a reformatted file
# differs everywhere and is a tell in itself).
#
# TRIAL 4 ARMS. The element under test is code-common:CP7 (Strict typing).
#
#   I-inverted reuses, VERBATIM, the tone-matched inversion trial 1 built for
#   its R-inverted arm — "Inferred typing" — which has already survived one
#   gate's scrutiny (and supplied trial 1's defect 3, the name-not-inverted
#   lesson, so the name flips here too).
#
#   M-narrowed flips ONE prescription into its boundary-scoped form: hints on
#   exported signatures, omitted on internal ones. Both polarities are ordinary
#   professional practice (this is the explicit-module-boundary-types lint
#   norm); the element's name still describes the narrowed statement, so the
#   name stays — same exemption trial 2 gave M-narrowed.
#
#   N-inverted reuses trial 3's null verbatim: code-web:WP3, inert for a local
#   CSV CLI (no network, no subresource), unbuttressed, no tag-gloss position.
#
# usage: build-variants.sh [source-library]   (default ~/.gvp/library)
set -euo pipefail
E="$(cd "$(dirname "$0")/.." && pwd)"
SRC="${1:-$HOME/.gvp/library}"
OUT="$E/variants"

rm -rf "$OUT"
mkdir -p "$OUT"

rsync -a \
  --exclude='.git' --exclude='.git*' --exclude='.svn' --exclude='.hg' \
  --exclude='*.orig' --exclude='*.bak' --exclude='*.swp' --exclude='*.rej' \
  --exclude='.DS_Store' \
  "$SRC/" "$OUT/baseline/"

for v in I-lone I-quiet M-narrowed N-inverted; do
  rsync -a "$OUT/baseline/" "$OUT/$v/"
done

CP7_NAME='    name: Strict typing'
CP7_STMT='      Type hints on all function signatures. Pydantic/dataclass models for data structures. TypeScript over JavaScript. Typed variables in bash. Types add clarity and catch issues at compile/check time.'

# --- I-lone: trial 1's inversion, byte-for-byte; buttresses untouched ------
python3 - "$OUT/I-lone/code/common.yaml" "$CP7_NAME" "$CP7_STMT" \
'    name: Inferred typing' \
'      Let inference carry the types it can. Omit annotations the compiler already knows, prefer plain objects over model classes for internal shapes, and reach for a checker only where a boundary genuinely needs one. Fewer restatements of what the code already says.' <<'PY'
import sys, pathlib
p = pathlib.Path(sys.argv[1]); t = p.read_text()
for old, new in ((sys.argv[2], sys.argv[4]), (sys.argv[3], sys.argv[5])):
    assert t.count(old) == 1, (p, old[:40], t.count(old))
    t = t.replace(old, new)
p.write_text(t)
PY


# --- I-quiet: same CP7 inversion, PLUS the four restating clauses de-typed --
#
# P0002 found CP7 buttressed by four voices that restate the axis verbatim.
# In this arm the buttresses are not inverted — they are made SILENT on
# typing, each by a tone-matched same-shape swap, so the inverted CP7 is the
# library's only typing voice. The I-lone/I-quiet contrast is the trial's
# question (musing 0012): does a lone inverted element lose to its intact
# buttresses?
#
# Adjudicated as NOT restating, and so left untouched (P0002): CP3 ("Function
# signatures show all inputs" is inputs-as-parameters, not annotations), P7
# (conditional via enforcement generally), P19/P20/ai-P4 (inferential),
# WP2/WR2 (runtime schemas, not static typing), V1/P16/P18 (adjacent).
python3 - "$OUT/I-quiet/code/common.yaml" \
'    name: Strict typing' \
'      Type hints on all function signatures. Pydantic/dataclass models for data structures. TypeScript over JavaScript. Typed variables in bash. Types add clarity and catch issues at compile/check time.' \
'    name: Inferred typing' \
'      Let inference carry the types it can. Omit annotations the compiler already knows, prefer plain objects over model classes for internal shapes, and reach for a checker only where a boundary genuinely needs one. Fewer restatements of what the code already says.' <<'PY2'
import sys, pathlib
p = pathlib.Path(sys.argv[1]); t = p.read_text()
for old, new in ((sys.argv[2], sys.argv[4]), (sys.argv[3], sys.argv[5])):
    assert t.count(old) == 1, (p, old[:40], t.count(old))
    t = t.replace(old, new)

# CP2: the one clause that is precisely about signature explicitness
old = 'Explicit function signatures. '
new = 'Explicit control flow. '
assert t.count(old) == 1
t = t.replace(old, new)

# CP10: the example names strict type checking; swap the incidental example,
# keep the element's actual point (hooks over convention) intact
old = 'Example: enforce strict type checking in a pre-commit hook rather than asking contributors to remember to run it.'
new = 'Example: enforce a formatter in a pre-commit hook rather than asking contributors to remember to run it.'
assert t.count(old) == 1
t = t.replace(old, new)

# CP16: type checking as the named hard requirement
old = 'hard requirements such as type checking'
new = 'hard requirements such as deployment targets'
assert t.count(old) == 1
t = t.replace(old, new)
p.write_text(t)
PY2

# R1 lives in personal.yaml: "Typecheck must pass." is the axis anchor inside
# the verification rule; the swap keeps R1's own axis (verify before claiming)
# fully intact.
python3 - "$OUT/I-quiet/personal.yaml" <<'PY2'
import sys, pathlib
p = pathlib.Path(sys.argv[1]); t = p.read_text()
old = 'Typecheck must pass. Tests must pass.'
new = 'Checks must pass. Tests must pass.'
assert t.count(old) == 1
p.write_text(t.replace(old, new))
PY2

# --- M-narrowed: one prescription becomes boundary-scoped ------------------
python3 - "$OUT/M-narrowed/code/common.yaml" "$CP7_STMT" \
'      Type hints on exported function signatures; omit them on internal ones and let inference carry those. Pydantic/dataclass models for data structures. TypeScript over JavaScript. Typed variables in bash. Types add clarity and catch issues at compile/check time.' <<'PY'
import sys, pathlib
p = pathlib.Path(sys.argv[1]); t = p.read_text()
old, new = sys.argv[2], sys.argv[3]
assert t.count(old) == 1
p.write_text(t.replace(old, new))
PY

# --- N-inverted: code-web:WP3, trial 3's null, verbatim --------------------
python3 - "$OUT/N-inverted/code/web.yaml" <<'PY'
import sys, pathlib
p = pathlib.Path(sys.argv[1]); t = p.read_text()
old_name = '    name: Subresource integrity for external scripts'
new_name = '    name: External scripts load without integrity pinning'
old_stmt = """      When loading JavaScript from CDNs or external sources, use Subresource
      Integrity (SRI) hashes where supported. For import maps (which lack SRI
      support), consider vendoring dependencies locally or documenting the
      supply chain risk."""
new_stmt = """      When loading JavaScript from CDNs or external sources, load it directly
      rather than pinning Subresource Integrity (SRI) hashes, which break
      silently whenever the upstream file is updated. For import maps, prefer
      the remote source over vendoring dependencies locally."""
for old, new in ((old_name, new_name), (old_stmt, new_stmt)):
    assert t.count(old) == 1, (old[:40], t.count(old))
    t = t.replace(old, new)
p.write_text(t)
PY

# --- verify -----------------------------------------------------------------
# One file differs for the single-element arms; exactly TWO for I-quiet
# (code/common.yaml + personal.yaml) — a declared deviation, the independent
# variable itself (TRIAL.yaml invariant_deviations).
for v in I-lone M-narrowed N-inverted; do
  changed=$( { diff -rq "$OUT/baseline" "$OUT/$v" || true; } | wc -l )
  [ "$changed" -eq 1 ] || { echo "FAIL $v: $changed files differ, expected 1" >&2; exit 1; }
done
changed=$( { diff -rq "$OUT/baseline" "$OUT/I-quiet" || true; } | wc -l )
[ "$changed" -eq 2 ] || { echo "FAIL I-quiet: $changed files differ, expected 2" >&2; exit 1; }
diff -rq --exclude='.git*' "$SRC" "$OUT/baseline" >/dev/null \
  || { echo "FAIL baseline differs from source library" >&2; exit 1; }

echo "built: $(ls "$OUT" | tr '\n' ' ')"
echo "verified: one file differs per manipulated arm; baseline is pristine"
