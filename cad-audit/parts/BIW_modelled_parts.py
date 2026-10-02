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



def shell_open_top(s, t):
    hi = None; zmax = -1e9
    for f in faces(s):
        n, o = plane_normal(f)
        if n and n[2] > 0.999 and o[2] > zmax: hi, zmax = f, o[2]
    lst = TopTools_ListOfShape(); lst.Append(hi)
    mk = BRepOffsetAPI_MakeThickSolid(); mk.MakeThickSolidByJoin(s, lst, -t, 1e-3); mk.Build()
    assert mk.IsDone(), 'shell failed'
    return mk.Shape()

def fillet_all_but_top(s, r_vert, r_floor, ztop):
    f = BRepFilletAPI_MakeFillet(s)
    for e in edges(s):
        c = BRepAdaptor_Curve(e)
        if c.GetType() != GeomAbs_Line: continue
        p1, p2 = c.Value(c.FirstParameter()), c.Value(c.LastParameter())
        if abs(p1.Z() - ztop) < 1e-6 and abs(p2.Z() - ztop) < 1e-6: continue   # rim stays sharp (it opens)
        vertical = abs(p1.Z() - p2.Z()) > 1e-6
        f.Add(r_vert if vertical else r_floor, e)
    f.Build(); assert f.IsDone(), 'fillet failed'
    return f.Shape()

def drawn_pan(L, W, H, t, flange, draft, rv, rf):
    s = box(-L/2, -W/2, 0, L, W, H)
    s = draft_sides(s, draft)
    s = fillet_all_but_top(s, rv, rf, H)
    s = shell_open_top(s, t)
    ring = cut(box(-L/2 - flange, -W/2 - flange, H - t, L + 2*flange, W + 2*flange, t), box(-L/2 + 1, -W/2 + 1, H - t - 1, L - 2, W - 2, t + 2))
    return fuse(s, ring)

out = sys.argv[1]
# BIW floor reinforcement: 450 x 300 x 70 mm drawn pan, 1.2 mm, 4° draft, R15/R8, 25 mm flange.
p = drawn_pan(450.0, 300.0, 70.0, 1.2, 25.0, 4.0, 15.0, 8.0)
p = cut(p, cyl(-120, 0, -1, 6.0, 5))          # 2 drain / locating holes in the floor
p = cut(p, cyl(120, 0, -1, 6.0, 5))
write(p, f'{out}/BIW_Floor_Reinforcement.stp', 'BIW FLOOR REINFORCEMENT PRESSING')
# BIW dash / inner panel: 1100 x 700 x 120 mm drawn, 0.9 mm, 5° draft, R40/R15, 30 mm flange.
q = drawn_pan(1100.0, 700.0, 120.0, 0.9, 30.0, 5.0, 40.0, 15.0)
write(q, f'{out}/BIW_Inner_Panel.stp', 'BIW INNER PANEL PRESSING')
# BIW reinforcement channel: U-section 240 long, 60 wide, 40 high, 2.0 mm, inner bend R3, 3 holes.
t = 2.0; ri = 3.0
c = box(-120, -30, 0, 240, 60, 40)
c = cut(c, box(-121, -30 + t, t, 242, 60 - 2*t, 41))
f = BRepFilletAPI_MakeFillet(c)
for e in edges(c):
    cc = BRepAdaptor_Curve(e)
    if cc.GetType() != GeomAbs_Line: continue
    p1, p2 = cc.Value(cc.FirstParameter()), cc.Value(cc.LastParameter())
    if abs(p1.X() - p2.X()) > 200 and min(p1.Z(), p2.Z()) < t + 1e-6 and max(p1.Z(), p2.Z()) < t + 1e-6:
        inner = abs(abs(p1.Y()) - (30 - t)) < 1e-6 and abs(p1.Z() - t) < 1e-6
        outer = abs(abs(p1.Y()) - 30) < 1e-6 and abs(p1.Z()) < 1e-6
        if inner: f.Add(ri, e)
        elif outer: f.Add(ri + t, e)
f.Build(); assert f.IsDone(); c = f.Shape()
for x in (-80.0, 0.0, 80.0):
    c = cut(c, cyl(x, 0, -1, 4.5, 5))
write(c, f'{out}/BIW_Reinf_Channel.stp', 'BIW REINFORCEMENT CHANNEL PRESSING')
