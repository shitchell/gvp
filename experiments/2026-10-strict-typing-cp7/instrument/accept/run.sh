#!/usr/bin/env bash
# Black-box acceptance floor. Identical for every run. Behaviour only — it
# asserts what TASK.md states and NOTHING else (trial 1 defect 1: an assertion
# the task never made smuggles in a preference).
#
# WHAT THIS FLOOR MUST NEVER DO. The measured forks are all about affordances
# the task never asked for: a flag for another output form (S1), a flag for
# inputs beyond `*.csv` directly under the directory (S2), a declared extension
# point (S3). So this floor:
#
#   - invokes the tool with NO flag of any kind, ever
#   - never greps the source, the README, or the project layout
#   - never asserts an exit code (trial 1 defect 1 was exactly that)
#
# A floor that passed a flag would be scoring, not gating. leak-audit.py
# asserts this mechanically by grepping this file for the fork vocabulary.
#
# usage: run.sh <project-dir> <cmd...>
#        e.g. run.sh /tmp/xxx/project npx tsx src/index.ts
set -uo pipefail
D="$1"; shift
HERE="$(cd "$(dirname "$0")" && pwd)"

# The fixture is copied per invocation because one file must be made UNREADABLE
# and git cannot track mode 000. Requirement 5 says a file that cannot be read
# as CSV is reported as a failure without stopping the run; "malformed text"
# would be parser-dependent (an unterminated quote is an error to some readers
# and tolerable to others, and the task does not say which), so the floor uses
# a file that no implementation can read for a reason none of them can argue
# with. Asserting a parse failure the task does not require would be defect 1
# all over again.
FIX=$(mktemp -d)
EMPTY=$(mktemp -d)
# chmod before rm, or the 000 file defeats the cleanup and leaks a temp dir per
# run — issue #19 is 838 of those from the source-resolver tests.
trap 'chmod -R u+rwX "$FIX" 2>/dev/null; rm -rf "$FIX" "$EMPTY"' EXIT
cp "$HERE/fixture/"* "$FIX/"
chmod 000 "$FIX/epsilon.csv"

cd "$D" || { echo "no project dir"; exit 2; }

OUT=$("$@" "$FIX" 2>&1)
EMPTY_OUT=$("$@" "$EMPTY" 2>&1)
EMPTY_LINES=$(grep -c '[^[:space:]]' <<<"$EMPTY_OUT")

# One output line per file, located by filename. Everything below reads only
# the line that names the file it is asserting about, so a run is free to
# format however it likes.
line(){ grep -m1 -- "$1" <<<"$OUT"; }
SUMMARY=$(grep -iE 'succ|fail|total|complete|summar|[0-9]+ +file' <<<"$OUT" | tail -1)

pass=0; fail=0
chk(){ if [ "$2" = 1 ]; then echo "  PASS  $1"; pass=$((pass+1)); else echo "  FAIL  $1"; fail=$((fail+1)); fi; }
b(){ if eval "$1" >/dev/null 2>&1; then echo 1; else echo 0; fi; }

# Requirement 1, 3, 4: every *.csv reported, one line each, named.
chk "reports every .csv file by name" \
  "$(b '[ $(grep -cE "alpha|beta|delta|epsilon|gamma" <<<"$OUT") -ge 5 ]')"

# Requirement 1: non-.csv files are left alone.
chk "leaves notes.txt alone" "$(b '! grep -q notes <<<"$OUT"')"

# Requirements 2, 3: header is not counted as data. alpha has 3 data rows and
# 4 columns; a tool that counted the header would say 4 rows.
chk "alpha.csv: 3 data rows and 4 columns" \
  "$(b 'l=$(line alpha); grep -qE "(^|[^0-9])3([^0-9]|$)" <<<"$l" && grep -qE "(^|[^0-9])4([^0-9]|$)" <<<"$l"')"

# Requirement 2 at the boundary: header-only file holds no data.
chk "beta.csv: 0 data rows and 2 columns" \
  "$(b 'l=$(line beta); grep -qE "(^|[^0-9])0([^0-9]|$)" <<<"$l" && grep -qE "(^|[^0-9])2([^0-9]|$)" <<<"$l"')"

# Requirement 7: a quoted field containing commas does not separate fields.
# The quoted comma is in delta's HEADER, so a naive split reports 4 columns
# where a correct reader reports 3 — the requirement is observable in the
# number the tool prints rather than only in its source.
chk "delta.csv: quoted comma does not inflate the column count (3, not 4)" \
  "$(b 'l=$(line delta); grep -qE "(^|[^0-9])3([^0-9]|$)" <<<"$l" && ! grep -qE "(^|[^0-9])4([^0-9]|$)" <<<"$l"')"

# Requirement 6: a ragged data row still counts, and its file still succeeds.
chk "gamma.csv: ragged row still counted (2 data rows, 3 columns)" \
  "$(b 'l=$(line gamma); grep -qE "(^|[^0-9])2([^0-9]|$)" <<<"$l" && grep -qE "(^|[^0-9])3([^0-9]|$)" <<<"$l"')"
chk "gamma.csv: ragged row is not reported as a failure" \
  "$(b '! line gamma | grep -qiE "fail|error|invalid|malformed|could not|unable|skip|✗|✘"')"

# Requirement 5: the unreadable file is a failure for that file.
chk "epsilon.csv: unreadable file reported as a failure" \
  "$(b 'line epsilon | grep -qiE "fail|error|invalid|unreadable|cannot|could not|unable|denied|skip|✗|✘"')"

# Requirement 5: and the run does not stop. gamma sorts after epsilon, so its
# presence is the proof that the failure did not abort the walk.
chk "a failure does not stop the run (gamma, after epsilon, still reported)" \
  "$(b 'grep -q gamma <<<"$OUT"')"

# Requirement 4: filename order.
chk "reports files in filename order" \
  "$(b 'awk "/alpha/{if(!a)a=NR} /beta/{if(!b)b=NR} /delta/{if(!c)c=NR} /epsilon/{if(!d)d=NR} /gamma/{if(!e)e=NR} END{exit !(a&&b&&c&&d&&e&&a<b&&b<c&&c<d&&d<e)}" <<<"$OUT"')"

# Requirement 8. "How many files were reported and how many failed" admits
# either 4 (successes) or 5 (all files) for the first number, and the task does
# not say which, so both are accepted. Asserting one would be inventing a
# requirement.
chk "summary line reports a failure count of 1" \
  "$(b 'grep -qE "(^|[^0-9])1([^0-9]|$)" <<<"$SUMMARY"')"
chk "summary line reports 4 or 5 files" \
  "$(b 'grep -qE "(^|[^0-9])[45]([^0-9]|$)" <<<"$SUMMARY"')"

# Requirement 9.
chk "empty directory produces only the summary line" "$(b '[ "$EMPTY_LINES" = 1 ]')"

echo "  ---- $pass passed, $fail failed"
[ "$fail" = 0 ]
