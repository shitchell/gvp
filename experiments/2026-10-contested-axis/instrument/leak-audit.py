#!/usr/bin/env python3
"""Gate: a run must not be able to discover which arm it is in.

Descended from trial 2's leak-audit.py. Two checks change in KIND here, because
trial 3 manipulates a contested axis rather than a lone element:

  - trial 2 asserted that NO other element restates the changed element's
    position. Trial 3 cannot assert that and does not want to: ten elements
    bear on this axis and that is the independent variable. The check becomes
    "the set of elements on the axis is exactly the declared set", so a voice
    nobody enumerated fails the gate.

  - trial 2's arms inverted statements. Trial 3's two decisive arms only APPEND
    a clause, which is asserted structurally (the baseline statement must be a
    prefix of the arm's). That is what keeps the tag glossary and the validate
    diagnostics identical across arms, both of which are now asserted rather
    than argued.

Every check added here has a matching mutation in mutation-test.sh; the gate is
fallible too (trial 1's version flagged hex digits as variant signal, and trial
2's flagged two runs for "reaching the gvp repository" when both had only run
`npm ls -g`).

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

# Pinned absolutely — see dispatch.sh and protocol section 4. A bare `cairn`
# would resolve through PATH to a possibly-stale repo-local build.
CAIRN = pathlib.Path("/home/guy/.nvm/versions/node/v22.14.0/bin/cairn")
CAIRN_EXPECTED_VERSION = "5.1.0"
REPO_MARKER = "shitchell/gvp"

# arm -> (file, collection key, element id, name-must-change?, additive-only?)
TARGET = {
    "D-decisive": ("code/common.yaml", "heuristics", "CH2", False, True),
    "A-decisive": ("personal.yaml", "principles", "P21", False, True),
    "N-inverted": ("code/web.yaml", "principles", "WP3", True, False),
}

# Every element that bears on the deferral / flex-point axis. Nine of these
# take a side and contradict each other; personal:P1 mediates. This list is the
# trial's independent variable, so the gate asserts the library matches it
# exactly rather than asserting the list is empty.
AXIS_DECLARED = {
    "personal:V7",
    "personal:P21",
    "personal:P17",
    "personal:H3",
    "code-common:CP15",
    "personal:V1",
    "personal:P5",
    "personal:H1",
    "code-common:CH2",
    "personal:P1",
}

# An element that mentions the axis vocabulary without taking a position on it.
# Acknowledged with the reason, never deleted from the scan — trial 2's gate
# kept its three false positives visible for exactly this reason.
AXIS_INCIDENTAL = {
    "personal:P16": "'clean seams' appears in a statement about scaling rigor to blast "
    "radius ('invest disproportionate care — correctness, testing, clean seams, design "
    "scrutiny — in the core'). It says how much care a seam deserves once you are "
    "building one, not whether to build one for a feature with no concrete use case.",
}

AXIS_KEYWORDS = re.compile(
    r"flex point|\bseam|speculat|\bdefer|extensib|abstraction|optionality|premature|"
    r"hypothetical|YAGNI|generalization",
    re.I,
)

# The tag glossary genuinely carries this axis, in both directions, on CH2's own
# two tags. That is a confound and part of the finding; it is not a leak,
# because the glossary is byte-identical across arms and no arm inverts
# anything. Both of those are asserted below.
TAG_TERMS_ACKNOWLEDGED = {
    "extensib": "the `maintainability` tag is defined as 'Naming, structure, extensibility, "
    "testability' — one of CH2's own two tags, pointing toward seams",
    "abstraction": "the `simplicity` tag is 'Reducing complexity, preferring minimal "
    "solutions' and `composability` is 'DRY, modularity, shared infrastructure'; both "
    "describe what the tag covers, not where this axis resolves",
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


root = E / "variants"
base = root / "baseline"
print(f"auditing {E}")

# ===========================================================================
# channel: VCS / editor / OS metadata inside the shipped library
# ===========================================================================
meta = [
    p
    for p in root.rglob("*")
    if re.match(r"\.(git|svn|hg)|.*\.(orig|bak|swp|rej)$|\.DS_Store", p.name)
]
chk(not meta, f"no VCS/editor metadata in variants (found {len(meta)})")

# ===========================================================================
# channel: more than one thing differs / name contradicts statement
# ===========================================================================
for v, (f, key, eid, name_must_change, additive) in TARGET.items():
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

    changed = []
    for bf in sorted(base.rglob("*.yaml")):
        rel = bf.relative_to(base)
        b = yaml.safe_load(bf.read_text())
        o = yaml.safe_load((root / v / rel).read_text())
        for k in set(b) | set(o):
            if not isinstance(b.get(k), list):
                continue
            bi = {e["id"]: e for e in b[k] if isinstance(e, dict) and "id" in e}
            oi = {e["id"]: e for e in o.get(k, []) if isinstance(e, dict) and "id" in e}
            changed += [
                f"{rel}:{k}:{i}" for i in set(bi) | set(oi) if bi.get(i) != oi.get(i)
            ]
    chk(
        changed == [f"{f}:{key}:{eid}"], f"{v}: exactly one element changed ({changed})"
    )

    be = [e for e in yaml.safe_load((base / f).read_text())[key] if e["id"] == eid][0]
    oe = [e for e in yaml.safe_load((root / v / f).read_text())[key] if e["id"] == eid][
        0
    ]
    chk(be["statement"] != oe["statement"], f"{v}: {eid} statement actually changed")

    if name_must_change:
        chk(
            be["name"] != oe["name"],
            f"{v}: {eid} name inverted alongside its statement",
        )
    else:
        chk(
            be["name"] == oe["name"],
            f"{v}: {eid} name deliberately unchanged (the clause is additive, so the "
            "name still describes the statement exactly as well)",
        )

    # The decisive arms must be PURELY ADDITIVE. If a word of the baseline
    # position were altered, the arm would no longer be "the same library plus a
    # tie-break" and the trial would be measuring something else.
    if additive:
        chk(
            oe["statement"].strip().startswith(be["statement"].strip()),
            f"{v}: {eid}'s baseline statement is an exact prefix of the arm's "
            "(the clause is appended, nothing is rewritten)",
        )
        chk(
            "id" in oe and oe["id"] == be["id"],
            f"{v}: {eid} keeps its id (no gap, no renumbering)",
        )

    # no other document mentions either name
    for other in sorted((root / v).rglob("*.yaml")):
        txt = other.read_text()
        for nm in {be["name"], oe["name"]}:
            hits = [
                ln
                for ln in txt.splitlines()
                if nm in ln
                and f"id: {eid}" not in ln
                and not ln.strip().startswith(f"name: {nm}")
            ]
            chk(
                not hits,
                f"{v}: {other.relative_to(root / v)} does not reference {nm!r} elsewhere",
            )

# ===========================================================================
# channel: axis co-statement — the independent variable, asserted not assumed
# ===========================================================================
for v in ["baseline", *TARGET]:
    if not (root / v).exists():
        continue
    found = {}
    for doc_path in sorted((root / v).rglob("*.yaml")):
        doc = yaml.safe_load(doc_path.read_text())
        libname = doc.get("meta", {}).get("name", doc_path.stem)
        for _, el in elements(doc):
            if AXIS_KEYWORDS.search(text_of(el)):
                found[f"{libname}:{el['id']}"] = sorted(
                    {m.group(0).lower() for m in AXIS_KEYWORDS.finditer(text_of(el))}
                )
    unexpected = {
        k: w
        for k, w in found.items()
        if k not in AXIS_DECLARED and k not in AXIS_INCIDENTAL
    }
    missing = sorted(AXIS_DECLARED - set(found))
    chk(not unexpected, f"{v}: no undeclared voice on the axis ({unexpected})")
    chk(not missing, f"{v}: every declared axis voice is present ({missing})")

# ===========================================================================
# channel: the tag glossary
# ===========================================================================
# Trial 1's defect 7: `performance` was defined as "...frame-rate independence",
# which contradicted its inverted RTP5 with nobody noticing. Here the glossary
# does carry the axis — so instead of asserting it does not, assert that it is
# IDENTICAL across arms, which is what makes it a confound rather than a tell.
gloss_digests = {}
for v in ["baseline", *TARGET]:
    p = root / v / "personal.yaml"
    if not p.exists():
        continue
    defs = yaml.safe_load(p.read_text())["meta"]["definitions"]["tags"]
    blob = json.dumps(defs, sort_keys=True)
    gloss_digests[v] = hashlib.md5(blob.encode()).hexdigest()
chk(
    len(set(gloss_digests.values())) <= 1,
    f"the tag glossary is byte-identical across every arm ({gloss_digests})",
)

# And every axis term the glossary does carry must be acknowledged in writing.
if (base / "personal.yaml").exists():
    defs = yaml.safe_load((base / "personal.yaml").read_text())["meta"]["definitions"][
        "tags"
    ]
    glossary = " ".join(
        d.get("description", "") for group in defs.values() for d in group.values()
    ).lower()
    leaky = sorted(
        t
        for t in ["extensib", "abstraction", "speculat", "defer", "flex point", "seam"]
        if t in glossary and t not in TAG_TERMS_ACKNOWLEDGED
    )
    chk(not leaky, f"every axis term in the tag glossary is acknowledged ({leaky})")

# ===========================================================================
# channel: cairn validate's own diagnostics  (NEW — protocol section 4)
# ===========================================================================
# CLAUDE.md tells every run to consult the library through cairn. If an arm's
# diagnostics differed, the tool the experiment requires would be telling the
# run which arm it is in.
#
# Run from a directory OUTSIDE $HOME or this assertion is worthless:
# ~/.gvp/config.yaml carries suppress_diagnostics: [W003, W005] and the project
# walk-up runs to the filesystem root, so it is discovered as the *project*
# config for every cwd below $HOME — 27 diagnostics from /tmp, 2 from ~ (#36).
if CAIRN.exists():
    outside = pathlib.Path("/tmp")
    val = {}
    for v in ["baseline", *TARGET]:
        if not (root / v).exists():
            continue
        r = subprocess.run(
            [str(CAIRN), "--library", str(root / v), "validate"],
            cwd=outside,
            capture_output=True,
            text=True,
        )
        val[v] = hashlib.md5((r.stdout + r.stderr).encode()).hexdigest()
    chk(
        len(set(val.values())) <= 1,
        f"cairn validate output is byte-identical across every arm ({val})",
    )
    n_diag = None
    r = subprocess.run(
        [str(CAIRN), "--library", str(base), "validate"],
        cwd=outside,
        capture_output=True,
        text=True,
    )
    n_diag = (r.stdout + r.stderr).count("WARN") + (r.stdout + r.stderr).count("ERROR")
    chk(
        n_diag > 2,
        f"the audit ran from outside $HOME ({n_diag} diagnostics; 2 would mean "
        "~/.gvp/config.yaml suppressed them and the check above proved nothing)",
    )

# ===========================================================================
# channel: the two tie-break clauses are not equally forceful
# ===========================================================================
clauses = {}
for v, (f, key, eid, _, additive) in TARGET.items():
    if not additive or not (root / v).exists():
        continue
    be = [e for e in yaml.safe_load((base / f).read_text())[key] if e["id"] == eid][0]
    oe = [e for e in yaml.safe_load((root / v / f).read_text())[key] if e["id"] == eid][
        0
    ]
    clauses[v] = oe["statement"].strip()[len(be["statement"].strip()) :].strip()

if len(clauses) == 2:
    lens = {v: len(c.split()) for v, c in clauses.items()}
    spread = max(lens.values()) - min(lens.values())
    chk(spread <= 4, f"the tie-break clauses differ by at most 4 words ({lens})")
    chk(
        all(c.startswith("(Where this meets") for c in clauses.values()),
        f"both clauses use the same construction ({list(clauses.values())})",
    )
    chk(
        all(c.rstrip().endswith("seam.)") for c in clauses.values()),
        "both clauses resolve on the same final noun, differing only in whether a seam results",
    )
    chk(
        len({c for c in clauses.values()}) == 2,
        "the two clauses are not identical",
    )

# ===========================================================================
# channel: the task text, the floor, and the prompt
# ===========================================================================
# Word-stem regexes, not substrings: a bare "repo" matched "reports" in trial
# 2's TASK.md. Another gate false positive, kept visible.
AXIS_WORDS = [
    r"\bdefer",
    r"speculat",
    r"flex point",
    r"\bseam",
    r"extensib",
    r"\bplugin",
    r"\badapter",
    r"abstraction",
    r"\bYAGNI\b",
    r"over-?engineer",
    r"\bhypothetical",
    r"future (need|change|use)",
    r"\blater\b",
    r"\bconfig\w* (option|file|hook)",
    r"\bhooks?\b",
    r"\bswappable",
    r"\bmodular",
    r"\bgeneric\b",
    r"\binterface\b",
    r"\bflag\b",
    r"\boption\b",
    r"\bformat\b",
    r"\bjson\b",
    r"\brecursiv",
    r"\bdelimiter",
    r"\bextend\b",
]

task = (E / "TASK.md").read_text() if (E / "TASK.md").exists() else ""
if task:
    hits = [w for w in AXIS_WORDS if re.search(w, task.lower())]
    chk(not hits, f"TASK.md never names the axis under test ({hits})")
    # The task must specify no flags at all; that is what makes any flag a
    # feature it never asked for.
    chk(
        not re.search(r"(?<![\w-])--[a-z]", task),
        "TASK.md specifies no command-line flag of any kind",
    )

floor_src = ""
for p in (E / "instrument" / "accept").rglob("*"):
    if p.is_file() and p.suffix in ("", ".sh", ".mjs"):
        # comments are not behaviour; run.sh's header names the forks precisely
        # to say that it must not touch them
        floor_src += "\n".join(
            ln
            for ln in p.read_text(errors="ignore").splitlines()
            if not ln.lstrip().startswith(("#", "//"))
        )
if floor_src:
    # If the floor probed any measured fork it would be scoring, not gating —
    # trial 1's defect 1 in its general form.
    fork_probes = [
        "--json",
        "--format",
        "--recursive",
        "--delimiter",
        "--ext",
        "--glob",
        "--output",
        "formatter",
        "adapter",
        "plugin",
        "README",
    ]
    hits = [w for w in fork_probes if w in floor_src]
    chk(not hits, f"acceptance floor does not inspect the measured forks ({hits})")

prompt = (E / "RUN_PROMPT.md").read_text() if (E / "RUN_PROMPT.md").exists() else ""
if prompt:
    hits = [w for w in AXIS_WORDS if re.search(w, prompt.lower())]
    chk(not hits, f"RUN_PROMPT never names the axis under test ({hits})")
    # Prediction 2 (does a run notice the library contradicting itself?) is only
    # meaningful if nothing asked it to look. A prompt that mentioned tension
    # would manufacture the observation.
    chk(
        not re.search(
            r"tension|contradict|conflict|disagree|inconsisten|at odds|trade-?off",
            prompt.lower(),
        ),
        "RUN_PROMPT does not invite the run to look for tension in the library "
        "(prediction 2 must be unprompted)",
    )

# ===========================================================================
# channel: the cairn binary's own provenance  (NEW — protocol section 4)
# ===========================================================================
# `npm ls -g` printed "@principled/cairn -> .../shitchell/gvp" while cairn was a
# global npm link, handing any run the path to the real repository. Trial 2
# verified by transcript that no run followed it and reported it still open.
#
# These three checks interrogate the MACHINE, not the experiment directory, so
# no mutation of a variant can defeat them and mutation-test.sh skips them for
# speed (`npm ls -g` alone is ~2s, times fourteen mutations). The per-arm
# checks above are never skipped.
SKIP_EXTERNAL = bool(os.environ.get("LEAK_AUDIT_SKIP_EXTERNAL"))

if not SKIP_EXTERNAL and shutil.which("npm"):
    r = subprocess.run(["npm", "ls", "-g", "--depth=0"], capture_output=True, text=True)
    line = [ln for ln in (r.stdout + r.stderr).splitlines() if "cairn" in ln]
    chk(
        bool(line) and not any("->" in ln for ln in line),
        f"the global cairn is a registry install, not a link to the repo ({line})",
    )

if not SKIP_EXTERNAL and CAIRN.exists():
    target = CAIRN.resolve()
    chk(
        REPO_MARKER not in str(target),
        f"the pinned cairn does not resolve into the repo ({target})",
    )
    r = subprocess.run([str(CAIRN), "--version"], capture_output=True, text=True)
    got = (r.stdout + r.stderr).strip()
    chk(
        got == CAIRN_EXPECTED_VERSION,
        f"the pinned cairn is the declared version ({got!r} vs {CAIRN_EXPECTED_VERSION!r})",
    )

dispatcher = pathlib.Path.home() / "bin" / "cairn"
if not SKIP_EXTERNAL and dispatcher.exists():
    body = dispatcher.read_text(errors="ignore")
    chk(
        REPO_MARKER not in body,
        "the ~/bin/cairn dispatcher carries no hardcoded repo path "
        "(it walks up from $PWD grepping package.json, so reading it leaks nothing)",
    )

# ===========================================================================
# channel: the run directories, the manifest, the registry
# ===========================================================================
man_path = E / "MANIFEST.json"
if man_path.exists():
    man = json.loads(man_path.read_text())
    words = (
        "base",
        "decisive",
        "invert",
        "narrow",
        "control",
        "null",
        "defer",
        "seam",
        "flex",
        "ch2",
        "p21",
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
        chk(
            not anc,
            f"{rid}: no git work tree at or above the run ({[str(a) for a in anc]})",
        )
        chk(
            not any(w in str(rr).lower() for w in words),
            f"{rid}: run path is opaque ({rr})",
        )
        chk(
            not list(rr.rglob("MANIFEST*")),
            f"{rid}: MANIFEST unreachable from the run tree",
        )
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
        # the manifest must record which cairn seeded the registry
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
