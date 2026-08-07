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
        try:
            from OCP.Bnd import Bnd_Box
            from OCP.BRepBndLib import BRepBndLib
            bb = Bnd_Box()
            BRepBndLib.Add_s(f, bb)
            x0, y0, z0, x1, y1, z1 = bb.Get()
            dims = sorted([x1 - x0, y1 - y0, z1 - z0])
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
        faces[i] = {"id": i, "type": kind, "areaMm2": area, "aspect": round(aspect, 4)}
        if normal:
            faces[i]["normal"] = normal
        if concavity:
            faces[i]["blendConcavity"] = concavity

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
            fillets.append({"faceId": fid, "type": f["type"],
                            "areaMm2": round(f["areaMm2"], 1),
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

def prismatic_features(aag):
    """Concave-connected components, classified pocket / slot / step.

    A closed pocket is walled all the way round; a slot runs out of the part at
    both ends, so fewer of its walls close on each other. The discriminator is
    how many of the component's own faces are mutually adjacent by a concave arc
    versus how many open onto the outer skin.
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


# ─── Sheet metal: bends, thickness, flanges ───────────────────────────────────

# Two cylinders belong to the same bend when they share an axis LINE and sweep
# the same angle. Loose enough for exporter round-off, tight enough that two
# unrelated bends on parallel axes are not merged.
BEND_ANG_TOL_DEG = 2.0
BEND_AXIS_POS_TOL = 0.05


def sheet_metal_features(shape, feature_table=None):
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

    # Hole-to-bend: perpendicular distance from each hole axis to each bend line,
    # reported as CLEARANCE against the 2t + r guideline so the rule can be
    # evaluated arithmetically instead of carrying an unevaluatable formula.
    clearance = None
    hole_dia = None
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
    prismatic = prismatic_features(working)

    # What counts as "classified": faces inside a prismatic feature, blend faces,
    # and every analytic surface the cylinder/cone pass enumerates. Plain planes
    # left over are the part's outer form — understood, not unrecognised. What
    # remains is freeform area nothing could name.
    named_faces = {f for p in prismatic for f in p["faceIds"]}
    named_faces |= blend_ids
    named_faces |= {fid for fid, f in aag["faces"].items()
                    if f["type"] in ("CYLINDER", "CONE", "TORUS", "SPHERE", "PLANE")}
    named_area = sum(aag["faces"][f]["areaMm2"] for f in named_faces if f in aag["faces"])
    total = aag["totalAreaMm2"] or 1.0

    counts = {}
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
        "fillets": fillets,
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
        ],
    }
