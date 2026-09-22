"""
Research prototype: develop the flat blank of a formed sheet part from its STEP.

Pipeline (mirrors FASTBLANK's wizard, one step each):
  1 import           STEP -> OCCT solid
  2 skin selection   classify B-rep faces: skin (opposite face ~t away) vs edge faces
  3 mesh             BRepMesh -> welded triangle mesh of each skin
  4 hole filling     cap inner loops so the skin is a disk (FASTBLANK "Fill Holes")
  5 solve            Tutte embedding -> ARAP local/global energy minimisation
  6 strains          per-triangle principal stretches -> major/minor/thickness strain
  7 report           gross/net flat area, outline, cut length, strip rectangle
"""
import sys, json, math
import numpy as np
from scipy.sparse import coo_matrix, csr_matrix
from scipy.sparse.linalg import spsolve, factorized

from OCP.STEPControl import STEPControl_Reader
from OCP.BRepMesh import BRepMesh_IncrementalMesh
from OCP.TopExp import TopExp_Explorer
from OCP.TopAbs import TopAbs_FACE, TopAbs_REVERSED
from OCP.TopoDS import TopoDS
from OCP.BRep import BRep_Tool
from OCP.TopLoc import TopLoc_Location
from OCP.GProp import GProp_GProps
from OCP.BRepGProp import BRepGProp
from OCP.IntCurvesFace import IntCurvesFace_ShapeIntersector
from OCP.gp import gp_Pnt, gp_Dir, gp_Lin
from OCP.Bnd import Bnd_Box
from OCP.BRepBndLib import BRepBndLib


def load_step(path):
    r = STEPControl_Reader()
    assert r.ReadFile(path) == 1, 'read failed'
    r.TransferRoots()
    return r.OneShape()


def props(shape):
    v = GProp_GProps(); BRepGProp.VolumeProperties_s(shape, v)
    s = GProp_GProps(); BRepGProp.SurfaceProperties_s(shape, s)
    b = Bnd_Box(); BRepBndLib.Add_s(shape, b)
    x0, y0, z0, x1, y1, z1 = b.Get()
    return v.Mass(), s.Mass(), (x1 - x0, y1 - y0, z1 - z0)


def mesh(shape, lin, ang=0.25):
    BRepMesh_IncrementalMesh(shape, lin, False, ang, True)
    key, verts, tris, tface = {}, [], [], []
    faces = []
    exp = TopExp_Explorer(shape, TopAbs_FACE)
    fid = 0
    while exp.More():
        f = TopoDS.Face_s(exp.Current()); exp.Next()
        loc = TopLoc_Location()
        tri = BRep_Tool.Triangulation_s(f, loc)
        if tri is None:
            continue
        trsf = loc.Transformation()
        ids = []
        for i in range(1, tri.NbNodes() + 1):
            p = tri.Node(i).Transformed(trsf)
            k = (round(p.X(), 5), round(p.Y(), 5), round(p.Z(), 5))
            if k not in key:
                key[k] = len(verts); verts.append((p.X(), p.Y(), p.Z()))
            ids.append(key[k])
        rev = f.Orientation() == TopAbs_REVERSED
        for j in range(1, tri.NbTriangles() + 1):
            a, b, c = tri.Triangle(j).Get()
            a, b, c = ids[a - 1], ids[b - 1], ids[c - 1]
            if len({a, b, c}) < 3:
                continue
            tris.append((a, c, b) if rev else (a, b, c)); tface.append(fid)
        faces.append(f); fid += 1
    return np.array(verts), np.array(tris), np.array(tface), faces


def tri_geom(V, T):
    a, b, c = V[T[:, 0]], V[T[:, 1]], V[T[:, 2]]
    n = np.cross(b - a, c - a)
    area = 0.5 * np.linalg.norm(n, axis=1)
    nn = n / np.maximum(1e-12, 2 * area)[:, None]
    return area, nn, (a + b + c) / 3


def classify_faces(shape, V, T, tface, nfaces, t_guess):
    """Skin face = the inward ray exits through the opposite skin about t away."""
    area, nn, cen = tri_geom(V, T)
    isec = IntCurvesFace_ShapeIntersector(); isec.Load(shape, 1e-6)
    hit = np.full(nfaces, np.inf)
    for f in range(nfaces):
        idx = np.where(tface == f)[0]
        if not len(idx):
            continue
        i = idx[np.argmax(area[idx])]
        # A chord triangle's centroid sits OFF a curved face — inside the hollow
        # of a concave one. So start half a gauge outside, cast inward, and take
        # the distance between the first two crossings: this face, then the
        # opposite skin. An edge face has no second crossing within reach.
        p, d = cen[i], -nn[i]
        o = p - d * 0.5 * t_guess
        isec.Perform(gp_Lin(gp_Pnt(*o), gp_Dir(*d)), 0.0, 1e6)
        ws = sorted(isec.WParameter(k) for k in range(1, isec.NbPnt() + 1))
        ws = [w for w in ws if w > 1e-6]
        if len(ws) >= 2:
            hit[f] = ws[1] - ws[0]
    small = hit[np.isfinite(hit) & (hit < 3 * t_guess)]
    t = float(np.median(small)) if len(small) else t_guess
    skin = (hit > 0.6 * t) & (hit < 1.6 * t)
    return skin, t


def components(T):
    """Connected components of a triangle set, joined across shared edges."""
    from collections import defaultdict
    edge = defaultdict(list)
    for i, (a, b, c) in enumerate(T):
        for u, v in ((a, b), (b, c), (c, a)):
            edge[(min(u, v), max(u, v))].append(i)
    parent = list(range(len(T)))
    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]; x = parent[x]
        return x
    for tl in edge.values():
        for k in tl[1:]:
            ra, rb = find(tl[0]), find(k)
            if ra != rb: parent[ra] = rb
    roots = np.array([find(i) for i in range(len(T))])
    return roots


def boundary_loops(T):
    from collections import defaultdict
    cnt = defaultdict(int); dir_ = {}
    for a, b, c in T:
        for u, v in ((a, b), (b, c), (c, a)):
            k = (min(u, v), max(u, v)); cnt[k] += 1; dir_[k] = (u, v)
    nxt = {}
    for k, n in cnt.items():
        if n == 1:
            u, v = dir_[k]; nxt[u] = v
    loops, seen = [], set()
    for s in list(nxt):
        if s in seen: continue
        loop, x = [], s
        while x not in seen and x in nxt:
            seen.add(x); loop.append(x); x = nxt[x]
        if len(loop) > 2: loops.append(loop)
    return loops


def refine(V, T, hmax, max_pass=40):
    """
    Longest-edge bisection until no edge exceeds hmax.

    OCCT meshes for display, not for mechanics: a cylinder wall comes out as tall
    slivers spanning the full height with no nodes along it, so a solver cannot
    let strain vary up the wall. Splitting the longest edge keeps the mesh
    conforming (both neighbours of an edge are split together) and only refines
    where the mesh is actually coarse.
    """
    V = [np.asarray(v, float) for v in V]; T = [tuple(t) for t in T]
    for _ in range(max_pass):
        emap = {}
        for i, (a, b, c) in enumerate(T):
            for u, v in ((a, b), (b, c), (c, a)):
                emap.setdefault((min(u, v), max(u, v)), []).append(i)
        L = {e: float(np.linalg.norm(V[e[0]] - V[e[1]])) for e in emap}
        cand = set()
        for (a, b, c) in T:
            es = [(min(a, b), max(a, b)), (min(b, c), max(b, c)), (min(c, a), max(c, a))]
            e = max(es, key=L.get)
            if L[e] > hmax: cand.add(e)
        if not cand: break
        locked, dead, newT = set(), set(), []
        for e in sorted(cand, key=L.get, reverse=True):
            tris = emap[e]
            if any(ti in locked for ti in tris): continue
            m = len(V); V.append(0.5 * (V[e[0]] + V[e[1]]))
            for ti in tris:
                locked.add(ti); dead.add(ti)
                a, b, c = T[ti]
                for p_, q_, r_ in ((a, b, c), (b, c, a), (c, a, b)):
                    if {p_, q_} == set(e):
                        newT += [(p_, m, r_), (m, q_, r_)]; break
        T = [t for i, t in enumerate(T) if i not in dead] + newT
    return np.array(V), np.array(T)


def compact(V, T):
    used = np.unique(T); m = -np.ones(len(V), int); m[used] = np.arange(len(used))
    return V[used], m[T]


def flatten(V, T, iters=80):
    """Tutte embedding (fold-free start) then ARAP local/global (Liu et al. 2008)."""
    loops = boundary_loops(T)
    L3 = lambda lp: sum(np.linalg.norm(V[lp[i]] - V[lp[i - 1]]) for i in range(len(lp)))
    loops.sort(key=L3, reverse=True)
    outer, holes = loops[0], loops[1:]
    # Hole filling: a fan to the loop centroid, so the skin becomes a disk.
    Vx, Tx = list(map(tuple, V)), [tuple(t) for t in T]
    nreal = len(T)
    for h in holes:
        c = len(Vx); Vx.append(tuple(np.mean(V[h], axis=0)))
        for i in range(len(h)):
            Tx.append((h[i - 1], h[i], c)) if False else Tx.append((h[i], h[i - 1], c))
    V2, T2 = np.array(Vx), np.array(Tx)
    n = len(V2)
    # Tutte: boundary on a circle by arc length, interior = average of neighbours.
    seg = np.array([np.linalg.norm(V2[outer[i]] - V2[outer[i - 1]]) for i in range(len(outer))])
    s = np.cumsum(seg); s = s / s[-1] * 2 * math.pi
    R = seg.sum() / (2 * math.pi)
    U = np.zeros((n, 2)); isb = np.zeros(n, bool); isb[outer] = True
    U[outer] = np.c_[R * np.cos(s), R * np.sin(s)]
    rows, cols = [], []
    for a, b, c in T2:
        for u, v in ((a, b), (b, c), (c, a)):
            rows += [u, v]; cols += [v, u]
    A = csr_matrix((np.ones(len(rows)), (rows, cols)), shape=(n, n)); A.data[:] = 1
    deg = np.asarray(A.sum(1)).ravel()
    Lu = (csr_matrix((deg, (range(n), range(n))), shape=(n, n)) - A).tocsr()
    I = np.where(~isb)[0]; B = np.where(isb)[0]
    if len(I):
        rhs = -Lu[I][:, B] @ U[B]
        solve = factorized(Lu[I][:, I].tocsc())
        U[I, 0] = solve(rhs[:, 0]); U[I, 1] = solve(rhs[:, 1])
    # ARAP.
    P = V2[T2]                                            # (m,3,3)
    e1 = P[:, 1] - P[:, 0]; e2 = P[:, 2] - P[:, 0]
    l1 = np.linalg.norm(e1, axis=1); ex = e1 / l1[:, None]
    nrm = np.cross(e1, e2); nrm /= np.linalg.norm(nrm, axis=1)[:, None]
    ey = np.cross(nrm, ex)
    X = np.zeros((len(T2), 3, 2))                         # local isometric 2D coords
    X[:, 1, 0] = l1
    X[:, 2, 0] = np.einsum('ij,ij->i', e2, ex); X[:, 2, 1] = np.einsum('ij,ij->i', e2, ey)
    def cot(a, b, c):                                     # cot of angle at a
        u, v = b - a, c - a
        return np.einsum('ij,ij->i', u, v) / np.maximum(1e-12, np.abs(u[:, 0] * v[:, 1] - u[:, 1] * v[:, 0]))
    C = np.stack([cot(X[:, 0], X[:, 1], X[:, 2]),   # opposite edge (1,2)
                  cot(X[:, 1], X[:, 2], X[:, 0]),   # opposite edge (2,0)
                  cot(X[:, 2], X[:, 0], X[:, 1])], 1) # opposite edge (0,1)
    C = np.clip(C, 1e-4, 1e4)
    EDG = [(1, 2, 0), (2, 0, 1), (0, 1, 2)]
    rows, cols, vals = [], [], []
    for (i, j, k) in EDG:
        w = C[:, k] if False else C[:, [0, 1, 2].index(k)]
    rows, cols, vals = [], [], []
    for idx, (i, j) in enumerate([(1, 2), (2, 0), (0, 1)]):
        w = C[:, idx]; vi, vj = T2[:, i], T2[:, j]
        rows += [vi, vj, vi, vj]; cols += [vi, vj, vj, vi]; vals += [w, w, -w, -w]
    Lc = coo_matrix((np.concatenate(vals), (np.concatenate(rows), np.concatenate(cols))), shape=(n, n)).tocsr()
    keep = np.arange(1, n)                                # pin vertex 0 (translation)
    solveL = factorized(Lc[keep][:, keep].tocsc())
    for _ in range(iters):
        Ut = U[T2]
        S = np.zeros((len(T2), 2, 2))
        for idx, (i, j) in enumerate([(1, 2), (2, 0), (0, 1)]):
            du = Ut[:, i] - Ut[:, j]; dx = X[:, i] - X[:, j]
            S += C[:, idx, None, None] * np.einsum('ni,nj->nij', du, dx)
        Uu, _, Vt = np.linalg.svd(S)
        Rt = Uu @ Vt
        bad = np.linalg.det(Rt) < 0
        if bad.any():
            Uu[bad, :, 1] *= -1; Rt[bad] = Uu[bad] @ Vt[bad]
        b = np.zeros((n, 2))
        for idx, (i, j) in enumerate([(1, 2), (2, 0), (0, 1)]):
            dx = X[:, i] - X[:, j]
            r = C[:, idx, None] * np.einsum('nij,nj->ni', Rt, dx)
            np.add.at(b, T2[:, i], r); np.add.at(b, T2[:, j], -r)
        rhs = b[keep] - Lc[keep][:, [0]] @ U[[0]]
        U[keep, 0] = solveL(rhs[:, 0]); U[keep, 1] = solveL(rhs[:, 1])
    # Strains on the real (unfilled) triangles: F maps flat -> formed.
    Tr = T2[:nreal]
    Uf = U[Tr]; Xr = X[:nreal]
    Jf = np.stack([Uf[:, 1] - Uf[:, 0], Uf[:, 2] - Uf[:, 0]], 2)
    J3 = np.stack([Xr[:, 1] - Xr[:, 0], Xr[:, 2] - Xr[:, 0]], 2)
    F = J3 @ np.linalg.inv(Jf)
    sv = np.linalg.svd(F, compute_uv=False)
    e1, e2 = np.log(sv[:, 0]), np.log(sv[:, 1])
    af = 0.5 * np.abs(Jf[:, 0, 0] * Jf[:, 1, 1] - Jf[:, 0, 1] * Jf[:, 1, 0])
    a3 = 0.5 * np.abs(J3[:, 0, 0] * J3[:, 1, 1] - J3[:, 0, 1] * J3[:, 1, 0])
    outline = U[outer]
    per = float(np.sum(np.linalg.norm(outline - np.roll(outline, 1, 0), axis=1)))
    x, y = outline[:, 0], outline[:, 1]
    gross = 0.5 * abs(np.dot(x, np.roll(y, -1)) - np.dot(y, np.roll(x, -1)))
    hole_per = sum(float(np.sum(np.linalg.norm(U[h] - np.roll(U[h], 1, 0), axis=1))) for h in holes)
    return dict(U=U, T=Tr, outer=outer, holes=holes, e1=e1, e2=e2, a_flat=af, a_3d=a3,
                gross=gross, net=float(af.sum()), perimeter=per, hole_perimeter=hole_per,
                Tfull=T2, X=X, nreal=nreal)


def inverse(res, V3, T, n_iter=20000):
    """
    One-step inverse refinement: minimise plastic work instead of distortion.

    ARAP is geometry — it has no idea the metal is incompressible, so on a drawn
    part it trades radial stretch for circumferential compression as if volume
    were free. The one-step inverse approach (Guo & Batoz) takes the formed shape
    and finds the flat blank that minimises the plastic work of getting there,
    with thickness strain tied to the in-plane ones by incompressibility:
        e3 = -(e1 + e2),  equivalent strain (von Mises)
        eb = (2/sqrt3) * sqrt(e1^2 + e1 e2 + e2^2)
    Deformation theory, quadratic in Hencky strain (n = 1), no friction or
    binder force — the simplest form of the method, which is the point: it is
    enough to show whether physics moves the answer.
    """
    from scipy.optimize import minimize
    U0 = res['U']; Tf = res['Tfull']; X = res['X']
    m = len(Tf)
    J3 = np.stack([X[:, 1] - X[:, 0], X[:, 2] - X[:, 0]], 2)            # (m,2,2)
    A3 = 0.5 * np.abs(J3[:, 0, 0] * J3[:, 1, 1] - J3[:, 0, 1] * J3[:, 1, 0])
    Ut0 = U0[Tf]
    s0 = np.sign(np.median(np.linalg.det(np.stack([Ut0[:, 1] - Ut0[:, 0], Ut0[:, 2] - Ut0[:, 0]], 2))))
    def f(flat):
        U = flat.reshape(-1, 2); Ut = U[Tf]
        Jf = np.stack([Ut[:, 1] - Ut[:, 0], Ut[:, 2] - Ut[:, 0]], 2)
        Jinv = np.linalg.inv(Jf)
        F = J3 @ Jinv
        C = np.transpose(F, (0, 2, 1)) @ F
        mu, v = np.linalg.eigh(C)
        mu = np.maximum(mu, 1e-12)
        e = 0.5 * np.log(mu)                                           # Hencky principal strains
        e1, e2 = e[:, 0], e[:, 1]
        W = A3 * (4.0 / 3.0) * (e1 * e1 + e1 * e2 + e2 * e2)
        dW1 = A3 * (4.0 / 3.0) * (2 * e1 + e2); dW2 = A3 * (4.0 / 3.0) * (2 * e2 + e1)
        M = (dW1 / (2 * mu[:, 0]))[:, None, None] * np.einsum('ni,nj->nij', v[:, :, 0], v[:, :, 0]) \
          + (dW2 / (2 * mu[:, 1]))[:, None, None] * np.einsum('ni,nj->nij', v[:, :, 1], v[:, :, 1])
        dF = 2 * F @ M
        dJf = -np.transpose(F, (0, 2, 1)) @ dF @ np.transpose(Jinv, (0, 2, 1))
        # Barrier: an element may shrink, but not turn inside out. Metal cannot
        # fold through itself in the plane, and an inverted triangle would sign
        # its area wrong and quietly shrink the blank.
        detf = s0 * np.linalg.det(Jf); det3 = 2 * A3
        ratio = detf / det3
        viol = np.maximum(0.0, 0.25 - ratio)
        kap = 50.0
        W = W + kap * A3 * viol ** 2
        cof = np.stack([np.stack([Jf[:, 1, 1], -Jf[:, 1, 0]], 1),
                        np.stack([-Jf[:, 0, 1], Jf[:, 0, 0]], 1)], 1)
        dJf = dJf + (-2 * kap * A3 * viol * s0 / det3)[:, None, None] * cof
        g = np.zeros_like(U)
        np.add.at(g, Tf[:, 1], dJf[:, :, 0]); np.add.at(g, Tf[:, 2], dJf[:, :, 1])
        np.add.at(g, Tf[:, 0], -dJf[:, :, 0] - dJf[:, :, 1])
        return W.sum(), g.ravel()
    # Start from the geometric answer scaled to conserve area — the drawn-part
    # assumption — rather than from ARAP as-is, which starts 20% short on area.
    Ut0 = U0[Tf]
    af0 = 0.5 * np.abs(np.linalg.det(np.stack([Ut0[:, 1] - Ut0[:, 0], Ut0[:, 2] - Ut0[:, 0]], 2)))
    k = math.sqrt(A3.sum() / af0.sum())
    x0 = (U0 * k).ravel()
    r = minimize(f, x0, jac=True, method='L-BFGS-B',
                 options={'maxiter': n_iter, 'maxcor': 30, 'ftol': 1e-13, 'gtol': 1e-9})
    inverse.last = (r.nit, r.message if isinstance(r.message, str) else r.message.decode())
    return r.x.reshape(-1, 2)


def measure(U, T, X, outer, holes, nreal):
    Tr = T[:nreal]; Uf = U[Tr]; Xr = X[:nreal]
    Jf = np.stack([Uf[:, 1] - Uf[:, 0], Uf[:, 2] - Uf[:, 0]], 2)
    J3 = np.stack([Xr[:, 1] - Xr[:, 0], Xr[:, 2] - Xr[:, 0]], 2)
    F = J3 @ np.linalg.inv(Jf)
    sv = np.linalg.svd(F, compute_uv=False)
    e1, e2 = np.log(sv[:, 0]), np.log(sv[:, 1])
    af = 0.5 * np.abs(Jf[:, 0, 0] * Jf[:, 1, 1] - Jf[:, 0, 1] * Jf[:, 1, 0])
    o = U[outer]; x, y = o[:, 0], o[:, 1]
    gross = 0.5 * abs(np.dot(x, np.roll(y, -1)) - np.dot(y, np.roll(x, -1)))
    per = float(np.sum(np.linalg.norm(o - np.roll(o, 1, 0), axis=1)))
    hp = sum(float(np.sum(np.linalg.norm(U[h] - np.roll(U[h], 1, 0), axis=1))) for h in holes)
    flips = int((np.sign(np.linalg.det(Jf)) != np.sign(np.linalg.det(Jf)).max()).sum())
    return dict(e1=e1, e2=e2, gross=gross, net=float(af.sum()), perimeter=per, hole_perimeter=hp, flips=flips)


def min_rect(P):
    """Smallest rectangle over all orientations (1 degree steps)."""
    best = None
    for d in range(0, 180):
        a = math.radians(d); R = np.array([[math.cos(a), -math.sin(a)], [math.sin(a), math.cos(a)]])
        Q = P @ R; w, h = np.ptp(Q[:, 0]), np.ptp(Q[:, 1])
        if best is None or w * h < best[0]: best = (w * h, max(w, h), min(w, h), d)
    return best


def develop(shape, lin, physics=True, hmax=None):
    vol, sa, bbox = props(shape)
    t_guess = 2 * vol / sa
    V, T, tface, faces = mesh(shape, lin)
    skin, t = classify_faces(shape, V, T, tface, len(faces), t_guess)
    Ts = T[skin[tface]]
    roots = components(Ts)
    ids, cnt = np.unique(roots, return_counts=True)
    area, _, _ = tri_geom(V, Ts)
    comp_area = {r: area[roots == r].sum() for r in ids}
    big = sorted(comp_area, key=comp_area.get, reverse=True)[:2]
    out = []
    for r in big:
        Vc, Tc = compact(V, Ts[roots == r])
        if hmax:
            Vc, Tc = refine(Vc, Tc, hmax)
        res = flatten(Vc, Tc)
        res['skin_area_3d'] = float(comp_area[r])
        if physics:
            Ui = inverse(res, Vc, Tc)
            res['inv'] = measure(Ui, res['Tfull'], res['X'], res['outer'], res['holes'], res['nreal'])
            res['inv']['U'] = Ui
        out.append(res)
    return dict(volume=vol, surface=sa, bbox=bbox, t=t, skins=out,
                edge_faces=int((~skin).sum()), skin_faces=int(skin.sum()), ntri=len(T),
                nsolve=int(sum(len(o['Tfull']) for o in out)))


if __name__ == '__main__':
    path, lin = sys.argv[1], float(sys.argv[2]) if len(sys.argv) > 2 else 0.5
    r = develop(load_step(path), lin)
    print(json.dumps({k: v for k, v in r.items() if k != 'skins'}, default=float))
