"""Forgings, modelled in OCP for the forging review (2 Oct 2026).

NOT customer parts. The audit set held one forging (the steering knuckle), so
two typical ones are modelled to ordinary forging design practice:

* a control-arm yoke: two Ø50 eyes 200 mm apart joined by an I-section arm,
  Ø22 bores through the eyes, eye faces machined — closed-die steel;
* a hub flange: Ø140 flange with a Ø80 hub and a Ø60 bore, 6 × Ø14 bolt holes —
  an axisymmetric ring-type forging.

Exported as STEP AP214. Run: python3 FORGE_modelled_parts.py <out-dir>
"""
import sys, math
from OCP.gp import gp_Pnt, gp_Dir, gp_Ax2
from OCP.BRepPrimAPI import BRepPrimAPI_MakeBox, BRepPrimAPI_MakeCylinder, BRepPrimAPI_MakeCone
from OCP.BRepOffsetAPI import BRepOffsetAPI_DraftAngle
from OCP.BRepAdaptor import BRepAdaptor_Surface
from OCP.GeomAbs import GeomAbs_Plane
from OCP.TopExp import TopExp_Explorer
from OCP.TopAbs import TopAbs_FACE
from OCP.TopoDS import TopoDS
from OCP.gp import gp_Pln
from OCP.BRepAlgoAPI import BRepAlgoAPI_Fuse, BRepAlgoAPI_Cut
from OCP.STEPControl import STEPControl_Writer, STEPControl_AsIs
from OCP.Interface import Interface_Static

def box(x, y, z, dx, dy, dz): return BRepPrimAPI_MakeBox(gp_Pnt(x, y, z), dx, dy, dz).Shape()
def cyl(p, d, r, h): return BRepPrimAPI_MakeCylinder(gp_Ax2(gp_Pnt(*p), gp_Dir(*d)), r, h).Shape()
def fuse(a, b): return BRepAlgoAPI_Fuse(a, b).Shape()
def cut(a, b): return BRepAlgoAPI_Cut(a, b).Shape()
def cone(p, r1, r2, h): return BRepPrimAPI_MakeCone(gp_Ax2(gp_Pnt(*p), gp_Dir(0, 0, 1)), r1, r2, h).Shape()
def drafted_box(x, y, z, dx, dy, dz, deg, zn):
    """A box whose four side walls carry `deg` of draft about the parting plane z = zn."""
    b = box(x, y, z, dx, dy, dz)
    d = BRepOffsetAPI_DraftAngle(b)
    e = TopExp_Explorer(b, TopAbs_FACE)
    while e.More():
        f = TopoDS.Face_s(e.Current()); a = BRepAdaptor_Surface(f)
        if a.GetType() == GeomAbs_Plane and abs(a.Plane().Axis().Direction().Z()) < 1e-6:
            d.Add(f, gp_Dir(0, 0, 1 if zn <= z else -1), math.radians(deg), gp_Pln(gp_Pnt(0, 0, zn), gp_Dir(0, 0, 1)))
        e.Next()
    d.Build(); assert d.IsDone(), 'draft failed'
    return d.Shape()
def write(s, path, name):
    Interface_Static.SetCVal_s('write.step.schema', 'AP214IS')
    Interface_Static.SetCVal_s('write.step.product.name', name)
    w = STEPControl_Writer(); w.Transfer(s, STEPControl_AsIs); w.Write(path)

out = sys.argv[1]

# ── Control-arm yoke: eyes Ø50 × 30 at x = 0 and 200; I-section arm between ──
# Forged in a die parting at mid-height (z = 15): every side wall carries 5° of
# draft away from the parting line, as a forging drawing would.
DRAFT = 5.0; tan = math.tan(math.radians(DRAFT))
def drafted_eye(x):
    lo = cone((x, 0, 0), 25 - 15 * tan, 25, 15)             # widens up to the parting line
    hi = cone((x, 0, 15), 25, 25 - 15 * tan, 15)            # narrows above it
    return fuse(lo, hi)
y = fuse(drafted_eye(0.0), drafted_eye(200.0))
y = fuse(y, drafted_box(20, -6, 0, 160, 12, 15, DRAFT, 15.0))       # web, lower half
y = fuse(y, drafted_box(20, -6, 15, 160, 12, 15, DRAFT, 15.0))      # web, upper half
y = fuse(y, drafted_box(20, -18, 0, 160, 36, 6, DRAFT, 15.0))       # bottom flange
y = fuse(y, drafted_box(20, -18, 24, 160, 36, 6, DRAFT, 15.0))      # top flange
for x in (0.0, 200.0):
    y = cut(y, cyl((x, 0, -1), (0, 0, 1), 11, 32))   # Ø22 bores, machined
write(y, f'{out}/FORGE_Control_Arm_Yoke.stp', 'CONTROL ARM YOKE FORGING 42CRMO4')

# ── Hub flange: Ø140 × 18 flange, Ø80 × 32 hub, Ø60 bore, 6 × Ø14 on PCD 110 ──
h = fuse(cyl((0, 0, 0), (0, 0, 1), 70, 18), cyl((0, 0, 18), (0, 0, 1), 40, 32))
h = cut(h, cyl((0, 0, -1), (0, 0, 1), 30, 52))
for k in range(6):
    a = math.radians(60 * k)
    h = cut(h, cyl((55 * math.cos(a), 55 * math.sin(a), -1), (0, 0, 1), 7, 20))
write(h, f'{out}/FORGE_Hub_Flange.stp', 'HUB FLANGE FORGING C45')
