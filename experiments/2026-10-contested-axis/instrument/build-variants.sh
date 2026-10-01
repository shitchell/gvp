#!/usr/bin/env bash
# Build the four arm libraries from a clean copy of the real personal library.
#
# Every edit is a surgical text substitution on the exact line the element
# occupies, NOT a YAML round-trip: a reformatted file would differ from the
# baseline everywhere and be a tell in itself.
#
# TRIAL 3 DIFFERS FROM TRIALS 1 AND 2 IN KIND. Nothing here is inverted. Both
# manipulated arms APPEND a tie-break clause to an existing statement, leaving
# the element's position, name and id untouched. Consequences, all deliberate:
#
#   - no arm's library contradicts its own tag glossary (trial 1 defect 7)
#   - no arm leaves an id gap (trial 2 PREDICTIONS section 10)
#   - `baseline` needs no build at all, so it carries no tampering tell of any
#     kind — the cleanest control either previous trial had
#
# usage: build-variants.sh [source-library]   (default ~/.gvp/library)
set -euo pipefail
E="$(cd "$(dirname "$0")/.." && pwd)"
SRC="${1:-$HOME/.gvp/library}"
OUT="$E/variants"

rm -rf "$OUT"
mkdir -p "$OUT"

# baseline: a clean copy with no VCS / editor / OS metadata (trial 1 defect 2)
rsync -a \
  --exclude='.git' --exclude='.git*' --exclude='.svn' --exclude='.hg' \
  --exclude='*.orig' --exclude='*.bak' --exclude='*.swp' --exclude='*.rej' \
  --exclude='.DS_Store' \
  "$SRC/" "$OUT/baseline/"

for v in D-decisive A-decisive N-inverted; do
  rsync -a "$OUT/baseline/" "$OUT/$v/"
done

# --- the two tie-breaks ----------------------------------------------------
#
# Symmetric by construction: identical "(Where this meets <id>'s ..., this
# <noun> governs: no concrete use case ... seam.)" frame, resolving only on
# whether a seam results. leak-audit.py asserts the symmetry; see
# PREDICTIONS.md section 3.

CH2_STMT='      If a feature is needed for stability or correctness: implement now. If a feature is additive and its access patterns are unknown: add flex points (interfaces, config hooks) without implementing the feature. If a feature is speculative with no concrete use case: defer entirely with no flex points.'
P21_STMT='      Favor creating many flex points in early builds, exposed as config options, to aid the process of experimenting to discover the best use of the tool.'

# D-decisive: code-common:CH2 resolves the contest toward deferral.
python3 - "$OUT/D-decisive/code/common.yaml" "$CH2_STMT" \
  "$CH2_STMT (Where this meets personal:P21's preference for many early flex points, this tree governs: no concrete use case means no seam.)" <<'PY'
import sys, pathlib
p = pathlib.Path(sys.argv[1]); t = p.read_text()
old, new = sys.argv[2], sys.argv[3]
assert t.count(old) == 1, (p, t.count(old))
p.write_text(t.replace(old, new))
PY

# A-decisive: personal:P21 resolves the contest toward the seam.
python3 - "$OUT/A-decisive/personal.yaml" "$P21_STMT" \
  "$P21_STMT (Where this meets code-common:CH2's third branch, this principle governs: no concrete use case yet still means a seam.)" <<'PY'
import sys, pathlib
p = pathlib.Path(sys.argv[1]); t = p.read_text()
old, new = sys.argv[2], sys.argv[3]
assert t.count(old) == 1, (p, t.count(old))
p.write_text(t.replace(old, new))
PY

# --- the noise floor: code-web:WP3, inert for this task --------------------
# Reused unchanged from trial 2, where it was chosen as a PRINCIPLE rather than
# a rule: every rule in this library is buttressed by a principle asserting the
# same position, so inverting a rule makes its own document self-contradictory.
# WP3 has no element restating it, and its tags (`web`, `security`) do not
# describe its position the way the `performance` gloss describes RTP5's.
#
# Inert for `tally`: a Node CLI that reads local files, makes no network
# request, and loads no subresource. Also inert for THIS axis specifically —
# WP3 says nothing about deferral, flex points or abstraction, which the gate
# asserts rather than assumes.
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
    assert t.count(old) == 1, (old, t.count(old))
    t = t.replace(old, new)
p.write_text(t)
PY

# --- verify: exactly one file differs per arm, and only on the intended line
# `|| true` on the substitution, NOT on the test: diff exits 1 whenever it finds
# a difference, which is the expected case here, and `pipefail` propagates that
# through `| wc -l` so `set -e` kills the script before the test ever runs —
# silently, because diff's output went into wc. Cost 20 minutes the first time.
for v in D-decisive A-decisive N-inverted; do
  changed=$( { diff -rq "$OUT/baseline" "$OUT/$v" || true; } | wc -l )
  [ "$changed" -eq 1 ] || { echo "FAIL $v: $changed files differ, expected 1" >&2; exit 1; }
done

# baseline must be byte-identical to the source library, excluding the metadata
# rsync dropped. If it is not, the "zero tampering" claim in PREDICTIONS.md
# section 3 is false.
diff -rq --exclude='.git*' "$SRC" "$OUT/baseline" >/dev/null \
  || { echo "FAIL baseline differs from source library" >&2; exit 1; }

echo "built: $(ls "$OUT" | tr '\n' ' ')"
echo "verified: one file differs per manipulated arm; baseline is pristine"
