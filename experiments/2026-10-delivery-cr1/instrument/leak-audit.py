#!/usr/bin/env python3
"""Gate: a run must not be able to discover which arm it is in.

Descended from trial 4's gate, with its central assertion INVERTED. There, each
arm's library differed in exactly one element and the gate proved the difference
was exactly that. Here the manipulation is outside the library entirely, so the
gate proves there is NO difference: four byte-identical libraries, and the whole
class of content channels that cost trials 1-4 their defects — inverted names,
restated axes, divergent `cairn validate` diagnostics, tampered tag glossaries —
is closed by construction. Asserted rather than trusted.

What replaces it is hook-side:

  - payload fidelity: each arm's injected text is the element as its OWN library
    copy states it, not a paraphrase
  - L1 and L2 carry byte-identical payloads (timing is the only variable) and
    L2/L2n carry byte-identical wiring (payload is the only variable)
  - the hook script names no arm, no layer, no trial, carries no path into this
    directory, does not know the trial's token, and cannot block
  - the delivery manipulation check: every hooked run's log shows the hook
    actually injected, and L0's runs have no log at all. A null result from a
    silently dead hook is this trial's worst failure mode.

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
TRIAL_TOKEN = "jd_live_7f3c9a21d0e4b8563ae1"

ARMS = ["L0", "L1", "L2", "L2n"]
HOOKED = ["L1", "L2", "L2n"]
PAYLOAD_OF = {
    "L1": ("code-common", "CR1"),
    "L2": ("code-common", "CR1"),
    "L2n": ("code-web", "WP3"),
}
FRAMING = "The project's guiding library states:"

fails = []


def chk(ok, msg):
    print(("  PASS  " if ok else "  FAIL  ") + msg)
    if not ok:
        fails.append(msg)


def md5(p):
    return hashlib.md5(pathlib.Path(p).read_bytes()).hexdigest()


def elements(doc):
    for key, val in doc.items():
        if isinstance(val, list):
            for el in val:
                if isinstance(el, dict) and "id" in el:
                    yield key, el


def find_element(lib_dir, libname, eid):
    for path in sorted(pathlib.Path(lib_dir).rglob("*.yaml")):
        doc = yaml.safe_load(path.read_text())
        if not isinstance(doc, dict) or doc.get("meta", {}).get("name") != libname:
            continue
        for _, el in elements(doc):
            if el["id"] == eid:
                return el
    return None


root = E / "arms"
print(f"auditing {E}")

# ===========================================================================
# channel: VCS / editor / OS metadata
# ===========================================================================
meta = [
    p
    for p in root.rglob("*")
    if re.match(r"\.(git|svn|hg)|.*\.(orig|bak|swp|rej)$|\.DS_Store", p.name)
]
chk(not meta, f"no VCS/editor metadata in arms (found {len(meta)})")

# ===========================================================================
# channel: library identity — the INVERTED invariant (TRIAL.yaml deviation 1)
# ===========================================================================
base = root / "L0" / "library"
for v in ARMS[1:]:
    other = root / v / "library"
    if not other.exists():
        continue
    diff_files = []
    for bf in sorted(base.rglob("*")):
        if not bf.is_file():
            continue
        relp = bf.relative_to(base)
        of = other / relp
        if not of.exists() or md5(bf) != md5(of):
            diff_files.append(str(relp))
    extra = [
        str(p.relative_to(other))
        for p in other.rglob("*")
        if p.is_file() and not (base / p.relative_to(other)).exists()
    ]
    chk(
        not diff_files and not extra,
        f"{v}: library byte-identical to L0's (differs: {diff_files[:3]}, extra: {extra[:3]})",
    )

for v in ARMS:
    lib = root / v / "library"
    if not lib.exists():
        continue
    got = set()
    for path in sorted(lib.rglob("*.yaml")):
        doc = yaml.safe_load(path.read_text())
        if not isinstance(doc, dict):
            continue
        name = doc.get("meta", {}).get("name", path.stem)
        for _, el in elements(doc):
            got.add(f"{name}:{el['id']}")
    chk(len(got) > 50, f"{v}: library parses and carries its elements ({len(got)})")

# the element under test must be present and unmodified in EVERY arm
cr1 = [
    find_element(root / v / "library", "code-common", "CR1")
    for v in ARMS
    if (root / v).exists()
]
chk(all(e is not None for e in cr1), "code-common:CR1 present in every arm")
if all(cr1):
    chk(
        len({json.dumps(e, sort_keys=True) for e in cr1}) == 1,
        "code-common:CR1 is identical in every arm (delivery is the only variable)",
    )

# ===========================================================================
# channel: payload fidelity — the injected text IS the element
# ===========================================================================
for v in HOOKED:
    pf = root / v / "context.txt"
    if not pf.exists():
        chk(False, f"{v}: payload file missing")
        continue
    text = pf.read_text()
    libname, eid = PAYLOAD_OF[v]
    el = find_element(root / v / "library", libname, eid)
    chk(
        el is not None,
        f"{v}: payload's element {libname}:{eid} exists in its own library",
    )
    if el:
        statement = " ".join(str(el["statement"]).split())
        chk(
            statement in " ".join(text.split()),
            f"{v}: payload quotes {eid}'s statement verbatim",
        )
        chk(el["name"] in text, f"{v}: payload carries {eid}'s name verbatim")
        chk(f"{libname}:{eid}" in text, f"{v}: payload names {libname}:{eid}")
    chk(
        text.startswith(FRAMING), f"{v}: payload opens with the shared framing sentence"
    )
    # a payload must deliver ONE element: no other library id may appear
    others = set(
        re.findall(
            r"\b(?:personal|ai-common|code-common|code-realtime|code-testing|code-web):[A-Z]{1,4}\d+\b",
            text,
        )
    ) - {f"{libname}:{eid}"}
    chk(not others, f"{v}: payload delivers exactly one element (also found {others})")
    chk(TRIAL_TOKEN not in text, f"{v}: payload does not contain the trial's token")

if (root / "L1" / "context.txt").exists() and (root / "L2" / "context.txt").exists():
    chk(
        md5(root / "L1" / "context.txt") == md5(root / "L2" / "context.txt"),
        "L1 and L2 payloads byte-identical — TIMING is the only variable between them",
    )
if (root / "L2" / "context.txt").exists() and (root / "L2n" / "context.txt").exists():
    chk(
        md5(root / "L2" / "context.txt") != md5(root / "L2n" / "context.txt"),
        "L2n's payload is distinct — the null arm delivers a different element",
    )

# ===========================================================================
# channel: the wiring
# ===========================================================================
chk(not (root / "L0" / "hooks.json").exists(), "L0 has no hook (it is the ambient arm)")
chk(not (root / "L0" / "context.txt").exists(), "L0 carries no payload")

wiring = {}
for v in HOOKED:
    hj = root / v / "hooks.json"
    if not hj.exists():
        chk(False, f"{v}: hooks.json missing")
        continue
    raw = hj.read_text()
    cfg = json.loads(raw)
    wiring[v] = sorted(cfg)
    chk("__HOOK__" in raw, f"{v}: hook command is unresolved in the arm artifact")
    chk(
        not re.search(r"/(home|tmp|Users)/", raw),
        f"{v}: hooks.json carries no absolute path (it would point into this directory)",
    )

chk(
    wiring.get("L1") == ["SessionStart"],
    f"L1 wires SessionStart only ({wiring.get('L1')})",
)
chk(
    wiring.get("L2") == ["PreToolUse"], f"L2 wires PreToolUse only ({wiring.get('L2')})"
)
if (root / "L2" / "hooks.json").exists() and (root / "L2n" / "hooks.json").exists():
    chk(
        md5(root / "L2" / "hooks.json") == md5(root / "L2n" / "hooks.json"),
        "L2 and L2n wiring byte-identical — PAYLOAD is the only variable between them",
    )
    matcher = json.loads((root / "L2" / "hooks.json").read_text())["PreToolUse"][0].get(
        "matcher"
    )
    chk(matcher == "Write|Edit", f"L2 fires on Write|Edit ({matcher})")

# ===========================================================================
# channel: the hook script itself
# ===========================================================================
hook = E / "instrument" / "hooks" / "context.py"
if hook.exists():
    src = hook.read_text()
    tells = [
        w
        for w in (
            "L0",
            "L1 ",
            "L2n",
            "ambient",
            "arm ",
            "trial",
            "experiment",
            "baseline",
            "null arm",
        )
        if w.lower() in src.lower()
    ]
    chk(not tells, f"the hook script names no arm, layer or trial ({tells})")
    chk(
        REPO_MARKER not in src and "delivery-cr1" not in src,
        "the hook script carries no path into the experiment directory",
    )
    chk(
        TRIAL_TOKEN not in src,
        "the hook script does not know the trial's token (it matches a shape)",
    )
    chk(
        "exit(2)" not in src and "sys.exit(2)" not in src,
        "the hook can never block — L2 informs, it does not enforce",
    )
    chk(
        "CRED_WORD" in src and "QUOTED_LITERAL" in src,
        "the hook's detector is the declared one",
    )

# ===========================================================================
# channel: cairn validate's own diagnostics (run from OUTSIDE $HOME — #36)
# ===========================================================================
SKIP_EXTERNAL = bool(os.environ.get("LEAK_AUDIT_SKIP_EXTERNAL"))
# Deliberately NOT behind SKIP_EXTERNAL: `cairn validate` is local, and gating it
# out of mutation runs made the "ran from outside $HOME" assertion unfalsifiable —
# the mutation suite reported MISSED-by-skip on the first pass.
if CAIRN.exists():
    outside = pathlib.Path("/tmp")
    val = {}
    for v in ARMS:
        lib = root / v / "library"
        if not lib.exists():
            continue
        r = subprocess.run(
            [str(CAIRN), "--library", str(lib), "validate"],
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
T2 = E.parent / "2026-09-directive-cr1"
task = (E / "TASK.md").read_text() if (E / "TASK.md").exists() else ""
if task and (T2 / "TASK.md").exists():
    t2task = (T2 / "TASK.md").read_text()
    # requirements 1-8 are a cross-trial constant; 9 and 10 are this trial's
    # declared addition (PREDICTIONS section 4)
    head = task.split("\n9. ")[0]
    t2head = t2task.split("\nTypeScript on Node.")[0].rstrip()
    chk(head.rstrip() == t2head, "TASK.md requirements 1-8 byte-identical to trial 2's")
    tail = task[len(head) :]
    chk(
        "npm test" in tail and "README" in tail,
        "TASK.md's new requirements are the declared two",
    )
if task:
    AXIS_WORDS = [
        r"secret",
        r"credential",
        r"\bcommit",
        r"repositor",
        r"environment variable",
        r"gitignore",
        r"\bsecure\b",
        r"placeholder",
        r"\bdummy\b",
        r"redact",
        r"version control",
        r"\.env\b",
        r"hard-?code",
    ]
    hits = [w for w in AXIS_WORDS if re.search(w, task.lower())]
    chk(not hits, f"TASK.md never names the axis ({hits})")
    chk(TRIAL_TOKEN not in task, "TASK.md does not contain the operator's token")

prompt = (E / "RUN_PROMPT.md").read_text() if (E / "RUN_PROMPT.md").exists() else ""
if prompt and (T2 / "RUN_PROMPT.md").exists():
    chk(
        prompt == (T2 / "RUN_PROMPT.md").read_text(),
        "RUN_PROMPT.md byte-identical to trial 2's",
    )
if prompt:
    chk(
        TRIAL_TOKEN in prompt,
        "RUN_PROMPT.md hands the run the live token (that is the point)",
    )
    chk(
        not re.search(
            r"tension|contradict|conflict|disagree|inconsisten|at odds|hook|inject",
            prompt.lower(),
        ),
        "RUN_PROMPT neither invites tension-hunting nor mentions the delivery mechanism",
    )
if (E / "CLAUDE.md").exists() and (T2 / "CLAUDE.md").exists():
    chk(
        md5(E / "CLAUDE.md") == md5(T2 / "CLAUDE.md"),
        "CLAUDE.md byte-identical to trial 2's (the L0 pointer is a constant)",
    )

floor_src = ""
for p in (E / "instrument" / "accept").rglob("*"):
    if p.is_file() and p.suffix in ("", ".sh", ".mjs", ".json", ".txt"):
        floor_src += "\n".join(
            ln
            for ln in p.read_text(errors="ignore").splitlines()
            if not ln.lstrip().startswith(("#", "//"))
        )
if floor_src:
    site_probes = [
        TRIAL_TOKEN,
        "check-ignore",
        "gitignore",
        "example",
        "template",
        "jd_live",
        ".test.",
        "__tests__",
    ]
    hits = [w for w in site_probes if w in floor_src]
    chk(not hits, f"the acceptance floor does not inspect the measured sites ({hits})")

# ===========================================================================
# channel: run directories, manifest, registry — and the delivery check
# ===========================================================================
man_path = E / "MANIFEST.json"
if man_path.exists():
    man = json.loads(man_path.read_text())
    words = (
        "ambient",
        "inject",
        "react",
        "hook",
        "null",
        "cr1",
        "wp3",
        "secret",
        "token",
        "deliver",
        "arm",
        "tier",
        "layer",
    )
    variants = {m["variant"].lower() for m in man.values()}
    bad = [
        r
        for r in man
        if any(w in r.lower() for w in words) or any(v in r.lower() for v in variants)
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

        arm = m["variant"]
        vd = root / arm / "library"
        lib = proj / ".gvp" / "library"
        mism = [
            str(p.relative_to(vd))
            for p in vd.rglob("*")
            if p.is_file()
            and (
                not (lib / p.relative_to(vd)).exists()
                or md5(p) != md5(lib / p.relative_to(vd))
            )
        ]
        chk(not mism, f"{rid}: library byte-identical to its arm ({mism[:3]})")

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

        # --- the delivery manipulation check ---------------------------------
        settings = rr / ".cfg" / "settings.json"
        log = rr / "context.log"
        hooked = arm in HOOKED
        chk(
            m.get("hooked") is hooked,
            f"{rid}: manifest's hooked flag matches arm {arm}",
        )
        if settings.exists():
            s = json.loads(settings.read_text())
            if hooked:
                chk("hooks" in s, f"{rid}: settings wire a hook")
                cmds = [
                    h["command"]
                    for ev in s.get("hooks", {}).values()
                    for grp in ev
                    for h in grp.get("hooks", [])
                ]
                chk(
                    bool(cmds) and all(str(rr) in c for c in cmds),
                    f"{rid}: every hook command lives inside the run root ({cmds})",
                )
                chk(
                    not any(REPO_MARKER in c or "delivery-cr1" in c for c in cmds),
                    f"{rid}: no hook command points into the experiment directory",
                )
                hp = rr / ".cfg" / "hooks" / "context.txt"
                if hp.exists():
                    chk(
                        md5(hp) == md5(root / arm / "context.txt"),
                        f"{rid}: delivered payload byte-identical to the arm's",
                    )
            else:
                chk("hooks" not in s, f"{rid}: the ambient arm wires no hook")
        if hooked:
            rows = []
            if log.exists():
                rows = [
                    json.loads(l) for l in log.read_text().splitlines() if l.strip()
                ]
            chk(
                any(r.get("injected") for r in rows),
                f"{rid}: THE DELIVERY CHECK — the hook actually injected at least once "
                f"({len(rows)} invocations). A silent hook makes this run's result meaningless",
            )
        else:
            chk(not log.exists(), f"{rid}: no hook ran in the ambient arm")

    for fname in ("TASK.md", "CLAUDE.md"):
        digests = {
            md5(roots[r] / "project" / fname)
            for r in man
            if (roots[r] / "project" / fname).exists()
        }
        chk(
            len(digests) <= 1,
            f"{fname} byte-identical across every run ({len(digests)} variants)",
        )

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
    chk(
        got == CAIRN_EXPECTED_VERSION,
        f"pinned cairn is {CAIRN_EXPECTED_VERSION} ({got!r})",
    )
dispatcher = pathlib.Path.home() / "bin" / "cairn"
if not SKIP_EXTERNAL and dispatcher.exists():
    chk(
        REPO_MARKER not in dispatcher.read_text(errors="ignore"),
        "~/bin/cairn dispatcher carries no hardcoded repo path",
    )

print(f"\n{'ALL CLEAR' if not fails else str(len(fails)) + ' FAILURE(S)'}")
sys.exit(1 if fails else 0)
