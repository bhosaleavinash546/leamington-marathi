"""Machined-from-solid parts, modelled in OCP for the machining review (2 Oct 2026).

NOT customer parts. The audit set had no part that is unambiguously machined
from billet (Part1's own file calls it CASTING-01), so two typical ones are
modelled to ordinary machining design practice:

* a hydraulic manifold block cut from 6082 plate — milled pocket with corner
  radii, through bolt holes, blind ports, cross-drilled galleries, tapping holes;
* a stepped shaft turned from steel bar — journals, shoulders, a milled keyway
  and a cross hole.

Exported as STEP AP214. Run: python3 MACH_modelled_parts.py <out-dir>
"""
import sys
from OCP.gp import gp_Pnt, gp_Dir, gp_Ax2
from OCP.BRepPrimAPI import BRepPrimAPI_MakeBox, BRepPrimAPI_MakeCylinder
from OCP.BRepAlgoAPI import BRepAlgoAPI_Fuse, BRepAlgoAPI_Cut
from OCP.BRepFilletAPI import BRepFilletAPI_MakeFillet
from OCP.BRepAdaptor import BRepAdaptor_Curve
from OCP.GeomAbs import GeomAbs_Line
from OCP.TopExp import TopExp_Explorer
from OCP.TopAbs import TopAbs_EDGE
from OCP.TopoDS import TopoDS
from OCP.STEPControl import STEPControl_Writer, STEPControl_AsIs
from OCP.Interface import Interface_Static


def edges(s):
    e = TopExp_Explorer(s, TopAbs_EDGE)
    while e.More():
        yield TopoDS.Edge_s(e.Current()); e.Next()
def box(x, y, z, dx, dy, dz): return BRepPrimAPI_MakeBox(gp_Pnt(x, y, z), dx, dy, dz).Shape()
def cyl(p, d, r, h): return BRepPrimAPI_MakeCylinder(gp_Ax2(gp_Pnt(*p), gp_Dir(*d)), r, h).Shape()
def fuse(a, b): return BRepAlgoAPI_Fuse(a, b).Shape()
def cut(a, b): return BRepAlgoAPI_Cut(a, b).Shape()
def write(s, path, name):
    Interface_Static.SetCVal_s('write.step.schema', 'AP214IS')
    Interface_Static.SetCVal_s('write.step.product.name', name)
    w = STEPControl_Writer(); w.Transfer(s, STEPControl_AsIs); w.Write(path)

out = sys.argv[1]

# ── Hydraulic manifold: 120 × 80 × 60 mm block ──────────────────────────────
m = box(0, 0, 0, 120, 80, 60)
pocket = box(35, 25, 40, 50, 30, 21)                       # 50 × 30 × 20 deep pocket
f = BRepFilletAPI_MakeFillet(pocket)                       # R5 corner radii (vertical edges)
for e in edges(pocket):
    c = BRepAdaptor_Curve(e)
    if c.GetType() != GeomAbs_Line: continue
    p1, p2 = c.Value(c.FirstParameter()), c.Value(c.LastParameter())
    if abs(p1.X() - p2.X()) < 1e-6 and abs(p1.Y() - p2.Y()) < 1e-6: f.Add(5.0, e)
f.Build(); assert f.IsDone(); m = cut(m, f.Shape())
for (x, y) in ((10, 10), (110, 10), (10, 70), (110, 70)):  # 4 × Ø11 through bolt holes
    m = cut(m, cyl((x, y, -1), (0, 0, 1), 5.5, 62))
for y in (20.0, 40.0, 60.0):                               # 3 × Ø18 × 40 blind ports from the front face
    m = cut(m, cyl((-1, y, 20), (1, 0, 0), 9.0, 41))
for z in (12.0, 30.0):                                     # 2 × Ø8 × 70 cross galleries from the side
    m = cut(m, cyl((60, -1, z), (0, 1, 0), 4.0, 71))
for (x, y) in ((28, 18), (92, 18), (28, 62), (92, 62)):    # 4 × Ø5 × 12 tapping holes (M6) on the top
    m = cut(m, cyl((x, y, 48), (0, 0, 1), 2.5, 13))
write(m, f'{out}/MACH_Hydraulic_Manifold.stp', 'HYDRAULIC MANIFOLD BLOCK MACHINED 6082')

# ── Stepped shaft along Z: Ø40 collar, Ø30 body, Ø25 journals, Ø20 spigot ───
s = cyl((0, 0, 0), (0, 0, 1), 12.5, 50)                    # Ø25 × 50 journal
s = fuse(s, cyl((0, 0, 50), (0, 0, 1), 20.0, 15))          # Ø40 × 15 collar
s = fuse(s, cyl((0, 0, 65), (0, 0, 1), 15.0, 80))          # Ø30 × 80 body
s = fuse(s, cyl((0, 0, 145), (0, 0, 1), 12.5, 25))         # Ø25 × 25 journal
s = fuse(s, cyl((0, 0, 170), (0, 0, 1), 10.0, 20))         # Ø20 × 20 spigot
s = cut(s, box(-4, 11, 85, 8, 5, 40))                      # 8 wide × 4 deep × 40 keyway in the Ø30
s = cut(s, cyl((-11, 0, 180), (1, 0, 0), 3.0, 22))         # Ø6 cross hole through the spigot
write(s, f'{out}/MACH_Stepped_Shaft.stp', 'STEPPED DRIVE SHAFT TURNED EN8')
