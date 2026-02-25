"""Render catalog to markdown."""

from __future__ import annotations

from pathlib import Path

from gvp.model import Catalog, Document, Element

CATEGORY_ORDER = [
    ("value", "Values"),
    ("principle", "Principles"),
    ("heuristic", "Heuristics"),
    ("rule", "Rules"),
    ("goal", "Goals"),
    ("milestone", "Milestones"),
    ("design_choice", "Design Choices"),
    ("constraint", "Constraints"),
    ("implementation_rule", "Implementation Rules"),
    ("coding_principle", "Coding Principles"),
]


def _render_element(elem: Element) -> str:
    lines = [f"### {elem.id}: {elem.name}"]
    if elem.status != "active":
        lines.append(f"\n**Status:** {elem.status}")
    if elem.tags:
        lines.append(f"\n**Tags:** {', '.join(elem.tags)}")
    if elem.maps_to:
        lines.append(f"\n**Maps to:** {', '.join(elem.maps_to)}")
    if elem.priority is not None:
        lines.append(f"\n**Priority:** {elem.priority}")
    for key in ("statement", "rationale", "impact", "description"):
        if key in elem.fields:
            lines.append(f"\n{elem.fields[key].strip()}")
            break
    if "progress" in elem.fields:
        lines.append(f"\n**Progress:** {elem.fields['progress']}")
    considered = elem.fields.get("considered")
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


def _render_document(doc: Document, include_deprecated: bool = False) -> str:
    lines = [f"# {doc.name}"]
    if doc.scope_label:
        lines.append(f"\n**Scope:** {doc.scope_label}")
    if doc.inherits:
        lines.append(f"\n**Inherits:** {', '.join(doc.inherits)}")
    for category, label in CATEGORY_ORDER:
        elems = [
            e
            for e in doc.elements
            if e.category == category and (include_deprecated or e.status == "active")
        ]
        if not elems:
            continue
        lines.append(f"\n## {label}\n")
        for elem in elems:
            lines.append(_render_element(elem))
            lines.append("")
    return "\n".join(lines)


def render_markdown(
    catalog: Catalog,
    output_dir: Path | None = None,
    include_deprecated: bool = False,
) -> str:
    sections: list[str] = []
    for doc in catalog.documents.values():
        md = _render_document(doc, include_deprecated=include_deprecated)
        sections.append(md)
        if output_dir:
            output_dir.mkdir(parents=True, exist_ok=True)
            out_file = output_dir / f"{doc.name}.md"
            out_file.write_text(md + "\n")
    return "\n\n---\n\n".join(sections)
