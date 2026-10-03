"""Blow-moulded parts, modelled in OCP for the blow-moulding review (3 Oct 2026).

NOT customer parts. The audit set holds one real blow moulding (the fuel tank,
whose STEP is not in the repo — its measured geometry is kept in
cad-audit/final/runs/FINAL-Fuel_tank-api.json). Two typical automotive
blow mouldings are modelled alongside it:

* a washer-fluid reservoir: 220 x 160 x 130 mm body, R20 edges, 2.5 mm wall,
  a Ø40 filler neck 35 mm tall — HDPE extrusion blow, ~3.8 L;
* an HVAC / air-intake duct: Ø70 tube, 2 mm wall, two straight legs joined by
  a 90° R120 elbow, open at both ends — PP extrusion blow.

Exported as STEP AP214. Run: python3 BM_modelled_parts.py <out-dir>
"""
import sys
from OCP.gp import gp_Pnt, gp_Dir, gp_Ax2, gp_Circ
from OCP.BRepPrimAPI import BRepPrimAPI_MakeBox, BRepPrimAPI_MakeCylinder, BRepPrimAPI_MakeTorus
from OCP.BRepAlgoAPI import BRepAlgoAPI_Fuse, BRepAlgoAPI_Cut
from OCP.BRepFilletAPI import BRepFilletAPI_MakeFillet
from OCP.TopExp import TopExp_Explorer
from OCP.TopAbs import TopAbs_EDGE
from OCP.TopoDS import TopoDS
from OCP.STEPControl import STEPControl_Writer, STEPControl_AsIs
from OCP.Interface import Interface_Static
from math import pi

def box(x, y, z, dx, dy, dz): return BRepPrimAPI_MakeBox(gp_Pnt(x, y, z), dx, dy, dz).Shape()
def cyl(p, d, r, h): return BRepPrimAPI_MakeCylinder(gp_Ax2(gp_Pnt(*p), gp_Dir(*d)), r, h).Shape()
def fuse(a, b): return BRepAlgoAPI_Fuse(a, b).Shape()
def cut(a, b): return BRepAlgoAPI_Cut(a, b).Shape()
def rounded(s, r):
    f = BRepFilletAPI_MakeFillet(s)
    e = TopExp_Explorer(s, TopAbs_EDGE)
    while e.More():
        f.Add(r, TopoDS.Edge_s(e.Current())); e.Next()
    f.Build(); assert f.IsDone(); return f.Shape()
def write(s, path, name):
    Interface_Static.SetCVal_s('write.step.schema', 'AP214IS')
    Interface_Static.SetCVal_s('write.step.product.name', name)
    w = STEPControl_Writer(); w.Transfer(s, STEPControl_AsIs); w.Write(path)

out = sys.argv[1]

# Washer reservoir: a rounded box shelled to 2.5 mm, filler neck on top.
t = 2.5
outer = rounded(box(0, 0, 0, 220, 160, 130), 20)
inner = rounded(box(t, t, t, 220 - 2 * t, 160 - 2 * t, 130 - 2 * t), 20 - t)
r = cut(outer, inner)
r = fuse(r, cut(cyl((60, 80, 125), (0, 0, 1), 20, 40), cyl((60, 80, 120), (0, 0, 1), 20 - t, 50)))
r = cut(r, cyl((60, 80, 120), (0, 0, 1), 20 - t, 50))
write(r, f'{out}/BM_Washer_Reservoir.stp', 'WASHER RESERVOIR HDPE')

# Air duct: Ø70 x 2 mm tube, 250 mm leg + 90° R120 elbow + 300 mm leg, open ends.
R, w, Rb = 35.0, 2.0, 120.0
def tube_straight(p, d, h): return cut(cyl(p, d, R, h), cyl(tuple(p[i] - d[i] for i in range(3)), d, R - w, h + 2))
leg1 = tube_straight((0, 0, 0), (1, 0, 0), 250)
# elbow: quarter torus centred at (250, Rb, 0) in the XY plane
ax = gp_Ax2(gp_Pnt(250, Rb, 0), gp_Dir(0, 0, 1), gp_Dir(0, -1, 0))
elbow = cut(BRepPrimAPI_MakeTorus(ax, Rb, R, pi / 2).Shape(), BRepPrimAPI_MakeTorus(ax, Rb, R - w, pi / 2).Shape())
leg2 = tube_straight((250 + Rb, Rb, 0), (0, 1, 0), 300)
d = fuse(fuse(leg1, elbow), leg2)
write(d, f'{out}/BM_Air_Duct.stp', 'AIR INTAKE DUCT PP BLOW MOULDED')
