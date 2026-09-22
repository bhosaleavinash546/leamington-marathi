import sys; sys.path.insert(0, '.')
import numpy as np, proto
shape = proto.load_step('../../cad-audit/parts/Seat_Locking_Bracket.stp')
vol, sa, bbox = proto.props(shape)
V, T, tface, faces = proto.mesh(shape, 0.3)
skin, t = proto.classify_faces(shape, V, T, tface, len(faces), 2 * vol / sa)
Ts = T[skin[tface]]; roots = proto.components(Ts)
area, _, _ = proto.tri_geom(V, Ts)
out = []
for r in np.unique(roots):
    Vc, Tc = proto.compact(V, Ts[roots == r]); Vc, Tc = proto.refine(Vc, Tc, 6.0)
    res = proto.flatten(Vc, Tc)
    e = np.maximum(abs(res['e1']), abs(res['e2'])); a3 = res['a_3d']
    bad = e > 0.05
    q = np.percentile(e, [50, 90, 99, 99.9]) * 100
    mr = proto.min_rect(res['U'][res['outer']])
    print(f'skin: 3D {area[roots==r].sum()/100:.1f} cm²  flat net {res["net"]/100:.1f}  gross {res["gross"]/100:.1f}  '
          f'rect {mr[1]:.0f} x {mr[2]:.0f} ({mr[1]*mr[2]/100:.0f} cm²)  cut {res["perimeter"]:.0f} + pierce {res["hole_perimeter"]:.0f} mm')
    print(f'      strain pctl 50/90/99/99.9 = {q.round(3)} %   area with >5% strain: {a3[bad].sum()/a3.sum()*100:.3f}% '
          f'({bad.sum()} of {len(e)} tri, min 3D area of those {a3[bad].min() if bad.any() else 0:.4f} mm²)', flush=True)
    np.savez(f'skin{r}.npz', U=res['U'], T=res['T'], outer=np.array(res['outer']), e=e)
print('bbox blank (tool today)', round(bbox[0]*1.05*bbox[1]*1.05/100), 'cm²   V/t', round(vol/t/100, 1), 'cm²')
