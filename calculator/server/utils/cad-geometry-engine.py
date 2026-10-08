#!/usr/bin/env python3
"""
CostVision CAD Geometry Engine — Open CASCADE (OCCT) via CadQuery
Extracts precise geometric properties from STEP / IGES files.
Output: single-line JSON to stdout.
"""
import sys, json, os, math, signal, random

# Best-effort self-timeout. NOTE: Python signal handlers only run between
# bytecode instructions, so this CANNOT interrupt a single long native OCCT call
# (e.g. a pathological BRepMesh_IncrementalMesh). The authoritative timeout is
# the Node parent's kill in geometry-bridge.ts; we self-abort ~10 s earlier so a
# clean structured error beats the kill. Derived from the shared
# CV_TESS_TIMEOUT_MS (default 300 s) so all layers move together.
#
# SIGALRM is POSIX-only — it does not exist on Windows, and referencing it there
# raises AttributeError at import, before a single line of geometry runs. That
# made this whole engine unimportable on a Windows install. Losing the alarm
# there costs the nicer error message, not the safety: the parent's kill is what
# actually bounds the work, and `child.kill()` terminates the process on Windows
# too (Node ignores the signal name and calls TerminateProcess).
_HAS_ALARM = hasattr(signal, "SIGALRM")


def _set_alarm(seconds):
    """Arm the self-timeout, or cancel it with 0. A no-op where SIGALRM is not."""
    if _HAS_ALARM:
        signal.alarm(seconds)


class GeometryTimeout(BaseException):
    """The self-timeout. A BaseException on purpose: every analysis step guards itself with
    `except Exception` and carries on, so a TimeoutError raised mid-step was swallowed and the part came
    back as a "success" with that step (wall, topology, draft …) silently missing (360 review, Oct 2026).
    This passes every step and reaches the job's own handler, which reports code 'timeout'."""


def _timeout(_s, _f): raise GeometryTimeout("Geometry analysis timed out")


if _HAS_ALARM:
    signal.signal(signal.SIGALRM, _timeout)
_set_alarm(max(30, int(os.environ.get("CV_TESS_TIMEOUT_MS", "300000")) // 1000 - 10))


# ─── Surface / edge type classification ──────────────────────────────────────

_CYL_CACHE = {}


def _cylinder_features(wrapped, face_map, diag):
    """Cached `_cylinder_features_uncached`: the costing's feature table and the DFM extraction both read the
    cylinders of the SAME shape (same face map, same diagonal) in one run — computing them once halves the
    ray / classifier work on a large part. One entry, keyed by the shape object and the diagonal; callers get a
    deep copy, so neither can change what the other reads."""
    import copy
    key = (id(wrapped), round(diag, 6), face_map.Extent())
    hit = _CYL_CACHE.get("entry")
    if hit is not None and hit[0] == key and hit[1] is wrapped:
        return copy.deepcopy(hit[2])
    out = _cylinder_features_uncached(wrapped, face_map, diag)
    _CYL_CACHE["entry"] = (key, wrapped, out)
    return copy.deepcopy(out)


def _cylinder_features_uncached(wrapped, face_map, diag):
    """Physical cylindrical features — ONE recognition for the costing feature table and geometric DFM.

    Identity: the axis LINE (its foot point nearest the origin + a sign-normalised direction), the radius and
    the concavity. Faces on one line whose axial ranges overlap are one feature: split halves of a drilled hole
    re-join even when they end at different heights (a hole exiting a sloped face; Parasolid / SolidWorks export
    a bore as two 180° faces). Keying on the raw axis location and v-range lost such holes and read them as two
    R4 "corners".

    Full (a hole / a boss) = angular coverage ≥ 0.83 of a turn (the faces' summed sweep) — pocket corners (~90°),
    slot ends (~180°) and blends are partial cylinders. Concave = material outside (face orientation against
    the cylinder's parametrisation).

    Open ends are found with a RAY along the axis from just inside each end out to the part's extent: any
    material on it — a drill-point cone, a pocket floor, a wall — closes that end. One point 0.5 mm past the end
    (the old probe) landed in air beyond a 118° drill point and called every pointed blind hole "through", and
    called floor fillets open at both ends.
    """
    from OCP.TopoDS import TopoDS
    from OCP.TopAbs import TopAbs_Orientation
    from OCP.BRepAdaptor import BRepAdaptor_Surface
    from OCP.GeomAbs import GeomAbs_SurfaceType
    from OCP.BRepGProp import BRepGProp
    from OCP.GProp import GProp_GProps
    from OCP.IntCurvesFace import IntCurvesFace_ShapeIntersector
    from OCP.gp import gp_Lin, gp_Dir, gp_Pnt

    faces = []
    props = GProp_GProps()
    for idx in range(1, face_map.Extent() + 1):
        try:
            face = TopoDS.Face_s(face_map.FindKey(idx))
            ad = BRepAdaptor_Surface(face)
            if ad.GetType() != GeomAbs_SurfaceType.GeomAbs_Cylinder:
                continue
            cyl = ad.Cylinder()
            r = cyl.Radius()
            v0, v1 = sorted((ad.FirstVParameter(), ad.LastVParameter()))
            if r <= 1e-6 or not math.isfinite(v1 - v0) or v1 - v0 <= 0.01:
                continue
            ax = cyl.Axis(); dd = ax.Direction(); pl = ax.Location()
            d = [dd.X(), dd.Y(), dd.Z()]
            sgn = 1.0
            for c in d:
                if abs(c) > 1e-6:
                    sgn = 1.0 if c > 0 else -1.0
                    break
            dc = [c * sgn for c in d]
            loc = [pl.X(), pl.Y(), pl.Z()]
            t0 = loc[0] * dc[0] + loc[1] * dc[1] + loc[2] * dc[2]
            foot = [loc[k] - t0 * dc[k] for k in range(3)]
            s_a, s_b = sorted((t0 + v0 * sgn, t0 + v1 * sgn))
            BRepGProp.SurfaceProperties_s(face, props)
            concave = (face.Orientation() == TopAbs_Orientation.TopAbs_REVERSED) != (not cyl.Position().Direct())
            arc = abs(ad.LastUParameter() - ad.FirstUParameter())   # the angle this face sweeps, radians
            faces.append({"id": idx, "r": r, "dc": dc, "foot": foot, "s": (s_a, s_b), "arc": arc,
                          "area": abs(props.Mass()), "concave": bool(concave)})
        except Exception:
            continue

    by_line = {}
    for f in faces:
        key = (round(f["foot"][0], 2), round(f["foot"][1], 2), round(f["foot"][2], 2),
               round(f["dc"][0], 3), round(f["dc"][1], 3), round(f["dc"][2], 3), round(f["r"], 3), f["concave"])
        by_line.setdefault(key, []).append(f)

    inter = None
    try:
        inter = IntCurvesFace_ShapeIntersector()
        inter.Load(wrapped, 1e-4)
    except Exception:
        inter = None

    def _open(pt, direction, r):
        """Is the axis clear from pt outward to the part's extent? None if the probe could not run."""
        if inter is None:
            return None
        try:
            back = min(0.05, r * 0.05)
            start = gp_Pnt(pt[0] - direction[0] * back, pt[1] - direction[1] * back, pt[2] - direction[2] * back)
            inter.PerformNearest(gp_Lin(start, gp_Dir(*direction)), 0.0, diag * 1.05 + back)
            return not (inter.IsDone() and inter.NbPnt() > 0)
        except Exception:
            return None

    from OCP.BRepClass3d import BRepClass3d_SolidClassifier
    from OCP.TopAbs import TopAbs_State

    # ONE classifier, re-pointed per sample: constructing it per point rebuilt the solid explorer over every face
    # each time — on the 3,444-face fuel tank that alone ran past the 290 s budget.
    try:
        clf = BRepClass3d_SolidClassifier(wrapped)
    except Exception:
        clf = None

    def _air(pt):
        if clf is None:
            return None
        try:
            clf.Perform(gp_Pnt(*pt), 1e-6)
            return clf.State() == TopAbs_State.TopAbs_OUT
        except Exception:
            return None

    out = []
    for line_no, ((fx, fy, fz, dx, dy, dz, rr, concave), fs) in enumerate(by_line.items()):
        fs.sort(key=lambda f: f["s"][0])
        clusters = []
        for f in fs:
            if clusters and f["s"][0] <= clusters[-1]["s1"] + 0.05:
                c = clusters[-1]
                c["faces"].append(f)
                c["s1"] = max(c["s1"], f["s"][1])
            else:
                clusters.append({"faces": [f], "s0": f["s"][0], "s1": f["s"][1]})
        for c in clusters:
            r = c["faces"][0]["r"]
            dc = c["faces"][0]["dc"]
            foot = c["faces"][0]["foot"]
            span = c["s1"] - c["s0"]
            area = sum(f["area"] for f in c["faces"])
            # Angular coverage from each face's own sweep, NOT from area: a bore with a window or a cross-hole
            # through its wall keeps its 360° but loses area (an area test dropped the knuckle's Ø75 bore and
            # Part1's Ø22 / Ø50). Faces stacked along the axis each sweep a full turn, so the sum is capped at
            # one turn per the cluster's angular layers: split halves add to 360°, interrupted segments ≥ 360°.
            coverage = min(sum(f["arc"] for f in c["faces"]) / (2 * math.pi), 2.0)
            p0 = [foot[k] + dc[k] * c["s0"] for k in range(3)]
            p1 = [foot[k] + dc[k] * c["s1"] for k in range(3)]
            # ACCESS (a tool can come in along the axis from outside): the ray to the part's extent.
            ends = [_open(p0, [-dc[0], -dc[1], -dc[2]], r), _open(p1, dc, r)]
            # BREAKOUT (through / blind): air just past the end, beyond a 118° drill point (0.6R deep). A hole that
            # breaks into a pocket is through even though its far wall blocks the ray; a pointed blind hole is not.
            # Sampled from 0.5 mm past the end to past a possible drill point: blind if ANY sample is material
            # (a thin flat bottom fails the first sample, a drill point the last); one far point read a thin can
            # bottom as "through".
            # Only a full cylinder (a hole or a boss) is ever read for breakout — a partial one is a corner / blend.
            reach = 0.6 * r + 0.5
            samples = [0.5 + (reach - 0.5) * i / 6 for i in range(7)]
            def _breaks_out(pt, dirv):
                for t in samples:               # the first sample in material settles it: blind
                    a = _air([pt[k] + dirv[k] * t for k in range(3)])
                    if a is None:
                        return None
                    if not a:
                        return False
                return True
            full = coverage >= 0.83
            brk = ([_breaks_out(p0, [-dc[0], -dc[1], -dc[2]]), _breaks_out(p1, dc)] if full and concave
                   else [None, None])
            out.append({"line": line_no, "s0": c["s0"], "s1": c["s1"], "breakout": brk,
                "faceIds": sorted(f["id"] for f in c["faces"]), "concave": concave, "r": r, "dia": r * 2,
                "axis": dc, "span": span, "area": area, "coverage": coverage, "full": full,
                "mid": [(p0[k] + p1[k]) / 2 for k in range(3)], "ends": ends,
                "openDirs": [[round(-c2, 5) for c2 in dc]] * (1 if ends[0] else 0) + [[round(c2, 5) for c2 in dc]] * (1 if ends[1] else 0),
            })
    return out


def _extract_feature_table(wrapped, extents):
    """Exact hole/boss feature table from B-rep cylindrical faces, for the costing.

    Built on `_cylinder_features` — the same physical features the DFM sees: full cylinders only (a pocket
    corner, slot end or blend is not a drilled hole or a turned shaft), depth = the axial span, through = both
    ends clear along the axis (a ray to the part's extent). Rows are grouped by (kind, diameter, depth,
    through) with counts.
    """
    from OCP.TopTools import TopTools_IndexedMapOfShape
    from OCP.TopExp import TopExp
    from OCP.TopAbs import TopAbs_FACE
    face_map = TopTools_IndexedMapOfShape()
    TopExp.MapShapes_s(wrapped, TopAbs_FACE, face_map)
    diag = math.sqrt(sum(e * e for e in extents)) or 1.0
    feats_all = [f for f in _cylinder_features(wrapped, face_map, diag) if f["full"]]
    # One drill pass through collinear walls is ONE hole: segments on the same axis line with air between them
    # (a cross hole through both walls of a hollow section) join, their cutting lengths added. The old identity
    # joined them only when their depths happened to match, and then counted one wall's depth.
    from OCP.BRepClass3d import BRepClass3d_SolidClassifier
    from OCP.TopAbs import TopAbs_State
    from OCP.gp import gp_Pnt as _GP
    merged = []
    by_line = {}
    for f in feats_all:
        by_line.setdefault(f["line"], []).append(f)
    for segs in by_line.values():
        segs.sort(key=lambda f: f["s0"])
        cur = None
        for f in segs:
            if cur is not None and f["concave"] and cur["concave"]:
                gap_mid = [cur["mid"][k] + f["axis"][k] * ((cur["s1"] + f["s0"]) / 2 - (cur["s0"] + cur["s1"]) / 2) for k in range(3)]
                try:
                    air = BRepClass3d_SolidClassifier(wrapped, _GP(*gap_mid), 1e-6).State() == TopAbs_State.TopAbs_OUT
                except Exception:
                    air = False
                if air:
                    cur = dict(cur, span=cur["span"] + f["span"], s1=f["s1"], faceIds=cur["faceIds"] + f["faceIds"],
                               breakout=[cur["breakout"][0], f["breakout"][1]], ends=[cur["ends"][0], f["ends"][1]])
                    merged[-1] = cur
                    continue
            cur = f
            merged.append(cur)
    instances = {}
    for f in merged:
        kind = 'hole' if f["concave"] else 'boss'
        dia, depth = round(f["dia"], 2), round(f["span"], 1)
        if kind == 'hole' and None not in f["breakout"]:
            through = bool(f["breakout"][0] and f["breakout"][1])
        else:
            # fallback when the probe could not run: spans the part along its axis
            d = f["axis"]
            axis_extent = abs(d[0]) * extents[0] + abs(d[1]) * extents[1] + abs(d[2]) * extents[2]
            through = axis_extent > 0 and f["span"] >= axis_extent - max(0.1, axis_extent * 0.02)
        key = (kind, dia, depth, bool(through))
        inst = instances.get(key)
        if inst is None:
            instances[key] = {"count": 1, "faceIds": list(f["faceIds"])}
        else:
            inst["count"] += 1
            inst["faceIds"].extend(f["faceIds"])

    rows = []
    for (kind, dia, depth, through), inst in instances.items():
        rows.append({
            "kind": kind,
            "diaMm": dia,
            "depthMm": depth,
            "through": through if kind == "hole" else None,
            "count": inst["count"],
            "faceIds": sorted(inst["faceIds"]),
        })
    rows.sort(key=lambda r: (r["kind"], r["diaMm"], r["depthMm"]))
    return rows


def _extract_machining_features(wrapped, bbox):
    """Phase 2 — compound machining features from PLANAR faces.

    Emits two extra featureTable kinds beyond hole/boss:
      • face   — a machined planar face (datum/mating surface). Grouped by area;
                 costed as face-milling (area ÷ feed). Default OFF (whether a
                 planar face is actually machined is an engineering call).
      • pocket — a planar floor recessed from the bounding box (its outward
                 normal points to an open side but it sits inside). Floor area +
                 depth → pocket milling. Conservative + default OFF.

    bbox = (xmin, ymin, zmin, xmax, ymax, zmax). Approximate by design — surfaces
    candidates for the engineer to confirm, never silently inflates cost.
    """
    from OCP.TopExp import TopExp_Explorer
    from OCP.TopAbs import TopAbs_FACE, TopAbs_Orientation
    from OCP.TopoDS import TopoDS
    from OCP.BRepAdaptor import BRepAdaptor_Surface
    from OCP.GeomAbs import GeomAbs_SurfaceType
    from OCP.BRepGProp import BRepGProp
    from OCP.GProp import GProp_GProps

    xmin, ymin, zmin, xmax, ymax, zmax = bbox
    ext_min = (xmin, ymin, zmin)
    ext_max = (xmax, ymax, zmax)
    diag = math.sqrt((xmax - xmin) ** 2 + (ymax - ymin) ** 2 + (zmax - zmin) ** 2)
    tol = max(0.5, diag * 0.01)          # recess must exceed this to count
    min_face_area = 400.0                # mm² — only meaningful datum/mating faces
    min_pocket_area = 80.0
    axis_ext = (xmax - xmin, ymax - ymin, zmax - zmin)

    faces_area = {}                       # rounded area -> count (facing candidates)
    faces_ids = {}                        # rounded area -> [face ids]
    pockets = {}                          # (area, depth) -> count
    pocket_ids = {}                       # (area, depth) -> [face ids]
    props = GProp_GProps()
    from OCP.TopTools import TopTools_IndexedMapOfShape
    from OCP.TopExp import TopExp
    face_map = TopTools_IndexedMapOfShape()
    TopExp.MapShapes_s(wrapped, TopAbs_FACE, face_map)
    for map_idx in range(1, face_map.Extent() + 1):
        face = TopoDS.Face_s(face_map.FindKey(map_idx))
        try:
            ad = BRepAdaptor_Surface(face)
            if ad.GetType() != GeomAbs_SurfaceType.GeomAbs_Plane:
                continue
            BRepGProp.SurfaceProperties_s(face, props)
            area = abs(props.Mass())
            if area < min_face_area:
                continue
            c = props.CentreOfMass()
            centroid = (c.X(), c.Y(), c.Z())
            # outward normal (plane normal flipped by face orientation)
            n = ad.Plane().Axis().Direction()
            nx, ny, nz = n.X(), n.Y(), n.Z()
            if face.Orientation() == TopAbs_Orientation.TopAbs_REVERSED:
                nx, ny, nz = -nx, -ny, -nz
            comps = (abs(nx), abs(ny), abs(nz))
            axis = comps.index(max(comps))           # dominant axis 0/1/2
            if comps[axis] < 0.9:                     # not axis-aligned → skip pocket test
                is_pocket = False
                depth = 0.0
            else:
                sign = (nx, ny, nz)[axis]
                pos = centroid[axis]
                # outward normal points to +axis → floor of a pocket opening that way,
                # recessed if it sits below the +extreme by > tol
                if sign > 0:
                    depth = ext_max[axis] - pos
                else:
                    depth = pos - ext_min[axis]
                # Two discriminators replace the old blunt half-extent guard:
                #  1. A floor bounded ONLY by circular edges is a shaft SHOULDER
                #     (annular step face), not a milled pocket.
                #  2. A wall misread as a floor is thin relative to its recess —
                #     require the floor's smallest in-plane dimension >= depth.
                all_circular = True
                try:
                    from OCP.TopAbs import TopAbs_EDGE
                    from OCP.BRepAdaptor import BRepAdaptor_Curve
                    from OCP.GeomAbs import GeomAbs_CurveType
                    eexp = TopExp_Explorer(face, TopAbs_EDGE)
                    while eexp.More():
                        e = TopoDS.Edge_s(eexp.Current())
                        eexp.Next()
                        if BRepAdaptor_Curve(e).GetType() != GeomAbs_CurveType.GeomAbs_Circle:
                            all_circular = False
                            break
                except Exception:
                    all_circular = False
                min_in_plane = 0.0
                try:
                    from OCP.Bnd import Bnd_Box
                    from OCP.BRepBndLib import BRepBndLib
                    fb = Bnd_Box()
                    BRepBndLib.Add_s(face, fb)
                    fx0, fy0, fz0, fx1, fy1, fz1 = fb.Get()
                    dims = (fx1 - fx0, fy1 - fy0, fz1 - fz0)
                    in_plane = [dims[i] for i in range(3) if i != axis]
                    min_in_plane = min(in_plane) if in_plane else 0.0
                except Exception:
                    pass
                is_pocket = (tol < depth <= 0.85 * axis_ext[axis]) and area >= min_pocket_area \
                            and (not all_circular) and (min_in_plane >= depth)
            # facing candidate: any substantial planar face (datum/mating surface)
            faces_area[round(area, 0)] = faces_area.get(round(area, 0), 0) + 1
            faces_ids.setdefault(round(area, 0), []).append(map_idx)
            if is_pocket:
                key = (round(area, 0), round(depth, 1))
                pockets[key] = pockets.get(key, 0) + 1
                pocket_ids.setdefault(key, []).append(map_idx)
        except Exception:
            continue

    rows = []
    # facing: keep the largest few distinct faces (datum/mating candidates)
    for area, count in sorted(faces_area.items(), reverse=True)[:8]:
        rows.append({"kind": "face", "diaMm": 0.0, "depthMm": 0.0,
                     "through": None, "count": count, "areaMm2": area,
                     "faceIds": faces_ids.get(area, [])})
    for (area, depth), count in sorted(pockets.items(), reverse=True)[:8]:
        rows.append({"kind": "pocket", "diaMm": 0.0, "depthMm": depth,
                     "through": None, "count": count, "areaMm2": area,
                     "faceIds": pocket_ids.get((area, depth), [])})
    return rows


def _bulk_wall_mm(volume_mm3, surface_mm2):
    """The wall the part has in bulk, as 2·V/S.

    For a plate of thickness t the surface is dominated by its two faces, so
    V/S -> t/2 and this returns t. For anything solid it returns something of
    the order of the body, not of its thinnest sliver — which is the property
    the sheet-metal gate needs and neither the ray-cast minimum nor its mean
    provides. The minimum is set by the smallest fillet anywhere; the mean is
    set by rays that run ALONG a thin sheet rather than across it, which is why
    a 1.55 mm seat bracket ray-casts at 24.9 mm and needs the same 2·V/S
    correction `applyShellWallCorrection` already applies on the TypeScript
    side. Measured over the audit set the separation is not marginal: the parts
    that are sheet come out at 1.5-4.5 mm, the parts that are not at 8.6-15.1.
    """
    if not volume_mm3 or not surface_mm2 or surface_mm2 <= 0:
        return None
    return 2.0 * volume_mm3 / surface_mm2


def _detect_bends(wrapped, sheet_thickness):
    """Phase 3 — sheet-metal bend detection (forming feature).

    A press-brake bend is a cylindrical face spanning the part width with a
    small radius (≈ the material thickness). Inner + outer bend faces share an
    axis, so distinct axes = bend count. Uses the RAY-CAST sheet thickness (the
    bounding box of a bent part is not thin) to size the filters and to gate:
    only plate-like parts (thin, uniform wall) are treated as sheet metal.
    A bend cylinder is LONG along its axis (spans width) — that separates it
    from a drilled hole, whose cylinder is only as long as the sheet is thick.

    `sheet_thickness` must be the wall the part has IN BULK — see `_bulk_wall_mm`.
    It used to be the MINIMUM ray-cast wall, and a solid casting has a minimum
    somewhere (a fillet run-out, a web, the lip of a boss) that says nothing
    about the body: the steering knuckle measures a 1.36 mm minimum against a
    9.02 mm bulk wall. That read as thin sheet, its fillets read as 28 bends, and
    because this branch is decisive in `inferCommodity` nothing downstream got a
    vote — the knuckle was routed to laser cutting and costed at £5.43. Every
    real production part in the audit set went the same way. The synthetic
    fixtures never showed it: they are clean prismatic blocks with no fillets to
    misread, so they measure zero bends and the branch never fires.
    """
    from OCP.TopExp import TopExp_Explorer
    from OCP.TopAbs import TopAbs_FACE
    from OCP.TopoDS import TopoDS
    from OCP.BRepAdaptor import BRepAdaptor_Surface
    from OCP.GeomAbs import GeomAbs_SurfaceType

    t = sheet_thickness
    # Gate: needs a real, thin sheet thickness. Non-sheet parts return 0.
    if not t or t <= 0 or t > 8.0:
        return {"bendCount": 0, "totalBendLengthMm": 0.0, "thicknessMm": round(t or 0.0, 2),
                "thicknessSource": "bulk-wall"}

    max_bend_r = max(8.0, t * 6)          # bend radius ≈ 0.5–3× thickness (headroom to 6×)
    min_bend_len = max(10.0, t * 5)       # a bend spans real width; a hole is only ~t deep

    bends = {}                            # axis identity -> length
    axes = []                             # (dir, loc, radius) of every bend-qualified cylinder
    exp = TopExp_Explorer(wrapped, TopAbs_FACE)
    while exp.More():
        face = TopoDS.Face_s(exp.Current())
        exp.Next()
        try:
            ad = BRepAdaptor_Surface(face)
            if ad.GetType() != GeomAbs_SurfaceType.GeomAbs_Cylinder:
                continue
            cyl = ad.Cylinder()
            r = cyl.Radius()
            if r < 0.3 or r > max_bend_r:
                continue
            length = abs(ad.LastVParameter() - ad.FirstVParameter())
            if length < min_bend_len:               # long cylinder = bend; short = hole
                continue
            d = cyl.Axis().Direction()
            p = cyl.Axis().Location()
            # dedup inner/outer bend faces of the SAME bend by axis line
            ident = (round(d.X(), 2), round(d.Y(), 2), round(d.Z(), 2),
                     round(p.X() - d.X() * p.X(), 1), round(p.Y() - d.Y() * p.Y(), 1))
            if ident not in bends or length > bends[ident]:
                bends[ident] = length
            axes.append(((d.X(), d.Y(), d.Z()), (p.X(), p.Y(), p.Z()), r))
        except Exception:
            continue

    # Gauge from the bends themselves. The inner and outer face of one bend are
    # coaxial cylinders whose radii differ by exactly the sheet thickness, as
    # modelled — which is a better coil gauge than 2·V/S. The bulk wall counts
    # the edge band (cut length × t) as skin, so it reads LOW on a part with a
    # lot of cut edge: the seat bracket is 1.546 mm by 2·V/S against 1.60 mm
    # between its 23 bend pairs. That 3% matters because the analytic cut
    # length (S − 2V/t)/t collapses to zero by construction when t = 2·V/S.
    gauge, samples = _gauge_from_bend_pairs(axes)
    out = {
        "bendCount": len(bends),
        "totalBendLengthMm": round(sum(bends.values()), 1),
        "thicknessMm": round(gauge if gauge else t, 2),
        "thicknessSource": "bend-pairs" if gauge else "bulk-wall",
        "bulkWallMm": round(t, 2),
    }
    if gauge:
        out["gaugeSamples"] = samples
    return out


def _gauge_from_bend_pairs(axes, tol_mm=0.05):
    """Modal radius difference between coaxial bend cylinders, or (None, 0).

    Two cylinders are the two faces of one bend when their axes are parallel and
    collinear (within `tol_mm`) and their radii differ by a sheet-like amount.
    The mode of those differences, at 0.01 mm, is the gauge; a single pair is
    accepted only when it is the only bend, otherwise two must agree.
    """
    import math
    diffs = {}
    n = len(axes)
    for i in range(n):
        di, pi, ri = axes[i]
        for j in range(i + 1, n):
            dj, pj, rj = axes[j]
            dot = di[0] * dj[0] + di[1] * dj[1] + di[2] * dj[2]
            if abs(dot) < 0.999:
                continue
            v = (pi[0] - pj[0], pi[1] - pj[1], pi[2] - pj[2])
            along = v[0] * di[0] + v[1] * di[1] + v[2] * di[2]
            perp2 = v[0] * v[0] + v[1] * v[1] + v[2] * v[2] - along * along
            if perp2 > tol_mm * tol_mm:
                continue
            dr = abs(ri - rj)
            if dr < 0.3 or dr > 8.0:
                continue
            key = round(dr, 2)
            diffs[key] = diffs.get(key, 0) + 1
    if not diffs:
        return None, 0
    key, count = max(diffs.items(), key=lambda kv: (kv[1], -kv[0]))
    if count < 2 and n > 2:
        return None, 0
    return key, count


def _classify_faces(faces):
    """Return (type_counts dict, cyl_radii_ALL list — one entry per face)."""
    from OCP.BRep import BRep_Tool
    from OCP.GeomAdaptor import GeomAdaptor_Surface
    from OCP.GeomAbs import (
        GeomAbs_Plane, GeomAbs_Cylinder, GeomAbs_Cone,
        GeomAbs_Torus, GeomAbs_BSplineSurface, GeomAbs_BezierSurface,
        GeomAbs_SurfaceOfRevolution,
    )
    NAMES = {
        GeomAbs_Plane: "PLANE", GeomAbs_Cylinder: "CYLINDER",
        GeomAbs_Cone: "CONE", GeomAbs_Torus: "TORUS",
        GeomAbs_BSplineSurface: "BSPLINE", GeomAbs_BezierSurface: "BEZIER",
        GeomAbs_SurfaceOfRevolution: "REVOLUTION",
    }
    counts, cyl_radii = {}, []
    for face in faces:
        try:
            surf = BRep_Tool.Surface_s(face.wrapped)
            adaptor = GeomAdaptor_Surface(surf)
            t = adaptor.GetType()
            name = NAMES.get(t, "OTHER")
            counts[name] = counts.get(name, 0) + 1
            if t == GeomAbs_Cylinder:
                r = adaptor.Cylinder().Radius()
                if 0 < r < 1000:
                    cyl_radii.append(r)          # one entry per face (not deduped)
        except Exception:
            counts["OTHER"] = counts.get("OTHER", 0) + 1
    return counts, cyl_radii


def _profile_section(wrapped, bbox6, volume_mm3: float):
    """
    The cross-section of a long part, measured (aluminium-extrusion build, Oct 2026).

    Only for a part at least 4x longer than its next dimension. The solid is cut
    across its long axis at 25 / 50 / 75 % of its length; each cut is chained
    into closed loops (outer outlines and the holes inside them). From the mid
    cut: section area, outline length, number of enclosed voids, the minimum
    circle that encloses the section (the extrusion "circumscribing circle"),
    and the wall — rays from the outline inward across the section, the
    10th-percentile chord being the thinnest wall worth the name.

    The three cuts tell a constant section (extruded as is) from one that was
    extruded and then machined (pockets, cut-outs): the area varies along the
    part, and the volume falls short of section x length. Pure OCP + Python —
    no numpy — so the Windows package keeps working.

    Cuts a deep copy: a boolean section can widen the tolerances of the shape it
    cuts, and the feature table measured after it then read two of the casting
    bracket's through holes as blind.
    """
    from OCP.BRepBuilderAPI import BRepBuilderAPI_Copy
    from OCP.BRepAlgoAPI import BRepAlgoAPI_Section
    wrapped = BRepBuilderAPI_Copy(wrapped, True, False).Shape()
    from OCP.gp import gp_Pln, gp_Pnt, gp_Dir
    from OCP.TopExp import TopExp_Explorer
    from OCP.TopAbs import TopAbs_EDGE
    from OCP.TopoDS import TopoDS
    from OCP.BRepAdaptor import BRepAdaptor_Curve
    from OCP.GCPnts import GCPnts_QuasiUniformDeflection

    xmin, ymin, zmin, xmax, ymax, zmax = bbox6
    dims = [xmax - xmin, ymax - ymin, zmax - zmin]
    order = sorted(range(3), key=lambda k: -dims[k])
    long_ok = dims[order[0]] >= 4 * dims[order[1]]
    # Try each axis, longest first: the extrusion axis is the one along which the
    # section is constant — not always the longest (a heat sink is cut short).
    for ax in order:
        res = _section_along(wrapped, bbox6, volume_mm3, ax)
        if res and res.get("constant"):
            return res
        if ax == order[0] and not long_ok:
            continue
    if long_ok:
        res = _section_along(wrapped, bbox6, volume_mm3, order[0])
        return res
    return None


def _section_along(wrapped, bbox6, volume_mm3, ax):
    from OCP.BRepAlgoAPI import BRepAlgoAPI_Section
    from OCP.gp import gp_Pln, gp_Pnt, gp_Dir
    from OCP.TopExp import TopExp_Explorer
    from OCP.TopAbs import TopAbs_EDGE
    from OCP.TopoDS import TopoDS
    from OCP.BRepAdaptor import BRepAdaptor_Curve
    from OCP.GCPnts import GCPnts_QuasiUniformDeflection
    xmin, ymin, zmin, xmax, ymax, zmax = bbox6
    dims = [xmax - xmin, ymax - ymin, zmax - zmin]
    u_ax, v_ax = [k for k in range(3) if k != ax]
    L = dims[ax]
    lo = [xmin, ymin, zmin][ax]
    dirv = [0.0, 0.0, 0.0]; dirv[ax] = 1.0

    def loops_at(frac):
        c = [(xmin + xmax) / 2, (ymin + ymax) / 2, (zmin + zmax) / 2]
        c[ax] = lo + frac * L
        sec = BRepAlgoAPI_Section(wrapped, gp_Pln(gp_Pnt(*c), gp_Dir(*dirv)))
        sec.Build()
        polys = []
        ex = TopExp_Explorer(sec.Shape(), TopAbs_EDGE)
        while ex.More():
            e = TopoDS.Edge_s(ex.Current())
            try:
                cv = BRepAdaptor_Curve(e)
                d = GCPnts_QuasiUniformDeflection(cv, 0.02)
                pts = []
                if d.IsDone():
                    for i in range(1, d.NbPoints() + 1):
                        q = d.Value(i)
                        xyz = (q.X(), q.Y(), q.Z())
                        pts.append((xyz[u_ax], xyz[v_ax]))
                if len(pts) >= 2:
                    polys.append(pts)
            except Exception:
                pass
            ex.Next()
        # Chain edge polylines into closed loops by matching end points — the
        # NEAREST end within a tolerance set by the SECTION, not the part. It was
        # 0.1% of the longest dimension: 2 mm on a 2 m profile, wider than its
        # 1.5 mm wall, so a lip's inner corner joined its outer one and the seal
        # carrier's section lost 9 mm² (aluminium-extrusion review, Oct 2026).
        # The section's own edges share their vertices to OCCT precision.
        tol = max(1e-4, 1e-4 * max(dims[u_ax], dims[v_ax]))
        loops = []
        pool = polys[:]
        while pool:
            cur = pool.pop()
            while pool:
                best = None
                for i, pl in enumerate(pool):
                    for mode, d in ((0, math.dist(cur[-1], pl[0])), (1, math.dist(cur[-1], pl[-1])),
                                    (2, math.dist(cur[0], pl[-1])), (3, math.dist(cur[0], pl[0]))):
                        if d < tol and (best is None or d < best[0]):
                            best = (d, i, mode)
                if best is None:
                    break
                _, i, mode = best
                pl = pool.pop(i)
                if mode == 0: cur = cur + pl[1:]
                elif mode == 1: cur = cur + pl[::-1][1:]
                elif mode == 2: cur = pl + cur[1:]
                else: cur = pl[::-1] + cur[1:]
            if len(cur) >= 3:
                loops.append(cur)
        return loops

    def signed_area(lp):
        a = 0.0
        for i in range(len(lp)):
            x1, y1 = lp[i]; x2, y2 = lp[(i + 1) % len(lp)]
            a += x1 * y2 - x2 * y1
        return a / 2

    def inside(pt, lp):
        x, y = pt; c = False
        n = len(lp)
        for i in range(n):
            x1, y1 = lp[i]; x2, y2 = lp[(i + 1) % n]
            if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1 + 1e-300) + x1:
                c = not c
        return c

    def describe(loops):
        if not loops:
            return None
        depth = []
        for i, lp in enumerate(loops):
            probe = lp[0]
            depth.append(sum(1 for j, other in enumerate(loops) if j != i and inside(probe, other)))
        area = 0.0; perim = 0.0; voids = 0; outers = 0; outer_perim = 0.0
        oriented = []; outer_loops = []
        for lp, dpt in zip(loops, depth):
            a = signed_area(lp)
            hole = dpt % 2 == 1
            area += -abs(a) if hole else abs(a)
            lp_perim = sum(math.dist(lp[i], lp[(i + 1) % len(lp)]) for i in range(len(lp)))
            perim += lp_perim
            if hole: voids += 1
            else:
                outers += 1; outer_perim += lp_perim; outer_loops.append(lp)
            # Material on the left: outer loops CCW, holes CW.
            want_ccw = not hole
            oriented.append(lp if (a > 0) == want_ccw else lp[::-1])
        return {"area": area, "perim": perim, "voids": voids, "outers": outers, "loops": oriented,
                "outerPerim": outer_perim, "outerLoops": outer_loops}

    def tongue(outer_loops):
        """
        The semi-hollow test (aluminium-extrusion review, Oct 2026): a space the
        section nearly encloses, reached through a gap, puts a TONGUE of die
        steel into the section. Tongue ratio = that space's area ÷ gap². Each
        concavity of the outer outline is the region between the outline and
        one edge of its convex hull; the hull edge is the gap across the
        opening. Returns the largest ratio and its gap.
        """
        best = (0.0, None)
        for lp in outer_loops:
            n = len(lp)
            if n < 4:
                continue
            idx = sorted(range(n), key=lambda i: (lp[i][0], lp[i][1]))
            def cross(o, a, b):
                return (lp[a][0] - lp[o][0]) * (lp[b][1] - lp[o][1]) - (lp[a][1] - lp[o][1]) * (lp[b][0] - lp[o][0])
            lower, upper = [], []
            for i in idx:
                while len(lower) >= 2 and cross(lower[-2], lower[-1], i) <= 0:
                    lower.pop()
                lower.append(i)
            for i in reversed(idx):
                while len(upper) >= 2 and cross(upper[-2], upper[-1], i) <= 0:
                    upper.pop()
                upper.append(i)
            hull = set(lower[:-1] + upper[:-1])
            hv = sorted(hull)
            for k in range(len(hv)):
                i, j = hv[k], hv[(k + 1) % len(hv)]
                run = (j - i) % n
                if run < 2:
                    continue
                q = [lp[(i + t) % n] for t in range(run + 1)]
                if len(q) > 300:                      # bound the O(m²) search
                    st = len(q) // 300 + 1
                    q = q[::st] + ([q[-1]] if (len(q) - 1) % st else [])
                m = len(q)
                # Prefix shoelace sums: area of q[a..b] closed by the chord is O(1).
                pre = [0.0] * m
                for t in range(1, m):
                    pre[t] = pre[t - 1] + (q[t - 1][0] * q[t][1] - q[t][0] * q[t - 1][1])
                # The mouth is the narrowest chord across the concavity that encloses
                # space beyond it: max of enclosed area / chord² over the chords whose
                # midpoint is outside the material (a chord through a wall is not a gap).
                for a in range(m - 2):
                    for b in range(a + 2, m):
                        gap = math.dist(q[a], q[b])
                        if gap < 0.3:
                            continue
                        enc = abs(pre[b] - pre[a] + (q[b][0] * q[a][1] - q[a][0] * q[b][1])) / 2
                        r = enc / (gap * gap)
                        if r <= best[0]:
                            continue
                        mid_pt = ((q[a][0] + q[b][0]) / 2, (q[a][1] + q[b][1]) / 2)
                        if inside(mid_pt, lp):
                            continue
                        best = (r, gap)
        return best

    mid = describe(loops_at(0.5))
    if not mid or mid["area"] <= 0:
        return None
    others = [describe(loops_at(f)) for f in (0.25, 0.75)]
    areas = [mid["area"]] + [o["area"] for o in others if o and o["area"] > 0]

    pts = [p for lp in mid["loops"] for p in lp]
    # Minimum enclosing circle (Welzl, iterative, shuffled deterministically).
    rnd = random.Random(20261003)
    P = pts[:]
    if len(P) > 4000:
        P = P[::max(1, len(P) // 4000)]
    rnd.shuffle(P)

    def circ2(a, b):
        cx, cy = (a[0] + b[0]) / 2, (a[1] + b[1]) / 2
        return (cx, cy, math.dist(a, b) / 2)

    def circ3(a, b, c):
        ax_, ay = a; bx, by = b; cx_, cy_ = c
        d = 2 * (ax_ * (by - cy_) + bx * (cy_ - ay) + cx_ * (ay - by))
        if abs(d) < 1e-12:
            return max((circ2(a, b), circ2(a, c), circ2(b, c)), key=lambda t: t[2])
        ux = ((ax_ * ax_ + ay * ay) * (by - cy_) + (bx * bx + by * by) * (cy_ - ay) + (cx_ * cx_ + cy_ * cy_) * (ay - by)) / d
        uy = ((ax_ * ax_ + ay * ay) * (cx_ - bx) + (bx * bx + by * by) * (ax_ - cx_) + (cx_ * cx_ + cy_ * cy_) * (bx - ax_)) / d
        return (ux, uy, math.dist((ux, uy), a))

    def incirc(c, p):
        return math.dist((c[0], c[1]), p) <= c[2] + 1e-7

    c = (P[0][0], P[0][1], 0.0)
    for i in range(1, len(P)):
        if incirc(c, P[i]):
            continue
        c = (P[i][0], P[i][1], 0.0)
        for j in range(i):
            if incirc(c, P[j]):
                continue
            c = circ2(P[i], P[j])
            for k in range(j):
                if not incirc(c, P[k]):
                    c = circ3(P[i], P[j], P[k])
    ccd = 2 * c[2]

    # Wall: inward rays from points along the outline to the far side.
    segs = []
    for lp in mid["loops"]:
        for i in range(len(lp)):
            segs.append((lp[i], lp[(i + 1) % len(lp)]))
    step = max(1, len(segs) // 400)
    chords = []
    for si in range(0, len(segs), step):
        (x1, y1), (x2, y2) = segs[si]
        dx, dy = x2 - x1, y2 - y1
        ln = math.hypot(dx, dy)
        if ln < 1e-9:
            continue
        nx, ny = -dy / ln, dx / ln          # left normal = into the material
        ox, oy = (x1 + x2) / 2 + nx * 1e-4, (y1 + y2) / 2 + ny * 1e-4
        best = None
        for sj, ((ax_, ay), (bx, by)) in enumerate(segs):
            if sj == si:
                continue
            ex_, ey = bx - ax_, by - ay
            den = nx * ey - ny * ex_
            if abs(den) < 1e-12:
                continue
            t = ((ax_ - ox) * ey - (ay - oy) * ex_) / den
            u = ((ax_ - ox) * ny - (ay - oy) * nx) / den
            if t > 1e-6 and -1e-9 <= u <= 1 + 1e-9 and (best is None or t < best):
                best = t
        if best is not None:
            chords.append(best)
    chords.sort()
    min_wall = chords[max(0, int(len(chords) * 0.10) - 1)] if chords else None
    mean_wall = 2 * mid["area"] / mid["perim"] if mid["perim"] > 0 else None
    tongue_r, tongue_gap = tongue(mid["outerLoops"])
    return {
        "axis": "xyz"[ax],
        "lengthMm": round(L, 2),
        "areaMm2": round(mid["area"], 2),
        "perimeterMm": round(mid["perim"], 2),
        "outerPerimeterMm": round(mid["outerPerim"], 2),
        "outerLoops": mid["outers"],
        "tongueRatio": round(tongue_r, 2),
        "tongueGapMm": round(tongue_gap, 2) if tongue_gap else None,
        "voids": mid["voids"],
        "ccdMm": round(ccd, 2),
        "minWallMm": round(min_wall, 3) if min_wall else None,
        "meanWallMm": round(mean_wall, 3) if mean_wall else None,
        "sectionBoxMm": [round(dims[u_ax], 2), round(dims[v_ax], 2)],
        "stationAreasMm2": [round(a, 2) for a in areas],
        "volumeShare": round(volume_mm3 / (mid["area"] * L), 4) if mid["area"] * L > 0 else None,
        "constant": bool(len(areas) == 3 and max(areas) <= 1.01 * min(areas)
                         and mid["area"] * L > 0 and 0.98 <= volume_mm3 / (mid["area"] * L) <= 1.02),
    }


def _enclosure(wrapped, bbox6, n_rays: int = 96) -> dict:
    """
    How much of the part surrounds the middle of its envelope.

    Fire n rays from the envelope centre (a Fibonacci sphere, deterministic) and
    count the share that meet the part. From inside a tank — even one with a
    filler neck — almost every direction hits a wall; from above the floor of an
    open tray the upper half escapes; around a pressing most rays leave. Fill
    ratio and wall cannot tell a closed tank from an open tray (rotational-
    moulding review: a 4 L header tank at 10% fill read as a solid, and the real
    fuel tank and an open storage tray overlap on every fill test). If the
    centre is inside material the share means nothing, and says so.
    """
    from OCP.IntCurvesFace import IntCurvesFace_ShapeIntersector
    from OCP.BRepClass3d import BRepClass3d_SolidClassifier
    from OCP.TopAbs import TopAbs_IN, TopAbs_ON
    from OCP.gp import gp_Lin, gp_Dir, gp_Pnt
    xmin, ymin, zmin, xmax, ymax, zmax = bbox6
    c = gp_Pnt((xmin + xmax) / 2, (ymin + ymax) / 2, (zmin + zmax) / 2)
    state = BRepClass3d_SolidClassifier(wrapped, c, 1e-6).State()
    if state in (TopAbs_IN, TopAbs_ON):
        return {"centreIn": "material", "rays": 0, "hitShare": None}
    reach = math.sqrt((xmax - xmin) ** 2 + (ymax - ymin) ** 2 + (zmax - zmin) ** 2)
    inter = IntCurvesFace_ShapeIntersector()
    inter.Load(wrapped, 1e-4)
    hits = 0
    golden = math.pi * (3 - math.sqrt(5))
    for i in range(n_rays):
        z = 1 - 2 * (i + 0.5) / n_rays
        r = math.sqrt(max(0.0, 1 - z * z))
        th = golden * i
        try:
            inter.PerformNearest(gp_Lin(c, gp_Dir(r * math.cos(th), r * math.sin(th), z)), 0.0, reach)
            if inter.IsDone() and inter.NbPnt() > 0:
                hits += 1
        except Exception:
            continue
    return {"centreIn": "void", "rays": n_rays, "hitShare": round(hits / n_rays, 3)}


def _topology_report(shape):
    """Is this a closed solid we can honestly measure? — plus the void signal.

    Two things this used to get wrong, both found by measuring real parts:

    * `freeEdgeCount` counted every edge with a single face ancestor. That
      includes DEGENERATE edges (cone apexes, surface poles) and SEAM edges on
      periodic surfaces, which are owned by one face by construction. A valid
      closed casting reported 17 "free edges"; all 17 were degenerate.
    * `openShell` was defined as `not enclosesSealedVoid`, i.e. "has no internal
      cavity" — True on every plain solid and False on a genuinely open drape
      with 25 real free edges.

    Now: a free edge is one bounding exactly one face that is neither degenerate
    nor a seam; `isClosedSolid` additionally requires BRepCheck validity, at
    least one solid, and no free-boundary wires. `enclosesInternalVoid` keeps
    the old `voidCount` meaning under an honest name (`enclosesSealedVoid` is
    kept as an alias because the moulding rules read it).
    """
    from OCP.TopExp import TopExp_Explorer, TopExp
    from OCP.TopAbs import TopAbs_SHELL, TopAbs_SOLID, TopAbs_EDGE, TopAbs_FACE, TopAbs_WIRE
    from OCP.TopTools import TopTools_IndexedDataMapOfShapeListOfShape
    from OCP.TopoDS import TopoDS
    from OCP.BRep import BRep_Tool

    raw = getattr(shape, "wrapped", shape)

    def _count(shp, kind):
        e = TopExp_Explorer(shp, kind); n = 0
        while e.More():
            n += 1; e.Next()
        return n

    solids = _count(raw, TopAbs_SOLID)
    shells = _count(raw, TopAbs_SHELL)
    emap = TopTools_IndexedDataMapOfShapeListOfShape()
    TopExp.MapShapesAndAncestors_s(raw, TopAbs_EDGE, TopAbs_FACE, emap)
    total_e = emap.Extent()
    free_real = degenerate = seam = 0
    for i in range(1, total_e + 1):
        lst = emap.FindFromIndex(i)
        if lst.Extent() != 1:
            continue
        e = TopoDS.Edge_s(emap.FindKey(i))
        if BRep_Tool.Degenerated_s(e):
            degenerate += 1
            continue
        try:
            if BRep_Tool.IsClosed_s(e, TopoDS.Face_s(lst.First())):
                seam += 1
                continue
        except Exception:
            pass
        free_real += 1

    valid = None
    try:
        from OCP.BRepCheck import BRepCheck_Analyzer
        valid = bool(BRepCheck_Analyzer(raw).IsValid())
    except Exception:
        valid = None

    open_wires = closed_wires = 0
    try:
        from OCP.ShapeAnalysis import ShapeAnalysis_FreeBounds
        fb = ShapeAnalysis_FreeBounds(raw, 1e-3, False, False)
        ow, cw = fb.GetOpenWires(), fb.GetClosedWires()
        open_wires = 0 if ow.IsNull() else _count(ow, TopAbs_WIRE)
        closed_wires = 0 if cw.IsNull() else _count(cw, TopAbs_WIRE)
    except Exception:
        pass

    void_count = max(0, shells - max(1, solids))
    encloses_void = void_count >= 1
    is_closed_solid = bool(solids >= 1 and free_real == 0 and open_wires == 0 and closed_wires == 0
                           and valid is not False)
    return {
        "available": True,
        "valid": valid,
        "solidCount": solids,
        "shellCount": shells,
        "voidCount": void_count,
        "freeEdgeCount": free_real,
        "degenerateEdgeCount": degenerate,
        "seamEdgeCount": seam,
        "freeEdgeRatio": round(free_real / max(1, total_e), 4),
        "freeBoundaryWires": open_wires + closed_wires,
        "isClosedSolid": is_closed_solid,
        "enclosesInternalVoid": bool(encloses_void),
        # Kept under the old names: the moulding rules read the first, and
        # `openShell` now means what it says.
        "enclosesSealedVoid": bool(encloses_void),
        "openShell": not is_closed_solid,
    }


def _topology_signals(shape):
    """Back-compat alias — see `_topology_report`."""
    return _topology_report(shape)


def _classify_edges(edges):
    """Return (type_counts dict, circle_radii list)."""
    from OCP.BRepAdaptor import BRepAdaptor_Curve
    from OCP.GeomAbs import (
        GeomAbs_Line, GeomAbs_Circle, GeomAbs_Ellipse,
        GeomAbs_BSplineCurve, GeomAbs_BezierCurve,
    )
    NAMES = {
        GeomAbs_Line: "LINE", GeomAbs_Circle: "CIRCLE",
        GeomAbs_Ellipse: "ELLIPSE", GeomAbs_BSplineCurve: "BSPLINE",
        GeomAbs_BezierCurve: "BEZIER",
    }
    counts, circle_radii = {}, []
    for edge in edges:
        try:
            adaptor = BRepAdaptor_Curve(edge.wrapped)
            t = adaptor.GetType()
            name = NAMES.get(t, "OTHER")
            counts[name] = counts.get(name, 0) + 1
            if t == GeomAbs_Circle:
                r = adaptor.Circle().Radius()
                if 0 < r < 1000:
                    circle_radii.append(r)
        except Exception:
            counts["OTHER"] = counts.get("OTHER", 0) + 1
    return counts, circle_radii


# ─── Wall thickness (ray-casting) ────────────────────────────────────────────

def _compute_wall_thickness(shape, faces, max_samples: int = 30) -> dict:
    """
    Ray-cast from outer planar face centres inward to measure wall thickness.
    Uses TopAbs_FORWARD to identify outer faces so we don't traverse voids.
    """
    from OCP.IntCurvesFace import IntCurvesFace_ShapeIntersector
    from OCP.GeomLProp import GeomLProp_SLProps
    from OCP.BRepTools import BRepTools
    from OCP.BRep import BRep_Tool
    from OCP.GeomAdaptor import GeomAdaptor_Surface
    from OCP.GeomAbs import GeomAbs_Plane
    from OCP.TopAbs import TopAbs_FORWARD
    from OCP.gp import gp_Lin, gp_Dir, gp_Pnt

    inter = IntCurvesFace_ShapeIntersector()
    inter.Load(shape.wrapped, 1e-4)

    planar_outer = [
        f for f in faces
        if f.geomType() == "PLANE" and f.wrapped.Orientation() == TopAbs_FORWARD
    ]
    if not planar_outer:
        return None

    # Seeded: the same file must measure the same wall every run — the cost is
    # deterministic downstream, so the measurement feeding it must be too.
    sample = random.Random(20260401).sample(planar_outer, min(max_samples, len(planar_outer)))
    thicknesses = []

    for face in sample:
        try:
            surf = BRep_Tool.Surface_s(face.wrapped)
            umin, umax, vmin, vmax = BRepTools.UVBounds_s(face.wrapped)
            u_mid, v_mid = (umin + umax) / 2, (vmin + vmax) / 2
            props = GeomLProp_SLProps(surf, u_mid, v_mid, 1, 1e-7)
            if not props.IsNormalDefined():
                continue
            P, N = props.Value(), props.Normal()
            nx, ny, nz = N.X(), N.Y(), N.Z()
            # Offset slightly inward from face to avoid self-intersection
            start = gp_Pnt(P.X() - nx * 0.05, P.Y() - ny * 0.05, P.Z() - nz * 0.05)
            ray = gp_Lin(start, gp_Dir(-nx, -ny, -nz))
            inter.PerformNearest(ray, 0.1, 200.0)
            if inter.IsDone() and inter.NbPnt() > 0:
                dist = round(start.Distance(inter.Pnt(1)), 2)
                if 0.3 < dist < 200.0:
                    thicknesses.append(dist)
        except Exception:
            continue

    if len(thicknesses) < 2:
        return None

    n = len(thicknesses)
    mean = sum(thicknesses) / n
    std = math.sqrt(sum((x - mean) ** 2 for x in thicknesses) / n)
    # 95th-percentile wall: the thickest section ejects last, so cooling time is
    # governed by the upper tail, not the mean. p95 (not max) so a single sliver
    # or a ray that grazed a boss cannot set the cycle.
    ordered = sorted(thicknesses)
    p95 = ordered[min(n - 1, max(0, math.ceil(0.95 * n) - 1))]
    return {
        "minMm": round(min(thicknesses), 2),
        "maxMm": round(max(thicknesses), 2),
        "p95Mm": round(p95, 2),
        "meanMm": round(mean, 2),
        "stdDevMm": round(std, 2),
        "sampleCount": n,
        "method": "ray_cast",
        "uniformity": (
            "uniform" if std < 1.0
            else "moderate" if std < 3.0
            else "non-uniform"
        ),
    }


def _per_face_thickness(wrapped, face_map, diag: float, max_faces: int = 4000) -> dict:
    """Single-ray wall thickness per B-rep face for the interactive viewer heatmap.

    From each face's UV-mid point, cast a ray inward along the MATERIAL-outward
    normal (flipped for REVERSED faces) and measure the distance to the first
    opposite surface — the classic single-ray wall-thickness method. Returns a
    { face_map_index (1-based) -> thickness_mm } dict; missing faces (grazing
    rays, open surfaces) are simply absent. Bounded to `max_faces` so a fillet-
    heavy model can't turn this into a ray-casting DoS."""
    result = {}
    try:
        from OCP.IntCurvesFace import IntCurvesFace_ShapeIntersector
        from OCP.GeomLProp import GeomLProp_SLProps
        from OCP.BRepTools import BRepTools
        from OCP.BRep import BRep_Tool
        from OCP.TopAbs import TopAbs_Orientation
        from OCP.TopoDS import TopoDS
        from OCP.gp import gp_Lin, gp_Dir, gp_Pnt
    except ImportError:
        return result

    n_faces = face_map.Extent()
    if n_faces == 0 or n_faces > max_faces:
        return result

    inter = IntCurvesFace_ShapeIntersector()
    inter.Load(wrapped, 1e-4)
    eps = max(diag * 1e-4, 1e-3)
    tmax = diag * 1.05

    for idx in range(1, n_faces + 1):
        try:
            face = TopoDS.Face_s(face_map.FindKey(idx))
            surf = BRep_Tool.Surface_s(face)
            umin, umax, vmin, vmax = BRepTools.UVBounds_s(face)
            u_mid, v_mid = (umin + umax) / 2, (vmin + vmax) / 2
            props = GeomLProp_SLProps(surf, u_mid, v_mid, 1, 1e-7)
            if not props.IsNormalDefined():
                continue
            P, Ng = props.Value(), props.Normal()
            nx, ny, nz = Ng.X(), Ng.Y(), Ng.Z()
            # material-outward normal: flip the geometric normal on REVERSED faces
            if face.Orientation() == TopAbs_Orientation.TopAbs_REVERSED:
                nx, ny, nz = -nx, -ny, -nz
            start = gp_Pnt(P.X() - nx * eps, P.Y() - ny * eps, P.Z() - nz * eps)
            ray = gp_Lin(start, gp_Dir(-nx, -ny, -nz))  # into the material
            inter.PerformNearest(ray, eps, tmax)
            if inter.IsDone() and inter.NbPnt() > 0:
                dist = start.Distance(inter.Pnt(1)) + eps
                if 0.05 < dist < tmax:
                    result[idx] = round(dist, 3)
        except Exception:
            continue
    return result


# ─── Draft angle & undercut analysis ─────────────────────────────────────────

def _silhouette_areas_mm2(shape, diag_mm: float, cells: int = 400) -> dict:
	"""
	Projected (silhouette) area of the solid along each principal axis, mm².

	What a moulding press or a die-casting machine has to hold shut is the
	part's shadow on the parting plane. The rules used to estimate it as the
	bounding-box face x sqrt(fill ratio), which is right for a solid and badly
	wrong for an open shell: a 600 x 400 mm tray read 655 cm² against a 2,400 cm²
	shadow, and the press came out 3.5x too small. Here the solid is tessellated,
	every triangle projected onto the plane, and their UNION rasterised on a
	`cells`-wide grid over the longest side (error ~ perimeter x cell / 2, well
	under 1% on a moulding). Pure OCP + Python, no numpy.
	"""
	from OCP.BRepMesh import BRepMesh_IncrementalMesh
	from OCP.BRep import BRep_Tool
	from OCP.TopLoc import TopLoc_Location
	from OCP.TopExp import TopExp_Explorer
	from OCP.TopAbs import TopAbs_FACE
	from OCP.TopoDS import TopoDS
	BRepMesh_IncrementalMesh(shape, max(0.05, diag_mm / 400.0), False, 0.5, True)
	tris = []
	exp = TopExp_Explorer(shape, TopAbs_FACE)
	while exp.More():
		f = TopoDS.Face_s(exp.Current())
		loc = TopLoc_Location()
		t = BRep_Tool.Triangulation_s(f, loc)
		if t is not None:
			tr = loc.Transformation()
			pts = []
			for i in range(1, t.NbNodes() + 1):
				q = t.Node(i).Transformed(tr)
				pts.append((q.X(), q.Y(), q.Z()))
			for i in range(1, t.NbTriangles() + 1):
				a, b, c = t.Triangle(i).Get()
				tris.append((pts[a - 1], pts[b - 1], pts[c - 1]))
		exp.Next()
	if not tris:
		return {}
	out = {}
	for name, (iu, iv) in (("zMm2", (0, 1)), ("yMm2", (0, 2)), ("xMm2", (1, 2))):
		us = [p[iu] for tri in tris for p in tri]
		vs = [p[iv] for tri in tris for p in tri]
		u0, u1, v0, v1 = min(us), max(us), min(vs), max(vs)
		span = max(u1 - u0, v1 - v0)
		if span <= 0:
			out[name] = 0.0
			continue
		cell = span / cells
		nu = int((u1 - u0) / cell) + 1
		nv = int((v1 - v0) / cell) + 1
		grid = bytearray(nu * nv)
		for tri in tris:
			ax, ay = tri[0][iu] - u0, tri[0][iv] - v0
			bx, by = tri[1][iu] - u0, tri[1][iv] - v0
			cx, cy = tri[2][iu] - u0, tri[2][iv] - v0
			area2 = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)
			if abs(area2) < 1e-12:
				continue  # edge-on to this plane: no shadow
			i0 = max(0, int(min(ax, bx, cx) / cell)); i1 = min(nu - 1, int(max(ax, bx, cx) / cell))
			j0 = max(0, int(min(ay, by, cy) / cell)); j1 = min(nv - 1, int(max(ay, by, cy) / cell))
			sgn = 1.0 if area2 > 0 else -1.0
			for j in range(j0, j1 + 1):
				py = (j + 0.5) * cell
				row = j * nu
				for i in range(i0, i1 + 1):
					if grid[row + i]:
						continue
					px = (i + 0.5) * cell
					if (sgn * ((bx - ax) * (py - ay) - (by - ay) * (px - ax)) >= 0
							and sgn * ((cx - bx) * (py - by) - (cy - by) * (px - bx)) >= 0
							and sgn * ((ax - cx) * (py - cy) - (ay - cy) * (px - cx)) >= 0):
						grid[row + i] = 1
		out[name] = round(sum(grid) * cell * cell, 0)
	return out


# A wall within 0.5° of the draw is a draft question (zero draft), not a release one.
_RELEASE_PARALLEL_COS = math.sin(math.radians(0.5))
# The release probe starts this far off the face (grazing guard) …
RELEASE_OFFSET_MM = 0.1
# … and an obstruction nearer than this along the line of release is a sliver or a grazing hit, below casting and
# moulding tolerance — nothing a slide or a core is made for (the knuckle's 0.3 mm² slivers read 0.15–0.7 mm).
MIN_BLOCK_MM = 0.5
# A face smaller than this is not judged for release on its own (a sliver at a fillet junction).
MIN_RELEASE_FACE_MM2 = 1.0
# A cylinder up to this radius between two blocked faces is a blend that joins them into one undercut region.
BLEND_MAX_RADIUS_MM = 10.0


def _face_points(face, k=3):
    """Up to k points ON a trimmed face, spread across it (uv-mid first when it is inside, then the inside points of a
    5 × 5 grid farthest from those already taken), each with the material-outward normal there."""
    from OCP.BRep import BRep_Tool
    from OCP.BRepTools import BRepTools
    from OCP.GeomLProp import GeomLProp_SLProps
    from OCP.BRepTopAdaptor import BRepTopAdaptor_FClass2d
    from OCP.gp import gp_Pnt2d
    from OCP.TopAbs import TopAbs_State, TopAbs_Orientation
    surf = BRep_Tool.Surface_s(face)
    umin, umax, vmin, vmax = BRepTools.UVBounds_s(face)
    try:
        fc = BRepTopAdaptor_FClass2d(face, 1e-6)
    except Exception:
        fc = None
    grid = [((umin + umax) / 2, (vmin + vmax) / 2)]
    # the 5 × 5 grid's centre cell IS the uv-mid: skipped, so no point is listed twice
    grid += [(umin + (umax - umin) * (i + 0.5) / 5, vmin + (vmax - vmin) * (j + 0.5) / 5)
             for i in range(5) for j in range(5) if (i, j) != (2, 2)]
    inside = []
    for (u, v) in grid:
        if fc is not None:
            try:
                if fc.Perform(gp_Pnt2d(u, v)) != TopAbs_State.TopAbs_IN:
                    continue
            except Exception:
                pass
        props = GeomLProp_SLProps(surf, u, v, 1, 1e-7)
        if not props.IsNormalDefined():
            continue
        P, N = props.Value(), props.Normal()
        n = [N.X(), N.Y(), N.Z()]
        if face.Orientation() == TopAbs_Orientation.TopAbs_REVERSED:
            n = [-c for c in n]
        inside.append(((P.X(), P.Y(), P.Z()), tuple(n)))
    if not inside:
        return []
    picked = [inside[0]]
    while len(picked) < k:
        rest = [q for q in inside if all(math.dist(q[0], r[0]) > 1e-9 for r in picked)]
        if not rest:            # fewer distinct inside points than asked for: confirm from those there are
            break
        picked.append(max(rest, key=lambda q: min(math.dist(q[0], r[0]) for r in picked)))
    return picked


def _face_point(face):
    """A point ON a trimmed face and the face's MATERIAL-outward normal there: (P, (nx, ny, nz)) or None.

    The uv-mid point of a trimmed face can lie outside it (an L-shaped plate, a face with a big hole); a probe from
    there tests the wrong place. The uv-mid is kept when the face's own 2-D classifier puts it inside, otherwise the
    first inside point of a 5 × 5 grid."""
    from OCP.BRep import BRep_Tool
    from OCP.BRepTools import BRepTools
    from OCP.GeomLProp import GeomLProp_SLProps
    from OCP.BRepTopAdaptor import BRepTopAdaptor_FClass2d
    from OCP.gp import gp_Pnt2d
    from OCP.TopAbs import TopAbs_State, TopAbs_Orientation
    surf = BRep_Tool.Surface_s(face)
    umin, umax, vmin, vmax = BRepTools.UVBounds_s(face)
    cands = [((umin + umax) / 2, (vmin + vmax) / 2)]
    cands += [(umin + (umax - umin) * (i + 0.5) / 5, vmin + (vmax - vmin) * (j + 0.5) / 5) for i in range(5) for j in range(5)]
    try:
        fc = BRepTopAdaptor_FClass2d(face, 1e-6)
    except Exception:
        fc = None
    for (u, v) in cands:
        if fc is not None:
            try:
                if fc.Perform(gp_Pnt2d(u, v)) != TopAbs_State.TopAbs_IN:
                    continue
            except Exception:
                pass
        props = GeomLProp_SLProps(surf, u, v, 1, 1e-7)
        if not props.IsNormalDefined():
            continue
        P, N = props.Value(), props.Normal()
        nx, ny, nz = N.X(), N.Y(), N.Z()
        if face.Orientation() == TopAbs_Orientation.TopAbs_REVERSED:
            nx, ny, nz = -nx, -ny, -nz
        return (P.X(), P.Y(), P.Z()), (nx, ny, nz)
    return None


def _release_blocked(inter, pt, n, d, diag):
    """Two-half tooling (a mould, a die, a pattern): a face comes out of the half its outward normal faces — the
    sign of n·d — so a face pointing AGAINST the draw is not an undercut, it is on the other half. It is an
    undercut only when material lies on its line of release. Returns (half, blockedAtMm): half +1 / -1, 0 for a
    wall parallel to the draw; blockedAtMm None when the release line is clear or the probe could not run.

    One ray from one point on the face: a face partly shadowed reads by that point. Stated, not hidden."""
    from OCP.gp import gp_Lin, gp_Dir, gp_Pnt
    c = n[0] * d[0] + n[1] * d[1] + n[2] * d[2]
    if abs(c) < _RELEASE_PARALLEL_COS:
        return 0, None
    s = 1.0 if c > 0 else -1.0
    if inter is None:
        return int(s), None
    # 0.1 mm off the face: a ray started 0.01 mm off a wall a few degrees from the draw grazed the neighbouring
    # edge and read 0.07–0.59 mm "blocks" along the gearbox housing's whole flange (clear from 0.1 mm).
    off = max(diag * 5e-5, RELEASE_OFFSET_MM)
    start = gp_Pnt(pt[0] + n[0] * off, pt[1] + n[1] * off, pt[2] + n[2] * off)
    try:
        inter.PerformNearest(gp_Lin(start, gp_Dir(s * d[0], s * d[1], s * d[2])), 0.0, diag * 1.05)
        if inter.IsDone() and inter.NbPnt() > 0:
            dist = start.Distance(inter.Pnt(1))
            if dist > MIN_BLOCK_MM:
                return int(s), round(dist, 3)
    except Exception:
        pass
    return int(s), None


# Directions for the cavity probe: the 14 of a cube's faces and corners (a cylinder adds its ±axis). The 12 edge
# directions doubled the probe's cost and changed no verdict on the audit parts or the fuel tank.
_PROBE_DIRS = [(a / m, b / m, c / m) for a in (-1, 0, 1) for b in (-1, 0, 1) for c in (-1, 0, 1)
               if (a, b, c) != (0, 0, 0) and abs(a) + abs(b) + abs(c) != 2 for m in [math.sqrt(a * a + b * b + c * c)]]
_CAVITY_MEMO = {}


def _faces_cavity(inter, pt, n, diag, axis=None):
    """Does this face look into an ENCLOSED cavity — the inside skin of a hollow body? From just off the face, a ray in
    EVERY direction of the full sphere (the 26 of a cube, plus ±axis for a cylinder) must hit the part: no straight line
    leads out. Such a face is blocked along the draw like an undercut, but no tool forms it — a blow or roto moulding is
    pressed out by air / gravity, a casting needs a lost core, a moulding cannot be made — so it is not a slide question.

    The first version asked for 85 % of the rays into the face's own half-space, and a long cross bore in a SOLID part
    passed it (from inside a bore almost every ray hits the far wall): the manifold, Part1 and the stub axle lost their
    cross passages from the undercut count. A bore always opens along its axis, so it fails this test. None when the probe
    could not run."""
    if inter is None:
        return None
    key = (round(pt[0], 4), round(pt[1], 4), round(pt[2], 4), round(n[0], 4), round(n[1], 4), round(n[2], 4),
           None if axis is None else tuple(round(c, 4) for c in axis))
    if key in _CAVITY_MEMO:
        return _CAVITY_MEMO[key]
    from OCP.gp import gp_Lin, gp_Dir, gp_Pnt
    off = max(diag * 5e-5, RELEASE_OFFSET_MM)
    start = gp_Pnt(pt[0] + n[0] * off, pt[1] + n[1] * off, pt[2] + n[2] * off)
    dirs = list(_PROBE_DIRS)
    if axis is not None:
        dirs += [tuple(axis), tuple(-c for c in axis)]
    res = True
    try:
        for d in dirs:          # the first escape settles it: not enclosed
            inter.PerformNearest(gp_Lin(start, gp_Dir(*d)), 0.0, diag * 1.05)
            if not (inter.IsDone() and inter.NbPnt() > 0):
                res = False
                break
    except Exception:
        return None
    if len(_CAVITY_MEMO) > 200_000:
        _CAVITY_MEMO.clear()
    _CAVITY_MEMO[key] = res
    return res


def _shape_intersector(wrapped):
    try:
        from OCP.IntCurvesFace import IntCurvesFace_ShapeIntersector
        inter = IntCurvesFace_ShapeIntersector()
        inter.Load(wrapped, 1e-4)
        return inter
    except Exception:
        return None


_RELEASE_CACHE = {}
_FACE_GEOM_CACHE = {}


_ADJ_CACHE = {}


def _face_adjacency(wrapped, face_map):
    """{face index: set of face indices sharing an edge} — 1-based, the face map's own indexing. Cached per shape:
    the three draw candidates and the per-face pass all ask."""
    key = (id(wrapped), face_map.Extent())
    hit = _ADJ_CACHE.get("entry")
    if hit is not None and hit[0] == key and hit[1] is wrapped:
        return hit[2]
    adj = _face_adjacency_uncached(wrapped, face_map)
    _ADJ_CACHE["entry"] = (key, wrapped, adj)
    return adj


def _face_adjacency_uncached(wrapped, face_map):
    from OCP.TopTools import TopTools_IndexedDataMapOfShapeListOfShape
    from OCP.TopExp import TopExp
    from OCP.TopAbs import TopAbs_EDGE, TopAbs_FACE
    adj = {i: set() for i in range(1, face_map.Extent() + 1)}
    try:
        emap = TopTools_IndexedDataMapOfShapeListOfShape()
        TopExp.MapShapesAndAncestors_s(wrapped, TopAbs_EDGE, TopAbs_FACE, emap)
        for ei in range(1, emap.Extent() + 1):
            ids = [fi for shp in emap.FindFromIndex(ei) if (fi := face_map.FindIndex(shp)) > 0]
            for a in ids:
                for b in ids:
                    if a != b:
                        adj[a].add(b)
    except Exception:
        pass
    return adj


def _release_table(wrapped, face_map, diag, draw_dir, inter):
    """Per face (planes and cylinders), for a two-half tool opening along ±draw: the half it comes out of, where the
    part blocks its line of release (None = clear), and whether it faces an enclosed cavity. ONE table per draw,
    shared by the aggregate draft count (costing) and the per-face DFM pass — they used to cast the same rays twice.

    Cavity is probed per connected group of BLOCKED faces, not per face: a hollow body's inside skin is one group
    (its faces touch), and it does not touch the outside skin — the rim faces between them face along the wall and
    are not blocked. Three spread probes decide a group; if they disagree every face in it is probed. On the 3,444-
    face fuel tank this took the cavity probes from ~18 000 rays to a few dozen."""
    from OCP.TopoDS import TopoDS
    from OCP.BRepAdaptor import BRepAdaptor_Surface
    from OCP.GeomAbs import GeomAbs_SurfaceType
    from OCP.BRepGProp import BRepGProp
    from OCP.GProp import GProp_GProps
    gprops = GProp_GProps()
    n_faces = face_map.Extent()
    dx, dy, dz = draw_dir
    d_mag = math.sqrt(dx * dx + dy * dy + dz * dz) or 1.0
    d = (dx / d_mag, dy / d_mag, dz / d_mag)
    if inter == "lazy":
        key0 = (id(wrapped), n_faces, round(diag, 6), tuple(round(c, 6) for c in d), True)
        hit = _RELEASE_CACHE.get(key0)
        if hit is not None and hit[0] is wrapped:
            return hit[1]
        inter = _shape_intersector(wrapped)      # built only on a miss (it costs time on a large part)
    # A table built with no intersector measured nothing; it is never handed to a caller that has one.
    key = (id(wrapped), n_faces, round(diag, 6), tuple(round(c, 6) for c in d), inter is not None)
    hit = _RELEASE_CACHE.get(key)
    if hit is not None and hit[0] is wrapped:
        return hit[1]
    # The faces' sample points, normals, axes and areas do not depend on the draw: worked out once per shape and
    # shared by the three candidate axes (recomputing them per axis was most of the fuel tank's release time).
    gkey = (id(wrapped), n_faces)
    ghit = _FACE_GEOM_CACHE.get("entry")
    if ghit is not None and ghit[0] == gkey and ghit[1] is wrapped:
        geom = ghit[2]
    else:
        geom = {}
        for idx in range(1, n_faces + 1):
            try:
                face = TopoDS.Face_s(face_map.FindKey(idx))
                st = BRepAdaptor_Surface(face).GetType()
                if st not in (GeomAbs_SurfaceType.GeomAbs_Plane, GeomAbs_SurfaceType.GeomAbs_Cylinder):
                    continue
                pts = _face_points(face, 3)
                if not pts:
                    continue
                pt, (nx, ny, nz) = pts[0]
                nm = math.sqrt(nx * nx + ny * ny + nz * nz)
                if nm < 1e-10:
                    continue
                cyl_axis = None
                if st == GeomAbs_SurfaceType.GeomAbs_Cylinder:
                    a = BRepAdaptor_Surface(face).Cylinder().Axis().Direction()
                    cyl_axis = (a.X(), a.Y(), a.Z())
                BRepGProp.SurfaceProperties_s(face, gprops)
                geom[idx] = {"pt": pt, "n": (nx / nm, ny / nm, nz / nm), "plane": st == GeomAbs_SurfaceType.GeomAbs_Plane,
                             "axis": cyl_axis, "area": abs(gprops.Mass()), "more": pts[1:]}
            except Exception:
                continue
        _FACE_GEOM_CACHE["entry"] = (gkey, wrapped, geom)
    recs = {}
    for idx, gm in geom.items():
        try:
            half, blocked = _release_blocked(inter, gm["pt"], gm["n"], d, diag)
            if blocked is not None and gm["area"] < MIN_RELEASE_FACE_MM2:
                blocked = None
            recs[idx] = {"pt": gm["pt"], "n": gm["n"], "plane": gm["plane"], "axis": gm["axis"],
                         "half": half, "blocked": blocked, "cavity": False, "more": gm["more"]}
        except Exception:
            continue
    blocked_ids = {i for i, r in recs.items() if r["blocked"] is not None}
    if blocked_ids:
        adj = _face_adjacency(wrapped, face_map)
        seen = set()
        for start in sorted(blocked_ids):
            if start in seen:
                continue
            comp, stack = [], [start]
            seen.add(start)
            while stack:
                a = stack.pop()
                comp.append(a)
                for b in adj.get(a, ()):
                    # through blocked faces, and across a blend that is not itself tabled (a torus, a B-spline fillet)
                    nxt = [b] if b in blocked_ids else ([c for c in adj.get(b, ()) if c in blocked_ids] if b not in recs else [])
                    for c in nxt:
                        if c not in seen:
                            seen.add(c)
                            stack.append(c)
            comp.sort()
            # one probe decides a small group (a face or two); three spread probes vote on a larger one
            sample = [comp[0]] if len(comp) <= 3 else sorted({comp[0], comp[len(comp) // 2], comp[-1]})
            votes = [_faces_cavity(inter, recs[k]["pt"], recs[k]["n"], diag, recs[k]["axis"]) for k in sample]
            # A group is one skin: the majority of three spread probes decides it (a face by an open filler neck sees
            # out through it and must not split the inside skin into a few dozen "undercuts").
            if sum(1 for v in votes if v is True) * 2 > len(votes):
                for k in comp:
                    recs[k]["cavity"] = True
    # Confirm each remaining UNDERCUT from the face's other spread points (blocked at the majority, the nearest
    # obstruction kept) — after the cavity vote, so a hollow body's inside skin does not pay two more rays a face.
    for r in recs.values():
        more = r.pop("more", [])
        if r["blocked"] is None or r["cavity"] or not more:
            continue
        hits = [r["blocked"]] + [b for (q, m) in more
                                 if (b := _release_blocked(inter, q, tuple(c / (math.sqrt(sum(x * x for x in m)) or 1.0) for c in m), d, diag)[1]) is not None]
        r["blocked"] = min(hits) if len(hits) * 2 > len(more) + 1 else None
    if len(_RELEASE_CACHE) > 8:
        _RELEASE_CACHE.clear()
    _RELEASE_CACHE[key] = (wrapped, recs)
    return recs


def _compute_draft_analysis(wrapped, face_map, draw_dir=(0.0, 0.0, 1.0), inter=None, diag=1.0) -> dict:
    """
    Classify faces (planes and cylinders) by draft relative to the draw, for a TWO-HALF tool (`_release_table`).
    Undercut   → the part blocks the face's line of release toward the half it faces — and it is not the inside
                 of a hollow body (`cavityFaceCount`: no tool forms those). With no intersector no face is called
                 an undercut — measured or silent. It used to be "normal against the draw (angle > 90°)", which
                 called every wall and floor of the lower half an undercut: a two-half tool opens BOTH ways.
    Zero-draft → face nearly parallel to the draw (|90° - angle| < 1°).
    Adequate   → face has ≥ 1° draft toward the half it comes out of.
    End faces (normal within ~18° of the draw) have no draft; they count only when blocked.
    """
    dx, dy, dz = draw_dir
    d_mag = math.sqrt(dx*dx + dy*dy + dz*dz) or 1.0
    undercuts, zero_draft, adequate, cavity = 0, 0, 0, 0
    pos_drafts = []
    for r in _release_table(wrapped, face_map, diag, draw_dir, inter).values():
        if r["blocked"] is not None:
            if r["cavity"]:
                cavity += 1
            else:
                undercuts += 1
            continue
        nx, ny, nz = r["n"]
        cos_a = max(-1.0, min(1.0, (nx*dx + ny*dy + nz*dz) / d_mag))
        if abs(cos_a) > 0.95:
            continue
        draft = abs(90.0 - math.degrees(math.acos(cos_a)))
        if draft < 1.0:
            zero_draft += 1
        else:
            adequate += 1
            pos_drafts.append(round(draft, 2))
    return {
        "drawDirectionXYZ": list(draw_dir),
        "undercutFaceCount": undercuts,
        # Blocked along the draw but facing an enclosed cavity (inside skin of a hollow body): not counted above.
        "cavityFaceCount": cavity,
        "zeroDraftFaceCount": zero_draft,
        "adequateDraftFaceCount": adequate,
        "minPositiveDraftDeg": round(min(pos_drafts), 2) if pos_drafts else None,
        "maxPositiveDraftDeg": round(max(pos_drafts), 2) if pos_drafts else None,
        "analyzedFaceCount": undercuts + zero_draft + adequate,
    }


# ─── Machining setup count ────────────────────────────────────────────────────

def _compute_setup_count(faces, tol_deg: float = 22.0) -> dict:
    """
    Cluster face normals into distinct machining orientations.
    Anti-parallel normals (±N) are the same setup, so we use |dot| ≥ cos(tol).
    """
    from OCP.BRep import BRep_Tool
    from OCP.GeomLProp import GeomLProp_SLProps
    from OCP.BRepTools import BRepTools

    cos_tol = math.cos(math.radians(tol_deg))
    clusters: list[tuple[float, float, float, int]] = []   # (nx,ny,nz, count)
    cluster_ids: list[list[int]] = []                      # face ids (1-based, IndexedMap order) per cluster
    AXES = [(1,0,0,"+X"),(-1,0,0,"-X"),(0,1,0,"+Y"),(0,-1,0,"-Y"),(0,0,1,"+Z"),(0,0,-1,"-Z")]

    cap = 600  # sample cap for large models
    sample_faces = faces[:cap]

    for fi, face in enumerate(sample_faces):
        face_id = fi + 1   # `faces` is the IndexedMap enumeration, so position + 1 == map index
        try:
            surf = BRep_Tool.Surface_s(face.wrapped)
            from OCP.GeomAdaptor import GeomAdaptor_Surface
            umin, umax, vmin, vmax = BRepTools.UVBounds_s(face.wrapped)
            props = GeomLProp_SLProps(surf, (umin+umax)/2, (vmin+vmax)/2, 1, 1e-7)
            if not props.IsNormalDefined():
                continue
            N = props.Normal()
            nx, ny, nz = N.X(), N.Y(), N.Z()
            mag = math.sqrt(nx*nx+ny*ny+nz*nz)
            if mag < 1e-10:
                continue
            nx, ny, nz = nx/mag, ny/mag, nz/mag

            matched = False
            for i, (cx, cy, cz, cnt) in enumerate(clusters):
                if abs(nx*cx + ny*cy + nz*cz) >= cos_tol:
                    clusters[i] = (cx, cy, cz, cnt + 1)
                    cluster_ids[i].append(face_id)
                    matched = True
                    break
            if not matched:
                clusters.append((nx, ny, nz, 1))
                cluster_ids.append([face_id])
        except Exception:
            continue

    # Snap each cluster to nearest principal axis for label
    directions = []
    order = sorted(range(len(clusters)), key=lambda i: -clusters[i][3])
    for i in order:
        cx, cy, cz, cnt = clusters[i]
        best_label, best_dot = "+Z", -1.0
        for ax, ay, az, label in AXES:
            d = abs(cx*ax + cy*ay + cz*az)
            if d > best_dot:
                best_dot, best_label = d, label
        directions.append({"directionLabel": best_label, "faceCount": cnt, "faceIds": cluster_ids[i]})

    # Deduplicate labels (merge face ids; keep the merged count)
    seen: dict[str, dict] = {}
    for d in directions:
        lbl = d["directionLabel"]
        if lbl not in seen:
            seen[lbl] = dict(d)
        else:
            seen[lbl]["faceCount"] += d["faceCount"]
            seen[lbl]["faceIds"] = seen[lbl]["faceIds"] + d["faceIds"]

    unique_dirs = sorted(seen.values(), key=lambda x: -x["faceCount"])

    return {
        "estimatedSetupCount": len(unique_dirs),
        "principalDirections": unique_dirs[:6],
    }


# ─── Planar face area ─────────────────────────────────────────────────────────

def _compute_planar_face_area(faces) -> float:
    from OCP.BRepGProp import BRepGProp
    from OCP.GProp import GProp_GProps
    total = 0.0
    props = GProp_GProps()
    for face in faces:
        if face.geomType() != "PLANE":
            continue
        try:
            BRepGProp.SurfaceProperties_s(face.wrapped, props)
            total += abs(props.Mass())
        except Exception:
            pass
    return total


def _face_area_by_type(faces) -> dict:
    """Surface area per B-rep face type, mm² — PLANE, CYLINDER, TORUS, BSPLINE…

    The machining time model finishes each kind of surface at its own rate: a
    flat at a face/wall pass, a free-form at a ball-nose surfacing step-over. A
    face COUNT cannot tell a 2 mm fillet from a 200 cm² sculpted wall, so the
    area is measured. Pure OCP.
    """
    from OCP.BRep import BRep_Tool
    from OCP.BRepGProp import BRepGProp
    from OCP.GProp import GProp_GProps
    from OCP.GeomAdaptor import GeomAdaptor_Surface
    from OCP.GeomAbs import (
        GeomAbs_Plane, GeomAbs_Cylinder, GeomAbs_Cone,
        GeomAbs_Torus, GeomAbs_BSplineSurface, GeomAbs_BezierSurface,
        GeomAbs_SurfaceOfRevolution,
    )
    # The same names `_classify_faces` counts under, so area and count line up.
    NAMES = {
        GeomAbs_Plane: "PLANE", GeomAbs_Cylinder: "CYLINDER",
        GeomAbs_Cone: "CONE", GeomAbs_Torus: "TORUS",
        GeomAbs_BSplineSurface: "BSPLINE", GeomAbs_BezierSurface: "BEZIER",
        GeomAbs_SurfaceOfRevolution: "REVOLUTION",
    }
    out = {}
    for face in faces:
        try:
            props = GProp_GProps()
            BRepGProp.SurfaceProperties_s(face.wrapped, props)
            t = NAMES.get(GeomAdaptor_Surface(BRep_Tool.Surface_s(face.wrapped)).GetType(), "OTHER")
            out[t] = out.get(t, 0.0) + abs(props.Mass())
        except Exception:
            pass
    return {k: round(v, 0) for k, v in out.items()}


def _turning_signature(faces, total_area_mm2: float):
    """How much of the part is a lathe's work: the largest coaxial family of surfaces of revolution.

    A turned part is cylinders, cones, tori and spheres sharing ONE axis, plus the
    flat shoulders square to it. Its bounding box cannot say so: a shaft is long
    and thin, a disc is short and wide, and a square block has two equal sides
    too. So the axes are measured: every revolved face reports its axis line;
    faces whose lines coincide (parallel within 0.05°, offset < 0.5 mm) are one
    family. `fraction` = (that family's area + the planes square to its axis) ÷
    the whole surface. `maxDiaMm` is the largest diameter on that axis — the bar
    it is turned from, before stock. Pure OCP.
    """
    from OCP.BRep import BRep_Tool
    from OCP.BRepGProp import BRepGProp
    from OCP.GProp import GProp_GProps
    from OCP.GeomAdaptor import GeomAdaptor_Surface
    from OCP.GeomAbs import GeomAbs_Cylinder, GeomAbs_Cone, GeomAbs_Torus, GeomAbs_Sphere, GeomAbs_Plane
    from OCP.TopAbs import TopAbs_REVERSED
    if total_area_mm2 <= 0:
        return None
    revolved, planes = [], []
    for face in faces:
        try:
            ad = GeomAdaptor_Surface(BRep_Tool.Surface_s(face.wrapped))
            t = ad.GetType()
            props = GProp_GProps()
            BRepGProp.SurfaceProperties_s(face.wrapped, props)
            area = abs(props.Mass())
            if t == GeomAbs_Cylinder:
                ax, r = ad.Cylinder().Axis(), ad.Cylinder().Radius()
            elif t == GeomAbs_Cone:
                ax, r = ad.Cone().Axis(), ad.Cone().RefRadius()
            elif t == GeomAbs_Torus:
                ax, r = ad.Torus().Axis(), ad.Torus().MajorRadius() + ad.Torus().MinorRadius()
            elif t == GeomAbs_Sphere:
                planes.append(None)
                continue
            elif t == GeomAbs_Plane:
                n = ad.Plane().Axis().Direction()
                planes.append(((n.X(), n.Y(), n.Z()), area))
                continue
            else:
                continue
            o, d = ax.Location(), ax.Direction()
            # A cylinder / cone's surface normal points away from its axis; a FORWARD face keeps it, so the
            # material is inside — an external (turned) surface. A REVERSED one is a bore. Tori are fillets
            # and grooves either way; they count as external when forward.
            external = face.wrapped.Orientation() != TopAbs_REVERSED
            revolved.append(((o.X(), o.Y(), o.Z()), (d.X(), d.Y(), d.Z()), r, area, external))
        except Exception:
            pass
    if not revolved:
        return {"fraction": 0.0, "revolvedFraction": 0.0, "maxDiaMm": 0.0, "axis": None}

    def same_line(a, b):
        (o1, d1), (o2, d2) = a, b
        dot = abs(d1[0]*d2[0] + d1[1]*d2[1] + d1[2]*d2[2])
        if dot < 0.9999996:          # ~0.05°
            return False
        v = (o2[0]-o1[0], o2[1]-o1[1], o2[2]-o1[2])
        cx = (v[1]*d1[2]-v[2]*d1[1], v[2]*d1[0]-v[0]*d1[2], v[0]*d1[1]-v[1]*d1[0])
        return (cx[0]**2 + cx[1]**2 + cx[2]**2) ** 0.5 < 0.5

    families = []   # [line, area, max_r, external area, external max_r]
    for o, d, r, a, ext in revolved:
        for f in families:
            if same_line(f[0], (o, d)):
                f[1] += a
                f[2] = max(f[2], r)
                if ext:
                    f[3] += a
                    f[4] = max(f[4], r)
                break
        else:
            families.append([(o, d), a, r, a if ext else 0.0, r if ext else 0.0])
    best = max(families, key=lambda f: f[1])
    (o, d) = best[0]
    square = sum(a for pl in planes if pl is not None for (n, a) in [pl]
                 if abs(n[0]*d[0] + n[1]*d[1] + n[2]*d[2]) > 0.9999)
    return {
        "fraction": round(min(1.0, (best[1] + square) / total_area_mm2), 3),
        "revolvedFraction": round(min(1.0, best[1] / total_area_mm2), 3),
        "maxDiaMm": round(2 * best[2], 2),
        # The family's OUTSIDE surfaces (journals, tapers, shoulders' fillets) — what a lathe turns on a
        # near-net casting or forging; its bores are holes and are finish-bored separately.
        "externalAreaMm2": round(best[3], 1),
        "externalMaxDiaMm": round(2 * best[4], 2),
        "axis": [round(d[0], 4), round(d[1], 4), round(d[2], 4)],
    }


# ─── CNC cycle time estimate ──────────────────────────────────────────────────

def _estimate_cnc_cycle(
    planar_area_mm2: float,
    cyl_face_count: int,
    setup_count: int,
    feed_rate: float = 5000.0,       # mm²/min milling
    drill_min_per_feat: float = 0.5, # min per cylindrical feature
    setup_min_each: float = 15.0,    # min per fixture/datum change
) -> dict:
    mill_min = planar_area_mm2 / feed_rate
    drill_min = cyl_face_count * drill_min_per_feat
    setup_min = setup_count * setup_min_each
    total_min = setup_min + mill_min + drill_min
    return {
        "setupTimeMins": round(setup_min, 1),
        "planarMillingTimeMins": round(mill_min, 1),
        "drillBoreTimeMins": round(drill_min, 1),
        "estimatedTotalMins": round(total_min, 1),
        "estimatedTotalHrs": round(total_min / 60.0, 4),
        "assumedFeedRateMm2PerMin": feed_rate,
        "assumedDrillBoreMinPerFeature": drill_min_per_feat,
        "assumedSetupTimeMinsPerSetup": setup_min_each,
    }


# ─── Parametric tooling cost models ──────────────────────────────────────────

def _estimate_tooling_costs(faces_total, hole_count, undercut_count, free_form_count,
                             bbox, wall_stats, weights, fill_ratio) -> dict:
	"""
	Parametric tooling cost estimates for all main processes.
	Based on face count (geometry complexity proxy), part size, and feature counts.
	Accuracy: ±20-30% vs bracket lookups at ±30-40%.
	"""
	bbox_vol_cm3 = (bbox["xMm"] * bbox["yMm"] * bbox["zMm"]) / 1000
	al_kg  = weights["aluminiumKg"]
	pl_kg  = weights["plasticKg"]
	wall_m = wall_stats["meanMm"] if wall_stats else 2.5

	# ── HPDC die ──────────────────────────────────────────────────────────────
	hpdc_complexity = faces_total * 150 + hole_count * 400 + undercut_count * 10_000
	hpdc_size_mult  = max(1.0, (bbox_vol_cm3 / 1000) ** 0.45)
	hpdc_floor      = 40_000 if al_kg < 0.5 else (80_000 if al_kg < 2.0 else 120_000)
	hpdc_cost       = max(hpdc_floor, min(300_000,
	                    round(hpdc_complexity * hpdc_size_mult / 5000) * 5000))

	# ── Gravity die mould ─────────────────────────────────────────────────────
	grav_complexity = faces_total * 80 + hole_count * 200 + undercut_count * 6_000
	grav_size_mult  = max(1.0, (bbox_vol_cm3 / 500) ** 0.40)
	grav_floor      = 8_000 if al_kg < 0.5 else (15_000 if al_kg < 2.0 else 30_000)
	grav_cost       = max(grav_floor, min(80_000,
	                    round(grav_complexity * grav_size_mult / 2000) * 2000))

	# ── Sand pattern ──────────────────────────────────────────────────────────
	sand_complexity = faces_total * 30 + bbox_vol_cm3 * 1.0
	if free_form_count > faces_total * 0.2:
	    sand_complexity *= 1.4
	sand_cost       = max(1_500, min(50_000, round((2_000 + sand_complexity) / 500) * 500))

	# ── Injection mould (1 cavity) ────────────────────────────────────────────
	im_complexity   = faces_total * 120 + hole_count * 300 + undercut_count * 8_000
	im_size_mult    = max(1.0, (bbox_vol_cm3 / 500) ** 0.45)
	im_thin_mult    = 1.25 if wall_m < 1.5 else 1.0
	im_floor        = 15_000 if pl_kg < 0.05 else (30_000 if pl_kg < 0.20 else 55_000)
	im_cost         = max(im_floor, min(200_000,
	                    round(im_complexity * im_size_mult * im_thin_mult / 2000) * 2000))

	# ── Forging die ───────────────────────────────────────────────────────────
	forge_complexity= faces_total * 100 + hole_count * 200
	forge_fill_mult = 1.0 + max(0, fill_ratio - 0.5) * 0.4
	forge_size_mult = max(1.0, (bbox_vol_cm3 / 300) ** 0.45)
	forge_cost      = max(15_000, min(180_000,
	                    round(forge_complexity * forge_size_mult * forge_fill_mult / 2000) * 2000))

	# ── Progressive die (sheet metal) ────────────────────────────────────────
	dims_sorted     = sorted([bbox["xMm"], bbox["yMm"], bbox["zMm"]], reverse=True)
	blank_area_mm2  = dims_sorted[0] * 1.05 * dims_sorted[1] * 1.05
	prog_cost       = max(15_000, min(250_000,
	                    round((20_000 + blank_area_mm2 * 0.06 + hole_count * 400) / 5000) * 5000))

	return {
	    "hpdcDieCostGBP":       hpdc_cost,
	    "gravityMouldCostGBP":  grav_cost,
	    "sandPatternCostGBP":   sand_cost,
	    "imMouldCostGBP":       im_cost,
	    "forgeDieCostGBP":      forge_cost,
	    "progressiveDieCostGBP": prog_cost,
	}


def _compute_manufacturability_score(face_counts, hole_count, undercut_count,
                                      wall_stats, fill_ratio, free_form_count) -> int:
	"""
	Geometry-computed manufacturability score (0–100, 100 = easiest).
	Replaces AI-guessed value with deterministic geometric computation.
	"""
	total_faces = max(1, sum(face_counts.values()))
	score = 100

	# Undercuts — most severe: each needs a side action (casting) or 5-axis (machining)
	score -= min(40, undercut_count * 8)

	# Excessive holes increase drilling complexity
	score -= min(12, max(0, (hole_count - 10)) * 1)

	# Free-form face percentage (hard to tool, hard to inspect)
	free_form_pct = free_form_count / total_faces
	score -= min(15, round(free_form_pct * 25))

	# Wall thickness uniformity (non-uniform → warpage, porosity, sink marks)
	if wall_stats:
	    cv = wall_stats["stdDevMm"] / max(0.1, wall_stats["meanMm"])
	    if cv > 0.5:  score -= 8
	    if cv > 1.0:  score -= 8
	    if wall_stats["minMm"] < 1.0: score -= 10   # risk of cold shut / short shot

	# Near-solid parts harder to demould and eject
	if fill_ratio > 0.80: score -= 5

	return max(0, min(100, round(score)))


def _estimate_sand_cycle_hr(volume_cm3: float, iron: bool = False) -> float:
	"""Sand casting cycle time from part mass (pour + solidify + knockout)."""
	density = 7.15 if iron else 2.70
	mass_kg = volume_cm3 * density / 1000
	return round(min(8.0, 0.15 + mass_kg * 0.04), 4)


def _estimate_forge_strokes(fill_ratio: float, free_form_pct: float,
                              faces_total: int, hole_count: int) -> int:
	"""Estimate closed-die forging blows from part geometry complexity."""
	strokes = 4
	if fill_ratio > 0.70:      strokes += 2
	if free_form_pct > 0.15:   strokes += 2
	if faces_total > 60:       strokes += 1
	if hole_count > 5:         strokes += 1
	return min(12, strokes)


def _estimate_invest_consumables(sa_cm2: float) -> tuple:
	"""Estimate investment casting wax and ceramic shell cost from surface area."""
	wax_cost   = round(max(0.30, sa_cm2 * 0.015), 2)   # £/part
	shell_cost = round(max(0.80, sa_cm2 * 0.045), 2)   # £/part
	return wax_cost, shell_cost


def _detect_assembly(filepath: str):
	"""Return warning string if STEP file appears to be a multi-body assembly."""
	try:
	    import re
	    with open(filepath, "r", errors="ignore") as fh:
	        chunk = fh.read(300_000)
	    products = re.findall(r"=\s*PRODUCT\s*\(", chunk, re.IGNORECASE)
	    if len(products) > 1:
	        return (f"Assembly detected: {len(products)} PRODUCT entities. "
	                "Geometry engine merges all bodies — costs reflect the merged solid. "
	                "For per-component cost breakdown, upload parts individually.")
	    return None
	except Exception:
	    return None


def _validate_bbox(x_sz: float, y_sz: float, z_sz: float):
	"""Return warning string if bounding box suggests wrong file units."""
	for label, val in [("X", x_sz), ("Y", y_sz), ("Z", z_sz)]:
	    if val < 0.5:
	        return (f"Dimension {label}={val:.3f} looks too small — "
	                "file may be in metres not millimetres. All dimensions multiplied by 1000 "
	                "would give a more realistic part.")
	    if val > 15_000:
	        return (f"Dimension {label}={val:.0f}mm exceeds 15m — "
	                "check STEP file units or this may be a large assembly.")
	return None


# ─── Main analysis ────────────────────────────────────────────────────────────

class _FaceShim:
    """Minimal stand-in for cadquery.Face — only .wrapped and .geomType() are used."""
    __slots__ = ("wrapped",)
    def __init__(self, f): self.wrapped = f
    def geomType(self):
        from OCP.BRepAdaptor import BRepAdaptor_Surface
        from OCP.GeomAbs import GeomAbs_SurfaceType
        try:
            t = BRepAdaptor_Surface(self.wrapped).GetType()
        except Exception:
            return "OTHER"
        return "PLANE" if t == GeomAbs_SurfaceType.GeomAbs_Plane else str(t).split(".")[-1]


class _EdgeShim:
    """Minimal stand-in for cadquery.Edge — only .wrapped is used."""
    __slots__ = ("wrapped",)
    def __init__(self, e): self.wrapped = e


# ─── Sheet-metal fastening-hardware detection (weld nuts / studs) ─────────────

# Metric thread sizes: (name, tapping-drill bore mm, nominal OD mm). A modelled
# weld nut usually carries either the tapping bore or the nominal clearance as
# its inner cylinder; a weld stud's OUTER cylinder is the nominal dia.
_THREAD_SIZES = [
    ("M4", 3.3, 4.0), ("M5", 4.2, 5.0), ("M6", 5.0, 6.0),
    ("M8", 6.8, 8.0), ("M10", 8.5, 10.0), ("M12", 10.2, 12.0),
]
_THREAD_TOL_MM = 0.35


def _match_thread(dia_mm, use_nominal=False):
	for name, bore, nominal in _THREAD_SIZES:
	    ref = nominal if use_nominal else bore
	    if abs(dia_mm - ref) <= _THREAD_TOL_MM:
	        return name
	return None


def _detect_sheet_hardware(wrapped):
	"""Detect weld-nut / weld-stud hardware bodies in a multi-solid sheet model.

	Deterministic geometry only: a candidate is a SMALL solid (≤30 mm, ≤8 cm³)
	distinct from the largest solid (the sheet). A nut has a near-full coaxial
	bore whose diameter matches a metric tapping/clearance table and 4 (square)
	or 6 (hex) side flats perpendicular to the bore; a stud is bore-less with a
	nominal-diameter outer cylinder ≥1.5× longer than wide. Each detection is
	cross-checked for a coaxial hole in the sheet solid (onSheetHole). Single
	merged solids are declared not-separable — an honest miss, never a guess.
	"""
	from OCP.TopExp import TopExp, TopExp_Explorer
	from OCP.TopTools import TopTools_IndexedMapOfShape
	from OCP.TopAbs import TopAbs_SOLID, TopAbs_FACE
	from OCP.TopoDS import TopoDS
	from OCP.BRepAdaptor import BRepAdaptor_Surface
	from OCP.GeomAbs import GeomAbs_SurfaceType
	from OCP.BRepGProp import BRepGProp
	from OCP.GProp import GProp_GProps
	from OCP.Bnd import Bnd_Box
	from OCP.BRepBndLib import BRepBndLib

	m = TopTools_IndexedMapOfShape()
	TopExp.MapShapes_s(wrapped, TopAbs_SOLID, m)
	n_solids = m.Extent()
	if n_solids < 2:
	    return {"available": False,
	            "note": "single merged solid — hardware bodies not separable; add hardware manually"}
	if n_solids > 200:
	    return {"available": False, "note": f"{n_solids} solids — too many to classify"}

	def solid_faces(solid):
	    out = []
	    exp = TopExp_Explorer(solid, TopAbs_FACE)
	    while exp.More():
	        try:
	            f = TopoDS.Face_s(exp.Current())
	            out.append((f, BRepAdaptor_Surface(f)))
	        except Exception:
	            pass
	        exp.Next()
	    return out

	def cylinders(faces):
	    """Full-arc cylinders grouped by (radius, axis), with concavity:
	    hole=True is a bore (concave), hole=False a shaft (convex) — same
	    orientation-XOR-handedness test as the main feature table."""
	    from OCP.TopAbs import TopAbs_Orientation
	    groups = {}
	    for f, ad in faces:
	        try:
	            if ad.GetType() != GeomAbs_SurfaceType.GeomAbs_Cylinder:
	                continue
	            cyl = ad.Cylinder()
	            r = cyl.Radius()
	            ax = cyl.Axis(); p = ax.Location(); d = ax.Direction()
	            hole = (f.Orientation() == TopAbs_Orientation.TopAbs_REVERSED) != (not cyl.Position().Direct())
	            key = (round(r, 2), round(p.X(), 1), round(p.Y(), 1), round(p.Z(), 1),
	                   round(abs(d.X()), 2), round(abs(d.Y()), 2), round(abs(d.Z()), 2), hole)
	            arc = abs(ad.LastUParameter() - ad.FirstUParameter())
	            vspan = abs(ad.LastVParameter() - ad.FirstVParameter())
	            g = groups.setdefault(key, {"r": r, "arc": 0.0, "v": 0.0, "p": p, "d": d, "hole": hole})
	            g["arc"] += arc
	            g["v"] = max(g["v"], vspan)
	        except Exception:
	            continue
	    return [g for g in groups.values() if g["arc"] >= 5.2]   # ≥ ~300° = real bore/shaft

	sols = []
	for i in range(1, n_solids + 1):
	    s = m.FindKey(i)
	    gp = GProp_GProps()
	    try:
	        BRepGProp.VolumeProperties_s(s, gp)
	    except Exception:
	        continue
	    vol = abs(gp.Mass())
	    bb = Bnd_Box(); BRepBndLib.Add_s(s, bb)
	    try:
	        x0, y0, z0, x1, y1, z1 = bb.Get()
	        max_dim = max(x1 - x0, y1 - y0, z1 - z0)
	    except Exception:
	        continue
	    sols.append({"shape": s, "vol": vol, "maxDim": max_dim})
	if not sols:
	    return {"available": False, "note": "no measurable solids"}

	sheet = max(sols, key=lambda s: s["vol"])
	sheet_cyls = cylinders(solid_faces(sheet["shape"]))

	def coaxial_sheet_hole(p, d):
	    for g in sheet_cyls:
	        gd = g["d"]
	        dot = abs(d.X() * gd.X() + d.Y() * gd.Y() + d.Z() * gd.Z())
	        if dot < 0.99:
	            continue
	        # lateral distance between the two axis points, perpendicular to d
	        vx, vy, vz = g["p"].X() - p.X(), g["p"].Y() - p.Y(), g["p"].Z() - p.Z()
	        along = vx * d.X() + vy * d.Y() + vz * d.Z()
	        lat2 = (vx * vx + vy * vy + vz * vz) - along * along
	        if lat2 <= 1.5 ** 2:
	            return True
	    return False

	found = {}
	hw_volume_mm3 = 0.0
	for s in sols:
	    if s is sheet or s["maxDim"] > 30 or s["vol"] > 8000 or s["vol"] <= 1:
	        continue
	    faces = solid_faces(s["shape"])
	    cyls = cylinders(faces)
	    if not cyls:
	        continue

	    # planar side flats (normal ⊥ candidate bore axis) → hex vs square
	    planes = []
	    for _f, ad in faces:
	        try:
	            if ad.GetType() == GeomAbs_SurfaceType.GeomAbs_Plane:
	                planes.append(ad.Plane().Axis().Direction())
	        except Exception:
	            continue

	    bores  = [g for g in cyls if g["hole"]]
	    shafts = [g for g in cyls if not g["hole"]]
	    bore = min(bores, key=lambda g: g["r"]) if bores else None
	    thread = (_match_thread(bore["r"] * 2) or _match_thread(bore["r"] * 2, use_nominal=True)) if bore else None
	    row = None
	    if bore and thread and bore["v"] >= 1.0:
	        d = bore["d"]
	        side_flats = sum(
	            1 for n in planes
	            if abs(n.X() * d.X() + n.Y() * d.Y() + n.Z() * d.Z()) < 0.25
	        )
	        kind = ("weld_nut_square" if 3 <= side_flats <= 4
	                else "weld_nut_hex" if side_flats >= 5
	                else "weld_nut_hex")   # round/flanged weld nut — commonest default
	        row = {
	            "type": kind, "threadSize": thread,
	            "boreDiaMm": round(bore["r"] * 2, 2),
	            "heightMm": round(bore["v"], 1),
	            "sideFlats": side_flats,
	            "onSheetHole": coaxial_sheet_hole(bore["p"], bore["d"]),
	        }
	    elif shafts:
	        # stud: no thread-matching bore; convex shaft at nominal dia, slender
	        outer = max(shafts, key=lambda g: g["r"])
	        stud_thread = _match_thread(outer["r"] * 2, use_nominal=True)
	        if stud_thread and outer["v"] >= outer["r"] * 2 * 1.5:
	            row = {
	                "type": "weld_stud", "threadSize": stud_thread,
	                "boreDiaMm": round(outer["r"] * 2, 2),
	                "heightMm": round(outer["v"], 1),
	                "sideFlats": 0,
	                "onSheetHole": coaxial_sheet_hole(outer["p"], outer["d"]),
	            }
	    if row is None:
	        continue
	    hw_volume_mm3 += s["vol"]
	    key = (row["type"], row["threadSize"])
	    if key in found:
	        found[key]["count"] += 1
	        found[key]["onSheetHole"] = found[key]["onSheetHole"] and row["onSheetHole"]
	    else:
	        found[key] = {**row, "count": 1}

	rows = sorted(found.values(), key=lambda r: -r["count"])
	if not rows:
	    return {"available": True, "detected": [], "solidCount": n_solids,
	            "note": "multi-solid model but no weld-nut/stud-like bodies matched"}
	return {
	    "available": True,
	    "detected": rows,
	    "solidCount": n_solids,
	    "totalVolumeCm3": round(hw_volume_mm3 / 1000, 3),
	    "estSteelMassKg": round(hw_volume_mm3 * 7.85e-6, 4),
	    "note": ("purchased hardware detected from geometry — piece prices default from the "
	             "catalogue; subtract estSteelMassKg from the blank net weight (hardware is "
	             "bought, not blanked)"),
	}


class _ShapeShim:
    """Pure-OCP replacement for the cadquery Shape wrapper. Drops the cadquery
    dependency entirely (only the `cadquery-ocp` wheel is needed): Faces()/Edges()
    enumerate UNIQUE sub-shapes via an indexed map, matching cadquery semantics."""
    def __init__(self, wrapped): self.wrapped = wrapped
    def _unique(self, kind, shim, caster):
        from OCP.TopTools import TopTools_IndexedMapOfShape
        from OCP.TopExp import TopExp
        m = TopTools_IndexedMapOfShape()
        TopExp.MapShapes_s(self.wrapped, kind, m)
        return [shim(caster(m.FindKey(i))) for i in range(1, m.Extent() + 1)]
    def Faces(self):
        from OCP.TopAbs import TopAbs_FACE
        from OCP.TopoDS import TopoDS
        return self._unique(TopAbs_FACE, _FaceShim, TopoDS.Face_s)
    def Edges(self):
        from OCP.TopAbs import TopAbs_EDGE
        from OCP.TopoDS import TopoDS
        return self._unique(TopAbs_EDGE, _EdgeShim, TopoDS.Edge_s)


def _try_detect_hardware(wrapped):
	"""Hardware detection must never break the analysis pipeline."""
	try:
	    return _detect_sheet_hardware(wrapped)
	except Exception as e:
	    return {"available": False, "note": f"detection error: {str(e)[:120]}"}


# ─── Manufacturing feature substrate (geometric DFM) ─────────────────────────

def _extract_manufacturing_features(wrapped, diag: float, draw_dir=(0.0, 0.0, 1.0),
                                    fill_ratio=None, max_faces: int = 4000) -> dict:
    """Per-feature manufacturing substrate — the unit geometric DFM analyses.

    The rest of this kernel reports AGGREGATES: `undercutFaceCount: 7` tells you
    seven faces are bad but not WHICH, so no downstream finding can be specific
    or clickable. Every commercial DFM tool (aPriori's Geometric Cost Drivers,
    HCL DFMPro's feature recognition) makes the feature the unit of analysis
    instead, which is what this produces.

    Each record carries `faceIds` — 1-based indices into the same
    TopTools_IndexedMapOfShape the viewer's `triFace` sidecar uses — so a DFM
    finding can highlight the exact faces that triggered it.

    Everything here is MEASURED. Where a quantity cannot be measured reliably
    the key is absent rather than defaulted, because a fabricated input produces
    a fabricated warning, and a wrong finding costs more trust than a missing one.
    """
    out = {"available": False, "features": [], "note": ""}
    try:
        from OCP.TopTools import TopTools_IndexedMapOfShape, TopTools_IndexedDataMapOfShapeListOfShape
        from OCP.TopExp import TopExp
        from OCP.TopAbs import TopAbs_FACE, TopAbs_EDGE, TopAbs_Orientation
        from OCP.TopoDS import TopoDS
        from OCP.BRepAdaptor import BRepAdaptor_Surface
        from OCP.GeomAbs import GeomAbs_SurfaceType
        from OCP.BRepGProp import BRepGProp
        from OCP.GProp import GProp_GProps
    except ImportError as e:
        out["note"] = f"OCP unavailable: {e}"
        return out

    face_map = TopTools_IndexedMapOfShape()
    TopExp.MapShapes_s(wrapped, TopAbs_FACE, face_map)
    n = face_map.Extent()
    if n == 0:
        out["note"] = "no faces"
        return out
    if n > max_faces:
        out["note"] = f"{n} faces exceeds the {max_faces} cap — feature extraction skipped"
        return out

    thickness = _per_face_thickness(wrapped, face_map, diag, max_faces)

    # Single-ray thickness on a SOLID part measures the part's extent, not a
    # wall: on a 40x20x10 block it returns 40, 20 and 10 from the three face
    # pairs, and a naive "section change" rule then reports a 4x step that does
    # not exist. Wall-derived findings are therefore gated on the part actually
    # being thin-walled. Where it is not, the measurements are still emitted
    # (they are true distances) but `wallAnalysisValid` is False and no rule may
    # read sectionRatio or hotSpots. A wrong finding costs more trust than a
    # missing one.
    wall_valid = bool(fill_ratio is not None and fill_ratio < 0.55)
    wall_note = ("" if wall_valid else
                 f"solid-bodied part (fill ratio {fill_ratio if fill_ratio is not None else 'unknown'}) — "
                 "single-ray thickness measures part extent, not wall; section-change "
                 "and hot-spot rules suppressed")

    # ── Pass 1: per-face record ───────────────────────────────────────────────
    dx, dy, dz = draw_dir
    d_mag = math.sqrt(dx * dx + dy * dy + dz * dz) or 1.0
    # The analysis already built this draw's table for the draft count; the cache hands it back (same shape object).
    release = _release_table(wrapped, face_map, diag, draw_dir, "lazy")
    props = GProp_GProps()
    F = {}                       # 1-based face id -> record
    for idx in range(1, n + 1):
        try:
            face = TopoDS.Face_s(face_map.FindKey(idx))
            ad = BRepAdaptor_Surface(face)
            st = ad.GetType()
            BRepGProp.SurfaceProperties_s(face, props)
            area = abs(props.Mass())
            c = props.CentreOfMass()
            rec = {
                "id": idx,
                "areaMm2": round(area, 3),
                "centroid": [round(c.X(), 3), round(c.Y(), 3), round(c.Z(), 3)],
            }
            if idx in thickness:
                rec["thicknessMm"] = thickness[idx]

            if st == GeomAbs_SurfaceType.GeomAbs_Plane:
                rec["type"] = "plane"
                nrm = ad.Plane().Axis().Direction()
                nx, ny, nz = nrm.X(), nrm.Y(), nrm.Z()
                if face.Orientation() == TopAbs_Orientation.TopAbs_REVERSED:
                    nx, ny, nz = -nx, -ny, -nz
                rec["normal"] = [round(nx, 5), round(ny, 5), round(nz, 5)]
                rel = release.get(idx)
                # Draft measured PER FACE, and attributed — the aggregate
                # `_compute_draft_analysis` counts the same thing and throws the
                # identity away, which is why no finding could ever name a face.
                #
                # Draft is only DEFINED on wall-like faces — those roughly
                # parallel to the draw. A top or bottom face is perpendicular to
                # the draw and has no draft; classifying it produces nonsense.
                # `_compute_draft_analysis` does exactly that today: its test is
                # `angle > 90.5 -> undercut`, and a flat BOTTOM face has an
                # angle of 180°, so every bottom face in this tool has been
                # counted as an undercut. Faces that are not walls are marked
                # `not_applicable` here rather than given a fictitious angle.
                cos_a = max(-1.0, min(1.0, (nx * dx + ny * dy + nz * dz) / d_mag))
                ang = math.degrees(math.acos(cos_a))
                rec["angleToDrawDeg"] = round(ang, 2)
                # Two-half tool: the face comes out of the half it faces; an undercut is a face whose line of
                # release is blocked by the part (`_release_blocked`) — not merely one facing the other half. END
                # faces are tested too: the top of a snap window through a side wall faces the draw, has no draft to
                # judge, and is blocked by the window's bottom — the side action.
                half, blocked = (rel["half"], rel["blocked"]) if rel is not None else (0, None)
                if half:
                    rec["releaseHalf"] = half
                if blocked is not None:
                    rec["blockedAtMm"] = blocked
                    if rel["cavity"]:
                        # the inside skin of a hollow body: blocked, but no tool forms it — not an undercut
                        rec["facesCavity"] = True
                        blocked = None
                if abs(cos_a) > 0.95:            # normal along ±draw → end face: no draft
                    rec["draftClass"] = "undercut" if blocked is not None else "not_applicable"
                else:
                    rec["draftDeg"] = round(abs(90.0 - ang), 2)
                    rec["draftClass"] = ("undercut" if blocked is not None
                                         else "zero_draft" if abs(90.0 - ang) < 1.0
                                         else "drafted")
                if rec.get("facesCavity"):       # no tool steel touches it: no draft to judge either
                    rec["draftClass"] = "not_applicable"
                    rec.pop("draftDeg", None)
            elif st == GeomAbs_SurfaceType.GeomAbs_Cylinder:
                rec["type"] = "cylinder"
                cyl = ad.Cylinder()
                rec["radiusMm"] = round(cyl.Radius(), 4)
                ax = cyl.Axis().Direction()
                rec["axis"] = [round(ax.X(), 5), round(ax.Y(), 5), round(ax.Z(), 5)]
                loc = cyl.Axis().Location()
                rec["axisPt"] = [loc.X(), loc.Y(), loc.Z()]
                rec["axisDir"] = [ax.X(), ax.Y(), ax.Z()]
                rec["v"] = [min(ad.FirstVParameter(), ad.LastVParameter()), max(ad.FirstVParameter(), ad.LastVParameter())]
                rec["arc"] = abs(ad.LastUParameter() - ad.FirstUParameter())
                # Concave (material outside — a hole, an internal corner) v convex (a boss, an external
                # round). Face orientation ALONE is not it: a cylinder parametrised left-handed flips the
                # sense, so it is the face orientation against the parametrisation — the same test the
                # costing feature table and the gear metrology use. (Orientation alone mislabelled holes.)
                rec["concave"] = (face.Orientation() == TopAbs_Orientation.TopAbs_REVERSED) != (not cyl.Position().Direct())
                r = cyl.Radius()
                if r > 1e-6:
                    # Swept length from area: A = 2*pi*r*L for a full cylinder.
                    rec["sweptLenMm"] = round(area / (2 * math.pi * r), 3)
            elif st == GeomAbs_SurfaceType.GeomAbs_Cone:
                rec["type"] = "cone"
                rec["halfAngleDeg"] = round(math.degrees(abs(ad.Cone().SemiAngle())), 3)
            elif st == GeomAbs_SurfaceType.GeomAbs_Sphere:
                rec["type"] = "sphere"
                rec["radiusMm"] = round(ad.Sphere().Radius(), 4)
            elif st == GeomAbs_SurfaceType.GeomAbs_Torus:
                rec["type"] = "torus"
                rec["radiusMm"] = round(ad.Torus().MinorRadius(), 4)
            else:
                rec["type"] = "freeform"
            F[idx] = rec
        except Exception:
            continue

    # ── Pass 2: adjacency (which faces share an edge) ─────────────────────────
    # Required for every relational rule — boss-to-wall, rib-to-base-wall,
    # fillet-at-junction, section-change across a transition.
    adj = {i: set() for i in F}
    try:
        emap = TopTools_IndexedDataMapOfShapeListOfShape()
        TopExp.MapShapesAndAncestors_s(wrapped, TopAbs_EDGE, TopAbs_FACE, emap)
        for ei in range(1, emap.Extent() + 1):
            ids = []
            it = emap.FindFromIndex(ei)
            for shp in it:
                fi = face_map.FindIndex(shp)
                if fi > 0:
                    ids.append(fi)
            for a in ids:
                for b in ids:
                    if a != b and a in adj:
                        adj[a].add(b)
    except Exception:
        pass

    # ── Undercut regions: blocked faces that touch (directly, or across one blend) are ONE undercut — one slide,
    # lifter or core — not one per face. Pricing a slide per face priced a five-face snap-fit pocket as five slides.
    uc = [i for i, r in F.items() if r.get("draftClass") == "undercut"]
    parent = {i: i for i in uc}

    def _find(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a

    def _union(a, b):
        ra, rb = _find(a), _find(b)
        if ra != rb:
            parent[max(ra, rb)] = min(ra, rb)
    ucs = set(uc)

    def _side_wall(j):
        # A plane parallel to the draw: the face a slide pulls out through — every undercut it carries goes with
        # that ONE slide (the windows in one wall of a cover are one side action, along the wall's normal).
        r = F.get(j, {})
        nrm = r.get("normal")
        return r.get("type") == "plane" and nrm is not None and abs(nrm[0] * dx + nrm[1] * dy + nrm[2] * dz) / d_mag < 0.1
    def _blend(j):
        # A blend between faces — a torus, or a small-radius cylinder — joins the undercuts it runs between. A large
        # curved SKIN (a round cup's wall) touches every window cut in it and is not one slide's worth of geometry.
        r = F.get(j, {})
        return r.get("type") == "torus" or (r.get("type") == "cylinder" and (r.get("radiusMm") or 1e9) <= BLEND_MAX_RADIUS_MM)
    for i in uc:
        for j in adj.get(i, ()):
            if j in ucs:
                _union(i, j)
            elif _blend(j) or _side_wall(j):   # across a blend or a side wall
                for k in adj.get(j, ()):
                    if k in ucs and k != i:
                        _union(i, k)
    for i in uc:
        F[i]["undercutRegion"] = _find(i)

    # ── Pass 3: assemble features ─────────────────────────────────────────────
    feats = []
    used_cyl = set()

    def _thk(i):
        return F.get(i, {}).get("thicknessMm")

    # Cylinders → physical features: the SAME recognition the costing feature table uses (_cylinder_features).
    # ≥ ~300° of a turn is a hole or a boss; less is a partial cylinder — concave: an internal corner radius
    # (the end mill's radius), convex: an external round.
    for g in _cylinder_features(wrapped, face_map, diag):
        ids = g["faceIds"]
        if g["full"]:
            dia = round(g["dia"], 3)
            rec = {
                "id": ("H" if g["concave"] else "B") + str(ids[0]),
                "kind": "hole" if g["concave"] else "boss",
                "faceIds": ids, "diaMm": dia, "depthMm": round(g["span"], 3), "areaMm2": round(g["area"], 3),
                "positionMm": [round(c, 3) for c in g["mid"]], "axis": [round(c, 5) for c in g["axis"]],
            }
            if dia > 0:
                rec["ldRatio"] = round(g["span"] / dia, 3)
            if g["concave"] and None not in g["breakout"]:
                # openEnds: through (2) / blind (1) — breakout. openDirs: where a tool can come in — access.
                rec["openEnds"] = int(bool(g["breakout"][0])) + int(bool(g["breakout"][1]))
            if g["concave"] and None not in g["ends"]:
                rec["openDirs"] = g["openDirs"]
            nbt = [t for j in ids for k in adj.get(j, ()) if (t := _thk(k)) is not None]
            if nbt:
                rec["neighbourWallMm"] = round(min(nbt), 3)
                if not g["concave"] and min(nbt) > 0:
                    # Boss wall ratio drives sink marks on mouldings.
                    rec["bossToWallRatio"] = round(dia / min(nbt), 3)
            feats.append(rec)
        else:
            nb = [j for k in ids for j in adj.get(k, ()) if F.get(j, {}).get("type") == "plane"]
            rec = {
                "id": f"FIL{ids[0]}", "kind": "fillet", "faceIds": ids, "radiusMm": round(g["r"], 4),
                "depthMm": round(g["span"], 3), "areaMm2": round(g["area"], 3),
                "positionMm": [round(c, 3) for c in g["mid"]], "axis": [round(c, 5) for c in g["axis"]],
                "concave": g["concave"], "sweepDeg": round(min(g["coverage"], 1.0) * 360.0, 1),
                "adjacentFaceIds": sorted(set(nb))[:6],
            }
            # An internal corner an end mill cuts along its axis: clear along the axis at one end. The cutter is
            # at most Ø2R and cuts the corner's full height — `toolReachMm` is that height (the cavity depth the
            # corner-radius guidance is written against). A blend closed at both ends (a floor fillet between
            # walls) is side-milled with a bull-nose: no reach, and no cutter-radius rule applies to it.
            if g["concave"] and any(g["ends"]):
                rec["toolReachMm"] = round(g["span"], 3)
                rec["openDirs"] = g["openDirs"]
            feats.append(rec)

    # Walls / ribs / planar faces, each carrying measured local thickness and
    # draft, plus the worst section-change across any adjacent face.
    for i, r in F.items():
        if r.get("type") != "plane":
            continue
        t = r.get("thicknessMm")
        rec = {
            "id": f"P{i}", "kind": "planar_face", "faceIds": [i],
            "areaMm2": r["areaMm2"], "positionMm": r["centroid"],
        }
        if r.get("normal"):
            rec["axis"] = r["normal"]   # the face's material-outward normal
        if t is not None:
            rec["thicknessMm"] = t
        # Carry the class even when draft is not applicable, so a rule can tell
        # "this face is an end face, draft does not apply" apart from "draft was
        # never measured". They are different, and only one of them is a gap.
        if "draftClass" in r:
            rec["draftClass"] = r["draftClass"]
        if "draftDeg" in r:
            rec["draftDeg"] = r["draftDeg"]
        for k in ("releaseHalf", "blockedAtMm", "undercutRegion", "facesCavity"):
            if k in r:
                rec[k] = r[k]
        # Section change: the ratio to the thinnest adjacent measured section.
        # A step change is where castings tear and mouldings sink.
        if t and wall_valid:
            nb_t = [x for j in adj.get(i, ()) if (x := _thk(j)) is not None]
            if nb_t:
                thin = min(nb_t)
                if thin > 0:
                    rec["neighbourMinThicknessMm"] = round(thin, 3)
                    rec["sectionRatio"] = round(max(t, thin) / min(t, thin), 3)
        feats.append(rec)

    # ── Hot spots: heavy isolated sections (casting shrinkage porosity) ───────
    tvals = sorted(v for v in thickness.values() if v and v > 0)
    hot = []
    if wall_valid and len(tvals) >= 8:
        med = tvals[len(tvals) // 2]
        cap = med * 2.0
        for i, t in thickness.items():
            if t > cap and i in F:
                hot.append({"faceId": i, "thicknessMm": t,
                            "vsMedianRatio": round(t / med, 2),
                            "positionMm": F[i]["centroid"]})
        hot.sort(key=lambda h: -h["thicknessMm"])

    out["available"] = True
    out["features"] = feats
    out["faceCount"] = n
    out["thicknessSampledFaces"] = len(thickness)
    out["medianThicknessMm"] = round(tvals[len(tvals) // 2], 3) if tvals else None
    out["hotSpots"] = hot[:25]
    out["wallAnalysisValid"] = wall_valid
    out["fillRatio"] = fill_ratio
    if wall_note:
        out["note"] = wall_note
    out["adjacencyAvailable"] = any(adj.values())
    out["drawDirectionXYZ"] = list(draw_dir)
    return out


def _gear_metrics(wrapped):
    """Gear metrology from the B-rep — measured, never guessed.

    A gear's teeth end in TIP faces: cylindrical patches whose radius is the tip
    circle and whose axis is the gear axis, one (or a fillet-split few) per
    tooth. Counting distinct angular positions of those patches IS counting the
    teeth — a measurement, robust to how the CAD was authored. From z and the
    tip diameter the module follows for a standard-addendum external gear:
    m = OD / (z + 2). Face width is the tip patches' axial span.

    Deliberately NOT derived here: helix angle (needs flank-surface fitting),
    quality class, hardness — those come from the drawing or the engineer, and
    the consuming rules SAY so rather than defaulting.

    Returns None when the shape does not read as a gear (fewer than 8 teeth
    counted, or no dominant co-axial cylinder cluster).
    """
    import math as _m
    from OCP.TopExp import TopExp_Explorer
    from OCP.TopAbs import TopAbs_FACE, TopAbs_Orientation
    from OCP.TopoDS import TopoDS
    from OCP.BRepAdaptor import BRepAdaptor_Surface
    from OCP.GeomAbs import GeomAbs_SurfaceType

    cyls = []
    exp = TopExp_Explorer(wrapped, TopAbs_FACE)
    while exp.More():
        face = TopoDS.Face_s(exp.Current())
        exp.Next()
        try:
            ad = BRepAdaptor_Surface(face)
            if ad.GetType() != GeomAbs_SurfaceType.GeomAbs_Cylinder:
                continue
            cyl = ad.Cylinder()
            ax = cyl.Axis(); d = ax.Direction(); pl = ax.Location()
            reversed_param = not cyl.Position().Direct()
            reversed_face = face.Orientation() == TopAbs_Orientation.TopAbs_REVERSED
            concave = reversed_face != reversed_param        # hole-like
            umid = (ad.FirstUParameter() + ad.LastUParameter()) / 2.0
            vspan = abs(ad.LastVParameter() - ad.FirstVParameter())
            try:
                pt = ad.Value(umid, (ad.FirstVParameter() + ad.LastVParameter()) / 2.0)
                mid = (pt.X(), pt.Y(), pt.Z())
            except Exception:
                mid = None
            cyls.append({
                "r": cyl.Radius(), "concave": concave, "vspan": vspan, "mid": mid,
                "dir": (d.X(), d.Y(), d.Z()), "loc": (pl.X(), pl.Y(), pl.Z()),
                "uarc": abs(ad.LastUParameter() - ad.FirstUParameter()),
            })
        except Exception:
            continue
    if len(cyls) < 8:
        return None

    # Dominant axis DIRECTION (gear axis): the direction shared by the most
    # cylindrical faces (sign-insensitive).
    def dkey(v):
        x, y, z = v
        if (x, y, z) < (-x, -y, -z):
            x, y, z = -x, -y, -z
        return (round(x, 2), round(y, 2), round(z, 2))
    clusters = {}
    for c in cyls:
        clusters.setdefault(dkey(c["dir"]), []).append(c)
    axis_key, axial = max(clusters.items(), key=lambda kv: len(kv[1]))
    if len(axial) < 8:
        return None
    adx, ady, adz = axis_key
    n = _m.sqrt(adx * adx + ady * ady + adz * adz) or 1.0
    adx, ady, adz = adx / n, ady / n, adz / n
    # Axis point: mean of the co-axial faces' axis locations.
    ax0 = (sum(c["loc"][0] for c in axial) / len(axial),
           sum(c["loc"][1] for c in axial) / len(axial),
           sum(c["loc"][2] for c in axial) / len(axial))

    # Tip candidates: CONVEX co-axial cylinders within 1.5% of the max radius.
    convex = [c for c in axial if not c["concave"]]
    if not convex:
        return None
    tip_r = max(c["r"] for c in convex)
    tips = [c for c in convex if c["r"] >= tip_r * 0.985 and c["mid"] is not None]
    if len(tips) < 8:
        return None

    # Angular position of each tip patch around the axis; cluster to teeth.
    ref = None
    angles = []
    for c in tips:
        vx = c["mid"][0] - ax0[0]; vy = c["mid"][1] - ax0[1]; vz = c["mid"][2] - ax0[2]
        dot = vx * adx + vy * ady + vz * adz
        px, py, pz = vx - dot * adx, vy - dot * ady, vz - dot * adz
        if ref is None:
            rl = _m.sqrt(px * px + py * py + pz * pz) or 1.0
            ref = (px / rl, py / rl, pz / rl)
            perp = (ady * ref[2] - adz * ref[1],
                    adz * ref[0] - adx * ref[2],
                    adx * ref[1] - ady * ref[0])
        a = _m.atan2(px * perp[0] + py * perp[1] + pz * perp[2],
                     px * ref[0] + py * ref[1] + pz * ref[2])
        angles.append(a % (2 * _m.pi))
    angles.sort()
    # Merge fillet-split patches: gaps well below the dominant pitch are the
    # same tooth. The tooth pitch is the LARGE recurring gap.
    gaps = [angles[i + 1] - angles[i] for i in range(len(angles) - 1)]
    gaps.append(2 * _m.pi - angles[-1] + angles[0])
    big = max(gaps)
    teeth = sum(1 for g in gaps if g > big * 0.5)
    if teeth < 8 or teeth > 400:
        return None

    face_width = max(c["vspan"] for c in tips)
    tip_d = round(tip_r * 2, 3)
    module = round(tip_d / (teeth + 2), 4)          # standard addendum, external

    # Bore: largest full-arc concave co-axial cylinder clearly inside the tips.
    bores = [c for c in axial if c["concave"] and c["uarc"] > 5.2 and c["r"] < tip_r * 0.8]
    bore_d = round(max(b["r"] for b in bores) * 2, 2) if bores else None

    return {
        "likelyGear": True,
        "teeth": teeth,
        "tipDiameterMm": tip_d,
        "faceWidthMm": round(face_width, 2),
        "boreDiameterMm": bore_d,
        "derivedNormalModuleMm": module,
        "moduleBasis": f"OD {tip_d} mm / (z {teeth} + 2) — standard addendum, external, spur-equivalent; "
                       "helical parts need the drawing's normal module",
        "teethBasis": f"counted {len(tips)} tip-circle patch(es) at r≈{round(tip_r, 2)} mm "
                      f"clustered to {teeth} angular positions",
        "helixAngleDeg": None,   # not measured — drawing/engineer answers this
        "internal": False,       # v1: external only; internal detection is roadmap
    }


def _safe_gear_metrics(wrapped):
    try:
        return _gear_metrics(wrapped)
    except Exception:
        return None


def _read_step_file_units(reader):
    """Length unit names declared in the STEP header, e.g. ['millimetre'] or ['inch'].
    OCCT converts to mm on read, so this is CONTEXT for the unit heuristic, not a
    scale factor: the failure that matters is a file DECLARED in mm whose
    numbers were authored at inch magnitudes."""
    try:
        from OCP.TColStd import TColStd_SequenceOfAsciiString
        L = TColStd_SequenceOfAsciiString(); A = TColStd_SequenceOfAsciiString(); S = TColStd_SequenceOfAsciiString()
        reader.FileUnits(L, A, S)
        return [L.Value(i).ToCString() for i in range(1, L.Length() + 1)]
    except Exception:
        return []


def _sew_open_shape(wrapped, tol_mm=1e-3):
    """IGES and some STEP exports arrive as a bag of faces. Sew them and, where a
    closed shell results, make a solid — so the volume we report is a volume.
    Returns (shape, repaired_record)."""
    from OCP.BRepBuilderAPI import BRepBuilderAPI_Sewing, BRepBuilderAPI_MakeSolid
    from OCP.TopExp import TopExp_Explorer
    from OCP.TopAbs import TopAbs_SOLID, TopAbs_SHELL
    from OCP.TopoDS import TopoDS, TopoDS_Compound
    from OCP.BRep import BRep_Builder
    sew = BRepBuilderAPI_Sewing(tol_mm)
    sew.Add(wrapped)
    sew.Perform()
    sewn = sew.SewedShape()
    if sewn.IsNull():
        return wrapped, {"sewn": False, "toleranceMm": tol_mm, "note": "sewing produced no shape"}
    n_solid = 0
    e = TopExp_Explorer(sewn, TopAbs_SOLID)
    while e.More():
        n_solid += 1; e.Next()
    made = 0
    if n_solid == 0:
        b = BRep_Builder(); comp = TopoDS_Compound(); b.MakeCompound(comp)
        e = TopExp_Explorer(sewn, TopAbs_SHELL)
        while e.More():
            sh = TopoDS.Shell_s(e.Current())
            try:
                if sh.Closed():
                    ms = BRepBuilderAPI_MakeSolid(sh)
                    if ms.IsDone():
                        b.Add(comp, ms.Solid()); made += 1
                        e.Next(); continue
            except Exception:
                pass
            b.Add(comp, sh)
            e.Next()
        if made:
            sewn = comp
    return sewn, {"sewn": True, "toleranceMm": tol_mm, "solidsMade": made,
                  "freeEdgesAfter": sew.NbFreeEdges(), "multipleEdgesAfter": sew.NbMultipleEdges()}


class _quiet_stdout:
    """OCCT's readers print coloured status lines ("Total number of loaded
    entities", "**** ERR StepFile") straight to C-level stdout — the channel
    the JSON result travels on. Redirect fd 1 to fd 2 for the duration of a
    read so the chatter lands in stderr and the JSON stays parseable."""
    def __enter__(self):
        sys.stdout.flush()
        self._saved = os.dup(1)
        os.dup2(2, 1)
        return self
    def __exit__(self, *exc):
        sys.stdout.flush()
        os.dup2(self._saved, 1)
        os.close(self._saved)
        return False


_SHAPE_LRU = {}          # (sha256, unit_scale) -> (wrapped, info)
_SHAPE_LRU_MAX = int(os.environ.get("CV_SHAPE_LRU", "4"))
_SERVING = False


def _file_sha256(path):
    import hashlib
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def _load_shape(filepath):
    """Serve-mode wrapper: reuse a loaded shape for the same bytes + scale."""
    if not _SERVING:
        return _load_shape_uncached(filepath)
    scale = float(os.environ.get("CV_UNIT_SCALE", "1") or "1")
    key = (_file_sha256(filepath), scale)
    hit = _SHAPE_LRU.pop(key, None)
    if hit is not None:
        _SHAPE_LRU[key] = hit            # move to most-recent
        return hit[0], dict(hit[1], cached=True)
    wrapped, info = _load_shape_uncached(filepath)
    _SHAPE_LRU[key] = (wrapped, info)
    while len(_SHAPE_LRU) > _SHAPE_LRU_MAX:
        _SHAPE_LRU.pop(next(iter(_SHAPE_LRU)))
    return wrapped, info


def _load_shape_uncached(filepath):
    """The ONE loader both `analyze` and `tessellate_to_stl` use.

    Returns (wrapped_shape, info) or raises. `info` carries the declared file
    units, whether the shape was sewn, and the scale applied. CV_UNIT_SCALE
    (e.g. 25.4 after the engineer confirms an inch model) is applied here so
    every downstream number — measurement AND viewer mesh — agrees.
    """
    from OCP.IFSelect import IFSelect_RetDone
    ext = os.path.splitext(filepath)[1].lower()
    info = {"fileUnits": [], "repaired": None, "unitScale": 1.0, "format": ext.lstrip(".")}
    if ext in (".step", ".stp"):
        from OCP.STEPControl import STEPControl_Reader
        reader = STEPControl_Reader()
        with _quiet_stdout():
            ok = reader.ReadFile(filepath) == IFSelect_RetDone
            if ok:
                info["fileUnits"] = _read_step_file_units(reader)
                reader.TransferRoots()
                wrapped = reader.OneShape()
        if not ok:
            raise RuntimeError("STEPControl_Reader failed")
        # A STEP exported as surfaces (no SOLID entity) but whose shell is
        # closed is repairable: sew and make the solid, and say so.
        if wrapped is not None and not wrapped.IsNull():
            from OCP.TopExp import TopExp_Explorer
            from OCP.TopAbs import TopAbs_SOLID
            if not TopExp_Explorer(wrapped, TopAbs_SOLID).More():
                try:
                    wrapped, info["repaired"] = _sew_open_shape(wrapped)
                except Exception as se:
                    info["repaired"] = {"sewn": False, "note": str(se)[:120]}
    elif ext in (".iges", ".igs"):
        from OCP.IGESControl import IGESControl_Reader
        reader = IGESControl_Reader()
        with _quiet_stdout():
            ok = reader.ReadFile(filepath) == IFSelect_RetDone
            if ok:
                reader.TransferRoots()
                wrapped = reader.OneShape()
        if not ok:
            raise RuntimeError("IGESControl_Reader failed")
        # IGES is a surface format: sew, and make solids from closed shells.
        if wrapped is not None and not wrapped.IsNull():
            try:
                wrapped, info["repaired"] = _sew_open_shape(wrapped)
            except Exception as se:
                info["repaired"] = {"sewn": False, "note": str(se)[:120]}
    else:
        raise RuntimeError(f"Unsupported format: {ext}")
    if wrapped is None or wrapped.IsNull():
        raise RuntimeError("No shape loaded")
    scale = float(os.environ.get("CV_UNIT_SCALE", "1") or "1")
    if scale > 0 and abs(scale - 1.0) > 1e-9:
        from OCP.gp import gp_Trsf
        from OCP.BRepBuilderAPI import BRepBuilderAPI_Transform
        t = gp_Trsf(); t.SetScaleFactor(scale)
        wrapped = BRepBuilderAPI_Transform(wrapped, t, True).Shape()
        info["unitScale"] = scale
    return wrapped, info


def _unit_check(x_sz, y_sz, z_sz, cyl_radii, file_units, unit_scale):
    """The inch-authored-as-mm failure. A file declared in millimetres whose
    every bbox axis is under 25 mm AND whose cylindrical features are
    sub-millimetre is, in practice, an inch model that nobody converted: the
    same flange at 80 x 80 x 20 mm reads 3.15 x 3.15 x 0.79. Nothing here
    scales anything — it proposes a factor and asks. Returns None when fine."""
    if unit_scale and abs(unit_scale - 1.0) > 1e-9:
        return None  # the engineer already answered
    dims = [d for d in (x_sz, y_sz, z_sz) if d is not None]
    if not dims:
        return None
    declared_inch = any("inch" in (u or "").lower() for u in (file_units or []))
    small_box = max(dims) < 25.0
    radii = [r for r in (cyl_radii or []) if r and r > 0]
    tiny_features = bool(radii) and (sorted(radii)[len(radii) // 2] < 1.0)
    if small_box and (tiny_features or not radii):
        return {
            "code": "units_unconfirmed",
            "proposedFactor": 25.4,
            "reason": (f"Bounding box {max(dims):.2f} mm on its largest axis"
                       + (f", median cylindrical radius {sorted(radii)[len(radii)//2]:.2f} mm" if radii else "")
                       + (" — file header declares inches" if declared_inch else " — file header declares millimetres")
                       + ". These magnitudes are typical of an inch model saved with millimetre units."),
            "declaredUnits": file_units or [],
        }
    return None


def analyze(filepath: str) -> dict:
    _CAVITY_MEMO.clear()          # one part's cavity verdicts never answer another's
    try:
        from OCP.BRepGProp import BRepGProp
        from OCP.GProp import GProp_GProps
        from OCP.BRepBndLib import BRepBndLib
        from OCP.Bnd import Bnd_Box
        from OCP.IFSelect import IFSelect_RetDone
    except ImportError as e:
        return {"status": "error", "error": f"OCP not available: {e}"}

    ext = os.path.splitext(filepath)[1].lower()

    # ── Load file (shared loader: units, CV_UNIT_SCALE, IGES sewing) ─────────
    try:
        raw_shape, load_info = _load_shape(filepath)
        shape = _ShapeShim(raw_shape)
    except Exception as e:
        return {"status": "error", "code": "unreadable", "error": f"File load error: {e}"}

    try:
        wrapped = shape.wrapped

        # ── Volume & surface area (precise) ───────────────────────────────────
        vol_props = GProp_GProps()
        BRepGProp.VolumeProperties_s(wrapped, vol_props)
        volume_mm3 = abs(vol_props.Mass())

        surf_props = GProp_GProps()
        BRepGProp.SurfaceProperties_s(wrapped, surf_props)
        sa_mm2 = abs(surf_props.Mass())

        # ── Bounding box ──────────────────────────────────────────────────────
        # Exact (AddOptimal, geometry only): `Add` reads a triangulation when the
        # shape has one and pads by its deflection, so the warm pool — which has
        # meshed the part for the viewer — measured a Ø40 shaft as 40.11 mm while
        # a fresh process measured 40.00 (machining review, Oct 2026). The bar,
        # plate and every envelope-sized rule read this box.
        bbox = Bnd_Box()
        try:
            BRepBndLib.AddOptimal_s(wrapped, bbox, False, False)
        except Exception:
            BRepBndLib.Add_s(wrapped, bbox)
        xmin, ymin, zmin, xmax, ymax, zmax = bbox.Get()
        x_sz = round(xmax - xmin, 2)
        y_sz = round(ymax - ymin, 2)
        z_sz = round(zmax - zmin, 2)
        bbox_vol = x_sz * y_sz * z_sz
        fill_ratio = round(volume_mm3 / bbox_vol, 4) if bbox_vol > 0 else 0.5

        # ── Face & edge classification ────────────────────────────────────────
        faces = list(shape.Faces())
        edges = list(shape.Edges())

        # Guard against pathological topology (audit RK3): analyze runs several
        # O(faces)+O(edges) passes with no ceiling, so a file declaring millions
        # of faces would exhaust CPU/RAM. Real parts have hundreds–low thousands
        # of faces; even large assemblies stay well under these limits.
        max_faces = int(os.environ.get("CV_MAX_ANALYZE_FACES", "100000"))
        max_edges = int(os.environ.get("CV_MAX_ANALYZE_EDGES", "300000"))
        if len(faces) > max_faces or len(edges) > max_edges:
            return {"status": "error",
                    "error": (f"Model topology too large to analyze "
                              f"({len(faces)} faces, {len(edges)} edges; limits "
                              f"{max_faces}/{max_edges}). Simplify or defeature the model.")}

        face_counts, cyl_radii_all = _classify_faces(faces)
        edge_counts, circle_radii = _classify_edges(edges)

        # ── Topology: sealed hollow body vs open thin-wall drape ──────────────
        # A blow-/rotational-moulded part (tank, bottle, duct) is a CLOSED shell
        # that encloses a sealed void — OCCT models that void as an extra (inner)
        # shell, so shells > solids. An injection-moulded / thermoformed panel
        # (bumper fascia, trim, cover) is a thin drape with NO enclosed void —
        # one shell per solid, and a handful of naked edges at most. Both read
        # as low fill-ratio thin-wall shells, so this void signal is what tells a
        # bumper apart from a fuel tank (the fuel-tank↔bumper failure mode).
        topology = None
        try:
            topology = _topology_report(shape)
        except Exception as _te:  # never let topology break the pipeline
            topology = {"available": False, "note": str(_te)[:120]}
        enclosure = None
        try:
            enclosure = _enclosure(wrapped, (xmin, ymin, zmin, xmax, ymax, zmax))
        except Exception as _ee:
            enclosure = {"centreIn": None, "rays": 0, "hitShare": None, "note": str(_ee)[:120]}
        profile_section = None
        try:
            profile_section = _profile_section(wrapped, (xmin, ymin, zmin, xmax, ymax, zmax), volume_mm3)
        except Exception as _pe:
            profile_section = {"error": str(_pe)[:160]}

        # ── Refuse before you estimate ────────────────────────────────────────
        # An open surface model measured as if it were a solid gave a plausible
        # wrong volume (50.2 cm³ against a true 63.9) with status "success". A
        # number nobody can trust is worse than no number: refuse, say why, and
        # let the route turn it into a decision or a clear error. Sheet-metal
        # surface bodies can opt in with CV_ALLOW_OPEN_SHELL=1.
        allow_open = os.environ.get("CV_ALLOW_OPEN_SHELL") == "1"
        if topology.get("available") and not topology.get("isClosedSolid") and not allow_open:
            return {
                "status": "error", "code": "not_closed_solid",
                "error": (f"Model is not a closed solid: {topology.get('solidCount', 0)} solid(s), "
                          f"{topology.get('freeEdgeCount', 0)} free edge(s), "
                          f"{topology.get('freeBoundaryWires', 0)} open boundary wire(s)"
                          + ("" if topology.get("valid") is not False else ", BRepCheck reports the shape invalid")
                          + ". Export a solid body (not surfaces) and upload again."),
                "topology": topology,
                "boundingBox": {"xMm": x_sz, "yMm": y_sz, "zMm": z_sz},
                "measuredVolumeCm3": round(volume_mm3 / 1000, 3),
                "load": load_info,
            }
        if volume_mm3 <= 1e-6:
            return {"status": "error", "code": "zero_volume",
                    "error": "Model has zero volume — nothing to cost.",
                    "topology": topology, "boundingBox": {"xMm": x_sz, "yMm": y_sz, "zMm": z_sz},
                    "load": load_info}
        unit_check = _unit_check(x_sz, y_sz, z_sz, cyl_radii_all, load_info.get("fileUnits"), load_info.get("unitScale", 1.0))

        # ── Feature extraction — SINGLE SOURCE OF TRUTH: the B-rep feature table
        # (concavity classifier + axis dedupe + partial-arc filter). The old
        # radius<30mm heuristic counted shaft steps as "holes" and pocket-corner
        # radii as bores — over-counting features and drilling time.
        ft_rows = (_extract_feature_table(wrapped, (x_sz, y_sz, z_sz))
                   + _extract_machining_features(wrapped, (xmin, ymin, zmin, xmax, ymax, zmax)))
        table_holes  = [r for r in ft_rows if r.get("kind") == "hole"]
        table_bosses = [r for r in ft_rows if r.get("kind") == "boss"]
        n_holes  = sum(r["count"] for r in table_holes)
        n_bosses = sum(r["count"] for r in table_bosses)
        hole_radii_uniq  = sorted(set(round(r["diaMm"] / 2, 1) for r in table_holes))
        boss_radii_uniq  = sorted(set(round(r["diaMm"] / 2, 1) for r in table_bosses))
        all_cyl_uniq     = sorted(set(round(r, 1) for r in cyl_radii_all))
        has_threads = (edge_counts.get("BSPLINE", 0) > 150 or "HELIX" in edge_counts)

        # ── Wall thickness (ray-cast) ─────────────────────────────────────────
        try:
            wall_stats = _compute_wall_thickness(shape, faces)
        except Exception:
            wall_stats = None

        # ── Draft angle & undercut analysis ───────────────────────────────────
        # The draw direction was hard-coded to +Z, so a part modelled lying
        # down reported dozens of undercuts. Try the three principal axes,
        # keep the one with the fewest undercuts, and report the runner-up so
        # the engineer can override a near tie.
        # Silhouettes first: a tie on undercuts is broken by the LARGEST section —
        # dies and moulds part across the biggest plan area. The tie used to fall
        # to the draft-count order: an undrafted forging yoke parted across its
        # 50 × 30 end (15 cm²) instead of its 250 × 50 plan (87 cm²), and the
        # press was sized on the end (forging review, Oct 2026).
        try:
            _diag_pa = math.sqrt(x_sz ** 2 + y_sz ** 2 + z_sz ** 2) or 1.0
            _proj_early = _silhouette_areas_mm2(raw_shape, _diag_pa)
        except Exception:
            _proj_early = None
        _sil = lambda d: ((_proj_early or {}).get("zMm2" if abs(d["drawDirectionXYZ"][2]) > 0.9
                          else ("yMm2" if abs(d["drawDirectionXYZ"][1]) > 0.9 else "xMm2")) or 0)
        try:
            candidates = []
            _inter_draft = _shape_intersector(raw_shape)
            from OCP.TopTools import TopTools_IndexedMapOfShape as _IMS
            from OCP.TopExp import TopExp as _TE
            from OCP.TopAbs import TopAbs_FACE as _TAF
            _fmap_draft = _IMS()
            _TE.MapShapes_s(raw_shape, _TAF, _fmap_draft)
            for axis in ((0.0, 0.0, 1.0), (0.0, 1.0, 0.0), (1.0, 0.0, 0.0)):
                di = _compute_draft_analysis(raw_shape, _fmap_draft, axis, _inter_draft, _diag_pa)
                candidates.append(di)
            candidates.sort(key=lambda d: (d["undercutFaceCount"], -_sil(d), -d["adequateDraftFaceCount"]))
            draft_info = dict(candidates[0])
            runner = candidates[1] if len(candidates) > 1 else None
            draft_info["pullDirectionSearch"] = {
                "candidates": [{"drawDirectionXYZ": c["drawDirectionXYZ"], "undercutFaceCount": c["undercutFaceCount"]} for c in candidates],
                "runnerUp": ({"drawDirectionXYZ": runner["drawDirectionXYZ"], "undercutFaceCount": runner["undercutFaceCount"]} if runner else None),
                "ambiguous": bool(runner and candidates[0]["undercutFaceCount"] > 0
                                  and abs(runner["undercutFaceCount"] - candidates[0]["undercutFaceCount"]) <= max(1, int(0.1 * candidates[0]["undercutFaceCount"]))),
            }
        except Exception:
            draft_info = None

        # ── Projected (silhouette) area along each axis and the draw ──────────
        try:
            proj = dict(_proj_early) if _proj_early else None
            if proj:
                d = (draft_info or {}).get("drawDirectionXYZ") or [0.0, 0.0, 1.0]
                key = "zMm2" if abs(d[2]) > 0.9 else ("yMm2" if abs(d[1]) > 0.9 else "xMm2")
                proj["alongDrawMm2"] = proj.get(key)
                proj["method"] = "silhouette_raster"
            projected_area = proj or None
        except Exception:
            projected_area = None

        # ── Manufacturing feature substrate (geometric DFM) ───────────────────
        # Opt-in: the per-face ray casting and adjacency build are the expensive
        # part of this kernel, and the costing path does not need them. The
        # background DFM job sets CV_EXTRACT_FEATURES=1; a normal costing run
        # pays nothing for this.
        mfg_features = None
        if os.environ.get("CV_EXTRACT_FEATURES") == "1":
            try:
                _diag = math.sqrt(x_sz ** 2 + y_sz ** 2 + z_sz ** 2) or 1.0
                # The draw the pull-direction search chose — the per-face draft and undercut findings used to be
                # measured against a fixed +Z whatever the part's orientation.
                _dd = tuple((draft_info or {}).get("drawDirectionXYZ") or (0.0, 0.0, 1.0))
                mfg_features = _extract_manufacturing_features(wrapped, _diag, draw_dir=_dd, fill_ratio=fill_ratio)
            except Exception as _fe:
                mfg_features = {"available": False, "features": [], "note": str(_fe)[:160]}

        # ── Setup count estimation ────────────────────────────────────────────
        try:
            setup_info = _compute_setup_count(faces)
        except Exception:
            setup_info = None

        # ── Planar face area & CNC cycle estimate ────────────────────────────
        try:
            planar_area = _compute_planar_face_area(faces)
            cnc_time = _estimate_cnc_cycle(
                planar_area_mm2=planar_area,
                cyl_face_count=n_holes,   # drill time per REAL bore, not per cylindrical face
                setup_count=setup_info["estimatedSetupCount"] if setup_info else 3,
            )
        except Exception:
            planar_area, cnc_time = 0.0, None

        try:
            area_by_type = _face_area_by_type(faces)
        except Exception:
            area_by_type = None
        try:
            turning = _turning_signature(faces, sa_mm2)
        except Exception:
            turning = None

        part_name = os.path.splitext(os.path.basename(filepath))[0]

        return {
            "status": "success",
            "partName": part_name,
            "boundingBox": {"xMm": x_sz, "yMm": y_sz, "zMm": z_sz},
            "volume": {
                "mm3": round(volume_mm3, 1),
                "cm3": round(volume_mm3 / 1000, 3),
            },
            "surfaceArea": {
                "mm2": round(sa_mm2, 1),
                "cm2": round(sa_mm2 / 100, 3),
            },
            "fillRatio": fill_ratio,
            "projectedArea": projected_area,
            "topology": topology,
            "enclosure": enclosure,
            "profileSection": profile_section,
            "weights": {
                "aluminiumKg": round(volume_mm3 * 2.70e-6, 4),
                "steelKg":     round(volume_mm3 * 7.85e-6, 4),
                "plasticKg":   round(volume_mm3 * 1.05e-6, 4),
                "castIronKg":  round(volume_mm3 * 7.15e-6, 4),
                "copperKg":    round(volume_mm3 * 8.96e-6, 4),
                "titaniumKg":  round(volume_mm3 * 4.43e-6, 4),
            },
            "faces": {
                "total": len(faces),
                "byType": face_counts,
                "areaByTypeMm2": area_by_type,
            },
            # Largest coaxial family of revolved surfaces — what a lathe would cut.
            "turning": turning,
            "edges": {
                "total": len(edges),
                "byType": edge_counts,
                "sampleCircleRadiiMm": sorted(set(round(r, 1) for r in circle_radii))[:30],
            },
            "features": {
                "cylindricalFaceCount": len(cyl_radii_all),
                "cylindricalFaceRadiiMm": all_cyl_uniq[:30],
                "estimatedHoleCount":  n_holes,               # from B-rep classifier, deduped
                "holeRadiiMm":         hole_radii_uniq[:20],  # unique radii for display
                "bossShaftCount":      n_bosses,
                "bossShaftRadiiMm":    boss_radii_uniq[:10],
                "threadFeaturesDetected": has_threads,
                "planarFaceCount":   face_counts.get("PLANE", 0),
                "freeFormFaceCount": (
                    face_counts.get("BSPLINE", 0) + face_counts.get("BEZIER", 0)
                ),
                "planarFaceAreaMm2": round(planar_area, 0),
            },
            # Exact per-feature table: hole/boss × diameter × depth × through,
            # axis-deduped counts — feeds the operations mapping in the client.
            "featureTable": ft_rows,
            # Sheet-metal forming features (bends) — for the SM Fab press-brake cost.
            "sheetMetal": _detect_bends(wrapped, _bulk_wall_mm(volume_mm3, sa_mm2)),
            # Gear metrology — teeth counted from tip-circle patches; None when
            # the shape does not read as a gear.
            "gear": _safe_gear_metrics(wrapped),
            # ── New precision analysis fields ─────────────────────────────
            "wallThickness": wall_stats,
            "draftAnalysis": draft_info,
            "manufacturingFeatures": mfg_features,
            "setupAnalysis": setup_info,
            "cncCycleTimeEstimate": cnc_time,
            # ── Parametric cost models ──────────────────────────────────────
            "toolingCostEstimates": _estimate_tooling_costs(
                faces_total=len(faces),
                hole_count=n_holes,
                undercut_count=(draft_info["undercutFaceCount"] if draft_info else 0),
                free_form_count=(face_counts.get("BSPLINE", 0) + face_counts.get("BEZIER", 0)),
                bbox={"xMm": x_sz, "yMm": y_sz, "zMm": z_sz},
                wall_stats=wall_stats,
                weights={
                    "aluminiumKg": round(volume_mm3 * 2.70e-6, 4),
                    "plasticKg":   round(volume_mm3 * 1.05e-6, 4),
                },
                fill_ratio=fill_ratio,
            ),
            "manufacturabilityScore": _compute_manufacturability_score(
                face_counts=face_counts,
                hole_count=n_holes,
                undercut_count=(draft_info["undercutFaceCount"] if draft_info else 0),
                wall_stats=wall_stats,
                fill_ratio=fill_ratio,
                free_form_count=(face_counts.get("BSPLINE", 0) + face_counts.get("BEZIER", 0)),
            ),
            "processSpecificEstimates": {
                "sandCycleTimeHr": _estimate_sand_cycle_hr(volume_mm3 / 1000),
                "sandCycleTimeHrFerrous": _estimate_sand_cycle_hr(volume_mm3 / 1000, iron=True),
                "forgeStrokes": _estimate_forge_strokes(
                    fill_ratio=fill_ratio,
                    free_form_pct=(face_counts.get("BSPLINE", 0) + face_counts.get("BEZIER", 0)) / max(1, len(faces)),
                    faces_total=len(faces),
                    hole_count=n_holes,
                ),
                "investWaxCostGBP":   _estimate_invest_consumables(sa_mm2 / 100)[0],
                "investShellCostGBP": _estimate_invest_consumables(sa_mm2 / 100)[1],
            },
            "assemblyWarning": _detect_assembly(filepath),
            "unitWarning": (unit_check["reason"] if unit_check else _validate_bbox(x_sz, y_sz, z_sz)),
            "unitCheck": unit_check,
            "load": load_info,
            "detectedHardware": _try_detect_hardware(wrapped),
        }

    except Exception as e:
        import traceback
        return {
            "status": "error",
            "error": str(e),
            "trace": traceback.format_exc()[:3000],
        }


# ─── Entry point ──────────────────────────────────────────────────────────────



def tessellate_to_stl(filepath, out_path, with_meta=False):
    """Mesh a STEP/IGES shape and write a binary STL — feeds the client-side
    rendered-views pipeline and the interactive 3D viewer. Deflection scales
    with the bounding diagonal so triangle counts stay sane for any part size.

    with_meta=True additionally writes a `<out_path>.json` sidecar with
    per-triangle face ids and exact per-face B-rep data (type, radii, area,
    body id, hole/boss classification) for the interactive viewer.

    Hard cap: CV_MAX_TRIANGLES (default 5M) aborts pathological tessellations
    (tiny STEP files full of fillets can otherwise amplify into multi-GB
    meshes — a zip-bomb-shaped DoS)."""
    try:
        # Pure OCP — the tessellate mode has no cadquery dependency.
        from OCP.BRepMesh import BRepMesh_IncrementalMesh
        from OCP.BRep import BRep_Tool
        from OCP.TopExp import TopExp_Explorer, TopExp
        from OCP.TopAbs import TopAbs_FACE
        from OCP.TopoDS import TopoDS
        from OCP.TopLoc import TopLoc_Location
        from OCP.Bnd import Bnd_Box
        from OCP.BRepBndLib import BRepBndLib
        from OCP.IFSelect import IFSelect_RetDone
        from OCP.TopAbs import TopAbs_Orientation
        from OCP.TopTools import TopTools_IndexedMapOfShape, TopTools_IndexedDataMapOfShapeListOfShape
    except ImportError as e:
        return {"status": "error", "error": f"OCP not available: {e}"}

    ext = os.path.splitext(filepath)[1].lower()
    try:
        wrapped, load_info = _load_shape(filepath)
    except Exception as e:
        return {"status": "error", "code": "unreadable", "error": f"File load error: {e}"}

    try:
        import struct
        from OCP.BRepAdaptor import BRepAdaptor_Surface
        from OCP.GeomAbs import GeomAbs_SurfaceType
        from OCP.BRepGProp import BRepGProp
        from OCP.GProp import GProp_GProps
        from OCP.TopAbs import TopAbs_SOLID

        SURF_NAMES = {
            GeomAbs_SurfaceType.GeomAbs_Plane: "plane",
            GeomAbs_SurfaceType.GeomAbs_Cylinder: "cylinder",
            GeomAbs_SurfaceType.GeomAbs_Cone: "cone",
            GeomAbs_SurfaceType.GeomAbs_Sphere: "sphere",
            GeomAbs_SurfaceType.GeomAbs_Torus: "torus",
        }
        box = Bnd_Box()
        BRepBndLib.Add_s(wrapped, box)
        xmin, ymin, zmin, xmax, ymax, zmax = box.Get()
        diag = math.sqrt((xmax - xmin) ** 2 + (ymax - ymin) ** 2 + (zmax - zmin) ** 2) or 1.0
        # Finer meshing for a smooth, HD look: tighter linear deflection (curve
        # chord error) AND much tighter angular deflection so curved silhouettes
        # read as round, not faceted. 0.3 rad ≈ 17° between adjacent facet normals
        # (was 0.5 rad ≈ 29°). Paired with creased vertex normals in the viewer,
        # this is the main smoothness win. Triangle count stays bounded by
        # CV_MAX_TRIANGLES; diag/500 keeps small detailed parts from exploding.
        # A thin B-spline drape (a bumper: fill ratio 0.003) meshed at diag/500
        # and 0.3 rad came out 11.9% light by volume: on a 1.9 m part diag/500 is
        # a 3.8 mm chord error against a 3 mm wall. Thin parts get diag/2000 and
        # 0.1 rad (−3.2%, 210k triangles, 1.2 s on that bumper; finer buys 0.3%
        # for 4x the triangles — the residual is sliver faces, not deflection).
        # Chunky parts keep diag/500 + 0.3 rad — within ±0.35% on seven real ones.
        linear, angular = diag / 500.0, 0.3
        try:
            _gp = GProp_GProps()
            BRepGProp.VolumeProperties_s(wrapped, _gp)
            _vol = abs(_gp.Mass())
            _bbv = max(1e-9, (xmax - xmin) * (ymax - ymin) * (zmax - zmin))
            if _vol / _bbv < 0.2:
                linear, angular = max(0.25, diag / 2000.0), 0.1
        except Exception:
            pass
        BRepMesh_IncrementalMesh(wrapped, linear, False, angular, True)

        max_tris = int(os.environ.get("CV_MAX_TRIANGLES", "5000000"))

        # Stable face ids via an indexed map (1-based) — the same map is used to
        # assign faces to solids, so viewer face ids and body ids stay consistent.
        face_map = TopTools_IndexedMapOfShape()
        TopExp.MapShapes_s(wrapped, TopAbs_FACE, face_map)

        # face index -> body id (solids enumerated in order; -1 = not in any solid)
        face_body = {}
        bodies = 0
        try:
            bexp = TopExp_Explorer(wrapped, TopAbs_SOLID)
            while bexp.More():
                fexp = TopExp_Explorer(bexp.Current(), TopAbs_FACE)
                while fexp.More():
                    idx = face_map.FindIndex(fexp.Current())
                    if idx > 0 and idx not in face_body:
                        face_body[idx] = bodies
                    fexp.Next()
                bodies += 1
                bexp.Next()
        except Exception:
            pass

        # per-face wall thickness (single-ray) — only for the interactive viewer
        # heatmap, which is the only consumer of the metadata sidecar.
        thickness_by_idx = _per_face_thickness(wrapped, face_map, diag) if with_meta else {}

        tris = []
        tri_face_ids = []   # per-triangle source face id — lets the viewer map a click back to the B-rep
        skipped_faces = 0   # faces with no/failed triangulation — mesh has holes there
        # `triFace` carries the 1-based TopTools_IndexedMapOfShape index, the SAME
        # id `_extract_manufacturing_features` puts in a feature's `faceIds`. It
        # used to carry a dense 0-based counter that skipped untriangulated faces,
        # so a DFM finding's face ids landed on the wrong faces — off by one on a
        # clean part, and by more once anything failed to triangulate. That made
        # every "highlight the faces that triggered this" path silently wrong.
        # `faces_meta` is indexed BY that id (position == map index), so the
        # viewer's `meta.faces[faceId]` lookup still holds; index 0 and any
        # skipped face are None.
        faces_meta = [None] * (face_map.Extent() + 1)
        meshed_faces = 0
        for map_idx in range(1, face_map.Extent() + 1):
            face_id = map_idx
            face = TopoDS.Face_s(face_map.FindKey(map_idx))
            loc = TopLoc_Location()
            tri = BRep_Tool.Triangulation_s(face, loc)
            if tri is None:
                skipped_faces += 1
                continue
            # exact B-rep metadata for this face
            ftype = "other"
            radius_mm = None    # cylinder/sphere radius; cone ref radius; torus major radius
            radius2_mm = None   # torus minor radius
            angle_deg = None    # cone half-angle
            depth_mm = None     # cylinders: exact height/depth along the axis
            hole = None         # cylinders: True = internal (drilled/bored), False = external (boss/shaft)
            try:
                ad = BRepAdaptor_Surface(face)
                st = ad.GetType()
                ftype = SURF_NAMES.get(st, "freeform")
                if st == GeomAbs_SurfaceType.GeomAbs_Cylinder:
                    cyl = ad.Cylinder()
                    radius_mm = cyl.Radius()
                    # Cylinder V-parameter is arc length along the axis → exact depth/height
                    try:
                        depth_mm = abs(ad.LastVParameter() - ad.FirstVParameter())
                        if not math.isfinite(depth_mm):
                            depth_mm = None
                    except Exception:
                        depth_mm = None
                    # Concavity: a cylinder's natural normal points radially outward
                    # when its coordinate system is right-handed. Material-outward
                    # normals pointing INWARD (toward the axis) mean the face is an
                    # internal wall — a hole/bore. XOR the two flips that decide it.
                    reversed_param = not cyl.Position().Direct()
                    reversed_face_o = face.Orientation() == TopAbs_Orientation.TopAbs_REVERSED
                    hole = reversed_face_o != reversed_param
                elif st == GeomAbs_SurfaceType.GeomAbs_Sphere:
                    radius_mm = ad.Sphere().Radius()
                elif st == GeomAbs_SurfaceType.GeomAbs_Cone:
                    cone = ad.Cone()
                    radius_mm = cone.RefRadius()
                    angle_deg = abs(math.degrees(cone.SemiAngle()))
                elif st == GeomAbs_SurfaceType.GeomAbs_Torus:
                    tor = ad.Torus()
                    radius_mm = tor.MajorRadius()
                    radius2_mm = tor.MinorRadius()
            except Exception:
                pass
            area_cm2 = None
            try:
                fprops = GProp_GProps()
                BRepGProp.SurfaceProperties_s(face, fprops)
                area_cm2 = abs(fprops.Mass()) / 100.0
            except Exception:
                pass
            meshed_faces += 1
            faces_meta[face_id] = ({
                "id": face_id,
                "type": ftype,
                "radiusMm": round(radius_mm, 4) if radius_mm is not None else None,
                "radius2Mm": round(radius2_mm, 4) if radius2_mm is not None else None,
                "angleDeg": round(angle_deg, 3) if angle_deg is not None else None,
                "depthMm": round(depth_mm, 2) if depth_mm is not None else None,
                "areaCm2": round(area_cm2, 4) if area_cm2 is not None else None,
                "bodyId": face_body.get(map_idx, -1),
                "hole": hole,
                "thicknessMm": thickness_by_idx.get(map_idx),
            })

            trsf = loc.Transformation()
            # Honour face orientation so the mesh has consistent outward winding.
            # A mirrored instance transform (negative determinant) flips handedness
            # and therefore winding — XOR it with the face orientation flag.
            reversed_face = face.Orientation() == TopAbs_Orientation.TopAbs_REVERSED
            try:
                if trsf.IsNegative():
                    reversed_face = not reversed_face
            except Exception:
                pass
            n_tri = tri.NbTriangles()
            if len(tris) + n_tri > max_tris:
                return {"status": "error",
                        "error": f"Tessellation exceeds {max_tris} triangles — part too complex for interactive viewing. "
                                 f"Simplify the model or raise CV_MAX_TRIANGLES."}
            for i in range(1, n_tri + 1):
                t = tri.Triangle(i)
                pts = []
                for k in (1, 2, 3):
                    pnt = tri.Node(t.Value(k)).Transformed(trsf)
                    pts.append((pnt.X(), pnt.Y(), pnt.Z()))
                if reversed_face:
                    pts[1], pts[2] = pts[2], pts[1]
                tris.append(pts)
                tri_face_ids.append(face_id)

        if not tris:
            return {"status": "error", "error": "Meshing produced no triangles"}

        with open(out_path, "wb") as f:
            f.write(b"\0" * 80)
            f.write(struct.pack("<I", len(tris)))
            for pts in tris:
                f.write(struct.pack("<3f", 0.0, 0.0, 0.0))  # renderer recomputes normals
                for pt in pts:
                    f.write(struct.pack("<3f", *pt))
                f.write(struct.pack("<H", 0))

        # face-metadata sidecar for the interactive viewer — only when requested
        # (the default rendered-views path never reads it; writing tens of MB of
        # triFace JSON on every request was wasted I/O). bodies is the HONEST
        # solid count: 0 means an unstitched surface model (volume unreliable).
        # True B-rep edges for the viewer overlay: the polyline each edge's
        # triangulation already carries. Exact feature edges, zero client cost,
        # and cached with the mesh. Silhouettes stay a client matter.
        edge_lines = []
        if with_meta:
            try:
                from OCP.TopAbs import TopAbs_EDGE
                from OCP.BRep import BRep_Tool as _BT
                emap = TopTools_IndexedMapOfShape()
                TopExp.MapShapes_s(wrapped, TopAbs_EDGE, emap)
                fmap_of_edge = TopTools_IndexedDataMapOfShapeListOfShape()
                TopExp.MapShapesAndAncestors_s(wrapped, TopAbs_EDGE, TopAbs_FACE, fmap_of_edge)
                for ei in range(1, emap.Extent() + 1):
                    edge = TopoDS.Edge_s(emap.FindKey(ei))
                    if _BT.Degenerated_s(edge):
                        continue
                    anc = fmap_of_edge.FindFromKey(edge) if fmap_of_edge.Contains(edge) else None
                    if anc is None or anc.Extent() == 0:
                        continue
                    face = TopoDS.Face_s(anc.First())
                    loc = TopLoc_Location()
                    tri = _BT.Triangulation_s(face, loc)
                    if tri is None:
                        continue
                    poly = _BT.PolygonOnTriangulation_s(edge, tri, loc)
                    if poly is None:
                        continue
                    trsf = loc.Transformation()
                    nodes = poly.Nodes()
                    pts = []
                    for k in range(1, poly.NbNodes() + 1):
                        pnt = tri.Node(nodes.Value(k)).Transformed(trsf)
                        pts.append((pnt.X(), pnt.Y(), pnt.Z()))
                    for a, b in zip(pts, pts[1:]):
                        edge_lines.extend((a[0], a[1], a[2], b[0], b[1], b[2]))
                    if len(edge_lines) > 6 * 2_000_000:
                        break
            except Exception:
                edge_lines = []
        if with_meta:
            try:
                topo = _topology_report(wrapped)
            except Exception:
                topo = None
            with open(out_path + ".json", "w") as jf:
                json.dump({"triFace": tri_face_ids, "faces": faces_meta,
                           "bodies": bodies, "skippedFaces": skipped_faces,
                           "topology": topo,
                           "bboxMm": [round(xmax - xmin, 2), round(ymax - ymin, 2), round(zmax - zmin, 2)],
                           "edgeLines": [round(v, 4) for v in edge_lines]}, jf)

        return {"status": "success", "triangles": len(tris), "stlBytes": os.path.getsize(out_path),
                "faces": meshed_faces, "bodies": bodies, "skippedFaces": skipped_faces}
    except Exception as e:
        return {"status": "error", "error": f"Tessellation error: {e}"}

def serve():
    """Warm worker: import OCP once (2.9-4.0 s measured), then answer jobs from
    stdin as JSON lines. One job per line in, one result line out:

        {"id": "...", "op": "analyze"|"tessellate", "path": "...", "out": "...",
         "withMeta": true, "timeoutMs": 120000, "env": {"CV_UNIT_SCALE": "25.4"}}
     -> {"id": "...", "result": {...}}

    Per-job environment is applied and then restored, so a DFM pass with
    CV_EXTRACT_FEATURES=1 cannot leak into the next costing. The per-job alarm
    replaces the module-level one, and is set from the job's OWN timeout — the
    parent passes the same figure, so the clean error now fires before the
    parent's SIGKILL instead of after it.
    """
    global _SERVING
    _SERVING = True
    _set_alarm(0)
    # Make absolutely sure nothing but our JSON reaches stdout.
    real_stdout = sys.stdout
    sys.stdout = sys.stderr
    print(json.dumps({"ready": True, "pid": os.getpid()}), file=real_stdout, flush=True)
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            job = json.loads(line)
        except Exception as e:
            print(json.dumps({"id": None, "result": {"status": "error", "code": "bad_job", "error": str(e)}}), file=real_stdout, flush=True)
            continue
        jid = job.get("id")
        saved = {}
        for k, v in (job.get("env") or {}).items():
            if not str(k).startswith("CV_"):
                continue
            saved[k] = os.environ.get(k)
            os.environ[k] = str(v)
        timeout_s = max(5, int(job.get("timeoutMs") or 300000) // 1000)
        _set_alarm(timeout_s)
        try:
            op = job.get("op")
            if op == "analyze":
                result = analyze(job["path"])
            elif op == "tessellate":
                result = tessellate_to_stl(job["path"], job["out"], with_meta=bool(job.get("withMeta")))
            elif op == "ping":
                result = {"status": "success", "pong": True, "lru": len(_SHAPE_LRU)}
            else:
                result = {"status": "error", "code": "bad_job", "error": f"unknown op {op!r}"}
        except (GeometryTimeout, TimeoutError):
            result = {"status": "error", "code": "timeout", "error": f"Geometry job exceeded {timeout_s}s"}
        except Exception as e:
            result = {"status": "error", "code": "crashed", "error": str(e)[:300]}
        finally:
            _set_alarm(0)
            for k, v in saved.items():
                if v is None:
                    os.environ.pop(k, None)
                else:
                    os.environ[k] = v
        print(json.dumps({"id": jid, "result": result}), file=real_stdout, flush=True)


def extract_skin_mesh(filepath, out_path):
    """Mesh a sheet part and write the two skins as welded triangle meshes.

    Feeds the TypeScript unfold (server/utils/blank-unfold.ts), which flattens
    each skin to the developed blank. Everything geometric that needs the
    kernel happens here, in pure OCP and plain Python — no numpy, which the
    Windows package does not carry — and the arithmetic happens in TypeScript.

    A skin face is one whose inward ray leaves through the opposite skin about
    one gauge away (the research prototype's two-hit test): bend faces pass,
    because the inner and outer bend face sit a gauge apart; the edge band
    fails, because its opposite is a flange width away. The skin triangles
    then split into connected components, and the two largest are the two
    skins — the edge band separates them, so they share no vertex.
    """
    try:
        from OCP.BRepMesh import BRepMesh_IncrementalMesh
        from OCP.BRep import BRep_Tool
        from OCP.TopExp import TopExp_Explorer
        from OCP.TopAbs import TopAbs_FACE, TopAbs_REVERSED
        from OCP.TopoDS import TopoDS
        from OCP.TopLoc import TopLoc_Location
        from OCP.GProp import GProp_GProps
        from OCP.BRepGProp import BRepGProp
        from OCP.IntCurvesFace import IntCurvesFace_ShapeIntersector
        from OCP.gp import gp_Pnt, gp_Dir, gp_Lin
        from OCP.Bnd import Bnd_Box
        from OCP.BRepBndLib import BRepBndLib
    except ImportError as e:
        return {"status": "error", "error": f"OCP not available: {e}"}
    try:
        wrapped, _ = _load_shape(filepath)
    except Exception as e:
        return {"status": "error", "code": "unreadable", "error": f"File load error: {e}"}
    try:
        g = GProp_GProps(); BRepGProp.VolumeProperties_s(wrapped, g); vol = g.Mass()
        g = GProp_GProps(); BRepGProp.SurfaceProperties_s(wrapped, g); sa = g.Mass()
        if vol <= 0 or sa <= 0:
            return {"status": "error", "error": "no closed solid to unfold"}
        bulk = 2.0 * vol / sa
        bends = _detect_bends(wrapped, bulk)
        t_guess = bends.get("thicknessMm") or bulk
        box = Bnd_Box(); BRepBndLib.Add_s(wrapped, box)
        x0, y0, z0, x1, y1, z1 = box.Get()
        diag = math.sqrt((x1 - x0) ** 2 + (y1 - y0) ** 2 + (z1 - z0) ** 2)
        lin = max(0.15, min(1.0, diag / 600.0))
        BRepMesh_IncrementalMesh(wrapped, lin, False, 0.3, True)

        key, verts, tris, tface = {}, [], [], []
        face_best = {}                       # fid -> (area, centroid, outward normal)
        fid = 0
        exp = TopExp_Explorer(wrapped, TopAbs_FACE)
        while exp.More():
            f = TopoDS.Face_s(exp.Current()); exp.Next()
            loc = TopLoc_Location()
            tri = BRep_Tool.Triangulation_s(f, loc)
            this = fid; fid += 1
            if tri is None:
                continue
            trsf = loc.Transformation()
            ids = []
            for i in range(1, tri.NbNodes() + 1):
                p = tri.Node(i).Transformed(trsf)
                k = (round(p.X(), 4), round(p.Y(), 4), round(p.Z(), 4))
                j = key.get(k)
                if j is None:
                    j = len(verts); key[k] = j; verts.append((p.X(), p.Y(), p.Z()))
                ids.append(j)
            rev = f.Orientation() == TopAbs_REVERSED
            for j in range(1, tri.NbTriangles() + 1):
                a, b, c = tri.Triangle(j).Get()
                a, b, c = ids[a - 1], ids[b - 1], ids[c - 1]
                if a == b or b == c or c == a:
                    continue
                if rev:
                    b, c = c, b
                A, B, C = verts[a], verts[b], verts[c]
                ux, uy, uz = B[0] - A[0], B[1] - A[1], B[2] - A[2]
                vx, vy, vz = C[0] - A[0], C[1] - A[1], C[2] - A[2]
                nx, ny, nz = uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx
                nl = math.sqrt(nx * nx + ny * ny + nz * nz)
                if nl < 1e-12:
                    continue
                area = 0.5 * nl
                tris.append((a, b, c)); tface.append(this)
                best = face_best.get(this)
                if best is None or area > best[0]:
                    cen = ((A[0] + B[0] + C[0]) / 3, (A[1] + B[1] + C[1]) / 3, (A[2] + B[2] + C[2]) / 3)
                    face_best[this] = (area, cen, (nx / nl, ny / nl, nz / nl))
        if len(tris) > int(os.environ.get("CV_MAX_TRIANGLES", "5000000")):
            return {"status": "error", "error": "mesh too large to unfold"}

        # Two-hit ray test per face: start half a gauge outside the face, cast
        # inward, and take the gap between the first two crossings.
        isec = IntCurvesFace_ShapeIntersector(); isec.Load(wrapped, 1e-6)
        hit = {}
        for f_id, (_, cen, n) in face_best.items():
            d = (-n[0], -n[1], -n[2])
            o = (cen[0] - d[0] * 0.5 * t_guess, cen[1] - d[1] * 0.5 * t_guess, cen[2] - d[2] * 0.5 * t_guess)
            try:
                isec.Perform(gp_Lin(gp_Pnt(*o), gp_Dir(*d)), 0.0, 1e6)
                ws = sorted(isec.WParameter(k) for k in range(1, isec.NbPnt() + 1))
            except Exception:
                continue
            ws = [w for w in ws if w > 1e-6]
            if len(ws) >= 2:
                hit[f_id] = ws[1] - ws[0]
        small = sorted(h for h in hit.values() if h < 3 * t_guess)
        t = small[len(small) // 2] if small else t_guess
        if bends.get("thicknessSource") == "bend-pairs":
            t = bends["thicknessMm"]           # the modelled gauge beats a median of chords
        skin_faces = {f_id for f_id, h in hit.items() if 0.6 * t < h < 1.6 * t}
        skin_tris = [i for i, f_id in enumerate(tface) if f_id in skin_faces]
        if not skin_tris:
            return {"status": "error", "error": "no skin faces found — not a sheet part"}

        # Connected components of the skin triangles across shared edges.
        parent = {}
        def find(x):
            while parent.get(x, x) != x:
                parent[x] = parent.get(parent[x], parent[x]); x = parent[x]
            return x
        def union(a, b):
            ra, rb = find(a), find(b)
            if ra != rb: parent[ra] = rb
        edge_owner = {}
        for i in skin_tris:
            a, b, c = tris[i]
            for u, v in ((a, b), (b, c), (c, a)):
                e = (u, v) if u < v else (v, u)
                j = edge_owner.get(e)
                if j is None: edge_owner[e] = i
                else: union(i, j)
        comps = {}
        for i in skin_tris:
            comps.setdefault(find(i), []).append(i)
        def tri_area(i):
            A, B, C = verts[tris[i][0]], verts[tris[i][1]], verts[tris[i][2]]
            ux, uy, uz = B[0] - A[0], B[1] - A[1], B[2] - A[2]
            vx, vy, vz = C[0] - A[0], C[1] - A[1], C[2] - A[2]
            nx, ny, nz = uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx
            return 0.5 * math.sqrt(nx * nx + ny * ny + nz * nz)
        ranked = sorted(comps.values(), key=lambda c: sum(tri_area(i) for i in c), reverse=True)[:2]
        skins = []
        for comp in ranked:
            remap, cv, ct = {}, [], []
            for i in comp:
                row = []
                for vtx in tris[i]:
                    j = remap.get(vtx)
                    if j is None:
                        j = len(cv); remap[vtx] = j; cv.append([round(x, 4) for x in verts[vtx]])
                    row.append(j)
                ct.append(row)
            skins.append({"vertices": cv, "triangles": ct,
                          "area3dMm2": round(sum(tri_area(i) for i in comp), 2)})
        out = {"status": "success", "thicknessMm": round(t, 3),
               "thicknessSource": bends.get("thicknessSource", "bulk-wall"),
               "bendCount": bends.get("bendCount", 0), "linearDeflectionMm": round(lin, 3),
               "volumeMm3": round(vol, 2), "surfaceAreaMm2": round(sa, 2),
               "triangles": len(tris), "skinFaces": len(skin_faces), "faces": fid, "skins": skins}
        with open(out_path, "w") as fh:
            json.dump(out, fh)
        return {"status": "success", "triangles": len(tris), "skins": len(skins), "thicknessMm": out["thicknessMm"]}
    except Exception as e:
        return {"status": "error", "error": f"skin mesh failed: {e}"}


if __name__ == "__main__":
    if len(sys.argv) >= 2 and sys.argv[1] == "--serve":
        serve()
        sys.exit(0)
    if len(sys.argv) >= 4 and sys.argv[1] == "--skin-mesh":
        result = extract_skin_mesh(sys.argv[2], sys.argv[3])
        print(json.dumps(result))
        sys.exit(0 if result.get("status") == "success" else 1)
    if len(sys.argv) >= 4 and sys.argv[1] == "--stl":
        result = tessellate_to_stl(sys.argv[2], sys.argv[3], with_meta="--with-meta" in sys.argv[4:])
        print(json.dumps(result))
        sys.exit(0 if result.get("status") == "success" else 1)
    if len(sys.argv) < 2:
        print(json.dumps({"status": "error", "error": "Usage: python3 cad-geometry-engine.py <filepath> | --stl <in> <out>"}))
        sys.exit(1)
    fp = sys.argv[1]
    if not os.path.exists(fp):
        print(json.dumps({"status": "error", "error": f"File not found: {fp}"}))
        sys.exit(1)
    try:
        result = analyze(fp)
    except GeometryTimeout:
        result = {"status": "error", "code": "timeout", "error": "Geometry analysis timed out — the part is too large or complex for the time allowed"}
    print(json.dumps(result))
    sys.exit(0 if result.get("status") == "success" else 1)
