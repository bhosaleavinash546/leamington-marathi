"""Rubber parts, modelled in OCP for the rubber review (2 Oct 2026).

NOT customer parts. The audit set held no rubber part, so three typical
automotive elastomer parts are modelled:

* a grommet: Ø40 flange 4 mm, Ø26 body 16 mm long with a 2 mm groove, Ø12 bore
  — moulded EPDM, the commonest rubber part on a vehicle;
* an anti-vibration mount block: 60 × 60 × 35 mm natural-rubber block with
  R6 edges and a Ø10 bore — the thick-section case the cure model must handle;
* a door-seal profile: 1,000 mm of a hollow bulb (Ø14 / Ø10) on an 18 × 3 mm
  foot — an extrusion, the commonest rubber SPEND on a vehicle.

Exported as STEP AP214. Run: python3 RUB_modelled_parts.py <out-dir>
"""
import sys
from OCP.gp import gp_Pnt, gp_Dir, gp_Ax2
from OCP.BRepPrimAPI import BRepPrimAPI_MakeBox, BRepPrimAPI_MakeCylinder
from OCP.BRepAlgoAPI import BRepAlgoAPI_Fuse, BRepAlgoAPI_Cut
from OCP.BRepFilletAPI import BRepFilletAPI_MakeFillet
from OCP.TopExp import TopExp_Explorer
from OCP.TopAbs import TopAbs_EDGE
from OCP.TopoDS import TopoDS
from OCP.STEPControl import STEPControl_Writer, STEPControl_AsIs
from OCP.Interface import Interface_Static

def box(x, y, z, dx, dy, dz): return BRepPrimAPI_MakeBox(gp_Pnt(x, y, z), dx, dy, dz).Shape()
def cyl(p, d, r, h): return BRepPrimAPI_MakeCylinder(gp_Ax2(gp_Pnt(*p), gp_Dir(*d)), r, h).Shape()
def fuse(a, b): return BRepAlgoAPI_Fuse(a, b).Shape()
def cut(a, b): return BRepAlgoAPI_Cut(a, b).Shape()
def write(s, path, name):
    Interface_Static.SetCVal_s('write.step.schema', 'AP214IS')
    Interface_Static.SetCVal_s('write.step.product.name', name)
    w = STEPControl_Writer(); w.Transfer(s, STEPControl_AsIs); w.Write(path)

out = sys.argv[1]

# Grommet
g = fuse(cyl((0, 0, 0), (0, 0, 1), 20, 4), cyl((0, 0, 4), (0, 0, 1), 13, 16))
g = cut(g, cut(cyl((0, 0, 8), (0, 0, 1), 14, 2), cyl((0, 0, 7), (0, 0, 1), 11, 4)))   # 2 mm groove
g = cut(g, cyl((0, 0, -1), (0, 0, 1), 6, 22))
write(g, f'{out}/RUB_Grommet.stp', 'GROMMET EPDM 70 SHORE A')

# AV mount block
m = box(0, 0, 0, 60, 60, 35)
f = BRepFilletAPI_MakeFillet(m)
e = TopExp_Explorer(m, TopAbs_EDGE)
while e.More():
    f.Add(6.0, TopoDS.Edge_s(e.Current())); e.Next()
f.Build(); assert f.IsDone(); m = f.Shape()
m = cut(m, cyl((30, 30, -1), (0, 0, 1), 5, 37))
write(m, f'{out}/RUB_AV_Mount.stp', 'ANTI VIBRATION MOUNT NR 55 SHORE A')

# Door-seal profile, extruded 1,000 mm along X
foot = box(0, -9, 0, 1000, 18, 3)
bulb = cut(cyl((0, 0, 10), (1, 0, 0), 7, 1000), cyl((-1, 0, 10), (1, 0, 0), 5, 1002))
s = fuse(foot, bulb)
s = fuse(s, box(0, -1.5, 3, 1000, 3, 2))   # web from foot to bulb
write(s, f'{out}/RUB_Door_Seal.stp', 'DOOR SEAL PROFILE EPDM SPONGE')
