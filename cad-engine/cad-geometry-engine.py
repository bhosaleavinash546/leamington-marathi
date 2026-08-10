#!/usr/bin/env python3
"""
CostVision CAD Geometry Engine — Open CASCADE (OCCT) via CadQuery
Extracts precise geometric properties from STEP / IGES files.
Output: single-line JSON to stdout.
"""
import sys, json, os, math, signal
import time as _time

#: Seconds of geometry work before stages start being skipped WITH A REASON. The
#: bridge kills the process at 120 s, so this leaves room to serialise a partial,
#: honest answer instead of dying with nothing to show.
DFM_TIME_BUDGET_S = 75.0

#: Viewer tessellation. Linear deflection is the bounding diagonal over this,
#: so it scales with the part; angular deflection is what actually decides
#: whether a cylinder reads as a cylinder or as a polygon. Both are overridable
#: for a client that wants to trade smoothness against download size.
MESH_LINEAR_DIVISOR = float(os.environ.get("CV_MESH_LINEAR_DIVISOR", "1200"))
MESH_ANGULAR_DEFLECTION_RAD = float(os.environ.get("CV_MESH_ANGULAR_RAD", "0.15"))


def _stage(name, **fields):
    """Announce a stage that has GENUINELY COMPLETED, on stdout, immediately.

    The bridge reads this process's stdout incrementally and forwards each line,
    so the browser can show the analysis progressing instead of a spinner that
    says nothing for thirty seconds. These lines are prefixed `@stage ` and are
    therefore not valid JSON, which matters: extractJson() in the bridge scans
    for the LAST parseable line, so interleaving these ahead of the result is
    already tolerated by design and needs no protocol change.

    Every event reports work that has FINISHED. Nothing here is a prediction or
    a percentage invented to make a bar move — if a stage is skipped by the time
    budget the client is told it was skipped, and the animation shows that.
    """
    try:
        sys.stdout.write("@stage " + json.dumps({"stage": name, **fields}) + "\n")
        sys.stdout.flush()
    except Exception:
        pass   # progress reporting must never be able to fail the analysis

# Best-effort 110-second limit (Unix only). NOTE: Python signal handlers only
# run between bytecode instructions, so this CANNOT interrupt a single long
# native OCCT call (e.g. a pathological BRepMesh_IncrementalMesh). The
# authoritative timeout is the Node parent's SIGKILL in geometry-bridge.ts.
def _timeout(_s, _f): raise TimeoutError("Geometry analysis timed out")
signal.signal(signal.SIGALRM, _timeout)
signal.alarm(110)


# ─── Surface / edge type classification ──────────────────────────────────────

#: A drilled hole or a turned boss is a body of revolution: its cylindrical wall
#: closes through a FULL 360°. A curved wall, a filleted corner or the rounded
#: end of a casting is a cylindrical face too, and the kernel reports a radius
#: and a depth for it just as happily — the sweep angle is the only thing that
#: tells them apart. Measured on a real aluminium casting, the fourteen largest
#: cylindrical faces swept 20°–126° and every one of them was reported as a
#: hole or a boss (a "boss Ø100×25.8" that was the outer wall of the part).
#: Tolerance is 15°, i.e. a wall must close to within 4% of a revolution: real
#: bores come in at exactly 360°, whole or split by the modeller into arcs that
#: sum to 360°, so the margin is there for seam slivers, not for judgement.
FULL_REVOLUTION_TOL_DEG = 15.0

#: Two coaxial same-radius faces belong to the same bore when their axial spans
#: touch or overlap. A hole split at mid-depth leaves faces that meet exactly;
#: a hole passing through two walls leaves a real air gap between them, and
#: those must stay two features or a 5 mm bore in each of two 3 mm walls 40 mm
#: apart becomes one 46 mm-deep hole that does not exist.
COAXIAL_GAP_TOL_MM = 0.02


def _cyl_arc(face, ad, cyl, frame):
    """Angular interval this face covers around its axis, in the GROUP's frame.

    Faces of one bore each carry their own parametric origin (the cylinder's
    XDirection), so raw U bounds from two half-cylinders are not comparable and
    cannot simply be added. Both are re-expressed here as angles in a single
    frame built from the group's axis, which makes the union well defined
    whether the modeller split the bore in U, in V, or not at all.
    """
    from OCP.gp import gp_Vec
    u0, u1 = ad.FirstUParameter(), ad.LastUParameter()
    v0, v1 = ad.FirstVParameter(), ad.LastVParameter()
    sweep = abs(u1 - u0)
    if not math.isfinite(sweep) or sweep <= 1e-9:
        return None
    sweep = min(sweep, 2 * math.pi)
    vmid = (v0 + v1) / 2.0
    origin, xc, yc = frame

    def ang_at(u):
        pt = ad.Value(u, vmid)
        v = gp_Vec(origin, pt)
        return math.atan2(v.Dot(gp_Vec(yc)), v.Dot(gp_Vec(xc)))

    a0 = ang_at(min(u0, u1))
    # Which way the parametrisation turns in the canonical frame is a property
    # of the surface's handedness AND of the sign flip applied when the group's
    # axis was canonicalised. Sampling it is shorter than deriving it and cannot
    # get the two flips the wrong way round.
    probe = min(u0, u1) + min(sweep * 0.05, 0.02)
    delta = (ang_at(probe) - a0 + math.pi) % (2 * math.pi) - math.pi
    return (a0, a0 + sweep) if delta >= 0 else (a0 - sweep, a0)


def _arc_union_deg(arcs):
    """Total angle covered by a set of arcs, counting overlap once."""
    spans = []
    for lo, hi in arcs:
        width = min(max(hi - lo, 0.0), 2 * math.pi)
        lo = lo % (2 * math.pi)
        hi = lo + width
        if hi <= 2 * math.pi:
            spans.append((lo, hi))
        else:
            spans.append((lo, 2 * math.pi))
            spans.append((0.0, hi - 2 * math.pi))
    spans.sort()
    total, cur_lo, cur_hi = 0.0, None, None
    for lo, hi in spans:
        if cur_hi is None or lo > cur_hi + 1e-9:
            if cur_hi is not None:
                total += cur_hi - cur_lo
            cur_lo, cur_hi = lo, hi
        else:
            cur_hi = max(cur_hi, hi)
    if cur_hi is not None:
        total += cur_hi - cur_lo
    return math.degrees(min(total, 2 * math.pi))


#: Two half-cylinders of one bore reach us as separate STEP faces, each with its
#: own AXIS2_PLACEMENT_3D, and those placements agree only to the file's write
#: precision. Grouping on an exact rounded key therefore splits real holes: on the
#: seat cross member the two halves of a Ø4.4 hole differed in the fourth decimal
#: of their axis location and were counted as two 180° arcs that each failed the
#: revolution test. Axes are clustered with a tolerance instead.
AXIS_POS_TOL_MM = 0.05
AXIS_ANG_TOL_DEG = 0.25
RADIUS_TOL_MM = 0.01


def _canonical_axis(d, p):
    """(direction, foot point) for an axis LINE — independent of which of the two
    opposite directions, and which point along it, the kernel happened to give."""
    v = [d.X(), d.Y(), d.Z()]
    for c in v:                       # sign-canonical: first non-zero is positive
        if abs(c) > 1e-9:
            if c < 0:
                v = [-x for x in v]
            break
    n = math.sqrt(sum(x * x for x in v)) or 1.0
    v = [x / n for x in v]
    q = [p.X(), p.Y(), p.Z()]
    t = sum(a * b for a, b in zip(q, v))
    foot = [a - t * b for a, b in zip(q, v)]     # closest point on the line to the origin
    return tuple(v), tuple(foot)


def _same_axis(a, b):
    """True when two (direction, foot, radius) triples describe the same cylinder
    surface to within file-write precision."""
    (da, fa, ra), (db, fb, rb) = a, b
    if abs(ra - rb) > RADIUS_TOL_MM:
        return False
    if abs(sum(x * y for x, y in zip(da, db))) < math.cos(math.radians(AXIS_ANG_TOL_DEG)):
        return False
    delta = [q - p for p, q in zip(fa, fb)]
    along = sum(x * y for x, y in zip(delta, da))
    perp2 = max(0.0, sum(x * x for x in delta) - along * along)
    return math.sqrt(perp2) <= AXIS_POS_TOL_MM and abs(along) <= AXIS_POS_TOL_MM


def _extract_feature_table(wrapped, extents, skip_faces=None, solid_classifier=None):
    """Exact hole/boss feature table from B-rep cylindrical faces.

    Cylindrical faces are grouped by AXIS LINE + RADIUS, then split into bores
    by axial overlap, and a group is only reported as a hole or a boss when its
    faces together close a full revolution (see FULL_REVOLUTION_TOL_DEG). This
    is what keeps curved walls, filleted corners and the rounded ends of castings
    out of the feature table.

    Per accepted bore: diameter (exact kernel radius ×2), DEPTH from the union of
    the V-parameter spans (V is arc length along the axis — exact), hole-vs-boss
    from concavity (face orientation XOR axis handedness), and through/blind by
    CLASSIFYING a point just beyond each end of the bore against the solid.
    Returns rows grouped by (kind, diameter, depth, through) with counts.
    """
    from OCP.TopAbs import TopAbs_FACE, TopAbs_Orientation, TopAbs_State
    from OCP.TopoDS import TopoDS
    from OCP.BRepAdaptor import BRepAdaptor_Surface
    from OCP.GeomAbs import GeomAbs_SurfaceType
    from OCP.gp import gp_Pnt, gp_Dir, gp_Ax2

    from OCP.TopTools import TopTools_IndexedMapOfShape
    from OCP.TopExp import TopExp

    skip = set(skip_faces or ())
    # Iterate the INDEXED map, not an explorer, so face indices line up with the
    # adjacency graph in feature_recognition.py — that is what makes `skip_faces`
    # meaningful. A fillet is a cylindrical face, so without skipping blends
    # every one of them is counted here as a hole or a boss.
    fmap = TopTools_IndexedMapOfShape()
    TopExp.MapShapes_s(wrapped, TopAbs_FACE, fmap)

    groups = {}
    for _i in range(1, fmap.Size() + 1):
        if _i in skip:
            continue
        face = TopoDS.Face_s(fmap.FindKey(_i))
        try:
            ad = BRepAdaptor_Surface(face)
            if ad.GetType() != GeomAbs_SurfaceType.GeomAbs_Cylinder:
                continue
            cyl = ad.Cylinder()
            r = cyl.Radius()
            if not math.isfinite(r) or r <= 1e-6:
                continue
            v0, v1 = ad.FirstVParameter(), ad.LastVParameter()
            if not (math.isfinite(v0) and math.isfinite(v1)) or abs(v1 - v0) <= 0.01:
                continue
            ax = cyl.Axis()
            d, p = ax.Direction(), ax.Location()
            dc, foot = _canonical_axis(d, p)
            # Axial coordinates of the face's V-span, measured along the CANONICAL
            # direction so spans from oppositely-oriented faces are comparable.
            base = p.X() * dc[0] + p.Y() * dc[1] + p.Z() * dc[2]
            sign = 1.0 if (d.X() * dc[0] + d.Y() * dc[1] + d.Z() * dc[2]) > 0 else -1.0
            s0, s1 = base + sign * v0, base + sign * v1
            reversed_param = not cyl.Position().Direct()
            reversed_face = face.Orientation() == TopAbs_Orientation.TopAbs_REVERSED
            hole = reversed_face != reversed_param
            key = (dc, foot, r)
            slot = next((g for g in groups if _same_axis(g, key)), None)
            if slot is None:
                slot = key
                groups[slot] = []
            groups[slot].append((min(s0, s1), max(s0, s1), hole, face, ad, cyl, _i))
        except Exception:
            continue

    instances, axes = {}, {}
    for (dc, foot, r), members in groups.items():
        # One frame per GROUP, taken from the group's representative axis, so
        # every member is measured against exactly the same angular zero.
        try:
            axis2 = gp_Ax2(gp_Pnt(foot[0], foot[1], foot[2]), gp_Dir(dc[0], dc[1], dc[2]))
            frame = (axis2.Location(), axis2.XDirection(), axis2.YDirection())
        except Exception:
            continue
        members.sort(key=lambda m: m[0])
        # Cluster by axial overlap: touching or overlapping spans are one bore.
        clusters, cur = [], [members[0]]
        for m in members[1:]:
            if m[0] <= max(c[1] for c in cur) + COAXIAL_GAP_TOL_MM:
                cur.append(m)
            else:
                clusters.append(cur)
                cur = [m]
        clusters.append(cur)

        for cluster in clusters:
            arcs = []
            for _s0, _s1, _h, face, ad, cyl, _fid in cluster:
                arc = _cyl_arc(face, ad, cyl, frame)
                if arc:
                    arcs.append(arc)
            if not arcs:
                continue
            if _arc_union_deg(arcs) < 360.0 - FULL_REVOLUTION_TOL_DEG:
                continue                     # a wall, not a body of revolution
            s_lo = min(c[0] for c in cluster)
            s_hi = max(c[1] for c in cluster)
            depth = s_hi - s_lo
            if depth <= 0.01:
                continue
            # Concavity: weight by arc so a bore split into a 350° face and a
            # 10° sliver is not decided by the sliver.
            hole_w = sum((c[1] - c[0]) for c in cluster if c[2])
            hole = hole_w * 2 >= sum((c[1] - c[0]) for c in cluster)
            mid = [foot[k] + ((s_lo + s_hi) / 2.0) * dc[k] for k in range(3)]
            through = None
            if hole:
                through = _bore_is_through(solid_classifier, foot, dc, s_lo, s_hi, depth,
                                           extents)
            key = ('hole' if hole else 'boss', round(r * 2, 2), round(depth, 1),
                   bool(through) if through is not None else None)
            ident = tuple(round(v, 2) for v in (s_lo, s_hi) + foot + dc)
            instances.setdefault(key, set()).add(ident)
            # WHICH FACES ARE BORE WALLS.
            #
            # The draft sweep judges every wall against one figure, and a cored
            # hole is not a wall: the casting shrinks ONTO the core rather than
            # away from the cavity, which is why every published draft table
            # gives cored holes their own — larger — requirement. Splitting them
            # needs to know which triangles belong to a bore, and this loop is
            # the only place that knows. The ids were being discarded.

            # Axis direction is what a machining SETUP is counted from — a part
            # is re-fixtured to reach features approached from a new direction.
            # The axis POINT is needed too: two holes can share a direction and
            # be nowhere near each other, and without the point a stepped-hole
            # grouper happily merges them into one counterbore.
            axes.setdefault(key, (tuple(round(v, 4) for v in dc),
                                  tuple(round(v, 4) for v in mid), []))
            axes[key][2].append([round(v, 3) for v in mid])

    rows = []
    for key, idents in instances.items():
        kind, dia, depth, through = key
        anchor = axes.get(key)
        rows.append({
            "kind": kind,
            "diaMm": dia,
            "depthMm": depth,
            "through": through if kind == "hole" else None,
            "count": len(idents),
            "axisXYZ": list(anchor[0]) if anchor else None,
            "axisPointXYZ": list(anchor[1]) if anchor else None,
            "instancesXYZ": anchor[2][:24] if anchor else None,
        })
    rows.sort(key=lambda r: (r["kind"], r["diaMm"], r["depthMm"]))
    return rows, _bore_wall_faces(wrapped, skip)


def _bore_wall_faces(wrapped, skip):
    """Face ids of every BORE WALL — cylindrical or CONICAL.

    A drafted cored hole is a CONE, and the cylinder pass above only inspects
    GeomAbs_Cylinder. Deriving the bore set from that pass therefore found
    straight holes and missed tapered ones — so a cored-hole draft rule fed by it
    could only ever fire on undrafted bores and would abstain on every properly
    drafted one. A rule that can produce bad news and never good news is worse
    than no rule, and the analytic 3-degree cored-hole fixture is what caught it.

    The hole/boss test is the same orientation comparison the cylinder pass uses:
    material on the outside of the surface means a hole, on the inside a boss.
    Blends and chamfers are skipped by the caller's `skip` set — a chamfer is a
    cone too, and counting one as a cored hole would judge an edge break against
    a core-pin draft limit.

    THE DRAFT ANGLE COMES FROM THE SURFACE, NOT THE MESH.
    ----------------------------------------------------
    The first version derived cored draft from the tessellation, the way wall
    draft is derived. On a flat wall that is exact; on a CONE it is not, because
    the facets chord the surface and their normals spread either side of the true
    angle. Measured on the analytic 3-degree fixture, that spread reported 12% of
    the bore area as "below 2 degrees" on a hole that is a clean 3 degrees
    everywhere — a false finding at any sensible threshold, produced by the
    measurement method rather than by the part.

    A cone knows its own half-angle. `SemiAngle()` is exact, mesh-independent,
    and it is the number every published draft table actually quotes ("2 deg per
    side"). A cylinder is exactly 0. So the measure is the ANGLE, and the
    tessellation is not involved at all.
    """
    # Imported HERE, not relied on from the caller's scope. The first version
    # borrowed them and raised NameError inside a bare `except Exception:
    # continue` — which returned an empty set and read, all the way up to the
    # report, as "this part has no cored holes". A coding error must not be able
    # to impersonate a measurement.
    from OCP.TopAbs import TopAbs_FACE, TopAbs_Orientation
    from OCP.TopoDS import TopoDS
    from OCP.BRepAdaptor import BRepAdaptor_Surface
    from OCP.GeomAbs import GeomAbs_SurfaceType
    from OCP.TopTools import TopTools_IndexedMapOfShape
    from OCP.TopExp import TopExp

    from OCP.GProp import GProp_GProps
    from OCP.BRepGProp import BRepGProp

    out = []
    fmap = TopTools_IndexedMapOfShape()
    TopExp.MapShapes_s(wrapped, TopAbs_FACE, fmap)
    for i in range(1, fmap.Size() + 1):
        if i in skip:
            continue
        try:
            face = TopoDS.Face_s(fmap.FindKey(i))
            ad = BRepAdaptor_Surface(face)
            t = ad.GetType()
            if t == GeomAbs_SurfaceType.GeomAbs_Cylinder:
                pos = ad.Cylinder().Position()
                draft = 0.0                       # a straight bore has none
                radius = ad.Cylinder().Radius()
            elif t == GeomAbs_SurfaceType.GeomAbs_Cone:
                cone = ad.Cone()
                pos = cone.Position()
                draft = abs(math.degrees(cone.SemiAngle()))
                radius = abs(cone.RefRadius())
            else:
                continue
            reversed_param = not pos.Direct()
            reversed_face = face.Orientation() == TopAbs_Orientation.TopAbs_REVERSED
            if reversed_face != reversed_param:          # material outside => a hole
                props = GProp_GProps()
                BRepGProp.SurfaceProperties_s(face, props)
                # WHERE IT IS, not just that it exists. Without a coordinate the
                # cored-hole draft finding could never be drawn on the model, and
                # a shipped report filed it under "the geometry engine returned no
                # coordinates for the offending feature" — while holding the face,
                # its area and its radius. The surface centre of mass sits on the
                # bore wall, which is exactly where a leader line should land.
                c = props.CentreOfMass()
                out.append({"faceId": i, "draftPerSideDeg": round(draft, 3),
                            "areaMm2": round(props.Mass(), 2),
                            "radiusMm": round(radius, 3),
                            "atXYZ": [round(c.X(), 3), round(c.Y(), 3), round(c.Z(), 3)]})
        except Exception:
            continue
    out.sort(key=lambda b: b["draftPerSideDeg"])
    return out


def _bore_is_through(classifier, foot, dc, s_lo, s_hi, depth, extents):
    """Through/blind by CLASSIFYING material just past each end of the bore.

    The old test compared the bore's depth to the part's bounding-box extent
    along the axis. On anything but a plate that is wrong in both directions: a
    Ø1.6 hole through 1.6 mm sheet inside a 341 mm pressing was reported blind,
    because the axis extent it was measured against was the whole part. What
    decides is whether there is material immediately beyond the bore, which is a
    question for the solid classifier, not the bounding box.

    Returns None — not False — when no classifier is available, so the honest
    "not determined" survives to the caller instead of becoming a confident
    "blind".
    """
    if classifier is None:
        return None
    from OCP.TopAbs import TopAbs_State
    from OCP.gp import gp_Pnt
    eps = max(0.01, min(0.15, depth * 0.05))
    try:
        for s, direction in ((s_lo, -1.0), (s_hi, 1.0)):
            probe = [foot[k] + (s + direction * eps) * dc[k] for k in range(3)]
            classifier.Perform(gp_Pnt(*probe), 1e-7)
            if classifier.State() == TopAbs_State.TopAbs_IN:
                return False              # material past this end → blind
        return True
    except Exception:
        return None


def _axisymmetry(wrapped):
    """How much of the surface is compatible with a BODY OF REVOLUTION, and about
    which axis.

    Centrifugal casting is the one route whose first question is not a dimension:
    the mould spins, so the part must be a body of revolution or it cannot be
    made at all. Every other DFM check in this tool asks "is this feature within
    a limit"; this one asks "is this part the right SHAPE for the process", and
    no measure in the engine could answer it.

    Measured, not assumed. For each candidate axis — every distinct axis a
    revolved face already declares, plus the three principal directions so a
    plain prism is scored rather than skipped — the area of every face that is
    compatible with revolution about THAT axis is summed:

      * a cylinder, cone, torus or surface of revolution sharing the axis
      * a sphere whose centre lies on the axis
      * a plane whose normal is parallel to the axis (an end face or a step)

    A plane whose normal is perpendicular to the axis (a flat, a lug, a bolt
    boss face) is NOT compatible and drags the figure down, which is exactly the
    signal wanted: it is the flats and lugs that stop a part being spun.

    Returns None rather than a number when the kernel refuses — an unmeasured
    shape must reach the rules as absent, never as 0% (which would fail every
    part) or 100% (which would pass every part).
    """
    try:
        from OCP.TopExp import TopExp_Explorer
        from OCP.TopAbs import TopAbs_ShapeEnum
        from OCP.TopoDS import TopoDS
        from OCP.BRepAdaptor import BRepAdaptor_Surface
        from OCP.GeomAbs import GeomAbs_SurfaceType
        from OCP.BRepGProp import BRepGProp
        from OCP.GProp import GProp_GProps
        from OCP.gp import gp_Vec
    except Exception:
        return None

    REV = {
        GeomAbs_SurfaceType.GeomAbs_Cylinder,
        GeomAbs_SurfaceType.GeomAbs_Cone,
        GeomAbs_SurfaceType.GeomAbs_Torus,
        GeomAbs_SurfaceType.GeomAbs_SurfaceOfRevolution,
    }

    faces = []
    total = 0.0
    try:
        exp = TopExp_Explorer(wrapped, TopAbs_ShapeEnum.TopAbs_FACE)
        while exp.More():
            f = TopoDS.Face_s(exp.Current())
            exp.Next()
            props = GProp_GProps()
            BRepGProp.SurfaceProperties_s(f, props)
            area = props.Mass()
            if not (area > 0):
                continue
            ad = BRepAdaptor_Surface(f)
            st = ad.GetType()
            rec = {"area": area, "type": st, "axis": None, "normal": None, "centre": None}
            if st in REV:
                try:
                    if st == GeomAbs_SurfaceType.GeomAbs_Cylinder:
                        a = ad.Cylinder().Axis()
                    elif st == GeomAbs_SurfaceType.GeomAbs_Cone:
                        a = ad.Cone().Axis()
                    elif st == GeomAbs_SurfaceType.GeomAbs_Torus:
                        a = ad.Torus().Axis()
                    else:
                        a = ad.AxeOfRevolution()
                    rec["axis"] = _canonical_axis(a.Direction(), a.Location())
                except Exception:
                    rec["axis"] = None
            elif st == GeomAbs_SurfaceType.GeomAbs_Plane:
                try:
                    pl = ad.Plane()
                    n = pl.Axis().Direction()
                    rec["normal"] = (n.X(), n.Y(), n.Z())
                except Exception:
                    rec["normal"] = None
            elif st == GeomAbs_SurfaceType.GeomAbs_Sphere:
                try:
                    c = ad.Sphere().Location()
                    rec["centre"] = (c.X(), c.Y(), c.Z())
                except Exception:
                    rec["centre"] = None
            faces.append(rec)
            total += area
    except Exception:
        return None

    if not faces or total <= 0:
        return None

    # Candidate axes: every axis a revolved face declares, deduped, plus X/Y/Z so
    # a part with no revolved face at all still gets a measured answer.
    cands = []
    for rec in faces:
        if not rec["axis"]:
            continue
        d, foot = rec["axis"]
        if not any(_axes_equal((d, foot), c) for c in cands):
            cands.append((d, foot))
    for d in ((1.0, 0.0, 0.0), (0.0, 1.0, 0.0), (0.0, 0.0, 1.0)):
        if not any(_axes_equal((d, (0.0, 0.0, 0.0)), c) for c in cands):
            cands.append((d, (0.0, 0.0, 0.0)))

    best_pct, best_axis = None, None
    for (d, foot) in cands:
        ok = 0.0
        for rec in faces:
            st = rec["type"]
            if rec["axis"] is not None:
                if _axes_equal(rec["axis"], (d, foot)):
                    ok += rec["area"]
            elif rec["normal"] is not None:
                # A plane is part of a body of revolution only when it is
                # PERPENDICULAR to the axis — i.e. its normal is parallel to it.
                dot = abs(sum(a * b for a, b in zip(rec["normal"], d)))
                if dot >= math.cos(math.radians(1.0)):
                    ok += rec["area"]
            elif st == GeomAbs_SurfaceType.GeomAbs_Sphere and rec["centre"] is not None:
                delta = [c - f for c, f in zip(rec["centre"], foot)]
                along = sum(x * y for x, y in zip(delta, d))
                perp2 = max(0.0, sum(x * x for x in delta) - along * along)
                if math.sqrt(perp2) <= AXIS_POS_TOL_MM:
                    ok += rec["area"]
        pct = 100.0 * ok / total
        if best_pct is None or pct > best_pct:
            best_pct, best_axis = pct, d

    return {
        "axisymmetricAreaPct": round(best_pct, 2),
        "axisXYZ": [round(c, 4) for c in best_axis] if best_axis else None,
        "candidateAxisCount": len(cands),
        "basis": ("Area-weighted share of the surface that is compatible with revolution about the "
                  "best available axis: revolved faces sharing that axis, spheres centred on it, and "
                  "planes perpendicular to it. Flats and lugs whose normal is perpendicular to the "
                  "axis are counted against, because they are what stops a part being spun."),
    }


def _axes_equal(a, b):
    """Same axis LINE — direction and position, radius not involved."""
    (da, fa), (db, fb) = a, b
    if abs(sum(x * y for x, y in zip(da, db))) < math.cos(math.radians(AXIS_ANG_TOL_DEG)):
        return False
    delta = [q - p for p, q in zip(fa, fb)]
    along = sum(x * y for x, y in zip(delta, da))
    perp2 = max(0.0, sum(x * x for x in delta) - along * along)
    return math.sqrt(perp2) <= AXIS_POS_TOL_MM


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

    # DETERMINISTIC stride, not random.sample. This is the fallback wall figure,
    # used when the tessellation path fails, and it was drawing an UNSEEDED
    # random subset — so the same file analysed twice produced two different wall
    # thicknesses, in a report whose first page tells the reader every dimension
    # is reproducible. A stride samples the same faces every time.
    _stride = max(1, len(planar_outer) // max_samples)
    sample = planar_outer[::_stride][:max_samples]
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


def analyze(filepath: str, draw_override=None) -> dict:
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
                return {"status": "error", "error":
                        "This file could not be read as STEP. It may be truncated, "
                        "saved in another format, or exported with an option this "
                        "reader does not support. Re-export as AP214 or AP242 STEP."}
            reader.TransferRoots()
            shape = _ShapeShim(reader.OneShape())
        elif ext in (".iges", ".igs"):
            from OCP.IGESControl import IGESControl_Reader
            reader = IGESControl_Reader()
            if reader.ReadFile(filepath) != IFSelect_RetDone:
                return {"status": "error", "error":
                        "This file could not be read as IGES. Re-export it as STEP "
                        "(AP214 or AP242), which every major CAD tool supports."}
            reader.TransferRoots()
            shape = _ShapeShim(reader.OneShape())
        else:
            return {"status": "error", "error": f"Unsupported format: {ext}"}
    except Exception as e:
        return {"status": "error", "error": f"File load error: {e}"}

    if shape is None or shape.wrapped.IsNull():
        return {"status": "error", "error":
                "The file was read but contained no geometry. It may be an empty "
                "export or reference-only assembly."}

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

        # ── Wall thickness, draft/undercut, setups ────────────────────────────
        # All three now measured on the TESSELLATION (see dfm_geometry.py). The
        # analytic versions they replace were each wrong on parts we could prove:
        # planar-only draft found ZERO drafted faces on an exactly-3-degree
        # frustum, and the old ray-cast reported a 10 mm plate as 39.95 mm thick.
        wall_stats = draft_info = setup_info = dfm_block = None
        # Computed here rather than inline in the return dict: the setup count
        # below needs the feature AXES from it.
        # Blends are identified BEFORE the hole/boss table so the analytic
        # cylinder pass can skip them. A fillet is a cylindrical face; without
        # this, a filleted slot reported 22 phantom bosses and 2 phantom blind
        # holes, and those reach the machining cost model as drilling operations
        # that do not exist.
        _blend_ids, _aag = set(), None
        try:
            import feature_recognition as _fr
            _blend_ids, _aag = _fr.blend_face_ids(wrapped)
        except Exception:
            pass
        # SEMANTIC PMI. Read from the file, not from the shape — tolerances are
        # annotations beside the geometry and only AP242 carries them. Absent is
        # reported WITH ITS REASON so the tolerance rules abstain instead of
        # passing a part whose tolerances live on a drawing.
        try:
            import pmi_extract as _pmi
            pmi_block = _pmi.extract_pmi(filepath)
        except Exception as _e:
            pmi_block = {"present": False, "reason": f"PMI could not be read: {_e}"}

        # Through-vs-blind is decided by classifying a point just past each end
        # of the bore against the solid. Building the classifier once here keeps
        # its internal BVH warm across every hole on the part.
        _classifier = None
        try:
            from OCP.BRepClass3d import BRepClass3d_SolidClassifier
            _classifier = BRepClass3d_SolidClassifier(wrapped)
        except Exception:
            _classifier = None
        try:
            feature_table, _bores = _extract_feature_table(
                wrapped, (x_sz, y_sz, z_sz),
                skip_faces=_blend_ids, solid_classifier=_classifier)
        except Exception:
            feature_table, _bores = [], []
        try:
            import dfm_geometry as _dfm
            from OCP.IntCurvesFace import IntCurvesFace_ShapeIntersector
            # WALL-CLOCK BUDGET. The bridge kills this process at 120 s and the
            # user then sees "Geometry engine timed out after 120s" with nothing
            # else — which is exactly what happened on the first real automotive
            # part uploaded. Ray casting is the cost and it scales with geometry
            # nobody can predict from a file size, so each stage is checked
            # against a deadline and SKIPPED WITH A REASON rather than allowed to
            # run the whole analysis into the ground. A part with draft but no
            # wall figure, clearly labelled, beats a dead request.
            _t0 = _time.monotonic()
            _left = lambda: DFM_TIME_BUDGET_S - (_time.monotonic() - _t0)
            _skipped = []
            _stage("tessellate", status="start")
            tess = _dfm.tessellate(wrapped, deflection=max(0.05, min(x_sz, y_sz, z_sz) / 60.0))
            _stage("tessellate", status="done", triangles=tess["count"],
                   truncated=tess["truncated"])
            if tess["count"]:
                inter = IntCurvesFace_ShapeIntersector()
                inter.Load(wrapped, 1e-4)
                if _left() > 0:
                    _stage("wallThickness", status="start")
                    # The smallest overall dimension is a hard physical ceiling
                    # on any wall thickness — nothing inside the part can be
                    # thicker than the part's own narrowest span.
                    wall_stats = _dfm.wall_thickness(
                        tess, inter, max_wall_mm=min(x_sz, y_sz, z_sz))
                    _stage("wallThickness", status="done",
                           p50Mm=(wall_stats or {}).get("p50Mm"),
                           samples=(wall_stats or {}).get("samples"))
                else:
                    _skipped.append("wall thickness")
                    _stage("wallThickness", status="skipped",
                           reason="time budget spent")
                if _left() > 0:
                    # A USER-SPECIFIED DRAW DIRECTION WINS OVER THE SWEEP.
                    # The sweep picks the axis with the least undercut area,
                    # which is the right default and the wrong answer whenever
                    # the tool split is already decided — by an existing die, by
                    # a mating part, or by a foundry who has told you where the
                    # parting line goes. Measuring draft against an axis the part
                    # will never be drawn along produces findings for a tool that
                    # does not exist.
                    _stage("drawSweep", status="start",
                           candidates=1 if draw_override else 3)
                    if draw_override:
                        draft_info = _dfm.classify_draft(tess, inter, draw_override)
                        draft_info["drawDirectionChosenBy"] = "user"
                        # The sweep still runs, coarsely, so the report can say
                        # what the chosen axis COSTS against the best available.
                        _best, draft_alts = _dfm.choose_draw_direction(tess, inter)
                        draft_info["bestAvailable"] = {
                            "drawDirectionXYZ": (_best or {}).get("drawDirectionXYZ"),
                            "undercutAreaPct": ((_best or {}).get("areaPct") or {}).get("undercut"),
                        }
                    else:
                        draft_info, draft_alts = _dfm.choose_draw_direction(tess, inter)
                        if draft_info is not None:
                            draft_info["drawDirectionChosenBy"] = "swept"
                    _stage("drawSweep", status="done",
                           drawDirectionXYZ=(draft_info or {}).get("drawDirectionXYZ"),
                           undercutAreaPct=((draft_info or {}).get("areaPct") or {}).get("undercut"),
                           ambiguous=(draft_info or {}).get("drawDirectionAmbiguous"),
                           alternatives=draft_alts)
                else:
                    draft_info, draft_alts = None, []
                    _skipped.append("draft and undercut classification")
                    _stage("drawSweep", status="skipped", reason="time budget spent")
                # TOOL ACCESSIBILITY. Declared UNWRITTEN since the catalogue
                # existed, with setup count as the acknowledged proxy — and setup
                # count answers a different question. Run last and only if the
                # budget survived the draft sweep: it is the same ray machinery
                # and a part that could not afford draft cannot afford this.
                if _left() > 0:
                    _stage("toolAccess", status="start")
                    try:
                        # Bores AND blends are excluded: a drilled hole is made
                        # by a drill sized to it, and a fillet is left by the
                        # cutter that made the corner rather than approached.
                        _cyl_ids = set()
                        try:
                            if _aag:
                                _cyl_ids = {fid for fid, meta in _aag["faces"].items()
                                            if meta.get("type") == "CYLINDER"}
                        except Exception:
                            _cyl_ids = set()
                        access_info = _dfm.tool_accessibility(
                            tess, inter, exclude_faces=_cyl_ids | set(_blend_ids or ()))
                        _stage("toolAccess", status="done",
                               reachableAreaPct=(access_info or {}).get("reachableAreaPct"))
                    except Exception as e:
                        access_info = None
                        _stage("toolAccess", status="skipped", reason=str(e)[:120])
                else:
                    access_info = None
                    _skipped.append("tool accessibility")
                    _stage("toolAccess", status="skipped", reason="time budget spent")

                axes = [f["axisXYZ"] for f in (feature_table or []) if f.get("axisXYZ")]
                setup_info = _dfm.setup_directions(axes) if axes else {
                    "estimatedSetupCount": 1,
                    "accessDirections": [],
                    "basis": "no discrete machined features recognised — single-setup assumption",
                }
                # APERTURES, read from the topology. The cylinder pass finds
                # round holes exactly and is blind to everything else; on a real
                # stamped bracket that blindness reported ZERO holes on a part
                # with fifty-two cut-outs, none of them circular.
                try:
                    aperture_block = _fr.apertures(
                        wrapped, wall_mm=(wall_stats or {}).get("p50Mm"))
                except Exception as _e:
                    aperture_block = {"count": 0, "reason": f"Apertures could not be read: {_e}"}

                # IS THIS PART THE RIGHT SHAPE FOR A SPINNING MOULD. The only
                # question centrifugal casting asks before any dimension, and
                # nothing in the engine could answer it. None when the kernel
                # refuses — an unmeasured shape must reach the rules as absent,
                # never as a 0% that fails every part.
                try:
                    revolution_block = _axisymmetry(wrapped)
                except Exception as _e:
                    revolution_block = {"reason": f"Axisymmetry could not be measured: {_e}"}

                # OVERHANG against the build direction. The one DFM question in
                # this engine that is not about a tool or a die: powder-bed
                # fusion has no draw, only gravity and loose powder under a
                # downward-facing surface.
                try:
                    overhang_block = _dfm.overhang(tess)
                except Exception as _e:
                    overhang_block = {"reason": f"Overhang could not be measured: {_e}"}

                dfm_block = {
                    "pmi": pmi_block,
                    "apertures": aperture_block,
                    "revolution": revolution_block,
                    "overhang": overhang_block,
                    "toolAccess": access_info,
                    "tessellation": {"triangles": tess["count"],
                                     "totalAreaMm2": round(tess["totalAreaMm2"], 1),
                                     "truncated": tess["truncated"]},
                    "draft": (dict(draft_info, coredHoles=({
                        # EXACT, from the surfaces themselves — no tessellation.
                        # Absent, not zero, when the part has no recognised bore:
                        # "the smallest cored-hole draft is 0" is a finding, and
                        # a part with no cored holes has not earned one.
                        "count": len(_bores),
                        "minDraftPerSideDeg": _bores[0]["draftPerSideDeg"],
                        "totalAreaMm2": round(sum(b["areaMm2"] for b in _bores), 2),
                        "bores": _bores[:12],
                        "method": "cone half-angle read from the surface (SemiAngle); a cylindrical bore is exactly 0 deg",
                        "knownLimits": "Only cylindrical and conical bore walls are recognised. A cored hole with a freeform or prismatic wall is not counted, and neither is a cored feature the blend pass classified as a chamfer.",
                    } if _bores else None)) if draft_info else draft_info),
                    "drawDirectionAlternatives": draft_alts,
                    "wallThickness": wall_stats,
                    # An absent measurement gets a REASON, not a blank. Without
                    # this the report shows "wall: —" and the reader cannot tell
                    # a thin part from an unmeasurable one.
                    "wallThicknessNote": None if wall_stats else (
                        f"Skipped: the {DFM_TIME_BUDGET_S:.0f} s geometry budget was "
                        "spent before this stage could run."
                        if "wall thickness" in _skipped else _dfm.WALL_UNMEASURED_REASON),
                    "setups": setup_info,
                }
                if _skipped:
                    dfm_block["budgetExceeded"] = {
                        "budgetSeconds": DFM_TIME_BUDGET_S,
                        "skipped": _skipped,
                        "message": "This part needed more ray casting than the "
                                   f"{DFM_TIME_BUDGET_S:.0f} s budget allows, so "
                                   + " and ".join(_skipped)
                                   + " were not measured. Everything else below was.",
                    }
            try:
                import feature_recognition as _fr
                dfm_block = dfm_block or {}
                _stage("features", status="start")
                dfm_block["features"] = _fr.recognise(wrapped, feature_table,
                                                      extents=(x_sz, y_sz, z_sz),
                                                      aag=_aag)
                # Sheet-metal measures. Until these existed, all four
                # sheet-metal rules depended on values nothing produced, so the
                # family scored 0 of 4 on every part ever uploaded.
                # The measured wall is handed in so the recogniser can cross-check its
                # own answer: a radius-derived thickness that disagrees with the
                # ray-cast wall is not a sheet. Without it, a casting was handed
                # to the sheet-metal rule family on the strength of any coaxial
                # cylinder pair.
                _stage("features", status="done",
                       counts=(dfm_block.get("features") or {}).get("counts"),
                       unclassifiedAreaPct=(dfm_block.get("features") or {}).get("unclassifiedAreaPct"))
                dfm_block["sheetMetal"] = _fr.sheet_metal_features(
                    wrapped, feature_table,
                    wall_p50_mm=(wall_stats or {}).get("p50Mm"),
                    aperture_block=aperture_block,
                    # Uniformity and the part's span decide whether a wall may
                    # STAND IN for a bend-measured thickness. A machined plate
                    # has a wall too; it is not a sheet.
                    wall_stats=wall_stats,
                    extents=(x_sz, y_sz, z_sz))
                _stage("sheetMetal", status="done",
                       isSheetMetal=(dfm_block.get("sheetMetal") or {}).get("isSheetMetal"))
            except Exception as e:
                (dfm_block or {}).setdefault("featuresError", f"{e}")
        except Exception as e:
            dfm_block = {"status": "error", "error": f"DFM analysis failed: {e}"}
        # HOW MUCH THE WALL FIGURE IS WORTH. The percentiles were printed as
        # bare facts. On a real part they came back at 32 mm against a 2V/A
        # reference of 10.35 — a factor of three — on rays covering 6.3% of the
        # surface, and nothing in the report said either number. 2V/A is exact
        # for a thin uniform shell and only indicative for a chunky part, so a
        # disagreement is not proof the ray cast is wrong; it IS proof the reader
        # should be told before quoting the figure.
        try:
            if wall_stats and sa_mm2 > 0:
                ref = 2.0 * volume_mm3 / sa_mm2
                wall_stats["referenceWallMm"] = round(ref, 2)
                wall_stats["referenceBasis"] = ("2V/A, exact for a thin uniform shell and "
                                                "indicative otherwise — an independent check on the ray cast")
                p50 = wall_stats.get("p50Mm") or 0
                cover = wall_stats.get("measuredAreaPct") or 0
                notes = []
                if ref > 0 and p50 > 0 and (p50 / ref > 2.0 or ref / p50 > 2.0):
                    notes.append(f"the ray-cast median ({p50} mm) and the 2V/A reference "
                                 f"({round(ref, 2)} mm) differ by more than a factor of two")
                if cover and cover < 15:
                    notes.append(f"the rays returned a valid opposed-face hit over only {cover}% "
                                 "of the surface, so the percentiles rest on that fraction")
                wall_stats["confidenceNote"] = (
                    "TREAT THE WALL FIGURES WITH CAUTION: " + "; ".join(notes) +
                    ". This happens on chunky or heavily freeform parts, where 'wall thickness' "
                    "is not a well-posed question — check the section on the model before quoting it."
                ) if notes else None
        except Exception:
            pass

        if wall_stats is None:
            try:
                wall_stats = _compute_wall_thickness(shape, faces)
            except Exception:
                wall_stats = None
        # NOTE: no fallback to _compute_setup_count here. It clustered every face
        # normal in the model, so any plain box scored 3 setups whether or not a
        # single feature was machined on those faces. A wrong number is worse
        # than the honest single-setup assumption above.

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
            # Exact per-feature table: hole/boss × diameter × depth × through,
            # axis-deduped counts — feeds the operations mapping in the client.
            "featureTable": feature_table,
            # Tessellation-measured DFM block: draft (any surface type), undercuts
            # separated from zero-draft drag faces, area-weighted wall thickness,
            # and the draw-direction sweep. See cad-engine/dfm_geometry.py.
            "dfm": dfm_block,
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



def tessellate_to_stl(filepath, out_path, with_meta=False):
    """Mesh a STEP/IGES shape and write a binary STL — feeds the client-side
    rendered-views pipeline and the interactive 3D viewer. Deflection scales
    with the bounding diagonal so triangle counts stay sane for any part size.

    with_meta=True additionally writes a `<out_path>.json` sidecar with
    per-triangle face ids and exact per-face B-rep data (type, radii, area,
    body id, hole/boss classification) for the interactive viewer.

    Hard cap: CV_MAX_TRIANGLES (default 2M) aborts pathological tessellations
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
                return {"status": "error", "error":
                        "This file could not be read as STEP. It may be truncated, "
                        "saved in another format, or exported with an option this "
                        "reader does not support. Re-export as AP214 or AP242 STEP."}
            reader.TransferRoots()
            wrapped = reader.OneShape()
        elif ext in (".iges", ".igs"):
            from OCP.IGESControl import IGESControl_Reader
            reader = IGESControl_Reader()
            if reader.ReadFile(filepath) != IFSelect_RetDone:
                return {"status": "error", "error":
                        "This file could not be read as IGES. Re-export it as STEP "
                        "(AP214 or AP242), which every major CAD tool supports."}
            reader.TransferRoots()
            wrapped = reader.OneShape()
        else:
            return {"status": "error", "error": f"Unsupported format: {ext}"}
    except Exception as e:
        return {"status": "error", "error": f"File load error: {e}"}
    if wrapped is None or wrapped.IsNull():
        return {"status": "error", "error":
                "The file was read but contained no geometry. It may be an empty "
                "export or reference-only assembly."}

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
        # TESSELLATION QUALITY IS WHAT "HD" MEANS IN A CAD VIEWER, and the old
        # settings were the reason the viewer looked faceted next to CATIA or
        # SolidWorks. The ANGULAR deflection is the control that decides how
        # smooth a curve looks, and it was 0.5 RADIANS — 28.6 degrees, which is
        # about thirteen segments around a full circle. A Ø13 bore rendered as a
        # visible polygon.
        #
        # Measured on a real 218 mm casting, all four settings meshing in well
        # under a second:
        #     diag/300,  0.50 rad ->  6,929 tris, ~13 segments/circle  (was)
        #     diag/1200, 0.20 rad -> 28,361 tris, ~31 segments/circle
        #     diag/2000, 0.12 rad -> 72,977 tris, ~52 segments/circle
        #
        # 0.15 rad is 8.6 degrees, about 42 segments per circle, which is where a
        # bore stops reading as a polygon. Thirty thousand triangles is nothing
        # for a GPU — the budget below is two million — and meshing time did not
        # move, so the old numbers were buying nothing.
        BRepMesh_IncrementalMesh(wrapped, diag / MESH_LINEAR_DIVISOR, False,
                                 MESH_ANGULAR_DEFLECTION_RAD, True)

        max_tris = int(os.environ.get("CV_MAX_TRIANGLES", "2000000"))

        # Stable face ids via an indexed map, 1-BASED and equal to the map index —
        # the same map assigns faces to solids, so face ids and body ids stay
        # consistent, and the same index is what every analysis pass reports.
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

        tris = []
        tri_face_ids = []   # per-triangle source face id — lets the viewer map a click back to the B-rep
        faces_meta = []     # per-face exact kernel data: type, radii, area, body, hole/boss
        skipped_faces = 0   # faces with no/failed triangulation — mesh has holes there
        # THE FACE ID IS THE MAP INDEX. It used to be a separate 0-based counter
        # that advanced only on successfully triangulated faces, which made the
        # viewer's ids disagree with every other producer in the pipeline by one
        # — and by more than one on any part with an untriangulated face. The
        # analysis then highlighted the wrong face on every upload. Now the id IS
        # `map_idx`, the same 1-based TopTools_IndexedMapOfShape index that
        # dfm_geometry.tessellate, feature_recognition.build_aag and
        # _extract_feature_table all use, so a face id means one thing.
        #
        # Untriangulated faces keep their slot with a null mesh rather than being
        # squeezed out, so the numbering stays dense and aligned.
        for map_idx in range(1, face_map.Extent() + 1):
            face_id = map_idx
            face = TopoDS.Face_s(face_map.FindKey(map_idx))
            loc = TopLoc_Location()
            tri = BRep_Tool.Triangulation_s(face, loc)
            if tri is None:
                skipped_faces += 1
                faces_meta.append({
                    "id": face_id, "type": "untriangulated",
                    "radiusMm": None, "radius2Mm": None, "angleDeg": None,
                    "depthMm": None, "areaCm2": None,
                    "bodyId": face_body.get(map_idx, -1), "hole": None,
                    # No triangles, so nothing to paint — said explicitly so the
                    # viewer can grey the row rather than silently omit the face.
                    "meshed": False,
                })
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
                "meshed": True,
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
        if with_meta:
            with open(out_path + ".json", "w") as jf:
                json.dump({"triFace": tri_face_ids, "faces": faces_meta,
                           "bodies": bodies, "skippedFaces": skipped_faces,
                           # Declared on the wire so a consumer never has to
                           # infer which face-id convention this is. Four
                           # producers in this pipeline once disagreed and the
                           # viewer highlighted the wrong face on every part.
                           "faceIdBase": 1,
                           "faceIdOrder": "TopTools_IndexedMapOfShape"}, jf)

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
    # Optional: --draw x,y,z pins the draw direction instead of sweeping for it.
    draw = None
    for i, a in enumerate(sys.argv):
        if a == "--draw" and i + 1 < len(sys.argv):
            try:
                parts = [float(v) for v in sys.argv[i + 1].split(",")]
                if len(parts) == 3 and any(abs(v) > 1e-9 for v in parts):
                    draw = tuple(parts)
            except Exception:
                draw = None
    result = analyze(fp, draw_override=draw)
    try:
        import dfm_geometry as _dfm
        result = _dfm.strip_private(result)   # raw ray samples stay server-side
    except Exception:
        pass
    print(json.dumps(result))
    sys.exit(0 if result.get("status") == "success" else 1)
