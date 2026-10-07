"""Exact B-rep cut area: common(solid, half-space coord<=at), sum of the faces lying on the plane."""
import json, sys
from OCP.STEPControl import STEPControl_Reader
from OCP.BRepAlgoAPI import BRepAlgoAPI_Common
from OCP.BRepPrimAPI import BRepPrimAPI_MakeBox
from OCP.gp import gp_Pnt
from OCP.Bnd import Bnd_Box
from OCP.BRepBndLib import BRepBndLib
from OCP.TopExp import TopExp_Explorer
from OCP.TopAbs import TopAbs_FACE
from OCP.TopoDS import TopoDS
from OCP.GProp import GProp_GProps
from OCP.BRepGProp import BRepGProp

path, cuts = sys.argv[1], json.loads(sys.argv[2])
r = STEPControl_Reader(); r.ReadFile(path); r.TransferRoots(); shape = r.OneShape()
bb = Bnd_Box(); BRepBndLib.Add_s(shape, bb); x0, y0, z0, x1, y1, z1 = bb.Get()
lo, hi = [x0 - 10, y0 - 10, z0 - 10], [x1 + 10, y1 + 10, z1 + 10]
out = []
for c in cuts:
    ax, at = c['axis'], c['at']
    h = list(hi); h[ax] = at
    box = BRepPrimAPI_MakeBox(gp_Pnt(*lo), gp_Pnt(*h)).Shape()
    common = BRepAlgoAPI_Common(shape, box).Shape()
    area = 0.0
    ex = TopExp_Explorer(common, TopAbs_FACE)
    while ex.More():
        f = TopoDS.Face_s(ex.Current())
        fb = Bnd_Box(); BRepBndLib.Add_s(f, fb); fb.SetGap(0.0)
        b = fb.Get()
        if abs(b[ax] - at) < 1e-4 and abs(b[ax + 3] - at) < 1e-4:
            g = GProp_GProps(); BRepGProp.SurfaceProperties_s(f, g); area += g.Mass()
        ex.Next()
    out.append({'axis': ax, 'at': at, 'area': area})
print(json.dumps(out))
