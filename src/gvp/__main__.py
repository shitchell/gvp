"""CLI entry point for gvp."""

import argparse
import sys

from gvp import __version__


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="gvp",
        description="CLI utility for GVP (Goals, Values, and Principles) documents",
    )
    parser.add_argument("--version", action="version", version=f"%(prog)s {__version__}")
    parser.add_argument("--strict", action="store_true", help="promote warnings to errors")
    parser.add_argument("--config", type=str, help="override config discovery")
    parser.add_argument("--verbose", action="store_true", help="show loaded libraries/documents")

    subparsers = parser.add_subparsers(dest="command")

    args = parser.parse_args(argv)
    if not args.command:
        parser.print_help()
        return 0
    return 0


if __name__ == "__main__":
    sys.exit(main())
