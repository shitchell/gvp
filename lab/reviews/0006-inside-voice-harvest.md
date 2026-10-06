# Abstract/Summary

One delegated pass over all 36 historical run DECISIONS files: ~19% name an
element change that would have flipped their own decision, and three blind
runs converged on the same patch.

# Results

| measure | value |
|---|---|
| files read | 36/36 |
| would-have-flipped statements | 7 (19% of runs) |
| steering-meta statements | 106 (~3/run) |
| files with neither | 2 |
| convergent patch proposals (same element, independent runs) | 1 × 3 runs (CR1 qualifier) |
| recurring confessed-unmet element | CP10/P7 in 10 files (run worlds have no git/CI) |

## Explanation

The decisions corpus is a second instrument: it scores the library (gaps,
pulls, improvised precedence) on every run ever made. Cross-run convergence
is the ranking signal a harvest hook should feed #39 with. Caveats: rates
are prompted-corpus; trial 4 later showed self-reports can be false, so
harvested claims need artifact cross-checks before adoption (musing 0016).

## Methodology

Single subagent, verbatim-quote extraction with pre-stated classification
rules; counts audited per directory. Full: `lab/probes/0004-*.md`.
