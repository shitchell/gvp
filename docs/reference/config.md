# Configuration Reference

GVP uses a layered configuration system. Config files are discovered
automatically, merged in a defined order, and can be overridden from the
command line.

## Config Discovery

GVP searches for configuration in three places, in order:

### 1. Walk backwards from the current directory

Starting from the current working directory and moving up toward the
filesystem root, GVP checks each directory for:

- **`.gvp/` directory** -- if found, the directory itself is added as a
  library path. If it contains a `libraries/` subdirectory, that is also
  added. If it contains `config.yaml`, the file is parsed.
- **`.gvp.yaml` file** -- if found, the file's parent directory is added
  as a library path (the file is treated as a standalone GVP document).

All matches are collected (closest to CWD first, root last).

### 2. User config (`~/.config/gvp/`)

If this directory exists, GVP checks for:

- `~/.config/gvp/libraries/` -- added as a library path if present.
- `~/.config/gvp/config.yaml` -- parsed if present.

### 3. System config (`/etc/gvp/`)

Same structure as user config:

- `/etc/gvp/libraries/` -- added as a library path if present.
- `/etc/gvp/config.yaml` -- parsed if present.

## `config.yaml` Format

```yaml
# Additional library paths (~ is expanded)
libraries:
  - ~/my-gvps/personal
  - /shared/org-gvps

# Promote all warnings to errors
strict: false

# Silence specific warning codes
suppress_warnings:
  - W001
  - W005

# User-defined validation rules
validation:
  rules:
    - name: "Rule description"
      match:
        category: design_choice
      require:
        maps_to_category: heuristic
      level: warning
```

## Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `libraries` | list[string] | `[]` | Additional library paths. `~` is expanded. |
| `strict` | bool | `false` | Promote warnings to errors. Also settable via `--strict`. |
| `suppress_warnings` | list[string] | `[]` | Warning codes to silence (e.g., `["W001", "W005"]`). |
| `validation.rules` | list[mapping] | `[]` | User-defined validation rules. See [Validation Reference](validation.md#user-defined-validation-rules). |

## Config Merging

When multiple config sources are found, they are merged left to right
(walk-backwards results first, then user config, then system config):

| Field | Merge Strategy |
|-------|----------------|
| `libraries` | Concatenated. Walk-backwards paths come first, then user, then system. |
| `strict` | OR'd. If any source sets `strict: true`, the result is `true`. |
| `suppress_warnings` | Unioned. Duplicates across sources are removed. |
| `validation_rules` | Concatenated in discovery order. |

## CLI Overrides

Command-line flags take precedence over discovered configuration:

| Flag | Effect |
|------|--------|
| `--config PATH` | Use only this config file (skip discovery entirely). Use `--config /dev/null` to disable all config. |
| `--library PATH` | Append a library path (repeatable). Added after all discovered libraries. |
| `--strict` | Enable strict mode regardless of config file settings. |

### Examples

Use a specific config file and ignore discovery:

```sh
gvp validate --config ./my-config.yaml
```

Run with no configuration at all:

```sh
gvp validate --config /dev/null
```

Add an extra library path without changing config files:

```sh
gvp validate --library /tmp/experimental-gvps
```
