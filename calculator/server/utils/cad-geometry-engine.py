#!/usr/bin/env python3
"""
CostVision CAD Geometry Engine — Open CASCADE (OCCT) via CadQuery
Extracts precise geometric properties from STEP / IGES files.
Output: single-line JSON to stdout.
"""
import sys, json, os, math, signal, random

# Best-effort self-timeout (Unix only). NOTE: Python signal handlers only run
# between bytecode instructions, so this CANNOT interrupt a single long native
# OCCT call (e.g. a pathological BRepMesh_IncrementalMesh). The authoritative
# timeout is the Node parent's SIGKILL in geometry-bridge.ts; we self-abort ~10 s
# earlier so a clean structured error beats the kill. Derived from the shared
# CV_TESS_TIMEOUT_MS (default 300 s) so all layers move together.
def _timeout(_s, _f): raise TimeoutError("Geometry analysis timed out")
signal.signal(signal.SIGALRM, _timeout)
signal.alarm(max(30, int(os.environ.get("CV_TESS_TIMEOUT_MS", "300000")) // 1000 - 10))


# ─── Surface / edge type classification ──────────────────────────────────────

def _extract_feature_table(wrapped, extents):
    """Exact hole/boss feature table from B-rep cylindrical faces.

    Per cylinder face: diameter (exact kernel radius ×2), DEPTH from the
    cylinder's V-parameter span (V is arc length along the axis — exact),
    hole-vs-boss from concavity (face orientation XOR axis handedness), and
    through/blind by comparing depth to the bbox extent projected onto the
    axis. Faces split by booleans (half-cylinders) share the same underlying
    axis, so instances are deduped by (axis point, direction) before counting.
    Returns rows grouped by (kind, diameter, depth, through) with counts.
    """
    from OCP.TopExp import TopExp_Explorer
    from OCP.TopAbs import TopAbs_FACE, TopAbs_Orientation
    from OCP.TopoDS import TopoDS
    from OCP.BRepAdaptor import BRepAdaptor_Surface
    from OCP.GeomAbs import GeomAbs_SurfaceType

    feats = {}   # physical-feature ident -> summed arc span + attributes
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
            depth = abs(ad.LastVParameter() - ad.FirstVParameter())
            if depth <= 0.01 or not math.isfinite(depth):
                continue
            arc = abs(ad.LastUParameter() - ad.FirstUParameter())   # radians
            ax = cyl.Axis()
            d = ax.Direction()
            p = ax.Location()
            axis_extent = abs(d.X()) * extents[0] + abs(d.Y()) * extents[1] + abs(d.Z()) * extents[2]
            through = axis_extent > 0 and depth >= axis_extent - max(0.1, axis_extent * 0.02)
            reversed_param = not cyl.Position().Direct()
            reversed_face = face.Orientation() == TopAbs_Orientation.TopAbs_REVERSED
            hole = reversed_face != reversed_param
            # identity: same axis + radius + span = same physical feature
            ident = (round(p.X(), 2), round(p.Y(), 2), round(p.Z(), 2),
                     round(d.X(), 3), round(d.Y(), 3), round(d.Z(), 3),
                     round(r, 3), round(depth, 1), hole)
            f = feats.get(ident)
            if f is not None:
                f["arc"] += arc          # halves of a boolean-split bore re-join here
            else:
                feats[ident] = {"kind": 'hole' if hole else 'boss', "dia": round(r * 2, 2),
                                "depth": round(depth, 1), "through": bool(through), "arc": arc}
        except Exception:
            continue

    instances = {}
    for f in feats.values():
        # Partial concave/convex arcs — pocket corner radii (~90°), slot ends
        # (~180°), edge fillets — are NOT drillable bores or turned shafts.
        # Require a near-full cylinder (≥ ~300° summed) to count as a feature.
        if f["arc"] < 5.2:
            continue
        key = (f["kind"], f["dia"], f["depth"], f["through"])
        instances[key] = instances.get(key, 0) + 1

    rows = []
    for (kind, dia, depth, through), cnt in instances.items():
        rows.append({
            "kind": kind,
            "diaMm": dia,
            "depthMm": depth,
            "through": through if kind == "hole" else None,
            "count": cnt,
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
    pockets = {}                          # (area, depth) -> count
    props = GProp_GProps()
    exp = TopExp_Explorer(wrapped, TopAbs_FACE)
    while exp.More():
        face = TopoDS.Face_s(exp.Current())
        exp.Next()
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
            if is_pocket:
                key = (round(area, 0), round(depth, 1))
                pockets[key] = pockets.get(key, 0) + 1
        except Exception:
            continue

    rows = []
    # facing: keep the largest few distinct faces (datum/mating candidates)
    for area, count in sorted(faces_area.items(), reverse=True)[:8]:
        rows.append({"kind": "face", "diaMm": 0.0, "depthMm": 0.0,
                     "through": None, "count": count, "areaMm2": area})
    for (area, depth), count in sorted(pockets.items(), reverse=True)[:8]:
        rows.append({"kind": "pocket", "diaMm": 0.0, "depthMm": depth,
                     "through": None, "count": count, "areaMm2": area})
    return rows


def _detect_bends(wrapped, sheet_thickness):
    """Phase 3 — sheet-metal bend detection (forming feature).

    A press-brake bend is a cylindrical face spanning the part width with a
    small radius (≈ the material thickness). Inner + outer bend faces share an
    axis, so distinct axes = bend count. Uses the RAY-CAST sheet thickness (the
    bounding box of a bent part is not thin) to size the filters and to gate:
    only plate-like parts (thin, uniform wall) are treated as sheet metal.
    A bend cylinder is LONG along its axis (spans width) — that separates it
    from a drilled hole, whose cylinder is only as long as the sheet is thick.
    """
    from OCP.TopExp import TopExp_Explorer
    from OCP.TopAbs import TopAbs_FACE
    from OCP.TopoDS import TopoDS
    from OCP.BRepAdaptor import BRepAdaptor_Surface
    from OCP.GeomAbs import GeomAbs_SurfaceType

    t = sheet_thickness
    # Gate: needs a real, thin sheet thickness. Non-sheet parts return 0.
    if not t or t <= 0 or t > 8.0:
        return {"bendCount": 0, "totalBendLengthMm": 0.0, "thicknessMm": round(t or 0.0, 2)}

    max_bend_r = max(8.0, t * 6)          # bend radius ≈ 0.5–3× thickness (headroom to 6×)
    min_bend_len = max(10.0, t * 5)       # a bend spans real width; a hole is only ~t deep

    bends = {}                            # axis identity -> length
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
        except Exception:
            continue

    return {
        "bendCount": len(bends),
        "totalBendLengthMm": round(sum(bends.values()), 1),
        "thicknessMm": round(t, 2),
    }


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


def _topology_signals(shape):
    """Sealed-hollow-body vs open-drape topology signal.

    voidCount = shells − solids: a solid enclosing a sealed cavity carries an
    extra (inner) shell, so a blow-/rotational-moulded tank/bottle/duct scores
    voidCount ≥ 1, while an injection-moulded / thermoformed open drape (bumper,
    trim, cover) scores 0. freeEdgeCount (edges bounding only one face) confirms
    an open sheet body. Cheap topology counts — no meshing.
    """
    from OCP.TopExp import TopExp_Explorer, TopExp
    from OCP.TopAbs import TopAbs_SHELL, TopAbs_SOLID, TopAbs_EDGE, TopAbs_FACE
    from OCP.TopTools import TopTools_IndexedDataMapOfShapeListOfShape

    # Accept either a cadquery Shape wrapper or a raw TopoDS_Shape.
    raw = getattr(shape, "wrapped", shape)

    def _count(kind):
        e = TopExp_Explorer(raw, kind); n = 0
        while e.More():
            n += 1; e.Next()
        return n

    solids = _count(TopAbs_SOLID)
    shells = _count(TopAbs_SHELL)
    emap = TopTools_IndexedDataMapOfShapeListOfShape()
    TopExp.MapShapesAndAncestors_s(raw, TopAbs_EDGE, TopAbs_FACE, emap)
    total_e = emap.Extent()
    free_e = sum(1 for i in range(1, total_e + 1) if emap.FindFromIndex(i).Extent() == 1)
    # Each solid contributes one outer shell; extra shells are enclosed voids.
    void_count = max(0, shells - max(1, solids))
    encloses_void = void_count >= 1
    return {
        "available": True,
        "solidCount": solids,
        "shellCount": shells,
        "voidCount": void_count,
        "freeEdgeCount": free_e,
        "freeEdgeRatio": round(free_e / max(1, total_e), 4),
        # Sealed hollow body → blow/roto candidate. Open drape → injection/thermoform.
        "enclosesSealedVoid": bool(encloses_void),
        "openShell": bool(not encloses_void),
    }


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

    sample = random.sample(planar_outer, min(max_samples, len(planar_outer)))
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
    return {
        "minMm": round(min(thicknesses), 2),
        "maxMm": round(max(thicknesses), 2),
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

def _compute_draft_analysis(faces, draw_dir=(0.0, 0.0, 1.0)) -> dict:
    """
    Classify faces by draft angle relative to the die-draw direction.
    Undercut  → face normal has a component AGAINST the draw direction (angle > 90°).
    Zero-draft → face nearly perpendicular to draw (|90° - angle| < 1°).
    Adequate  → face has ≥ 1° positive draft.
    """
    from OCP.BRep import BRep_Tool
    from OCP.GeomLProp import GeomLProp_SLProps
    from OCP.BRepTools import BRepTools
    from OCP.GeomAdaptor import GeomAdaptor_Surface
    from OCP.GeomAbs import GeomAbs_Plane, GeomAbs_Cylinder

    dx, dy, dz = draw_dir
    d_mag = math.sqrt(dx*dx + dy*dy + dz*dz)

    undercuts, zero_draft, adequate = 0, 0, 0
    pos_drafts = []

    for face in faces:
        try:
            surf = BRep_Tool.Surface_s(face.wrapped)
            adaptor = GeomAdaptor_Surface(surf)
            if adaptor.GetType() not in (GeomAbs_Plane, GeomAbs_Cylinder):
                continue
            umin, umax, vmin, vmax = BRepTools.UVBounds_s(face.wrapped)
            props = GeomLProp_SLProps(surf, (umin+umax)/2, (vmin+vmax)/2, 1, 1e-7)
            if not props.IsNormalDefined():
                continue
            N = props.Normal()
            nx, ny, nz = N.X(), N.Y(), N.Z()
            n_mag = math.sqrt(nx*nx + ny*ny + nz*nz)
            if n_mag < 1e-10:
                continue
            # cos(angle) between face normal and draw direction
            cos_a = (nx*dx + ny*dy + nz*dz) / (n_mag * d_mag)
            cos_a = max(-1.0, min(1.0, cos_a))
            angle_deg = math.degrees(math.acos(cos_a))
            # Draft angle = deviation from perpendicular (90°)
            draft = abs(90.0 - angle_deg)

            if angle_deg > 90.5:               # normal against draw → undercut
                undercuts += 1
            elif draft < 1.0:                  # < 1° from perpendicular → zero-draft
                zero_draft += 1
            else:
                adequate += 1
                if angle_deg < 90.0:           # positive draft only
                    pos_drafts.append(round(draft, 2))
        except Exception:
            continue

    return {
        "drawDirectionXYZ": list(draw_dir),
        "undercutFaceCount": undercuts,
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
    AXES = [(1,0,0,"+X"),(-1,0,0,"-X"),(0,1,0,"+Y"),(0,-1,0,"-Y"),(0,0,1,"+Z"),(0,0,-1,"-Z")]

    cap = 600  # sample cap for large models
    sample_faces = faces[:cap]

    for face in sample_faces:
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
                    matched = True
                    break
            if not matched:
                clusters.append((nx, ny, nz, 1))
        except Exception:
            continue

    # Snap each cluster to nearest principal axis for label
    directions = []
    for cx, cy, cz, cnt in sorted(clusters, key=lambda x: -x[3]):
        best_label, best_dot = "+Z", -1.0
        for ax, ay, az, label in AXES:
            d = abs(cx*ax + cy*ay + cz*az)
            if d > best_dot:
                best_dot, best_label = d, label
        directions.append({"directionLabel": best_label, "faceCount": cnt})

    # Deduplicate labels (keep highest count for each label)
    seen: dict[str, dict] = {}
    for d in directions:
        lbl = d["directionLabel"]
        if lbl not in seen or d["faceCount"] > seen[lbl]["faceCount"]:
            seen[lbl] = d

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


def analyze(filepath: str) -> dict:
    try:
        from OCP.BRepGProp import BRepGProp
        from OCP.GProp import GProp_GProps
        from OCP.BRepBndLib import BRepBndLib
        from OCP.Bnd import Bnd_Box
        from OCP.IFSelect import IFSelect_RetDone
    except ImportError as e:
        return {"status": "error", "error": f"OCP not available: {e}"}

    ext = os.path.splitext(filepath)[1].lower()

    # ── Load file (pure OCP — no cadquery dependency) ─────────────────────────
    shape = None
    try:
        if ext in (".step", ".stp"):
            from OCP.STEPControl import STEPControl_Reader
            reader = STEPControl_Reader()
            if reader.ReadFile(filepath) != IFSelect_RetDone:
                return {"status": "error", "error": "STEPControl_Reader failed"}
            reader.TransferRoots()
            shape = _ShapeShim(reader.OneShape())
        elif ext in (".iges", ".igs"):
            from OCP.IGESControl import IGESControl_Reader
            reader = IGESControl_Reader()
            if reader.ReadFile(filepath) != IFSelect_RetDone:
                return {"status": "error", "error": "IGESControl_Reader failed"}
            reader.TransferRoots()
            shape = _ShapeShim(reader.OneShape())
        else:
            return {"status": "error", "error": f"Unsupported format: {ext}"}
    except Exception as e:
        return {"status": "error", "error": f"File load error: {e}"}

    if shape is None or shape.wrapped.IsNull():
        return {"status": "error", "error": "No shape loaded"}

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
        bbox = Bnd_Box()
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
            topology = _topology_signals(shape)
        except Exception as _te:  # never let topology break the pipeline
            topology = {"available": False, "note": str(_te)[:120]}

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
        try:
            draft_info = _compute_draft_analysis(faces)
        except Exception:
            draft_info = None

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
            "topology": topology,
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
            },
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
            "sheetMetal": _detect_bends(wrapped, wall_stats["minMm"] if wall_stats else None),
            # ── New precision analysis fields ─────────────────────────────
            "wallThickness": wall_stats,
            "draftAnalysis": draft_info,
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
            "unitWarning": _validate_bbox(x_sz, y_sz, z_sz),
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
        from OCP.TopTools import TopTools_IndexedMapOfShape
    except ImportError as e:
        return {"status": "error", "error": f"OCP not available: {e}"}

    ext = os.path.splitext(filepath)[1].lower()
    wrapped = None
    try:
        if ext in (".step", ".stp"):
            from OCP.STEPControl import STEPControl_Reader
            reader = STEPControl_Reader()
            if reader.ReadFile(filepath) != IFSelect_RetDone:
                return {"status": "error", "error": "STEPControl_Reader failed"}
            reader.TransferRoots()
            wrapped = reader.OneShape()
        elif ext in (".iges", ".igs"):
            from OCP.IGESControl import IGESControl_Reader
            reader = IGESControl_Reader()
            if reader.ReadFile(filepath) != IFSelect_RetDone:
                return {"status": "error", "error": "IGESControl_Reader failed"}
            reader.TransferRoots()
            wrapped = reader.OneShape()
        else:
            return {"status": "error", "error": f"Unsupported format: {ext}"}
    except Exception as e:
        return {"status": "error", "error": f"File load error: {e}"}
    if wrapped is None or wrapped.IsNull():
        return {"status": "error", "error": "No shape loaded"}

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
        BRepMesh_IncrementalMesh(wrapped, diag / 500.0, False, 0.3, True)

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
        faces_meta = []     # per-face exact kernel data: type, radii, area, body, hole/boss
        skipped_faces = 0   # faces with no/failed triangulation — mesh has holes there
        face_id = 0
        for map_idx in range(1, face_map.Extent() + 1):
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
            faces_meta.append({
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
            face_id += 1

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
        if with_meta:
            with open(out_path + ".json", "w") as jf:
                json.dump({"triFace": tri_face_ids, "faces": faces_meta,
                           "bodies": bodies, "skippedFaces": skipped_faces}, jf)

        return {"status": "success", "triangles": len(tris), "stlBytes": os.path.getsize(out_path),
                "faces": len(faces_meta), "bodies": bodies, "skippedFaces": skipped_faces}
    except Exception as e:
        return {"status": "error", "error": f"Tessellation error: {e}"}

if __name__ == "__main__":
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
    result = analyze(fp)
    print(json.dumps(result))
    sys.exit(0 if result.get("status") == "success" else 1)
