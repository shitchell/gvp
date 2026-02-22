"""Validate command: check catalog for errors and warnings."""

from __future__ import annotations

import re

from gvp.config import GVPConfig
from gvp.model import Catalog


# Categories that are roots (no mapping required)
_ROOT_CATEGORIES = {"goal", "value", "constraint"}

# Mapping rules: category -> (required_categories, alternative_categories)
# Element passes if maps_to targets include >= 1 of EACH required category,
# OR maps_to targets include >= 1 of ANY alternative category.
_MAPPING_RULES: dict[str, tuple[set[str], set[str]]] = {
    "milestone": ({"goal", "value"}, set()),
    "principle": ({"goal", "value"}, set()),
    "rule": ({"goal", "value"}, set()),
    "design_choice": ({"goal", "value"}, set()),
    "heuristic": ({"goal", "value"}, {"principle"}),
    "implementation_rule": ({"goal", "value"}, {"design_choice"}),
    "coding_principle": ({"goal", "value"}, {"principle", "design_choice"}),
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


def _validate_semantic(catalog: Catalog) -> list[str]:
    """Check semantic warnings (tier 2)."""
    warnings: list[str] = []

    for qid, elem in catalog.elements.items():
        if elem.status in ("deprecated", "rejected"):
            continue
        if elem.category in _ROOT_CATEGORIES:
            continue

        # W004: empty maps_to on element that should have mappings
        if not elem.maps_to:
            warnings.append(f"W004: {qid} ({elem.category}) has no maps_to references")
            continue  # skip W005 if maps_to is empty

        # W005: all maps_to targets are in the same document
        target_docs = set()
        for ref in elem.maps_to:
            target = catalog.elements.get(ref)
            if target is not None:
                target_docs.add(target.document.name)
        if target_docs and target_docs == {elem.document.name}:
            warnings.append(f"W005: {qid} maps only to elements in its own document")

    return warnings


def _latest_date(entries: list[dict], date_key: str = "date") -> str | None:
    """Get the most recent date string from a list of dicts."""
    dates = [e.get(date_key, "") for e in entries if isinstance(e, dict) and e.get(date_key)]
    return max(dates) if dates else None


def _validate_staleness(catalog: Catalog) -> list[str]:
    """W006: element's reviewed_by is older than an ancestor's updated_by."""
    warnings: list[str] = []

    for qid, elem in catalog.elements.items():
        if elem.status in ("deprecated", "rejected"):
            continue

        # Get ancestors via maps_to graph
        ancestors = catalog.ancestors(elem)
        if not ancestors:
            continue

        # Find latest updated_by date across all ancestors
        latest_ancestor_update = None
        stale_ancestor_qid = None
        for ancestor in ancestors:
            ancestor_date = _latest_date(ancestor.updated_by)
            if ancestor_date and (latest_ancestor_update is None or ancestor_date > latest_ancestor_update):
                latest_ancestor_update = ancestor_date
                stale_ancestor_qid = str(ancestor)

        if latest_ancestor_update is None:
            continue  # no ancestors have been updated

        # Compare against element's latest reviewed_by date
        latest_review = _latest_date(elem.reviewed_by)
        if latest_review is None or latest_review < latest_ancestor_update:
            warnings.append(
                f"W006: {qid} may need review — ancestor {stale_ancestor_qid} "
                f"was updated on {latest_ancestor_update}"
            )

    return warnings


def _validate_user_rules(
    catalog: Catalog, rules: list[dict]
) -> tuple[list[str], list[str]]:
    """Evaluate user-defined validation rules from config.yaml."""
    errors: list[str] = []
    warnings: list[str] = []

    for rule_def in rules:
        name = rule_def.get("name", "unnamed rule")
        match = rule_def.get("match", {})
        require = rule_def.get("require", {})
        level = rule_def.get("level", "error")

        for qid, elem in catalog.elements.items():
            # Apply match filters
            if "category" in match and elem.category != match["category"]:
                continue
            if "scope" in match and elem.document.scope_label != match["scope"]:
                continue
            if "tag" in match and match["tag"] not in elem.tags:
                continue
            if "status" in match and elem.status != match["status"]:
                continue

            # Apply require checks
            violated = False

            if "min_tags" in require:
                if len(elem.tags) < require["min_tags"]:
                    violated = True

            if "has_field" in require:
                field_name = require["has_field"]
                if not elem.fields.get(field_name):
                    violated = True

            if "maps_to_category" in require:
                needed = require["maps_to_category"]
                if isinstance(needed, str):
                    needed = [needed]
                target_cats = set()
                for ref in elem.maps_to:
                    target = catalog.elements.get(ref)
                    if target is not None:
                        target_cats.add(target.category)
                if not (set(needed) & target_cats):
                    violated = True

            if "maps_to_scope" in require:
                needed_scopes = require["maps_to_scope"]
                if isinstance(needed_scopes, str):
                    needed_scopes = [needed_scopes]
                target_scopes = set()
                for ref in elem.maps_to:
                    target = catalog.elements.get(ref)
                    if target is not None and target.document.scope_label:
                        target_scopes.add(target.document.scope_label)
                if not (set(needed_scopes) & target_scopes):
                    violated = True

            if violated:
                msg = f"{qid}: {name}"
                if level == "warning":
                    warnings.append(msg)
                else:
                    errors.append(msg)

    return errors, warnings


def validate_catalog(
    catalog: Catalog, config: GVPConfig | None = None
) -> tuple[list[str], list[str]]:
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

    # Check semantic warnings
    warnings.extend(_validate_semantic(catalog))

    # Check staleness
    warnings.extend(_validate_staleness(catalog))

    # Warn on empty documents
    for doc in catalog.documents.values():
        if not doc.elements:
            warnings.append(f"W001: empty document '{doc.name}' ({doc.path})")

    # Check user-defined rules
    if config is not None and config.validation_rules:
        user_errors, user_warnings = _validate_user_rules(
            catalog, config.validation_rules
        )
        errors.extend(user_errors)
        warnings.extend(user_warnings)

    return errors, warnings
