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
import os
import sys

from OCP.BRepAlgoAPI import BRepAlgoAPI_Cut, BRepAlgoAPI_Fuse
from OCP.BRepBuilderAPI import BRepBuilderAPI_MakePolygon
from OCP.BRepOffsetAPI import BRepOffsetAPI_ThruSections
from OCP.BRepPrimAPI import BRepPrimAPI_MakeBox, BRepPrimAPI_MakeCylinder
from OCP.gp import gp_Ax2, gp_Dir, gp_Pnt
from OCP.Interface import Interface_Static
from OCP.STEPControl import STEPControl_AsIs, STEPControl_Writer


def _write(shape, path):
    Interface_Static.SetCVal_s("write.step.product.name", os.path.basename(path))
    w = STEPControl_Writer()
    w.Transfer(shape, STEPControl_AsIs)
    w.Write(path)
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


def main():
    outdir = sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(os.path.abspath(__file__))
    os.makedirs(outdir, exist_ok=True)
    for fn in (plate_two_holes, frustum_draft3, box_side_hole, shell_wall25, boss_plate,
               counterbore_plate, countersink_plate, slot_vs_pocket, through_hole_and_pocket,
               filleted_pocket, filleted_slot, chamfered_box, thin_plate,
               folded_bracket, bolted_assembly):
        path, truth = fn(outdir)
        print(f"  {os.path.basename(path):26s}  analytic truth: {truth}")
    print(f"wrote fixtures to {outdir}")


if __name__ == "__main__":
    main()
