"""Production-style injection-moulded parts, modelled in OCP to common moulding
design rules (nominal wall, draft on walls, fillets, bosses ~60% of wall,
ribs ~50-60% of wall, snap-fit windows). Exported as STEP AP214."""
import math, sys
from OCP.gp import gp_Pnt, gp_Dir, gp_Ax2, gp_Pln, gp_Vec, gp_Trsf
from OCP.BRepPrimAPI import BRepPrimAPI_MakeBox, BRepPrimAPI_MakeCylinder
from OCP.BRepAlgoAPI import BRepAlgoAPI_Fuse, BRepAlgoAPI_Cut
from OCP.BRepOffsetAPI import BRepOffsetAPI_MakeThickSolid, BRepOffsetAPI_DraftAngle
from OCP.BRepFilletAPI import BRepFilletAPI_MakeFillet
from OCP.BRepBuilderAPI import BRepBuilderAPI_Transform
from OCP.TopExp import TopExp_Explorer
from OCP.TopAbs import TopAbs_FACE, TopAbs_EDGE
from OCP.TopoDS import TopoDS
from OCP.TopTools import TopTools_ListOfShape
from OCP.BRepAdaptor import BRepAdaptor_Surface, BRepAdaptor_Curve
from OCP.GeomAbs import GeomAbs_Plane, GeomAbs_Line
from OCP.STEPControl import STEPControl_Writer, STEPControl_AsIs
from OCP.Interface import Interface_Static
from OCP.BRepCheck import BRepCheck_Analyzer
from OCP.GProp import GProp_GProps
from OCP.BRepGProp import BRepGProp

def faces(s):
    e = TopExp_Explorer(s, TopAbs_FACE)
    while e.More():
        yield TopoDS.Face_s(e.Current()); e.Next()
def edges(s):
    e = TopExp_Explorer(s, TopAbs_EDGE)
    while e.More():
        yield TopoDS.Edge_s(e.Current()); e.Next()
def plane_normal(f):
    a = BRepAdaptor_Surface(f)
    if a.GetType() != GeomAbs_Plane: return None, None
    p = a.Plane(); n = p.Axis().Direction(); o = p.Location()
    if f.Orientation() == 1: n = n.Reversed()
    return (n.X(), n.Y(), n.Z()), (o.X(), o.Y(), o.Z())
def box(x, y, z, dx, dy, dz): return BRepPrimAPI_MakeBox(gp_Pnt(x, y, z), dx, dy, dz).Shape()
def cyl(x, y, z, r, h): return BRepPrimAPI_MakeCylinder(gp_Ax2(gp_Pnt(x, y, z), gp_Dir(0, 0, 1)), r, h).Shape()
def fuse(a, b): return BRepAlgoAPI_Fuse(a, b).Shape()
def cut(a, b): return BRepAlgoAPI_Cut(a, b).Shape()

def draft_sides(s, deg):
    d = BRepOffsetAPI_DraftAngle(s)
    pln = gp_Pln(gp_Pnt(0, 0, 0), gp_Dir(0, 0, 1))
    for f in faces(s):
        n, _ = plane_normal(f)
        if n and abs(n[2]) < 1e-6:
            d.Add(f, gp_Dir(0, 0, 1), math.radians(deg), pln)
    d.Build(); assert d.IsDone(), 'draft failed'
    return d.Shape()

def fillet_vertical_and_top(s, r, zmin):
    f = BRepFilletAPI_MakeFillet(s); k = 0
    for e in edges(s):
        c = BRepAdaptor_Curve(e)
        if c.GetType() != GeomAbs_Line: continue
        p1, p2 = c.Value(c.FirstParameter()), c.Value(c.LastParameter())
        if min(p1.Z(), p2.Z()) <= zmin + 1e-6 and max(p1.Z(), p2.Z()) <= zmin + 1e-6: continue  # open rim
        f.Add(r, e); k += 1
    f.Build(); assert f.IsDone(), 'fillet failed'
    return f.Shape()

def shell_open_bottom(s, t):
    lo = None
    for f in faces(s):
        n, o = plane_normal(f)
        if n and n[2] < -0.999: lo = f
    lst = TopTools_ListOfShape(); lst.Append(lo)
    mk = BRepOffsetAPI_MakeThickSolid()
    mk.MakeThickSolidByJoin(s, lst, -t, 1e-3)
    mk.Build(); assert mk.IsDone(), 'shell failed'
    return mk.Shape()

def write(s, path, name):
    assert BRepCheck_Analyzer(s).IsValid(), f'{name}: invalid solid'
    Interface_Static.SetCVal_s('write.step.schema', 'AP214IS')
    Interface_Static.SetCVal_s('write.step.product.name', name)
    w = STEPControl_Writer(); w.Transfer(s, STEPControl_AsIs); w.Write(path)
    g = GProp_GProps(); BRepGProp.VolumeProperties_s(s, g)
    print(f'{name}: {g.Mass()/1000:.1f} cm³ -> {path}')

out = sys.argv[1]

# 1. ECU cover: 180 x 120 x 40 mm, 2.5 mm wall, 1.5° draft, R3 outer fillets,
#    4 screw bosses (OD 7 / ID 3.2 for a self-tapping screw), a rib grid
#    1.5 mm thick, 2 snap-fit windows through the long walls (side-action undercuts).
L, W, H, T = 180.0, 120.0, 40.0, 2.5
s = box(-L/2, -W/2, 0, L, W, H)
s = draft_sides(s, 1.5)
s = fillet_vertical_and_top(s, 3.0, 0.0)
s = shell_open_bottom(s, T)
for (x, y) in [(-L/2+10, -W/2+10), (L/2-10, -W/2+10), (-L/2+10, W/2-10), (L/2-10, W/2-10)]:
    s = fuse(s, cyl(x, y, 6, 3.5, H-6-T+0.5))
    s = cut(s, cyl(x, y, 0, 1.6, H-T-2))
for x in (-30.0, 30.0):
    s = fuse(s, box(x-0.75, -W/2+4, 15, 1.5, W-8, H-15-T+0.5))
s = fuse(s, box(-L/2+6, -0.75, 15, L-12, 1.5, H-15-T+0.5))
for x in (-40.0, 40.0):
    s = cut(s, box(x-8, -W/2-5, 8, 16, 12, 5))      # snap windows, front wall
    s = cut(s, box(x-8, W/2-7, 8, 16, 12, 5))       # snap windows, back wall
write(s, f'{out}/IM_ECU_Cover.stp', 'ECU COVER MOULDING')

# 2. Cable clip: 40 x 25 x 12 mm, 2 mm wall, open U-channel with a latch hole.
c = box(-20, -12.5, 0, 40, 25, 12)
c = draft_sides(c, 1.0)
c = shell_open_bottom(c, 2.0)
c = cut(c, box(-5, -14, 4, 10, 30, 4))               # latch window through both walls
c = cut(c, cyl(0, 0, 8, 2.6, 6))                     # 5.2 mm fixing hole in the roof
write(c, f'{out}/IM_Cable_Clip.stp', 'CABLE CLIP MOULDING')

# 3. Storage tray: 600 x 400 x 60 mm, 3 mm wall, 2° draft, R5 fillets, 2 ribs.
L, W, H, T = 600.0, 400.0, 60.0, 3.0
t = box(-L/2, -W/2, 0, L, W, H)
t = draft_sides(t, 2.0)
t = fillet_vertical_and_top(t, 5.0, 0.0)
t = shell_open_bottom(t, T)
for x in (-100.0, 100.0):
    t = fuse(t, box(x-0.9, -W/2+6, 30, 1.8, W-12, H-30-T+0.5))
write(t, f'{out}/IM_Storage_Tray.stp', 'STORAGE TRAY MOULDING')
