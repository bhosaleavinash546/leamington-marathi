from OCP.BRepPrimAPI import BRepPrimAPI_MakeBox, BRepPrimAPI_MakeCylinder, BRepPrimAPI_MakeHalfSpace
from OCP.BRepAlgoAPI import BRepAlgoAPI_Cut
from OCP.BRepBuilderAPI import BRepBuilderAPI_MakeFace
from OCP.gp import gp_Pnt, gp_Ax2, gp_Dir, gp_Pln
from OCP.ShapeUpgrade import ShapeUpgrade_ShapeDivideClosed
from OCP.STEPControl import STEPControl_Writer, STEPControl_AsIs
blk = BRepPrimAPI_MakeBox(gp_Pnt(-50, -30, 0), 100, 60, 40).Shape()
# chamfer the top with an inclined plane: remove material above plane through (0,0,40) normal (0.3,0,1)
pl = gp_Pln(gp_Pnt(0, 0, 35), gp_Dir(0, 0.3, 1))
face = BRepBuilderAPI_MakeFace(pl).Face()
hs = BRepPrimAPI_MakeHalfSpace(face, gp_Pnt(0, 0, 100)).Solid()
blk = BRepAlgoAPI_Cut(blk, hs).Shape()
# through hole Ø8 along Z at x=10 (exits the inclined top)
cyl = BRepPrimAPI_MakeCylinder(gp_Ax2(gp_Pnt(10, 0, -5), gp_Dir(0, 0, 1)), 4, 100).Shape()
part = BRepAlgoAPI_Cut(blk, cyl).Shape()
d = ShapeUpgrade_ShapeDivideClosed(part); d.SetNbSplitPoints(1); d.Perform()
part = d.Result()
w = STEPControl_Writer(); w.Transfer(part, STEPControl_AsIs); w.Write("test2.step")
