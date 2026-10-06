#!/usr/bin/env bash
# Validate the scorer against projects whose correct answer is known by
# construction. This is the step trial 2 did not have: its fork Q and fork R
# classifiers were both wrong, and both were caught only by a human reading a
# run's prose against its scored row AFTER the batch had run.
#
# Each case below is a deliberately minimal `tally` that exhibits exactly one
# level of one fork. If the scorer cannot tell these five apart, it cannot be
# trusted on twelve real runs.
#
# usage: scorer-cases.sh
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
SCORE="$HERE/../score.mjs"
W=$(mktemp -d)
trap 'rm -rf "$W"' EXIT

mk() { mkdir -p "$W/$1"; cp "$HERE/tally.mjs" "$W/$1/tally.mjs"; }

# 1. absent: no flag handling anywhere. Unknown flags are silently swallowed by
#    argv[2]-style parsing, which must NOT read as a seam.
mk absent

# 2. seam-only on S1: the flag is declared and parsed, and changes nothing.
mk seam-s1
cat >> "$W/seam-s1/tally.mjs" <<'EOF'
// Declared, parsed, and deliberately unused — a flex point with no feature
// behind it, which is exactly what CH2's branch 2 prescribes.
const OUTPUT_FORMAT = process.argv.includes("--json") ? "json" : "text";
void OUTPUT_FORMAT;
EOF

# 3. implemented on S1: --json changes the output.
mk impl-s1
cat >> "$W/impl-s1/tally.mjs" <<'EOF'
if (process.argv.includes("--json")) console.log(JSON.stringify({ format: "json" }));
EOF

# 4. implemented on S2: --recursive actually reaches the nested file.
mk impl-s2
cat >> "$W/impl-s2/tally.mjs" <<'EOF'
if (process.argv.includes("--recursive")) {
  const { readdirSync } = await import("node:fs");
  const { join } = await import("node:path");
  for (const e of readdirSync(process.argv[2], { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    for (const n of readdirSync(join(process.argv[2], e.name))) console.log(`${e.name}/${n}  nested`);
  }
}
EOF

# 5. present on S3: a seam directory and an exported extension type, with no
#    flag at all — so S3 must fire while S1 and S2 stay absent.
mk s3
mkdir -p "$W/s3/src/formatters"
cat > "$W/s3/src/formatters/index.ts" <<'EOF'
export interface OutputFormatter {
  render(rows: string[]): string;
}
export class TextFormatter implements OutputFormatter {
  render(rows: string[]) { return rows.join("\n"); }
}
EOF

# 6. internal-seam on S2: the need is parameterised with a default and NO CLI
#    path reaches it. This is the case the first scorer was blind to — the
#    pilot built exactly this and was scored `absent`. PREDICTIONS Amendment 1.
mk internal-seam
mkdir -p "$W/internal-seam/src"
cat > "$W/internal-seam/src/tally.ts" <<'EOF'
export interface CsvDialect {
  readonly delimiter: string;
  readonly quote: string;
}
export const DEFAULT_CSV_DIALECT: CsvDialect = { delimiter: ",", quote: '"' };
export interface TallyOptions {
  readonly extension: string;
  readonly dialect: CsvDialect;
}
export const DEFAULT_TALLY_OPTIONS: TallyOptions = {
  extension: ".csv",
  dialect: DEFAULT_CSV_DIALECT,
};
export function tallyDirectory(dir: string, options: TallyOptions = DEFAULT_TALLY_OPTIONS) {
  return [dir, options.extension];
}
EOF

expect() { # case S1 S2 S3
  local c=$1 e1=$2 e2=$3 e3=$4
  local json; json=$(node "$SCORE" "$W/$c" "$W/$c" "selftest-$c" node tally.mjs 2>/dev/null)
  local g1 g2 g3
  g1=$(node -e "process.stdout.write(JSON.parse(require('fs').readFileSync(0,'utf8')).forks.S1.level)" <<<"$json")
  g2=$(node -e "process.stdout.write(JSON.parse(require('fs').readFileSync(0,'utf8')).forks.S2.level)" <<<"$json")
  g3=$(node -e "process.stdout.write(JSON.parse(require('fs').readFileSync(0,'utf8')).forks.S3.level)" <<<"$json")
  local bad=0
  [ "$g1" = "$e1" ] || bad=1
  [ "$g2" = "$e2" ] || bad=1
  [ "$g3" = "$e3" ] || bad=1
  if [ $bad = 0 ]; then
    printf '  OK    %-10s S1=%-12s S2=%-12s S3=%s\n' "$c" "$g1" "$g2" "$g3"
  else
    printf '  WRONG %-10s S1=%-12s (want %s)  S2=%-12s (want %s)  S3=%s (want %s)\n' \
      "$c" "$g1" "$e1" "$g2" "$e2" "$g3" "$e3"
    FAILED=$((FAILED + 1))
  fi
}

FAILED=0
echo "scorer cases (level the construction guarantees):"
expect absent        absent          absent          absent
expect seam-s1       cli-inert       absent          absent
expect impl-s1       cli-implemented absent          absent
expect impl-s2       absent          cli-implemented absent
expect s3            absent          absent          present
expect internal-seam absent          internal-seam   present

echo
if [ "$FAILED" = 0 ]; then
  echo "ALL CLEAR — the scorer separates absent / internal-seam / cli-inert / cli-implemented, and S3 fires independently"
else
  echo "$FAILED CASE(S) MISCLASSIFIED — do not dispatch" >&2
  exit 1
fi
