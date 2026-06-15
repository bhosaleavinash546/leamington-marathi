#!/usr/bin/env python3
"""
CostVision CAD Geometry Engine
Uses CadQuery (Open CASCADE Technology) for precise geometric analysis of STEP/IGES files.
Output: single-line JSON to stdout. Errors also returned as JSON.
"""
import sys
import json
import os
import signal


def _timeout(signum, frame):
    raise TimeoutError("Geometry analysis timed out")


signal.signal(signal.SIGALRM, _timeout)
signal.alarm(110)  # 110-second hard limit


def _classify_faces(faces):
    """Return (type_counts dict, cyl_radii list)."""
    from OCP.BRep import BRep_Tool
    from OCP.GeomAdaptor import GeomAdaptor_Surface
    from OCP.GeomAbs import (
        GeomAbs_Plane, GeomAbs_Cylinder, GeomAbs_Cone,
        GeomAbs_Torus, GeomAbs_BSplineSurface, GeomAbs_BezierSurface,
        GeomAbs_SurfaceOfRevolution,
    )
    NAMES = {
        GeomAbs_Plane: "PLANE",
        GeomAbs_Cylinder: "CYLINDER",
        GeomAbs_Cone: "CONE",
        GeomAbs_Torus: "TORUS",
        GeomAbs_BSplineSurface: "BSPLINE",
        GeomAbs_BezierSurface: "BEZIER",
        GeomAbs_SurfaceOfRevolution: "REVOLUTION",
    }
    counts = {}
    cyl_radii = []
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
                    cyl_radii.append(r)
        except Exception:
            counts["OTHER"] = counts.get("OTHER", 0) + 1
    return counts, cyl_radii


def _classify_edges(edges):
    """Return (type_counts dict, circle_radii list)."""
    from OCP.BRepAdaptor import BRepAdaptor_Curve
    from OCP.GeomAbs import (
        GeomAbs_Line, GeomAbs_Circle, GeomAbs_Ellipse,
        GeomAbs_BSplineCurve, GeomAbs_BezierCurve, GeomAbs_Parabola,
        GeomAbs_Hyperbola, GeomAbs_OffsetCurve,
    )
    NAMES = {
        GeomAbs_Line: "LINE",
        GeomAbs_Circle: "CIRCLE",
        GeomAbs_Ellipse: "ELLIPSE",
        GeomAbs_BSplineCurve: "BSPLINE",
        GeomAbs_BezierCurve: "BEZIER",
        GeomAbs_Parabola: "PARABOLA",
        GeomAbs_Hyperbola: "HYPERBOLA",
        GeomAbs_OffsetCurve: "OFFSET",
    }
    counts = {}
    circle_radii = []
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

    # --- Load file ---
    shape = None
    try:
        if ext in (".step", ".stp"):
            wp = cq.importers.importStep(filepath)
            shape = wp.val()
        elif ext in (".iges", ".igs"):
            from OCP.IGESControl import IGESControl_Reader
            from OCP.IFSelect import IFSelect_RetDone
            reader = IGESControl_Reader()
            status = reader.ReadFile(filepath)
            if status != IFSelect_RetDone:
                return {"status": "error", "error": "IGESControl_Reader failed to read file"}
            reader.TransferRoots()
            occ_shape = reader.OneShape()
            shape = cq.Shape.cast(occ_shape)
        else:
            return {"status": "error", "error": f"Unsupported format: {ext}"}
    except Exception as e:
        return {"status": "error", "error": f"File load error: {e}"}

    if shape is None:
        return {"status": "error", "error": "No shape was loaded"}

    try:
        wrapped = shape.wrapped

        # --- Volume (precise) ---
        vol_props = GProp_GProps()
        BRepGProp.VolumeProperties_s(wrapped, vol_props)
        volume_mm3 = abs(vol_props.Mass())

        # --- Surface area (precise) ---
        surf_props = GProp_GProps()
        BRepGProp.SurfaceProperties_s(wrapped, surf_props)
        surface_area_mm2 = abs(surf_props.Mass())

        # --- Bounding box (precise) ---
        bbox = Bnd_Box()
        BRepBndLib.Add_s(wrapped, bbox)
        xmin, ymin, zmin, xmax, ymax, zmax = bbox.Get()
        x_size = round(xmax - xmin, 2)
        y_size = round(ymax - ymin, 2)
        z_size = round(zmax - zmin, 2)
        bbox_vol = x_size * y_size * z_size
        fill_ratio = round(volume_mm3 / bbox_vol, 4) if bbox_vol > 0 else 0.5

        # --- Face topology ---
        faces = shape.Faces()
        face_counts, cyl_radii = _classify_faces(faces)

        # --- Edge topology ---
        edges = shape.Edges()
        edge_counts, circle_radii = _classify_edges(edges)

        # --- Feature extraction ---
        all_cyl_r = [round(r, 1) for r in cyl_radii]
        hole_radii = sorted(set(r for r in all_cyl_r if r < 30))
        boss_radii = sorted(set(r for r in all_cyl_r if r >= 30))
        all_circ_r = sorted(set(round(r, 1) for r in circle_radii))

        # Thread detection heuristic
        has_threads = (
            edge_counts.get("BSPLINE", 0) > 150
            or "HELIX" in edge_counts
        )

        # Wall thickness estimate: T ≈ 2V / SA
        wall_mm = round(2 * volume_mm3 / surface_area_mm2, 2) if surface_area_mm2 > 0 else None

        part_name = os.path.splitext(os.path.basename(filepath))[0]

        return {
            "status": "success",
            "partName": part_name,
            "boundingBox": {"xMm": x_size, "yMm": y_size, "zMm": z_size},
            "volume": {
                "mm3": round(volume_mm3, 1),
                "cm3": round(volume_mm3 / 1000, 3),
            },
            "surfaceArea": {
                "mm2": round(surface_area_mm2, 1),
                "cm2": round(surface_area_mm2 / 100, 3),
            },
            "fillRatio": fill_ratio,
            "estimatedWallThicknessMm": wall_mm,
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
                "sampleCircleRadiiMm": all_circ_r[:30],
            },
            "features": {
                "cylindricalFaceCount": face_counts.get("CYLINDER", 0),
                "cylindricalFaceRadiiMm": sorted(set(round(r, 1) for r in cyl_radii))[:30],
                "estimatedHoleCount": len(hole_radii),
                "holeRadiiMm": hole_radii[:20],
                "bossShaftRadiiMm": boss_radii[:10],
                "threadFeaturesDetected": has_threads,
                "planarFaceCount": face_counts.get("PLANE", 0),
                "freeFormFaceCount": (
                    face_counts.get("BSPLINE", 0) + face_counts.get("BEZIER", 0)
                ),
            },
        }

    except Exception as e:
        import traceback
        return {
            "status": "error",
            "error": str(e),
            "trace": traceback.format_exc()[:3000],
        }


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
