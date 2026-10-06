#!/usr/bin/env python3
"""Gate: a run must not be able to discover which arm it is in.

Descended from trial 3's gate. Trial-4 specifics:

  - FIVE arms, one of which (I-quiet) deliberately edits five elements across
    two files — the declared deviation that constitutes the independent
    variable. The gate asserts that deviation EXACTLY: those five elements,
    those two files, nothing else.

  - The axis is BUTTRESSED (P0002), so the trial-3 "no undeclared voice"
    keyword check is replaced by a STRONG-STEM check with a known expected
    set: in every arm except I-quiet, exactly {CP7, CP10, CP16, R1} match the
    strong typing stems; in I-quiet, exactly none do (the quiet swaps remove
    them, and the inverted CP7 text deliberately contains no strong stem).
    This is checkable because P0002 enumerated the matches up front — the
    lesson of survey defect 4 is that keywords cannot FIND an axis, but they
    can VERIFY a declared closure.

  - TASK.md's "TypeScript on Node" line is axis-adjacent and WHITELISTED: the
    task must be byte-identical to trial 3's (a cross-trial constant), and
    with that one line removed must contain no axis vocabulary.

Every check has a matching mutation in mutation-test.sh; the gate is fallible
too (one false positive per trial so far).

usage: leak-audit.py [experiment-dir]
"""
import hashlib
import json
import os
import pathlib
import re
import shutil
import subprocess
import sys

import yaml

E = (
    pathlib.Path(sys.argv[1]).resolve()
    if len(sys.argv) > 1
    else pathlib.Path(__file__).parent.parent
)

CAIRN = pathlib.Path("/home/guy/.nvm/versions/node/v22.14.0/bin/cairn")
CAIRN_EXPECTED_VERSION = "5.1.0"
REPO_MARKER = "shitchell/gvp"

# single-element arms: arm -> (file, collection, id, name-must-change?)
TARGET = {
    "I-lone": ("code/common.yaml", "principles", "CP7", True),
    # M keeps its name: "Strict typing" still describes a statement that
    # prescribes boundary annotations, typed models, TS and typed bash —
    # same exemption trials 2 and 3 gave their M arms.
    "M-narrowed": ("code/common.yaml", "principles", "CP7", False),
    "N-inverted": ("code/web.yaml", "principles", "WP3", True),
}

# I-quiet: exactly these elements change, in exactly these files.
QUIET_EXPECT = {
    "code/common.yaml": {"CP2", "CP7", "CP10", "CP16"},
    "personal.yaml": {"R1"},
}
# and exactly these swapped-in phrases must be present / absent
QUIET_SWAPS = [
    ("code/common.yaml", "Explicit function signatures.", "Explicit control flow."),
    (
        "code/common.yaml",
        "Example: enforce strict type checking in a pre-commit hook",
        "Example: enforce a formatter in a pre-commit hook",
    ),
    (
        "code/common.yaml",
        "hard requirements such as type checking",
        "hard requirements such as deployment targets",
    ),
    ("personal.yaml", "Typecheck must pass.", "Checks must pass."),
]

# Strong stems: deliberately NARROW. These verify a declared closure; they do
# not pretend to find the axis (survey defect 4). P0002's enumeration says
# exactly which elements match them in the untampered library.
STRONG_STEMS = re.compile(
    r"type hints?|type annotation|type check|typecheck|strict typ|typescript|"
    r"pydantic|dataclass",
    re.I,
)
# Per-arm: the inverted CP7 text deliberately contains no strong stem, so
# I-lone expects only the three standing buttresses that use stem vocabulary
# (CP2's "Explicit function signatures" never matched a strong stem); M's
# narrowed CP7 still opens with "Type hints". I-quiet expects none.
EXPECTED_STEMS_BY_ARM = {
    "baseline": {"code-common:CP7", "code-common:CP10", "code-common:CP16", "personal:R1"},
    "N-inverted": {"code-common:CP7", "code-common:CP10", "code-common:CP16", "personal:R1"},
    "M-narrowed": {"code-common:CP7", "code-common:CP10", "code-common:CP16", "personal:R1"},
    "I-lone": {"code-common:CP10", "code-common:CP16", "personal:R1"},
    "I-quiet": set(),
}

fails = []


def chk(ok, msg):
    print(("  PASS  " if ok else "  FAIL  ") + msg)
    if not ok:
        fails.append(msg)


def elements(doc):
    for key, val in doc.items():
        if isinstance(val, list):
            for el in val:
                if isinstance(el, dict) and "id" in el:
                    yield key, el


def text_of(el):
    return " ".join(str(el.get(k, "")) for k in ("name", "statement", "description"))


def changed_elements(base_dir, arm_dir):
    out = []
    for bf in sorted(base_dir.rglob("*.yaml")):
        rel = bf.relative_to(base_dir)
        b = yaml.safe_load(bf.read_text())
        o = yaml.safe_load((arm_dir / rel).read_text())
        for k in set(b) | set(o):
            if not isinstance(b.get(k), list):
                continue
            bi = {e["id"]: e for e in b[k] if isinstance(e, dict) and "id" in e}
            oi = {e["id"]: e for e in o.get(k, []) if isinstance(e, dict) and "id" in e}
            out += [
                (str(rel), k, i) for i in set(bi) | set(oi) if bi.get(i) != oi.get(i)
            ]
    return out


root = E / "variants"
base = root / "baseline"
ARMS = ["baseline", "I-lone", "I-quiet", "M-narrowed", "N-inverted"]
print(f"auditing {E}")

# ===========================================================================
# channel: VCS / editor / OS metadata
# ===========================================================================
meta = [
    p
    for p in root.rglob("*")
    if re.match(r"\.(git|svn|hg)|.*\.(orig|bak|swp|rej)$|\.DS_Store", p.name)
]
chk(not meta, f"no VCS/editor metadata in variants (found {len(meta)})")

# ===========================================================================
# channel: more than the declared thing differs
# ===========================================================================
for v, (f, key, eid, name_must_change) in TARGET.items():
    if not (root / v).exists():
        continue
    diff_files = []
    for bf in sorted(base.rglob("*")):
        if not bf.is_file():
            continue
        rel = bf.relative_to(base)
        of = root / v / rel
        if (
            not of.exists()
            or hashlib.md5(bf.read_bytes()).hexdigest()
            != hashlib.md5(of.read_bytes()).hexdigest()
        ):
            diff_files.append(str(rel))
    chk(diff_files == [f], f"{v}: only {f} differs byte-wise (got {diff_files})")

    ch = changed_elements(base, root / v)
    chk(ch == [(f, key, eid)], f"{v}: exactly one element changed ({ch})")

    be = [e for e in yaml.safe_load((base / f).read_text())[key] if e["id"] == eid][0]
    oe = [e for e in yaml.safe_load((root / v / f).read_text())[key] if e["id"] == eid][0]
    chk(be["statement"] != oe["statement"], f"{v}: {eid} statement actually changed")
    if name_must_change:
        chk(be["name"] != oe["name"], f"{v}: {eid} name inverted alongside its statement")
    else:
        chk(be["name"] == oe["name"], f"{v}: {eid} name deliberately unchanged")

# ---- I-quiet: the declared five-element, two-file deviation ----------------
vq = root / "I-quiet"
if vq.exists():
    diff_files = []
    for bf in sorted(base.rglob("*")):
        if not bf.is_file():
            continue
        rel = bf.relative_to(base)
        of = vq / rel
        if (
            not of.exists()
            or hashlib.md5(bf.read_bytes()).hexdigest()
            != hashlib.md5(of.read_bytes()).hexdigest()
        ):
            diff_files.append(str(rel))
    chk(
        sorted(diff_files) == sorted(QUIET_EXPECT),
        f"I-quiet: exactly the two declared files differ (got {diff_files})",
    )
    ch = changed_elements(base, vq)
    got = {}
    for rel, k, i in ch:
        got.setdefault(rel, set()).add(i)
    chk(
        got == QUIET_EXPECT,
        f"I-quiet: exactly the five declared elements changed (got {got})",
    )
    # CP7 inverted name; buttress names unchanged
    for f, ids in QUIET_EXPECT.items():
        bdoc = yaml.safe_load((base / f).read_text())
        qdoc = yaml.safe_load((vq / f).read_text())
        for k, el in elements(bdoc):
            if el["id"] not in ids:
                continue
            qel = [e for _, e in elements(qdoc) if e["id"] == el["id"]][0]
            if el["id"] == "CP7":
                chk(el["name"] != qel["name"], "I-quiet: CP7 name inverted")
            else:
                chk(
                    el["name"] == qel["name"],
                    f"I-quiet: {el['id']} name unchanged (quiet swap touches one clause only)",
                )
    # the exact swaps, present and absent
    for f, old, new in QUIET_SWAPS:
        bt = (base / f).read_text()
        qt = (vq / f).read_text()
        chk(old in bt and old not in qt, f"I-quiet: {f}: {old[:40]!r} removed")
        chk(new in qt and new not in bt, f"I-quiet: {f}: {new[:40]!r} swapped in")
        chk(
            not STRONG_STEMS.search(new),
            f"I-quiet: swap text {new[:40]!r} introduces no axis stem",
        )

# ===========================================================================
# channel: axis co-statement — verify the DECLARED closure (P0002)
# ===========================================================================
for v in ARMS:
    if not (root / v).exists():
        continue
    matches = set()
    for doc_path in sorted((root / v).rglob("*.yaml")):
        doc = yaml.safe_load(doc_path.read_text())
        libname = doc.get("meta", {}).get("name", doc_path.stem)
        for _, el in elements(doc):
            if STRONG_STEMS.search(text_of(el)):
                matches.add(f"{libname}:{el['id']}")
    chk(
        matches == EXPECTED_STEMS_BY_ARM[v],
        f"{v}: strong-stem matches are exactly the declared set ({matches})",
    )

# ===========================================================================
# channel: tag glossary — byte-identical across arms; no typing position
# ===========================================================================
gloss = {}
for v in ARMS:
    p = root / v / "personal.yaml"
    if not p.exists():
        continue
    defs = yaml.safe_load(p.read_text())["meta"]["definitions"]["tags"]
    gloss[v] = hashlib.md5(json.dumps(defs, sort_keys=True).encode()).hexdigest()
chk(len(set(gloss.values())) <= 1, f"tag glossary byte-identical across arms ({gloss})")
if (base / "personal.yaml").exists():
    defs = yaml.safe_load((base / "personal.yaml").read_text())["meta"]["definitions"]["tags"]
    blob = " ".join(
        d.get("description", "") for g in defs.values() for d in g.values()
    )
    chk(
        not STRONG_STEMS.search(blob),
        "no tag definition states a typing position",
    )

# ===========================================================================
# channel: cairn validate's own diagnostics (run from OUTSIDE $HOME — #36)
# ===========================================================================
SKIP_EXTERNAL = bool(os.environ.get("LEAK_AUDIT_SKIP_EXTERNAL"))
if CAIRN.exists():
    outside = pathlib.Path("/tmp")
    val = {}
    for v in ARMS:
        if not (root / v).exists():
            continue
        r = subprocess.run(
            [str(CAIRN), "--library", str(root / v), "validate"],
            cwd=outside,
            capture_output=True,
            text=True,
        )
        val[v] = (
            hashlib.md5((r.stdout + r.stderr).encode()).hexdigest(),
            (r.stdout + r.stderr).count("WARN"),
        )
    chk(
        len({h for h, _ in val.values()}) <= 1,
        f"cairn validate output byte-identical across arms ({ {k: v[0][:8] for k, v in val.items()} })",
    )
    n = next(iter(val.values()))[1] if val else 0
    chk(
        n > 2,
        f"the audit ran from outside $HOME ({n} diagnostics; 2 would mean "
        "~/.gvp/config.yaml suppressed them and the identity check proved nothing)",
    )

# ===========================================================================
# channel: the task, the prompt, the floor
# ===========================================================================
task = (E / "TASK.md").read_text() if (E / "TASK.md").exists() else ""
if task:
    t3task = E.parent / "2026-10-contested-axis" / "TASK.md"
    if t3task.exists():
        chk(
            task == t3task.read_text(),
            "TASK.md is byte-identical to trial 3's (cross-trial constant)",
        )
    stripped = "\n".join(
        ln for ln in task.splitlines() if "TypeScript on Node" not in ln
    )
    AXIS_WORDS = [
        r"typescript",
        r"javascript",
        r"\btyp(e|ing|ed)\b",
        r"annotat",
        r"\bstrict\b",
        r"\binterface\b",
        r"tsconfig",
        r"\btsc\b",
        r"\bany\b",
        r"\binfer",
        r"pydantic",
        r"dataclass",
        r"\bschema\b",
        r"\bmodel\b",
    ]
    hits = [w for w in AXIS_WORDS if re.search(w, stripped.lower())]
    chk(
        not hits,
        f"TASK.md (minus the whitelisted stack line) never names the axis ({hits})",
    )
    chk(
        not re.search(r"(?<![\w-])--[a-z]", task),
        "TASK.md specifies no command-line flag of any kind",
    )

prompt = (E / "RUN_PROMPT.md").read_text() if (E / "RUN_PROMPT.md").exists() else ""
if prompt:
    t3p = E.parent / "2026-10-contested-axis" / "RUN_PROMPT.md"
    if t3p.exists():
        chk(prompt == t3p.read_text(), "RUN_PROMPT.md byte-identical to trial 3's")
    chk(
        not re.search(
            r"tension|contradict|conflict|disagree|inconsisten|at odds", prompt.lower()
        ),
        "RUN_PROMPT does not invite tension-hunting (the I-lone visibility "
        "side-prediction must be unprompted)",
    )

floor_src = ""
for p in (E / "instrument" / "accept").rglob("*"):
    if p.is_file() and p.suffix in ("", ".sh", ".mjs", ".csv", ".txt"):
        floor_src += "\n".join(
            ln
            for ln in p.read_text(errors="ignore").splitlines()
            if not ln.lstrip().startswith(("#", "//"))
        )
if floor_src:
    fork_probes = [
        "tsconfig",
        "typecheck",
        "annotation",
        "interface ",
        "--noEmit",
        "ReturnType",
        ": any",
    ]
    hits = [w for w in fork_probes if w in floor_src]
    chk(not hits, f"acceptance floor does not inspect the measured forks ({hits})")

# ===========================================================================
# channel: cairn provenance (machine-level; env-skippable for mutation runs)
# ===========================================================================
if not SKIP_EXTERNAL and shutil.which("npm"):
    r = subprocess.run(["npm", "ls", "-g", "--depth=0"], capture_output=True, text=True)
    line = [ln for ln in (r.stdout + r.stderr).splitlines() if "cairn" in ln]
    chk(
        bool(line) and not any("->" in ln for ln in line),
        f"global cairn is a registry install, not a repo link ({line})",
    )
if not SKIP_EXTERNAL and CAIRN.exists():
    chk(
        REPO_MARKER not in str(CAIRN.resolve()),
        f"pinned cairn does not resolve into the repo ({CAIRN.resolve()})",
    )
    r = subprocess.run([str(CAIRN), "--version"], capture_output=True, text=True)
    got = (r.stdout + r.stderr).strip()
    chk(got == CAIRN_EXPECTED_VERSION, f"pinned cairn is {CAIRN_EXPECTED_VERSION} ({got!r})")
dispatcher = pathlib.Path.home() / "bin" / "cairn"
if not SKIP_EXTERNAL and dispatcher.exists():
    chk(
        REPO_MARKER not in dispatcher.read_text(errors="ignore"),
        "~/bin/cairn dispatcher carries no hardcoded repo path",
    )

# ===========================================================================
# channel: run directories, manifest, registry
# ===========================================================================
man_path = E / "MANIFEST.json"
if man_path.exists():
    man = json.loads(man_path.read_text())
    words = (
        "base",
        "lone",
        "quiet",
        "narrow",
        "invert",
        "control",
        "null",
        "typ",
        "strict",
        "infer",
        "cp7",
        "wp3",
        "axis",
        "arm",
        "tier",
    )
    variants = {m["variant"].lower() for m in man.values()}
    bad = [
        r
        for r in man
        if any(w in r.lower() for w in words)
        or any(v.replace("-", "") in r.lower() for v in variants)
    ]
    chk(not bad, f"run ids are opaque (offenders: {bad})")

    roots = {}
    for rid, m in man.items():
        rr = pathlib.Path(m["root"])
        roots[rid] = rr
        proj = rr / "project"
        anc = [a for a in [proj, *proj.parents] if (a / ".git").exists()]
        chk(not anc, f"{rid}: no git work tree at or above the run ({[str(a) for a in anc]})")
        chk(
            not any(w in str(rr).lower() for w in words),
            f"{rid}: run path is opaque ({rr})",
        )
        chk(not list(rr.rglob("MANIFEST*")), f"{rid}: MANIFEST unreachable from the run tree")
        vd = E / "variants" / m["variant"]
        lib = proj / ".gvp" / "library"
        mism = [
            str(p.relative_to(vd))
            for p in vd.rglob("*")
            if p.is_file()
            and (
                not (lib / p.relative_to(vd)).exists()
                or hashlib.md5(p.read_bytes()).hexdigest()
                != hashlib.md5((lib / p.relative_to(vd)).read_bytes()).hexdigest()
            )
        ]
        chk(not mism, f"{rid}: library is byte-identical to its variant ({mism[:3]})")
        reg = rr / ".registry"
        if reg.exists():
            blob = "\n".join(
                p.read_text(errors="ignore") for p in reg.rglob("*") if p.is_file()
            )
            foreign = [str(o) for i, o in roots.items() if i != rid and str(o) in blob]
            chk(not foreign, f"{rid}: registry mentions no other run ({foreign})")
            chk(
                str(pathlib.Path.home() / ".gvp") not in blob,
                f"{rid}: registry does not reach the machine-wide library",
            )
        chk(
            m.get("cairn_version") == CAIRN_EXPECTED_VERSION,
            f"{rid}: manifest records the pinned cairn version ({m.get('cairn_version')})",
        )

    for fname in ("TASK.md", "CLAUDE.md"):
        digests = {
            hashlib.md5((roots[r] / "project" / fname).read_bytes()).hexdigest()
            for r in man
            if (roots[r] / "project" / fname).exists()
        }
        chk(
            len(digests) <= 1,
            f"{fname} is byte-identical across every run ({len(digests)} variants)",
        )

print(f"\n{'ALL CLEAR' if not fails else str(len(fails)) + ' FAILURE(S)'}")
sys.exit(1 if fails else 0)
