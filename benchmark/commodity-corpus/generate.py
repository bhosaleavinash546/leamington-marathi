#!/usr/bin/env python3
"""
COMMODITY CORPUS — ten automotive commodities, ten variants each.

WHY THIS EXISTS, and how it differs from benchmark/dfm-fixtures.

`dfm-fixtures` are ACCURACY fixtures: tiny parts whose every measurement is
known by arithmetic, used to prove the kernel returns the right number. They are
deliberately unlike real parts.

This corpus is a COVERAGE corpus. It asks a different question — not "is the
number right" but "on a hundred parts of the kind a plant actually makes, how
much of the catalogue can this tool evaluate at all, and does it ever say
something obviously wrong?" A rule that is correct and abstains on every real
part is worth nothing, and no fixture in the accuracy set can reveal that.

Each variant carries its INTENT in the manifest: which process a plant would
actually use, and the design parameters it was built from. The sweep compares
the engine's answer against the intent and reports where they disagree.

    python3 benchmark/commodity-corpus/generate.py [outdir]

Requires cadquery-ocp. Writes N STEP files plus manifest.json.
"""
import json
import math
import os
import re
import sys

from OCP.BRepAlgoAPI import BRepAlgoAPI_Cut, BRepAlgoAPI_Fuse
from OCP.BRepBuilderAPI import BRepBuilderAPI_MakeFace, BRepBuilderAPI_MakePolygon
from OCP.BRepFilletAPI import BRepFilletAPI_MakeFillet
from OCP.BRepPrimAPI import (BRepPrimAPI_MakeBox, BRepPrimAPI_MakeCylinder,
                             BRepPrimAPI_MakePrism, BRepPrimAPI_MakeRevol)
from OCP.gp import gp_Ax1, gp_Ax2, gp_Dir, gp_Pnt, gp_Trsf, gp_Vec
from OCP.BRepBuilderAPI import BRepBuilderAPI_Transform
from OCP.Interface import Interface_Static
from OCP.STEPControl import STEPControl_AsIs, STEPControl_Writer
from OCP.TopExp import TopExp_Explorer
from OCP.TopAbs import TopAbs_ShapeEnum
from OCP.TopoDS import TopoDS

_STAMP_RE = re.compile(rb"(FILE_NAME\([^,]*,')[^']*(')")


def _write(shape, path):
    Interface_Static.SetCVal_s("write.step.product.name", os.path.basename(path))
    w = STEPControl_Writer()
    w.Transfer(shape, STEPControl_AsIs)
    w.Write(path)
    with open(path, "rb") as fh:
        data = fh.read()
    data = _STAMP_RE.sub(rb"\g<1>1970-01-01T00:00:00\g<2>", data)
    with open(path, "wb") as fh:
        fh.write(data)
    return path


def _move(shape, dx, dy, dz):
    t = gp_Trsf()
    t.SetTranslation(gp_Vec(dx, dy, dz))
    return BRepBuilderAPI_Transform(shape, t, True).Shape()


def _fillet_all(shape, r):
    """Fillet every edge, skipping the ones OCCT refuses rather than failing the
    whole part — a real model has edges a blend cannot reach either."""
    try:
        mk = BRepFilletAPI_MakeFillet(shape)
        exp = TopExp_Explorer(shape, TopAbs_ShapeEnum.TopAbs_EDGE)
        n = 0
        while exp.More():
            mk.Add(r, TopoDS.Edge_s(exp.Current()))
            exp.Next()
            n += 1
        if n == 0:
            return shape
        return mk.Shape()
    except Exception:
        return shape


def _wire(points):
    mk = BRepBuilderAPI_MakePolygon()
    for p in points:
        mk.Add(gp_Pnt(*p))
    mk.Close()
    return mk.Wire()


# ─── Commodities ──────────────────────────────────────────────────────────────
#
# Each builder takes a variant index 0-9 and returns (shape, params). The
# parameters vary across a range a real programme would span, so the corpus
# exercises the thin end and the thick end of every rule rather than one
# comfortable middle.

def sheet_bracket(i):
    """Stamped L-bracket: base + upstand + pierced holes. Thin, folded, holes."""
    t = [0.8, 1.0, 1.2, 1.5, 1.6, 2.0, 2.5, 3.0, 1.4, 1.8][i]
    L, W, H = 90 + i * 8, 55, 34 + i * 3
    r = t * [1.0, 1.0, 1.5, 1.5, 2.0, 2.0, 1.0, 3.0, 1.2, 2.5][i]
    hole = [4.0, 5.0, 6.0, 6.5, 8.0, 9.0, 10.0, 12.0, 3.5, 7.0][i]
    base = BRepPrimAPI_MakeBox(L, W, t).Shape()
    up = _move(BRepPrimAPI_MakeBox(t, W, H).Shape(), L - t, 0, 0)
    s = BRepAlgoAPI_Fuse(base, up).Shape()
    for k in range(3):
        x = 14 + k * (L - 34) / 2.0
        cut = BRepPrimAPI_MakeCylinder(
            gp_Ax2(gp_Pnt(x, W / 2.0, -1), gp_Dir(0, 0, 1)), hole / 2.0, t + 2).Shape()
        s = BRepAlgoAPI_Cut(s, cut).Shape()
    s = _fillet_all(s, min(r, t * 1.2))
    return s, {"thicknessMm": t, "holeDiaMm": hole, "insideRadiusMm": r}


def hpdc_housing(i):
    """Die-cast housing: walled box, ribs, cored bosses. Wall is the story."""
    w = [1.2, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 5.0, 2.2, 6.0][i]
    L, W, H = 110, 80, 42 + i * 2
    outer = BRepPrimAPI_MakeBox(L, W, H).Shape()
    inner = _move(BRepPrimAPI_MakeBox(L - 2 * w, W - 2 * w, H).Shape(), w, w, w)
    s = BRepAlgoAPI_Cut(outer, inner).Shape()
    for k in range(2):                       # ribs on the floor
        rib = _move(BRepPrimAPI_MakeBox(w * 0.7, W - 2 * w, H * 0.35).Shape(),
                    30 + k * 40, w, w)
        s = BRepAlgoAPI_Fuse(s, rib).Shape()
    bore = [2.0, 2.5, 3.0, 4.0, 5.0, 6.0, 8.0, 10.0, 3.5, 12.0][i]
    for k in range(2):                       # cored bosses through the floor
        boss = BRepPrimAPI_MakeCylinder(
            gp_Ax2(gp_Pnt(22 + k * 66, W / 2.0, 0), gp_Dir(0, 0, 1)), bore, H * 0.5).Shape()
        s = BRepAlgoAPI_Fuse(s, boss).Shape()
        hole = BRepPrimAPI_MakeCylinder(
            gp_Ax2(gp_Pnt(22 + k * 66, W / 2.0, -1), gp_Dir(0, 0, 1)), bore / 2.0, H).Shape()
        s = BRepAlgoAPI_Cut(s, hole).Shape()
    return s, {"wallMm": w, "coredHoleDiaMm": bore}


def machined_block(i):
    """Prismatic machined part: pockets of varying slenderness, drilled holes."""
    L, W, H = 100, 70, 30 + i * 4
    depth = [6, 10, 14, 18, 22, 26, 30, 34, 12, 40][i]
    width = [40, 30, 24, 18, 14, 10, 8, 6, 20, 5][i]
    hole = [3.0, 4.0, 5.0, 6.0, 8.0, 10.0, 12.0, 2.5, 7.0, 16.0][i]
    s = BRepPrimAPI_MakeBox(L, W, H).Shape()
    pocket = _move(BRepPrimAPI_MakeBox(width, W - 24, depth + 1).Shape(),
                   (L - width) / 2.0, 12, H - depth)
    s = BRepAlgoAPI_Cut(s, pocket).Shape()
    for k in range(2):
        cut = BRepPrimAPI_MakeCylinder(
            gp_Ax2(gp_Pnt(14 + k * (L - 28), W / 2.0, -1), gp_Dir(0, 0, 1)), hole / 2.0, H + 2).Shape()
        s = BRepAlgoAPI_Cut(s, cut).Shape()
    s = _fillet_all(s, [4.0, 3.0, 2.5, 2.0, 1.5, 1.2, 1.0, 0.8, 3.5, 0.5][i])
    return s, {"pocketDepthMm": depth, "pocketWidthMm": width, "holeDiaMm": hole}


def turned_shaft(i):
    """Stepped shaft — a body of revolution, which is a SHAPE test as well as
    a size one: the lathe and the spinning families both ask about it."""
    d1 = [20, 24, 28, 30, 34, 40, 45, 18, 26, 50][i]
    L = [60, 90, 120, 160, 200, 240, 300, 340, 150, 90][i]
    s = BRepPrimAPI_MakeCylinder(gp_Ax2(gp_Pnt(0, 0, 0), gp_Dir(0, 0, 1)), d1 / 2.0, L).Shape()
    step = BRepPrimAPI_MakeCylinder(
        gp_Ax2(gp_Pnt(0, 0, L * 0.6), gp_Dir(0, 0, 1)), d1 / 3.0, L * 0.4 + 1).Shape()
    s = BRepAlgoAPI_Cut(s, step).Shape()
    bore = [4, 5, 6, 8, 3, 10, 12, 2.5, 7, 14][i]
    s = BRepAlgoAPI_Cut(s, BRepPrimAPI_MakeCylinder(
        gp_Ax2(gp_Pnt(0, 0, -1), gp_Dir(0, 0, 1)), bore / 2.0, L + 2).Shape()).Shape()
    return s, {"diaMm": d1, "lengthMm": L, "boreMm": bore, "slendernessLtoD": round(L / d1, 2)}


def sand_cast_arm(i):
    """Chunky sand casting: heavy sections, generous radii, a cored eye."""
    t = [8, 10, 12, 14, 16, 20, 24, 6, 18, 28][i]
    L = 150 + i * 10
    s = BRepPrimAPI_MakeBox(L, 46, t).Shape()
    for x in (24.0, float(L - 24)):
        eye = BRepPrimAPI_MakeCylinder(gp_Ax2(gp_Pnt(x, 23, 0), gp_Dir(0, 0, 1)), 23, t).Shape()
        s = BRepAlgoAPI_Fuse(s, eye).Shape()
    bore = [8, 10, 12, 16, 20, 24, 30, 6, 18, 36][i]
    for x in (24.0, float(L - 24)):
        s = BRepAlgoAPI_Cut(s, BRepPrimAPI_MakeCylinder(
            gp_Ax2(gp_Pnt(x, 23, -1), gp_Dir(0, 0, 1)), bore / 2.0, t + 2).Shape()).Shape()
    s = _fillet_all(s, min(t / 3.0, 6.0))
    return s, {"sectionMm": t, "coredHoleDiaMm": bore}


def moulded_cover(i):
    """Injection-moulded cover: thin wall, ribs, draft on the side walls."""
    w = [0.8, 1.0, 1.2, 1.5, 2.0, 2.5, 3.0, 4.0, 1.8, 5.0][i]
    L, W, H = 120, 90, 24
    draft = [0.0, 0.5, 1.0, 1.5, 2.0, 3.0, 0.0, 1.0, 2.5, 0.5][i]
    # A drafted box: two faces lofted would be cleaner, but a tapered prism from
    # a trapezoid section gives an exact, known wall draft.
    dx = H * math.tan(math.radians(draft))
    outer = _wire([(0, 0, 0), (L, 0, 0), (L - dx, 0, H), (dx, 0, H)])
    face = BRepBuilderAPI_MakeFace(outer).Face()
    solid = BRepPrimAPI_MakePrism(face, gp_Vec(0, W, 0)).Shape()
    inner = _wire([(w, w, w), (L - w, w, w), (L - dx - w, w, H + 1), (dx + w, w, H + 1)])
    icut = BRepPrimAPI_MakePrism(BRepBuilderAPI_MakeFace(inner).Face(),
                                 gp_Vec(0, W - 2 * w, 0)).Shape()
    s = BRepAlgoAPI_Cut(solid, icut).Shape()
    rib = _move(BRepPrimAPI_MakeBox(w * 0.6, W - 2 * w, H * 0.4).Shape(), L / 2.0, w, w)
    s = BRepAlgoAPI_Fuse(s, rib).Shape()
    return s, {"wallMm": w, "draftDeg": draft}


def forged_lever(i):
    """Forged lever: a web between two bosses, generous draft, no undercuts."""
    web = [4, 5, 6, 8, 10, 12, 3, 14, 7, 16][i]
    L = 120 + i * 8
    s = BRepPrimAPI_MakeBox(L, 34, web).Shape()
    for x, r in ((20.0, 20.0), (float(L - 20), 16.0)):
        s = BRepAlgoAPI_Fuse(s, BRepPrimAPI_MakeCylinder(
            gp_Ax2(gp_Pnt(x, 17, 0), gp_Dir(0, 0, 1)), r, web * 2.2).Shape()).Shape()
    bore = [10, 12, 14, 16, 20, 24, 8, 26, 18, 30][i]
    for x in (20.0, float(L - 20)):
        s = BRepAlgoAPI_Cut(s, BRepPrimAPI_MakeCylinder(
            gp_Ax2(gp_Pnt(x, 17, -1), gp_Dir(0, 0, 1)), bore / 2.0, web * 3).Shape()).Shape()
    s = _fillet_all(s, min(web / 2.0, 4.0))
    return s, {"webMm": web, "boreMm": bore}


def extruded_profile(i):
    """Constant-section profile: a U-channel of varying wall, cut to length."""
    w = [1.0, 1.5, 2.0, 2.5, 3.0, 4.0, 5.0, 0.8, 3.5, 6.0][i]
    W, H, L = 60, 40, 200 + i * 20
    outer = BRepPrimAPI_MakeBox(W, L, H).Shape()
    inner = _move(BRepPrimAPI_MakeBox(W - 2 * w, L + 2, H).Shape(), w, -1, w)
    s = BRepAlgoAPI_Cut(outer, inner).Shape()
    return s, {"wallMm": w, "lengthMm": L}


def drawn_cup(i):
    """Deep-drawn cup: the depth/diameter ratio is the whole question."""
    d = [60, 60, 60, 60, 60, 50, 45, 70, 55, 40][i]
    depth = [10, 20, 30, 45, 60, 55, 60, 25, 40, 70][i]
    t = [0.8, 1.0, 1.2, 1.5, 1.0, 1.2, 0.9, 1.6, 1.1, 0.7][i]
    outer = BRepPrimAPI_MakeCylinder(gp_Ax2(gp_Pnt(0, 0, 0), gp_Dir(0, 0, 1)), d / 2.0, depth).Shape()
    inner = BRepPrimAPI_MakeCylinder(
        gp_Ax2(gp_Pnt(0, 0, t), gp_Dir(0, 0, 1)), d / 2.0 - t, depth).Shape()
    s = BRepAlgoAPI_Cut(outer, inner).Shape()
    return s, {"diaMm": d, "depthMm": depth, "thicknessMm": t,
               "depthToWidth": round(depth / d, 2)}


def pressed_gear_blank(i):
    """Powder-metal gear blank: a flat disc with a bore and drilled webs — every
    feature on ONE press axis, which is the family's whole constraint."""
    d = [40, 50, 60, 70, 80, 90, 30, 100, 65, 110][i]
    t = [6, 8, 10, 12, 14, 16, 5, 18, 11, 20][i]
    s = BRepPrimAPI_MakeCylinder(gp_Ax2(gp_Pnt(0, 0, 0), gp_Dir(0, 0, 1)), d / 2.0, t).Shape()
    s = BRepAlgoAPI_Cut(s, BRepPrimAPI_MakeCylinder(
        gp_Ax2(gp_Pnt(0, 0, -1), gp_Dir(0, 0, 1)), d / 6.0, t + 2).Shape()).Shape()
    hole = [4, 5, 6, 8, 10, 12, 3, 14, 7, 16][i]
    for k in range(4):
        a = k * math.pi / 2.0
        s = BRepAlgoAPI_Cut(s, BRepPrimAPI_MakeCylinder(
            gp_Ax2(gp_Pnt(math.cos(a) * d / 3.2, math.sin(a) * d / 3.2, -1), gp_Dir(0, 0, 1)),
            hole / 2.0, t + 2).Shape()).Shape()
    return s, {"diaMm": d, "thicknessMm": t, "webHoleDiaMm": hole}


COMMODITIES = [
    ("sheet-bracket", sheet_bracket, "Stamping / Deep Drawing", "Steel (mild)", "sheet-metal"),
    ("hpdc-housing", hpdc_housing, "Die Casting (Aluminium)", "Aluminium A380 / ADC12 (die-cast)", "hpdc"),
    ("machined-block", machined_block, "Machining (CNC)", "Aluminium 6061", "machining"),
    ("turned-shaft", turned_shaft, "Turning (CNC)", "Steel 42CrMo4 / 4140", "turning"),
    ("sand-cast-arm", sand_cast_arm, "Sand Casting", "Cast Iron (Ductile/GJS)", "sand-casting"),
    ("moulded-cover", moulded_cover, "Injection Moulding", "PA66-GF30 (glass-filled)", "injection-moulding"),
    ("forged-lever", forged_lever, "Forging (Hot)", "Steel 42CrMo4 / 4140", "forging-hot"),
    ("extruded-profile", extruded_profile, "Extrusion", "Aluminium 6082", "extrusion"),
    ("drawn-cup", drawn_cup, "Deep Drawing (Multi-stage)", "Steel (mild)", "deep-drawing"),
    ("gear-blank", pressed_gear_blank, "Powder Metallurgy (Press & Sinter)", "Steel (mild)", "powder-metallurgy"),
]


def _build_one(outdir, name, i):
    """Build exactly one part. Run in its OWN process by main()."""
    fn = dict((c[0], c[1]) for c in COMMODITIES)[name]
    shape, params = fn(i)
    fname = f"{name}-{i:02d}.step"
    _write(shape, os.path.join(outdir, fname))
    print("PARAMS " + json.dumps(params))


def main():
    # ONE PROCESS PER PART, and it is not defensiveness for its own sake: the
    # kernel SEGFAULTED filleting a fused lever on the first run and took the
    # whole corpus with it, sixty parts in. A crash inside OCCT cannot be caught
    # by a try block — the interpreter is already gone — so the only way to make
    # it data rather than a dead run is to put a process boundary around it.
    # A part the kernel cannot build is itself a finding about the kernel.
    import subprocess
    outdir = sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(os.path.abspath(__file__))

    if len(sys.argv) > 3:                      # child: build one and exit
        _build_one(outdir, sys.argv[2], int(sys.argv[3]))
        return

    os.makedirs(outdir, exist_ok=True)
    manifest = []
    for name, _fn, process, material, family in COMMODITIES:
        for i in range(10):
            fname = f"{name}-{i:02d}.step"
            row = {"file": fname, "commodity": name, "variant": i,
                   "intendedProcess": process, "material": material, "intendedFamily": family}
            r = subprocess.run([sys.executable, os.path.abspath(__file__), outdir, name, str(i)],
                               capture_output=True, text=True, timeout=300)
            if r.returncode != 0 or not os.path.exists(os.path.join(outdir, fname)):
                sig = "segfault" if r.returncode == -11 else f"exit {r.returncode}"
                tail = (r.stderr or "").strip().splitlines()[-1:] or [""]
                row["buildError"] = f"{sig}: {tail[0][:160]}"
                print(f"  !! {fname:28s} {row['buildError']}")
            else:
                line = next((l for l in r.stdout.splitlines() if l.startswith("PARAMS ")), None)
                row["params"] = json.loads(line[7:]) if line else {}
                print(f"  {fname:28s} {row['params']}")
            manifest.append(row)

    with open(os.path.join(outdir, "manifest.json"), "w") as fh:
        json.dump(manifest, fh, indent=1)
    ok = sum(1 for m in manifest if "buildError" not in m)
    print(f"\nwrote {ok} of {len(manifest)} parts to {outdir}")


if __name__ == "__main__":
    main()
