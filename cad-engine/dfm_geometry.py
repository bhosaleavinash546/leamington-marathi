#!/usr/bin/env python3
"""
Tessellation-based DFM geometry: draft, undercuts, wall thickness, setups.

WHY THIS EXISTS — the analytic (B-rep) versions it replaces were wrong in ways
that only show up on real parts, and both failures were proven with fixtures:

  * The old draft analysis inspected only PLANE and CYLINDER faces. Real die-cast
    and moulded automotive parts are mostly freeform, so on a truncated pyramid
    with an EXACT 3.000 deg draft on all four walls it reported ZERO drafted faces
    and two phantom undercuts (the flat top and bottom). A report that tells an
    engineer a properly drafted part has no draft is worse than no report.
  * The old wall thickness ray-cast accepted any hit, so on a 10 mm plate it
    returned max 39.95 mm — the part's WIDTH. It also sampled the UV midpoint of
    each face, which for a trimmed face (one with a hole in it) can land outside
    the face entirely; that is why it managed only 4 valid samples.

Working on the tessellation fixes both: a triangle centroid is always inside its
face, and a triangle has a normal whatever the underlying surface type is. It is
also fast — full tessellation plus per-triangle analysis of a small part measures
at ~0.02 s, which is what buys us the draw-direction sweep below.

Nothing here estimates. Every number is a measurement over triangles, and where a
measurement cannot be trusted the caller is told (`samples`, `confidence`,
`unmeasuredAreaPct`) rather than handed a plausible-looking figure.
"""
import math

# A face whose normal is within this angle of the draw axis is a parting-plane
# face (a tool END face), not a wall that needs draft. Without this, every flat
# top surface reads as "90 degrees of draft".
PARTING_TOL_DEG = 5.0
# A thickness ray must land on a surface facing roughly back at the start face.
# 60 deg is loose enough for tapered walls, tight enough to reject a glancing hit
# on an unrelated surface.
OPPOSED_TOL_DEG = 60.0
# Ray start offset along the normal, in mm — far enough off the surface to avoid
# re-hitting the face we started from, small enough not to skip a thin wall.
EPS_MM = 0.01


# ─── Tessellation ─────────────────────────────────────────────────────────────

def tessellate(shape, deflection=0.1, angular=0.5, max_triangles=400_000):
    """Mesh the shape and return flat per-triangle arrays.

    Returns {area, nx,ny,nz, cx,cy,cz, face} lists plus totals. The normal honours
    TopAbs_REVERSED so it always points OUT of the solid — get that wrong and
    every draft sign flips.
    """
    from OCP.BRep import BRep_Tool
    from OCP.BRepMesh import BRepMesh_IncrementalMesh
    from OCP.gp import gp_Vec
    from OCP.TopAbs import TopAbs_FACE, TopAbs_REVERSED
    from OCP.TopExp import TopExp_Explorer
    from OCP.TopLoc import TopLoc_Location
    from OCP.TopoDS import TopoDS

    BRepMesh_IncrementalMesh(shape, deflection, False, angular, True)

    area, nx, ny, nz, cx, cy, cz, fidx = [], [], [], [], [], [], [], []
    total = 0.0
    face_i = 0
    ex = TopExp_Explorer(shape, TopAbs_FACE)
    while ex.More():
        face = TopoDS.Face_s(ex.Current())
        face_i += 1
        loc = TopLoc_Location()
        tri = BRep_Tool.Triangulation_s(face, loc)
        if tri is not None:
            trsf = loc.Transformation()
            reversed_ = face.Orientation() == TopAbs_REVERSED
            for i in range(1, tri.NbTriangles() + 1):
                a, b, c = tri.Triangle(i).Get()
                p1 = tri.Node(a).Transformed(trsf)
                p2 = tri.Node(b).Transformed(trsf)
                p3 = tri.Node(c).Transformed(trsf)
                v = gp_Vec(p1, p2).Crossed(gp_Vec(p1, p3))
                mag = v.Magnitude()
                if mag < 1e-12:
                    continue
                ar = mag / 2.0
                v.Normalize()
                sx, sy, sz = v.X(), v.Y(), v.Z()
                if reversed_:
                    sx, sy, sz = -sx, -sy, -sz
                area.append(ar)
                nx.append(sx); ny.append(sy); nz.append(sz)
                cx.append((p1.X() + p2.X() + p3.X()) / 3.0)
                cy.append((p1.Y() + p2.Y() + p3.Y()) / 3.0)
                cz.append((p1.Z() + p2.Z() + p3.Z()) / 3.0)
                fidx.append(face_i)
                total += ar
                if len(area) >= max_triangles:
                    break
        if len(area) >= max_triangles:
            break
        ex.Next()

    return {"area": area, "nx": nx, "ny": ny, "nz": nz, "cx": cx, "cy": cy, "cz": cz,
            "face": fidx, "count": len(area), "totalAreaMm2": total,
            "deflection": deflection,
            "truncated": len(area) >= max_triangles}


def _visibility_offset(tess):
    """How far off the surface a visibility ray must start.

    On a CURVED face the triangle chord sits INSIDE the true surface by up to the
    mesh deflection, so a token offset leaves the ray origin buried in the solid —
    it then hits the part's own far side and the face reads as occluded. That bug
    made every boss and every cylindrical wall report as an undercut. The mesher
    guarantees sagitta <= deflection, so clearing 2x deflection always escapes.
    """
    return max(EPS_MM, 2.0 * tess.get("deflection", 0.1))


# ─── Draft, undercuts and draw direction ─────────────────────────────────────

def _escapes(inter, px, py, pz, dx, dy, dz, reach):
    """True when a ray from (p) along (d) leaves the solid without hitting it."""
    from OCP.gp import gp_Dir, gp_Lin, gp_Pnt
    try:
        inter.PerformNearest(gp_Lin(gp_Pnt(px, py, pz), gp_Dir(dx, dy, dz)), 1e-4, reach)
        return not (inter.IsDone() and inter.NbPnt() > 0)
    except Exception:
        # A degenerate ray tells us nothing; claiming "escapes" would invent a
        # releasing face, so fail closed and let it fall through to undercut.
        return False


def classify_draft(tess, inter, draw, min_draft_deg=1.0, reach=1e5):
    """Classify every triangle against a draw axis. Area-weighted, four-way.

    The four-way split is the whole game. A vertical wall with no draft is a DRAG
    face — ugly, fixable by tilting it a degree. A face occluded in both halves is
    an UNDERCUT — it needs a slide or a lifter and costs real tooling money.
    Collapsing those two into one number is the single easiest way to produce a
    confident, wrong report: an early probe of mine called a clean box 62.6%
    undercut by doing exactly that.
    """
    dx, dy, dz = draw
    dm = math.sqrt(dx * dx + dy * dy + dz * dz) or 1.0
    dx, dy, dz = dx / dm, dy / dm, dz / dm
    parting_min = 90.0 - PARTING_TOL_DEG
    off = _visibility_offset(tess)

    buckets = {"partingParallel": 0.0, "releasing": 0.0, "zeroDraft": 0.0, "undercut": 0.0}
    undercut_faces, zero_faces = {}, {}
    drafts = []          # (draftDeg, area) over wall-like releasing faces only
    histogram = {}

    for i in range(tess["count"]):
        ar = tess["area"][i]
        nxi, nyi, nzi = tess["nx"][i], tess["ny"][i], tess["nz"][i]
        cos_a = max(-1.0, min(1.0, nxi * dx + nyi * dy + nzi * dz))
        # sd in [-90, +90]: +90 faces the +draw tool half, 0 is parallel to the
        # draw (zero draft), -90 faces the -draw half.
        sd = 90.0 - math.degrees(math.acos(cos_a))
        mag = abs(sd)

        px = tess["cx"][i] + nxi * off
        py = tess["cy"][i] + nyi * off
        pz = tess["cz"][i] + nzi * off

        if mag < 1e-6:
            vis = (_escapes(inter, px, py, pz, dx, dy, dz, reach)
                   or _escapes(inter, px, py, pz, -dx, -dy, -dz, reach))
        elif sd > 0:
            vis = _escapes(inter, px, py, pz, dx, dy, dz, reach)
        else:
            vis = _escapes(inter, px, py, pz, -dx, -dy, -dz, reach)

        if not vis:
            kind = "undercut"
            undercut_faces[tess["face"][i]] = undercut_faces.get(tess["face"][i], 0.0) + ar
        elif mag >= parting_min:
            kind = "partingParallel"
        elif mag >= min_draft_deg:
            kind = "releasing"
            drafts.append((mag, ar))
            histogram[round(mag)] = histogram.get(round(mag), 0.0) + ar
        else:
            kind = "zeroDraft"
            zero_faces[tess["face"][i]] = zero_faces.get(tess["face"][i], 0.0) + ar
            histogram[round(mag)] = histogram.get(round(mag), 0.0) + ar
        buckets[kind] += ar

    total = tess["totalAreaMm2"] or 1.0
    wall_area = buckets["releasing"] + buckets["zeroDraft"] + buckets["undercut"]
    return {
        "drawDirectionXYZ": [round(dx, 6), round(dy, 6), round(dz, 6)],
        "minDraftDeg": min_draft_deg,
        "areaMm2": {k: round(v, 1) for k, v in buckets.items()},
        "areaPct": {k: round(100.0 * v / total, 2) for k, v in buckets.items()},
        # Of the faces that actually need draft (walls), how much is short of it?
        # This is the number a die caster asks for.
        "wallAreaBelowMinDraftPct": round(
            100.0 * (buckets["zeroDraft"] + buckets["undercut"]) / wall_area, 2) if wall_area > 0 else 0.0,
        "minWallDraftDeg": round(min(d for d, _ in drafts), 2) if drafts else None,
        "maxWallDraftDeg": round(max(d for d, _ in drafts), 2) if drafts else None,
        "areaWeightedDraftDeg": round(sum(d * a for d, a in drafts) / sum(a for _, a in drafts), 2) if drafts else None,
        "undercutFaceCount": len(undercut_faces),
        "undercutFaceIds": sorted(undercut_faces, key=undercut_faces.get, reverse=True)[:40],
        "zeroDraftFaceCount": len(zero_faces),
        "zeroDraftFaceIds": sorted(zero_faces, key=zero_faces.get, reverse=True)[:40],
        "draftHistogramDegToAreaMm2": {str(k): round(v, 1) for k, v in sorted(histogram.items())},
    }


def choose_draw_direction(tess, inter, candidates=None, min_draft_deg=1.0):
    """Score candidate draw axes and return the best plus the alternatives.

    Hard-coding +Z (what the old code did) is a guess dressed as an answer. The
    tessellation is cheap enough to just try the axes and let undercut area — the
    thing that actually buys slides and lifters — decide.
    """
    if candidates is None:
        candidates = [(0, 0, 1), (0, 1, 0), (1, 0, 0)]
    scored = []
    for d in candidates:
        r = classify_draft(tess, inter, d, min_draft_deg=min_draft_deg)
        scored.append({
            "drawDirectionXYZ": r["drawDirectionXYZ"],
            "undercutAreaPct": r["areaPct"]["undercut"],
            "zeroDraftAreaPct": r["areaPct"]["zeroDraft"],
            "result": r,
        })
    scored.sort(key=lambda s: (s["undercutAreaPct"], s["zeroDraftAreaPct"]))
    best = scored[0]
    return best["result"], [
        {k: s[k] for k in ("drawDirectionXYZ", "undercutAreaPct", "zeroDraftAreaPct")}
        for s in scored
    ]


# ─── Wall thickness ───────────────────────────────────────────────────────────

def _weighted_percentile(pairs, pct):
    """Area-weighted percentile over (value, weight) pairs."""
    if not pairs:
        return None
    pairs = sorted(pairs)
    total = sum(w for _, w in pairs)
    if total <= 0:
        return None
    target, run = total * pct / 100.0, 0.0
    for v, w in pairs:
        run += w
        if run >= target:
            return v
    return pairs[-1][0]


def wall_thickness(tess, inter, max_samples=4000, reach=1e4):
    """Ray-cast inward from triangle centroids; area-weighted distribution.

    Two rules make this trustworthy where the old version was not:
      * sample triangle CENTROIDS — always inside the face, so trimmed faces stop
        silently producing invalid samples;
      * accept a hit only when the far surface faces roughly back at us
        (OPPOSED_TOL_DEG). A glancing hit on an unrelated wall is not a thickness.

    Even so, a ray from the narrow edge of a plate legitimately measures the
    plate's WIDTH, so we report an area-WEIGHTED distribution rather than min/max:
    the large faces that define the wall dominate, and the edge readings carry the
    little area they deserve. min/max over four samples was never a statistic.
    """
    from OCP.gp import gp_Dir, gp_Lin, gp_Pnt

    n = tess["count"]
    if n == 0:
        return None
    step = max(1, n // max_samples)
    opposed = -math.cos(math.radians(OPPOSED_TOL_DEG))
    samples = []          # (thickness, area)

    for i in range(0, n, step):
        nxi, nyi, nzi = tess["nx"][i], tess["ny"][i], tess["nz"][i]
        sx = tess["cx"][i] - nxi * EPS_MM
        sy = tess["cy"][i] - nyi * EPS_MM
        sz = tess["cz"][i] - nzi * EPS_MM
        try:
            inter.PerformNearest(gp_Lin(gp_Pnt(sx, sy, sz), gp_Dir(-nxi, -nyi, -nzi)), 1e-4, reach)
            if not (inter.IsDone() and inter.NbPnt() > 0):
                continue
            hit = inter.Pnt(1)
            # Opposed-normal test using the struck face's own normal.
            hn = _face_normal_at(inter)
            if hn is not None and (hn[0] * nxi + hn[1] * nyi + hn[2] * nzi) > opposed:
                continue
            # Add back the start offset: the ray began EPS_MM inside the surface,
            # so the raw distance under-reads every wall by exactly that much.
            d = math.dist((sx, sy, sz), (hit.X(), hit.Y(), hit.Z())) + EPS_MM
            if d > 1e-3:
                samples.append((d, tess["area"][i]))
        except Exception:
            continue

    if len(samples) < 8:
        return {"samples": len(samples), "confidence": "insufficient",
                "note": "Too few valid opposed-surface rays to characterise wall thickness."}

    measured = sum(w for _, w in samples)
    p5 = _weighted_percentile(samples, 5)
    p50 = _weighted_percentile(samples, 50)
    p95 = _weighted_percentile(samples, 95)
    # Area-weighted moments — an unweighted mean would let a handful of tiny
    # edge facets outvote the faces that actually are the wall.
    mean = sum(v * w for v, w in samples) / measured
    var = sum(w * (v - mean) ** 2 for v, w in samples) / measured
    std = math.sqrt(var)
    # Uniformity is judged on a ROBUST spread, not stdDev. A ray leaving the
    # narrow edge of a plate legitimately measures the plate's width, and a
    # handful of those outliers is enough to make stdDev call a perfectly
    # constant 2.5 mm shell "non-uniform" — which it is not.
    spread = (p95 - p5) / p50 if p50 else 0.0
    return {
        "method": "ray_cast_tessellation_area_weighted",
        "samples": len(samples),
        "p5Mm": round(p5, 2),
        "p50Mm": round(p50, 2),
        "p95Mm": round(p95, 2),
        "spreadRatio": round(spread, 3),
        "minMm": round(min(v for v, _ in samples), 2),
        "maxMm": round(max(v for v, _ in samples), 2),
        "characteristicMm": round(p50, 2),
        "measuredAreaPct": round(100.0 * measured / (tess["totalAreaMm2"] or 1.0), 1),
        "confidence": "measured",
        # Legacy keys — the manufacturability score and CNC estimate read these.
        # Area-weighted now, so they mean what their names always claimed.
        "meanMm": round(mean, 2),
        "stdDevMm": round(std, 2),
        "sampleCount": len(samples),
        "uniformity": ("uniform" if spread < 0.15 else "moderate" if spread < 0.6 else "non-uniform"),
        # Kept raw so the rule engine can ask "what area sits below 1.5 mm?"
        # without this module having to know any process threshold. Stripped
        # before serialisation by strip_private().
        "_samples": samples,
    }


def strip_private(obj):
    """Drop underscore-prefixed keys so raw sample arrays never reach the wire."""
    if isinstance(obj, dict):
        return {k: strip_private(v) for k, v in obj.items() if not k.startswith("_")}
    if isinstance(obj, list):
        return [strip_private(v) for v in obj]
    return obj


def area_below(wall, threshold_mm):
    """Fraction of measured area thinner than a threshold. Returns None when the
    thickness measurement was not trustworthy — the caller must not fill that in."""
    if not wall or "_samples" not in wall:
        return None
    total = sum(w for _, w in wall["_samples"]) or 1.0
    below = sum(w for v, w in wall["_samples"] if v < threshold_mm)
    return round(100.0 * below / total, 2)


def _face_normal_at(inter):
    """Outward normal of the face the intersector just struck, or None."""
    from OCP.BRep import BRep_Tool
    from OCP.GeomLProp import GeomLProp_SLProps
    from OCP.TopAbs import TopAbs_REVERSED
    try:
        face = inter.Face(1)
        surf = BRep_Tool.Surface_s(face)
        props = GeomLProp_SLProps(surf, inter.UParameter(1), inter.VParameter(1), 1, 1e-7)
        if not props.IsNormalDefined():
            return None
        nv = props.Normal()
        s = -1.0 if face.Orientation() == TopAbs_REVERSED else 1.0
        return (nv.X() * s, nv.Y() * s, nv.Z() * s)
    except Exception:
        return None


# ─── Machining setups ─────────────────────────────────────────────────────────

def setup_directions(feature_table_axes, tol_deg=15.0):
    """Count machining setups from FEATURE ACCESS directions.

    The old version clustered every face normal in the model, so any box scored 3
    setups whether or not a single feature was machined on those faces. What costs
    a setup is re-fixturing to reach a feature, so only directions features are
    actually approached from are counted. Opposite directions are SEPARATE setups
    — you have to flip the part.
    """
    clusters = []
    tol = math.cos(math.radians(tol_deg))
    for ax in feature_table_axes:
        m = math.sqrt(sum(c * c for c in ax)) or 1.0
        u = tuple(c / m for c in ax)
        for cl in clusters:
            if sum(a * b for a, b in zip(u, cl["dir"])) >= tol:
                cl["count"] += 1
                break
        else:
            clusters.append({"dir": u, "count": 1})
    return {
        "estimatedSetupCount": max(1, len(clusters)),
        "accessDirections": [
            {"directionXYZ": [round(c, 4) for c in cl["dir"]], "featureCount": cl["count"]}
            for cl in sorted(clusters, key=lambda c: -c["count"])
        ],
        "basis": "distinct feature access directions (not raw face normals)",
    }
