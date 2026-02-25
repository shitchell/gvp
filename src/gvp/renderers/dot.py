"""Render catalog to DOT (graphviz) format."""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

from gvp.model import Catalog


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

        registry = catalog.category_registry
        for elem in doc.elements:
            if not include_deprecated and elem.status != "active":
                continue
            nid = _node_id(str(elem))
            cat_def = registry.categories.get(elem.category) if registry else None
            color = cat_def.color if cat_def else "#CCCCCC"
            label = f"{elem.id}\\n{elem.name}"
            lines.append(
                f'    {nid} [label="{label}", fillcolor="{color}", '
                f'fontcolor="white"];'
            )

        lines.append("  }")
        lines.append("")

    # Enforce vertical ordering by grouping categories into rank tiers.
    # With rankdir=BT, rank=same keeps each tier on one horizontal band.
    registry = catalog.category_registry
    if registry:
        tiers: dict[int, list[str]] = {}
        for cat_name, cat_def in registry.categories.items():
            if cat_def.tier is not None:
                tiers.setdefault(cat_def.tier, []).append(cat_name)
        for tier_num in sorted(tiers):
            tier_cats = tuple(tiers[tier_num])
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
