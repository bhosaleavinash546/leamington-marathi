"""Thermoformed parts, modelled in OCP for the thermoforming review (3 Oct 2026).

NOT customer parts. Two typical heavy-gauge automotive / off-highway
thermoformings, open on one face as a formed part is:

* a battery-box lid: 900 x 600 x 250 mm, R25 edges, 4 mm formed wall —
  HDPE, a deep draw (depth / opening 0.42);
* an interior trim cover: 300 x 200 x 40 mm, R8 edges, 2.5 mm formed wall —
  ABS, a shallow vacuum form.

The 600 x 400 x 60 storage tray (IM_modelled_parts.py) is costed as a third.
Exported as STEP AP214. Run: python3 TF_modelled_parts.py <out-dir>
"""
import sys
from OCP.gp import gp_Pnt
from OCP.BRepPrimAPI import BRepPrimAPI_MakeBox
from OCP.BRepAlgoAPI import BRepAlgoAPI_Cut
from OCP.BRepFilletAPI import BRepFilletAPI_MakeFillet
from OCP.TopExp import TopExp_Explorer
from OCP.TopAbs import TopAbs_EDGE
from OCP.TopoDS import TopoDS
from OCP.STEPControl import STEPControl_Writer, STEPControl_AsIs
from OCP.Interface import Interface_Static

def box(x, y, z, dx, dy, dz): return BRepPrimAPI_MakeBox(gp_Pnt(x, y, z), dx, dy, dz).Shape()
def cut(a, b): return BRepAlgoAPI_Cut(a, b).Shape()
def rounded(s, r):
    f = BRepFilletAPI_MakeFillet(s)
    e = TopExp_Explorer(s, TopAbs_EDGE)
    while e.More():
        f.Add(r, TopoDS.Edge_s(e.Current())); e.Next()
    f.Build(); assert f.IsDone(); return f.Shape()
def write(s, path, name):
    # The writer first: creating it resets the product-name parameter, so the
    # first file of a run would otherwise carry the translator's default name.
    w = STEPControl_Writer()
    Interface_Static.SetCVal_s('write.step.schema', 'AP214IS')
    Interface_Static.SetCVal_s('write.step.product.name', name)
    w.Transfer(s, STEPControl_AsIs); w.Write(path)

def open_shell(L, W, H, R, t):
    # A closed rounded box shelled to t, then the bottom face cut away: the
    # formed part, open where the sheet's clamp line was.
    s = cut(rounded(box(0, 0, 0, L, W, H + R), R), rounded(box(t, t, -1, L - 2 * t, W - 2 * t, H + R - t + 1), R - t))
    return cut(s, box(-1, -1, -R - 1, L + 2, W + 2, R + 1))

out = sys.argv[1]
write(open_shell(900, 600, 250, 25, 4.0), f'{out}/TF_Battery_Box_Lid.stp', 'BATTERY BOX LID HDPE THERMOFORMED')
write(open_shell(300, 200, 40, 8, 2.5), f'{out}/TF_Trim_Cover.stp', 'TRIM COVER ABS VACUUM FORMED')
