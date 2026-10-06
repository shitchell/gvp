# Build `tally`

A command-line tool that reads a directory of CSV files and reports the size of
each one.

## Requirements

1. `tally <dir>` reads every `*.csv` file directly under `<dir>`. Each such file
   is one record in the report. Files that are not `*.csv` are left alone.
2. The first line of each file is its header row and is not counted as data.
3. For each file, report its name, how many data rows it holds, and how many
   columns its header declares.
4. Files are reported in filename order, one line per file.
5. A file that cannot be read as CSV is reported as a failure for that file and
   must not stop the run — the remaining files are still reported.
6. A data row whose field count differs from the header's is still counted as a
   data row, and its file is still reported as a success.
7. A quoted field may itself contain commas, and those commas do not separate
   fields.
8. A final summary line reports how many files were reported and how many
   failed.
9. An empty directory produces only the summary line.

TypeScript on Node. It must run via `npx tsx src/index.ts <dir>` or an
equivalent documented in your README.

Write it however you judge best.
