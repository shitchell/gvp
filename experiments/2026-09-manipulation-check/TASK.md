# Build `noteview`

A command-line tool that walks a directory of Markdown files with YAML
frontmatter and prints a summary report.

## Requirements

1. `noteview <dir>` recursively finds `.md` files under `<dir>`.
2. Each file may begin with YAML frontmatter delimited by `---` lines. Parse it.
3. Report one row per file with: relative path, the frontmatter `title` (or the
   filename if absent), the frontmatter `tags` (a list, possibly absent), and
   the file's word count excluding frontmatter.
4. `--tag <name>` restricts output to files carrying that tag.
5. `--json` emits the same data as a JSON array instead of a table.
6. A file whose frontmatter is malformed must be reported, not skipped silently,
   and must not stop the run.
7. Sort output by path.

TypeScript on Node. It must run via `npx tsx src/index.ts <dir>` or an
equivalent documented in your README.

Write it however you judge best.
