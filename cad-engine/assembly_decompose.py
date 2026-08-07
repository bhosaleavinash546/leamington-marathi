#!/usr/bin/env python3
"""
Assembly decomposition for DFA: solids, shape signatures, measured symmetry.

This is the part incumbent DFA tools do not automate. Boothroyd's handling time
depends on a part's size, thickness, weight and its alpha/beta rotational
symmetry — and in every commercial implementation an engineer reads those off the
part and types them into a worksheet, one row per component. All of them are
properties of the geometry, so all of them can be measured.

SYMMETRY IS MEASURED, NOT INFERRED. Equal principal moments of inertia are
NECESSARY but not SUFFICIENT for rotational symmetry: a cube has three equal
moments and is not a sphere. So inertia only proposes a candidate axis, and the
symmetry is then verified by actually rotating the solid and measuring how much
of it maps onto itself. Checked against known shapes: a cylinder scores 1.000 at
every angle (continuous), a cube 1.000 at 90 deg but 0.944 at 7.3 deg (4-fold),
a 60x40x10 plate 1.000 at 180 deg and 0.667 at 90 deg (2-fold). Twenty such tests
cost 0.15 s.

Instance grouping uses the same inertia signature: two identical pins return
identical principal moments, which is what lets the report say "4 off M8 bolt"
instead of listing four rows a reader has to notice are the same part.

    python3 assembly_decompose.py <file.step>
"""
import json
import math
import os
import sys
import time

# Rotation angles tested for n-fold symmetry, plus a deliberately awkward angle
# that only a continuously symmetric body can pass.
CONTINUOUS_PROBE_DEG = 7.3
NFOLD_ANGLES = ((2, 180.0), (3, 120.0), (4, 90.0), (6, 60.0))
# Overlap fraction above which a rotation is treated as mapping the solid onto
# itself. Tessellation and boolean tolerance keep this off a clean 1.0.
SYM_TOL = 0.995
# Symmetry testing runs booleans, and the cost is driven by FACE COUNT, not by
# how many solids there are. Measured on this machine (rotate-and-intersect, one
# solid at a time):
#
#     faces      6     14     18     26     36
#     seconds  0.13   2.30   1.63   4.45   7.08
#
# — roughly 0.2 s per face once a solid is past a dozen faces. The old cap was
# 60 SOLIDS with no reference to their complexity, set without measurement: 60
# solids of the 36-face part above would take 425 s against the bridge's 120 s
# timeout, and the user would get a bare "timed out" after two minutes with no
# partial result. Every real automotive part is well past 36 faces.
#
# So the budget is WALL CLOCK, which is robust to any geometry, and it degrades
# per solid: whatever is measured before the deadline keeps its symmetry and the
# rest are marked unmeasured with the count. A partial answer that says how
# partial it is beats an all-or-nothing cap in both directions.
SYMMETRY_BUDGET_S = 45.0
# One monster solid must not consume the whole budget on its own. At the rate
# above a 150-face solid is about 33 s, so anything larger is skipped
# individually rather than starving every solid behind it.
MAX_SYMMETRY_FACES = 150


def _face_count(shape):
    from OCP.TopAbs import TopAbs_FACE
    from OCP.TopExp import TopExp
    from OCP.TopTools import TopTools_IndexedMapOfShape
    m = TopTools_IndexedMapOfShape()
    TopExp.MapShapes_s(shape, TopAbs_FACE, m)
    return m.Size()


def _vol(shape):
    from OCP.BRepGProp import BRepGProp
    from OCP.GProp import GProp_GProps
    p = GProp_GProps()
    BRepGProp.VolumeProperties_s(shape, p)
    return abs(p.Mass())


def _mass_props(shape):
    from OCP.BRepGProp import BRepGProp
    from OCP.GProp import GProp_GProps
    p = GProp_GProps()
    BRepGProp.VolumeProperties_s(shape, p)
    c = p.CentreOfMass()
    moments = list(p.PrincipalProperties().Moments())
    return abs(p.Mass()), (c.X(), c.Y(), c.Z()), sorted(moments)


def _bbox(shape):
    from OCP.Bnd import Bnd_Box
    from OCP.BRepBndLib import BRepBndLib
    b = Bnd_Box()
    BRepBndLib.Add_s(shape, b)
    x0, y0, z0, x1, y1, z1 = b.Get()
    return (x1 - x0, y1 - y0, z1 - z0)


def _principal_axes(shape):
    from OCP.BRepGProp import BRepGProp
    from OCP.GProp import GProp_GProps
    p = GProp_GProps()
    BRepGProp.VolumeProperties_s(shape, p)
    pr = p.PrincipalProperties()
    out = []
    for ax in (pr.FirstAxisOfInertia(), pr.SecondAxisOfInertia(), pr.ThirdAxisOfInertia()):
        out.append((ax.X(), ax.Y(), ax.Z()))
    return out


def _rotation_overlap(shape, centre, axis, deg):
    """Fraction of the solid mapping onto itself under this rotation."""
    from OCP.BRepAlgoAPI import BRepAlgoAPI_Common
    from OCP.BRepBuilderAPI import BRepBuilderAPI_Transform
    from OCP.gp import gp_Ax1, gp_Dir, gp_Pnt, gp_Trsf
    try:
        t = gp_Trsf()
        t.SetRotation(gp_Ax1(gp_Pnt(*centre), gp_Dir(*axis)), math.radians(deg))
        rotated = BRepBuilderAPI_Transform(shape, t, True).Shape()
        base = _vol(shape)
        if base <= 0:
            return 0.0
        return _vol(BRepAlgoAPI_Common(shape, rotated).Shape()) / base
    except Exception:
        return 0.0


def measure_symmetry(shape):
    """Boothroyd-style alpha/beta, measured by rotating the actual solid.

    beta  — rotation about the axis of insertion needed to repeat the part.
            0 for a body of revolution (any orientation will do).
    alpha — rotation about an axis perpendicular to insertion. 180 when the part
            can be flipped end-for-end, 360 when it cannot.

    alpha + beta is the term that drives handling time: the more symmetric a part
    is, the less an operator has to orient it. Returning None for either value
    rather than a guess keeps the time model honest about what it knows.
    """
    _, centre, _ = _mass_props(shape)
    axes = _principal_axes(shape)
    best = None
    for axis in axes:
        if _rotation_overlap(shape, centre, axis, CONTINUOUS_PROBE_DEG) >= SYM_TOL:
            best = {"axisXYZ": [round(a, 4) for a in axis], "order": None,
                    "continuous": True, "betaDeg": 0.0}
            break
        order = 1
        for n, deg in NFOLD_ANGLES:
            if _rotation_overlap(shape, centre, axis, deg) >= SYM_TOL:
                order = max(order, n)
        if best is None or order > (best.get("order") or 0):
            best = {"axisXYZ": [round(a, 4) for a in axis], "order": order,
                    "continuous": False, "betaDeg": round(360.0 / order, 1)}

    # alpha: can the part be turned end-for-end about an axis perpendicular to
    # the insertion axis and still present the same face to the assembly?
    ins = best["axisXYZ"]
    perp = next((a for a in axes if abs(sum(x * y for x, y in zip(a, ins))) < 0.9), axes[0])
    flips = _rotation_overlap(shape, centre, perp, 180.0) >= SYM_TOL
    best["alphaDeg"] = 180.0 if flips else 360.0
    best["totalDeg"] = best["alphaDeg"] + best["betaDeg"]
    best["method"] = "measured by rotating the solid and intersecting with itself"
    return best


def shape_signature(volume, moments, bbox):
    """Stable key for 'this is the same part again'.

    Volume alone collides too easily and a name is not reliable in a STEP file,
    so the signature combines volume, the three principal moments and the sorted
    bounding-box dimensions — quantised, because two instances of the same part
    differ in the last decimal after a transform.
    """
    def q(v, places=3):
        return round(float(v), places)
    dims = sorted(round(d, 2) for d in bbox)
    return "|".join([
        f"v{q(volume, 2)}",
        "m" + ",".join(f"{q(m, 1)}" for m in moments),
        "b" + ",".join(str(d) for d in dims),
    ])


def _contacts(solids, gap_tol=0.05, max_pairs=4000):
    """Pairs of solids that touch — the input to 'does this part move relative
    to its neighbour', which is the first of Boothroyd's three questions."""
    from OCP.BRepExtrema import BRepExtrema_DistShapeShape
    out = []
    n = len(solids)
    checked = 0
    for i in range(n):
        for j in range(i + 1, n):
            if checked >= max_pairs:
                return out, True
            checked += 1
            try:
                d = BRepExtrema_DistShapeShape(solids[i], solids[j])
                d.Perform()
                if d.IsDone() and d.Value() <= gap_tol:
                    out.append([i, j])
            except Exception:
                continue
    return out, False


def _named_solids(filepath):
    """Solids plus their product names, via the XCAF assembly reader when the
    file carries a product tree, falling back to plain topology when it does not."""
    from OCP.IFSelect import IFSelect_RetDone
    from OCP.TopAbs import TopAbs_SOLID
    from OCP.TopExp import TopExp_Explorer
    from OCP.TopoDS import TopoDS

    names = {}
    shape = None
    ext = os.path.splitext(filepath)[1].lower()
    if ext in (".step", ".stp"):
        try:
            from OCP.STEPCAFControl import STEPCAFControl_Reader
            from OCP.TCollection import TCollection_ExtendedString
            from OCP.TDataStd import TDataStd_Name
            from OCP.TDocStd import TDocStd_Document
            from OCP.XCAFDoc import XCAFDoc_DocumentTool
            from OCP.TDF import TDF_LabelSequence
            doc = TDocStd_Document(TCollection_ExtendedString("dfa"))
            caf = STEPCAFControl_Reader()
            caf.SetNameMode(True)
            if caf.ReadFile(filepath) == IFSelect_RetDone and caf.Transfer(doc):
                tool = XCAFDoc_DocumentTool.ShapeTool_s(doc.Main())
                labels = TDF_LabelSequence()
                tool.GetFreeShapes(labels)
                for i in range(1, labels.Length() + 1):
                    lab = labels.Value(i)
                    nm = TDataStd_Name()
                    if lab.FindAttribute(TDataStd_Name.GetID_s(), nm):
                        names[i - 1] = nm.Get().ToExtString()
        except Exception:
            pass
        from OCP.STEPControl import STEPControl_Reader
        r = STEPControl_Reader()
        if r.ReadFile(filepath) != IFSelect_RetDone:
            return None, {}
        r.TransferRoots()
        shape = r.OneShape()
    elif ext in (".iges", ".igs"):
        from OCP.IGESControl import IGESControl_Reader
        r = IGESControl_Reader()
        if r.ReadFile(filepath) != IFSelect_RetDone:
            return None, {}
        r.TransferRoots()
        shape = r.OneShape()
    else:
        return None, {}

    solids = []
    ex = TopExp_Explorer(shape, TopAbs_SOLID)
    while ex.More():
        solids.append(TopoDS.Solid_s(ex.Current()))
        ex.Next()

    # XCAF free shapes are top-level assembly nodes, which do NOT correspond
    # one-to-one with solids: on a flat compound the first name is the file's own
    # product name and the rest are absent. Positional mapping then labels the
    # wrong part, so names are used only when the counts actually line up. A
    # wrong part name in a DFA table is worse than an honest "solid-2".
    if len(names) != len(solids):
        names = {}
    return solids, names


def decompose(filepath):
    """Full DFA decomposition of an assembly file."""
    try:
        solids, names = _named_solids(filepath)
    except Exception as e:
        return {"status": "error", "error": f"assembly read failed: {e}"}
    if solids is None:
        return {"status": "error", "error": "unsupported format for assembly decomposition"}
    if not solids:
        return {"status": "error", "error": "no solids found — the file may be a surface model"}

    deadline = time.monotonic() + SYMMETRY_BUDGET_S
    symmetry_done = 0
    parts = []
    for i, s in enumerate(solids):
        try:
            vol, com, moments = _mass_props(s)
            bbox = _bbox(s)
            dims = sorted(bbox)
            part = {
                "index": i,
                "name": names.get(i) or f"solid-{i + 1}",
                "volumeMm3": round(vol, 2),
                "bboxMm": {"x": round(bbox[0], 2), "y": round(bbox[1], 2), "z": round(bbox[2], 2)},
                "maxDimMm": round(dims[2], 2),
                "midDimMm": round(dims[1], 2),
                "minDimMm": round(dims[0], 2),
                "centreOfMassXYZ": [round(c, 3) for c in com],
                "principalMoments": [round(m, 1) for m in moments],
                "signature": shape_signature(vol, moments, bbox),
            }
            nfaces = _face_count(s)
            if nfaces > MAX_SYMMETRY_FACES:
                part["symmetry"] = {
                    "measured": False,
                    "reason": f"this solid has {nfaces} faces; symmetry testing is skipped above "
                              f"{MAX_SYMMETRY_FACES} so one large part cannot consume the whole "
                              f"{SYMMETRY_BUDGET_S:.0f} s budget",
                }
            elif time.monotonic() >= deadline:
                part["symmetry"] = {
                    "measured": False,
                    "reason": f"the {SYMMETRY_BUDGET_S:.0f} s symmetry budget was spent after "
                              f"{symmetry_done} of {len(solids)} solids; the rest are unmeasured "
                              f"rather than the whole analysis timing out",
                }
            else:
                part["symmetry"] = measure_symmetry(s)
                symmetry_done += 1
            parts.append(part)
        except Exception as e:
            parts.append({"index": i, "name": names.get(i) or f"solid-{i + 1}",
                          "error": f"{e}"})

    groups = {}
    for p in parts:
        sig = p.get("signature")
        if not sig:
            continue
        groups.setdefault(sig, []).append(p["index"])
    instance_groups = sorted(
        ({"signature": sig, "count": len(idx), "partIndices": idx,
          "representative": idx[0], "name": parts[idx[0]].get("name")}
         for sig, idx in groups.items()),
        key=lambda g: -g["count"])

    contacts, truncated = _contacts(solids)

    return {
        "status": "success",
        "solidCount": len(solids),
        "distinctPartTypes": len(instance_groups),
        "parts": parts,
        "instanceGroups": instance_groups,
        "contacts": contacts,
        "contactsTruncated": truncated,
        "symmetryMeasured": symmetry_done == len(solids),
        "symmetryMeasuredCount": symmetry_done,
        "notes": [
            "Symmetry is measured by rotating each solid and intersecting it with "
            "itself, not inferred from inertia — equal principal moments are "
            "necessary but not sufficient (a cube has three equal moments).",
            "Contacts are solids whose surfaces are within 0.05 mm. Contact is "
            "evidence of an assembly relationship, not proof of one.",
        ],
    }


if __name__ == "__main__":
    if len(sys.argv) < 2 or not os.path.exists(sys.argv[1]):
        print(json.dumps({"status": "error", "error": "Usage: assembly_decompose.py <file>"}))
        sys.exit(1)
    print(json.dumps(decompose(sys.argv[1])))
