"""CLI entry point for gvp."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from gvp import __version__
from gvp.config import GVPConfig, discover_config
from gvp.loader import load_catalog


def _build_config(args: argparse.Namespace) -> GVPConfig:
    if args.config == "/dev/null":
        cfg = GVPConfig()
    elif args.config:
        from gvp.config import _parse_config_yaml
        cfg = _parse_config_yaml(Path(args.config))
    else:
        cfg = discover_config()

    cfg.strict = args.strict or cfg.strict

    if hasattr(args, "library") and args.library:
        for lib in args.library:
            cfg.libraries.append(Path(lib))

    return cfg


def _add_library_arg(parser: argparse.ArgumentParser) -> None:
    parser.add_argument(
        "--library", action="append", default=[],
        help="additional library path (repeatable)",
    )


def cmd_validate(args: argparse.Namespace) -> int:
    cfg = _build_config(args)
    catalog = load_catalog(cfg)

    from gvp.commands.validate import validate_catalog
    errors, warnings = validate_catalog(catalog)

    for w in warnings:
        if w.split(":")[0] not in cfg.suppress_warnings:
            print(w, file=sys.stderr)
            if cfg.strict:
                errors.append(w)

    for e in errors:
        print(f"ERROR: {e}", file=sys.stderr)

    if not errors:
        print("OK — no syntax errors found, use `gvp render` to review semantic coherence")
    return 1 if errors else 0


def cmd_query(args: argparse.Namespace) -> int:
    cfg = _build_config(args)
    catalog = load_catalog(cfg)

    from gvp.commands.query import query_catalog
    results = query_catalog(
        catalog,
        tags=args.tag or None,
        categories=[args.category] if args.category else None,
        document=args.document,
        status=args.status,
    )

    if args.format == "json":
        output = [
            {"id": str(e), "name": e.name, "category": e.category, "tags": e.tags}
            for e in results
        ]
        print(json.dumps(output, indent=2))
    else:
        if not results:
            print("No matching elements.")
            return 0
        fmt = "{:<25} {:<15} {:<30} {}"
        print(fmt.format("ID", "CATEGORY", "NAME", "TAGS"))
        print("-" * 90)
        for e in results:
            print(fmt.format(str(e), e.category, e.name, ", ".join(e.tags)))

    return 0


def cmd_trace(args: argparse.Namespace) -> int:
    cfg = _build_config(args)
    catalog = load_catalog(cfg)

    elem = catalog.elements.get(args.element)
    if elem is None:
        print(f"ERROR: element '{args.element}' not found", file=sys.stderr)
        return 1

    from gvp.commands.trace import trace_element, format_trace_tree

    if args.maps_to:
        descendants = sorted(catalog.descendants(elem), key=str)
        if not descendants:
            print(f"No elements map to '{args.element}'.", file=sys.stderr)
            return 0
        if args.format == "json":
            import json as _json
            trees = []
            for desc in descendants:
                tree = trace_element(catalog, desc, reverse=False)
                trees.append(_json.loads(format_trace_tree(tree, fmt="json")))
            print(_json.dumps(trees, indent=2))
        else:
            parts = []
            for desc in descendants:
                tree = trace_element(catalog, desc, reverse=False)
                parts.append(format_trace_tree(tree, fmt="text"))
            print(f"\n\n".join(parts))
        return 0

    tree = trace_element(catalog, elem, reverse=args.reverse)
    output = format_trace_tree(tree, fmt=args.format)
    print(output)
    return 0


def cmd_render(args: argparse.Namespace) -> int:
    cfg = _build_config(args)
    catalog = load_catalog(cfg)

    output_dir = Path(args.output) if args.output else Path("generated")
    include_deprecated = args.include_deprecated
    to_stdout = args.stdout

    all_formats = {"markdown", "csv", "sqlite", "dot", "png"}
    formats = set(args.format)
    if "all" in formats:
        formats = all_formats
    unknown = formats - all_formats
    if unknown:
        print(f"ERROR: unknown format(s): {', '.join(sorted(unknown))}", file=sys.stderr)
        return 1

    if "markdown" in formats:
        from gvp.renderers.markdown import render_markdown
        result = render_markdown(
            catalog,
            output_dir=output_dir if not to_stdout else None,
            include_deprecated=include_deprecated,
        )
        if to_stdout:
            print(result)

    if "csv" in formats:
        from gvp.renderers.csv import render_csv
        result = render_csv(
            catalog,
            output_dir=output_dir if not to_stdout else None,
            include_deprecated=include_deprecated,
        )
        if to_stdout:
            print(result)

    if "sqlite" in formats:
        from gvp.renderers.sqlite import render_sqlite
        db_path = output_dir / "gvp.db"
        render_sqlite(catalog, db_path, include_deprecated=include_deprecated)
        if to_stdout:
            print(f"SQLite database written to {db_path}")

    # dot and png share the same DOT source — generate it once
    need_dot = formats & {"dot", "png"}
    if need_dot:
        from gvp.renderers.dot import render_dot
        dot_source = render_dot(
            catalog,
            output_dir=output_dir if ("dot" in formats and not to_stdout) else None,
            include_deprecated=include_deprecated,
        )
        if to_stdout and "dot" in formats:
            print(dot_source)

        if "png" in formats:
            from gvp.renderers.dot import render_png
            render_png(
                dot_source,
                output_dir=output_dir if not to_stdout else None,
            )
            if to_stdout:
                print("(PNG binary output not suitable for stdout; use -o to write to file)",
                      file=sys.stderr)

    if not to_stdout:
        print(f"Output written to {output_dir}/")

    return 0


def cmd_add(args: argparse.Namespace) -> int:
    cfg = _build_config(args)
    catalog = load_catalog(cfg)

    no_provenance = getattr(args, "no_provenance", False)

    from gvp.commands.add import add_element, add_via_editor

    fields: dict = {}
    if args.statement:
        fields["statement"] = args.statement
    if args.tags:
        fields["tags"] = args.tags.split(",")
    if args.maps_to:
        fields["maps_to"] = args.maps_to.split(",")

    if args.name and args.statement:
        new_id = add_element(catalog, args.document, args.category, args.name, fields, no_provenance=no_provenance)
        print(f"Added {args.document}:{new_id}")
    elif args.interactive:
        if not args.name:
            args.name = input("Name: ")
        if "statement" not in fields:
            fields["statement"] = input("Statement: ")
        if "tags" not in fields:
            tags_input = input("Tags (comma-separated): ")
            fields["tags"] = [t.strip() for t in tags_input.split(",") if t.strip()]
        if "maps_to" not in fields:
            maps_input = input("Maps to (comma-separated qualified IDs): ")
            fields["maps_to"] = [m.strip() for m in maps_input.split(",") if m.strip()]
        new_id = add_element(catalog, args.document, args.category, args.name, fields, no_provenance=no_provenance)
        print(f"Added {args.document}:{new_id}")
    else:
        prefill = {}
        if args.name:
            prefill["name"] = args.name
        prefill.update(fields)
        new_id = add_via_editor(catalog, args.document, args.category, prefill)
        if new_id:
            print(f"Added {args.document}:{new_id}")
        else:
            print("Aborted.")
            return 1

    return 0


def cmd_edit(args: argparse.Namespace) -> int:
    cfg = _build_config(args)
    catalog = load_catalog(cfg)

    no_provenance = getattr(args, "no_provenance", False)

    if args.interactive:
        from gvp.commands.edit import edit_element_interactive
        edit_element_interactive(catalog, args.element, no_provenance=no_provenance)
        print(f"Updated {args.element}")
        return 0

    # Check if any field flags provided
    updates: dict = {}
    if args.name:
        updates["name"] = args.name
    if args.status:
        updates["status"] = args.status
    if args.statement:
        updates["statement"] = args.statement

    if updates:
        # CLI mode
        from gvp.commands.edit import edit_element_inline
        rationale = args.rationale
        if not rationale and not no_provenance:
            rationale = input("Rationale for this change: ")
        edit_element_inline(catalog, args.element, updates, rationale or "", no_provenance=no_provenance)
        print(f"Updated {args.element}")
        return 0

    # Editor mode (no flags, no --interactive)
    from gvp.commands.edit import edit_via_editor
    result = edit_via_editor(catalog, args.element, no_provenance=no_provenance)
    if result:
        print(f"Updated {args.element}")
    else:
        print("No changes made.")
    return 0


def cmd_review(args: argparse.Namespace) -> int:
    cfg = _build_config(args)
    catalog = load_catalog(cfg)

    from gvp.commands.review import find_stale_elements, format_review_display, stamp_review

    if args.element:
        # Single element review
        elem = catalog.elements.get(args.element)
        if elem is None:
            print(f"ERROR: element '{args.element}' not found", file=sys.stderr)
            return 1

        if args.approve:
            stamp_review(catalog, args.element)
            print(f"Reviewed {args.element}")
            return 0

        # Interactive review
        display = format_review_display(catalog, elem)
        print(display)
        print()
        note = input("Review note (or empty to confirm): ").strip()
        stamp_review(catalog, args.element, note=note)
        print(f"Reviewed {args.element}")
        print("Tip: use --approve to skip interactive review")
        return 0

    # List stale elements
    stale = find_stale_elements(catalog)
    if not stale:
        print("No elements need review.")
        return 0

    if args.approve:
        print("ERROR: --approve requires a specific element", file=sys.stderr)
        return 1

    fmt = "{:<25} {:<25} {}"
    print(fmt.format("ELEMENT", "STALE ANCESTOR", "ANCESTOR UPDATED"))
    print("-" * 75)
    for elem, ancestor, ancestor_date in stale:
        print(fmt.format(str(elem), str(ancestor), ancestor_date))

    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="gvp",
        description="CLI utility for GVP (Goals, Values, and Principles) documents",
    )
    parser.add_argument("--version", action="version", version=f"%(prog)s {__version__}")
    parser.add_argument("--strict", action="store_true", help="promote warnings to errors")
    parser.add_argument("--config", type=str, default=None, help="override config path")
    parser.add_argument("--verbose", action="store_true", help="show loaded libraries/documents")

    subparsers = parser.add_subparsers(dest="command")

    # validate
    p_validate = subparsers.add_parser("validate", help="check catalog for errors")
    _add_library_arg(p_validate)

    # query
    p_query = subparsers.add_parser("query", help="filter elements")
    _add_library_arg(p_query)
    p_query.add_argument("--tag", action="append", help="filter by tag (repeatable)")
    p_query.add_argument("--category", help="filter by category")
    p_query.add_argument("--document", help="filter by document name")
    p_query.add_argument("--status", help="filter by status")
    p_query.add_argument("--format", choices=["table", "json"], default="table")

    # trace
    p_trace = subparsers.add_parser("trace", help="trace element mappings")
    _add_library_arg(p_trace)
    p_trace.add_argument("element", help="qualified element ID (e.g., personal:H5)")
    p_trace.add_argument("--reverse", action="store_true", help="show descendants instead of ancestors")
    p_trace.add_argument("--maps-to", action="store_true",
                         help="find all elements that map to the given element and print each trace")
    p_trace.add_argument("--format", choices=["text", "json"], default="text")

    # render
    p_render = subparsers.add_parser("render", help="generate output")
    _add_library_arg(p_render)
    all_formats = ["markdown", "csv", "sqlite", "dot", "png"]
    p_render.add_argument(
        "--format", nargs="+", default=["all"],
        metavar="FMT",
        help=f"output format(s): {', '.join(all_formats)}, all (default: all)",
    )
    p_render.add_argument("-o", "--output", help="output directory")
    p_render.add_argument("--stdout", action="store_true", help="print to stdout instead of files")
    p_render.add_argument("--include-deprecated", action="store_true")

    # add
    p_add = subparsers.add_parser("add", help="add a new element")
    _add_library_arg(p_add)
    p_add.add_argument("category", help="element category (value, principle, etc.)")
    p_add.add_argument("document", help="target document name")
    p_add.add_argument("--name", help="element name")
    p_add.add_argument("--statement", help="element statement")
    p_add.add_argument("--tags", help="comma-separated tags")
    p_add.add_argument("--maps-to", dest="maps_to", help="comma-separated qualified IDs")
    p_add.add_argument("--interactive", action="store_true")

    # edit
    p_edit = subparsers.add_parser("edit", help="modify an existing element")
    _add_library_arg(p_edit)
    p_edit.add_argument("element", help="qualified element ID (e.g., personal:P3)")
    p_edit.add_argument("--name", help="new name")
    p_edit.add_argument("--status", help="new status (active, deprecated, rejected)")
    p_edit.add_argument("--statement", help="new statement")
    p_edit.add_argument("--rationale", help="rationale for the change")
    p_edit.add_argument("--interactive", action="store_true")
    p_edit.add_argument("--no-provenance", action="store_true", help="skip updated_by metadata")

    # add --no-provenance to add subcommand
    p_add.add_argument("--no-provenance", action="store_true", help="skip origin metadata")

    # review
    p_review = subparsers.add_parser("review", help="review elements for staleness")
    _add_library_arg(p_review)
    p_review.add_argument("element", nargs="?", help="qualified element ID to review")
    p_review.add_argument("--approve", action="store_true", help=argparse.SUPPRESS)

    args = parser.parse_args(argv)
    if not args.command:
        parser.print_help()
        return 0

    handlers = {
        "validate": cmd_validate,
        "query": cmd_query,
        "trace": cmd_trace,
        "render": cmd_render,
        "add": cmd_add,
        "edit": cmd_edit,
        "review": cmd_review,
    }
    return handlers[args.command](args)


if __name__ == "__main__":
    sys.exit(main())
