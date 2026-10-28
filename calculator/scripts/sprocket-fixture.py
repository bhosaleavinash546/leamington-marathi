"""A plate sprocket for the STL DFM check (scripts/stl-dfm-validate.ts): ANSI #40 chain, 18 teeth.

The tooth gaps are the roller seating curves (circles at the pitch diameter) cut from the outside-diameter blank, so
each seat is a concave cylinder of LESS than a full turn - the case where a tooth form can read as a fillet.
Figures (approximate ANSI B29.1 proportions, stated, not looked up per standard edition):
  pitch p = 12.7 mm, roller Dr = 7.92 mm, N = 18
  pitch diameter  PD = p / sin(180/N)            = 73.14 mm
  outside diam.   OD = p (0.6 + cot(180/N))      = 79.65 mm
  seating curve   Ds = 1.005 Dr + 0.076          = 8.04 mm
  plate 7.2 mm thick, bore 20 mm.

  python3 scripts/sprocket-fixture.py out.step
"""
import math, sys
from OCP.BRepPrimAPI import BRepPrimAPI_MakeCylinder
from OCP.BRepAlgoAPI import BRepAlgoAPI_Cut
from OCP.gp import gp_Ax2, gp_Pnt, gp_Dir
from OCP.STEPControl import STEPControl_Writer, STEPControl_AsIs

p, dr, n, t, bore = 12.7, 7.92, 18, 7.2, 20.0
pd = p / math.sin(math.pi / n)
od = p * (0.6 + 1 / math.tan(math.pi / n))
ds = 1.005 * dr + 0.076
z = gp_Dir(0, 0, 1)
shape = BRepPrimAPI_MakeCylinder(gp_Ax2(gp_Pnt(0, 0, 0), z), od / 2, t).Shape()
shape = BRepAlgoAPI_Cut(shape, BRepPrimAPI_MakeCylinder(gp_Ax2(gp_Pnt(0, 0, -1), z), bore / 2, t + 2).Shape()).Shape()
for k in range(n):
    a = 2 * math.pi * k / n
    seat = BRepPrimAPI_MakeCylinder(gp_Ax2(gp_Pnt(pd / 2 * math.cos(a), pd / 2 * math.sin(a), -1), z), ds / 2, t + 2).Shape()
    shape = BRepAlgoAPI_Cut(shape, seat).Shape()
w = STEPControl_Writer()
w.Transfer(shape, STEPControl_AsIs)
w.Write(sys.argv[1])
print(f"PD {pd:.2f}  OD {od:.2f}  Ds {ds:.3f}")
