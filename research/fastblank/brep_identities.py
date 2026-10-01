"""
Blank quantities from the B-rep alone — no unfolding (1 Oct 2026).

For a sheet solid: surface = 2 skins + edge band, and the edge band is
cut length x gauge. So with the gauge t:
    net blank area  A = V / t
    cut length      P = (S - 2A) / t
Gauge is the radius difference between coaxial bend cylinders (inner and
outer face of the same bend), which is far more robust than a ray-cast.
Exact for developable (bent) parts; cut length is an upper bound on drawn ones.

    python3 brep_identities.py ../../cad-audit/parts/Seat_Locking_Bracket.stp
Seat bracket: gauge 1.60, net 444.2 cm2, cut 1,940 mm — the ARAP prototype
(proto.py) gave 444 cm2 and 1,939 mm. Pure Python + OCP, no numpy.
"""
import sys, math, collections
from OCP.STEPControl import STEPControl_Reader
from OCP.TopExp import TopExp_Explorer
from OCP.TopAbs import TopAbs_FACE
from OCP.TopoDS import TopoDS
from OCP.BRepAdaptor import BRepAdaptor_Surface
from OCP.GeomAbs import GeomAbs_Cylinder
from OCP.GProp import GProp_GProps
from OCP.BRepGProp import BRepGProp

def main(path):
    r = STEPControl_Reader(); assert r.ReadFile(path) == 1, 'read failed'
    r.TransferRoots(); shape = r.OneShape()
    g = GProp_GProps(); BRepGProp.VolumeProperties_s(shape, g); V = g.Mass()
    g = GProp_GProps(); BRepGProp.SurfaceProperties_s(shape, g); S = g.Mass()
    cyl = []
    exp = TopExp_Explorer(shape, TopAbs_FACE)
    while exp.More():
        f = TopoDS.Face_s(exp.Current()); exp.Next()
        a = BRepAdaptor_Surface(f)
        if a.GetType() == GeomAbs_Cylinder:
            c = a.Cylinder(); ax = c.Axis(); p = ax.Location(); d = ax.Direction()
            cyl.append(((round(d.X(), 3), round(d.Y(), 3), round(d.Z(), 3)), (p.X(), p.Y(), p.Z()), c.Radius()))
    pairs = []
    for i in range(len(cyl)):
        for j in range(i + 1, len(cyl)):
            (da, pa, ra), (db, pb, rb) = cyl[i], cyl[j]
            if da != db and tuple(-x for x in da) != db:
                continue
            v = [pa[k] - pb[k] for k in range(3)]; dot = sum(v[k] * da[k] for k in range(3))
            if math.sqrt(max(0.0, sum(x * x for x in v) - dot * dot)) > 0.05:
                continue
            dr = abs(ra - rb)
            if 0.3 < dr < 6:
                pairs.append(round(dr, 2))
    cnt = collections.Counter(pairs)
    if not cnt:
        print('no coaxial bend cylinders — not a bent sheet part, or no bends'); return
    t = cnt.most_common(1)[0][0]
    A = V / t; P = (S - 2 * A) / t
    print(f'volume {V/1000:.2f} cm3  surface {S/100:.2f} cm2')
    print(f'gauge candidates {cnt.most_common(5)} -> gauge {t} mm')
    print(f'net blank area V/t = {A/100:.1f} cm2   cut length (S-2A)/t = {P:.0f} mm')

if __name__ == '__main__':
    main(sys.argv[1])
