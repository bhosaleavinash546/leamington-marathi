"""Composite parts, modelled in OCP for the composites review (3 Oct 2026).

NOT customer parts. Three typical automotive composite mouldings, open on one
face as a laminate is:

* a roof panel: 1200 x 900 x 80 mm, R40 edges, 2 mm laminate — carbon prepreg;
* a battery-enclosure lid: 700 x 500 x 60 mm, R15 edges, 3 mm laminate — glass RTM;
* a hat-section stiffener: 400 x 120 x 40 mm, R6 edges, 2.5 mm laminate — carbon fibre.

Exported as STEP AP214. Run: python3 COMP_modelled_parts.py <out-dir>
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
    # The writer first: creating it resets the product-name parameter.
    w = STEPControl_Writer()
    Interface_Static.SetCVal_s('write.step.schema', 'AP214IS')
    Interface_Static.SetCVal_s('write.step.product.name', name)
    w.Transfer(s, STEPControl_AsIs); w.Write(path)

def open_shell(L, W, H, R, t):
    s = cut(rounded(box(0, 0, 0, L, W, H + R), R), rounded(box(t, t, -1, L - 2 * t, W - 2 * t, H + R - t + 1), R - t))
    return cut(s, box(-1, -1, -R - 1, L + 2, W + 2, R + 1))

def hat(L, W, H, R, t):
    # A hat section: an open channel (two webs and a crown) along X.
    s = cut(rounded(box(0, 0, 0, L, W, H + R), R), rounded(box(-1, t, -1, L + 2, W - 2 * t, H + R - t + 1), max(1.0, R - t)))
    return cut(s, box(-1, -1, -R - 1, L + 2, W + 2, R + 1))

out = sys.argv[1]
write(open_shell(1200, 900, 80, 40, 2.0), f'{out}/COMP_Roof_Panel.stp', 'ROOF PANEL CFRP PREPREG')
write(open_shell(700, 500, 60, 15, 3.0), f'{out}/COMP_Battery_Lid.stp', 'BATTERY ENCLOSURE LID GFRP RTM')
write(hat(400, 120, 40, 6, 2.5), f'{out}/COMP_Hat_Stiffener.stp', 'HAT STIFFENER CARBON FIBRE')
