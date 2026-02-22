"""Trace command: walk the catalog graph from a given element."""

from __future__ import annotations

import json

from gvp.model import Catalog, Element


def trace_element(
    catalog: Catalog,
    element: Element,
    reverse: bool = False,
) -> dict:
    """Build a trace tree from an element.
    Returns: {"element": Element, "children": [...], "seen": bool}
    """
    seen: set[str] = set()

    def _build(elem: Element) -> dict:
        qid = str(elem)
        is_seen = qid in seen
        seen.add(qid)

        children = []
        if not is_seen:
            if reverse:
                targets = [
                    e for e in catalog.elements.values()
                    if qid in e.maps_to
                ]
            else:
                targets = [
                    catalog.elements[ref]
                    for ref in elem.maps_to
                    if ref in catalog.elements
                ]
            children = [_build(t) for t in targets]

        return {"element": elem, "children": children, "seen": is_seen}

    return _build(element)


def format_trace_tree(tree: dict, fmt: str = "text") -> str:
    if fmt == "json":
        return json.dumps(_tree_to_json(tree), indent=2)
    return _tree_to_text(tree)


def _tree_to_json(tree: dict) -> dict:
    elem = tree["element"]
    result = {
        "element": str(elem),
        "name": elem.name,
        "category": elem.category,
        "tags": elem.tags,
    }
    if "statement" in elem.fields:
        result["statement"] = elem.fields["statement"]
    if tree["seen"]:
        result["seen_above"] = True
    if tree["children"]:
        result["children"] = [_tree_to_json(c) for c in tree["children"]]
    return result


def _tree_to_text(tree: dict, prefix: str = "", is_last: bool = True) -> str:
    lines: list[str] = []
    elem = tree["element"]

    if prefix:
        connector = "\u2514\u2500 " if is_last else "\u251c\u2500 "
    else:
        connector = ""

    line = f"{prefix}{connector}{elem}: {elem.name}"
    if tree["seen"]:
        line += "  (\u2191 see above)"
    lines.append(line)

    if not tree["seen"] and "statement" in elem.fields:
        stmt = elem.fields["statement"].strip()
        if len(stmt) > 120:
            stmt = stmt[:117] + "..."
        child_prefix = prefix + ("   " if is_last else "\u2502  ")
        if prefix:
            lines.append(f"{child_prefix}{stmt}")
        else:
            lines.append(f"   {stmt}")

    children = tree["children"]
    for i, child in enumerate(children):
        child_is_last = i == len(children) - 1
        child_prefix = prefix + ("   " if is_last else "\u2502  ")
        if not prefix:
            child_prefix = "   "
        lines.append(_tree_to_text(child, child_prefix, child_is_last))

    return "\n".join(lines)
