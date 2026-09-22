import math, sys, time
sys.path.insert(0, __file__.rsplit('/', 1)[0])
import numpy as np
from proto import develop, min_rect
from OCP.BRepPrimAPI import BRepPrimAPI_MakeBox, BRepPrimAPI_MakeCylinder
from OCP.BRepAlgoAPI import BRepAlgoAPI_Fuse, BRepAlgoAPI_Cut, BRepAlgoAPI_Common
from OCP.gp import gp_Pnt, gp_Ax2, gp_Dir

def fuse(a, b): f = BRepAlgoAPI_Fuse(a, b); f.Build(); return f.Shape()
def cut(a, b): f = BRepAlgoAPI_Cut(a, b); f.Build(); return f.Shape()
def common(a, b): f = BRepAlgoAPI_Common(a, b); f.Build(); return f.Shape()
def box(x, y, z, dx, dy, dz): return BRepPrimAPI_MakeBox(gp_Pnt(x, y, z), dx, dy, dz).Shape()
def cyl(x, y, z, d, r, h): return BRepPrimAPI_MakeCylinder(gp_Ax2(gp_Pnt(x, y, z), gp_Dir(*d)), r, h).Shape()

def report(name, r, expect):
    print(f'\n== {name}   ({r["ntri"]} triangles, gauge measured {r["t"]:.3f} mm, '
          f'{r["skin_faces"]} skin / {r["edge_faces"]} edge faces)')
    for k, s in enumerate(r['skins']):
        print(f'   skin {k}: 3D area {s["skin_area_3d"]:10.2f}   flat net {s["net"]:10.2f}   '
              f'flat gross {s["gross"]:10.2f}   cut {s["perimeter"]:8.2f}   '
              f'max |strain| {max(abs(s["e1"]).max(), abs(s["e2"]).max())*100:6.3f}%')
    mid = np.mean([s['net'] for s in r['skins']])
    for label, val in expect.items():
        got = mid if label.startswith('mid') else None
        if got is not None:
            print(f'   {label:34s} expected {val:10.2f}   got {got:10.2f}   error {(got-val)/val*100:+.3f}%')

# ── 1. L-bracket with a hole: developable, answer known exactly ───────────────
A, B, r, t, w = 60.0, 40.0, 2.0, 2.0, 50.0
R = r + t
ann = cut(cyl(0, 0, 0, (0, 1, 0), R, w), cyl(0, 0, 0, (0, 1, 0), r, w))
bend = common(ann, box(0, 0, -R, R, w, R))
part = fuse(fuse(box(-A, 0, -R, A, w, t), bend), box(r, 0, 0, t, w, B))
part = cut(part, cyl(-30, 25, -10, (0, 0, 1), 5, 20))          # Ø10 hole in the flat leg
t0 = time.time(); res = develop(part, 0.2); dt = time.time() - t0
hole = math.pi * 25
report('L-bracket 60+40 legs, r2, t2, w50, one Ø10 hole', res, {
    'mid-surface flat net (K=0.5)': w * (A + B + (r + t / 2) * math.pi / 2) - hole,
})
print(f'   inner skin exact {w*(A+B+r*math.pi/2)-hole:.2f}, outer skin exact {w*(A+B+R*math.pi/2)-hole:.2f}   solve {dt:.1f}s')
mr = min_rect(res['skins'][0]['U'][res['skins'][0]['outer']])
print(f'   developed rectangle {mr[1]:.2f} x {mr[2]:.2f} mm   (exact mid {A+B+(r+t/2)*math.pi/2:.2f} x {w:.2f})')
print(f'   bounding box of the FORMED part would give {1.05*max(A+R,B+R):.1f} x {1.05*w:.1f} — the tool today')

# ── 2. Drawn cup: NOT developable. Industry blank = area equivalence ──────────
Ro, H, t = 40.0, 50.0, 2.0
cup = cut(cyl(0, 0, 0, (0, 0, 1), Ro, H), cyl(0, 0, t, (0, 0, 1), Ro - t, H))
t0 = time.time(); res = develop(cup, 0.6); dt = time.time() - t0
d, h = 2 * Ro - t, H - t / 2
D_formula = math.sqrt(d * d + 4 * d * h)
print(f'\n== Drawn cup Ø{2*Ro} x {H}, t{t}   ({res["ntri"]} triangles, solve {dt:.1f}s)')
for k, s in enumerate(res['skins']):
    Dflat = math.sqrt(4 * s['gross'] / math.pi)
    Deq = math.sqrt(4 * s['skin_area_3d'] / math.pi)
    print(f'   skin {k}: geometric flatten Ø{Dflat:7.2f}   area-equivalent Ø{Deq:7.2f}   '
          f'major strain up to {s["e1"].max()*100:5.1f}%  minor down to {s["e2"].min()*100:6.1f}%')
print(f'   textbook blank D = sqrt(d² + 4dh) = Ø{D_formula:.2f}  (mid-surface, area equivalence)')

print('\n== the same cup, one-step inverse on plastic work (incompressible)')
for k, s in enumerate(res['skins']):
    i = s['inv']
    print(f'   skin {k}: inverse flatten Ø{math.sqrt(4*i["gross"]/math.pi):7.2f}   '
          f'major {i["e1"].max()*100:5.1f}%  minor {i["e2"].min()*100:6.1f}%   '
          f'thinning max {(1-np.exp(-(i["e1"]+i["e2"])).min())*100:5.1f}%   flips {i["flips"]}')
print(f'   textbook (mid-surface) Ø{D_formula:.2f}; outer-skin area-equivalent Ø{math.sqrt(4*res["skins"][0]["skin_area_3d"]/math.pi):.2f}')
