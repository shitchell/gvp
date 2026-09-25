# Cross-Repo Inheritance

How to make a project's GVP library inherit elements from a library hosted in a
separate git repository. Verified against cairn 1.2.0.

## Setup

Add an `inherits` block to the **`meta`** of the document that wants to inherit.
Each remote source is an object with `source` + `as`:

```yaml
# .gvp/library/my-project.yaml
meta:
  name: my-project
  inherits:
    - source: "@github:company/org-gvp@v1.0.0"
      as: org
    - source: "@github:company/shared-gvp@a1b2c3d"   # a full SHA works too
      as: shared
```

Reference inherited elements with the **alias prefix**, using the normal
`document:id` form underneath — i.e. `alias:document:id`:

```yaml
decisions:
  - id: D1
    name: Follow org coding standards
    maps_to: [org:values:V1, my-project:G1]   # org:<doc>:<id>  vs  local <doc>:<id>
```

`inherits` also accepts a **bare string** — that's *local* inheritance (another
document in the same library, by its `meta.name`), e.g. `inherits: universal`. The
object form (`source`/`as`) is what makes it cross-repo.

## Source spec format

`@<provider>:<path>@<commitish>`

| Provider | `source` format | Resolves to |
|----------|-----------------|-------------|
| GitHub | `@github:owner/repo@tag` | `https://github.com/owner/repo.git` |
| GitLab | `@gitlab:owner/repo@tag` | `https://gitlab.com/owner/repo.git` |
| Bitbucket | `@bitbucket:owner/repo@tag` | `https://bitbucket.org/owner/repo.git` |
| Azure DevOps | `@azure:org/project/repo@tag` | `https://dev.azure.com/org/project/_git/repo` |

## Rules that bite

1. **Immutable ref required.** The trailing `@...` must be a **tag or a full SHA**,
   never a branch. A missing ref or a branch name is rejected (DEC-1.9) — a branch
   would let the upstream library change silently under you. Error tells you to use
   `@v1.0.0` or `@abc1234`.
2. **`as:` is effectively required.** An entry without `as` still loads, but you get
   no alias to reference its elements by. Always give it one.
2b. **Aliases are document-local** (gvp:D39, like Python `import bar as b`). An alias
   is private to the document that declares it — it is NOT inherited by documents that
   `inherit:` this one. If another local doc needs `me:...`, it declares its own
   `as: me`, or references the inherited elements by their `meta.name`. (An inherited
   library's own internal aliases likewise never leak into yours.)
3. **The `document` segment in a reference is the inherited doc's `meta.name`**
   (DEC-1.5 / D15, gvp:D37) — so the upstream repo can reorganize files without
   breaking your references. Prefer the `meta.name` (`code-common:CP7`). The old
   file-path form (`code/common:CP7`) still resolves as a **lenient fallback**
   (gvp:D38), but it is not reorg-stable — `meta.name` always takes precedence. The
   canonical `source:documentPath:id` works as an absolute escape hatch.
4. **`meta.name` must be unique within a library** (gvp:R8, error `E006`). A bare
   `<meta.name>:<id>` resolves across all libraries, preferring the *local* one on a
   collision; if it still matches more than one library it is **ambiguous** (E001) and
   you must qualify with the `as:` alias (`org:common:X`). Cross-library duplicates are
   fine — that is exactly what the alias disambiguates.

## Precedence (D10)

Configurable in `config.yaml`, but the defaults:

- **Elements** → *ancestor wins*: an org-level element overrides a same-id project one
  (org-wide standards win).
- **Definitions** (tags, categories, field_schemas) → *descendant wins*: your project
  can extend/customize what it inherits.

```yaml
# .gvp/config.yaml
priority:
  elements: ancestor
  definitions: descendant
```

## Caching

Sources are **shallow-cloned once** into `~/.cache/cairn/sources/`, keyed by the pin.
To pick up a newer upstream version, bump the tag/SHA in `source:` (a new pin creates
a new cache entry). Delete the cache dir to force a re-fetch.

## Private repos

cairn shells out to `git fetch` over HTTPS, so it uses your existing git credential
setup. For a private upstream, configure a credential helper / token, or add an SSH
URL rewrite in your git config (e.g. `url."git@github.com:".insteadOf
"https://github.com/"`).

## Verify

- `cairn validate` — a mistyped alias or id surfaces as **E001 BROKEN_REFERENCE**.
- `cairn inspect <element> --trace` — walks up into the inherited elements, so you can
  confirm the chain actually connects across the repo boundary.
