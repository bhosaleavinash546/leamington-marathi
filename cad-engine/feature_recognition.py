#!/usr/bin/env python3
"""
Rule-based manufacturing feature recognition from B-rep topology.

The substrate is the Attributed Adjacency Graph: faces are nodes, shared edges
are arcs, and each arc is labelled convex or concave. Decomposing at the concave
arcs separates a solid into the pockets, slots and holes machined into it — the
standard approach, and the one aPriori-class tools are built on.

TWO THINGS HERE WERE SETTLED BY MEASUREMENT, NOT BY READING:

1. Getting the convexity label right is subtle and two plausible methods fail.
   Sampling a face normal at its UV midpoint leaves most edges unclassifiable
   (the midpoint of a trimmed face can lie outside the face). Probing along
   n1+n2 with a solid classifier discriminates nothing at all — that direction
   leaves the solid for convex AND concave edges alike, scoring a pocketed box
   24 convex / 0 concave. What works is the dihedral test below, taking each
   normal from the EDGE'S OWN PCURVE on that face and signing the result by the
   edge's orientation within face 1's wire. Verified against known truth:
   plain box 12/0, box+pocket 16/8, box+blind-hole 13/1.

2. A through hole has NO concave edges — it meets the top face in a convex rim
   and the bottom face in another, and has no floor. Concave decomposition is
   therefore STRUCTURALLY BLIND to through holes; a probe on a part with a
   through hole and a pocket found only the pocket. That is a property of the
   method, not a bug, and it is why recognition here is hybrid: cylinders come
   from the exact analytic pass in cad-geometry-engine.py, prismatic features
   come from the graph, and the two are merged.

Whatever neither pass can name is reported as unclassifiedAreaPct. Reporting
nothing would read as "there is nothing there", which is the failure this module
exists to prevent.
"""
import math

# Faces whose dihedral is within this of flat are treated as tangent (a fillet
# blending two faces), not as a real convex or concave edge.
TANGENT_TOL = 1e-7
# Two axes are "coaxial" within this angle and this lateral offset (mm).
COAXIAL_ANG_TOL = math.radians(1.0)
COAXIAL_POS_TOL = 0.05


# ─── Attributed adjacency graph ───────────────────────────────────────────────

def _normal_on(face, edge, t):
    """Outward normal of `face` at parameter `t` along `edge`.

    Uses the edge's PCURVE on the face, which gives exact UV on the trimmed
    surface. Sampling the face's UV midpoint instead is what made an earlier
    attempt fail on 16 of 18 edges.
    """
    from OCP.BRep import BRep_Tool
    from OCP.GeomLProp import GeomLProp_SLProps
    from OCP.TopAbs import TopAbs_REVERSED
    from OCP.gp import gp_Vec
    try:
        res = BRep_Tool.CurveOnSurface_s(edge, face, 0.0, 0.0)
        c2d = res[0] if isinstance(res, tuple) else res
        if c2d is None:
            return None
        uv = c2d.Value(t)
        props = GeomLProp_SLProps(BRep_Tool.Surface_s(face), uv.X(), uv.Y(), 1, 1e-7)
        if not props.IsNormalDefined():
            return None
        n = props.Normal()
        s = -1.0 if face.Orientation() == TopAbs_REVERSED else 1.0
        return gp_Vec(n.X() * s, n.Y() * s, n.Z() * s)
    except Exception:
        return None


def _edge_sense_in(face, edge):
    """+1 / -1 for how `edge` is traversed within `face`'s wire.

    The convexity sign is meaningless without this: the same edge appears with
    opposite senses in its two faces.
    """
    from OCP.TopAbs import TopAbs_EDGE, TopAbs_REVERSED
    from OCP.TopExp import TopExp_Explorer
    from OCP.TopoDS import TopoDS
    ex = TopExp_Explorer(face, TopAbs_EDGE)
    while ex.More():
        e = TopoDS.Edge_s(ex.Current())
        if e.IsSame(edge):
            return -1.0 if e.Orientation() == TopAbs_REVERSED else 1.0
        ex.Next()
    return 1.0


def _mean_normal(face, samples=4):
    """(mean outward unit normal, coherence) for a face of ANY surface type.

    Sampled on a UV grid rather than taken from the surface definition, so a
    cylinder, a cone and a NURBS patch all answer the same question: which way
    does this face broadly look? Coherence is the length of the mean of the unit
    normals — 1.0 for a plane, and near 0 for a face that wraps around, which is
    the caller's signal that the mean direction carries no information.
    """
    from OCP.BRepAdaptor import BRepAdaptor_Surface
    from OCP.BRepLProp import BRepLProp_SLProps
    from OCP.TopAbs import TopAbs_REVERSED
    try:
        ad = BRepAdaptor_Surface(face)
        u0, u1 = ad.FirstUParameter(), ad.LastUParameter()
        v0, v1 = ad.FirstVParameter(), ad.LastVParameter()
        for t in (u0, u1, v0, v1):
            if not math.isfinite(t):
                return None, 0.0
        sign = -1.0 if face.Orientation() == TopAbs_REVERSED else 1.0
        acc, n = [0.0, 0.0, 0.0], 0
        for iu in range(samples):
            for iv in range(samples):
                u = u0 + (u1 - u0) * (iu + 0.5) / samples
                v = v0 + (v1 - v0) * (iv + 0.5) / samples
                props = BRepLProp_SLProps(ad, u, v, 1, 1e-6)
                if not props.IsNormalDefined():
                    continue
                d = props.Normal()
                acc[0] += d.X() * sign
                acc[1] += d.Y() * sign
                acc[2] += d.Z() * sign
                n += 1
        if not n:
            return None, 0.0
        mean = [c / n for c in acc]
        coherence = math.sqrt(sum(c * c for c in mean))
        if coherence < 1e-9:
            return None, 0.0
        return [c / coherence for c in mean], coherence
    except Exception:
        return None, 0.0


def build_aag(shape):
    """Faces, their surface types and areas, plus convexity-labelled arcs."""
    from OCP.BRepAdaptor import BRepAdaptor_Curve, BRepAdaptor_Surface
    from OCP.BRepGProp import BRepGProp
    from OCP.GProp import GProp_GProps
    from OCP.GeomAbs import (GeomAbs_Cone, GeomAbs_Cylinder, GeomAbs_Plane,
                             GeomAbs_Sphere, GeomAbs_Torus)
    from OCP.gp import gp_Pnt, gp_Vec
    from OCP.TopAbs import TopAbs_EDGE, TopAbs_FACE
    from OCP.TopExp import TopExp
    from OCP.TopoDS import TopoDS
    from OCP.TopTools import (TopTools_IndexedDataMapOfShapeListOfShape,
                              TopTools_IndexedMapOfShape)

    TYPE = {GeomAbs_Plane: "PLANE", GeomAbs_Cylinder: "CYLINDER", GeomAbs_Cone: "CONE",
            GeomAbs_Sphere: "SPHERE", GeomAbs_Torus: "TORUS"}

    from OCP.TopAbs import TopAbs_REVERSED as _REV

    fmap = TopTools_IndexedMapOfShape()
    TopExp.MapShapes_s(shape, TopAbs_FACE, fmap)
    faces = {}
    for i in range(1, fmap.Size() + 1):
        f = TopoDS.Face_s(fmap.FindKey(i))
        kind = "FREEFORM"
        concavity = None
        radius = None
        try:
            ad = BRepAdaptor_Surface(f)
            kind = TYPE.get(ad.GetType(), "FREEFORM")
            if ad.GetType() == GeomAbs_Cylinder:
                # Same test the hole/boss pass uses: a cylindrical face whose
                # outward normal points TOWARD its axis is material-outside, so
                # the blend sits in an internal corner and is concave. Pointing
                # away makes it an external round, which is convex. Getting this
                # backwards would rejoin a pocket's faces with a convex arc and
                # the pocket would still not be found.
                cyl = ad.Cylinder()
                concavity = "concave" if (
                    (f.Orientation() == _REV) != (not cyl.Position().Direct())
                ) else "convex"
                # THE RADIUS ITSELF, which was computed and thrown away. A fillet
                # reported without it cannot answer the one question a machinist
                # asks of an internal corner — what cutter fits — and
                # `mach-internal-corner-radius` had therefore reported NOT
                # EVALUATED on every part since the day it was written.
                radius = cyl.Radius()
        except Exception:
            pass
        props = GProp_GProps()
        try:
            BRepGProp.SurfaceProperties_s(f, props)
            area = abs(props.Mass())
        except Exception:
            area = 0.0
        # Face slenderness — the discriminator for a chamfer. A chamfer is a
        # NARROW strip; a box's smallest face is merely smaller. Area alone
        # cannot tell them apart, and on an 80x60x30 box the 60x30 face is
        # exactly half its neighbours' mean area, which is precisely where an
        # area-only threshold would sit.
        aspect = 1.0
        box = None
        # The bounding-box CENTRE is kept as well as the aspect. It costs
        # nothing — the box is already being computed — and it is what lets a
        # recognised pocket or rib say WHERE it is. Without it every prismatic
        # feature was a bag of face ids with no position, so a callout had
        # nothing to point a leader line at.
        centre = None
        try:
            from OCP.Bnd import Bnd_Box
            from OCP.BRepBndLib import BRepBndLib
            bb = Bnd_Box()
            BRepBndLib.Add_s(f, bb)
            x0, y0, z0, x1, y1, z1 = bb.Get()
            dims = sorted([x1 - x0, y1 - y0, z1 - z0])
            centre = ((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2)
            box = (x0, y0, z0, x1, y1, z1)
            # dims[0] is the face's thickness (~0 for a plane); use the two
            # in-plane extents.
            if dims[2] > 1e-9:
                aspect = dims[1] / dims[2]
        except Exception:
            pass
        # Representative outward normal for planar faces — needed to tell a
        # chamfer (OBLIQUE to both faces it joins) from a thin plate's side wall
        # (perpendicular to them). Narrowness alone cannot: a 40x8 plate edge is
        # every bit as slender as a chamfer, and read as one.
        normal = None
        try:
            if kind == "PLANE":
                d = BRepAdaptor_Surface(f).Plane().Axis().Direction()
                s = -1.0 if f.Orientation() == _REV else 1.0
                normal = (d.X() * s, d.Y() * s, d.Z() * s)
        except Exception:
            pass
        # Mean outward normal for ANY face type, by sampling. The planar normal
        # above is exact and covers the chamfer test, but a casting is mostly
        # cylinders and freeform: 39 of that part's 230 faces are planar, so a
        # planes-only normal leaves the tool-approach test with nothing to
        # measure on exactly the parts that need it. `normalCoherence` is the
        # length of the mean unit normal — 1.0 for a plane, ~0 for a face that
        # wraps right around — and it is what says whether the mean means
        # anything at all.
        mean_normal, coherence = _mean_normal(f)
        faces[i] = {"id": i, "type": kind, "areaMm2": area, "aspect": round(aspect, 4)}
        if centre:
            faces[i]["centreXYZ"] = [round(c, 3) for c in centre]
        if normal:
            faces[i]["normal"] = normal
        if mean_normal:
            faces[i]["meanNormal"] = [round(c, 4) for c in mean_normal]
            faces[i]["normalCoherence"] = round(coherence, 4)
        if concavity:
            faces[i]["blendConcavity"] = concavity
        if radius is not None:
            faces[i]["radiusMm"] = round(radius, 4)
        if centre is not None:
            # The face's own extents, sorted. `dims[2]` is its longest span and
            # `dims[0]` its thickness.
            faces[i]["extentsMm"] = [round(d, 3) for d in dims]
        if box is not None:
            # And the box UNSORTED, per axis. The sorted extents above cannot be
            # mapped back to X, Y and Z, so a feature built from several faces
            # cannot be given a real bounding box from them — the first attempt
            # reconstructed one from the centre and the largest span and made a
            # 25 mm pocket look 74 mm wide.
            faces[i]["bboxMm"] = [round(v, 3) for v in box]

    emap = TopTools_IndexedDataMapOfShapeListOfShape()
    TopExp.MapShapesAndAncestors_s(shape, TopAbs_EDGE, TopAbs_FACE, emap)
    arcs = []
    for i in range(1, emap.Size() + 1):
        lst = emap.FindFromIndex(i)
        if lst.Size() != 2:
            continue
        edge = TopoDS.Edge_s(emap.FindKey(i))
        f1, f2 = TopoDS.Face_s(lst.First()), TopoDS.Face_s(lst.Last())
        if f1.IsSame(f2):
            continue                      # a seam edge, not a real adjacency
        try:
            ad = BRepAdaptor_Curve(edge)
            t = (ad.FirstParameter() + ad.LastParameter()) / 2.0
            tan = gp_Vec()
            ad.D1(t, gp_Pnt(), tan)
        except Exception:
            continue
        n1, n2 = _normal_on(f1, edge, t), _normal_on(f2, edge, t)
        if n1 is None or n2 is None:
            continue
        cross = n1.Crossed(n2)
        if cross.Magnitude() < TANGENT_TOL:
            label = "tangent"
        else:
            s = cross.Dot(tan) * _edge_sense_in(f1, edge)
            label = "convex" if s > 1e-9 else "concave" if s < -1e-9 else "tangent"
        arcs.append({"a": fmap.FindIndex(f1), "b": fmap.FindIndex(f2), "label": label})

    return {"faces": faces, "arcs": arcs,
            "totalAreaMm2": sum(f["areaMm2"] for f in faces.values())}


def _components(arcs, label="concave"):
    """Union-find over arcs carrying `label`; returns face-id sets."""
    parent = {}

    def find(x):
        parent.setdefault(x, x)
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    for arc in arcs:
        if arc["label"] != label:
            continue
        ra, rb = find(arc["a"]), find(arc["b"])
        if ra != rb:
            parent[ra] = rb
    groups = {}
    for arc in arcs:
        if arc["label"] != label:
            continue
        for fid in (arc["a"], arc["b"]):
            groups.setdefault(find(fid), set()).add(fid)
    return list(groups.values())


# ─── Blend faces (fillets and chamfers) ───────────────────────────────────────

# A blend is small compared with what it blends. A face is only a candidate if
# its area is below this fraction of the mean area of the faces it joins —
# without it, a large flat wall that happens to be tangent to two fillets gets
# called a chamfer, which is what a filleted box did (6 "chamfers" that were its
# own 6 main faces).
BLEND_AREA_RATIO = 0.5
BLEND_SURFACES = ("CYLINDER", "TORUS", "SPHERE")
# A chamfer is a narrow STRIP. Its two in-plane extents differ sharply; a box's
# smallest face does not. Area alone cannot separate them.
CHAMFER_MAX_ASPECT = 0.3


def _oblique_to_neighbours(face, nbr_ids, aag, lo=15.0, hi=75.0):
    """True when a planar face meets its planar neighbours at an OBLIQUE angle.

    This is what makes a chamfer a chamfer: it is a cut across a corner, so it
    sits at roughly 45 degrees to both faces it joins. A thin plate's side wall
    is exactly as narrow and exactly as small, but meets the top and bottom at
    90 degrees — and without this test the boss-plate fixture's four side walls
    were reported as four chamfers.
    """
    n0 = face.get("normal")
    if not n0:
        return False
    checked = 0
    for nid in nbr_ids:
        n1 = aag["faces"].get(nid, {}).get("normal")
        if not n1:
            continue
        dot = max(-1.0, min(1.0, sum(a * b for a, b in zip(n0, n1))))
        ang = math.degrees(math.acos(dot))
        ang = min(ang, 180.0 - ang)          # unsigned dihedral
        if not (lo <= ang <= hi):
            return False
        checked += 1
    return checked >= 2


def find_blends(aag):
    """Identify fillet and chamfer faces.

    The two are found by DIFFERENT tests, and conflating them was the original
    bug. A fillet meets its neighbours TANGENTIALLY — curvature is continuous
    across the join. A chamfer meets them at CONVEX edges, so a tangency test
    scores every real chamfer zero (measured: a box with 24 chamfer faces gave
    48 convex arcs and not one tangent).

    Both additionally have to be SMALL relative to what they join, because the
    faces a fillet touches are tangent to it too — without that test a filleted
    box reported its own six main faces as chamfers.
    """
    tangent_nbrs, convex_nbrs, has_concave = {}, {}, set()
    for arc in aag["arcs"]:
        if arc["label"] == "concave":
            has_concave.add(arc["a"])
            has_concave.add(arc["b"])
            continue
        target = tangent_nbrs if arc["label"] == "tangent" else (
            convex_nbrs if arc["label"] == "convex" else None)
        if target is None:
            continue
        target.setdefault(arc["a"], set()).add(arc["b"])
        target.setdefault(arc["b"], set()).add(arc["a"])

    def small_against(fid, nbrs, known=frozenset()):
        """Small relative to the faces it blends — ignoring neighbours that are
        themselves blends. A fillet running along another fillet has only blend
        neighbours of its own size, so comparing against them rejects it; two
        such faces survived on the filleted-pocket fixture and were then counted
        as blind holes by the analytic pass."""
        f = aag["faces"][fid]
        real = [n for n in nbrs if n not in known]
        if not real:
            return True                     # entirely inside a blend network
        nbr_area = sum(aag["faces"][n]["areaMm2"] for n in real) / len(real)
        return nbr_area > 0 and f["areaMm2"] <= nbr_area * BLEND_AREA_RATIO

    # Fixpoint: accepting a blend can reveal its neighbours as blends too.
    fillet_ids = set()
    for _ in range(4):
        added = False
        for fid, f in aag["faces"].items():
            if fid in fillet_ids or f["type"] not in BLEND_SURFACES:
                continue
            tan = tangent_nbrs.get(fid, set())
            if len(tan) >= 2 and small_against(fid, tan, fillet_ids):
                fillet_ids.add(fid)
                added = True
        if not added:
            break

    fillets, chamfers = [], []
    for fid, f in aag["faces"].items():
        tan = tangent_nbrs.get(fid, set())
        if fid in fillet_ids:
            # A fillet's RADIUS and which way it curves. An internal corner
            # (concave — material outside the cylinder) is a tool-access
            # constraint: no cutter smaller than twice that radius will reach
            # into it. An external edge round (convex) is not a constraint at
            # all, and reporting the two as one number would let a 0.5 mm edge
            # break masquerade as an unmachinable corner.
            fillets.append({"faceId": fid, "type": f["type"],
                            "areaMm2": round(f["areaMm2"], 1),
                            "radiusMm": f.get("radiusMm"),
                            "concavity": f.get("blendConcavity"),
                            "joins": sorted(tan), "confidence": "medium"})
            continue
        cvx = convex_nbrs.get(fid, set())
        # A chamfer has NO concave edge — it is a cut across a convex corner.
        # A slot wall is narrow and small too, but meets its floor concavely,
        # and without this test a through slot reported as three chamfers.
        if (f["type"] == "PLANE" and len(cvx) >= 2 and fid not in has_concave
                and f.get("aspect", 1.0) <= CHAMFER_MAX_ASPECT
                and _oblique_to_neighbours(f, cvx, aag)
                and small_against(fid, cvx)):
            chamfers.append({"faceId": fid, "type": "PLANE",
                             "areaMm2": round(f["areaMm2"], 1),
                             "aspect": f.get("aspect"),
                             "joins": sorted(cvx), "confidence": "medium"})
    return fillets, chamfers


def collapse_blends(aag, blend_ids):
    """Return a graph with blend faces removed and their neighbours rejoined.

    THIS IS THE FIX THAT MAKES THE RECOGNISER WORK ON REAL PARTS. Every casting
    and moulding has filleted internal corners, and a fillet sits BETWEEN a
    pocket wall and its floor — so the concave arc that defines the pocket does
    not exist in the raw graph. Measured on a filleted pocketed box: 100 arcs,
    all tangent, zero concave, and the pocket vanished entirely while 11
    non-existent chamfers were invented.

    Lifting the blend out and reconnecting what it joined restores the arc the
    geometry implies. The rejoined arc takes the blend's own concavity relative
    to the solid: a fillet in an internal corner is concave, a fillet over an
    external edge is convex. That is read from the arcs the blend already had
    with its neighbours, so no new geometry query is needed.
    """
    if not blend_ids:
        return aag
    keep = {fid: f for fid, f in aag["faces"].items() if fid not in blend_ids}
    arcs = [a for a in aag["arcs"] if a["a"] not in blend_ids and a["b"] not in blend_ids]

    # For each blend, join every pair of its non-blend neighbours.
    by_blend = {}
    for arc in aag["arcs"]:
        for near, far in ((arc["a"], arc["b"]), (arc["b"], arc["a"])):
            if near in blend_ids and far not in blend_ids:
                by_blend.setdefault(near, []).append(far)

    # What label the rejoined arc carries: the blend stands in for the sharp
    # edge it replaced, so it must re-create that edge's convexity.
    blend_arc_labels = {}
    for arc in aag["arcs"]:
        for near in (arc["a"], arc["b"]):
            if near in blend_ids:
                blend_arc_labels.setdefault(near, []).append(arc["label"])

    for bid, nbrs in by_blend.items():
        uniq = sorted(set(nbrs))
        labels = blend_arc_labels.get(bid, [])
        if any(l == "convex" for l in labels):
            # A CHAMFER meets its neighbours at convex edges, so it replaced a
            # convex edge. Rejoining it as concave made a chamfered box read as
            # one giant pocket.
            label = "convex"
        else:
            # A fillet joins tangentially, so its own curvature decides: a
            # fillet in an internal corner is concave, a rounded external edge
            # is convex.
            label = aag["faces"].get(bid, {}).get("blendConcavity", "concave")
        for i in range(len(uniq)):
            for j in range(i + 1, len(uniq)):
                arcs.append({"a": uniq[i], "b": uniq[j], "label": label,
                             "viaBlend": bid})
    return {"faces": keep, "arcs": arcs, "totalAreaMm2": aag["totalAreaMm2"]}


# ─── Prismatic features (pockets, slots, steps) ───────────────────────────────

#: A pocket, slot or step is a volume a tool reaches from ONE direction: every
#: face of it must be visible from that direction, so the outward normals fit
#: inside a hemisphere. 90° is the geometric limit; the margin allows for the
#: draft and near-tangent walls that real parts have. Without this test the
#: concave decomposition happily merged the entire interior of an aluminium
#: casting into a single 43-face "pocket" of 14,716 mm² — 23% of the part's
#: whole skin, wrapping right around it, and reported with "high" confidence.
SINGLE_APPROACH_MAX_DEG = 100.0

#: Every concave junction between two faces is a component of the graph, and on
#: a folded pressing there are dozens of them that are simply where two walls
#: meet. A recognised feature has to be big enough for a tool to enter: the
#: floor of the smallest practical end mill, Ø3, is 7.1 mm². Components below
#: this are junctions, not features, and 12 of them appeared as "steps" of 3 to
#: 65 mm² on a seat cross member.
MIN_FEATURE_AREA_MM2 = 7.1


def _approach_span_deg(aag, comp):
    """Smallest cone half-angle that contains every planar normal of `comp`.

    Returns None when the component has too few planar faces to decide — an
    unmeasurable component is left alone rather than rejected on a guess.
    """
    normals = []
    for f in comp:
        meta = aag["faces"][f]
        n = meta.get("normal") or meta.get("meanNormal")
        # A face that wraps more than about a hemisphere has no "direction" for
        # this test — that is the bore of a hole, and it is measured by the
        # cylinder pass, not looked at from outside.
        if not n or meta["areaMm2"] <= 0:
            continue
        if not meta.get("normal") and (meta.get("normalCoherence") or 0) < 0.5:
            continue
        normals.append((n, meta["areaMm2"]))
    if len(normals) < 3:
        return None
    total = sum(a for _n, a in normals) or 1.0
    mean = [sum(n[k] * a for n, a in normals) / total for k in range(3)]
    mag = math.sqrt(sum(c * c for c in mean))
    candidates = [n for n, _a in sorted(normals, key=lambda p: -p[1])[:8]]
    if mag > 1e-6:
        candidates.append(tuple(c / mag for c in mean))
    best = None
    for d in candidates:
        worst = max(math.degrees(math.acos(max(-1.0, min(1.0,
                    sum(n[k] * d[k] for k in range(3)))))) for n, _a in normals)
        if best is None or worst < best:
            best = worst
    return round(best, 1)



def _component_extents(aag, comp):
    """Real axis-aligned box of a recognised feature: [dx, dy, dz], unsorted.

    Built from the per-face boxes the graph stores, so no new kernel call is
    needed. Returns None when any face is missing its box rather than filling
    the gap with a zero — a zero width would make every pocket infinitely
    slender and fail the rule on parts nobody measured.
    """
    lo = [None, None, None]
    hi = [None, None, None]
    for fid in comp:
        b = (aag["faces"].get(fid) or {}).get("bboxMm")
        if not b or len(b) != 6:
            return None
        for k in range(3):
            lo[k] = b[k] if lo[k] is None else min(lo[k], b[k])
            hi[k] = b[k + 3] if hi[k] is None else max(hi[k], b[k + 3])
    if any(v is None for v in lo):
        return None
    return [round(hi[k] - lo[k], 3) for k in range(3)]


def _pocket_depth_axis(aag, comp):
    """Which axis a pocket is CUT ALONG, from its floor.

    The floor is the largest planar face in the component and the cutter comes
    in along its normal, so the depth is the component's span on that axis and
    the width is the narrower of the other two. Guessing instead — taking the
    smallest span as the width and the middle as the depth — gets a wide shallow
    pocket exactly backwards.

    Returns None when no planar face carries a usable axis-aligned normal, and
    the slenderness measure then abstains rather than picking an axis at random.
    """
    best_area, axis = 0.0, None
    for fid in comp:
        f = aag["faces"].get(fid) or {}
        if f.get("type") != "PLANE":
            continue
        n = f.get("normal")
        if not n or f.get("areaMm2", 0) <= best_area:
            continue
        for k in range(3):
            if abs(n[k]) > 0.999:
                best_area, axis = f["areaMm2"], k
                break
    return axis


def prismatic_features(aag):
    """Concave-connected components, classified pocket / slot / step.

    A closed pocket is walled all the way round; a slot runs out of the part at
    both ends, so fewer of its walls close on each other. The discriminator is
    how many of the component's own faces are mutually adjacent by a concave arc
    versus how many open onto the outer skin.

    Two physical gates keep the graph's artefacts out of the feature list: the
    component must be reachable from a SINGLE tool approach direction, and it
    must be larger than the smallest tool that could make it. Both were added
    after real parts: see SINGLE_APPROACH_MAX_DEG and MIN_FEATURE_AREA_MM2.
    """
    out = []
    for comp in _components(aag["arcs"], "concave"):
        kinds = [aag["faces"][f]["type"] for f in comp]
        area = sum(aag["faces"][f]["areaMm2"] for f in comp)
        planes = sum(1 for k in kinds if k == "PLANE")
        cyls = sum(1 for k in kinds if k == "CYLINDER")
        # A cylinder plus a flat floor is a blind hole; the cylindrical pass
        # reports it with exact dimensions, so it is not a prismatic feature.
        if cyls >= 1 and planes <= 1:
            continue
        # Pocket, slot and step are PRISMATIC features: each is bounded by at
        # least one planar floor or wall. A component of nothing but freeform
        # patches is the transition between two formed surfaces — which is what
        # every one of the twelve phantom "steps" on a stamped seat cross member
        # turned out to be, two of them a TORUS meeting a NURBS.
        if planes < 1:
            continue
        # And it must be big enough for a tool to enter in at least two of its
        # faces; a pair of 5 mm² slivers is a junction between faces, not a
        # feature with a floor and a wall.
        if sum(1 for f in comp if aag["faces"][f]["areaMm2"] >= MIN_FEATURE_AREA_MM2) < 2:
            continue
        if area < MIN_FEATURE_AREA_MM2:
            continue
        approach = _approach_span_deg(aag, comp)
        if approach is not None and approach > SINGLE_APPROACH_MAX_DEG:
            continue                  # wraps the part — not a single-setup volume
        # Count how many walls of this component close on each other. A closed
        # rectangular pocket has all four; a through slot has only two.
        inner = sum(1 for arc in aag["arcs"]
                    if arc["label"] == "concave" and arc["a"] in comp and arc["b"] in comp)
        # Count every wall-like face, not just planar ones: after blend collapse
        # a wall can legitimately be a surviving cylindrical fillet, and counting
        # planes alone mislabelled a filleted through-slot as a "step".
        walls = max(0, len(comp) - 1)       # one face of the component is the floor
        kind = "pocket" if walls >= 4 else "slot" if walls in (2, 3) else "step"
        out.append({
            "kind": kind, "faceIds": sorted(comp), "faceCount": len(comp),
            "wallCount": walls, "concaveArcs": inner,
            "areaMm2": round(area, 1),
            # Where the pocket/slot/step actually is, so a callout has something
            # to point at. Area-weighted, so a pocket's large floor anchors it
            # rather than the anchor drifting to whichever wall the mesher split
            # into the most faces.
            "centroidXYZ": centroid_of(aag, comp),
            # HOW BIG IT IS, not merely where. `mach-pocket-depth-ratio` has
            # abstained on every part ever analysed because the recogniser
            # published an area and a centroid and no extents — so a pocket
            # could be named and located but never judged for slenderness.
            # Sorted ascending: [narrowest, middle, longest].
            "extentsMm": _component_extents(aag, comp),
            "depthAxis": _pocket_depth_axis(aag, comp),
            # The measured approach span, published rather than merely used: a
            # feature at 95° is a shallow pocket with drafted walls, and a
            # reviewer is entitled to see how close to the limit it sat.
            "approachSpanDeg": approach,
            # Rule-based recognition on clean prismatic geometry is reliable;
            # say so rather than implying a precision we cannot back.
            "confidence": "high" if planes >= 3 else "medium",
        })
    return out


# ─── Cylindrical feature grouping (counterbore / countersink) ─────────────────

def _collinear(a, b):
    """True when two features share the SAME axis line, not merely a direction.

    Direction alone is not enough and the difference is not academic: on a plate
    with a Ø8 blind hole and a Ø10 through hole 30 mm apart, both axes are +Z, and
    a direction-only test merged them into one "counterbored hole" that does not
    exist. The axis points must also be collinear.
    """
    da, db = a.get("axisXYZ"), b.get("axisXYZ")
    if not da or not db:
        return False
    if abs(abs(sum(x * y for x, y in zip(da, db))) - 1.0) >= (1 - math.cos(COAXIAL_ANG_TOL)):
        return False
    pa, pb = a.get("axisPointXYZ"), b.get("axisPointXYZ")
    if not pa or not pb:
        return False
    # Reject any offset perpendicular to the shared axis.
    delta = [q - p for p, q in zip(pa, pb)]
    along = sum(d * u for d, u in zip(delta, da))
    perp = math.sqrt(max(0.0, sum(d * d for d in delta) - along * along))
    return perp <= COAXIAL_POS_TOL


def _extent_along(extents, axis):
    """Part extent projected onto an axis — the span a hole must cross to be
    through. Using the bbox's largest dimension instead marks every axial hole
    blind on a part that is wider than it is deep."""
    if not extents or not axis:
        return None
    return sum(abs(a) * e for a, e in zip(axis, extents))


def group_stepped_holes(feature_table, cone_faces, extents=None):
    """Merge coaxial cylinders (and cones) of stepped diameter into one hole.

    A larger COLLINEAR cylinder at the mouth is a COUNTERBORE; a COLLINEAR cone
    at the mouth is a COUNTERSINK. The cone is what decides, not the diameter
    ratio — swapping the two would put the wrong tool on the process sheet.

    A countersink is not necessarily two cylinders: the common case is one bore
    plus one cone, which is why the cone is checked before the family size.
    """
    holes = [f for f in feature_table if f.get("kind") == "hole" and f.get("axisXYZ")]
    others = [f for f in feature_table if f.get("kind") != "hole" or not f.get("axisXYZ")]
    used, compound = set(), []

    for i, h in enumerate(holes):
        if i in used:
            continue
        family = [(i, h)]
        for j, k in enumerate(holes):
            if j <= i or j in used or not _collinear(h, k):
                continue
            family.append((j, k))
        cone = next((c for c in cone_faces if _collinear(h, c)), None)
        if len(family) < 2 and cone is None:
            continue
        family.sort(key=lambda p: p[1]["diaMm"])
        small, large = family[0][1], family[-1][1]
        stepped = abs(large["diaMm"] - small["diaMm"]) > 1e-6
        if not stepped and cone is None:
            continue
        # A bore shortened by a counterbore reads as "blind" on its own depth;
        # the compound feature is through if the stages together span the part.
        total_depth = sum(f["depthMm"] for _, f in family) + (cone["heightMm"] if cone else 0.0)
        through = small.get("through")
        span = _extent_along(extents, small.get("axisXYZ"))
        if through is False and span and total_depth >= span - max(0.1, span * 0.02):
            through = True
        compound.append({
            "kind": "countersunk-hole" if cone else "counterbored-hole",
            "boreDiaMm": small["diaMm"], "boreDepthMm": small["depthMm"],
            "through": through,
            "featureDiaMm": (cone["maxDiaMm"] if cone else large["diaMm"]),
            "featureDepthMm": (cone["heightMm"] if cone else large["depthMm"]),
            "includedAngleDeg": (cone["includedAngleDeg"] if cone else None),
            "axisXYZ": small["axisXYZ"],
            # Carried through, not dropped. Losing it did more than cost an
            # anchor: the sheet-metal flange logic keys off axisPointXYZ on hole
            # rows, so every counterbored and countersunk hole was silently
            # skipped there.
            "axisPointXYZ": small.get("axisPointXYZ"),
            "count": min(f.get("count", 1) for _, f in family),
            "confidence": "high",
        })
        for j, _ in family:
            used.add(j)

    remaining = [h for i, h in enumerate(holes) if i not in used]
    return compound, remaining + others


def cone_features(shape):
    """Conical faces with their half-angle — the countersink discriminator."""
    from OCP.BRepAdaptor import BRepAdaptor_Surface
    from OCP.GeomAbs import GeomAbs_Cone
    from OCP.TopAbs import TopAbs_FACE
    from OCP.TopExp import TopExp_Explorer
    from OCP.TopoDS import TopoDS
    out = []
    ex = TopExp_Explorer(shape, TopAbs_FACE)
    while ex.More():
        f = TopoDS.Face_s(ex.Current())
        ex.Next()
        try:
            ad = BRepAdaptor_Surface(f)
            if ad.GetType() != GeomAbs_Cone:
                continue
            cone = ad.Cone()
            half = abs(cone.SemiAngle())
            v0, v1 = ad.FirstVParameter(), ad.LastVParameter()
            height = abs(v1 - v0) * math.cos(half)
            r0 = abs(cone.RefRadius() + v0 * math.sin(half))
            r1 = abs(cone.RefRadius() + v1 * math.sin(half))
            ax = cone.Axis().Direction()
            loc = cone.Axis().Location()
            out.append({
                "axisXYZ": [ax.X(), ax.Y(), ax.Z()],
                "axisPointXYZ": [loc.X(), loc.Y(), loc.Z()],
                "minDiaMm": round(min(r0, r1) * 2, 2),
                "maxDiaMm": round(max(r0, r1) * 2, 2),
                "heightMm": round(height, 2),
                "includedAngleDeg": round(math.degrees(half) * 2, 1),
            })
        except Exception:
            continue
    return out


def centroid_of(aag, face_ids):
    """Area-weighted centre of a set of faces — a feature's anchor point.

    Area-weighted rather than a plain mean so a pocket's large floor pulls the
    anchor onto the pocket instead of it drifting toward whichever wall happens
    to be split into the most faces by the mesher.
    """
    sx = sy = sz = wsum = 0.0
    for fid in face_ids:
        f = aag["faces"].get(fid)
        c = f.get("centreXYZ") if f else None
        if not c:
            continue
        w = max(f.get("areaMm2", 0.0), 1e-9)
        sx += c[0] * w; sy += c[1] * w; sz += c[2] * w; wsum += w
    if wsum <= 0:
        return None
    return [round(sx / wsum, 3), round(sy / wsum, 3), round(sz / wsum, 3)]


# ─── Ribs ─────────────────────────────────────────────────────────────────────

# A rib's two side faces are not necessarily parallel: a moulded or die-cast rib
# is drafted, so each side leans outward by the draft angle. This is how far from
# anti-parallel the pair may sit and still be one rib (about 6 deg per side).
RIB_OPPOSED_TOL_DEG = 12.0
# Recognition is deliberately LOOSER than the rules that judge ribs: a rib only
# has to be taller than it is thick to be recognised. Gating recognition on the
# 40-60%-of-wall threshold would make an OVER-THICK rib vanish from the model
# instead of being flagged — a recogniser that hides exactly the parts a rule
# would fail is worse than no recogniser at all.
#
# MEASURED AGAINST REAL PARTS: at 1.0 this admitted a 25.5 mm x 26.4 mm lump on a
# machined block as a "rib" — a height/thickness of 1.03, which is a block, not a
# stiffener. No design guideline treats anything under about 2:1 as a rib, and
# the fixture ribs run 4:1 to 6:1, so 2.0 stays far below anything the catalogue
# would judge while rejecting the false positive.
RIB_MIN_HEIGHT_TO_THICKNESS = 2.0


def _planar_geometry(shape, ids):
    """Outward normal, a point on the plane and the bbox, per planar face id.

    Indexed by the SAME face map build_aag uses, so ids line up with the graph.
    """
    from OCP.BRepAdaptor import BRepAdaptor_Surface
    from OCP.Bnd import Bnd_Box
    from OCP.BRepBndLib import BRepBndLib
    from OCP.GeomAbs import GeomAbs_Plane
    from OCP.TopAbs import TopAbs_FACE, TopAbs_REVERSED
    from OCP.TopExp import TopExp
    from OCP.TopoDS import TopoDS
    from OCP.TopTools import TopTools_IndexedMapOfShape

    fmap = TopTools_IndexedMapOfShape()
    TopExp.MapShapes_s(shape, TopAbs_FACE, fmap)
    out = {}
    for i in ids:
        if i < 1 or i > fmap.Size():
            continue
        f = TopoDS.Face_s(fmap.FindKey(i))
        try:
            ad = BRepAdaptor_Surface(f)
            if ad.GetType() != GeomAbs_Plane:
                continue
            pl = ad.Plane()
            d = pl.Axis().Direction()
            s = -1.0 if f.Orientation() == TopAbs_REVERSED else 1.0
            bb = Bnd_Box()
            BRepBndLib.Add_s(f, bb)
            x0, y0, z0, x1, y1, z1 = bb.Get()
            out[i] = {
                "n": (d.X() * s, d.Y() * s, d.Z() * s),
                "c": ((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2),
                "lo": (x0, y0, z0), "hi": (x1, y1, z1),
            }
        except Exception:
            continue
    return out


def _dot(a, b):
    return sum(x * y for x, y in zip(a, b))


def _cross(a, b):
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])


def _unit(v):
    m = math.sqrt(_dot(v, v))
    return None if m < 1e-12 else (v[0] / m, v[1] / m, v[2] / m)


def _bbox_extent(g, u):
    """Extent of a face's bounding box along a unit direction."""
    return sum(abs(u[i]) * (g["hi"][i] - g["lo"][i]) for i in range(3))


def rib_features(shape, aag):
    """Thin prismatic protrusions standing on a wall.

    A rib is a PAIR OF OPPOSED SIDE FACES WITH MATERIAL BETWEEN THEM, standing on
    a common base. Two tests do the work, and both are needed:

    1. **Material between, not void between.** For a rib the two side faces look
       AWAY from each other, so the far face lies BEHIND the near face's outward
       normal: `(c_far - c_near) . n_near < 0`. For a pocket or slot the walls
       look at each other and the sign flips. This one signed dot separates a
       protrusion from a depression without any solid classification.

    2. **A common base reached by a CONCAVE arc from both sides.** This is what
       "standing on a wall" means topologically, and without it the part's own
       outer form qualifies: a plain 40x40x8 plate has two opposed faces with
       material between them and a height-to-thickness ratio of 5, which is a
       textbook rib shape and emphatically not a rib. Its faces meet their
       neighbours CONVEXLY, so this test rejects it and the box.

    Ribs are recognised on the blend-COLLAPSED graph, so a filleted rib root —
    which is every real moulded rib — still presents the concave arc that test 2
    depends on.

    Thickness is reported AT THE BASE, which is what the 40-60%-of-wall guideline
    is written against. On a drafted rib the two sides lean apart, so the base is
    thicker than the mid-height separation by `height * tan(draft)`; that term is
    added rather than ignored. On a rib with no draft it is exactly zero and the
    measurement is the construction dimension.
    """
    faces = aag["faces"]
    geo = _planar_geometry(shape, list(faces.keys()))
    concave, adjacent = {}, {}
    for arc in aag["arcs"]:
        adjacent.setdefault(arc["a"], set()).add(arc["b"])
        adjacent.setdefault(arc["b"], set()).add(arc["a"])
        if arc["label"] == "concave":
            concave.setdefault(arc["a"], set()).add(arc["b"])
            concave.setdefault(arc["b"], set()).add(arc["a"])

    cos_tol = math.cos(math.radians(180.0 - RIB_OPPOSED_TOL_DEG))
    candidates = []
    ids = sorted(geo.keys())
    for a in range(len(ids)):
        i = ids[a]
        gi = geo[i]
        for b in range(a + 1, len(ids)):
            j = ids[b]
            gj = geo[j]
            # Opposed within the draft tolerance.
            if _dot(gi["n"], gj["n"]) > cos_tol:
                continue
            delta = tuple(q - p for p, q in zip(gi["c"], gj["c"]))
            if _dot(delta, gi["n"]) >= 0:
                continue                      # void between them — a slot, not a rib
            # A base both sides meet concavely. Largest by area when several.
            shared = (concave.get(i, set()) & concave.get(j, set()))
            base = max(shared, key=lambda f: faces.get(f, {}).get("areaMm2", 0.0), default=None)
            if base is None:
                continue
            bn = geo.get(base, {}).get("n")
            if bn is None:
                continue                      # rib on a freeform wall — a known limit
            u = _unit(tuple((p - q) / 2 for p, q in zip(gi["n"], gj["n"])))
            if u is None:
                continue
            t_mid = abs(_dot(delta, u))
            if t_mid <= 1e-6:
                continue
            height = _bbox_extent(gi, bn)
            # Draft opens the rib out toward its base; the guideline is written
            # against the base thickness, so add the term instead of quietly
            # reporting the thinner mid-height figure.
            phi = math.acos(max(-1.0, min(1.0, -_dot(gi["n"], gj["n"]))))
            thickness = t_mid + height * math.tan(phi / 2.0)
            if height < RIB_MIN_HEIGHT_TO_THICKNESS * thickness:
                continue
            w = _unit(_cross(bn, u))
            candidates.append({
                "i": i, "j": j, "base": base, "bases": shared,
                "thicknessMm": thickness, "heightMm": height,
                "lengthMm": _bbox_extent(gi, w) if w else None,
                "draftDeg": math.degrees(phi) / 2.0,
            })

    # Thinnest pairs win: a genuine rib's own two sides are far closer together
    # than either is to a neighbouring rib's, so claiming the tight pairs first
    # stops one rib being consumed by a spurious cross-part match.
    candidates.sort(key=lambda c: c["thicknessMm"])
    ribs, used = [], set()
    for c in candidates:
        if c["i"] in used or c["j"] in used:
            continue
        # The rib's own faces: its two sides, plus everything adjacent to BOTH of
        # them (its top and its ends) minus the base it stands on. Claiming these
        # matters — left in the graph, the ends keep the base concave-connected
        # and a field of ribs decomposes into one large phantom "pocket".
        own = {c["i"], c["j"]} | ((adjacent.get(c["i"], set()) & adjacent.get(c["j"], set()))
                                  - set(c["bases"]))
        ribs.append({
            "kind": "rib",
            "faceIds": sorted(own),
            "centroidXYZ": centroid_of(aag, own),
            "baseFaceId": c["base"],
            "thicknessMm": round(c["thicknessMm"], 3),
            "heightMm": round(c["heightMm"], 3),
            "lengthMm": round(c["lengthMm"], 2) if c["lengthMm"] else None,
            "draftPerSideDeg": round(c["draftDeg"], 2),
            "heightToThickness": round(c["heightMm"] / c["thicknessMm"], 2),
            "confidence": "high" if c["draftDeg"] < 0.01 else "medium",
        })
        used |= own
    ribs.sort(key=lambda r: -r["thicknessMm"])
    return ribs


# ─── Sheet metal: bends, thickness, flanges ───────────────────────────────────

# Two cylinders belong to the same bend when they share an axis LINE and sweep
# the same angle. Loose enough for exporter round-off, tight enough that two
# unrelated bends on parallel axes are not merged.
BEND_ANG_TOL_DEG = 2.0
BEND_AXIS_POS_TOL = 0.05
#: A pair sweeping this far or more is a hole/counterbore/boss-blend, not a fold.
#: Real folded bends measured 30-100 deg; every false positive on a casting and a
#: machined block came back at exactly 180.0 deg.
BEND_MAX_ANGLE_DEG = 170.0
#: How far a bend's implied thickness may sit from the part's median before it is
#: rejected as not belonging to the same sheet.
SHEET_T_TOL_MM = 0.05
SHEET_T_TOL_FRAC = 0.10
#: How far the radius-derived thickness and the ray-cast wall may disagree and
#: still be believed to be measuring the same sheet.
SHEET_WALL_AGREE = 1.35


def sheet_metal_features(shape, feature_table=None, wall_p50_mm=None, aperture_block=None):
    """Bends, sheet thickness and flange lengths from B-rep geometry.

    A bend is a PAIR of coaxial cylinders sweeping the same angle: the inside
    radius and the outside radius. That pairing is what makes the measurement
    exact rather than assumed — the sheet THICKNESS is simply the difference of
    the two radii, so it comes from the same geometry as everything else instead
    of being typed in. Verified on a bracket built with t=2.00, ri=3.00, 90 deg:
    the kernel returns r=3.00 and r=5.00 both spanning 90.0 deg.

    Until this existed, all four sheet-metal rules depended on measures nothing
    produced, so the family evaluated 0 of 4 rules on every part ever uploaded.
    """
    from OCP.BRepAdaptor import BRepAdaptor_Surface
    from OCP.Bnd import Bnd_Box
    from OCP.BRepBndLib import BRepBndLib
    from OCP.GeomAbs import GeomAbs_Cylinder, GeomAbs_Plane
    from OCP.TopAbs import TopAbs_FACE
    from OCP.TopExp import TopExp_Explorer
    from OCP.TopoDS import TopoDS

    cylinders, planes = [], []
    ex = TopExp_Explorer(shape, TopAbs_FACE)
    while ex.More():
        f = TopoDS.Face_s(ex.Current())
        ex.Next()
        try:
            ad = BRepAdaptor_Surface(f)
            if ad.GetType() == GeomAbs_Cylinder:
                c = ad.Cylinder()
                d, p = c.Axis().Direction(), c.Axis().Location()
                cylinders.append({
                    "r": c.Radius(),
                    "axis": (d.X(), d.Y(), d.Z()),
                    "point": (p.X(), p.Y(), p.Z()),
                    "angleDeg": math.degrees(abs(ad.LastUParameter() - ad.FirstUParameter())),
                    "lengthMm": abs(ad.LastVParameter() - ad.FirstVParameter()),
                })
            elif ad.GetType() == GeomAbs_Plane:
                pl = ad.Plane()
                n = pl.Axis().Direction()
                loc = pl.Axis().Location()
                b = Bnd_Box()
                BRepBndLib.Add_s(f, b)
                x0, y0, z0, x1, y1, z1 = b.Get()
                planes.append({
                    "normal": (n.X(), n.Y(), n.Z()),
                    "point": (loc.X(), loc.Y(), loc.Z()),
                    "lo": (x0, y0, z0), "hi": (x1, y1, z1),
                    "dims": sorted([x1 - x0, y1 - y0, z1 - z0]),
                })
        except Exception:
            continue

    def same_axis_line(a, b):
        dot = sum(x * y for x, y in zip(a["axis"], b["axis"]))
        if abs(abs(dot) - 1.0) >= (1 - math.cos(COAXIAL_ANG_TOL)):
            return False
        delta = [q - p for p, q in zip(a["point"], b["point"])]
        along = sum(d * u for d, u in zip(delta, a["axis"]))
        perp = math.sqrt(max(0.0, sum(d * d for d in delta) - along * along))
        return perp <= BEND_AXIS_POS_TOL

    bends, used = [], set()
    for i, a in enumerate(cylinders):
        if i in used:
            continue
        for j, b in enumerate(cylinders):
            if j <= i or j in used:
                continue
            if not same_axis_line(a, b):
                continue
            if abs(a["angleDeg"] - b["angleDeg"]) > BEND_ANG_TOL_DEG:
                continue
            # A pair sweeping a half turn or more is not a FOLD. It is a hole and
            # its counterbore, or a boss and its blend — two coaxial cylinders of
            # different radius, which is exactly the signature this pairing looks
            # for. Measured on real parts: an aluminium casting reported eleven
            # "bends" and a machined block four, every one of them at 180.0 deg,
            # while the one genuine folded bracket in the set had bends between
            # 30 and 100 deg. Without this test both parts were handed to the
            # sheet-metal rule family.
            if max(a["angleDeg"], b["angleDeg"]) > BEND_MAX_ANGLE_DEG:
                continue
            t = abs(a["r"] - b["r"])
            if t <= 1e-3:
                continue
            inner, outer = (a, b) if a["r"] < b["r"] else (b, a)
            bends.append({
                "insideRadiusMm": round(inner["r"], 3),
                "outsideRadiusMm": round(outer["r"], 3),
                "thicknessMm": round(t, 3),
                "angleDeg": round((a["angleDeg"] + b["angleDeg"]) / 2, 1),
                "bendLengthMm": round(max(a["lengthMm"], b["lengthMm"]), 2),
                "axisXYZ": [round(v, 4) for v in inner["axis"]],
                "axisPointXYZ": [round(v, 4) for v in inner["point"]],
            })
            used.add(i)
            used.add(j)
            break

    if not bends:
        # No paired cylinders means this is not a folded sheet part — say so
        # rather than returning zeros that would read as measurements.
        return {"isSheetMetal": False, "bends": [], "reason":
                "No paired coaxial cylinders found, so no bend could be measured. "
                "This part does not look like folded sheet metal."}

    # Thickness: the median across bends, so one malformed bend cannot move it.
    ts = sorted(b["thicknessMm"] for b in bends)
    thickness = ts[len(ts) // 2]

    # ── Coherence. A SHEET HAS ONE THICKNESS. ────────────────────────────────
    # Two tests, both taken from what real parts actually measured. On the one
    # genuine folded bracket in a six-part set, all 38 bends returned 1.602 mm
    # and the ray-cast wall read 1.60 — the same number twice, from two
    # independent measurements. On an aluminium casting the "bends" returned
    # 6.5 / 3.5 / 4.8 / 0.5 mm against a 15.8 mm wall, and on a machined block
    # 11.5 / 4.75 against an 8 mm wall. Nothing is 11.5 mm sheet.
    #
    # Without this the family was assigned on the strength of ANY coaxial
    # cylinder pair, so a casting was handed to the sheet-metal rules and every
    # finding they produced — including a negative hole-to-bend clearance — was
    # fabricated from geometry that is not a bend.
    kept = [b for b in bends
            if abs(b["thicknessMm"] - thickness) <= max(SHEET_T_TOL_MM,
                                                        thickness * SHEET_T_TOL_FRAC)]
    if len(kept) < max(1, len(bends) * 0.6):
        return {"isSheetMetal": False, "bends": [], "reason":
                "Coaxial cylinder pairs were found, but they imply "
                f"inconsistent thicknesses ({min(ts)}-{max(ts)} mm). A folded "
                "sheet has ONE thickness, so these are holes, counterbores or "
                "blends rather than bends, and no sheet-metal rule is applied."}
    bends = kept

    # The derived thickness has to agree with the INDEPENDENTLY measured wall.
    # Two different methods — radius difference and a ray cast — landing on the
    # same number is what makes this a measurement rather than a coincidence.
    if wall_p50_mm and wall_p50_mm > 0:
        ratio = thickness / wall_p50_mm
        if not (1.0 / SHEET_WALL_AGREE <= ratio <= SHEET_WALL_AGREE):
            return {"isSheetMetal": False, "bends": [], "reason":
                    f"Bend radii imply a {round(thickness, 2)} mm sheet, but the "
                    f"wall measures {round(wall_p50_mm, 2)} mm. Two independent "
                    "measurements of the same thing disagree, so this is not "
                    "treated as folded sheet and no sheet-metal rule is applied."}

    # Flange length, measured from the BEND rather than mined from bounding
    # boxes. A leg of a folded part is the planar face lying tangent to the bend,
    # i.e. exactly the inside radius (or outside radius) away from the bend axis.
    # The flange is that face's extent measured perpendicular to the bend line.
    #
    # Bbox heuristics do not work here: a planar face is flat so its smallest
    # bbox dimension is ~0, and filtering on "wider than the thickness" picks up
    # the bend's own 5 mm end-cap and reports it as a 5 mm flange on a bracket
    # whose legs are 50 and 40 mm.
    def _extent_along(p, u):
        """Bounding-box extent of a face along a unit direction."""
        return sum(abs(u[i]) * (p["hi"][i] - p["lo"][i]) for i in range(3))

    flange = None
    for b in bends:
        ax = b["axisXYZ"]
        ap = b["axisPointXYZ"]
        for p in planes:
            n = p["normal"]
            # A leg face is PARALLEL to the bend axis (axis lies in the face).
            if abs(sum(a * m for a, m in zip(ax, n))) > 0.02:
                continue
            # Perpendicular distance from the bend axis to this face's plane.
            delta = [q - r for q, r in zip(p["point"], ap)]
            dist = abs(sum(d * m for d, m in zip(delta, n)))
            tangent = (abs(dist - b["insideRadiusMm"]) < 0.05
                       or abs(dist - b["outsideRadiusMm"]) < 0.05)
            if not tangent:
                continue
            # Run perpendicular to both the bend line and the face normal.
            u = (ax[1] * n[2] - ax[2] * n[1],
                 ax[2] * n[0] - ax[0] * n[2],
                 ax[0] * n[1] - ax[1] * n[0])
            run = _extent_along(p, u)
            if run > thickness * 1.5 and (flange is None or run < flange):
                flange = run

    # ── Hole-to-hole and hole-to-edge ────────────────────────────────────────
    # DFMPro's sheet-metal list leads with these two after bend radius, and both
    # are pure arithmetic on data already in hand: the feature table carries a
    # per-instance position for every hole, and the part's own boundary is its
    # bounding box in the sheet plane. They are reported as EDGE-TO-EDGE gaps,
    # not centre distances, so the rule can be a flat "at least 2t" instead of a
    # per-hole formula the evaluator cannot express.
    hole_pts = []          # (x, y, z, radius)
    # APERTURES COUNT AS HOLES HERE. Spacing rules do not care whether the
    # opening is round: a punch tears the web between two slots exactly as it
    # does between two bores. Keying these off the cylinder table alone left
    # FIVE of nine sheet rules abstaining on a bracket with twenty-six cut-outs —
    # the rules a stamping engineer actually asks for, silent on the part that
    # needed them. Radius is the equivalent radius from the perimeter, which
    # under-states a long slot's width and is therefore the conservative choice
    # for a MINIMUM-gap test.
    for ap in ((aperture_block or {}).get("apertures") or []):
        c = ap.get("centroidXYZ")
        r = (ap.get("circleDiaMm") or ap.get("equivalentDiaMm") or 0) / 2.0
        if c and len(c) == 3 and r > 0:
            hole_pts.append((c[0], c[1], c[2], r))
    for row in (feature_table or []):
        if row.get("kind") != "hole":
            continue
        r = float(row.get("diaMm") or 0) / 2.0
        if r <= 0:
            continue
        pts = row.get("instancesXYZ") or ([row["axisPointXYZ"]] if row.get("axisPointXYZ") else [])
        for p3 in pts:
            if p3 and len(p3) == 3:
                hole_pts.append((p3[0], p3[1], p3[2], r))

    hole_gap = None
    for i in range(len(hole_pts)):
        for j in range(i + 1, len(hole_pts)):
            ax, ay, az, ar = hole_pts[i]
            bx, by, bz, br = hole_pts[j]
            gap = math.dist((ax, ay, az), (bx, by, bz)) - ar - br
            # A negative gap means the two "holes" overlap, which on a real part
            # means they are one feature the cylinder pass split — not a
            # violation, so it is not allowed to become the reported minimum.
            if gap > 0 and (hole_gap is None or gap < hole_gap):
                hole_gap = gap

    # Distance from each hole's edge to the part's outer boundary. The bounding
    # box is a LOWER bound on the true trim distance — a hole near a concave
    # cut-out is closer to material's end than this says — so the measure is
    # published with that stated rather than presented as exact.
    edge_gap = None
    try:
        bb = Bnd_Box()
        BRepBndLib.Add_s(shape, bb)
        x0, y0, z0, x1, y1, z1 = bb.Get()
        for (hx, hy, hz, hr) in hole_pts:
            # Only the two axes that span the SHEET, not the one across its
            # thickness: a hole is always ~t/2 from the face it passes through
            # and that is not an edge distance.
            spans = sorted([(x1 - x0, hx - x0, x1 - hx),
                            (y1 - y0, hy - y0, y1 - hy),
                            (z1 - z0, hz - z0, z1 - hz)], key=lambda s: -s[0])[:2]
            for _span, lo, hi in spans:
                d = min(lo, hi) - hr
                if d >= 0 and (edge_gap is None or d < edge_gap):
                    edge_gap = d
    except Exception:
        edge_gap = None

    # ── Bend-to-bend ─────────────────────────────────────────────────────────
    # Two parallel bends too close together cannot both be formed: the press
    # brake needs flat material to clamp between them. Measured as the
    # perpendicular distance between parallel bend LINES, minus the two inside
    # radii, so it is the flat land that actually has to exist.
    bend_gap = None
    for i in range(len(bends)):
        for j in range(i + 1, len(bends)):
            a, b = bends[i], bends[j]
            ua, ub = a["axisXYZ"], b["axisXYZ"]
            if abs(sum(x * y for x, y in zip(ua, ub))) < math.cos(math.radians(5.0)):
                continue                      # not parallel: not the same clamp
            delta = [q - p for p, q in zip(a["axisPointXYZ"], b["axisPointXYZ"])]
            along = sum(x * y for x, y in zip(delta, ua))
            perp = math.sqrt(max(0.0, sum(x * x for x in delta) - along * along))
            flat = perp - a["insideRadiusMm"] - b["insideRadiusMm"]
            if flat > 0 and (bend_gap is None or flat < bend_gap):
                bend_gap = flat

    # Hole-to-bend: perpendicular distance from each hole axis to each bend line,
    # reported as CLEARANCE against the 2t + r guideline so the rule can be
    # evaluated arithmetically instead of carrying an unevaluatable formula.
    clearance = None
    hole_dia = None
    # Same generalisation for hole-to-bend: an aperture near a bend line distorts
    # as the bend is worked up whatever its shape.
    bend_probe = [(p3[0], p3[1], p3[2], p3[3] * 2) for p3 in hole_pts]
    for row in (feature_table or []):
        if row.get("kind") != "hole" or not row.get("axisPointXYZ"):
            continue
        d = float(row.get("diaMm") or 0)
        if d > 0 and (hole_dia is None or d < hole_dia):
            hole_dia = d
        hp = row["axisPointXYZ"]
        for b in bends:
            delta = [q - p for p, q in zip(b["axisPointXYZ"], hp)]
            along = sum(x * u for x, u in zip(delta, b["axisXYZ"]))
            perp = math.sqrt(max(0.0, sum(x * x for x in delta) - along * along))
            required = 2 * thickness + b["insideRadiusMm"]
            c = perp - required
            if clearance is None or c < clearance:
                clearance = c

    # Apertures reach the bend-clearance test too, and set the minimum opening
    # size when there is no round hole to set it.
    for (ax, ay, az, adia) in bend_probe:
        if hole_dia is None or adia < hole_dia:
            hole_dia = adia
        for b in bends:
            delta = [q - p for p, q in zip(b["axisPointXYZ"], (ax, ay, az))]
            along = sum(x * u for x, u in zip(delta, b["axisXYZ"]))
            perp = math.sqrt(max(0.0, sum(x * x for x in delta) - along * along))
            c = perp - (2 * thickness + b["insideRadiusMm"])
            if clearance is None or c < clearance:
                clearance = c

    return {
        "isSheetMetal": True,
        "thicknessMm": round(thickness, 3),
        "bendCount": len(bends),
        "bends": bends,
        "minInsideRadiusMm": round(min(b["insideRadiusMm"] for b in bends), 3),
        "minBendRadiusToThickness": round(min(b["insideRadiusMm"] for b in bends) / thickness, 3),
        "minFlangeMm": round(flange, 2) if flange else None,
        "minFlangeToThickness": round(flange / thickness, 3) if flange else None,
        "minHoleDiaToThickness": round(hole_dia / thickness, 3) if hole_dia else None,
        "holeToBendClearanceMm": round(clearance, 2) if clearance is not None else None,
        # Edge-to-edge gaps, so a rule can be a flat multiple of t.
        "minHoleToHoleMm": round(hole_gap, 2) if hole_gap is not None else None,
        "minHoleToHoleToThickness": round(hole_gap / thickness, 2) if hole_gap is not None else None,
        "minHoleToEdgeMm": round(edge_gap, 2) if edge_gap is not None else None,
        "minHoleToEdgeToThickness": round(edge_gap / thickness, 2) if edge_gap is not None else None,
        "minHoleToEdgeBasis": "distance to the bounding box in the two sheet-plane axes — a LOWER bound on the true trim distance, since a hole beside a concave cut-out is nearer the edge than this says",
        "minBendToBendMm": round(bend_gap, 2) if bend_gap is not None else None,
        "minBendToBendToThickness": round(bend_gap / thickness, 2) if bend_gap is not None else None,
        "method": "paired coaxial cylinders; thickness = outer radius - inner radius",
    }


# ─── Top-level ────────────────────────────────────────────────────────────────

def blend_face_ids(shape, aag=None):
    """Indexed face ids of fillets and chamfers.

    Exposed separately because the ANALYTIC cylinder pass must skip them: a
    fillet is a cylindrical face, so `_extract_feature_table` counts every one as
    a hole or a boss. Measured on a filleted slot: 22 phantom "bosses" and 2
    phantom "blind holes" — which then reach `geometryToMachiningInput` and get
    costed as drilling operations that do not exist.
    """
    aag = aag or build_aag(shape)
    fillets, chamfers = find_blends(aag)
    return ({f["faceId"] for f in fillets} | {f["faceId"] for f in chamfers}), aag



def _min_concave_fillet_radius(fillets):
    """Smallest INTERNAL corner radius on the part, in mm, or None.

    None rather than 0 when there is no concave fillet: a part machined with
    sharp internal corners in CAD has not been measured as having a small
    corner, it has been measured as having none, and the rule must abstain
    rather than fail it at zero.
    """
    radii = [f["radiusMm"] for f in fillets
             if f.get("concavity") == "concave"
             and isinstance(f.get("radiusMm"), (int, float))
             and f["radiusMm"] > 0]
    return round(min(radii), 3) if radii else None


def _max_pocket_slenderness(prismatic):
    """Worst depth/width over recognised pockets and slots, or None.

    Depth is the span along the axis the cutter comes in on — taken from the
    floor's normal, not guessed — and width is the narrower of the two spans
    across it, because that is what the cutter has to fit through. A feature
    whose depth axis could not be established is SKIPPED rather than measured
    against an axis chosen at random.
    """
    worst = None
    for p in prismatic:
        if p.get("kind") not in ("pocket", "slot"):
            continue
        ext = p.get("extentsMm")
        axis = p.get("depthAxis")
        if not ext or len(ext) != 3 or axis is None:
            continue
        depth = ext[axis]
        width = min(ext[k] for k in range(3) if k != axis)
        if width > 0 and depth > 0:
            ratio = depth / width
            if worst is None or ratio > worst:
                worst = ratio
    return round(worst, 2) if worst is not None else None


def recognise(shape, feature_table, extents=None, aag=None):
    """Hybrid recognition. `feature_table` is the exact analytic cylinder pass.

    Returns named features plus the honest remainder. unclassifiedAreaPct is not
    decoration: without it a reader cannot tell "this part has three features"
    from "we could only name three of them".
    """
    aag = aag or build_aag(shape)
    cones = cone_features(shape)
    compound, simple = group_stepped_holes(feature_table or [], cones, extents)

    # Blends first, then take them OUT of the graph before decomposing. A fillet
    # sits between a pocket wall and its floor, so with blends in place the
    # concave arc that defines the pocket does not exist and every pocket and
    # slot on a real casting disappears.
    fillets, chamfers = find_blends(aag)
    blend_ids = {f["faceId"] for f in fillets} | {f["faceId"] for f in chamfers}
    working = collapse_blends(aag, blend_ids)

    # Ribs before the prismatic pass, and their faces taken OUT of the graph
    # afterwards. A rib joins its base concavely on all four sides, so a field of
    # three ribs leaves the base face concave-connected to twelve rib faces and
    # decomposes into one large phantom "pocket" — a protrusion reported as a
    # depression. Removing what the rib pass has already claimed is what stops it.
    ribs = rib_features(shape, working)
    rib_ids = {f for r in ribs for f in r["faceIds"]}
    if rib_ids:
        working = {
            "faces": {k: v for k, v in working["faces"].items() if k not in rib_ids},
            "arcs": [a for a in working["arcs"]
                     if a["a"] not in rib_ids and a["b"] not in rib_ids],
            "totalAreaMm2": working["totalAreaMm2"],
        }
    prismatic = prismatic_features(working)

    # What counts as "classified": faces inside a prismatic feature, blend faces,
    # and every analytic surface the cylinder/cone pass enumerates. Plain planes
    # left over are the part's outer form — understood, not unrecognised. What
    # remains is freeform area nothing could name.
    named_faces = {f for p in prismatic for f in p["faceIds"]}
    named_faces |= blend_ids | rib_ids
    named_faces |= {fid for fid, f in aag["faces"].items()
                    if f["type"] in ("CYLINDER", "CONE", "TORUS", "SPHERE", "PLANE")}
    named_area = sum(aag["faces"][f]["areaMm2"] for f in named_faces if f in aag["faces"])
    total = aag["totalAreaMm2"] or 1.0

    counts = {}
    if ribs:
        counts["rib"] = len(ribs)
    for p in prismatic:
        counts[p["kind"]] = counts.get(p["kind"], 0) + 1
    for c in compound:
        counts[c["kind"]] = counts.get(c["kind"], 0) + 1
    for h in simple:
        if h.get("kind") == "hole":
            k = "through-hole" if h.get("through") else "blind-hole"
            counts[k] = counts.get(k, 0) + int(h.get("count", 1))
        elif h.get("kind") == "boss":
            counts["boss"] = counts.get("boss", 0) + int(h.get("count", 1))
    if fillets:
        counts["fillet"] = len(fillets)
    if chamfers:
        counts["chamfer"] = len(chamfers)

    return {
        "graph": {"faces": len(aag["faces"]), "arcs": len(aag["arcs"]),
                  "concaveArcs": sum(1 for a in aag["arcs"] if a["label"] == "concave"),
                  "convexArcs": sum(1 for a in aag["arcs"] if a["label"] == "convex"),
                  "tangentArcs": sum(1 for a in aag["arcs"] if a["label"] == "tangent")},
        "counts": counts,
        "compoundHoles": compound,
        "prismatic": prismatic,
        "ribs": ribs,
        "fillets": fillets,
        # ── The two measures the machining rules were written against and never
        # got. `mach-internal-corner-radius` and `mach-pocket-depth-ratio` have
        # reported NOT EVALUATED on every part ever analysed, because nothing
        # produced their measurements — on the filleted-pocket fixture the whole
        # machining family evaluated 0 of 7 rules. Both are derived here from
        # data the recogniser already had and was discarding.
        #
        # CONCAVE fillets only. An external edge round is not a tool-access
        # constraint, and a part whose only blend is a 0.5 mm edge break must not
        # read as needing a 1 mm cutter.
        "minInternalCornerRadiusMm": _min_concave_fillet_radius(fillets),
        "maxPocketDepthToWidth": _max_pocket_slenderness(prismatic),
        "chamfers": chamfers,
        # Cylindrical features are found analytically, so their faces are named
        # even though the graph pass never touched them; the remainder here is
        # the part's plain outer skin plus anything genuinely unrecognised.
        "unclassifiedAreaPct": round(100.0 * max(0.0, total - named_area) / total, 1),
        "method": "hybrid: exact cylinder pass + AAG concave decomposition",
        "knownLimits": [
            "Through holes carry no concave edge, so they come from the analytic "
            "cylinder pass rather than the graph.",
            "Threads are not recognised; any thread signal is reported unverified.",
            "GD&T and tolerance callouts are not present in the solid geometry.",
            "Ribs are found from opposed PLANAR side faces standing on a planar "
            "base. A rib with curved sides, or one standing on a freeform wall, "
            "is not recognised and its proportions are therefore not checked.",
        ],
    }


# ─── Apertures: holes that are not cylinders ─────────────────────────────────
#
# WHY THIS EXISTS. The hole table comes from the cylinder pass, which requires a
# full revolution — the test that stopped curved walls being reported as bores.
# It is right about cylinders and blind to everything else, and on a real stamped
# bracket that blindness reported ZERO holes on a part with FIFTY-TWO apertures:
# slots, obrounds and shaped cut-outs trimmed through freeform surfaces, whose
# walls are B-spline strips rather than cylinders. Not one of them was circular,
# so not one was found.
#
# The topology already knows. A face with an INNER WIRE has a hole in it — that
# is what an inner wire means — regardless of what surface the wall happens to
# be. Reading apertures from the wires rather than from the wall geometry finds
# every one of them and needs no new measurement.
#
# This does NOT replace the cylinder pass. A round hole still comes from there
# with its exact kernel diameter and its through/blind classification; an
# aperture carries perimeter, enclosed area and an equivalent diameter, which is
# what a non-circular cut-out actually has. Both are reported, and a circular
# aperture is matched back to its cylinder row rather than double-counted.

#: Two inner wires belong to the same through aperture when their centroids sit
#: within this multiple of the wall thickness of each other, measured along the
#: aperture axis. A through hole in sheet leaves one wire on the top face and one
#: on the bottom; counting them separately doubles every aperture on the part.
APERTURE_PAIR_TOL = 3.0


def _wire_metrics(wire):
    """(perimeter, centroid, circular?) for a closed wire, from its edges."""
    from OCP.BRep import BRep_Tool
    from OCP.BRepAdaptor import BRepAdaptor_Curve
    from OCP.BRepGProp import BRepGProp
    from OCP.GeomAbs import GeomAbs_CurveType
    from OCP.GProp import GProp_GProps
    from OCP.TopAbs import TopAbs_EDGE, TopAbs_VERTEX
    from OCP.TopExp import TopExp_Explorer
    from OCP.TopoDS import TopoDS

    props = GProp_GProps()
    try:
        BRepGProp.LinearProperties_s(wire, props)
        perimeter = abs(props.Mass())
        c = props.CentreOfMass()
        centroid = (c.X(), c.Y(), c.Z())
    except Exception:
        return None
    if not (perimeter > 0) or not math.isfinite(perimeter):
        return None

    # Circular when every edge is a circle of one radius — that is the case the
    # cylinder pass already owns, and it must not be reported twice.
    radii, kinds = set(), set()
    ex = TopExp_Explorer(wire, TopAbs_EDGE)
    while ex.More():
        try:
            ad = BRepAdaptor_Curve(TopoDS.Edge_s(ex.Current()))
            kinds.add(ad.GetType())
            if ad.GetType() == GeomAbs_CurveType.GeomAbs_Circle:
                radii.add(round(ad.Circle().Radius(), 3))
        except Exception:
            pass
        ex.Next()
    circular = kinds == {GeomAbs_CurveType.GeomAbs_Circle} and len(radii) == 1
    return {
        "perimeterMm": round(perimeter, 2),
        "centroidXYZ": [round(v, 3) for v in centroid],
        "circular": circular,
        "circleDiaMm": round(2 * next(iter(radii)), 2) if circular and radii else None,
    }


def apertures(shape, wall_mm=None):
    """Every hole through the part, read from the topology rather than the walls.

    Returns per-aperture perimeter, enclosed area, equivalent diameter and
    centroid, plus the part totals a stamping is costed and toleranced against.
    """
    from OCP.BRepTools import BRepTools
    from OCP.TopAbs import TopAbs_FACE, TopAbs_WIRE
    from OCP.TopExp import TopExp_Explorer
    from OCP.TopoDS import TopoDS

    found = []
    ex = TopExp_Explorer(shape, TopAbs_FACE)
    while ex.More():
        face = TopoDS.Face_s(ex.Current())
        ex.Next()
        try:
            outer = BRepTools.OuterWire_s(face)
        except Exception:
            continue
        we = TopExp_Explorer(face, TopAbs_WIRE)
        while we.More():
            w = we.Value()
            we.Next()
            if w.IsSame(outer):
                continue
            m = _wire_metrics(w)
            if m:
                found.append(m)

    # A through aperture leaves a wire on the face it enters AND the face it
    # exits. Pairing them by centroid distance and matching perimeter is what
    # stops every hole being counted twice.
    tol = max(0.5, (wall_mm or 1.0) * APERTURE_PAIR_TOL)
    used, merged, unpaired = set(), [], 0
    for i, a in enumerate(found):
        if i in used:
            continue
        partner = None
        for j in range(i + 1, len(found)):
            if j in used:
                continue
            b = found[j]
            d = math.dist(a["centroidXYZ"], b["centroidXYZ"])
            if d <= tol and abs(a["perimeterMm"] - b["perimeterMm"]) <= 0.05 * max(a["perimeterMm"], b["perimeterMm"]):
                partner = j
                break
        used.add(i)
        # AN APERTURE IS A HOLE THROUGH THE PART, and only a PAIRED wire is one.
        # An inner wire on its own is something else, and the gate found two of
        # them: the ring where a BOSS rises out of a face (the region inside it
        # is the boss, not air) and the mouth of a BLIND POCKET (air, but it does
        # not come out the other side). Counting either inflated a plate with one
        # Ø6 hole to two apertures and 69 mm of "cut length" that included the
        # Ø16 boss base. A through opening leaves a wire where it enters AND
        # where it exits; nothing else does.
        if partner is None:
            unpaired += 1
            continue
        used.add(partner)
        # Equivalent diameter from the ENCLOSED AREA of a circle with the same
        # perimeter is wrong for a slot, so the honest figure for a non-circular
        # aperture is its narrowest practical dimension — and the perimeter is
        # what a punch and a laser are actually charged by. Both are reported;
        # neither pretends to be the other.
        eq = a["perimeterMm"] / math.pi
        merged.append({
            "perimeterMm": a["perimeterMm"],
            "equivalentDiaMm": round(eq, 2),
            "circular": a["circular"],
            "circleDiaMm": a["circleDiaMm"],
            "through": partner is not None,
            "centroidXYZ": a["centroidXYZ"],
        })

    if not merged:
        return {
            "count": 0, "apertures": [], "unpairedWireCount": unpaired,
            "reason": (f"No hole passes through this part. {unpaired} inner wire(s) were found and none "
                       "paired with an opening on the far side, so they are boss bases or blind recesses "
                       "rather than apertures — the pocket and slot recogniser owns those.") if unpaired
                      else "No face on this part carries an inner wire, so there is no aperture to report.",
        }
    circular = [a for a in merged if a["circular"]]
    total_cut = sum(a["perimeterMm"] for a in merged)
    smallest = min(a["equivalentDiaMm"] for a in merged)
    return {
        "count": len(merged),
        "circularCount": len(circular),
        "nonCircularCount": len(merged) - len(circular),
        "throughCount": sum(1 for a in merged if a["through"]),
        # The internal cut length. Press tonnage and laser time are both charged
        # by perimeter, and this is the half of it that lives inside the blank —
        # the outer profile is the other half and needs the flat pattern.
        "totalCutLengthMm": round(total_cut, 1),
        "smallestApertureMm": round(smallest, 2),
        "apertures": sorted(merged, key=lambda a: a["equivalentDiaMm"])[:40],
        # Named rather than dropped silently: an unpaired wire is a boss base or
        # a blind recess, and a reader who counts openings on the model should be
        # able to reconcile that count with this one.
        "unpairedWireCount": unpaired,
        "method": "inner wires of every face: an inner wire IS a hole, whatever surface its wall is made of",
        "knownLimits": "Perimeter and centroid are exact. `equivalentDiaMm` is the diameter of a circle of the same PERIMETER, which understates a long slot's width — it is a size ranking, not a width measurement. The OUTER profile is not included, so this is internal cut length only.",
    }
