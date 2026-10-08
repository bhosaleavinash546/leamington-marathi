import math
from OCP.BRepPrimAPI import BRepPrimAPI_MakeBox, BRepPrimAPI_MakeCylinder, BRepPrimAPI_MakeCone
from OCP.BRepAlgoAPI import BRepAlgoAPI_Cut, BRepAlgoAPI_Fuse
from OCP.BRepFilletAPI import BRepFilletAPI_MakeFillet
from OCP.gp import gp_Pnt, gp_Ax2, gp_Dir
from OCP.TopExp import TopExp_Explorer
from OCP.TopAbs import TopAbs_EDGE
from OCP.TopoDS import TopoDS
from OCP.BRepAdaptor import BRepAdaptor_Curve
from OCP.STEPControl import STEPControl_Writer, STEPControl_AsIs
blk = BRepPrimAPI_MakeBox(gp_Pnt(-50, -30, 0), 100, 60, 40).Shape()
r = 5.0; depth = 25.0; tip = r / math.tan(math.radians(59))
cyl = BRepPrimAPI_MakeCylinder(gp_Ax2(gp_Pnt(-30, 0, 40 - depth), gp_Dir(0, 0, 1)), r, depth + 1).Shape()
cone = BRepPrimAPI_MakeCone(gp_Ax2(gp_Pnt(-30, 0, 40 - depth - tip), gp_Dir(0, 0, 1)), 0.0, r, tip).Shape()
tool = BRepAlgoAPI_Fuse(cyl, cone).Shape()
part = BRepAlgoAPI_Cut(blk, tool).Shape()
# pocket tool: box 30x30x(20+5) at z 20..45, fillet vertical edges R4 and bottom edges R1
pk = BRepPrimAPI_MakeBox(gp_Pnt(5, -15, 20), 30, 30, 25).Shape()
mf = BRepFilletAPI_MakeFillet(pk)
ex = TopExp_Explorer(pk, TopAbs_EDGE)
while ex.More():
    e = TopoDS.Edge_s(ex.Current()); ex.Next()
    c = BRepAdaptor_Curve(e); p0 = c.Value(c.FirstParameter()); p1 = c.Value(c.LastParameter())
    if abs(p0.X() - p1.X()) < 1e-6 and abs(p0.Y() - p1.Y()) < 1e-6:
        mf.Add(4.0, e)
pk = mf.Shape()
mf2 = BRepFilletAPI_MakeFillet(pk)
ex = TopExp_Explorer(pk, TopAbs_EDGE)
while ex.More():
    e = TopoDS.Edge_s(ex.Current()); ex.Next()
    c = BRepAdaptor_Curve(e); p0 = c.Value(c.FirstParameter()); p1 = c.Value(c.LastParameter()); pm = c.Value((c.FirstParameter()+c.LastParameter())/2)
    if abs(p0.Z() - 20) < 1e-6 and abs(p1.Z() - 20) < 1e-6 and abs(pm.Z()-20)<1e-6:
        mf2.Add(1.0, e)
pk = mf2.Shape()
part = BRepAlgoAPI_Cut(part, pk).Shape()
w = STEPControl_Writer(); w.Transfer(part, STEPControl_AsIs); w.Write("test.step")
