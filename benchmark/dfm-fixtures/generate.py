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
    for fn in (plate_two_holes, frustum_draft3, box_side_hole, shell_wall25, boss_plate, bolted_assembly):
        path, truth = fn(outdir)
        print(f"  {os.path.basename(path):26s}  analytic truth: {truth}")
    print(f"wrote fixtures to {outdir}")


if __name__ == "__main__":
    main()
