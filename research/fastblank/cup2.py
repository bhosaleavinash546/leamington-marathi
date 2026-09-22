import math, sys, time
sys.path.insert(0, __file__.rsplit('/', 1)[0])
import numpy as np
import proto
from proto import develop
from OCP.BRepBuilderAPI import BRepBuilderAPI_MakeEdge, BRepBuilderAPI_MakeWire, BRepBuilderAPI_MakeFace
from OCP.BRepPrimAPI import BRepPrimAPI_MakeRevol
from OCP.GC import GC_MakeArcOfCircle
from OCP.gp import gp_Pnt, gp_Ax1, gp_Dir
Ro, H, t, Rp = 40.0, 50.0, 2.0, 8.0
P = lambda x, z: gp_Pnt(x, 0, z)
def seg(a, b): return BRepBuilderAPI_MakeEdge(P(*a), P(*b)).Edge()
def arc(a, m, b): return BRepBuilderAPI_MakeEdge(GC_MakeArcOfCircle(P(*a), P(*m), P(*b)).Value()).Edge()
c = Ro - Rp
s2 = math.sqrt(0.5)
edges = [seg((0, 0), (c, 0)),
         arc((c, 0), (c + Rp * s2, Rp - Rp * s2), (Ro, Rp)),
         seg((Ro, Rp), (Ro, H)), seg((Ro, H), (Ro - t, H)), seg((Ro - t, H), (Ro - t, Rp)),
         arc((Ro - t, Rp), (c + (Rp - t) * s2, Rp - (Rp - t) * s2), (c, t)),
         seg((c, t), (0, t)), seg((0, t), (0, 0))]
w = BRepBuilderAPI_MakeWire()
for e in edges: w.Add(e)
face = BRepBuilderAPI_MakeFace(w.Wire()).Face()
cup = BRepPrimAPI_MakeRevol(face, gp_Ax1(gp_Pnt(0, 0, 0), gp_Dir(0, 0, 1)), 2 * math.pi).Shape()
rho = Rp - t / 2
A_mid = math.pi * c * c + 2 * math.pi * (c * (math.pi * rho / 2) + rho * rho) + 2 * math.pi * (Ro - t / 2) * (H - Rp)
Dt = math.sqrt(4 * A_mid / math.pi)
print(f'cup Ø{2*Ro} x {H}, t{t}, punch radius {Rp}:  area-equivalence blank Ø{Dt:.2f}')
for h in (8.0, 5.0, 3.5):
    t0 = time.time(); r = develop(cup, 0.3, hmax=h); dt = time.time() - t0
    a = [s['inv']['gross'] for s in r['skins']]
    Dm = math.sqrt(4 * np.mean(a) / math.pi)
    fl = sum(s['inv']['flips'] for s in r['skins'])
    e3 = [-(s['inv']['e1'] + s['inv']['e2']) for s in r['skins']]
    th = max((1 - np.exp(x)).max() for x in e3); tk = max((np.exp(x) - 1).max() for x in e3)
    print(f'  mesh {h:4.1f} mm {r["nsolve"]:6d} tri  blank Ø{Dm:7.2f} ({(Dm-Dt)/Dt*100:+.2f}%)  '
          f'thinning max {th*100:4.1f}%  thickening max {tk*100:4.1f}%  flips {fl}  '
          f'iters {proto.inverse.last[0]}  {dt:5.1f}s')
