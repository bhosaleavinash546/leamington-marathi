"""Export a STEP file to a binary STL at a stated tessellation — the fixture maker for the STL DFM validation.

    python3 scripts/stl-export.py in.step out.stl <linear_mm or diag/N> <angular_rad>

e.g. `diag/500 0.3` is the viewer's own mesh (17 deg between facet normals); `diag/500 0.5` a coarser CAD export.
Pure OCP, as the geometry kernel."""
import math
import sys

from OCP.STEPControl import STEPControl_Reader
from OCP.BRepMesh import BRepMesh_IncrementalMesh
from OCP.StlAPI import StlAPI_Writer
from OCP.Bnd import Bnd_Box
from OCP.BRepBndLib import BRepBndLib

src, dst, lin, ang = sys.argv[1], sys.argv[2], sys.argv[3], float(sys.argv[4])
r = STEPControl_Reader()
if r.ReadFile(src) != 1:
    sys.exit(f"cannot read {src}")
r.TransferRoots()
shape = r.OneShape()
box = Bnd_Box()
BRepBndLib.Add_s(shape, box)
x0, y0, z0, x1, y1, z1 = box.Get()
diag = math.sqrt((x1 - x0) ** 2 + (y1 - y0) ** 2 + (z1 - z0) ** 2)
linear = diag / float(lin.split("/")[1]) if lin.startswith("diag/") else float(lin)
BRepMesh_IncrementalMesh(shape, linear, False, ang, True)
w = StlAPI_Writer()
w.ASCIIMode = False
if not w.Write(shape, dst):
    sys.exit("STL write failed")
print(f"{dst} linear {linear:.4f} mm angular {ang} rad")
