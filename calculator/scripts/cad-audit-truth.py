#!/usr/bin/env python3
"""
Independent ground truth for the CAD-to-Cost audit.

Measures each STEP part with cadquery/OCCT directly — deliberately NOT via
server/utils/cad-geometry-engine.py, so the pipeline's own measurement layer is
one of the things being audited rather than the referee. Only raw OCCT calls.

    python3 scripts/cad-audit-truth.py ../cad-audit/parts/*.st* ../cad-audit/truth/

Writes <truth-dir>/<part>.json with volume, bbox, surface area, solids count,
2V/S wall proxy, and per-family mass (the same densities the pipeline claims to
use: Al 2.70, steel 7.85, cast iron 7.20, plastic 1.05 g/cm3).
"""
import json
import os
import sys
import time

from OCP.STEPControl import STEPControl_Reader
from OCP.IFSelect import IFSelect_RetDone
from OCP.BRepGProp import BRepGProp
from OCP.GProp import GProp_GProps
from OCP.Bnd import Bnd_Box
from OCP.BRepBndLib import BRepBndLib
from OCP.TopExp import TopExp_Explorer
from OCP.TopAbs import TopAbs_SOLID

DENSITIES = {'aluminium': 2.70, 'steel': 7.85, 'cast_iron': 7.20, 'plastic': 1.05}


def measure(path):
    t0 = time.time()
    reader = STEPControl_Reader()
    if reader.ReadFile(path) != IFSelect_RetDone:
        return {'file': os.path.basename(path), 'status': 'read_failed'}
    reader.TransferRoots()
    shape = reader.OneShape()

    vol = GProp_GProps()
    BRepGProp.VolumeProperties_s(shape, vol)
    surf = GProp_GProps()
    BRepGProp.SurfaceProperties_s(shape, surf)

    box = Bnd_Box()
    BRepBndLib.Add_s(shape, box)
    xmin, ymin, zmin, xmax, ymax, zmax = box.Get()

    solids = 0
    ex = TopExp_Explorer(shape, TopAbs_SOLID)
    while ex.More():
        solids += 1
        ex.Next()

    v_mm3 = vol.Mass()
    a_mm2 = surf.Mass()
    v_cm3 = v_mm3 / 1000.0
    dims = sorted([xmax - xmin, ymax - ymin, zmax - zmin], reverse=True)
    bbox_mm3 = dims[0] * dims[1] * dims[2]
    return {
        'file': os.path.basename(path),
        'status': 'success',
        'volumeCm3': round(v_cm3, 3),
        'surfaceAreaCm2': round(a_mm2 / 100.0, 2),
        'bboxMm': [round(d, 2) for d in dims],
        'bboxVolumeCm3': round(bbox_mm3 / 1000.0, 2),
        'fillRatio': round(v_mm3 / bbox_mm3, 4) if bbox_mm3 > 0 else None,
        # 2V/S: mean wall for thin shells; meaningless for chunky solids but
        # recorded so the pipeline's wall figure can be compared like for like.
        'wall2VoverS_mm': round(2 * v_mm3 / a_mm2, 3) if a_mm2 > 0 else None,
        'solids': solids,
        'massKg': {k: round(v_cm3 * d / 1000.0, 4) for k, d in DENSITIES.items()},
        'measureSeconds': round(time.time() - t0, 1),
    }


def main():
    *files, outdir = sys.argv[1:]
    os.makedirs(outdir, exist_ok=True)
    for f in files:
        r = measure(f)
        name = os.path.splitext(os.path.basename(f))[0]
        out = os.path.join(outdir, name + '.json')
        with open(out, 'w') as fh:
            json.dump(r, fh, indent=2)
        v = r.get('volumeCm3', '-')
        print(f"{r['status']:12} {name:28} vol={v} cm3  "
              f"bbox={r.get('bboxMm', '-')}  {r.get('measureSeconds', '')}s")


if __name__ == '__main__':
    main()
