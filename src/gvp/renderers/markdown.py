"""Render catalog to markdown."""

from __future__ import annotations

from pathlib import Path

from gvp.model import Catalog, Document, Element
from gvp.schema import ElementCategoryDef


def _render_element(elem: Element, ecat_def: ElementCategoryDef | None = None) -> str:
    lines = [f"### {elem.id}: {elem.name}"]
    if elem.status != "active":
        lines.append(f"\n**Status:** {elem.status}")
    if elem.tags:
        lines.append(f"\n**Tags:** {', '.join(elem.tags)}")
    if elem.maps_to:
        lines.append(f"\n**Maps to:** {', '.join(elem.maps_to)}")
    if elem.priority is not None:
        lines.append(f"\n**Priority:** {elem.priority}")

    # Primary field from schema
    if ecat_def:
        pf = ecat_def.primary_field
        val = getattr(elem, pf, None) or elem.fields.get(pf)
        if val and isinstance(val, str):
            lines.append(f"\n{val.strip()}")
    else:
        # Fallback: try common fields
        for key in ("statement", "rationale", "impact", "description"):
            val = elem.fields.get(key)
            if val:
                lines.append(f"\n{val.strip()}")
                break

    # Progress (milestones)
    progress = getattr(elem, "progress", None) or elem.fields.get("progress")
    if progress:
        lines.append(f"\n**Progress:** {progress}")

    # Considered alternatives (design_choices)
    considered = getattr(elem, "considered", None) or elem.fields.get("considered")
    if isinstance(considered, dict) and considered:
        lines.append("\n**Considered alternatives:**")
        for alt_name, alt_def in considered.items():
            if not isinstance(alt_def, dict):
                continue
            display_name = alt_name.replace("_", " ").title()
            desc = alt_def.get("description", "")
            rationale = alt_def.get("rationale", "")
            parts = []
            if desc:
                parts.append(desc.strip())
            if rationale:
                parts.append(f"*Rejected: {rationale.strip()}*")
            line = f"- **{display_name}**"
            if parts:
                line += " — " + " ".join(parts)
            lines.append(line)
    return "\n".join(lines)


def _render_document(
    doc: Document, catalog: Catalog, include_deprecated: bool = False
) -> str:
    lines = [f"# {doc.name}"]
    if doc.scope_label:
        lines.append(f"\n**Scope:** {doc.scope_label}")
    if doc.inherits:
        lines.append(f"\n**Inherits:** {', '.join(doc.inherits)}")

    registry = catalog.element_category_registry
    if registry:
        categories = list(registry.categories.items())
    else:
        categories = []

    for ecat_name, ecat_def in categories:
        elems = [
            e
            for e in doc.elements
            if e.category == ecat_name
            and (include_deprecated or e.status == "active")
        ]
        if not elems:
            continue
        lines.append(f"\n## {ecat_def.resolved_display_label()}\n")
        for elem in elems:
            lines.append(_render_element(elem, ecat_def))
            lines.append("")
    return "\n".join(lines)


def render_markdown(
    catalog: Catalog,
    output_dir: Path | None = None,
    include_deprecated: bool = False,
) -> str:
    sections: list[str] = []
    for doc in catalog.documents.values():
        md = _render_document(doc, catalog, include_deprecated=include_deprecated)
        sections.append(md)
        if output_dir:
            output_dir.mkdir(parents=True, exist_ok=True)
            out_file = output_dir / f"{doc.name}.md"
            out_file.write_text(md + "\n")
    return "\n\n---\n\n".join(sections)
