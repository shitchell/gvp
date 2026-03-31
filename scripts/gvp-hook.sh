#!/usr/bin/env bash
##
# Cairn/GVP validation hook for git pre-commit and CI/CD pipelines.
#
# Usage:
#   # As a git pre-commit hook:
#   cp scripts/gvp-hook.sh .git/hooks/pre-commit
#   chmod +x .git/hooks/pre-commit
#
#   # Or symlink:
#   ln -sf ../../scripts/gvp-hook.sh .git/hooks/pre-commit
#
#   # In CI/CD:
#   ./scripts/gvp-hook.sh --ci
#
#   # With coverage check:
#   ./scripts/gvp-hook.sh --coverage
#
#   # Strict mode (warnings become errors):
#   ./scripts/gvp-hook.sh --strict
#
# Exit codes:
#   0 — validation passed (or no GVP library found)
#   1 — validation errors found
##

set -euo pipefail

# --------------------------------------------------------------------------- #
# Configuration
# --------------------------------------------------------------------------- #

# Whether to run coverage checks (W012, W013)
COVERAGE=false

# Whether to use strict mode (promote warnings to errors)
STRICT=false

# Whether we're running in CI mode (affects output formatting)
CI=false

# Scope for validation (empty = full, "staged" = git staged files only)
SCOPE=""

# Parse arguments
while [[ $# -gt 0 ]]; do
    case "$1" in
        --coverage)   COVERAGE=true; shift ;;
        --strict)     STRICT=true; shift ;;
        --ci)         CI=true; shift ;;
        --scope)      SCOPE="$2"; shift 2 ;;
        --staged)     SCOPE="staged"; shift ;;
        --help|-h)
            sed -n '/^##$/,/^##$/p' "$0" | sed 's/^# \?//'
            exit 0
            ;;
        *)
            echo "Unknown option: $1" >&2
            exit 1
            ;;
    esac
done

# --------------------------------------------------------------------------- #
# Check for GVP
# --------------------------------------------------------------------------- #

# Find cairn/gvp binary (prefer cairn, fall back to gvp)
GVP=""
if command -v cairn &>/dev/null; then
    GVP="cairn"
elif command -v gvp &>/dev/null; then
    GVP="gvp"
elif command -v npx &>/dev/null; then
    GVP="npx cairn"
else
    echo "[gvp-hook] cairn not found. Skipping validation." >&2
    exit 0
fi

# Check if a GVP library exists
if [[ ! -d ".gvp/library" ]] && [[ ! -d "gvp" ]]; then
    # No GVP library — nothing to validate
    exit 0
fi

# --------------------------------------------------------------------------- #
# Build command
# --------------------------------------------------------------------------- #

CMD="$GVP validate"

if [[ "$STRICT" == "true" ]]; then
    CMD="$CMD --strict"
fi

if [[ "$COVERAGE" == "true" ]]; then
    CMD="$CMD --coverage"
fi

if [[ -n "$SCOPE" ]]; then
    CMD="$CMD --scope $SCOPE"
fi

# --------------------------------------------------------------------------- #
# Run validation
# --------------------------------------------------------------------------- #

if [[ "$CI" == "true" ]]; then
    echo "::group::GVP Validation"
    echo "Running: $CMD"
fi

# Capture output and exit code
OUTPUT=""
EXIT_CODE=0
OUTPUT=$($CMD 2>&1) || EXIT_CODE=$?

if [[ -n "$OUTPUT" ]]; then
    echo "$OUTPUT" >&2
fi

if [[ "$CI" == "true" ]]; then
    echo "::endgroup::"

    # If there are errors, annotate them for GitHub Actions
    if [[ $EXIT_CODE -ne 0 ]]; then
        echo "::error::GVP validation failed. See output above."
    fi
fi

if [[ $EXIT_CODE -ne 0 ]]; then
    echo "" >&2
    echo "[gvp-hook] Validation failed. Fix errors before continuing." >&2
    echo "[gvp-hook] To skip this check: git commit --no-verify" >&2
    exit 1
fi

# --------------------------------------------------------------------------- #
# Optional: check for stale elements
# --------------------------------------------------------------------------- #

STALE_OUTPUT=""
STALE_EXIT=0
STALE_OUTPUT=$($GVP review 2>&1) || STALE_EXIT=$?

if echo "$STALE_OUTPUT" | grep -q "stale element"; then
    echo "" >&2
    echo "[gvp-hook] Warning: stale elements found:" >&2
    echo "$STALE_OUTPUT" >&2
    echo "" >&2
    echo "[gvp-hook] Run 'cairn review' to review them." >&2
    # Stale elements are a warning, not a blocker
fi

exit 0
