"""Rotomoulded parts, modelled in OCP for the rotational-moulding review (3 Oct 2026).

NOT customer parts. The audit set holds one real hollow tank (the fuel tank,
measured geometry in cad-audit/final/runs/FINAL-Fuel_tank-api.json), costed as
a low-volume rotomoulding. Two typical off-highway / commercial-vehicle
rotomouldings are modelled alongside it:

* a 30 L coolant / AdBlue tank: 450 x 320 x 260 mm, R30 edges, 5 mm wall, a
  Ø60 filler neck 40 mm tall — LLDPE;
* a 4 L header tank: 240 x 160 x 140 mm, R15 edges, 4 mm wall, a Ø40 neck
  — LLDPE, small enough to share an arm.

Exported as STEP AP214. Run: python3 ROTO_modelled_parts.py <out-dir>
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

def tank(L, W, H, R, t, neck_r, neck_h, neck_x):
    s = cut(rounded(box(0, 0, 0, L, W, H), R), rounded(box(t, t, t, L - 2 * t, W - 2 * t, H - 2 * t), R - t))
    s = fuse(s, cyl((neck_x, W / 2, H - t), (0, 0, 1), neck_r, neck_h + t))
    return cut(s, cyl((neck_x, W / 2, H - 2 * t), (0, 0, 1), neck_r - t, neck_h + 3 * t))

out = sys.argv[1]
write(tank(450, 320, 260, 30, 5.0, 30, 40, 110), f'{out}/ROTO_Coolant_Tank.stp', 'COOLANT TANK LLDPE ROTOMOULDED')
write(tank(240, 160, 140, 15, 4.0, 20, 30, 70), f'{out}/ROTO_Header_Tank.stp', 'HEADER TANK LLDPE ROTOMOULDED')
