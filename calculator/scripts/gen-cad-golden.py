#!/usr/bin/env python3
"""
Generate CAD golden fixtures for the feature-detection eval.

Builds a few parametric STEP parts with KNOWN feature counts (cadquery), runs
the real geometry engine on each, and writes the engine's output as
`<part>.prediction.json` into tests/fixtures/cad-parts/ (also saving the .step).
The matching `<part>.truth.json` (design intent, hand-verified) is committed
alongside and is NOT overwritten here.

Needs cadquery (glibc env). CI does not run this — it scores the committed
JSON. Refresh predictions after a geometry-engine change:
    python3 scripts/gen-cad-golden.py
"""
import json
import math
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT = os.path.join(ROOT, "tests", "fixtures", "cad-parts")
ENGINE = os.path.join(ROOT, "server", "utils", "cad-geometry-engine.py")
os.makedirs(OUT, exist_ok=True)

import cadquery as cq  # noqa: E402


def build_plate_4holes():
    return (cq.Workplane("XY").box(100, 60, 10)
            .faces(">Z").workplane()
            .pushPoints([(-40, -20), (40, -20), (-40, 20), (40, 20)])
            .hole(8))


def build_block_2holes():
    return (cq.Workplane("XY").box(60, 40, 20)
            .faces(">Z").workplane()
            .pushPoints([(-15, 0), (15, 0)])
            .hole(10))


def build_flange_6holes_boss():
    pcd = [(30 * math.cos(math.radians(a)), 30 * math.sin(math.radians(a))) for a in range(0, 360, 60)]
    f = cq.Workplane("XY").circle(40).extrude(12)
    f = f.faces(">Z").workplane().pushPoints(pcd).hole(6)   # 6 bolt holes through the flange
    f = f.faces(">Z").workplane().circle(15).extrude(8)     # central raised boss
    return f


PARTS = [
    ("plate-4holes", build_plate_4holes),
    ("block-2holes", build_block_2holes),
    ("flange-6holes-boss", build_flange_6holes_boss),
]


def main():
    for name, build in PARTS:
        step = os.path.join(OUT, f"{name}.step")
        cq.exporters.export(build(), step)
        proc = subprocess.run([sys.executable, ENGINE, step], capture_output=True, text=True)
        if proc.returncode != 0:
            print(f"[gen] {name}: engine failed\n{proc.stderr[:400]}")
            continue
        pred = json.loads(proc.stdout)
        with open(os.path.join(OUT, f"{name}.prediction.json"), "w") as fh:
            json.dump(pred, fh, indent=2)
        feat = pred.get("features", {})
        print(f"[gen] {name}: holes={feat.get('estimatedHoleCount')} bosses={feat.get('bossShaftCount')} "
              f"vol={pred.get('volume', {}).get('cm3')}cm³")
    print(f"[gen] wrote predictions to {OUT}")


if __name__ == "__main__":
    main()
