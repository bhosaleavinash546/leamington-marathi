#!/usr/bin/env python3
"""
Generate DFM benchmark fixtures as STEP files whose ground truth is ANALYTIC.

Every part here is built from primitives whose draft angle, wall thickness, hole
table and undercut count are known exactly from the construction — not measured
by the thing under test and not eyeballed from a render. That is the whole point:
`benchmark/dfm-run.mjs` compares the engine against arithmetic, so a regression
cannot hide behind "looks about right".

The truth values are declared alongside each part in benchmark/dfm-fixtures.mjs
and MUST be derived from the construction parameters below, never copied back
from engine output. If a fixture and the engine disagree, one of them is wrong
and the fixture is the one with the proof.

    python3 benchmark/dfm-fixtures/generate.py [outdir]

Requires cadquery-ocp (same wheel the geometry engine uses). Idempotent: the
files are byte-comparable across runs, so they can be committed and CI need not
have OCP installed to READ them.
"""
import math
import re
import os
import sys

from OCP.BRepAlgoAPI import BRepAlgoAPI_Cut, BRepAlgoAPI_Fuse
from OCP.BRepBuilderAPI import BRepBuilderAPI_MakePolygon
from OCP.BRepOffsetAPI import BRepOffsetAPI_ThruSections
from OCP.BRepPrimAPI import BRepPrimAPI_MakeBox, BRepPrimAPI_MakeCylinder
from OCP.gp import gp_Ax2, gp_Dir, gp_Pnt
from OCP.Interface import Interface_Static
from OCP.STEPControl import STEPControl_AsIs, STEPControl_Writer


# OCCT stamps the wall-clock time into the STEP header, so every regeneration
# rewrote all sixteen committed fixtures with nothing but a new timestamp — the
# docstring below promised byte-comparable output and did not deliver it. The
# stamp is normalised to a fixed value so a diff on a fixture means the GEOMETRY
# moved, which is the only reason anyone should be reviewing one.
_EPOCH_STAMP = "1970-01-01T00:00:00"
_STAMP_RE = re.compile(rb"(FILE_NAME\([^,]*,')[^']*(')")


def _write(shape, path):
    Interface_Static.SetCVal_s("write.step.product.name", os.path.basename(path))
    w = STEPControl_Writer()
    w.Transfer(shape, STEPControl_AsIs)
    w.Write(path)
    with open(path, "rb") as fh:
        data = fh.read()
    data, n = _STAMP_RE.subn(rb"\g<1>" + _EPOCH_STAMP.encode() + rb"\g<2>", data, count=1)
    if n != 1:
        raise RuntimeError(f"{path}: could not normalise the STEP timestamp — "
                           "the header format changed and fixtures would churn")
    with open(path, "wb") as fh:
        fh.write(data)
    return path


def _wire(points):
    poly = BRepBuilderAPI_MakePolygon()
    for p in points:
        poly.Add(gp_Pnt(*p))
    poly.Close()
    return poly.Wire()


# ── Fixtures ─────────────────────────────────────────────────────────────────

def plate_two_holes(outdir):
    """60x40x10 plate. Ø10 through hole; Ø8 blind hole 6 deep from the top.

    Truth: volume = 60*40*10 - pi*5^2*10 - pi*4^2*6 = 22913.0 mm^3 (checked below).
    Wall thickness through the plate = 10.00 mm everywhere except under the blind
    hole, where it is 10 - 6 = 4.00 mm. Zero draft on the four vertical walls, so
    a +Z draw has ZERO undercuts but 100% of the wall area below any draft minimum.
    """
    box = BRepPrimAPI_MakeBox(60.0, 40.0, 10.0).Shape()
    through = BRepPrimAPI_MakeCylinder(gp_Ax2(gp_Pnt(15, 20, -1), gp_Dir(0, 0, 1)), 5.0, 12.0).Shape()
    blind = BRepPrimAPI_MakeCylinder(gp_Ax2(gp_Pnt(45, 20, 4), gp_Dir(0, 0, 1)), 4.0, 6.5).Shape()
    s = BRepAlgoAPI_Cut(box, through).Shape()
    s = BRepAlgoAPI_Cut(s, blind).Shape()
    vol = 60 * 40 * 10 - math.pi * 25 * 10 - math.pi * 16 * 6
    return _write(s, os.path.join(outdir, "plate-two-holes.step")), round(vol, 1)


def frustum_draft3(outdir):
    """Truncated pyramid, base 60x40, height 20, EXACTLY 3.000 deg draft per side.

    Truth: every one of the four side walls sits at 3.000 deg to the +Z draw.
    Zero undercuts. The current engine reports ZERO drafted faces on this part
    because ThruSections yields B-spline walls and the old code only inspected
    PLANE/CYLINDER — this fixture exists to keep that bug dead.
    """
    h = 20.0
    inset = math.tan(math.radians(3.0)) * h
    ts = BRepOffsetAPI_ThruSections(True, True)
    ts.AddWire(_wire([(0, 0, 0), (60, 0, 0), (60, 40, 0), (0, 40, 0)]))
    ts.AddWire(_wire([(inset, inset, h), (60 - inset, inset, h),
                      (60 - inset, 40 - inset, h), (inset, 40 - inset, h)]))
    ts.Build()
    return _write(ts.Shape(), os.path.join(outdir, "frustum-draft3.step")), 3.0


def box_side_hole(outdir):
    """60x40x30 box with a Ø12 hole straight through along X.

    Truth: for a +Z draw the hole's cylindrical wall is a TRUE undercut — it is
    occluded in both half directions and needs a side action. Exactly one undercut
    region. The four vertical box walls are zero-draft DRAG faces, not undercuts;
    conflating the two is the classification error this fixture guards.
    """
    box = BRepPrimAPI_MakeBox(60.0, 40.0, 30.0).Shape()
    side = BRepPrimAPI_MakeCylinder(gp_Ax2(gp_Pnt(-1, 20, 15), gp_Dir(1, 0, 0)), 6.0, 62.0).Shape()
    return _write(BRepAlgoAPI_Cut(box, side).Shape(), os.path.join(outdir, "box-side-hole.step")), 1


def shell_wall25(outdir):
    """Open-topped box, outer 50x50x30, wall EXACTLY 2.50 mm on all four sides
    and the floor. Truth: wall thickness p50 = 2.50 mm."""
    t = 2.5
    outer = BRepPrimAPI_MakeBox(50.0, 50.0, 30.0).Shape()
    cavity = BRepPrimAPI_MakeBox(gp_Pnt(t, t, t), 50.0 - 2 * t, 50.0 - 2 * t, 30.0).Shape()
    return _write(BRepAlgoAPI_Cut(outer, cavity).Shape(), os.path.join(outdir, "shell-wall25.step")), t


def boss_plate(outdir):
    """40x40x8 plate with one Ø16 x 12 tall cylindrical boss on top, and a Ø6
    through hole down its axis. Truth: 1 boss (convex cylinder), 1 through hole."""
    plate = BRepPrimAPI_MakeBox(40.0, 40.0, 8.0).Shape()
    boss = BRepPrimAPI_MakeCylinder(gp_Ax2(gp_Pnt(20, 20, 8), gp_Dir(0, 0, 1)), 8.0, 12.0).Shape()
    hole = BRepPrimAPI_MakeCylinder(gp_Ax2(gp_Pnt(20, 20, -1), gp_Dir(0, 0, 1)), 3.0, 24.0).Shape()
    s = BRepAlgoAPI_Fuse(plate, boss).Shape()
    return _write(BRepAlgoAPI_Cut(s, hole).Shape(), os.path.join(outdir, "boss-plate.step")), 1


def counterbore_plate(outdir):
    """60x60x20 plate. Ø8 through hole with a Ø16 counterbore 6 deep.

    Truth: two COAXIAL cylinders of stepped radius plus a flat annular shoulder —
    that triple is what makes it a counterbore rather than two unrelated holes.
    """
    plate = BRepPrimAPI_MakeBox(60.0, 60.0, 20.0).Shape()
    thru = BRepPrimAPI_MakeCylinder(gp_Ax2(gp_Pnt(30, 30, -1), gp_Dir(0, 0, 1)), 4.0, 22.0).Shape()
    cbore = BRepPrimAPI_MakeCylinder(gp_Ax2(gp_Pnt(30, 30, 14), gp_Dir(0, 0, 1)), 8.0, 7.0).Shape()
    s = BRepAlgoAPI_Cut(plate, thru).Shape()
    s = BRepAlgoAPI_Cut(s, cbore).Shape()
    return _write(s, os.path.join(outdir, "counterbore-plate.step")), {"boreDia": 8.0, "cboreDia": 16.0, "cboreDepth": 6.0}


def countersink_plate(outdir):
    """60x60x20 plate. Ø8 through hole with a 90 deg countersink to Ø16 at the top.

    Truth: a CONE at the mouth of a coaxial cylinder. A cone is what separates a
    countersink from a counterbore; recognising one as the other would put the
    wrong tool on the process sheet.
    """
    from OCP.BRepPrimAPI import BRepPrimAPI_MakeCone
    plate = BRepPrimAPI_MakeBox(60.0, 60.0, 20.0).Shape()
    thru = BRepPrimAPI_MakeCylinder(gp_Ax2(gp_Pnt(30, 30, -1), gp_Dir(0, 0, 1)), 4.0, 22.0).Shape()
    # 90 deg included angle: radius falls 8 -> 4 over 4 mm of depth.
    csk = BRepPrimAPI_MakeCone(gp_Ax2(gp_Pnt(30, 30, 16), gp_Dir(0, 0, 1)), 4.0, 8.0, 4.0).Shape()
    s = BRepAlgoAPI_Cut(plate, thru).Shape()
    s = BRepAlgoAPI_Cut(s, csk).Shape()
    return _write(s, os.path.join(outdir, "countersink-plate.step")), {"boreDia": 8.0, "csinkDia": 16.0, "includedAngleDeg": 90.0}


def slot_vs_pocket(outdir):
    """80x60x25 block with ONE closed pocket and ONE open-ended slot.

    Truth: 2 prismatic features. The pocket is enclosed on all four sides; the
    slot runs out through both Y faces. Both are found by concave decomposition,
    so this fixture is about telling them APART, not about finding them.
    """
    block = BRepPrimAPI_MakeBox(80.0, 60.0, 25.0).Shape()
    pocket = BRepPrimAPI_MakeBox(gp_Pnt(10, 20, 15), 20.0, 20.0, 15.0).Shape()
    slot = BRepPrimAPI_MakeBox(gp_Pnt(50, -1, 15), 12.0, 62.0, 15.0).Shape()
    s = BRepAlgoAPI_Cut(block, pocket).Shape()
    s = BRepAlgoAPI_Cut(s, slot).Shape()
    return _write(s, os.path.join(outdir, "slot-and-pocket.step")), {"pockets": 1, "slots": 1}


def through_hole_and_pocket(outdir):
    """50x40x30 block, Ø8 through hole AND a closed pocket.

    Truth: 2 features. This one exists because a through hole has NO concave
    edges — concave decomposition alone finds only the pocket. It is the guard on
    the hybrid recogniser: miss the hole and this fixture fails.
    """
    block = BRepPrimAPI_MakeBox(50.0, 40.0, 30.0).Shape()
    hole = BRepPrimAPI_MakeCylinder(gp_Ax2(gp_Pnt(12, 20, -1), gp_Dir(0, 0, 1)), 4.0, 32.0).Shape()
    pocket = BRepPrimAPI_MakeBox(gp_Pnt(30, 5, 20), 15.0, 30.0, 12.0).Shape()
    s = BRepAlgoAPI_Cut(block, hole).Shape()
    s = BRepAlgoAPI_Cut(s, pocket).Shape()
    return _write(s, os.path.join(outdir, "through-hole-and-pocket.step")), {"throughHoles": 1, "pockets": 1}


def _all_edges(shape, maker, value):
    from OCP.TopAbs import TopAbs_EDGE
    from OCP.TopExp import TopExp_Explorer
    from OCP.TopoDS import TopoDS
    b = maker(shape)
    ex = TopExp_Explorer(shape, TopAbs_EDGE)
    while ex.More():
        try:
            b.Add(value, TopoDS.Edge_s(ex.Current()))
        except Exception:
            pass
        ex.Next()
    return b.Shape()


def filleted_pocket(outdir):
    """80x60x30 block with a closed pocket, then R3 fillets on EVERY edge.

    THE fixture that matters for real parts. Every casting and moulding has
    filleted internal corners, and a fillet sits BETWEEN the pocket wall and its
    floor — so the concave edge that defines the pocket does not exist in the raw
    topology. Measured before the blend-collapse fix: 100 arcs all tangent, zero
    concave, the pocket GONE and 11 non-existent chamfers invented, while
    unclassifiedAreaPct reported 0.0 (full confidence, nothing real found).

    Truth: still exactly one pocket, and NO chamfers.
    """
    from OCP.BRepFilletAPI import BRepFilletAPI_MakeFillet
    block = BRepPrimAPI_MakeBox(80.0, 60.0, 30.0).Shape()
    pocket = BRepPrimAPI_MakeBox(gp_Pnt(15, 15, 12), 50.0, 30.0, 20.0).Shape()
    s = _all_edges(BRepAlgoAPI_Cut(block, pocket).Shape(), BRepFilletAPI_MakeFillet, 3.0)
    return _write(s, os.path.join(outdir, "filleted-pocket.step")), {"pockets": 1, "chamfers": 0}


def filleted_slot(outdir):
    """80x60x30 block with a through slot, R2 fillets on every edge.

    Truth: one SLOT, not a "step". Counting only planar faces as walls
    mislabelled this, because after the blend collapse a wall can legitimately be
    a surviving cylindrical fillet.
    """
    from OCP.BRepFilletAPI import BRepFilletAPI_MakeFillet
    block = BRepPrimAPI_MakeBox(80.0, 60.0, 30.0).Shape()
    slot = BRepPrimAPI_MakeBox(gp_Pnt(30, -1, 18), 15.0, 62.0, 20.0).Shape()
    s = _all_edges(BRepAlgoAPI_Cut(block, slot).Shape(), BRepFilletAPI_MakeFillet, 2.0)
    return _write(s, os.path.join(outdir, "filleted-slot.step")), {"slots": 1, "chamfers": 0}


def chamfered_box(outdir):
    """80x60x30 box with a 3 mm chamfer on all 12 edges.

    Truth: 12 chamfers and NO pocket. A chamfer meets its neighbours at CONVEX
    edges, so a tangency test scores every real chamfer zero — this box returned
    0 chamfers before. And rejoining collapsed chamfers as concave made the whole
    box read as one giant pocket.
    """
    from OCP.BRepFilletAPI import BRepFilletAPI_MakeChamfer
    s = _all_edges(BRepPrimAPI_MakeBox(80.0, 60.0, 30.0).Shape(), BRepFilletAPI_MakeChamfer, 3.0)
    return _write(s, os.path.join(outdir, "chamfered-box.step")), {"chamfers": 12, "pockets": 0}


def thin_plate(outdir):
    """Plain 40x40x8 plate — no features at all.

    Truth: {} . Its four side walls are narrow (aspect 0.2) and small relative to
    their neighbours, so a narrowness-only chamfer test called all four chamfers.
    A chamfer is OBLIQUE to what it joins; a plate wall is perpendicular.
    """
    return _write(BRepPrimAPI_MakeBox(40.0, 40.0, 8.0).Shape(),
                  os.path.join(outdir, "thin-plate.step")), {}


def folded_bracket(outdir):
    """2 mm sheet, one 90 deg bend, inside radius 3 mm, 40 mm vertical flange,
    and a Ø4 hole deliberately placed close to the bend.

    Truth by CONSTRUCTION, which is the whole point: t = 2.00 exactly, because
    the recogniser derives it as (outer radius - inner radius) = 5 - 3. r/t = 1.5,
    flange/t = 20. The hole sits 9.43 mm from the bend line against a 2t+r = 7 mm
    guideline, so it clears by 2.43 mm.

    Until bend recognition existed, all four sheet-metal rules depended on
    measures nothing produced and the family scored 0 of 4 on every part.
    """
    t, ri, W = 2.0, 3.0, 60.0
    leg1 = BRepPrimAPI_MakeBox(gp_Pnt(0, 0, 0), 50.0, W, t).Shape()
    outer = BRepPrimAPI_MakeCylinder(gp_Ax2(gp_Pnt(50, 0, ri + t), gp_Dir(0, 1, 0)), ri + t, W).Shape()
    inner = BRepPrimAPI_MakeCylinder(gp_Ax2(gp_Pnt(50, 0, ri + t), gp_Dir(0, 1, 0)), ri, W).Shape()
    ring = BRepAlgoAPI_Cut(outer, inner).Shape()
    quarter = BRepPrimAPI_MakeBox(gp_Pnt(50, 0, 0), ri + t, W, ri + t).Shape()
    bend = BRepAlgoAPI_Cut(ring, BRepAlgoAPI_Cut(ring, quarter).Shape()).Shape()
    leg2 = BRepPrimAPI_MakeBox(gp_Pnt(50 + ri, 0, ri + t), t, W, 40.0).Shape()
    s = BRepAlgoAPI_Fuse(BRepAlgoAPI_Fuse(leg1, bend).Shape(), leg2).Shape()
    hole = BRepPrimAPI_MakeCylinder(gp_Ax2(gp_Pnt(42, 30, -1), gp_Dir(0, 0, 1)), 2.0, 5.0).Shape()
    s = BRepAlgoAPI_Cut(s, hole).Shape()
    return _write(s, os.path.join(outdir, "folded-bracket.step")), {
        "thicknessMm": 2.0, "insideRadiusMm": 3.0, "bendAngleDeg": 90.0,
        "bendRadiusToThickness": 1.5, "flangeToThickness": 20.0,
    }


def ribbed_plate(outdir):
    """120x80x6 plate carrying THREE ribs of deliberately different proportions.

    Truth by construction, and the third rib is wrong on purpose:

        rib   thickness   height    t/wall   h/wall
        A       3.0 mm     12 mm     0.50     2.0     both in band
        B       2.4 mm     15 mm     0.40     2.5     thickness at the lower limit
        C       5.0 mm     24 mm     0.83     4.0     TOO THICK and TOO TALL

    Nominal wall is the 6.0 mm plate, which is also what the wall-thickness
    measurement reports as p50 (the plate's two faces carry far more area than
    the rib flanks). So the rules must read maxRibThicknessToWall = 0.833 and
    maxRibHeightToWall = 4.0 and FAIL, minRibThicknessToWall = 0.40 and PASS.

    Rib C exists to prove the recogniser does not quietly drop what it is about
    to be judged on: recognition is gated on "taller than it is thick", never on
    the 40-60% rule, so an out-of-band rib is still found and still flagged.

    Ribs also make the concave graph lie. Each rib meets the plate concavely on
    all four sides, so before rib recognition existed this part decomposed into
    one 13-face "pocket" — a stack of protrusions reported as a depression.
    """
    plate = BRepPrimAPI_MakeBox(120.0, 80.0, 6.0).Shape()
    s = plate
    for x, t, h in ((10.0, 3.0, 12.0), (45.0, 2.4, 15.0), (80.0, 5.0, 24.0)):
        rib = BRepPrimAPI_MakeBox(gp_Pnt(x, 20.0, 6.0), t, 40.0, h).Shape()
        s = BRepAlgoAPI_Fuse(s, rib).Shape()
    return _write(s, os.path.join(outdir, "ribbed-plate.step")), {
        "wallMm": 6.0,
        "ribs": [{"thicknessMm": 5.0, "heightMm": 24.0},
                 {"thicknessMm": 3.0, "heightMm": 12.0},
                 {"thicknessMm": 2.4, "heightMm": 15.0}],
    }


def surface_only(outdir):
    """A single trimmed FACE — no solid anywhere in the file.

    A very common CAD export, and the shape that crashed the analyser: fewer than
    eight valid thickness rays meant `wall_thickness` returned a dict flagged
    "insufficient" instead of None, every `if wall_stats:` guard passed, and the
    next line raised KeyError 'meanMm' -> HTTP 422 with a Python traceback
    fragment in the message. The contract is None, and this fixture holds it.
    """
    from OCP.BRepBuilderAPI import BRepBuilderAPI_MakeFace
    from OCP.gp import gp_Pln
    f = BRepBuilderAPI_MakeFace(gp_Pln(gp_Pnt(0, 0, 0), gp_Dir(0, 0, 1)),
                                0.0, 80.0, 0.0, 60.0).Face()
    return _write(f, os.path.join(outdir, "degenerate-surface-only.step")), "no solid"


def metres_part(outdir):
    """The plate-two-holes geometry drawn in METRES: 0.06 x 0.04 x 0.01.

    Numerically valid, physically absurd, and it used to return HTTP 200 with a
    confident report claiming a 0.05 mm wall and three "wall below minimum"
    findings. Findings computed at the wrong scale are worse than no findings, so
    the truth here is that every dimensional rule must be WITHHELD.
    """
    s = BRepPrimAPI_MakeBox(0.06, 0.04, 0.01).Shape()
    for c, r, d in (((0.02, 0.02, -0.001), 0.005, 0.012), ((0.04, 0.02, 0.004), 0.004, 0.007)):
        s = BRepAlgoAPI_Cut(s, BRepPrimAPI_MakeCylinder(
            gp_Ax2(gp_Pnt(*c), gp_Dir(0, 0, 1)), r, d).Shape()).Shape()
    return _write(s, os.path.join(outdir, "degenerate-metres.step")), "modelled in metres"


def unreadable_files(outdir):
    """An empty file and a file of bytes that are not STEP at all.

    OCCT writes its parser errors — with ANSI colour codes — to STDOUT, ahead of
    our JSON, so `JSON.parse(stdout)` surfaced "****ERR StepFile: Undefined
    Parsing..." to the user. The truth is a clean, typed, human-readable error
    and no kernel internals.
    """
    empty = os.path.join(outdir, "degenerate-empty.step")
    with open(empty, "wb") as fh:
        fh.write(b"")
    junk = os.path.join(outdir, "degenerate-garbage.step")
    with open(junk, "wb") as fh:
        # Deterministic pseudo-random bytes: the fixture must be byte-identical
        # across runs so it can be committed like every other one here.
        fh.write(bytes((i * 37 + 11) % 256 for i in range(4096)))
    return junk, "not readable geometry"


def curved_wall_plate(outdir):
    """80x40x10 plate with a SEMICIRCULAR end (R20), and one real Ø6 through hole.

    The rounded end is a cylindrical face of radius 20 sweeping exactly 180° —
    half the fused cylinder lies inside the box, so the other half is the wall
    you can see. It is a WALL, not a boss: nothing was turned, nothing is
    drilled, and no tool ever went round it.

    Truth by construction:
      * bosses = 0. The engine accepted any cylindrical face as a hole or boss
        until it was taught to require a full revolution, and on a real
        aluminium casting that turned the part's own 63°-sweep outer wall into a
        "boss Ø100 x 25.8".
      * holes = exactly one, Ø6, through (10 mm bore in a 10 mm plate).
      * volume = 80*40*10 + pi*20^2/2*10 - pi*3^2*10.
    """
    L, W, T, R, d = 80.0, 40.0, 10.0, 20.0, 3.0
    box = BRepPrimAPI_MakeBox(gp_Pnt(0, 0, 0), L, W, T).Shape()
    # Centre on the mid-point of the far end face, so exactly half of it shows.
    cap = BRepPrimAPI_MakeCylinder(gp_Ax2(gp_Pnt(L, W / 2, 0), gp_Dir(0, 0, 1)), R, T).Shape()
    body = BRepAlgoAPI_Fuse(box, cap).Shape()
    bore = BRepPrimAPI_MakeCylinder(gp_Ax2(gp_Pnt(25, W / 2, -1), gp_Dir(0, 0, 1)), d, T + 2).Shape()
    shape = BRepAlgoAPI_Cut(body, bore).Shape()
    vol = L * W * T + math.pi * R * R / 2 * T - math.pi * d * d * T
    return _write(shape, os.path.join(outdir, "curved-wall-plate.step")), {
        "bosses": 0, "holes": 1, "volumeMm3": round(vol, 1),
    }


def sheet_hole_through(outdir):
    """1.5 mm L-bracket, 100 mm long, with a 40 mm upstand — and a Ø5 hole
    through the 1.5 mm base.

    The point is the SHAPE of the part around the hole. The bore is 1.5 mm deep
    and the part's extent along the bore axis is 40 mm, so a through/blind test
    that compares depth to the bounding box calls this hole BLIND — which is
    what the engine did, and what put "hole Ø6 depth 1.6 through: false" in a
    report on a 1.6 mm seat cross member.

    Truth by construction: one hole, Ø5, depth 1.5 (= sheet thickness), THROUGH.
    """
    t, L, W, H, d = 1.5, 100.0, 60.0, 40.0, 2.5
    base = BRepPrimAPI_MakeBox(gp_Pnt(0, 0, 0), L, W, t).Shape()
    upstand = BRepPrimAPI_MakeBox(gp_Pnt(0, W - t, 0), L, t, H).Shape()
    body = BRepAlgoAPI_Fuse(base, upstand).Shape()
    bore = BRepPrimAPI_MakeCylinder(gp_Ax2(gp_Pnt(50, 20, -1), gp_Dir(0, 0, 1)), d, t + 2).Shape()
    shape = BRepAlgoAPI_Cut(body, bore).Shape()
    return _write(shape, os.path.join(outdir, "sheet-hole-through.step")), {
        "hole": {"diaMm": 2 * d, "depthMm": t, "through": True},
        "axisExtentMm": H,
    }


def bolted_assembly(outdir):
    """A 3-solid assembly: one 80x50x10 plate and TWO identical Ø8 x 25 pins.

    Truth for DFA: 3 solids, 2 distinct part types, the two pins share a shape
    signature (identical principal moments), theoretical minimum parts = 1 if the
    pins are treated as fasteners.
    """
    from OCP.TopoDS import TopoDS_Builder, TopoDS_Compound
    plate = BRepPrimAPI_MakeBox(80.0, 50.0, 10.0).Shape()
    p1 = BRepPrimAPI_MakeCylinder(gp_Ax2(gp_Pnt(20, 25, 10), gp_Dir(0, 0, 1)), 4.0, 25.0).Shape()
    p2 = BRepPrimAPI_MakeCylinder(gp_Ax2(gp_Pnt(60, 25, 10), gp_Dir(0, 0, 1)), 4.0, 25.0).Shape()
    comp = TopoDS_Compound()
    bld = TopoDS_Builder()
    bld.MakeCompound(comp)
    for s in (plate, p1, p2):
        bld.Add(comp, s)
    return _write(comp, os.path.join(outdir, "bolted-assembly.step")), 3



def pmi_toleranced_block(outdir):
    """50x30x20 block carrying SEMANTIC PMI: a 50 +/- 0.010 dimension and a
    0.05 flatness callout, written as AP242.

    THE ONLY FIXTURE HERE WHOSE TRUTH IS NOT GEOMETRY. Tolerances are not in the
    shape — they are annotations beside it, and only AP242 with semantic PMI
    carries them at all. Everything else in this directory would read identically
    with the PMI stripped, so without this file the reader could return nothing
    on every part and the gate would stay green.

    Truth by construction: total dimensional tolerance band = 0.010 + 0.010 =
    0.020 mm, flatness = 0.050 mm, so the tightest callout on the part is 0.020.

    Two things had to be right for this to round-trip and both were wrong first
    time: the STEP controller must be initialised before `write.step.schema` is
    settable (it silently stayed AP214 and dropped every PMI entity), and a
    dimension must relate TWO SHAPE ASPECTS — written against the top-level shape
    it lands in the file with nothing to attach to and OCCT's reader discards it.
    """
    from OCP.STEPCAFControl import STEPCAFControl_Writer
    from OCP.STEPControl import STEPControl_Controller
    from OCP.TCollection import TCollection_ExtendedString, TCollection_HAsciiString
    from OCP.TColStd import TColStd_HArray1OfReal
    from OCP.TDocStd import TDocStd_Document
    from OCP.TopAbs import TopAbs_FACE
    from OCP.TopExp import TopExp_Explorer
    from OCP.TopoDS import TopoDS
    from OCP.XCAFDimTolObjects import (XCAFDimTolObjects_DimensionObject,
                                       XCAFDimTolObjects_DimensionType,
                                       XCAFDimTolObjects_GeomToleranceObject,
                                       XCAFDimTolObjects_GeomToleranceType)
    from OCP.XCAFDoc import (XCAFDoc_Dimension, XCAFDoc_DocumentTool,
                             XCAFDoc_GeomTolerance)

    doc = TDocStd_Document(TCollection_ExtendedString("pmi"))
    sht = XCAFDoc_DocumentTool.ShapeTool_s(doc.Main())
    dtt = XCAFDoc_DocumentTool.DimTolTool_s(doc.Main())
    box = BRepPrimAPI_MakeBox(50.0, 30.0, 20.0).Shape()
    lab = sht.AddShape(box, False)

    ex, faces = TopExp_Explorer(box, TopAbs_FACE), []
    while ex.More():
        faces.append(TopoDS.Face_s(ex.Current()))
        ex.Next()
    fl1 = sht.AddSubShape(lab, faces[0])
    fl2 = sht.AddSubShape(lab, faces[1])

    dl = dtt.AddDimension()
    dobj = XCAFDimTolObjects_DimensionObject()
    dobj.SetType(XCAFDimTolObjects_DimensionType.XCAFDimTolObjects_DimensionType_Location_LinearDistance)
    arr = TColStd_HArray1OfReal(1, 1)
    arr.SetValue(1, 50.0)
    dobj.SetValues(arr)
    dobj.SetUpperTolValue(0.010)
    dobj.SetLowerTolValue(0.010)
    XCAFDoc_Dimension.Set_s(dl).SetObject(dobj)
    dtt.SetDimension(fl1, fl2, dl)

    gl = dtt.AddGeomTolerance()
    gobj = XCAFDimTolObjects_GeomToleranceObject()
    gobj.SetType(XCAFDimTolObjects_GeomToleranceType.XCAFDimTolObjects_GeomToleranceType_Flatness)
    gobj.SetValue(0.05)
    XCAFDoc_GeomTolerance.Set_s(gl).SetObject(gobj)
    dtt.SetGeomTolerance(fl1, gl)

    STEPControl_Controller.Init_s()
    if not Interface_Static.SetCVal_s("write.step.schema", "AP242DIS"):
        raise RuntimeError("AP242 schema unavailable — PMI cannot be written")
    Interface_Static.SetCVal_s("write.step.product.name", "pmi-toleranced-block.step")
    w = STEPCAFControl_Writer()
    w.SetDimTolMode(True)
    w.Transfer(doc)
    path = os.path.join(outdir, "pmi-toleranced-block.step")
    w.Write(path)
    # Restore the schema, or every fixture written after this one changes.
    Interface_Static.SetCVal_s("write.step.schema", "AP214IS")
    with open(path, "rb") as fh:
        data = fh.read()
    data, n = _STAMP_RE.subn(rb"\g<1>" + _EPOCH_STAMP.encode() + rb"\g<2>", data, count=1)
    if n == 1:
        with open(path, "wb") as fh:
            fh.write(data)
    return path, {"tightestToleranceMm": 0.020, "flatnessMm": 0.050}



def seat_bracket_assembly(outdir):
    """A ten-solid sub-assembly with the variety a real one has.

    STATED PLAINLY: this is still SYNTHETIC. Every customer file supplied so far
    has been a single solid, so the DFA path has never met a real multi-part STEP
    and this fixture is the closest available substitute — not a substitute for
    one. What it does do is exercise the parts of the analysis a three-solid
    plate-and-two-pins fixture never touched:

      * TEN solids, SIX distinct types, with instance groups of four (bolts) and
        two (washers). Grouping must find both without merging them.
      * A washer is a thin annular disc: a body of revolution AND rotationally
        symmetric about its own plane, so alpha and beta must both resolve — the
        hardest symmetry case in Boothroyd's scheme and the one that decides
        whether handling time is 1.5 s or 4 s.
      * A dowel is small and slender, which is where the handling model's size
        and thickness penalties live.
      * The base plate is DELIBERATELY asymmetric (an offset notch), so its
        alpha must come back 360 rather than 180 — a symmetric answer here means
        the rotation test is measuring the bounding box, not the shape.
      * Two parts touch nothing (the cover sits proud), so contact detection has
        to report a real number rather than assuming a chain.

    Truth by construction: 10 solids, 6 distinct types, largest instance group 4.
    """
    from OCP.TopoDS import TopoDS_Builder, TopoDS_Compound

    solids = []

    # 1. Stamped base plate, 120 x 80 x 3, with an OFFSET notch that breaks every
    #    symmetry it would otherwise have.
    plate = BRepPrimAPI_MakeBox(120.0, 80.0, 3.0).Shape()
    notch = BRepPrimAPI_MakeBox(gp_Pnt(90.0, 60.0, -1.0), 30.0, 25.0, 5.0).Shape()
    plate = BRepAlgoAPI_Cut(plate, notch).Shape()
    for x, y in ((15, 15), (105, 15), (15, 65)):
        bore = BRepPrimAPI_MakeCylinder(gp_Ax2(gp_Pnt(x, y, -1), gp_Dir(0, 0, 1)), 4.5, 5.0).Shape()
        plate = BRepAlgoAPI_Cut(plate, bore).Shape()
    solids.append(plate)

    # 2. Cast housing, a chunky block with a bore — a different part type.
    housing = BRepPrimAPI_MakeBox(gp_Pnt(30.0, 20.0, 3.0), 50.0, 40.0, 35.0).Shape()
    hbore = BRepPrimAPI_MakeCylinder(gp_Ax2(gp_Pnt(55.0, 40.0, 2.0), gp_Dir(0, 0, 1)), 12.0, 40.0).Shape()
    solids.append(BRepAlgoAPI_Cut(housing, hbore).Shape())

    # 3-6. FOUR identical M8 bolts. Identical geometry, so their shape signatures
    #      must collide or instance grouping cannot work at all.
    for x, y in ((15, 15), (105, 15), (15, 65), (105, 65)):
        shank = BRepPrimAPI_MakeCylinder(gp_Ax2(gp_Pnt(x, y, 3.0), gp_Dir(0, 0, 1)), 4.0, 30.0).Shape()
        head = BRepPrimAPI_MakeCylinder(gp_Ax2(gp_Pnt(x, y, 33.0), gp_Dir(0, 0, 1)), 7.0, 6.0).Shape()
        solids.append(BRepAlgoAPI_Fuse(shank, head).Shape())

    # 7-8. TWO identical washers. A thin annulus: a body of revolution that also
    #      flips end for end, which is the alpha=0/beta=0 corner of the scheme.
    for x, y in ((15, 15), (105, 15)):
        outer = BRepPrimAPI_MakeCylinder(gp_Ax2(gp_Pnt(x, y, 33.0), gp_Dir(0, 0, 1)), 8.0, 1.5).Shape()
        inner = BRepPrimAPI_MakeCylinder(gp_Ax2(gp_Pnt(x, y, 32.0), gp_Dir(0, 0, 1)), 4.2, 4.0).Shape()
        solids.append(BRepAlgoAPI_Cut(outer, inner).Shape())

    # 9. A small slender dowel — where the handling model's size penalty lives.
    solids.append(BRepPrimAPI_MakeCylinder(
        gp_Ax2(gp_Pnt(60.0, 12.0, 3.0), gp_Dir(0, 0, 1)), 1.5, 14.0).Shape())

    # 10. A cover that touches NOTHING, sitting proud above the housing.
    solids.append(BRepPrimAPI_MakeBox(gp_Pnt(30.0, 20.0, 45.0), 50.0, 40.0, 2.0).Shape())

    comp = TopoDS_Compound()
    bld = TopoDS_Builder()
    bld.MakeCompound(comp)
    for sh in solids:
        bld.Add(comp, sh)
    return _write(comp, os.path.join(outdir, "seat-bracket-assembly.step")), {
        "solids": 10, "distinctTypes": 6, "largestInstanceGroup": 4,
    }


def bushing_tube(outdir):
    """Plain bushing: OD 60, ID 40, length 50. A PERFECT body of revolution.

    Truth: volume = pi*(30^2 - 20^2)*50 = 78539.8 mm^3. Wall = (60-40)/2 = 10.00 mm
    everywhere. Every face is either a cylinder about +Z (OD, ID) or a plane whose
    normal is +/-Z (the two ends), so the axisymmetric area share is EXACTLY 100%
    by construction — the fixture the centrifugal body-of-revolution rule needs to
    prove it can say YES, not only NO. The bore is a Ø40 through hole, L/D 1.25.
    """
    outer = BRepPrimAPI_MakeCylinder(gp_Ax2(gp_Pnt(0, 0, 0), gp_Dir(0, 0, 1)), 30.0, 50.0).Shape()
    bore = BRepPrimAPI_MakeCylinder(gp_Ax2(gp_Pnt(0, 0, -1), gp_Dir(0, 0, 1)), 20.0, 52.0).Shape()
    s = BRepAlgoAPI_Cut(outer, bore).Shape()
    vol = math.pi * (30.0 ** 2 - 20.0 ** 2) * 50.0
    return _write(s, os.path.join(outdir, "bushing-tube.step")), round(vol, 1)


def fine_cored_holes(outdir):
    """80x50x20 block with THREE holes chosen to separate the as-cast rules.

    Ø2.0 through, 20 deep -> smallest bore on the part; through depth/dia = 10.00
    Ø10.0 blind, 16 deep  -> blind depth/dia = 1.60
    Ø6.0 through, 20 deep -> through depth/dia = 3.33

    Truth by construction:
      volume  = 80*50*20 - pi*1^2*20 - pi*5^2*16 - pi*3^2*20 = 78115.0 mm^3
      minHoleDiaMm             = 2.00
      maxBlindHoleDepthToDia   = 1.60   (the Ø10 x 16 blind)
      maxThroughHoleDepthToDia = 10.00  (the Ø2 x 20 through)
      maxHoleDepthToDia        = 10.00  (the combined figure both used to share)

    Ø2.0 is chosen deliberately: it is the ONE diameter that splits all four
    distinct as-cast floors in this catalogue into two groups —
      fails  HPDC (2.5), gravity die (6.0), low-pressure die (6.0)
      passes zinc HPDC (1.5), investment (1.5)
    A Ø3 bore, which the first draft of this fixture used, passes HPDC as well and
    leaves that threshold untested. A fixture that cannot fail is not a fixture.

    And the blind/through point: the COMBINED figure is 10.00 while the real blind
    hole sits at 1.60 — a factor of six apart on one part. A blind limit of 2
    judged against the combined number fails a hole that is perfectly sound.
    Investment casting writes the two limits separately for exactly this reason,
    and until the split existed the catalogue could not express either one.
    """
    box = BRepPrimAPI_MakeBox(80.0, 50.0, 20.0).Shape()
    fine = BRepPrimAPI_MakeCylinder(gp_Ax2(gp_Pnt(15, 25, -1), gp_Dir(0, 0, 1)), 1.0, 22.0).Shape()
    blind = BRepPrimAPI_MakeCylinder(gp_Ax2(gp_Pnt(40, 25, 4), gp_Dir(0, 0, 1)), 5.0, 16.5).Shape()
    thru = BRepPrimAPI_MakeCylinder(gp_Ax2(gp_Pnt(65, 25, -1), gp_Dir(0, 0, 1)), 3.0, 22.0).Shape()
    s = BRepAlgoAPI_Cut(box, fine).Shape()
    s = BRepAlgoAPI_Cut(s, blind).Shape()
    s = BRepAlgoAPI_Cut(s, thru).Shape()
    vol = (80 * 50 * 20
           - math.pi * 1.0 ** 2 * 20
           - math.pi * 5.0 ** 2 * 16
           - math.pi * 3.0 ** 2 * 20)
    return _write(s, os.path.join(outdir, "fine-cored-holes.step")), round(vol, 1)


def overhang_wedge(outdir):
    """A wedge whose ONE sloped face is EXACTLY 30 degrees from the build plate.

    Built as a right prism on a triangular section: 60 long (Y), with a section
    that rises 40 in Z over 40*sqrt(3) in X. The sloped face therefore stands at
    exactly atan(40 / (40*sqrt(3))) = 30.000 deg from horizontal, and it is
    oriented to face DOWNWARD so it is an overhang rather than an upskin.

    Truth by construction, for the +Z build direction. The sloped face is the
    ONLY down-facing surface on the part — the top is an upskin and the other
    three faces are vertical — so the figures are exact areas, not samples:

      sloped face  = hypot(b, h) * L = 80 * 60          = 4800.0 mm^2
      top          = b * L                              = 4156.9
      left wall    = h * L                              = 2400.0
      two ends     = b * h                              = 2771.3
      total                                             = 14128.2

      downFacingAreaPct = 4800 / 14128.2 = 33.97 %

    And because the face is at EXACTLY 30 deg it straddles the curve rather
    than sitting at one end: below the 40/45/50/60 cutoffs it is the whole
    33.97, and below the 20 cutoff it is zero.

    This is the fixture the LPBF overhang rule needs. Without it the rule could
    be hardcoded to any constant and every other fixture would still pass.
    """
    h = 40.0
    b = 40.0 * math.sqrt(3.0)          # tan(30) = h / b
    L = 60.0
    # Section in the XZ plane, extruded along +Y, with the material ABOVE the
    # slope so the sloped face looks DOWN. The first draft put the material
    # below it and the face was an upskin — the engine correctly reported the
    # part as having no overhang but the flat base, which is not what this
    # fixture is for.
    pts = [(0.0, 0.0, 0.0), (b, 0.0, h), (0.0, 0.0, h)]
    wire = _wire(pts)
    from OCP.BRepBuilderAPI import BRepBuilderAPI_MakeFace
    from OCP.BRepPrimAPI import BRepPrimAPI_MakePrism
    from OCP.gp import gp_Vec
    face = BRepBuilderAPI_MakeFace(wire).Face()
    solid = BRepPrimAPI_MakePrism(face, gp_Vec(0, L, 0)).Shape()
    vol = 0.5 * b * h * L
    return _write(solid, os.path.join(outdir, "overhang-wedge.step")), round(vol, 1)


def main():
    outdir = sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(os.path.abspath(__file__))
    os.makedirs(outdir, exist_ok=True)
    for fn in (plate_two_holes, frustum_draft3, box_side_hole, shell_wall25, boss_plate,
               counterbore_plate, countersink_plate, slot_vs_pocket, through_hole_and_pocket,
               filleted_pocket, filleted_slot, chamfered_box, thin_plate,
               folded_bracket, ribbed_plate, bolted_assembly,
               # Degenerate inputs. Every well-formed fixture above passed while
               # these four crashed, returned kernel internals, or produced
               # confident nonsense — which is exactly how a 100% gate coexisted
               # with four live bugs.
               surface_only, metres_part, unreadable_files,
               # APPENDED, not inserted. OCCT stamps a running part number into
               # PRODUCT(), so inserting a fixture renumbers every file written
               # after it and the whole set churns for no geometric reason.
               curved_wall_plate, sheet_hole_through, pmi_toleranced_block,
               seat_bracket_assembly,
               # Appended for the casting tranche: a true body of revolution, and a
               # block whose blind and through holes sit either side of the split.
               bushing_tube, fine_cored_holes,
               # Appended for the additive tranche: one face at exactly 30 deg
               # from the build plate, so the overhang curve has a fixture that
               # straddles it rather than sitting at one end.
               overhang_wedge):
        path, truth = fn(outdir)
        print(f"  {os.path.basename(path):26s}  analytic truth: {truth}")
    print(f"wrote fixtures to {outdir}")


if __name__ == "__main__":
    main()
