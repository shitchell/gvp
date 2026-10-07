#!/usr/bin/env python3
"""Render an arm's payload from the library it will be delivered beside.

The payload must be the element as the library states it — not a paraphrase,
not a summary. So it is EXTRACTED from the arm's own library copy rather than
typed into this script, and the gate re-extracts and compares. The framing
sentence is a constant shared by every hooked arm, so the only thing that
differs between L1/L2 and L2n is the element block.

usage: render-payload.py <library-dir> <lib-name>:<element-id>
"""
import pathlib
import sys

import yaml

FRAMING = "The project's guiding library states:"

lib = pathlib.Path(sys.argv[1])
want_lib, want_id = sys.argv[2].split(":")

found = []
for path in sorted(lib.rglob("*.yaml")):
    doc = yaml.safe_load(path.read_text())
    if not isinstance(doc, dict):
        continue
    if doc.get("meta", {}).get("name") != want_lib:
        continue
    for key, val in doc.items():
        if not isinstance(val, list):
            continue
        for el in val:
            if isinstance(el, dict) and el.get("id") == want_id:
                found.append(el)

if len(found) != 1:
    sys.exit(f"expected exactly one {want_lib}:{want_id}, found {len(found)}")

el = found[0]
statement = " ".join(str(el["statement"]).split())
print(f"{FRAMING}\n\n{want_lib}:{want_id} — {el['name']}\n{statement}")
