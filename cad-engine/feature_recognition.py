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

    fmap = TopTools_IndexedMapOfShape()
    TopExp.MapShapes_s(shape, TopAbs_FACE, fmap)
    faces = {}
    for i in range(1, fmap.Size() + 1):
        f = TopoDS.Face_s(fmap.FindKey(i))
        try:
            ad = BRepAdaptor_Surface(f)
            kind = TYPE.get(ad.GetType(), "FREEFORM")
        except Exception:
            kind = "FREEFORM"
        props = GProp_GProps()
        try:
            BRepGProp.SurfaceProperties_s(f, props)
            area = abs(props.Mass())
        except Exception:
            area = 0.0
        faces[i] = {"id": i, "type": kind, "areaMm2": area}

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


# ─── Prismatic features (pockets, slots, steps) ───────────────────────────────

def _boundary_faces(aag):
    """Face ids that carry no concave arc — the part's outer skin."""
    touched = {f for arc in aag["arcs"] if arc["label"] == "concave"
               for f in (arc["a"], arc["b"])}
    return set(aag["faces"]) - touched


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
        walls = max(0, planes - 1)          # one of the planes is the floor
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


# ─── Fillets and chamfers ─────────────────────────────────────────────────────

def fillets_and_chamfers(shape, aag):
    """Blend faces: cylinders/tori meeting neighbours tangentially are fillets;
    narrow planes bridging two convex edges are chamfers."""
    tangent_nbrs = {}
    for arc in aag["arcs"]:
        if arc["label"] != "tangent":
            continue
        tangent_nbrs.setdefault(arc["a"], 0)
        tangent_nbrs.setdefault(arc["b"], 0)
        tangent_nbrs[arc["a"]] += 1
        tangent_nbrs[arc["b"]] += 1
    fillets, chamfers = [], []
    for fid, f in aag["faces"].items():
        n = tangent_nbrs.get(fid, 0)
        if n >= 2 and f["type"] in ("CYLINDER", "TORUS"):
            fillets.append({"faceId": fid, "type": f["type"],
                            "areaMm2": round(f["areaMm2"], 1), "confidence": "medium"})
        elif n >= 2 and f["type"] == "PLANE":
            chamfers.append({"faceId": fid, "areaMm2": round(f["areaMm2"], 1),
                             "confidence": "medium"})
    return fillets, chamfers


# ─── Top-level ────────────────────────────────────────────────────────────────

def recognise(shape, feature_table, extents=None):
    """Hybrid recognition. `feature_table` is the exact analytic cylinder pass.

    Returns named features plus the honest remainder. unclassifiedAreaPct is not
    decoration: without it a reader cannot tell "this part has three features"
    from "we could only name three of them".
    """
    aag = build_aag(shape)
    cones = cone_features(shape)
    compound, simple = group_stepped_holes(feature_table or [], cones, extents)
    prismatic = prismatic_features(aag)
    fillets, chamfers = fillets_and_chamfers(shape, aag)

    # What counts as "classified": faces inside a prismatic feature, blend faces,
    # and every analytic surface the cylinder/cone pass enumerates. Plain planes
    # left over are the part's outer form — understood, not unrecognised. What
    # remains is freeform area nothing could name, which is the number a reader
    # actually needs in order to trust the rest.
    named_faces = {f for p in prismatic for f in p["faceIds"]}
    named_faces |= {f["faceId"] for f in fillets} | {f["faceId"] for f in chamfers}
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
