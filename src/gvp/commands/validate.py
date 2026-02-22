"""Validate command: check catalog for errors and warnings."""

from __future__ import annotations

import re

from gvp.model import Catalog


# Categories that are roots (no mapping required)
_ROOT_CATEGORIES = {"goal", "value", "constraint"}

# Mapping rules: category -> (required_categories, alternative_categories)
# Element passes if maps_to targets include >= 1 of EACH required category,
# OR maps_to targets include >= 1 of ANY alternative category.
_MAPPING_RULES: dict[str, tuple[set[str], set[str]]] = {
    "milestone":           ({"goal", "value"}, set()),
    "principle":           ({"goal", "value"}, set()),
    "rule":                ({"goal", "value"}, set()),
    "design_choice":       ({"goal", "value"}, set()),
    "heuristic":           ({"goal", "value"}, {"principle"}),
    "implementation_rule": ({"goal", "value"}, {"design_choice"}),
    "coding_principle":    ({"goal", "value"}, {"principle", "design_choice"}),
}


def _validate_mappings(catalog: Catalog) -> list[str]:
    """Check category-specific traceability rules."""
    errors: list[str] = []

    for qid, elem in catalog.elements.items():
        if elem.category in _ROOT_CATEGORIES:
            continue
        if elem.status in ("deprecated", "rejected"):
            continue

        rule = _MAPPING_RULES.get(elem.category)
        if rule is None:
            continue

        required_cats, alt_cats = rule

        # Resolve maps_to targets to their categories
        target_categories: set[str] = set()
        for ref in elem.maps_to:
            target = catalog.elements.get(ref)
            if target is not None:
                target_categories.add(target.category)

        # Check alternative path first
        if alt_cats and (alt_cats & target_categories):
            continue

        # Check required categories
        missing = required_cats - target_categories
        if missing:
            missing_str = " and ".join(sorted(missing))
            errors.append(
                f"{qid}: traceability — must map to at least one {missing_str}"
            )

    return errors


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

    # Check category-specific mapping rules
    errors.extend(_validate_mappings(catalog))

    # Warn on empty documents
    for doc in catalog.documents.values():
        if not doc.elements:
            warnings.append(f"W001: empty document '{doc.name}' ({doc.path})")

    return errors, warnings
