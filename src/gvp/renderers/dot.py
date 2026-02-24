"""Render catalog to DOT (graphviz) format."""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

from gvp.model import Catalog

CATEGORY_COLORS = {
    "value": "#4A90D9",
    "principle": "#7B68EE",
    "heuristic": "#50C878",
    "rule": "#DC143C",
    "goal": "#FFD700",
    "milestone": "#FFA500",
    "design_choice": "#20B2AA",
    "constraint": "#A9A9A9",
    "implementation_rule": "#CD5C5C",
    "coding_principle": "#9370DB",
}


def _node_id(qualified_id: str) -> str:
    return qualified_id.replace(":", "__").replace("-", "_")


def render_dot(
    catalog: Catalog,
    output_dir: Path | None = None,
    include_deprecated: bool = False,
) -> str:
    lines = [
        "digraph gvp {",
        "  rankdir=BT;",
        '  node [shape=box, style="rounded,filled", fontname="sans-serif"];',
        '  edge [color="#666666"];',
        "",
    ]

    for doc in catalog.documents.values():
        lines.append(f"  subgraph cluster_{_node_id(doc.name)} {{")
        lines.append(f'    label="{doc.name}";')
        lines.append('    style="dashed";')
        lines.append(f'    color="#999999";')

        for elem in doc.elements:
            if not include_deprecated and elem.status != "active":
                continue
            nid = _node_id(str(elem))
            color = CATEGORY_COLORS.get(elem.category, "#CCCCCC")
            label = f"{elem.id}\\n{elem.name}"
            lines.append(
                f'    {nid} [label="{label}", fillcolor="{color}", '
                f'fontcolor="white"];'
            )

        lines.append("  }")
        lines.append("")

    # Enforce vertical ordering by grouping categories into rank tiers.
    # With rankdir=BT, rank=same keeps each tier on one horizontal band.
    tier_order = [
        ("goal",),
        ("value",),
        ("principle", "rule"),
        ("heuristic",),
        ("design_choice",),
    ]
    for tier_cats in tier_order:
        tier_nodes = [
            _node_id(qid)
            for qid, elem in catalog.elements.items()
            if (include_deprecated or elem.status == "active")
            and elem.category in tier_cats
        ]
        if tier_nodes:
            lines.append("  {rank=same; " + "; ".join(tier_nodes) + ";}")
    lines.append("")

    for qid, elem in catalog.elements.items():
        if not include_deprecated and elem.status != "active":
            continue
        src = _node_id(qid)
        for ref in elem.maps_to:
            if ref in catalog.elements:
                tgt = _node_id(ref)
                lines.append(f"  {src} -> {tgt};")

    lines.append("}")

    result = "\n".join(lines)

    if output_dir:
        output_dir.mkdir(parents=True, exist_ok=True)
        (output_dir / "gvp.dot").write_text(result)

    return result


def render_png(
    dot_source: str,
    output_dir: Path | None = None,
) -> bytes:
    """Render DOT source to PNG bytes via graphviz ``dot`` command.

    Returns the raw PNG data. If *output_dir* is given, also writes
    ``gvp.png`` into that directory.
    """
    dot_bin = shutil.which("dot")
    if dot_bin is None:
        raise RuntimeError(
            "graphviz 'dot' command not found. "
            "Install graphviz (e.g. apt install graphviz) to use PNG output."
        )

    proc = subprocess.run(
        [dot_bin, "-Tpng"],
        input=dot_source.encode(),
        capture_output=True,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"dot failed: {proc.stderr.decode()}")

    png_data = proc.stdout

    if output_dir:
        output_dir.mkdir(parents=True, exist_ok=True)
        (output_dir / "gvp.png").write_bytes(png_data)

    return png_data
