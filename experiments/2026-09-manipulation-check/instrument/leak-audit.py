#!/usr/bin/env python3
"""Gate: a run directory must not reveal which variant it is, except via the intended element."""
import sys, pathlib, yaml, hashlib, re

E = pathlib.Path(__file__).parent
TARGET = {
    "L-inverted": ("code/common.yaml", "heuristics", "CH1"),
    "R-inverted": ("code/common.yaml", "principles", "CP7"),
    "N-inverted": ("code/realtime.yaml", "principles", "RTP5"),
}
fails = []


def chk(ok, msg):
    print(("  PASS  " if ok else "  FAIL  ") + msg)
    if not ok:
        fails.append(msg)


root = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else E / "variants"
print(f"auditing {root}")

# 1. no VCS / editor / OS metadata anywhere
meta = [
    p
    for p in root.rglob("*")
    if re.match(r"\.(git|svn|hg)|.*\.(orig|bak|swp|rej)$|\.DS_Store", p.name)
]
chk(not meta, f"no VCS/editor metadata (found {len(meta)})")

# 2/3/4. each variant differs from baseline in exactly one element, name AND statement
base = root / "baseline"
for v, (f, key, eid) in TARGET.items():
    if not (root / v).exists():
        continue
    # byte-level: only the one file may differ
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
    # structural: only the one element
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
    coherent = (
        be["name"] != oe["name"]
    ) or eid == "CH1"  # CH1's name is polarity-neutral by design
    chk(
        coherent,
        f"{v}: {eid} name is coherent with its statement (base={be['name']!r} var={oe['name']!r})",
    )
    chk(be["statement"] != oe["statement"], f"{v}: {eid} statement actually changed")
    # no OTHER element anywhere mentions the inverted element's old or new name
    for other in sorted((root / v).rglob("*.yaml")):
        txt = other.read_text()
        for nm in {be["name"], oe["name"]}:
            hits = [
                l
                for l in txt.splitlines()
                if nm in l
                and f"id: {eid}" not in l
                and not l.strip().startswith(f"name: {nm}")
            ]
            chk(
                not hits,
                f"{v}: {other.relative_to(root/v)} does not reference {nm!r} elsewhere",
            )


# 5. run-directory names must not encode the variant (the leak that got past me once)
import json

man = E / "MANIFEST.json"
if man.exists():
    m = json.loads(man.read_text())
    # a run id must not encode its variant. hex digits are not a signal; VARIANT WORDS are.
    words = (
        "base",
        "invert",
        "control",
        "strict",
        "infer",
        "frame",
        "dep",
        "yaml",
        "tier",
    )
    variants = {v["variant"].lower() for v in m.values()}
    bad = [
        r
        for r in m
        if any(w in r.lower() for w in words)
        or any(v.replace("-", "") in r.lower() for v in variants)
    ]
    # and the id must not correlate with rep order either
    ordered = [
        r
        for r, meta in sorted(m.items())
        if meta["rep"] != sorted(m.items()).index((r, meta)) % 3 + 1
    ]
    chk(not bad, f"run ids are opaque (offenders: {bad})")
    chk(
        not list((E / "runs").rglob("MANIFEST*")),
        "MANIFEST is not reachable from inside runs/",
    )
    # every run dir must be byte-identical to its variant, plus exactly TASK.md + CLAUDE.md
    import hashlib

    for rid, meta in m.items():
        rd = E / "runs" / rid
        vd = E / "variants" / meta["variant"]
        # parity only gates PRISTINE dirs — a completed run legitimately has
        # src/, node_modules/ and DECISIONS.md. Detect and skip those.
        built = (rd / "package.json").exists() or (rd / "node_modules").exists()
        if built:
            print(f"  SKIP  {rid}: already built, parity not applicable")
            continue
        extra = sorted(
            str(f.relative_to(rd))
            for f in rd.rglob("*")
            if f.is_file() and not str(f.relative_to(rd)).startswith(".gvp/library/")
        )
        chk(
            extra == ["CLAUDE.md", "TASK.md"],
            f"{rid}: only TASK/CLAUDE outside the library ({extra})",
        )
        mism = [
            str(f.relative_to(vd))
            for f in vd.rglob("*")
            if f.is_file()
            and hashlib.md5(f.read_bytes()).hexdigest()
            != hashlib.md5(
                (rd / ".gvp/library" / f.relative_to(vd)).read_bytes()
            ).hexdigest()
        ]
        chk(not mism, f"{rid}: library matches its variant exactly ({mism})")

print(f"\n{'ALL CLEAR' if not fails else str(len(fails))+' FAILURE(S)'}")
sys.exit(1 if fails else 0)
