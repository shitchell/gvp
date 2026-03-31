# Configuration Reference

GVP uses a layered configuration system. Config files are discovered
automatically, merged in a defined order, and can be overridden from the
command line.

## Config Discovery

Config files are discovered in this order (closer scope wins):

1. `/etc/gvp/config.yaml` (system)
2. `~/.config/gvp/config.yaml` (global)
3. `.gvp/config.yaml` (project)
4. `.gvp.yaml` (local, gitignored)

Environment variables can override each level: `GVP_CONFIG_SYSTEM`, `GVP_CONFIG_GLOBAL`, `GVP_CONFIG_PROJECT`, `GVP_CONFIG_LOCAL`.

### Walk-backwards Discovery

Starting from the current working directory and moving up toward the
filesystem root, GVP checks each directory for:

- **`.gvp/` directory** -- if found, the directory itself is added as a
  library path. If it contains a `library/` subdirectory, that is also
  added. If it contains `config.yaml`, the file is parsed.
- **`.gvp.yaml` file** -- if found, the file's parent directory is added
  as a library path (the file is treated as a standalone GVP document).

All matches are collected (closest to CWD first, root last).

### User config (`~/.config/gvp/`)

If this directory exists, GVP checks for:

- `~/.config/gvp/library/` -- added as a library path if present.
- `~/.config/gvp/config.yaml` -- parsed if present.

### System config (`/etc/gvp/`)

Same structure as user config:

- `/etc/gvp/library/` -- added as a library path if present.
- `/etc/gvp/config.yaml` -- parsed if present.

## `config.yaml` Format

```yaml
# User identity
user:
  name: "Your Name"
  email: "you@example.com"

# Additional library paths (~ is expanded)
libraries:
  - ~/my-gvps/personal
  - /shared/org-gvps

# Promote all warnings to errors
strict: false

# Silence specific diagnostic codes
suppress_diagnostics:
  - W001
  - W005

# Default timezone for provenance dates
default_timezone: "America/New_York"

# Merge priority strategy
priority:
  elements: ancestor      # ancestor-wins for elements
  definitions: descendant  # descendant-wins for definitions

# User-defined validation rules (top-level key)
validation_rules:
  - name: "Rule description"
    match:
      category: decision
    require:
      maps_to_category: heuristic
    level: warning
```

## Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `user.name` | string | — | User name for provenance entries. |
| `user.email` | string | — | User email for provenance entries. |
| `libraries` | list[string] | `[]` | Additional library paths. `~` is expanded. |
| `strict` | bool | `false` | Promote warnings to errors. Also settable via `--strict`. |
| `suppress_diagnostics` | list[string] | `[]` | Diagnostic codes to silence (e.g., `["W001", "W005"]`). |
| `default_timezone` | string | — | Default timezone for provenance date handling. |
| `priority.elements` | string | `"ancestor"` | Merge priority for elements: `"ancestor"` or `"descendant"`. |
| `priority.definitions` | string | `"descendant"` | Merge priority for definitions: `"ancestor"` or `"descendant"`. |
| `validation_rules` | list[mapping] | `[]` | User-defined validation rules. See [Validation Reference](validation.md#user-defined-validation-rules). |

## Config Merging

When multiple config sources are found, they are merged left to right
(walk-backwards results first, then user config, then system config):

| Field | Merge Strategy |
|-------|----------------|
| `libraries` | Concatenated. Walk-backwards paths come first, then user, then system. |
| `strict` | OR'd. If any source sets `strict: true`, the result is `true`. |
| `suppress_diagnostics` | Unioned. Duplicates across sources are removed. |
| `validation_rules` | Concatenated in discovery order. |

## CLI Overrides

Command-line flags take precedence over discovered configuration:

| Flag | Effect |
|------|--------|
| `--config <path>` | Load specific config file (skip discovery). |
| `--no-config` | Skip all config files entirely. |
| `-c key=value` | Inline config override (repeatable). |
| `--library PATH` | Append a library path (repeatable). Added after all discovered libraries. |
| `--strict` | Enable strict mode regardless of config file settings. |

### Examples

Use a specific config file and ignore discovery:

```sh
gvp validate --config ./my-config.yaml
```

Run with no configuration at all:

```sh
gvp validate --no-config
```

Add an extra library path without changing config files:

```sh
gvp validate --library /tmp/experimental-gvps
```
