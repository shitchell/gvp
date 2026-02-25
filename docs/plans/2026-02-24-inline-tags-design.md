# Inline Tag Definitions Design

## Problem

`tags.yaml` is a library-level registry file that defines valid tag names. It lives alongside element documents but is structurally different — it defines vocabulary, not elements. The loader special-cases it via `SKIP_FILES` and a dedicated `_load_tags` function. This creates friction: the file must exist at the library root, it can't be co-located with the documents that use the tags, and single-file libraries can't define their own tags.

More broadly, `tags.yaml` and the future `schema.yaml` (for custom element categories) are both library-level definitions. They should follow the same pattern.

## Design

### `meta.definitions.tags`

Any document can define tags in its `meta` block under `definitions.tags`:

```yaml
meta:
  name: gvp
  definitions:
    tags:
      domains:
        framework:
          description: Core GVP framework design
      concerns:
        alignment:
          description: Ensuring decisions trace back to goals
```

The `definitions` key is a namespace for library-level metadata. Future additions (e.g., `definitions.elements` for custom categories) follow the same pattern.

### Dedicated files become convention, not special cases

A file like `tags.yaml` is just a document with a `meta` block and `definitions.tags` — no elements. The loader treats it identically to any other document. `SKIP_FILES` no longer includes `tags.yaml`.

```yaml
# tags.yaml — a document that only defines tags
meta:
  name: tags
  definitions:
    tags:
      domains:
        framework:
          description: Core GVP framework design
```

### Tag accumulation

Tags from all documents in a library are accumulated into the catalog. Within a library, first-wins: if two documents define the same tag name, the first loaded (sorted file path order) is kept.

### W007: Duplicate tag definition

Validation warns when the same tag name is defined in multiple documents within a library. The first definition is kept (first-wins at load time), but the duplicate is flagged.

### Migration

Existing `tags.yaml` files need a `meta` block and their content moved under `meta.definitions.tags`:

```yaml
# Before (old format)
domains:
  framework:
    description: Core GVP framework design
concerns:
  alignment:
    description: Ensuring decisions trace back to goals

# After (new format)
meta:
  name: tags
  definitions:
    tags:
      domains:
        framework:
          description: Core GVP framework design
      concerns:
        alignment:
          description: Ensuring decisions trace back to goals
```

## Code Changes

### loader.py

1. **Remove `tags.yaml` from `SKIP_FILES`** (keep `schema.yaml` for now — future work)
2. **Remove `_load_tags` function**
3. **In `load_document`**: parse `meta.definitions.tags` if present, using the same domains/concerns structure as the old `_load_tags`. Store on the Document object.
4. **Add `tags` field to Document model** (model.py): `tags: dict[str, dict] = field(default_factory=dict)`
5. **In `load_library`**: accumulate `doc.tags` into the library tag set (first-wins, same as current cross-library behavior). Remove the separate `_load_tags` call.
6. **In `load_catalog`**: tag merging from library-level stays the same (catalog.tags, first-wins).

### validate.py

7. **Add W007**: when building the catalog, track which document defined each tag. If a tag is defined in multiple documents within the same library, emit `W007: duplicate tag definition '{tag}' in {doc2.name}, already defined in {doc1.name}`.

### Migrate files

8. **`.gvp/tags.yaml`**: add meta block, move content under `meta.definitions.tags`
9. **`examples/software-project/tags.yaml`**: same migration
10. **`examples/small-business/`**: has no tags.yaml — no change needed

### Update docs

11. **`docs/reference/schema.md`**: document `meta.definitions.tags` format, note `definitions.elements` as future
12. **`docs/reference/validation.md`**: add W007

## Future

- `meta.definitions.elements` — custom element categories with primary_field, id_prefix, mapping_rules (currently tracked as `schema.yaml` feature)
- Remove `schema.yaml` from `SKIP_FILES` when that feature is implemented
- Rename `.gvp/libraries/` to `.gvp/library/` (singular) — separate change
