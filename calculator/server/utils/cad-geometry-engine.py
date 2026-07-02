#!/usr/bin/env python3
"""
CostVision CAD Geometry Engine — Open CASCADE (OCCT) via CadQuery
Extracts precise geometric properties from STEP / IGES files.
Output: single-line JSON to stdout.
"""
import sys, json, os, math, signal, random

# Hard 110-second limit (Unix only)
def _timeout(_s, _f): raise TimeoutError("Geometry analysis timed out")
signal.signal(signal.SIGALRM, _timeout)
signal.alarm(110)


# ─── Surface / edge type classification ──────────────────────────────────────

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

def analyze(filepath: str) -> dict:
    try:
        import cadquery as cq
        from OCP.BRepGProp import BRepGProp
        from OCP.GProp import GProp_GProps
        from OCP.BRepBndLib import BRepBndLib
        from OCP.Bnd import Bnd_Box
    except ImportError as e:
        return {"status": "error", "error": f"CadQuery/OCP not available: {e}"}

    ext = os.path.splitext(filepath)[1].lower()

    # ── Load file ──────────────────────────────────────────────────────────────
    shape = None
    try:
        if ext in (".step", ".stp"):
            shape = cq.importers.importStep(filepath).val()
        elif ext in (".iges", ".igs"):
            from OCP.IGESControl import IGESControl_Reader
            from OCP.IFSelect import IFSelect_RetDone
            reader = IGESControl_Reader()
            if reader.ReadFile(filepath) != IFSelect_RetDone:
                return {"status": "error", "error": "IGESControl_Reader failed"}
            reader.TransferRoots()
            shape = cq.Shape.cast(reader.OneShape())
        else:
            return {"status": "error", "error": f"Unsupported format: {ext}"}
    except Exception as e:
        return {"status": "error", "error": f"File load error: {e}"}

    if shape is None:
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
        faces = shape.Faces()
        edges = shape.Edges()
        face_counts, cyl_radii_all = _classify_faces(faces)
        edge_counts, circle_radii = _classify_edges(edges)

        # ── Feature extraction (CORRECTED hole count) ─────────────────────────
        hole_instances   = [r for r in cyl_radii_all if r < 30]   # total count
        boss_instances   = [r for r in cyl_radii_all if r >= 30]  # total count
        hole_radii_uniq  = sorted(set(round(r, 1) for r in hole_instances))
        boss_radii_uniq  = sorted(set(round(r, 1) for r in boss_instances))
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
                cyl_face_count=len(cyl_radii_all),
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
                "estimatedHoleCount":  len(hole_instances),   # FIXED: total, not unique
                "holeRadiiMm":         hole_radii_uniq[:20],  # unique radii for display
                "bossShaftCount":      len(boss_instances),
                "bossShaftRadiiMm":    boss_radii_uniq[:10],
                "threadFeaturesDetected": has_threads,
                "planarFaceCount":   face_counts.get("PLANE", 0),
                "freeFormFaceCount": (
                    face_counts.get("BSPLINE", 0) + face_counts.get("BEZIER", 0)
                ),
                "planarFaceAreaMm2": round(planar_area, 0),
            },
            # ── New precision analysis fields ─────────────────────────────
            "wallThickness": wall_stats,
            "draftAnalysis": draft_info,
            "setupAnalysis": setup_info,
            "cncCycleTimeEstimate": cnc_time,
            # ── Parametric cost models ──────────────────────────────────────
            "toolingCostEstimates": _estimate_tooling_costs(
                faces_total=len(faces),
                hole_count=len(hole_instances),
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
                hole_count=len(hole_instances),
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
                    hole_count=len(hole_instances),
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

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"status": "error", "error": "Usage: python3 cad-geometry-engine.py <filepath>"}))
        sys.exit(1)
    fp = sys.argv[1]
    if not os.path.exists(fp):
        print(json.dumps({"status": "error", "error": f"File not found: {fp}"}))
        sys.exit(1)
    result = analyze(fp)
    print(json.dumps(result))
    sys.exit(0 if result.get("status") == "success" else 1)
