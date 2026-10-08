# Review case (Oct 2026): a 40 mm SOLID block with a Ø10 bore right across it along X, draw Z — a side core in a mould,
# a core in a casting. The cavity probe once read the bore as "the inside of a hollow body" (from inside a long bore
# almost every ray hits the far wall) and dropped it from the undercut count. Run in a scratch dir:
#   python3 cross-bore.gen.py && CV_EXTRACT_FEATURES=1 python3 <repo>/calculator/server/utils/cad-geometry-engine.py test.step
from OCP.BRepPrimAPI import BRepPrimAPI_MakeBox, BRepPrimAPI_MakeCylinder
from OCP.BRepAlgoAPI import BRepAlgoAPI_Cut
from OCP.gp import gp_Pnt, gp_Ax2, gp_Dir
from OCP.STEPControl import STEPControl_Writer, STEPControl_AsIs
box = BRepPrimAPI_MakeBox(gp_Pnt(0, -20, -20), 40, 40, 40).Shape()
cyl = BRepPrimAPI_MakeCylinder(gp_Ax2(gp_Pnt(-1, 0, 0), gp_Dir(1, 0, 0), gp_Dir(0, 0, 1)), 5, 42).Shape()
part = BRepAlgoAPI_Cut(box, cyl).Shape()
w = STEPControl_Writer(); w.Transfer(part, STEPControl_AsIs); w.Write("test.step")
