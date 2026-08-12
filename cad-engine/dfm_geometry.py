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
    from OCP.TopExp import TopExp
    from OCP.TopLoc import TopLoc_Location
    from OCP.TopoDS import TopoDS
    from OCP.TopTools import TopTools_IndexedMapOfShape

    BRepMesh_IncrementalMesh(shape, deflection, False, angular, True)

    area, nx, ny, nz, cx, cy, cz, fidx = [], [], [], [], [], [], [], []
    total = 0.0
    # THE INDEXED MAP, NOT AN EXPLORER — and the difference was a live bug.
    #
    # A face id emitted here is used to paint that face in the 3D viewer, so it
    # has to mean the same thing as the viewer's id. This loop used to be a
    # TopExp_Explorer with its own 1-based counter, while the viewer numbers
    # faces 0-based off a TopTools_IndexedMapOfShape. Checked against known truth
    # on box-side-hole.step, whose single undercut IS the cylindrical bore: the
    # analysis reported face 6, the viewer highlighted its face 6 — a PLANE — and
    # the bore is face 5. Every undercut highlight in the product pointed one
    # face off.
    #
    # The two enumerations also differ in kind, not just origin: MapShapes
    # deduplicates by TShape+location+orientation, an explorer does not, so a face
    # shared between two solids of a compound is visited twice by one and once by
    # the other. Everything now agrees on ONE convention — 1-based indexed map,
    # the same one feature_recognition.build_aag and _extract_feature_table use.
    fmap = TopTools_IndexedMapOfShape()
    TopExp.MapShapes_s(shape, TopAbs_FACE, fmap)
    for face_i in range(1, fmap.Size() + 1):
        face = TopoDS.Face_s(fmap.FindKey(face_i))
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

    return {"area": area, "nx": nx, "ny": ny, "nz": nz, "cx": cx, "cy": cy, "cz": cz,
            "face": fidx, "count": len(area), "totalAreaMm2": total,
            "deflection": deflection,
            #: 1-based indexed-map face ids. Stated on the payload so a consumer
            #: never has to guess which of the four conventions this is.
            "faceIdBase": 1,
            "faceIdOrder": "TopTools_IndexedMapOfShape",
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


# Ray budget for the draft classification.
#
# MEASURED ON A REAL PART, which is how this was found at all. Every analytic
# fixture is a primitive with a few hundred triangles, so the per-triangle ray
# cast never cost anything and the gate ran at 100% while the tool timed out on
# the first genuine automotive STEP file a user uploaded:
#
#   PRCR012.stp — 209 faces, 100x69x135 mm, the SMALLEST of six real parts
#     tessellate       0.2 s
#     wall_thickness  24.4 s   (4000 rays)
#     draw sweep      34.2 s   (3 axes x 7576 triangles = 22,728 rays)
#     build_aag        0.2 s
#
# 59 s of ray casting on the small one; the 5 MB parts blew the bridge's 120 s
# timeout outright and the user saw "Geometry engine timed out after 120s".
#
# The draft ANGLE of every triangle is pure arithmetic on its normal and stays
# exact for all of them. Only VISIBILITY — the test that separates a releasing
# face from an undercut — needs a ray, so only that is sampled. Each sampled
# triangle carries its own area, so the area percentages remain an unbiased
# estimate; the result is stamped `sampled` and carries its ray count so the
# report can say it is an estimate rather than a census.
# Budget vs accuracy, MEASURED on the 426-face bracket that timed out (14,346
# triangles). The undercut fraction — the finding that buys tooling — is stable
# to 0.02 pp across every budget; what moves is the below-minimum-draft
# percentage, which is why the result carries `sampled` and the report says the
# figure is an estimate:
#
#   budget   time    undercut   zeroDraft   belowMinDraft
#     3000  30.4 s      0.04%       2.74%           9.99%
#     2000  18.6 s      0.05%       2.24%           8.53%
#      800   8.3 s      0.03%       1.71%           6.66%
DRAFT_RAY_BUDGET = 2000
#: The sweep only has to RANK candidate axes, which a coarse sample does as well
#: as a fine one. The winner is then re-classified at the full budget, so the
#: numbers a user reads come from the fine pass, not the ranking pass.
DRAFT_SWEEP_RAY_BUDGET = 250
#: Coarse-ranking candidates within this many percentage points of the leader are
#: re-measured at full budget before the winner is chosen.
RERANK_MARGIN_PCT = 8.0
#: Two directions this close after a FULL measurement are a design decision, not
#: a geometric fact, and the report says so.
AMBIGUOUS_MARGIN_PCT = 2.0


#: How many located regions to emit per class. A part with 200 undercut faces
#: does not need 200 callouts — the biggest by area are the ones worth drawing a
#: leader line to, and the total count is reported separately so nothing is
#: hidden by the cap.
MAX_REGIONS = 12


def _regions(face_areas, centroids, worst_draft):
    """Turn per-face accumulations into located, sorted findings."""
    out = []
    for fid, area in sorted(face_areas.items(), key=lambda kv: -kv[1])[:MAX_REGIONS]:
        c = centroids.get(fid)
        if not c or c[3] <= 0:
            continue
        out.append({
            "faceId": fid,
            "centroidXYZ": [round(c[0] / c[3], 3), round(c[1] / c[3], 3), round(c[2] / c[3], 3)],
            "areaMm2": round(area, 2),
            "draftDeg": round(worst_draft[fid], 2) if fid in worst_draft else None,
        })
    return out


#: The draft angles the rule catalogue asks about. Zinc HPDC releases at 0.5
#: degrees, investment casting 0.5-1, aluminium HPDC 1-2, sand casting 1.5-3,
#: forging 3-7. One cutoff cannot serve them and guessing between them is what
#: made the draft finding generic.
DRAFT_CUTOFFS_DEG = (0.5, 1.0, 1.5, 2.0, 3.0, 5.0, 7.0)


def classify_draft(tess, inter, draw, min_draft_deg=1.0, reach=1e5,
                   max_rays=DRAFT_RAY_BUDGET):
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
    # WHERE, not just how much. A finding that says "34 undercut regions" and
    # cannot point at one leaves the engineer to hunt for them in CAD. The
    # triangle centroids are already in `tess`; accumulating them area-weighted
    # per face costs three multiply-adds and gives every finding an anchor a
    # leader line can be drawn to.
    centroids = {}          # faceId -> [sum(area*x), sum(area*y), sum(area*z), sum(area)]
    worst_draft = {}        # faceId -> the least draft seen on it, in degrees

    def _accumulate(fid, ar_, i_, deg):
        c = centroids.get(fid)
        if c is None:
            c = centroids[fid] = [0.0, 0.0, 0.0, 0.0]
        c[0] += tess["cx"][i_] * ar_
        c[1] += tess["cy"][i_] * ar_
        c[2] += tess["cz"][i_] * ar_
        c[3] += ar_
        if deg is not None and (fid not in worst_draft or deg < worst_draft[fid]):
            worst_draft[fid] = deg
    drafts = []          # (draftDeg, area) over wall-like releasing faces only
    histogram = {}
    # EVERY wall triangle's draft, not just the ones above the cutoff. The
    # single "% of wall below 1 degree" figure was computed against a hardcoded
    # 1.0 and then compared by rules that need different angles: zinc die
    # casting releases at 0.5 degrees, aluminium wants 1-2, sand casting 1.5-3,
    # a hot forging 5-7. Judging all of them against one cutoff is the exact
    # "generic DFM" this catalogue exists to avoid, so the whole curve is
    # emitted from the drafts already being measured. Undercut area is below
    # EVERY cutoff by definition and is carried separately.
    wall_drafts = []     # (draftDeg, area) over releasing AND zero-draft faces
    undercut_area = 0.0

    # Stride over the triangles when there are more than the ray budget allows.
    # step == 1 below the budget, so every fixture and every small part is a
    # full census and this changes nothing about the gated numbers.
    n = tess["count"]
    step = max(1, -(-n // max_rays)) if max_rays else 1
    rays = 0

    for i in range(0, n, step):
        # Each sampled triangle stands for the `step` triangles it represents, so
        # the area fractions stay an unbiased estimate of the whole surface
        # rather than shrinking to the sampled fraction.
        ar = tess["area"][i] * step
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
        rays += 1

        if not vis:
            kind = "undercut"
            undercut_area += ar
            undercut_faces[tess["face"][i]] = undercut_faces.get(tess["face"][i], 0.0) + ar
            _accumulate(tess["face"][i], ar, i, mag)
        elif mag >= parting_min:
            kind = "partingParallel"
        elif mag >= min_draft_deg:
            kind = "releasing"
            drafts.append((mag, ar))
            wall_drafts.append((mag, ar))
            histogram[round(mag)] = histogram.get(round(mag), 0.0) + ar
        else:
            kind = "zeroDraft"
            wall_drafts.append((mag, ar))
            zero_faces[tess["face"][i]] = zero_faces.get(tess["face"][i], 0.0) + ar
            histogram[round(mag)] = histogram.get(round(mag), 0.0) + ar
            _accumulate(tess["face"][i], ar, i, mag)
        buckets[kind] += ar

    total = tess["totalAreaMm2"] or 1.0
    wall_area = buckets["releasing"] + buckets["zeroDraft"] + buckets["undercut"]
    below = {}
    for cut in DRAFT_CUTOFFS_DEG:
        short = undercut_area + sum(a for d, a in wall_drafts if d < cut)
        below[f"{cut:g}"] = round(100.0 * short / wall_area, 2) if wall_area > 0 else 0.0
    return {
        "drawDirectionXYZ": [round(dx, 6), round(dy, 6), round(dz, 6)],
        "minDraftDeg": min_draft_deg,
        "areaMm2": {k: round(v, 1) for k, v in buckets.items()},
        "areaPct": {k: round(100.0 * v / total, 2) for k, v in buckets.items()},
        # Of the faces that actually need draft (walls), how much is short of it?
        # This is the number a die caster asks for.
        "wallAreaBelowMinDraftPct": round(
            100.0 * (buckets["zeroDraft"] + buckets["undercut"]) / wall_area, 2) if wall_area > 0 else 0.0,
        # The same question asked at every angle a process might require, so a
        # zinc rule and a forging rule each get the number they actually mean
        # instead of sharing one cutoff neither of them chose.
        "wallAreaBelowDraftPct": below,
        "minWallDraftDeg": round(min(d for d, _ in drafts), 2) if drafts else None,
        "maxWallDraftDeg": round(max(d for d, _ in drafts), 2) if drafts else None,
        "areaWeightedDraftDeg": round(sum(d * a for d, a in drafts) / sum(a for _, a in drafts), 2) if drafts else None,
        # LOCATED findings — face id, where it is in space, how big it is, and
        # the value that made it a finding. Everything a callout needs without
        # re-deriving anything, and the same face ids the viewer paints by.
        "undercutRegions": _regions(undercut_faces, centroids, worst_draft),
        "zeroDraftRegions": _regions(zero_faces, centroids, worst_draft),
        "undercutFaceCount": len(undercut_faces),
        "undercutFaceIds": sorted(undercut_faces, key=undercut_faces.get, reverse=True)[:40],
        "zeroDraftFaceCount": len(zero_faces),
        "zeroDraftFaceIds": sorted(zero_faces, key=zero_faces.get, reverse=True)[:40],
        "draftHistogramDegToAreaMm2": {str(k): round(v, 1) for k, v in sorted(histogram.items())},
        # Stated, not hidden. Below the budget this is a full census and
        # `sampled` is False; above it the areas are an unbiased estimate from
        # `raysCast` visibility tests and the report says so. A percentage that
        # silently changes meaning with part size is the kind of number this
        # feature exists to not produce.
        "sampled": step > 1,
        "raysCast": rays,
        "trianglesTotal": n,
    }


def _same_axis(candidate, normalised):
    """Match a raw candidate back to the normalised axis classify_draft returned."""
    m = math.sqrt(sum(c * c for c in candidate)) or 1.0
    return all(abs(c / m - n) < 1e-6 for c, n in zip(candidate, normalised))


def choose_draw_direction(tess, inter, candidates=None, min_draft_deg=1.0):
    """Score candidate draw axes and return the best plus the alternatives.

    Hard-coding +Z (what the old code did) is a guess dressed as an answer. The
    tessellation is cheap enough to just try the axes and let undercut area — the
    thing that actually buys slides and lifters — decide.
    """
    if candidates is None:
        candidates = [(0, 0, 1), (0, 1, 0), (1, 0, 0)]
    # TWO STAGES. Ranking three axes only needs enough rays to tell them apart,
    # and running the full classification three times was two thirds of a 34 s
    # sweep on a real part. The winner is re-classified at the full budget below,
    # so every number a user reads comes from the fine pass — the coarse pass
    # only chooses which axis to spend it on.
    scored = []
    for d in candidates:
        r = classify_draft(tess, inter, d, min_draft_deg=min_draft_deg,
                           max_rays=DRAFT_SWEEP_RAY_BUDGET)
        scored.append({
            "drawDirectionXYZ": r["drawDirectionXYZ"],
            "undercutAreaPct": r["areaPct"]["undercut"],
            "zeroDraftAreaPct": r["areaPct"]["zeroDraft"],
            "result": r,
        })
    scored.sort(key=lambda s: (s["undercutAreaPct"], s["zeroDraftAreaPct"]))

    # A COARSE RANKING CANNOT SEPARATE CLOSE CANDIDATES, and picking wrong here
    # changes every number downstream. Measured on a real die-cast bracket: the
    # winner flipped X -> Z -> X as the ranking budget went 250 -> 600 -> 2000,
    # because at full resolution those two axes sit 0.6 points apart (6.94% vs
    # 7.53% undercut). The reported wall-area-below-draft swung 38% to 75% with
    # it. So any candidate within RERANK_MARGIN_PCT of the coarse leader is
    # re-measured at the FULL budget and the winner chosen from those.
    contenders = [s for s in scored
                  if s["undercutAreaPct"] <= scored[0]["undercutAreaPct"] + RERANK_MARGIN_PCT]
    if scored[0]["result"].get("sampled") or len(contenders) > 1:
        refined = []
        for s in contenders:
            raw = next(c for c in candidates if _same_axis(c, s["drawDirectionXYZ"]))
            r = classify_draft(tess, inter, raw, min_draft_deg=min_draft_deg)
            refined.append({
                "drawDirectionXYZ": r["drawDirectionXYZ"],
                "undercutAreaPct": r["areaPct"]["undercut"],
                "zeroDraftAreaPct": r["areaPct"]["zeroDraft"],
                "result": r,
            })
        refined.sort(key=lambda s: (s["undercutAreaPct"], s["zeroDraftAreaPct"]))
        # Keep the refined figures in the alternatives list too, so the report
        # never shows a coarse number beside a fine one.
        by_axis = {tuple(s["drawDirectionXYZ"]): s for s in refined}
        scored = [by_axis.get(tuple(s["drawDirectionXYZ"]), s) for s in scored]
        scored.sort(key=lambda s: (s["undercutAreaPct"], s["zeroDraftAreaPct"]))

    best = scored[0]
    # When two directions are still this close after a full measurement, the
    # parting direction is a DESIGN DECISION, not something the geometry
    # settles. Saying so is more useful to a toolmaker than silently choosing.
    if len(scored) > 1:
        margin = scored[1]["undercutAreaPct"] - scored[0]["undercutAreaPct"]
        best["result"]["drawDirectionMarginPct"] = round(margin, 2)
        best["result"]["drawDirectionAmbiguous"] = margin < AMBIGUOUS_MARGIN_PCT
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


#: Set by wall_thickness() when it returns None, so the caller can tell the user
#: WHY there is no thickness rather than leaving a silent blank.
WALL_UNMEASURED_REASON = (
    "Too few valid opposed-surface rays to characterise wall thickness — the "
    "model may be a surface (no solid), extremely thin, or heavily trimmed."
)


#: Thickness rays. 4000 measured at 24.4 s on the smallest of six real
#: automotive parts — the percentiles are a distribution estimate either way, and
#: 1500 area-weighted samples locate p5/p50/p95 no differently while costing a
#: third as much. The `samples` count is reported so a reader can see the basis.
# p50 is identical at every budget on the same part (1.60 mm at 1500, 1000 and
# 600 rays); only p5 drifts 1.48 -> 1.55. 1000 costs 9.1 s against 14.3 s.
WALL_RAY_BUDGET = 1000


def _extreme_regions(located, thinnest=True, limit=8):
    """The thinnest (or thickest) measured places, one per face."""
    if not located:
        return []
    ordered = sorted(located, key=lambda r: r[0], reverse=not thinnest)
    seen, out = set(), []
    for d, x, y, z, fid in ordered:
        if fid in seen:
            continue
        seen.add(fid)
        out.append({"faceId": fid, "thicknessMm": round(d, 3),
                    "atXYZ": [round(x, 3), round(y, 3), round(z, 3)]})
        if len(out) >= limit:
            break
    return out


def wall_thickness(tess, inter, max_samples=WALL_RAY_BUDGET, reach=1e4, max_wall_mm=None):
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
    # WHERE each measurement was taken, kept alongside it. The loop already has
    # the point and the face in hand; discarding them meant a "1.2 mm thin wall"
    # finding could not say which wall. Parallel list rather than a wider tuple
    # so `_samples` keeps the exact shape area_below() and the rule engine
    # already consume.
    located = []          # (thickness, x, y, z, faceId)
    rejected = 0          # readings above the part's smallest overall dimension

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
            # A WALL cannot be thicker than the part's smallest overall
            # dimension. Some rays run the length of a parallel channel and come
            # back with the part's own size — on a 1.6 mm pressing 341 mm long,
            # one returned 85.3 mm. Those readings are real distances but they
            # are not wall thicknesses, and a handful of them landing in or out
            # of the sample is enough to swing the p95 from 1.61 mm ("uniform")
            # to 5.67 mm ("non-uniform") when the mesh changes by 18 triangles.
            # Both figures reached a report on the same part. Rejecting them is
            # physics, not smoothing: the ceiling is a measured bound.
            if max_wall_mm and d > max_wall_mm * 1.001:
                rejected += 1
                continue
            if d > 1e-3:
                # WEIGHTED BY THE STRIDE, as classify_draft has always done. Each
                # sampled triangle stands for the `step` triangles it was chosen
                # from, so an unweighted area makes `measuredAreaPct` read 1/step
                # of the truth: a part where nearly every ray succeeded reported
                # "6.3% of the surface measured" and looked untrustworthy for a
                # reason that was pure arithmetic. The percentiles themselves are
                # unaffected — a constant factor cancels in a weighted quantile —
                # but the figure a reader judges them BY was wrong.
                samples.append((d, tess["area"][i] * step))
                located.append((d, tess["cx"][i], tess["cy"][i], tess["cz"][i],
                                tess["face"][i]))
        except Exception:
            continue

    if len(samples) < 8:
        # MUST be None, not a partial dict. Every caller guards with
        # `if wall_stats:` and then reads meanMm / stdDevMm / minMm — a truthy
        # dict missing those keys turns an honest "could not measure" into a
        # KeyError, which surfaced to users as HTTP 422 with the body 'meanMm'
        # on any surface model or very thin shell. The reason travels separately
        # so nothing is lost by returning None here.
        return None

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
        # Capped: the stride is an integer estimate of a fractional sampling
        # rate, so a part whose successful rays happen to sit on larger-than-
        # average triangles can extrapolate just past 100%.
        "measuredAreaPct": min(100.0, round(100.0 * measured / (tess["totalAreaMm2"] or 1.0), 1)),
        # Published, not hidden. A part where a third of the rays exceeded the
        # smallest overall dimension is one whose wall figure deserves a second
        # look, and the reader can only know that if the number is on the page.
        "raysRejectedOverPartSize": rejected,
        "maxWallBoundMm": round(max_wall_mm, 2) if max_wall_mm else None,
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
        # The thinnest and thickest places, with their coordinates — the anchors
        # a "wall below minimum" callout points at. Capped, because a report does
        # not need 1000 leader lines, and de-duplicated per face so ten samples
        # on one thin web produce one callout rather than ten stacked on top of
        # each other.
        "thinnestRegions": _extreme_regions(located, thinnest=True),
        "thickestRegions": _extreme_regions(located, thinnest=False),
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

# ─── Tool accessibility ──────────────────────────────────────────────────────
#
# The check DFMPro leads its machining family with, and the one this engine has
# declared as UNWRITTEN since the rule catalogue existed. "Setup count" was the
# nearest thing measured, and setup count answers a different question: how many
# times the part is re-fixtured, not whether a cutter can physically reach the
# floor of a pocket once it is.
#
# WHAT THIS MEASURES, AND WHAT IT DOES NOT. For each candidate approach
# direction, a surface point is REACHABLE when a cylinder of the tool's diameter,
# swept from the point out to infinity along that direction, is clear of the
# solid. That is a real tool-shank clearance test, not a line-of-sight test: a
# pocket floor is visible down a 3 mm slot and a 10 mm cutter still cannot get
# there. It does NOT model the holder, the spindle nose, or the machine envelope,
# so a face this reports as reachable can still be unreachable on a real machine.
# That limit is published with the result rather than left implied.
#
#: Rays around the shank circumference. Four plus the axis is enough to catch a
#: wall the tool body would foul while keeping the cost near the draft sweep's.
SHANK_PROBES = 4
TOOL_ACCESS_RAY_BUDGET = 600


def tool_accessibility(tess, inter, directions=None, tool_dia_mm=10.0, reach=1e5,
                       max_rays=TOOL_ACCESS_RAY_BUDGET, exclude_faces=None):
    """Fraction of surface area a cutter of `tool_dia_mm` can reach.

    Returns per-direction reachability plus the union across directions — the
    union is what matters, because a part is machined from several sides and a
    face only has to be reachable from ONE of them.

    `exclude_faces` LEAVES BORES OUT, and without it this measure produces false
    findings on the most ordinary part there is. A Ø8 drilled hole is not
    reachable by a Ø10 end mill and does not need to be: it is made by a Ø8 drill,
    sized to it. Counting every bore interior as unreachable scored a plain plate
    with two drilled holes at 7.2% unreachable, which is not a manufacturing
    problem — it is the measure asking the wrong tool about the wrong feature.
    Bore slenderness is covered by the drill-depth rule, which is where it
    belongs.
    """
    from OCP.gp import gp_Dir, gp_Lin, gp_Pnt

    n = tess["count"]
    if n == 0:
        return None
    if directions is None:
        directions = [(0, 0, 1), (0, 0, -1), (0, 1, 0), (0, -1, 0), (1, 0, 0), (-1, 0, 0)]
    r = max(0.1, float(tool_dia_mm) / 2.0)
    step = max(1, -(-n // max_rays)) if max_rays else 1

    # A basis perpendicular to each direction, so the shank probes ring the axis.
    def _perp(d):
        a = (0.0, 0.0, 1.0) if abs(d[2]) < 0.9 else (1.0, 0.0, 0.0)
        u = (d[1] * a[2] - d[2] * a[1], d[2] * a[0] - d[0] * a[2], d[0] * a[1] - d[1] * a[0])
        m = math.sqrt(sum(c * c for c in u)) or 1.0
        u = tuple(c / m for c in u)
        v = (d[1] * u[2] - d[2] * u[1], d[2] * u[0] - d[0] * u[2], d[0] * u[1] - d[1] * u[0])
        return u, v

    skip = set(exclude_faces or ())
    total_area = 0.0
    reached_any = 0.0
    excluded_area = 0.0
    per_dir = []
    sampled = [i for i in range(0, n, step) if tess["face"][i] not in skip]
    for i in range(0, n, step):
        if tess["face"][i] in skip:
            excluded_area += tess["area"][i] * step
    for i in sampled:
        total_area += tess["area"][i] * step

    for d in directions:
        m = math.sqrt(sum(c * c for c in d)) or 1.0
        dn = tuple(c / m for c in d)
        u, v = _perp(dn)
        reached = 0.0
        for i in sampled:
            ar = tess["area"][i] * step
            nx, ny, nz = tess["nx"][i], tess["ny"][i], tess["nz"][i]
            # A face pointing away from the approach cannot be cut by it.
            if nx * dn[0] + ny * dn[1] + nz * dn[2] <= 0.0:
                continue
            # Start just off the surface so the ray does not strike its own facet.
            px = tess["cx"][i] + nx * EPS_MM
            py = tess["cy"][i] + ny * EPS_MM
            pz = tess["cz"][i] + nz * EPS_MM
            ok = _escapes(inter, px, py, pz, dn[0], dn[1], dn[2], reach)
            if ok:
                # THE SHANK, not just the line of sight. A pocket floor visible
                # down a 3 mm slot is not reachable by a 10 mm cutter, and a
                # centre-ray-only test calls it reachable every time.
                for k in range(SHANK_PROBES):
                    ang = 2 * math.pi * k / SHANK_PROBES
                    ox = r * (math.cos(ang) * u[0] + math.sin(ang) * v[0])
                    oy = r * (math.cos(ang) * u[1] + math.sin(ang) * v[1])
                    oz = r * (math.cos(ang) * u[2] + math.sin(ang) * v[2])
                    if not _escapes(inter, px + ox, py + oy, pz + oz,
                                    dn[0], dn[1], dn[2], reach):
                        ok = False
                        break
            if ok:
                reached += ar
        per_dir.append({
            "directionXYZ": [round(c, 4) for c in dn],
            "reachableAreaPct": round(100.0 * reached / total_area, 2) if total_area else 0.0,
        })

    # Union across directions, computed per triangle rather than by adding the
    # per-direction percentages — a face reachable from three sides would
    # otherwise be counted three times and the union could exceed 100%.
    unreached = []
    unreached_face_area = {}
    faces_idx = tess.get("face")
    for i in sampled:
        ar = tess["area"][i] * step
        nx, ny, nz = tess["nx"][i], tess["ny"][i], tess["nz"][i]
        px = tess["cx"][i] + nx * EPS_MM
        py = tess["cy"][i] + ny * EPS_MM
        pz = tess["cz"][i] + nz * EPS_MM
        reached_here = False
        for d in directions:
            m = math.sqrt(sum(c * c for c in d)) or 1.0
            dn = tuple(c / m for c in d)
            if nx * dn[0] + ny * dn[1] + nz * dn[2] <= 0.0:
                continue
            if not _escapes(inter, px, py, pz, dn[0], dn[1], dn[2], reach):
                continue
            u, v = _perp(dn)
            blocked = False
            for k in range(SHANK_PROBES):
                ang = 2 * math.pi * k / SHANK_PROBES
                ox = r * (math.cos(ang) * u[0] + math.sin(ang) * v[0])
                oy = r * (math.cos(ang) * u[1] + math.sin(ang) * v[1])
                oz = r * (math.cos(ang) * u[2] + math.sin(ang) * v[2])
                if not _escapes(inter, px + ox, py + oy, pz + oz, dn[0], dn[1], dn[2], reach):
                    blocked = True
                    break
            if not blocked:
                reached_any += ar
                reached_here = True
                break
        if not reached_here:
            # WHERE the cutter cannot get to.
            #
            # The measure was a bare percentage and the report had to say "23% of
            # the surface is unreachable" with nothing to point at, on a part
            # whose whole problem is that one pocket is too deep for the tool.
            # These are real surface points, kept largest-area first and capped,
            # so a marker lands on a face the cutter genuinely misses.
            unreached.append((ar, round(tess["cx"][i], 3), round(tess["cy"][i], 3),
                              round(tess["cz"][i], 3)))
            # ...and WHICH FACE it is, so the finding can paint it rather than
            # drop a marker in space. Same convention as everything else here.
            if faces_idx is not None:
                fid = faces_idx[i]
                if fid:
                    unreached_face_area[fid] = unreached_face_area.get(fid, 0.0) + ar

    unreached.sort(key=lambda t: -t[0])
    unreached_faces = [f for f, _a in sorted(unreached_face_area.items(), key=lambda kv: -kv[1])]

    return {
        "toolDiaMm": round(float(tool_dia_mm), 2),
        "unreachableRegions": [
            {"areaMm2": round(a, 2), "atXYZ": [x, y, z]} for (a, x, y, z) in unreached[:8]
        ],
        "unreachableFaceIds": unreached_faces[:40],
        "unreachableFaceCount": len(unreached_faces),
        "reachableAreaPct": round(100.0 * reached_any / total_area, 2) if total_area else 0.0,
        "unreachableAreaPct": round(100.0 - (100.0 * reached_any / total_area), 2) if total_area else 0.0,
        "byDirection": per_dir,
        "sampled": step > 1,
        "trianglesTested": len(sampled),
        "excludedAreaMm2": round(excluded_area, 1),
        "excludedBecause": "Cylindrical bores are excluded: a Ø8 hole is drilled by a Ø8 drill, not reached by the end mill, and counting its interior as unreachable made a plain drilled plate look 7% unmachinable. Bore slenderness is the drill-depth rule's job.",
        "method": f"shank clearance: a Ø{round(float(tool_dia_mm), 2)} mm cylinder swept along each of "
                  f"{len(directions)} approach directions must clear the solid, tested with "
                  f"{SHANK_PROBES} circumference probes plus the axis",
        "knownLimits": "The HOLDER, spindle nose and machine envelope are not modelled, so a face "
                       "reported as reachable may still be unreachable on a real machine. Approach "
                       "is limited to the six axis directions.",
    }


# ── Additive: overhang against the build direction ───────────────────────────
#
# The archetypal DfAM question, and the one measure in this file that is NOT a
# tooling-access question. In powder-bed fusion there is no die and no draw: the
# constraint is that a downward-facing surface has nothing under it but loose
# powder. Below roughly 45 degrees from the build plate the melt pool sinks into
# that powder, the surface dross-forms, and the feature needs a support that has
# to be cut off afterwards.
#
# Deliberately built as a CURVE, exactly like the draft curve, because 45 is a
# rule of thumb and not a constant: some alloys and parameter sets self-support
# to 30, lattice struts want better than 25, and a rule that hardcodes one angle
# cannot express any of that. Each rule names the angle it means.
OVERHANG_CUTOFFS_DEG = (20.0, 30.0, 40.0, 45.0, 50.0, 60.0)


def overhang(tess, build=(0.0, 0.0, 1.0)):
    """Area share of the surface that is a DOWNWARD-facing overhang, by angle.

    A triangle is downward-facing when its outward normal has a component
    against the build direction. Its angle from the build PLATE is
    90 - angle(normal, -build); the surface is self-supporting while that angle
    is at or above the cutoff, and needs support below it.

    Returns None when the tessellation carries no usable area, so the rules
    abstain rather than reading an unmeasured part as 0% overhang — which would
    pass every additive part ever uploaded.
    """
    bx, by, bz = build
    bm = math.sqrt(bx * bx + by * by + bz * bz) or 1.0
    bx, by, bz = bx / bm, by / bm, bz / bm

    total = tess.get("totalAreaMm2") or 0.0
    n = tess.get("count") or 0
    if not n or total <= 0:
        return None

    below = {c: 0.0 for c in OVERHANG_CUTOFFS_DEG}
    down_area = 0.0
    worst_deg = None
    # WHICH FACES OVERHANG, not just how much area does.
    #
    # This loop already knows the face every triangle belongs to and emitted
    # nothing but percentages, so an "unsupported overhang" finding could state
    # a number and never show the reader a single face.
    #
    # Accumulated PER CUTOFF rather than once, because a rule names the angle it
    # means (`overhangCutoffDeg`) and the answer genuinely differs: the analytic
    # wedge is 30 degrees from the plate, so it is 34% of the surface below 40
    # and nothing at all below 20. A single set keyed on the shallowest cutoff
    # highlighted no faces for a rule that had just failed the part — the
    # percentage and the picture would have disagreed. Each cutoff gets the set
    # that belongs to it, and the mapping layer asks for the one its rule used.
    face_area = {c: {} for c in OVERHANG_CUTOFFS_DEG}
    # ...and WHERE each of those faces is. A face id paints the surface, but a
    # callout still needs a point to hang its leader on, and the overhang block
    # reported none — so the one finding whose whole content is "this surface
    # needs support" could not be drawn on the part. The area-weighted centroid
    # of the triangles that failed IS the place, and this loop already holds
    # their centres.
    face_moment = {c: {} for c in OVERHANG_CUTOFFS_DEG}
    faces = tess.get("face")
    for i in range(n):
        ar = tess["area"][i]
        if ar <= 0:
            continue
        nx, ny, nz = tess["nx"][i], tess["ny"][i], tess["nz"][i]
        # Component along the build axis. Negative means the face looks down.
        d = nx * bx + ny * by + nz * bz
        if d >= 0:
            continue
        down_area += ar
        # Angle of the SURFACE from the build plate: a floor-parallel face reads
        # 0 (the worst possible overhang) and a vertical wall reads 90.
        # `c` is how squarely the face looks straight down: 1 for a flat floor,
        # 0 for a vertical wall. acos(c) is therefore the surface's angle from
        # the build plate directly — flat reads 0, vertical reads 90.
        c = min(1.0, max(0.0, -d))
        surface_deg = math.degrees(math.acos(c))
        if worst_deg is None or surface_deg < worst_deg:
            worst_deg = surface_deg
        fid = faces[i] if faces is not None else None
        for cut in OVERHANG_CUTOFFS_DEG:
            if surface_deg < cut:
                below[cut] += ar
                if fid:
                    bucket = face_area[cut]
                    bucket[fid] = bucket.get(fid, 0.0) + ar
                    mom = face_moment[cut].get(fid) or [0.0, 0.0, 0.0]
                    mom[0] += tess["cx"][i] * ar
                    mom[1] += tess["cy"][i] * ar
                    mom[2] += tess["cz"][i] * ar
                    face_moment[cut][fid] = mom

    def _ranked(bucket):
        return [f for f, _a in sorted(bucket.items(), key=lambda kv: -kv[1])]

    faces_by_cut = {c: _ranked(face_area[c]) for c in OVERHANG_CUTOFFS_DEG}

    def _worst_at(c):
        """Centroid of the LARGEST overhanging face at this cutoff, or None."""
        ranked = faces_by_cut[c]
        if not ranked:
            return None
        fid = ranked[0]
        a = face_area[c].get(fid) or 0.0
        if a <= 0:
            return None
        m = face_moment[c][fid]
        return [round(m[0] / a, 3), round(m[1] / a, 3), round(m[2] / a, 3)]

    def _key(c):
        return str(c).rstrip("0").rstrip(".") if c % 1 == 0 else str(c)

    return {
        "buildDirectionXYZ": [round(v, 4) for v in (bx, by, bz)],
        # The faces behind each entry of the curve below, keyed identically so a
        # finding that quotes `overhangAreaBelowDeg["45"]` can paint exactly the
        # faces that figure counted. Worst-area first and capped, like every
        # other id list here; the count is reported separately so a truncated
        # highlight cannot read as "these are all of them".
        "overhangFaceIdsByDeg": {_key(c): faces_by_cut[c][:40] for c in OVERHANG_CUTOFFS_DEG},
        "overhangFaceCountByDeg": {_key(c): len(faces_by_cut[c]) for c in OVERHANG_CUTOFFS_DEG},
        # Where to point: the centre of the biggest offending face at each
        # cutoff, so the leader lands ON the surface that needs support rather
        # than in the middle of the part.
        "overhangWorstAtXYZByDeg": {_key(c): _worst_at(c) for c in OVERHANG_CUTOFFS_DEG},
        "downFacingAreaPct": round(100.0 * down_area / total, 2),
        # The curve. `overhangAreaBelowDeg["45"]` is the share of the whole
        # surface that is a downward face lying flatter than 45 degrees.
        "overhangAreaBelowDeg": {
            _key(c): round(100.0 * below[c] / total, 2)
            for c in OVERHANG_CUTOFFS_DEG
        },
        "shallowestOverhangDeg": round(worst_deg, 2) if worst_deg is not None else None,
        "basis": ("Area-weighted over the tessellation. A triangle is an overhang when its outward "
                  "normal has a component against the build direction; the angle reported is the "
                  "surface's own angle from the build plate, so a flat downward face reads 0 and a "
                  "vertical wall reads 90. Support is needed below the cutoff each rule names."),
        "knownLimits": ("The build direction is assumed to be +Z as the part is modelled. Re-orienting "
                        "a part on the plate is the first thing an AM engineer does, so this is a "
                        "measure of the part AS DRAWN, not of the best available orientation."),
    }
