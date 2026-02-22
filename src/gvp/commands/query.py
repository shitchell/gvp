"""Query command: filter elements from the catalog."""

from __future__ import annotations

from gvp.model import Catalog, Element


def query_catalog(
    catalog: Catalog,
    tags: list[str] | None = None,
    categories: list[str] | None = None,
    document: str | None = None,
    status: str | None = None,
) -> list[Element]:
    """Filter elements from the catalog. All filters are AND (intersection)."""
    results = list(catalog.elements.values())

    if tags:
        results = [e for e in results if all(t in e.tags for t in tags)]
    if categories:
        results = [e for e in results if e.category in categories]
    if document:
        results = [e for e in results if e.document.name == document]
    if status:
        results = [e for e in results if e.status == status]

    return results
