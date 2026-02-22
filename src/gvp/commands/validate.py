"""Validate command: check catalog for errors and warnings."""

from __future__ import annotations

import re

from gvp.model import Catalog


def validate_catalog(catalog: Catalog) -> tuple[list[str], list[str]]:
    """Validate the catalog. Returns (errors, warnings)."""
    errors: list[str] = []
    warnings: list[str] = []

    # Check maps_to references
    for qid, elem in catalog.elements.items():
        for ref in elem.maps_to:
            if ref not in catalog.elements:
                errors.append(f"{qid}: broken maps_to reference '{ref}'")

    # Check tags exist
    for qid, elem in catalog.elements.items():
        for tag in elem.tags:
            if tag not in catalog.tags:
                errors.append(f"{qid}: undefined tag '{tag}'")

    # Check ID sequences (no gaps per category per document)
    for doc in catalog.documents.values():
        by_category: dict[str, list[str]] = {}
        for elem in doc.elements:
            by_category.setdefault(elem.category, []).append(elem.id)

        for category, ids in by_category.items():
            nums: list[tuple[int, str]] = []
            for eid in ids:
                match = re.search(r"(\d+)$", eid)
                if match:
                    nums.append((int(match.group(1)), eid))
            nums.sort()
            for i, (num, eid) in enumerate(nums):
                expected = i + 1
                if num != expected:
                    prefix = re.sub(r"\d+$", "", eid)
                    errors.append(
                        f"{doc.name}: ID gap in {category} — "
                        f"expected {prefix}{expected}, found {eid}"
                    )
                    break

    # Check inherits chains
    for doc in catalog.documents.values():
        if doc.inherits and doc.inherits not in catalog.documents:
            errors.append(f"{doc.name}: broken inherits reference '{doc.inherits}'")

    # Check for circular inheritance
    for doc in catalog.documents.values():
        visited: set[str] = set()
        current = doc
        while current.inherits:
            if current.name in visited:
                errors.append(f"{doc.name}: circular inheritance detected")
                break
            visited.add(current.name)
            parent = catalog.documents.get(current.inherits)
            if parent is None:
                break
            current = parent

    # Warn on empty documents
    for doc in catalog.documents.values():
        if not doc.elements:
            warnings.append(f"W001: empty document '{doc.name}' ({doc.path})")

    return errors, warnings
